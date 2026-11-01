import { Plugin, TFile } from 'obsidian';
import { KnowledgeBaseSettingTab, type KnowledgeBaseSettings } from './settings';
import { RuleStore } from './rules/rule-store';
import { LocalCheckEngine } from './checks/local-check-engine';
import { ChangeApplier } from './changes/change-applier';
import { IndexRunnerImpl } from './index/index-runner';
import { AiClientRouter } from './ai/ai-client-router';
import { LocalCliAiClient } from './ai/local-cli-client';
import { createCliProviderAdapters } from './ai/cli-provider-adapters';
import { DailyBackfillService } from './daily/daily-backfill-service';
import { DailyPlannerService } from './daily/daily-planner-service';
import { KnowledgeBaseView, VIEW_TYPE_KNOWLEDGE_BASE } from './views/knowledge-base-view';
import { DailyTodoView, VIEW_TYPE_DAILY_TODO } from './views/daily-todo-view';
import type { VaultMutationLike } from './types';
import type { KnowledgeRules } from './rules/rule-schema';
import { createDefaultKnowledgeRules } from './rules/default-rules';
import { zhCN } from './i18n/zh-CN';
import { normalizeSettings, type AiProviderKind } from './settings-model';

export const KNOWLEDGE_BASE_VIEW_TYPE = VIEW_TYPE_KNOWLEDGE_BASE;

export default class KnowledgeBasePlugin extends Plugin {
	settings!: KnowledgeBaseSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new KnowledgeBaseSettingTab(this.app, this));
		this.registerView(VIEW_TYPE_KNOWLEDGE_BASE, (leaf) => new KnowledgeBaseView(leaf, this.createViewServices()));
		this.registerView(VIEW_TYPE_DAILY_TODO, (leaf) => new DailyTodoView(leaf, this.createDailyTodoServices()));
		this.addRibbonIcon('book-open', zhCN.plugin.ribbon, () => {
			void this.activateView();
		});
		this.addCommand({
			id: 'open-knowledge-base-assistant',
			name: zhCN.plugin.command,
			callback: () => void this.activateView(),
		});
		this.addRibbonIcon('calendar-check', zhCN.plugin.dailyTodoRibbon, () => {
			void this.activateDailyTodoView();
		});
		this.addCommand({
			id: 'open-daily-todo',
			name: zhCN.plugin.dailyTodoCommand,
			callback: () => void this.activateDailyTodoView(),
		});
	}

	async loadSettings() {
		this.settings = normalizeSettings((await this.loadData()) as Partial<KnowledgeBaseSettings>);
		await this.saveData(this.settings);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	selectAiProvider(kind: AiProviderKind): void {
		this.settings.aiProvider = kind;
	}

	async detectLocalProvider(kind: Exclude<AiProviderKind, 'custom'>): Promise<void> {
		try {
			const client = this.createLocalCliClient(kind);
			const version = await client.detect();
			const provider = this.settings.localCliProviders[kind];
			provider.version = version;
			provider.status = 'available';
			provider.error = '';
		} catch (error) {
			this.markLocalProviderFailed(kind, error);
		}
		await this.saveSettings();
	}

	async testLocalProvider(kind: Exclude<AiProviderKind, 'custom'>): Promise<void> {
		try {
			const result = await this.createLocalCliClient(kind).testConnection();
			const provider = this.settings.localCliProviders[kind];
			provider.version = result.version;
			provider.status = 'tested';
			provider.lastTestedAt = Date.now();
			provider.error = '';
		} catch (error) {
			this.markLocalProviderFailed(kind, error);
		}
		await this.saveSettings();
	}

	private createViewServices() {
		const adapter = this.app.vault.adapter as typeof this.app.vault.adapter & { getBasePath?: () => string };
		const basePath = adapter.getBasePath?.() ?? '';
		const ruleStore = new RuleStore({
			loadData: () => this.loadData(),
			saveData: (data) => this.saveData(data),
		});
		const readPath = async (path: string) => {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) throw new Error(zhCN.common.fileNotFound(path));
			return this.app.vault.read(file);
		};
		const indexRunner = new IndexRunnerImpl({
			vaultRoot: basePath,
			scriptPath: this.settings.indexScriptPath,
			pythonPath: this.settings.pythonPath,
			timeoutMs: this.settings.requestTimeoutMs,
		});
		const aiClient = new AiClientRouter({
			getSettings: () => this.settings,
			cwd: basePath,
		});
		const vault = {
			getMarkdownFiles: () => this.app.vault.getMarkdownFiles().map((file) => ({ path: file.path, stat: file.stat })),
			read: readPath,
		};
		const dailyService = new DailyBackfillService(vault, {
			rootPath: this.settings.knowledgeBaseRoot,
			rules: fallbackRules(),
			ruleGuidance: 'Follow the active knowledge-base rules.',
		});
		const mutationVault: VaultMutationLike = {
			read: readPath,
			exists: async (path) => this.app.vault.getAbstractFileByPath(path) !== null,
			modify: async (path, data) => {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile)) throw new Error(zhCN.common.fileNotFound(path));
				await this.app.vault.modify(file, data);
			},
			rename: async (path, newPath) => {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile)) throw new Error(zhCN.common.fileNotFound(path));
				await this.app.vault.rename(file, newPath);
			},
		};

		return {
			plugin: this,
			ruleStore,
			checkEngine: new LocalCheckEngine(),
			changeApplier: new ChangeApplier(mutationVault),
			indexRunner,
			aiClient,
			dailyService,
		};
	}

	private createDailyTodoServices() {
		const aiClient = new AiClientRouter({
			getSettings: () => this.settings,
			cwd: (this.app.vault.adapter as typeof this.app.vault.adapter & { getBasePath?: () => string }).getBasePath?.() ?? '',
		});
		const read = async (path: string) => {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) throw new Error(zhCN.common.fileNotFound(path));
			return this.app.vault.read(file);
		};
		return {
			aiClient,
			dailyPlannerService: new DailyPlannerService({
				read,
				exists: async (path) => this.app.vault.getAbstractFileByPath(path) !== null,
				create: (path, data) => this.app.vault.create(path, data),
			}, this.settings.dailyPlannerRoot),
		};
	}

	private createLocalCliClient(kind: Exclude<AiProviderKind, 'custom'>): LocalCliAiClient {
		const adapter = createCliProviderAdapters()[kind];
		const basePath = (this.app.vault.adapter as typeof this.app.vault.adapter & { getBasePath?: () => string }).getBasePath?.() ?? '';
		return new LocalCliAiClient({
			adapter,
			executable: this.settings.localCliProviders[kind].executablePath,
			cwd: basePath,
			root: this.settings.knowledgeBaseRoot,
			timeoutMs: this.settings.requestTimeoutMs,
		});
	}

	private markLocalProviderFailed(kind: Exclude<AiProviderKind, 'custom'>, error: unknown): void {
		const provider = this.settings.localCliProviders[kind];
		provider.status = 'failed';
		provider.error = sanitizeProviderError(error);
	}

	private async activateView() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_KNOWLEDGE_BASE)[0];
		const leaf = existing ?? this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: VIEW_TYPE_KNOWLEDGE_BASE, active: true });
	}

	async activateDailyTodoView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_DAILY_TODO)[0];
		const leaf = existing ?? this.app.workspace.getLeftLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: VIEW_TYPE_DAILY_TODO, active: true });
	}
}

function sanitizeProviderError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.replace(/[\r\n]+/g, ' ').replace(/(api[_ -]?key|token|secret)\s*[:=]\s*\S+/gi, '$1=[已隐藏]').slice(0, 240);
}

function fallbackRules(): KnowledgeRules {
	return createDefaultKnowledgeRules();
}

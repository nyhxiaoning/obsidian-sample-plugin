import { Plugin, TFile } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	KnowledgeBaseSettingTab,
	KnowledgeBaseSettings,
} from './settings';
import { RuleStore } from './rules/rule-store';
import { LocalCheckEngine } from './checks/local-check-engine';
import { ChangeApplier } from './changes/change-applier';
import { IndexRunnerImpl } from './index/index-runner';
import { OpenAICompatibleClient } from './ai/openai-compatible-client';
import { DailyBackfillService } from './daily/daily-backfill-service';
import { KnowledgeBaseView, VIEW_TYPE_KNOWLEDGE_BASE } from './views/knowledge-base-view';
import type { VaultMutationLike } from './types';
import type { KnowledgeRules } from './rules/rule-schema';
import { createDefaultKnowledgeRules } from './rules/default-rules';

export const KNOWLEDGE_BASE_VIEW_TYPE = VIEW_TYPE_KNOWLEDGE_BASE;

export default class KnowledgeBasePlugin extends Plugin {
	settings!: KnowledgeBaseSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new KnowledgeBaseSettingTab(this.app, this));
		this.registerView(VIEW_TYPE_KNOWLEDGE_BASE, (leaf) => new KnowledgeBaseView(leaf, this.createViewServices()));
		this.addRibbonIcon('book-open', 'Open knowledge base assistant', () => {
			void this.activateView();
		});
		this.addCommand({
			id: 'open-knowledge-base-assistant',
			name: 'Open knowledge base assistant',
			callback: () => void this.activateView(),
		});
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<KnowledgeBaseSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
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
			if (!(file instanceof TFile)) throw new Error(`Vault file not found: ${path}`);
			return this.app.vault.read(file);
		};
		const indexRunner = new IndexRunnerImpl({
			vaultRoot: basePath,
			scriptPath: this.settings.indexScriptPath,
			pythonPath: this.settings.pythonPath,
			timeoutMs: this.settings.requestTimeoutMs,
		});
		const aiClient = new OpenAICompatibleClient({
			baseUrl: this.settings.apiBaseUrl,
			model: this.settings.model,
			apiKey: this.settings.apiKey,
			timeoutMs: this.settings.requestTimeoutMs,
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
				if (!(file instanceof TFile)) throw new Error(`Vault file not found: ${path}`);
				await this.app.vault.modify(file, data);
			},
			rename: async (path, newPath) => {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile)) throw new Error(`Vault file not found: ${path}`);
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

	private async activateView() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_KNOWLEDGE_BASE)[0];
		const leaf = existing ?? this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: VIEW_TYPE_KNOWLEDGE_BASE, active: true });
	}
}

function fallbackRules(): KnowledgeRules {
	return createDefaultKnowledgeRules();
}

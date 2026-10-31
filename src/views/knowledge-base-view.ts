import { ItemView, WorkspaceLeaf } from 'obsidian';
import type KnowledgeBasePlugin from '../main';
import type { RuleStore } from '../rules/rule-store';
import type { LocalCheckEngine } from '../checks/local-check-engine';
import type { ChangeApplier } from '../changes/change-applier';
import type { IndexRunner } from '../types';
import type { AiClient } from '../ai/openai-compatible-client';
import type { DailyBackfillService } from '../daily/daily-backfill-service';
import { renderOverviewTab } from './tabs/overview-tab';
import { renderRulesTab } from './tabs/rules-tab';
import { renderAiOrganizeTab } from './tabs/ai-organize-tab';
import { renderDailyBackfillTab } from './tabs/daily-backfill-tab';
import { zhCN } from '../i18n/zh-CN';

export const VIEW_TYPE_KNOWLEDGE_BASE = 'knowledge-base-assistant-view';
export type KnowledgeBaseTab = 'overview' | 'rules' | 'ai-organize' | 'daily-backfill';

export interface KnowledgeBaseViewServices {
	plugin: KnowledgeBasePlugin;
	ruleStore: RuleStore;
	checkEngine: LocalCheckEngine;
	changeApplier: ChangeApplier;
	indexRunner: IndexRunner;
	aiClient: AiClient;
	dailyService: DailyBackfillService;
}

export class KnowledgeBaseView extends ItemView {
	private activeTab: KnowledgeBaseTab = 'overview';

	constructor(leaf: WorkspaceLeaf, private readonly services: KnowledgeBaseViewServices) {
		super(leaf);
	}

	getViewType(): string { return VIEW_TYPE_KNOWLEDGE_BASE; }
	getDisplayText(): string { return zhCN.plugin.viewTitle; }
	getIcon(): string { return 'book-open'; }

	async onOpen(): Promise<void> {
		this.registerEvent(this.app.workspace.on('file-open', () => void this.render()));
		await this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	activateTab(tab: KnowledgeBaseTab): void {
		this.activeTab = tab;
		void this.render();
	}

	private async render(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('knowledge-base-assistant');

		const header = contentEl.createDiv('knowledge-base-header');
		header.createEl('h2', { text: zhCN.plugin.viewTitle });
		const tabs = contentEl.createDiv('knowledge-base-tabs');
		const tabLabels: Array<[KnowledgeBaseTab, string]> = [
			['overview', zhCN.tabs.overview],
			['rules', zhCN.tabs.rules],
			['ai-organize', zhCN.tabs.aiOrganize],
			['daily-backfill', zhCN.tabs.dailyBackfill],
		];
		for (const [tab, label] of tabLabels) {
			const button = tabs.createEl('button', { text: label });
			button.toggleClass('is-active', tab === this.activeTab);
			button.addEventListener('click', () => this.activateTab(tab));
		}

		const body = contentEl.createDiv('knowledge-base-tab-content');
		const effectiveRules = await this.services.ruleStore.loadEffectiveRules().catch(() => null);
		const context = { app: this.app, plugin: this.services.plugin, rootPath: this.services.plugin.settings.knowledgeBaseRoot, effectiveRules };
		if (this.activeTab === 'overview') renderOverviewTab(body, { ...context, indexRunner: this.services.indexRunner, ruleStore: this.services.ruleStore, checkEngine: this.services.checkEngine });
		if (this.activeTab === 'rules') renderRulesTab(body, { ...context, ruleStore: this.services.ruleStore });
		if (this.activeTab === 'ai-organize') renderAiOrganizeTab(body, { ...context, ruleStore: this.services.ruleStore, checkEngine: this.services.checkEngine, aiClient: this.services.aiClient, changeApplier: this.services.changeApplier });
		if (this.activeTab === 'daily-backfill') renderDailyBackfillTab(body, { ...context, ruleStore: this.services.ruleStore, dailyService: this.services.dailyService, aiClient: this.services.aiClient, changeApplier: this.services.changeApplier });
	}
}

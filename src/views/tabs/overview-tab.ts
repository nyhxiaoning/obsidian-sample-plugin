import { Notice, Setting, TFolder } from 'obsidian';
import type { App } from 'obsidian';
import type KnowledgeBasePlugin from '../../main';
import type { IndexRunner } from '../../types';
import type { RuleStore } from '../../rules/rule-store';
import type { LocalCheckEngine } from '../../checks/local-check-engine';
import { zhCN, indexStatusLabel } from '../../i18n/zh-CN';

export interface OverviewContext { app: App; plugin: KnowledgeBasePlugin; rootPath: string; effectiveRules: import('../../rules/rule-schema').KnowledgeRules | null; indexRunner: IndexRunner; ruleStore: RuleStore; checkEngine: LocalCheckEngine; }

export function renderOverviewTab(container: HTMLElement, context: OverviewContext): void {
	container.createEl('h3', { text: zhCN.overview.heading });
	container.createEl('p', { text: zhCN.overview.knowledgeBase(context.rootPath) });
	const status = container.createDiv('knowledge-base-status');
	status.setText(zhCN.overview.checking);
	void runUi(status, async () => {
		const rules = context.effectiveRules ?? await context.ruleStore.loadEffectiveRules();
		const index = await context.indexRunner.run('check');
		status.empty();
		status.createEl('p', { text: zhCN.overview.rules(Boolean(rules)) });
		status.createEl('p', { text: zhCN.overview.index(indexStatusLabel(index.status), index.stdout?.trim().slice(0, 240)) });
	});

	const actions = container.createDiv('knowledge-base-actions');
	new Setting(actions).setName(zhCN.overview.indexSetting).setDesc(zhCN.overview.indexDesc).addButton((button) => button.setButtonText(zhCN.overview.check).onClick(async () => {
		await runUi(status, async () => { const result = await context.indexRunner.run('check'); new Notice(zhCN.overview.indexNotice(indexStatusLabel(result.status))); });
	})).addButton((button) => button.setButtonText(zhCN.overview.regenerate).setCta().onClick(async () => {
		await runUi(status, async () => { const result = await context.indexRunner.run('generate'); new Notice(zhCN.overview.indexNotice(indexStatusLabel(result.status))); });
	}));
	new Setting(actions).setName(zhCN.overview.openKnowledgeBase).addButton((button) => button.setButtonText(zhCN.overview.openFolder).onClick(() => {
		const file = context.app.vault.getAbstractFileByPath(context.rootPath);
		if (file instanceof TFolder) void context.app.workspace.openLinkText(file.path, '', false);
		else new Notice(zhCN.overview.folderUnavailable);
	}));
}

async function runUi(status: HTMLElement, action: () => Promise<void>): Promise<void> {
	try { await action(); } catch (error) { const message = error instanceof Error ? error.message : String(error); status.setText(message); new Notice(message); }
}

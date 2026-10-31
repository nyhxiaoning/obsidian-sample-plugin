import { Notice, Setting, TFolder } from 'obsidian';
import type { TextComponent } from 'obsidian';
import type { App } from 'obsidian';
import type KnowledgeBasePlugin from '../../main';
import type { IndexRunner } from '../../types';
import type { RuleStore } from '../../rules/rule-store';
import type { LocalCheckEngine } from '../../checks/local-check-engine';
import { zhCN, indexStatusLabel } from '../../i18n/zh-CN';

export interface OverviewContext { app: App; plugin: KnowledgeBasePlugin; rootPath: string; effectiveRules: import('../../rules/rule-schema').KnowledgeRules | null; indexRunner: IndexRunner; ruleStore: RuleStore; checkEngine: LocalCheckEngine; }

export function renderOverviewTab(container: HTMLElement, context: OverviewContext): void {
	container.createEl('h3', { text: zhCN.overview.heading });
	let selectedRootPath = context.rootPath;
	const rootSummary = container.createEl('p', { text: zhCN.overview.knowledgeBase(selectedRootPath) });
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
	let folderInput: TextComponent;
	new Setting(actions)
		.setName(zhCN.overview.knowledgeBaseFolder)
		.setDesc(zhCN.overview.knowledgeBaseFolderDesc)
		.addText((text) => { folderInput = text; text.setValue(selectedRootPath); })
		.addButton((button) => button.setButtonText(zhCN.overview.switchFolder).setCta().onClick(async () => {
			const path = folderInput.getValue().trim() || selectedRootPath;
			const file = context.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFolder)) {
				new Notice(zhCN.overview.folderUnavailable);
				return;
			}
			selectedRootPath = path;
			context.plugin.settings.knowledgeBaseRoot = path;
			await context.plugin.saveSettings();
			rootSummary.setText(zhCN.overview.knowledgeBase(selectedRootPath));
			new Notice(zhCN.overview.folderSwitched(path));
		}));
	new Setting(actions).setName(zhCN.overview.openKnowledgeBase).addButton((button) => button.setButtonText(zhCN.overview.openFolder).onClick(() => {
		const file = context.app.vault.getAbstractFileByPath(selectedRootPath);
		if (file instanceof TFolder) {
			const leaves = context.app.workspace.getLeavesOfType('file-explorer');
			const explorer = leaves[0]?.view as unknown as { revealInFolder?: (folder: TFolder) => void } | undefined;
			if (explorer?.revealInFolder) explorer.revealInFolder(file);
			else void context.app.workspace.openLinkText(file.path, '', false);
		}
		else new Notice(zhCN.overview.folderUnavailable);
	}));
}

async function runUi(status: HTMLElement, action: () => Promise<void>): Promise<void> {
	try { await action(); } catch (error) { const message = error instanceof Error ? error.message : String(error); status.setText(message); new Notice(message); }
}

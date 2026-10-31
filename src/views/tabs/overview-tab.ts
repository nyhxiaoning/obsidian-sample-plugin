import { Notice, Setting, TFile } from 'obsidian';
import type { App } from 'obsidian';
import type KnowledgeBasePlugin from '../../main';
import type { IndexRunner } from '../../types';
import type { RuleStore } from '../../rules/rule-store';
import type { LocalCheckEngine } from '../../checks/local-check-engine';

export interface OverviewContext { app: App; plugin: KnowledgeBasePlugin; rootPath: string; effectiveRules: null; indexRunner: IndexRunner; ruleStore: RuleStore; checkEngine: LocalCheckEngine; }

export function renderOverviewTab(container: HTMLElement, context: OverviewContext): void {
	container.createEl('h3', { text: 'Overview' });
	container.createEl('p', { text: `Knowledge base: ${context.rootPath}` });
	const status = container.createDiv('knowledge-base-status');
	status.setText('Checking index and active rules…');
	void (async () => {
		const rules = await context.ruleStore.loadEffectiveRules();
		const index = await context.indexRunner.run('check');
		status.empty();
		status.createEl('p', { text: `Rules: ${rules ? 'active' : 'not activated'}` });
		status.createEl('p', { text: `Index: ${index.status}${index.stdout ? ` — ${index.stdout.trim().slice(0, 240)}` : ''}` });
	})();

	const actions = container.createDiv('knowledge-base-actions');
	new Setting(actions).setName('Index').setDesc('Check or regenerate the knowledge-base index.').addButton((button) => button.setButtonText('Check').onClick(async () => {
		const result = await context.indexRunner.run('check');
		new Notice(`Index: ${result.status}`);
	})).addButton((button) => button.setButtonText('Regenerate').setCta().onClick(async () => {
		const result = await context.indexRunner.run('generate');
		new Notice(`Index: ${result.status}`);
	}));
	new Setting(actions).setName('Open knowledge base').addButton((button) => button.setButtonText('Open folder').onClick(() => {
		const file = context.app.vault.getAbstractFileByPath(context.rootPath);
		if (file instanceof TFile) void context.app.workspace.getLeaf(false).openFile(file);
		else new Notice('Knowledge-base folder is not available as a file.');
	}));
}

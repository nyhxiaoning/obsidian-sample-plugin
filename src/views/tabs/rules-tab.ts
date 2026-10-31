import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type KnowledgeBasePlugin from '../../main';
import type { RuleStore } from '../../rules/rule-store';
import { extractRuleBlock, insertRuleBlock, replaceRuleBlock } from '../../rules/rule-document';
import { createDefaultKnowledgeRules } from '../../rules/default-rules';
import type { KnowledgeRules } from '../../rules/rule-schema';

export interface RulesContext { app: App; plugin: KnowledgeBasePlugin; rootPath: string; effectiveRules: import('../../rules/rule-schema').KnowledgeRules | null; ruleStore: RuleStore; }

export function renderRulesTab(container: HTMLElement, context: RulesContext): void {
	container.createEl('h3', { text: 'Rules (R1 editor)' });
	const content = container.createDiv();
	const subTabs = container.createDiv('knowledge-base-subtabs');
	const panes: Record<'settings' | 'body' | 'source', HTMLElement> = { settings: content.createDiv(), body: content.createDiv(), source: content.createDiv() };
	for (const [name, pane] of Object.entries(panes)) {
		const button = subTabs.createEl('button', { text: `${name.charAt(0).toUpperCase()}${name.slice(1)}` });
		button.addEventListener('click', () => { for (const item of Object.values(panes)) item.toggleClass('is-hidden', item !== pane); });
		pane.toggleClass('is-hidden', name !== 'settings');
	}
	void loadRules(panes, context);
}

async function loadRules(panes: Record<'settings' | 'body' | 'source', HTMLElement>, context: RulesContext): Promise<void> {
	let markdown = '';
	const abstractFile = context.app.vault.getAbstractFileByPath(context.plugin.settings.rulesPath);
	if (!abstractFile || !('extension' in abstractFile)) { panes.source.createEl('p', { text: 'Rules document could not be read.' }); return; }
	try { markdown = await context.app.vault.read(abstractFile as import('obsidian').TFile); } catch { panes.source.createEl('p', { text: 'Rules document could not be read.' }); return; }
	const result = context.ruleStore.validateDocument(markdown);
	const block = extractRuleBlock(markdown);
	const source = panes.source.createEl('textarea', { cls: 'knowledge-base-source-editor' });
	source.value = markdown;
	const settings = panes.settings;
	const status = settings.createEl('p', { text: '' });
	const saveSource = async (): Promise<void> => {
		const file = context.app.vault.getAbstractFileByPath(context.plugin.settings.rulesPath);
		if (!file || !('extension' in file)) throw new Error('Rules document could not be found.');
		await context.app.vault.modify(file as import('obsidian').TFile, source.value);
		const nextResult = context.ruleStore.validateDocument(source.value);
		if (!nextResult.valid) {
			status.setText('Document saved, but the last effective rules remain active.');
			new Notice('Rules saved; invalid configuration was not activated.');
			return;
		}
		await context.ruleStore.activateValidRules(nextResult.rules, String(source.value.length));
		status.setText('Rules saved and activated.');
		new Notice('Rules saved and activated.');
	};
	if (!result.valid) {
		settings.createEl('p', { text: 'Current document is invalid. The last effective rules remain active.' }).addClass('knowledge-base-error');
		for (const error of result.errors) settings.createEl('p', { text: `${error.path}: ${error.message}` }).addClass('knowledge-base-error');
		new Setting(settings).addButton((button) => button.setButtonText('Insert default executable rules').setCta().onClick(() => void runUi(status, async () => {
			const migrated = insertRuleBlock(source.value, createDefaultKnowledgeRules());
			const migratedResult = context.ruleStore.validateDocument(migrated);
			if (!migratedResult.valid) throw new Error(`Default rule migration failed: ${migratedResult.errors.map((error) => `${error.path}: ${error.message}`).join('; ')}`);
			const file = context.app.vault.getAbstractFileByPath(context.plugin.settings.rulesPath);
			if (!file || !('extension' in file)) throw new Error('Rules document could not be found.');
			await context.app.vault.modify(file as import('obsidian').TFile, migrated);
			await context.ruleStore.activateValidRules(migratedResult.rules, String(migrated.length));
			source.value = migrated;
			status.setText('Default executable rules inserted and activated.');
			new Notice('Default executable rules inserted and activated.');
		})));
		new Setting(settings).addButton((button) => button.setButtonText('Save source without activating').setCta().onClick(() => void runUi(status, saveSource)));
		new Setting(settings).addButton((button) => button.setButtonText('Restore effective rules').onClick(() => void runUi(status, async () => {
			const effective = await context.ruleStore.loadEffectiveRules();
			if (!effective) throw new Error('No valid effective rules are stored.');
			source.value = replaceRuleBlock(source.value, effective);
			status.setText('Editor restored to the last effective rules. Save to activate.');
		}))); 
		return;
	}
	const rules = result.rules;
	const checkboxes: Array<[keyof KnowledgeRules['checks'], string]> = [['fileName', 'File names'], ['directory', 'Directories'], ['source', 'Source metadata'], ['duplicateTopic', 'Duplicate topics'], ['relatedLinks', 'Related links']];
	settings.createEl('p', { text: 'Structured settings are the executable portion of this Markdown document.' });
	for (const [key, label] of checkboxes) new Setting(settings).setName(label).addToggle((toggle) => toggle.setValue(rules.checks[key]).onChange((value) => { rules.checks[key] = value; }));
	const body = panes.body;
	body.createEl('p', { text: 'Edit the human-readable guidance in the source editor. The executable YAML block is preserved.' });
	const bodyEditor = body.createEl('textarea', { cls: 'knowledge-base-source-editor' });
	bodyEditor.value = block ? `${markdown.slice(0, block.start)}${markdown.slice(block.end)}`.trim() : markdown;
	const initialBody = bodyEditor.value;
	const save = (buttonText: string, action: () => Promise<void>) => new Setting(settings).addButton((button) => button.setButtonText(buttonText).setCta().onClick(() => void runUi(status, action)));
	save('Save and activate', async () => {
		const editedSource = bodyEditor.value !== initialBody
			? `${bodyEditor.value.trim()}\n\n${source.value.slice(block?.start ?? 0, block?.end ?? source.value.length)}`
			: source.value;
		const next = replaceRuleBlock(editedSource, rules);
		const file = context.app.vault.getAbstractFileByPath(context.plugin.settings.rulesPath);
		if (!file || !('extension' in file)) throw new Error('Rules document could not be found.');
		await context.app.vault.modify(file as import('obsidian').TFile, next);
		await context.ruleStore.activateValidRules(rules, String(next.length));
		status.setText('Rules saved and activated.');
		new Notice('Rules saved and activated.');
	});
	save('Restore effective rules', async () => {
		const effective = await context.ruleStore.loadEffectiveRules();
		if (!effective) { new Notice('No valid effective rules are stored.'); return; }
		source.value = replaceRuleBlock(source.value, effective);
		new Notice('Editor restored to the last effective rules. Save to activate.');
	});
}

async function runUi(status: HTMLElement, action: () => Promise<void>): Promise<void> {
	try { await action(); } catch (error) { const message = error instanceof Error ? error.message : String(error); status.setText(message); new Notice(message); }
}

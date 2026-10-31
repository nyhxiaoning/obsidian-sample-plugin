import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type KnowledgeBasePlugin from '../../main';
import type { RuleStore } from '../../rules/rule-store';
import type { LocalCheckEngine } from '../../checks/local-check-engine';
import type { ChangeApplier } from '../../changes/change-applier';
import type { AiClient } from '../../ai/openai-compatible-client';
import type { AiSuggestion } from '../../ai/response-parser';

export interface AiOrganizeContext { app: App; plugin: KnowledgeBasePlugin; rootPath: string; effectiveRules: null; ruleStore: RuleStore; checkEngine: LocalCheckEngine; aiClient: AiClient; changeApplier: ChangeApplier; }

export function renderAiOrganizeTab(container: HTMLElement, context: AiOrganizeContext): void {
	container.createEl('h3', { text: 'AI organize' });
	container.createEl('p', { text: 'AI is manual only. Review the upload preview before sending any Vault content.' });
	const scope = container.createEl('select');
	scope.createEl('option', { value: 'file', text: 'Current document' });
	scope.createEl('option', { value: 'folder', text: 'Current folder' });
	const task = container.createEl('select');
	for (const value of ['classify', 'summarize', 'suggestRelations', 'suggestChanges']) task.createEl('option', { value, text: value });
	const preview = container.createEl('pre', { cls: 'knowledge-base-upload-preview' });
	const results = container.createDiv();
	new Setting(container).setName('Prepare upload').addButton((button) => button.setButtonText('Preview').setCta().onClick(async () => {
		const files = await selectedFiles(context.app, context.rootPath, scope.value);
		preview.setText(files.length ? files.map((file) => `--- ${file.path} ---\n${file.content}`).join('\n\n') : 'No Markdown file selected.');
		if (files.length) preview.dataset.ready = 'true';
	})).addButton((button) => button.setButtonText('Send after preview').onClick(async () => {
		const rules = await context.ruleStore.loadEffectiveRules();
		if (!rules || preview.dataset.ready !== 'true') { new Notice('Load valid rules and review the upload preview first.'); return; }
		const files = await selectedFiles(context.app, context.rootPath, scope.value);
		const suggestions = await context.aiClient.analyze({ task: task.value as never, rules, ruleGuidance: 'Use the rules document as guidance.', files });
		renderSuggestions(results, suggestions);
	}));
}

async function selectedFiles(app: App, root: string, scope: string): Promise<Array<{ path: string; content: string }>> {
		const active = app.workspace.getActiveFile();
		const files = app.vault.getMarkdownFiles().filter((file) => file.path === active?.path || (scope === 'folder' && active?.parent?.path === file.parent?.path));
		return Promise.all(files.filter((file) => file.path === root || file.path.startsWith(`${root}/`)).map(async (file) => ({ path: file.path, content: await app.vault.read(file) })));
}

function renderSuggestions(container: HTMLElement, suggestions: AiSuggestion[]): void {
	container.empty();
	container.createEl('h4', { text: 'Suggestions (no changes applied)' });
	for (const suggestion of suggestions) {
		const item = container.createDiv('knowledge-base-suggestion');
		item.createEl('strong', { text: `${suggestion.kind}: ${suggestion.title}` });
		item.createEl('p', { text: suggestion.detail });
		if (suggestion.change) item.createEl('p', { text: suggestion.change.diff ?? 'Review this proposed change before any future confirmation.' });
	}
}

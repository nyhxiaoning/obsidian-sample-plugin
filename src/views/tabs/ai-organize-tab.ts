import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type KnowledgeBasePlugin from '../../main';
import type { RuleStore } from '../../rules/rule-store';
import type { LocalCheckEngine } from '../../checks/local-check-engine';
import type { ChangeApplier } from '../../changes/change-applier';
import type { AiClient } from '../../ai/openai-compatible-client';
import type { AiSuggestion } from '../../ai/response-parser';
import { createChangePreview, type ChangePreview } from '../../changes/diff-preview';
import type { KnowledgeRules } from '../../rules/rule-schema';
import type { OperationRecord } from '../../types';
import { zhCN, suggestionKindLabel } from '../../i18n/zh-CN';
import { selectMarkdownPaths, type FileSelectionScope } from './file-selection';

export interface AiOrganizeContext { app: App; plugin: KnowledgeBasePlugin; rootPath: string; effectiveRules: KnowledgeRules | null; ruleStore: RuleStore; checkEngine: LocalCheckEngine; aiClient: AiClient; changeApplier: ChangeApplier; }

export function renderAiOrganizeTab(container: HTMLElement, context: AiOrganizeContext): void {
	container.createEl('h3', { text: zhCN.ai.heading });
	container.createEl('p', { text: zhCN.ai.desc });
	const scope = container.createEl('select');
	scope.createEl('option', { value: 'file', text: zhCN.ai.currentDocument });
	scope.createEl('option', { value: 'folder', text: zhCN.ai.currentFolder });
	const task = container.createEl('select');
	for (const value of ['classify', 'summarize', 'suggestRelations', 'suggestChanges']) task.createEl('option', { value, text: zhCN.ai.tasks[value as keyof typeof zhCN.ai.tasks] });
	const preview = container.createEl('pre', { cls: 'knowledge-base-upload-preview' });
	const confirmation = { value: false };
	const confirmationSetting = new Setting(container).setName(zhCN.ai.uploadConfirmation).setDesc(zhCN.ai.uploadConfirmationDesc);
	confirmationSetting.addToggle((toggle) => toggle.setValue(false).onChange((value) => { confirmation.value = value; }));
	const status = container.createEl('p', { text: zhCN.ai.noUpload });
	const results = container.createDiv();
	let prepared: Array<{ path: string; content: string }> = [];
	void runUi(status, async () => {
		const rules = await context.ruleStore.loadEffectiveRules();
		if (rules) status.setText(zhCN.ai.rulesLoaded(rules.schemaVersion, rules.scope.root));
	});
	new Setting(container).setName(zhCN.ai.prepareUpload).addButton((button) => button.setButtonText(zhCN.ai.preview).setCta().onClick(async () => {
		await runUi(status, async () => {
			const selection = await selectedFiles(context.app, context.rootPath, scope.value as FileSelectionScope);
			prepared = selection.files;
			preview.setText(prepared.length ? prepared.map((file) => `--- ${file.path} ---\n${file.content}`).join('\n\n') : zhCN.ai.noFile);
			confirmation.value = false;
			status.setText(prepared.length ? zhCN.ai.filesReady(prepared.length) : selection.reason === 'ready' ? zhCN.ai.noFile : selectionMessage(selection.reason));
		});
	})).addButton((button) => button.setButtonText(zhCN.ai.analyzeAfterConfirmation).onClick(async () => {
		await runUi(status, async () => {
			// Always read the latest activated snapshot so saving rules in the Rules tab
			// takes effect without requiring the view to be recreated.
			const rules = await context.ruleStore.loadEffectiveRules();
			if (!rules) throw new Error(zhCN.ai.noEffectiveRules);
			if (prepared.length === 0) throw new Error(zhCN.ai.prepareBeforeAnalyze);
			if (!confirmation.value) throw new Error(zhCN.ai.confirmBeforeAnalyze);
			const operation = await startOperation(context.ruleStore, String(task.value), scope.value, rules.schemaVersion);
			try {
				const suggestions = await context.aiClient.analyze({ task: task.value as never, rules, ruleGuidance: 'Follow the active rules document.', files: prepared });
				renderSuggestions(results, suggestions, context, rules, status);
				await finishOperation(context.ruleStore, operation, 'succeeded', zhCN.common.suggestionsReceived(suggestions.length));
				status.setText(zhCN.ai.suggestionsReceived(suggestions.length));
			} catch (error) {
				await finishOperation(context.ruleStore, operation, 'failed', errorMessage(error));
				throw error;
			}
		});
	}));
}

async function selectedFiles(app: App, root: string, scope: FileSelectionScope): Promise<{ files: Array<{ path: string; content: string }>; reason: 'ready' | 'no-active-document' | 'outside-root' | 'no-folder-files' }> {
	const markdownFiles = app.vault.getMarkdownFiles();
	const selection = selectMarkdownPaths(markdownFiles.map((file) => file.path), app.workspace.getActiveFile()?.path, scope, root);
	if (selection.reason !== 'ready') return { files: [], reason: selection.reason };
	const filesByPath = new Map(markdownFiles.map((file) => [file.path, file]));
	return {
		files: await Promise.all(selection.paths.map(async (path) => {
			const file = filesByPath.get(path);
			if (!file) throw new Error(zhCN.common.fileNotFound(path));
			return { path: file.path, content: await app.vault.read(file) };
		})),
		reason: 'ready',
	};
}

function selectionMessage(reason: 'no-active-document' | 'outside-root' | 'no-folder-files'): string {
	return reason === 'no-active-document' ? zhCN.ai.noActiveMarkdown : reason === 'outside-root' ? zhCN.ai.outsideRoot : zhCN.ai.noFolderFiles;
}

function renderSuggestions(container: HTMLElement, suggestions: AiSuggestion[], context: AiOrganizeContext, rules: KnowledgeRules, status: HTMLElement): void {
	container.empty();
	container.createEl('h4', { text: zhCN.ai.suggestions });
	for (const suggestion of suggestions) {
		const item = container.createDiv('knowledge-base-suggestion');
		item.createEl('strong', { text: `${suggestionKindLabel(suggestion.kind)}：${suggestion.title}` });
		item.createEl('p', { text: suggestion.detail });
		const state = item.createEl('span', { text: zhCN.ai.pending, cls: 'knowledge-base-suggestion-state' });
		new Setting(item).addButton((button) => button.setButtonText(zhCN.ai.accept).setCta().onClick(async () => {
			await runUi(status, async () => {
				if (!suggestion.change || suggestion.change.kind === 'report') { state.setText(zhCN.ai.accepted); status.setText(zhCN.ai.acceptedNoOperation); return; }
				const preview = await createChangePreview(suggestion.change, { vault: previewVault(context.app), sourcePath: suggestion.sourcePath, after: suggestion.change.afterContent, ruleVersion: rules.schemaVersion });
				showDiff(item, preview);
				const result = (await context.changeApplier.apply([preview], rules.actions))[0];
				if (!result) throw new Error(zhCN.ai.noApplyResult);
				state.setText(result.status === 'applied' ? zhCN.ai.accepted : zhCN.ai.rejected);
				status.setText(result.message);
			});
		})).addButton((button) => button.setButtonText(zhCN.ai.ignore).onClick(() => { state.setText(zhCN.ai.ignored); status.setText(zhCN.ai.suggestionIgnored); })).addButton((button) => button.setButtonText(zhCN.ai.reject).onClick(() => { state.setText(zhCN.ai.rejected); status.setText(zhCN.ai.suggestionRejected); }));
	}
}

function showDiff(item: HTMLElement, preview: ChangePreview): void {
	item.createEl('pre', { cls: 'knowledge-base-diff', text: preview.plan.diff ?? zhCN.ai.noDiff });
}

async function startOperation(store: RuleStore, kind: string, scope: string, ruleVersion: number): Promise<OperationRecord> {
	const record: OperationRecord = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, startedAt: Date.now(), kind, scope, ruleVersion, status: 'running', message: zhCN.common.operationStarted };
	await store.recordOperation(record);
	return record;
}

async function finishOperation(store: RuleStore, record: OperationRecord, status: OperationRecord['status'], message: string): Promise<void> {
	await store.recordOperation({ ...record, finishedAt: Date.now(), status, message });
}

async function runUi(status: HTMLElement, action: () => Promise<void>): Promise<void> {
	try { await action(); } catch (error) { const message = errorMessage(error); status.setText(message); new Notice(message); }
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function previewVault(app: App) {
		return { read: async (path: string) => { const file = app.vault.getAbstractFileByPath(path); if (!file || !('extension' in file)) throw new Error(zhCN.common.fileNotFound(path)); return app.vault.read(file as import('obsidian').TFile); } };
}

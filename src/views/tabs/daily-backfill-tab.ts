import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type KnowledgeBasePlugin from '../../main';
import type { RuleStore } from '../../rules/rule-store';
import type { DailyBackfillService, DailyFile } from '../../daily/daily-backfill-service';
import type { AiClient } from '../../ai/openai-compatible-client';
import type { ChangeApplier } from '../../changes/change-applier';
import { createChangePreview } from '../../changes/diff-preview';
import type { KnowledgeRules } from '../../rules/rule-schema';
import type { OperationRecord } from '../../types';

export interface DailyBackfillContext { app: App; plugin: KnowledgeBasePlugin; rootPath: string; effectiveRules: KnowledgeRules | null; ruleStore: RuleStore; dailyService: DailyBackfillService; aiClient: AiClient; changeApplier: ChangeApplier; }

export function renderDailyBackfillTab(container: HTMLElement, context: DailyBackfillContext): void {
	container.createEl('h3', { text: 'Daily backfill' });
	container.createEl('p', { text: 'Day: capture raw material. End of day: make cards. Weekly: review links, conflicts, and gaps.' });
	const filesEl = container.createDiv('knowledge-base-daily-files');
	const status = container.createEl('p', { text: 'Loading today’s Markdown changes…' });
	void (async () => {
		try {
			const files = await context.dailyService.listTodayChanges(new Date(), context.rootPath);
			status.setText(`${files.length} file(s) changed today`);
			for (const file of files) addFileToggle(filesEl, file);
		} catch (error) { showError(status, error); }
	})();
	const preview = container.createEl('pre', { cls: 'knowledge-base-upload-preview' });
	const results = container.createDiv();
	const confirmation = { value: false };
	let dailyRequest: import('../../types').AiRequest | null = null;
	let weeklyRequest: import('../../types').AiRequest | null = null;
	new Setting(container).setName('Upload confirmation').setDesc('Review the selected files before sending them to the AI provider.').addToggle((toggle) => toggle.onChange((value) => { confirmation.value = value; }));
	new Setting(container).setName('Daily review').setDesc('Prepare a candidate request; the AI upload confirmation is explicit.').addButton((button) => button.setButtonText('Prepare daily review').setCta().onClick(async () => {
		dailyRequest = await prepareDaily(context, status, preview);
	}));
	new Setting(container).setName('Run daily review').addButton((button) => button.setButtonText('Analyze after confirmation').onClick(async () => {
		await runUi(status, async () => {
			if (!confirmation.value) throw new Error('Review the upload preview and confirm it first.');
			const rules = await context.ruleStore.loadEffectiveRules();
			if (!rules) throw new Error('Activate valid rules first.');
			context.dailyService.setRules(rules, 'Follow the active rules document.');
			if (!dailyRequest) throw new Error('Prepare and review the daily upload first.');
			await analyzeAndRender(context, dailyRequest, rules, results, status);
		});
	}));
	new Setting(container).setName('Weekly review').setDesc('Review associations, conflicts, omissions, stale knowledge, and skill candidates.').addButton((button) => button.setButtonText('Prepare weekly review').onClick(async () => {
		await runUi(status, async () => {
			const rules = await context.ruleStore.loadEffectiveRules();
			if (!rules) throw new Error('Activate valid rules first.');
			context.dailyService.setRules(rules, 'Follow the active rules document.');
			const end = new Date();
			const start = new Date(end);
			start.setDate(start.getDate() - 7);
			const request = await context.dailyService.buildWeeklyReviewRequest(start, end);
			weeklyRequest = request;
			preview.setText(request.files.length ? request.files.map((file) => `--- ${file.path} ---\n${file.content}`).join('\n\n') : 'No Markdown files changed in the last seven days.');
			confirmation.value = false;
			status.setText(`${request.files.length} file(s) prepared. Confirm upload, then use Analyze weekly review.`);
			new Setting(container).setName('Run weekly review').addButton((runButton) => runButton.setButtonText('Analyze weekly review').onClick(async () => {
				await runUi(status, async () => {
					if (!confirmation.value) throw new Error('Review the upload preview and confirm it first.');
					if (!weeklyRequest) throw new Error('Prepare the weekly upload first.');
					await analyzeAndRender(context, weeklyRequest, rules, results, status);
				});
			}));
		});
	}));
}

function addFileToggle(container: HTMLElement, file: DailyFile): void {
	new Setting(container).setName(file.path).setDesc(`${file.size} bytes`).addToggle((toggle) => toggle.setValue(file.included).onChange((value) => { file.included = value; }));
}

async function prepareDaily(context: DailyBackfillContext, status: HTMLElement, preview: HTMLElement): Promise<import('../../types').AiRequest | null> {
	return runUi(status, async () => {
		const rules = await context.ruleStore.loadEffectiveRules();
		if (!rules) throw new Error('Activate valid rules first.');
		context.dailyService.setRules(rules, 'Follow the active rules document.');
		const files = await context.dailyService.listTodayChanges(new Date(), context.rootPath);
		const request = await context.dailyService.buildDailyRequest(files, 'dailyBackfill');
		preview.setText(request.files.length ? request.files.map((file) => `--- ${file.path} ---\n${file.content}`).join('\n\n') : 'No Markdown files selected.');
		status.setText(`${request.files.length} file(s) prepared. Confirm upload before analysis.`);
		return request;
	}).catch(() => null);
}

async function analyzeAndRender(context: DailyBackfillContext, request: import('../../types').AiRequest, rules: KnowledgeRules, results: HTMLElement, status: HTMLElement): Promise<void> {
	const operation: OperationRecord = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, startedAt: Date.now(), kind: request.task, scope: request.task === 'weeklyReview' ? 'last-7-days' : 'today', ruleVersion: rules.schemaVersion, status: 'running', message: 'Operation started.' };
	await context.ruleStore.recordOperation(operation);
	try {
		const suggestions = await context.aiClient.analyze(request);
		results.empty();
		for (const suggestion of suggestions) {
			const item = results.createDiv('knowledge-base-suggestion');
			item.createEl('strong', { text: `${suggestion.kind}: ${suggestion.title}` });
			item.createEl('p', { text: suggestion.detail });
			const state = item.createEl('span', { text: 'Pending' });
			new Setting(item).addButton((button) => button.setButtonText('Accept').onClick(() => void runUi(status, async () => {
				if (!suggestion.change || suggestion.change.kind === 'report') { state.setText('Accepted'); return; }
				const preview = await createChangePreview(suggestion.change, { vault: previewVault(context.app), sourcePath: suggestion.sourcePath, after: suggestion.change.afterContent, ruleVersion: rules.schemaVersion });
				item.createEl('pre', { cls: 'knowledge-base-diff', text: preview.plan.diff ?? 'No diff available.' });
				const result = (await context.changeApplier.apply([preview], rules.actions))[0];
				state.setText(result?.status === 'applied' ? 'Accepted' : 'Rejected');
				status.setText(result?.message ?? 'No apply result was returned.');
			}))).addButton((button) => button.setButtonText('Ignore').onClick(() => state.setText('Ignored'))).addButton((button) => button.setButtonText('Reject').onClick(() => state.setText('Rejected')));
		}
		await context.ruleStore.recordOperation({ ...operation, finishedAt: Date.now(), status: 'succeeded', message: `${suggestions.length} suggestion(s) received.` });
		status.setText(`${suggestions.length} suggestion(s) received. Review each result.`);
	} catch (error) {
		await context.ruleStore.recordOperation({ ...operation, finishedAt: Date.now(), status: 'failed', message: errorMessage(error) });
		throw error;
	}
}

async function runUi<T>(status: HTMLElement, action: () => Promise<T>): Promise<T> { try { return await action(); } catch (error) { showError(status, error); throw error; } }
function showError(status: HTMLElement, error: unknown): void { const message = errorMessage(error); status.setText(message); new Notice(message); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function previewVault(app: App) {
	return { read: async (path: string) => { const file = app.vault.getAbstractFileByPath(path); if (!file || !('extension' in file)) throw new Error(`Vault file not found: ${path}`); return app.vault.read(file as import('obsidian').TFile); } };
}

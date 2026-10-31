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
import { zhCN, suggestionKindLabel } from '../../i18n/zh-CN';

export interface DailyBackfillContext { app: App; plugin: KnowledgeBasePlugin; rootPath: string; effectiveRules: KnowledgeRules | null; ruleStore: RuleStore; dailyService: DailyBackfillService; aiClient: AiClient; changeApplier: ChangeApplier; }

export function renderDailyBackfillTab(container: HTMLElement, context: DailyBackfillContext): void {
	container.createEl('h3', { text: zhCN.daily.heading });
	container.createEl('p', { text: zhCN.daily.desc });
	const filesEl = container.createDiv('knowledge-base-daily-files');
	const status = container.createEl('p', { text: zhCN.daily.loading });
	void (async () => {
		try {
			const files = await context.dailyService.listTodayChanges(new Date(), context.rootPath);
			status.setText(zhCN.daily.filesChanged(files.length));
			for (const file of files) addFileToggle(filesEl, file);
		} catch (error) { showError(status, error); }
	})();
	const preview = container.createEl('pre', { cls: 'knowledge-base-upload-preview' });
	const results = container.createDiv();
	const confirmation = { value: false };
	let dailyRequest: import('../../types').AiRequest | null = null;
	let weeklyRequest: import('../../types').AiRequest | null = null;
	new Setting(container).setName(zhCN.daily.uploadConfirmation).setDesc(zhCN.daily.uploadConfirmationDesc).addToggle((toggle) => toggle.onChange((value) => { confirmation.value = value; }));
	new Setting(container).setName(zhCN.daily.dailyReview).setDesc(zhCN.daily.dailyReviewDesc).addButton((button) => button.setButtonText(zhCN.daily.prepareDaily).setCta().onClick(async () => {
		dailyRequest = await prepareDaily(context, status, preview);
	}));
	new Setting(container).setName(zhCN.daily.runDaily).addButton((button) => button.setButtonText(zhCN.ai.analyzeAfterConfirmation).onClick(async () => {
		await runUi(status, async () => {
			if (!confirmation.value) throw new Error(zhCN.daily.confirmPreview);
			const rules = await context.ruleStore.loadEffectiveRules();
			if (!rules) throw new Error(zhCN.daily.activateRules);
			context.dailyService.setRules(rules, 'Follow the active rules document.');
			if (!dailyRequest) throw new Error(zhCN.daily.prepareDailyFirst);
			await analyzeAndRender(context, dailyRequest, rules, results, status);
		});
	}));
	new Setting(container).setName(zhCN.daily.weeklyReview).setDesc(zhCN.daily.weeklyReviewDesc).addButton((button) => button.setButtonText(zhCN.daily.prepareWeekly).onClick(async () => {
		await runUi(status, async () => {
			const rules = await context.ruleStore.loadEffectiveRules();
			if (!rules) throw new Error(zhCN.daily.activateRules);
			context.dailyService.setRules(rules, 'Follow the active rules document.');
			const end = new Date();
			const start = new Date(end);
			start.setDate(start.getDate() - 7);
			const request = await context.dailyService.buildWeeklyReviewRequest(start, end);
			weeklyRequest = request;
			preview.setText(request.files.length ? request.files.map((file) => `--- ${file.path} ---\n${file.content}`).join('\n\n') : zhCN.daily.noRecentFiles);
			confirmation.value = false;
			status.setText(zhCN.daily.filesPreparedConfirm(request.files.length));
			new Setting(container).setName(zhCN.daily.runWeekly).addButton((runButton) => runButton.setButtonText(zhCN.daily.runWeekly).onClick(async () => {
				await runUi(status, async () => {
					if (!confirmation.value) throw new Error(zhCN.daily.confirmPreview);
					if (!weeklyRequest) throw new Error(zhCN.daily.prepareWeeklyFirst);
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
		preview.setText(request.files.length ? request.files.map((file) => `--- ${file.path} ---\n${file.content}`).join('\n\n') : zhCN.daily.noSelectedFiles);
		status.setText(zhCN.daily.filesPrepared(request.files.length));
		return request;
	}).catch(() => null);
}

async function analyzeAndRender(context: DailyBackfillContext, request: import('../../types').AiRequest, rules: KnowledgeRules, results: HTMLElement, status: HTMLElement): Promise<void> {
	const operation: OperationRecord = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, startedAt: Date.now(), kind: request.task, scope: request.task === 'weeklyReview' ? 'last-7-days' : 'today', ruleVersion: rules.schemaVersion, status: 'running', message: zhCN.common.operationStarted };
	await context.ruleStore.recordOperation(operation);
	try {
		const suggestions = await context.aiClient.analyze(request);
		results.empty();
		for (const suggestion of suggestions) {
			const item = results.createDiv('knowledge-base-suggestion');
			item.createEl('strong', { text: `${suggestionKindLabel(suggestion.kind)}：${suggestion.title}` });
			item.createEl('p', { text: suggestion.detail });
			const state = item.createEl('span', { text: zhCN.ai.pending });
			new Setting(item).addButton((button) => button.setButtonText(zhCN.ai.accept).onClick(() => void runUi(status, async () => {
				if (!suggestion.change || suggestion.change.kind === 'report') { state.setText(zhCN.ai.accepted); return; }
				const preview = await createChangePreview(suggestion.change, { vault: previewVault(context.app), sourcePath: suggestion.sourcePath, after: suggestion.change.afterContent, ruleVersion: rules.schemaVersion });
				item.createEl('pre', { cls: 'knowledge-base-diff', text: preview.plan.diff ?? zhCN.ai.noDiff });
				const result = (await context.changeApplier.apply([preview], rules.actions))[0];
				state.setText(result?.status === 'applied' ? zhCN.ai.accepted : zhCN.ai.rejected);
				status.setText(result?.message ?? zhCN.ai.noApplyResult);
			}))).addButton((button) => button.setButtonText(zhCN.ai.ignore).onClick(() => state.setText(zhCN.ai.ignored))).addButton((button) => button.setButtonText(zhCN.ai.reject).onClick(() => state.setText(zhCN.ai.rejected)));
		}
		await context.ruleStore.recordOperation({ ...operation, finishedAt: Date.now(), status: 'succeeded', message: zhCN.common.suggestionsReceived(suggestions.length) });
		status.setText(zhCN.ai.suggestionsReceived(suggestions.length));
	} catch (error) {
		await context.ruleStore.recordOperation({ ...operation, finishedAt: Date.now(), status: 'failed', message: errorMessage(error) });
		throw error;
	}
}

async function runUi<T>(status: HTMLElement, action: () => Promise<T>): Promise<T> { try { return await action(); } catch (error) { showError(status, error); throw error; } }
function showError(status: HTMLElement, error: unknown): void { const message = errorMessage(error); status.setText(message); new Notice(message); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function previewVault(app: App) {
	return { read: async (path: string) => { const file = app.vault.getAbstractFileByPath(path); if (!file || !('extension' in file)) throw new Error(zhCN.common.fileNotFound(path)); return app.vault.read(file as import('obsidian').TFile); } };
}

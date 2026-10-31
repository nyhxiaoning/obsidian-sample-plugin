import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type KnowledgeBasePlugin from '../../main';
import type { RuleStore } from '../../rules/rule-store';
import type { DailyBackfillService, DailyFile } from '../../daily/daily-backfill-service';
import type { AiClient } from '../../ai/openai-compatible-client';

export interface DailyBackfillContext { app: App; plugin: KnowledgeBasePlugin; rootPath: string; effectiveRules: null; ruleStore: RuleStore; dailyService: DailyBackfillService; aiClient: AiClient; }

export function renderDailyBackfillTab(container: HTMLElement, context: DailyBackfillContext): void {
	container.createEl('h3', { text: 'Daily backfill' });
	container.createEl('p', { text: 'Day: capture raw material. End of day: make cards. Weekly: review links, conflicts, and gaps.' });
	const filesEl = container.createDiv('knowledge-base-daily-files');
	const status = container.createEl('p', { text: 'Loading today’s Markdown changes…' });
	void (async () => {
		const files = await context.dailyService.listTodayChanges(new Date(), context.rootPath);
		status.setText(`${files.length} file(s) changed today`);
		for (const file of files) addFileToggle(filesEl, file);
	})();
	new Setting(container).setName('Daily review').setDesc('Prepare a candidate request; the AI upload confirmation is explicit.').addButton((button) => button.setButtonText('Prepare daily review').setCta().onClick(async () => {
		const rules = await context.ruleStore.loadEffectiveRules();
		if (!rules) { new Notice('Activate valid rules first.'); return; }
		new Notice('Daily review is ready for upload preview.');
	}));
	new Setting(container).setName('Weekly review').setDesc('Review associations, conflicts, omissions, stale knowledge, and skill candidates.').addButton((button) => button.setButtonText('Prepare weekly review').onClick(() => new Notice('Weekly review is ready for upload preview.')));
}

function addFileToggle(container: HTMLElement, file: DailyFile): void {
	new Setting(container).setName(file.path).setDesc(`${file.size} bytes`).addToggle((toggle) => toggle.setValue(file.included).onChange((value) => { file.included = value; }));
}

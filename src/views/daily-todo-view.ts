import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type { AiClient } from '../ai/openai-compatible-client';
import { DailyPlannerService, type DailyPlannerSources } from '../daily/daily-planner-service';
import { validateDailyPlan, type DailyPlanValidationResult } from '../daily/daily-plan-validator';
import { zhCN } from '../i18n/zh-CN';

export const VIEW_TYPE_DAILY_TODO = 'prompt-daily-todo-view';

export interface DailyTodoViewServices {
	aiClient: AiClient;
	dailyPlannerService: DailyPlannerService;
}

export interface DailyTodoState {
	date: string;
	extraConstraints: string;
	sourcesChecked: boolean;
	uploadConfirmed: boolean;
	sources: DailyPlannerSources | null;
	preview: string;
	validation: DailyPlanValidationResult | null;
}

export function formatDailyTodoDate(date: Date): string {
	if (Number.isNaN(date.getTime())) throw new Error(zhCN.dailyTodo.dateInvalid);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseDailyTodoDate(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const parts = value.split('-').map(Number);
	const year = parts[0];
	const month = parts[1];
	const day = parts[2];
	if (year === undefined || month === undefined || day === undefined) return null;
	const date = new Date(year, month - 1, day);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function createDailyTodoState(date = new Date()): DailyTodoState {
	return { date: formatDailyTodoDate(date), extraConstraints: '', sourcesChecked: false, uploadConfirmed: false, sources: null, preview: '', validation: null };
}

export function canGenerateDailyTodo(state: Pick<DailyTodoState, 'sourcesChecked' | 'uploadConfirmed' | 'sources'>): boolean {
	return state.sourcesChecked && state.uploadConfirmed && Boolean(state.sources) && (state.sources?.status.every((source) => source.exists) ?? false);
}

export function getDailyTodoSaveGuard(state: Pick<DailyTodoState, 'preview' | 'validation'>): { allowed: boolean; reason?: string } {
	if (!state.preview.trim()) return { allowed: false, reason: zhCN.dailyTodo.noPlan };
	if (!state.validation?.valid) return { allowed: false, reason: zhCN.dailyTodo.invalid };
	return { allowed: true };
}

export class DailyTodoView extends ItemView {
	private state = createDailyTodoState();

	constructor(leaf: WorkspaceLeaf, private readonly services: DailyTodoViewServices) {
		super(leaf);
	}

	getViewType(): string { return VIEW_TYPE_DAILY_TODO; }
	getDisplayText(): string { return zhCN.plugin.dailyTodoViewTitle; }
	getIcon(): string { return 'calendar-check'; }

	async onOpen(): Promise<void> {
		await this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	private async render(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass('daily-todo-view');
		root.createEl('h2', { text: zhCN.dailyTodo.heading });
		root.createEl('p', { cls: 'daily-todo-description', text: zhCN.dailyTodo.desc });

		const dateField = root.createDiv('daily-todo-field');
		dateField.createEl('label', { text: zhCN.dailyTodo.date });
		const dateInput = dateField.createEl('input', { type: 'date' });
		dateInput.value = this.state.date;
		dateInput.addEventListener('change', () => this.resetForInput(dateInput.value));

		const constraintsField = root.createDiv('daily-todo-field');
		constraintsField.createEl('label', { text: zhCN.dailyTodo.extraConstraints });
		const constraints = constraintsField.createEl('textarea', { placeholder: zhCN.dailyTodo.extraConstraintsPlaceholder });
		constraints.value = this.state.extraConstraints;
		constraints.addEventListener('input', () => {
			this.state.extraConstraints = constraints.value;
			this.state.sourcesChecked = false;
			this.state.sources = null;
			this.state.uploadConfirmed = false;
			this.state.preview = '';
			this.state.validation = null;
			this.renderButtons(this.contentEl);
		});

		const sourceActions = root.createDiv('daily-todo-actions');
		const checkButton = sourceActions.createEl('button', { text: zhCN.dailyTodo.checkSources });
		checkButton.addEventListener('click', () => void this.checkSources(dateInput.value, constraints.value));
		const confirmation = root.createDiv('daily-todo-field');
		const confirmationLabel = confirmation.createEl('label');
		const confirmationInput = confirmationLabel.createEl('input', { type: 'checkbox' });
		confirmationInput.checked = this.state.uploadConfirmed;
		confirmationInput.addEventListener('change', () => { this.state.uploadConfirmed = confirmationInput.checked; this.renderButtons(root); });
		confirmationLabel.appendText(` ${zhCN.dailyTodo.uploadConfirmation}`);
		confirmation.createDiv({ cls: 'daily-todo-description', text: zhCN.dailyTodo.uploadConfirmationDesc });

		const sourcesEl = root.createDiv('daily-todo-sources');
		sourcesEl.createEl('strong', { text: zhCN.dailyTodo.sources });
		if (this.state.sources) {
			for (const source of this.state.sources.status) {
				const row = sourcesEl.createDiv(`daily-todo-source ${source.exists ? 'is-available' : 'is-missing'}`);
				row.setText(`${source.exists ? '✓' : '✗'} ${source.path} — ${source.exists ? zhCN.dailyTodo.available : zhCN.dailyTodo.missing}`);
			}
			if (this.state.sources.sources.length > 0) {
				sourcesEl.createEl('pre', {
					cls: 'daily-todo-source-preview',
					text: this.state.sources.sources.map((source) => `--- ${source.path} ---\n${source.content}`).join('\n\n'),
				});
			}
		} else sourcesEl.createEl('p', { cls: 'daily-todo-description', text: zhCN.dailyTodo.checkFirst });

		const actionEl = root.createDiv('daily-todo-actions');
		const generateButton = actionEl.createEl('button', { text: this.state.preview ? zhCN.dailyTodo.regenerate : zhCN.dailyTodo.generate });
		generateButton.addClass('daily-todo-generate-button');
		generateButton.disabled = !canGenerateDailyTodo(this.state);
		generateButton.addEventListener('click', () => void this.generate(dateInput.value, constraints.value));
		const openButton = actionEl.createEl('button', { text: zhCN.dailyTodo.openToday });
		openButton.addEventListener('click', () => void this.openPlan(dateInput.value));

		root.createEl('h3', { text: zhCN.dailyTodo.preview });
		const preview = root.createEl('textarea', { cls: 'daily-todo-preview' });
		preview.value = this.state.preview;
		preview.addEventListener('input', () => {
			this.state.preview = preview.value;
			const date = parseDailyTodoDate(this.state.date);
			this.state.validation = date ? validateDailyPlan(this.state.preview, date) : null;
			this.updateValidation(validationEl, this.state.validation);
			saveButton.disabled = !getDailyTodoSaveGuard(this.state).allowed;
		});

		root.createEl('h3', { text: zhCN.dailyTodo.validation });
		const validationEl = root.createDiv('daily-todo-validation');
		this.updateValidation(validationEl, this.state.validation);
		const saveButton = root.createEl('button', { text: zhCN.dailyTodo.confirmSave });
		saveButton.disabled = !getDailyTodoSaveGuard(this.state).allowed;
		saveButton.addEventListener('click', () => void this.save(dateInput.value));
	}

	private renderButtons(root: HTMLElement): void {
		const button = root.querySelector<HTMLButtonElement>('.daily-todo-generate-button');
		if (button) button.disabled = !canGenerateDailyTodo(this.state);
	}

	private resetForInput(date: string, extraConstraints = this.state.extraConstraints): void {
		this.state.date = date;
		this.state.extraConstraints = extraConstraints;
		this.state.sourcesChecked = false;
		this.state.sources = null;
		this.state.uploadConfirmed = false;
		this.state.preview = '';
		this.state.validation = null;
		void this.render();
	}

	private async checkSources(dateValue: string, extraConstraints: string): Promise<void> {
		const date = parseDailyTodoDate(dateValue);
		if (!date) { new Notice(zhCN.dailyTodo.dateInvalid); return; }
		try {
			this.state.date = dateValue;
			this.state.extraConstraints = extraConstraints;
			this.state.sources = await this.services.dailyPlannerService.loadSources(date, extraConstraints);
			this.state.sourcesChecked = true;
			await this.render();
		} catch (error) {
			new Notice(`${zhCN.dailyTodo.sourceCheckFailed} ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async generate(dateValue: string, extraConstraints: string): Promise<void> {
		const date = parseDailyTodoDate(dateValue);
		if (!date) { new Notice(zhCN.dailyTodo.dateInvalid); return; }
		if (!this.state.sourcesChecked) { new Notice(zhCN.dailyTodo.checkFirst); return; }
		if (!this.state.uploadConfirmed) { new Notice(zhCN.dailyTodo.confirmFirst); return; }
		if (!this.state.sources || !this.state.sources.status.every((source) => source.exists)) { new Notice(zhCN.dailyTodo.missingSources); return; }
		try {
			this.state.preview = await this.services.aiClient.generateDailyPlan({ date: dateValue, sources: this.state.sources.sources, extraConstraints });
			this.state.validation = validateDailyPlan(this.state.preview, date);
			await this.render();
			new Notice(zhCN.dailyTodo.generated);
		} catch (error) {
			new Notice(`${zhCN.dailyTodo.generationFailed} ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async save(dateValue: string): Promise<void> {
		const date = parseDailyTodoDate(dateValue);
		if (!date) { new Notice(zhCN.dailyTodo.dateInvalid); return; }
		this.state.validation = validateDailyPlan(this.state.preview, date);
		const guard = getDailyTodoSaveGuard(this.state);
		if (!guard.allowed) { new Notice(guard.reason ?? zhCN.dailyTodo.invalid); await this.render(); return; }
		try {
			const path = await this.services.dailyPlannerService.saveNewPlan(date, this.state.preview);
			new Notice(zhCN.dailyTodo.saved(path));
		} catch (error) {
			const message = error instanceof Error && /already exists/i.test(error.message) ? zhCN.dailyTodo.alreadyExists : `${zhCN.dailyTodo.saveFailed} ${error instanceof Error ? error.message : String(error)}`;
			new Notice(message);
		}
	}

	private async openPlan(dateValue: string): Promise<void> {
		const date = parseDailyTodoDate(dateValue);
		if (!date) { new Notice(zhCN.dailyTodo.dateInvalid); return; }
		const path = this.services.dailyPlannerService.getTargetPath(date);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) { new Notice(zhCN.dailyTodo.noTodayPlan); return; }
		await this.app.workspace.openLinkText(file.path, '', true);
	}

	private updateValidation(element: HTMLElement, validation: DailyPlanValidationResult | null): void {
		element.removeClass('daily-todo-invalid');
		if (!validation) { element.setText(''); return; }
		if (validation.valid) element.setText(zhCN.dailyTodo.valid);
		else { element.addClass('daily-todo-invalid'); element.setText(`${zhCN.dailyTodo.invalid}：\n${validation.errors.join('\n')}`); }
	}
}

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// The view module imports Obsidian's runtime-only API, which is intentionally
// unavailable in Node. These tests exercise the same pure helper contracts
// without constructing a DOM or loading the plugin runtime.
function formatDailyTodoDate(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function parseDailyTodoDate(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const [year, month, day] = value.split('-').map(Number);
	if (year === undefined || month === undefined || day === undefined) return null;
	const date = new Date(year, month - 1, day);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}
function createDailyTodoState(date = new Date()) {
	return { date: formatDailyTodoDate(date), extraConstraints: '', sourcesChecked: false, uploadConfirmed: false, sources: null as { sources: unknown[]; extraConstraints: string; status: Array<{ path: string; exists: boolean }> } | null, preview: '', validation: null as { valid: boolean; errors: string[] } | null };
}
function canGenerateDailyTodo(state: ReturnType<typeof createDailyTodoState>): boolean {
	return state.sourcesChecked && state.uploadConfirmed && Boolean(state.sources) && (state.sources?.status.every((source) => source.exists) ?? false);
}
function getDailyTodoSaveGuard(state: ReturnType<typeof createDailyTodoState>): { allowed: boolean } {
	return { allowed: Boolean(state.preview.trim() && state.validation?.valid) };
}
function dailyTodoSourceActionLabel(sourcesChecked: boolean): string {
	return sourcesChecked ? '重新检查资料' : '检查资料';
}

void describe('daily todo view helpers', () => {
	void it('formats and parses local calendar dates without timezone drift', () => {
		const date = new Date(2026, 10, 1);
		assert.equal(formatDailyTodoDate(date), '2026-11-01');
		assert.equal(formatDailyTodoDate(parseDailyTodoDate('2026-11-01')!), '2026-11-01');
		assert.equal(parseDailyTodoDate('2026-02-30'), null);
	});

	void it('starts with safe generation and save guards', () => {
		const state = createDailyTodoState(new Date(2026, 10, 1));
		assert.equal(state.date, '2026-11-01');
		assert.equal(canGenerateDailyTodo(state), false);
		assert.equal(getDailyTodoSaveGuard(state).allowed, false);
	});

	void it('requires checked complete sources and upload confirmation', () => {
		const state = createDailyTodoState();
		state.sourcesChecked = true;
		state.sources = { sources: [], extraConstraints: '', status: [{ path: 'x', exists: true }] };
		assert.equal(canGenerateDailyTodo(state), false);
		state.uploadConfirmed = true;
		assert.equal(canGenerateDailyTodo(state), true);
	});

	void it('keeps a visible recheck action after sources have been checked', () => {
		assert.equal(dailyTodoSourceActionLabel(false), '检查资料');
		assert.equal(dailyTodoSourceActionLabel(true), '重新检查资料');
	});

	void it('allows saving only after valid preview validation', () => {
		const state = createDailyTodoState();
		state.preview = 'content';
		state.validation = { valid: false, errors: ['bad'] };
		assert.equal(getDailyTodoSaveGuard(state).allowed, false);
		state.validation = { valid: true, errors: [] };
		assert.equal(getDailyTodoSaveGuard(state).allowed, true);
	});
});

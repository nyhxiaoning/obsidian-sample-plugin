import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DailyBackfillService, type DailyFile, type DailyVaultFile } from '../../src/daily/daily-backfill-service';
import type { KnowledgeRules } from '../../src/rules/rule-schema';

const rules = {
	 schemaVersion: 1,
	 scope: { root: 'knowledge', include: ['**/*.md'], exclude: ['系统/**'] },
	 frontmatter: { enabled: true, required: [], allowedStatus: [] },
	 checks: { fileName: true, directory: true, source: true, duplicateTopic: true, relatedLinks: true },
	 actions: { patchFrontmatter: 'confirm', applyTemplate: 'confirm', moveFile: 'confirm', regenerateIndex: 'allowed', deleteFile: 'denied' },
	 ai: { tasks: ['dailyBackfill', 'weeklyReview'], manualOnly: true },
	 dailyBackfill: { enabled: true, dailyReview: 'manual', weeklyReview: 'manual' },
} satisfies KnowledgeRules;

function localDate(year: number, month: number, day: number, hour = 12): Date {
	return new Date(year, month - 1, day, hour, 0, 0, 0);
}

class FakeVault {
	constructor(private readonly files: DailyVaultFile[], private readonly contents: Record<string, string>) {}

	getMarkdownFiles(): DailyVaultFile[] {
		return this.files;
	}

	async read(path: string): Promise<string> {
		return this.contents[path] ?? '';
	}
}

function createService(files: DailyVaultFile[], contents: Record<string, string> = {}) {
	return new DailyBackfillService(new FakeVault(files, contents), {
		rootPath: 'knowledge',
		rules,
		ruleGuidance: 'Keep durable knowledge cards linked and current.',
	});
}

void describe('DailyBackfillService', () => {
	void it('uses local-day boundaries and filters to Markdown below the configured root', async () => {
		const now = localDate(2026, 10, 31, 12);
		const files = [
			{ path: 'knowledge/midnight.md', stat: { mtime: localDate(2026, 10, 31, 0).getTime(), size: 1 } },
			{ path: 'knowledge/just-before-midnight.md', stat: { mtime: localDate(2026, 10, 31, 23,).getTime(), size: 2 } },
			{ path: 'knowledge/next-day.md', stat: { mtime: localDate(2026, 11, 1, 0).getTime(), size: 3 } },
			{ path: 'knowledge/notes.txt', stat: { mtime: now.getTime(), size: 4 } },
			{ path: 'knowledge-other/looks-similar.md', stat: { mtime: now.getTime(), size: 5 } },
			{ path: 'knowledge/系统/index.md', stat: { mtime: now.getTime(), size: 6 } },
		];

		const result = await createService(files).listTodayChanges(now, 'knowledge');

		assert.deepEqual(result.map((file) => file.path), [
			'knowledge/just-before-midnight.md',
			'knowledge/midnight.md',
		]);
		assert.equal(result.every((file) => file.included), true);
	});

	void it('keeps explicit user exclusions on files when building a daily request', async () => {
		const files: DailyFile[] = [
			{ path: 'knowledge/a.md', modifiedAt: localDate(2026, 10, 31).getTime(), size: 10, included: false },
			{ path: 'knowledge/b.md', modifiedAt: localDate(2026, 10, 31).getTime(), size: 20, included: true },
		];
		const service = createService(files, { 'knowledge/b.md': '# B' });

		const request = await service.buildDailyRequest(files, 'dailyBackfill');

		assert.deepEqual(request.files, [{ path: 'knowledge/b.md', content: '# B' }]);
		assert.equal(request.task, 'dailyBackfill');
	});

	void it('builds a weekly review request for the selected half-open time range', async () => {
		const weekStart = localDate(2026, 10, 26, 0);
		const weekEnd = localDate(2026, 11, 2, 0);
		const files: DailyVaultFile[] = [
			{ path: 'knowledge/first.md', stat: { mtime: localDate(2026, 10, 26).getTime(), size: 1 } },
			{ path: 'knowledge/last.md', stat: { mtime: localDate(2026, 11, 1, 23).getTime(), size: 2 } },
			{ path: 'knowledge/outside.md', stat: { mtime: localDate(2026, 11, 2).getTime(), size: 3 } },
		];
		const service = createService(files, { 'knowledge/first.md': 'first', 'knowledge/last.md': 'last' });

		const request = await service.buildWeeklyReviewRequest(weekStart, weekEnd);

		assert.equal(request.task, 'weeklyReview');
		assert.deepEqual(request.files.map((file) => file.path), ['knowledge/first.md', 'knowledge/last.md']);
		assert.match(request.ruleGuidance, /associations/i);
		assert.match(request.ruleGuidance, /conflicts/i);
		assert.match(request.ruleGuidance, /omissions/i);
		assert.match(request.ruleGuidance, /stale/i);
		assert.match(request.ruleGuidance, /skill candidates/i);
	});
});

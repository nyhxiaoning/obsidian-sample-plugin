import { deepEqual, equal, rejects } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DailyPlannerService, DEFAULT_DAILY_PLANNER_ROOT, type DailyPlannerVault } from '../../src/daily/daily-planner-service';

class MemoryVault implements DailyPlannerVault {
	files = new Map<string, string>();
	created: string[] = [];

	async read(path: string): Promise<string> {
		const content = this.files.get(path);
		if (content === undefined) throw new Error(`Missing file: ${path}`);
		return content;
	}
	async exists(path: string): Promise<boolean> { return this.files.has(path); }
	async create(path: string, data: string): Promise<void> {
		if (this.files.has(path)) throw new Error(`Exists: ${path}`);
		this.files.set(path, data);
		this.created.push(path);
	}
}

const date = new Date(2026, 10, 1);

void describe('DailyPlannerService', () => {
	void it('loads the five default planner sources and preserves caller constraints', async () => {
		const vault = new MemoryVault();
		const service = new DailyPlannerService(vault);
		const paths = [
			`${DEFAULT_DAILY_PLANNER_ROOT}/01-规划规则.md`,
			`${DEFAULT_DAILY_PLANNER_ROOT}/02-参考任务池.md`,
			`${DEFAULT_DAILY_PLANNER_ROOT}/03-个人规划配置.md`,
			`${DEFAULT_DAILY_PLANNER_ROOT}/04-执行复盘记录.md`,
			`${DEFAULT_DAILY_PLANNER_ROOT}/Daily/每日计划文件模版.md`,
		];
		for (const path of paths) vault.files.set(path, path);
		const result = await service.loadSources(date, '今天只安排上午任务');
		deepEqual(result.sources.map((source) => source.path), paths);
		deepEqual(result.status.map((source) => source.exists), [true, true, true, true, true]);
		equal(result.extraConstraints, '今天只安排上午任务');
	});

	void it('reports missing sources and creates a date-specific target path', async () => {
		const service = new DailyPlannerService(new MemoryVault(), 'planner');
		const result = await service.loadSources(date);
		equal(result.sources.length, 0);
		equal(result.status.every((source) => !source.exists), true);
		equal(service.getTargetPath(date), 'planner/Daily/2026-11-01.md');
	});

	void it('rejects traversal in the configured root', async () => {
		await rejects(async () => new DailyPlannerService(new MemoryVault(), '../outside'), /escapes the Vault/);
	});

	void it('creates a new plan but never overwrites an existing plan', async () => {
		const vault = new MemoryVault();
		const service = new DailyPlannerService(vault, 'planner');
		equal(await service.saveNewPlan(date, '# plan'), 'planner/Daily/2026-11-01.md');
		await rejects(() => service.saveNewPlan(date, '# replacement'), /already exists/);
		equal(await vault.read('planner/Daily/2026-11-01.md'), '# plan');
	});
});


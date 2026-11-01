import type { VaultLike } from '../types';

export const DEFAULT_DAILY_PLANNER_ROOT = '000ai知识库价值写作体系/AI-Daily-Planner';

const SOURCE_FILES = [
	'01-规划规则.md',
	'02-参考任务池.md',
	'03-个人规划配置.md',
	'04-执行复盘记录.md',
	'Daily/每日计划文件模版.md',
] as const;

/** The minimal additional Vault API needed to create a new file. */
export interface DailyPlannerVault extends VaultLike {
	create(path: string, data: string): Promise<unknown>;
}

export interface DailyPlannerSource {
	path: string;
	content: string;
}

export interface DailyPlannerSourceStatus {
	path: string;
	exists: boolean;
	error?: string;
}

export interface DailyPlannerSources {
	sources: DailyPlannerSource[];
	extraConstraints: string;
	status: DailyPlannerSourceStatus[];
}

const normalizePath = (path: string): string => path.replaceAll('\\', '/');

function assertSafeRelativePath(path: string): string {
	const normalized = normalizePath(path);
	if (!normalized || /^[A-Za-z]:\//.test(normalized)) {
		throw new Error(`Path must be relative to the Vault: ${path}`);
	}
	if (normalized.startsWith('/')) throw new Error(`Path must be relative to the Vault: ${path}`);
	const segments = normalized.split('/');
	if (segments.some((segment) => segment === '..')) {
		throw new Error(`Path escapes the Vault: ${path}`);
	}
	return segments.filter((segment) => segment !== '.').join('/');
}

function joinVaultPath(root: string, child: string): string {
	const safeRoot = assertSafeRelativePath(root);
	const safeChild = assertSafeRelativePath(child);
	return `${safeRoot}/${safeChild}`;
}

function formatDate(date: Date): string {
	if (Number.isNaN(date.getTime())) throw new Error('Invalid planner date');
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export class DailyPlannerService {
	constructor(
		private readonly vault: DailyPlannerVault,
		private readonly rootPath: string = DEFAULT_DAILY_PLANNER_ROOT,
	) {
		assertSafeRelativePath(rootPath);
	}

	async loadSources(date: Date, extraConstraints = ''): Promise<DailyPlannerSources> {
		// Resolve the date here so malformed dates fail before any Vault reads.
		formatDate(date);
		const status: DailyPlannerSourceStatus[] = [];
		const sources: DailyPlannerSource[] = [];

		for (const relativePath of SOURCE_FILES) {
			const path = joinVaultPath(this.rootPath, relativePath);
			try {
				const content = await this.vault.read(path);
				status.push({ path, exists: true });
				sources.push({ path, content });
			} catch (error) {
				status.push({ path, exists: false, error: error instanceof Error ? error.message : String(error) });
			}
		}

		return { sources, extraConstraints, status };
	}

	getTargetPath(date: Date): string {
		return joinVaultPath(this.rootPath, `Daily/${formatDate(date)}.md`);
	}

	async targetExists(date: Date): Promise<boolean> {
		const path = this.getTargetPath(date);
		if (this.vault.exists) return this.vault.exists(path);
		try {
			await this.vault.read(path);
			return true;
		} catch {
			return false;
		}
	}

	async saveNewPlan(date: Date, content: string): Promise<string> {
		const path = this.getTargetPath(date);
		if (await this.targetExists(date)) throw new Error(`Daily plan already exists: ${path}`);
		await this.vault.create(path, content);
		return path;
	}
}


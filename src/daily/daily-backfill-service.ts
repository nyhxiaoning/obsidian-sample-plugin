import type { AiRequest, AiTask } from '../types';
import type { KnowledgeRules } from '../rules/rule-schema';

export interface DailyFile {
	path: string;
	modifiedAt: number;
	size: number;
	included: boolean;
}

export interface DailyVaultFile {
	path: string;
	stat?: { mtime: number; size: number };
	modifiedAt?: number;
	size?: number;
}

export interface DailyBackfillVault {
	getMarkdownFiles(): DailyVaultFile[];
	read(path: string): Promise<string>;
}

export interface DailyBackfillOptions {
	rootPath: string;
	rules: KnowledgeRules;
	ruleGuidance: string;
}

const normalizePath = (path: string): string => path.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');

function isInsideRoot(path: string, rootPath: string): boolean {
	const normalizedPath = normalizePath(path);
	const normalizedRoot = normalizePath(rootPath);
	return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function isExcludedByRule(path: string, rootPath: string, excludes: string[]): boolean {
	const relativePath = normalizePath(path).slice(normalizePath(rootPath).length).replace(/^\/+/, '');
	return excludes.some((pattern) => {
		const normalizedPattern = normalizePath(pattern).replace(/^\*\*\//, '').replace(/\/\*\*$/, '');
		return relativePath === normalizedPattern
			|| relativePath.startsWith(`${normalizedPattern}/`)
			|| (pattern.endsWith('**') && relativePath.startsWith(normalizedPattern));
	});
}

function dayStart(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dailyReviewGuidance(guidance: string): string {
	return `${guidance}\n\nFor this daily backfill, turn the selected raw materials into knowledge-card suggestions. Do not perform file operations. Return suggestions only.`;
}

const weeklyReviewGuidance = `Review the selected week's knowledge for associations, conflicts, omissions, stale knowledge, and skill candidates. Do not perform file operations. Return review suggestions only.`;

export class DailyBackfillService {
	constructor(
		private readonly vault: DailyBackfillVault,
		private options: DailyBackfillOptions,
	) {}

	setRules(rules: KnowledgeRules, ruleGuidance: string): void {
		this.options = { ...this.options, rules, ruleGuidance };
	}

	async listTodayChanges(now: Date, rootPath: string): Promise<DailyFile[]> {
		const start = dayStart(now).getTime();
		const end = new Date(start);
		end.setDate(end.getDate() + 1);
		return this.listFilesInRange(start, end.getTime(), rootPath);
	}

	async buildDailyRequest(files: DailyFile[], task: AiTask): Promise<AiRequest> {
		return {
			task,
			rules: this.options.rules,
			ruleGuidance: dailyReviewGuidance(this.options.ruleGuidance),
			files: await this.readIncludedFiles(files),
		};
	}

	async buildWeeklyReviewRequest(weekStart: Date, weekEnd: Date): Promise<AiRequest> {
		const files = this.listFilesInRange(
			weekStart.getTime(),
			weekEnd.getTime(),
			this.options.rootPath,
		);
		return {
			task: 'weeklyReview',
			rules: this.options.rules,
			ruleGuidance: `${this.options.ruleGuidance}\n\n${weeklyReviewGuidance}`,
			files: await this.readIncludedFiles(files),
		};
	}

	private listFilesInRange(start: number, end: number, rootPath: string): DailyFile[] {
		return this.vault.getMarkdownFiles()
			.map((file) => this.toDailyFile(file))
			.filter((file): file is DailyFile => file !== null)
			.filter((file) => isInsideRoot(file.path, rootPath))
			.filter((file) => !isExcludedByRule(file.path, rootPath, this.options.rules.scope.exclude))
			.filter((file) => file.modifiedAt >= start && file.modifiedAt < end)
			.sort((left, right) => left.path.localeCompare(right.path));
	}

	private toDailyFile(file: DailyVaultFile): DailyFile | null {
		const modifiedAt = file.modifiedAt ?? file.stat?.mtime;
		const size = file.size ?? file.stat?.size;
		if (!file.path.toLowerCase().endsWith('.md') || modifiedAt === undefined || size === undefined) return null;
		return { path: normalizePath(file.path), modifiedAt, size, included: true };
	}

	private async readIncludedFiles(files: DailyFile[]): Promise<Array<{ path: string; content: string }>> {
		return Promise.all(
			files
				.filter((file) => file.included)
				.filter((file) => isInsideRoot(file.path, this.options.rootPath))
				.sort((left, right) => left.path.localeCompare(right.path))
				.map(async (file) => ({ path: file.path, content: await this.vault.read(file.path) })),
		);
	}
}

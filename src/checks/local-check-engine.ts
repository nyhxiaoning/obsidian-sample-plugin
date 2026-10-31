import type { KnowledgeRules } from '../rules/rule-schema';
import type { VaultLike } from '../types';
import type { CheckResult } from '../changes/change-plan';
import { checkPath } from './checkers/path-checker';
import { checkFrontmatter } from './checkers/frontmatter-checker';
import { checkSource } from './checkers/source-checker';
import { checkLinks, findLinkCandidates } from './checkers/link-checker';

export interface CheckContext {
	vault: VaultLike;
	rootPath: string;
	rules: KnowledgeRules;
	filePaths: string[];
}

export class LocalCheckEngine {
	async check(context: CheckContext): Promise<CheckResult[]> {
		const results: CheckResult[] = [];
		for (const filePath of [...context.filePaths].sort()) {
			const markdown = await context.vault.read(filePath);
			const checks = [
				...checkPath(context, filePath),
				...checkFrontmatter(context, filePath, markdown),
				...checkSource(context, filePath, markdown),
				...checkLinks(context, filePath, markdown),
				...(context.rules.checks.duplicateTopic ? this.duplicateCandidates(context, filePath, markdown) : []),
				...findLinkCandidates(context, filePath, markdown),
			];
			results.push(...checks);
		}
		return results.sort((left, right) => left.filePath.localeCompare(right.filePath) || left.id.localeCompare(right.id));
	}

	private duplicateCandidates(context: CheckContext, filePath: string, markdown: string): CheckResult[] {
		const title = markdown.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim().toLowerCase();
		if (!title) return [];
		return context.filePaths.filter((candidate) => candidate !== filePath && candidate.toLowerCase().includes(title.replaceAll(' ', '-'))).slice(0, 3).map((candidate) => ({
			id: 'duplicate.candidate', severity: 'info' as const,
			message: `Possible duplicate topic (heuristic; verify manually): ${candidate}`,
			filePath,
		}));
	}
}

export async function runLocalChecks(context: CheckContext): Promise<CheckResult[]> {
	return new LocalCheckEngine().check(context);
}

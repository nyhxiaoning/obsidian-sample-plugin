import { parse } from 'yaml';
import type { CheckResult } from '../../changes/change-plan';
import type { CheckContext } from '../local-check-engine';

function parseFrontmatter(markdown: string): Record<string, unknown> | null {
	const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match?.[1]) return null;
	try {
		const value: unknown = parse(match[1]);
		return typeof value === 'object' && value !== null && !Array.isArray(value)
			? value as Record<string, unknown>
			: null;
	} catch {
		return null;
	}
}

export function checkFrontmatter(context: CheckContext, filePath: string, markdown: string): CheckResult[] {
	if (!context.rules.frontmatter.enabled) return [];
	const frontmatter = parseFrontmatter(markdown);
	const results: CheckResult[] = [];
	if (frontmatter === null) {
		return [{ id: 'frontmatter.missing', severity: 'error', message: 'Frontmatter is missing or malformed.', filePath,
			change: context.rules.actions.patchFrontmatter === 'confirm' ? {
				kind: 'patch', target: filePath, reason: 'Add the required frontmatter fields.', risk: 'low', requiresConfirmation: true,
			} : undefined }];
	}

	const missing = context.rules.frontmatter.required.filter((field) => {
		const value = frontmatter[field];
		return value === undefined || value === null || value === '';
	});
	if (missing.length > 0) {
		results.push({ id: 'frontmatter.required', severity: 'error', message: `Missing required fields: ${missing.join(', ')}`, filePath,
			change: context.rules.actions.patchFrontmatter === 'confirm' ? {
				kind: 'patch', target: filePath, reason: `Add missing frontmatter fields: ${missing.join(', ')}.`, risk: 'low', requiresConfirmation: true,
			} : undefined });
	}

	const status = frontmatter.status;
		const statusText = typeof status === 'string' || typeof status === 'number' || typeof status === 'boolean' ? String(status) : 'non-scalar value';
	if (status !== undefined && !context.rules.frontmatter.allowedStatus.includes(statusText)) {
		results.push({ id: 'frontmatter.status', severity: 'error', message: `Unsupported status: ${statusText}`, filePath,
			change: context.rules.actions.patchFrontmatter === 'confirm' ? {
				kind: 'patch', target: filePath, reason: 'Replace the unsupported status with an allowed status.', risk: 'low', requiresConfirmation: true,
			} : undefined });
	}
	return results;
}

export { parseFrontmatter };

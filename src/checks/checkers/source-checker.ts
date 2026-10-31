import type { CheckResult } from '../../changes/change-plan';
import type { CheckContext } from '../local-check-engine';
import { parseFrontmatter } from './frontmatter-checker';

export function checkSource(context: CheckContext, filePath: string, markdown: string): CheckResult[] {
	if (!context.rules.checks.source) return [];
	const frontmatter = parseFrontmatter(markdown);
	const source = frontmatter?.source;
	if (typeof source === 'string' && source.trim() !== '') return [];
	if (Array.isArray(source) && source.length > 0) return [];
	return [{ id: 'source.missing', severity: 'warning', message: 'Source metadata is missing; add a source for traceability.', filePath }];
}

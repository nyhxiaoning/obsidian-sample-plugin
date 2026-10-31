import type { CheckResult } from '../../changes/change-plan';
import type { CheckContext } from '../local-check-engine';

const wikiLinkPattern = /\[\[([^\]]*)\]\]/g;

export function checkLinks(context: CheckContext, filePath: string, markdown: string): CheckResult[] {
	if (!context.rules.checks.relatedLinks) return [];
	const results: CheckResult[] = [];
	const opening = (markdown.match(/\[\[/g) ?? []).length;
	const links = [...markdown.matchAll(wikiLinkPattern)];
	if (opening !== links.length) {
		results.push({ id: 'links.malformed', severity: 'error', message: 'One or more WikiLinks are malformed.', filePath });
	}
	for (const link of links) {
		const target = (link[1] ?? '').split('|')[0]?.split('#')[0]?.trim();
		if (!target) results.push({ id: 'links.empty', severity: 'warning', message: 'WikiLink target is empty.', filePath });
	}
	return results;
}

export function findLinkCandidates(context: CheckContext, filePath: string, markdown: string): CheckResult[] {
	if (!context.rules.checks.relatedLinks) return [];
	const headings = [...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => match[1]?.trim().toLowerCase()).filter((value): value is string => Boolean(value));
	const candidates = context.filePaths.filter((candidate) => candidate !== filePath && headings.some((heading) => candidate.toLowerCase().includes(heading.replaceAll(' ', '-'))));
	return candidates.slice(0, 3).map((candidate) => ({
		id: 'links.candidate', severity: 'info' as const,
		message: `Possible related file (heuristic; verify manually): ${candidate}`,
		filePath,
	}));
}

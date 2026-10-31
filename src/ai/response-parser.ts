import type { ChangePlan } from '../changes/change-plan';

export type AiSuggestionKind = 'classification' | 'summary' | 'relation' | 'change' | 'review';

export interface AiSuggestion {
	kind: AiSuggestionKind;
	title: string;
	detail: string;
	proposedPath?: string;
	relatedFiles?: string[];
	change?: ChangePlan;
	sourcePath?: string;
}

export interface AiParserOptions {
	root: string;
}

const kinds: readonly AiSuggestionKind[] = ['classification', 'summary', 'relation', 'change', 'review'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

function cleanRoot(root: string): string {
	return root.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function assertKnowledgeBasePath(value: unknown, root: string, field: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`${field} must be a non-empty relative path`);
	}
	const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
	const rootPath = cleanRoot(root);
	const outsideVault = normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || normalized.split('/').some((part) => part === '..' || part === '');
	const insideRoot = normalized === rootPath || normalized.startsWith(`${rootPath}/`);
	if (outsideVault || !insideRoot) {
		throw new Error(`${field} is outside the knowledge base`);
	}
	return normalized;
}

function parseJson(text: string): unknown {
	const trimmed = text.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
	try {
		return JSON.parse(fenced?.[1]?.trim() ?? trimmed) as unknown;
	} catch {
		throw new Error('AI response contains invalid JSON');
	}
}

function stringField(value: unknown, field: string): string {
	if (typeof value !== 'string' || value.trim() === '') throw new Error(`AI suggestion ${field} must be a non-empty string`);
	return value.trim();
}

function relatedFiles(value: unknown, root: string): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
		throw new Error('AI suggestion relatedFiles must be an array of strings');
	}
	return value.map((path) => assertKnowledgeBasePath(path, root, 'relatedFiles path'));
}

export function parseAiSuggestions(text: string, options: AiParserOptions): AiSuggestion[] {
	const parsed = parseJson(text);
	if (!Array.isArray(parsed)) throw new Error('AI response must be a JSON array');
	const root = cleanRoot(options.root);

	return parsed.map((item, index) => {
		if (!isRecord(item)) throw new Error(`AI suggestion ${index + 1} must be an object`);
		const kind = item.kind;
		if (!kinds.includes(kind as AiSuggestionKind)) throw new Error(`AI suggestion ${index + 1} kind is invalid`);
		const suggestion: AiSuggestion = {
			kind: kind as AiSuggestionKind,
			title: stringField(item.title, 'title'),
			detail: stringField(item.detail, 'detail'),
		};
		if (item.proposedPath !== undefined) {
			suggestion.proposedPath = assertKnowledgeBasePath(item.proposedPath, root, 'proposedPath');
		}
		const files = relatedFiles(item.relatedFiles, root);
		if (files !== undefined) suggestion.relatedFiles = files;
		if (suggestion.kind === 'change') {
			if (suggestion.proposedPath === undefined) throw new Error('AI change suggestion requires proposedPath');
			const operation = item.operation;
			if (operation !== 'move' && operation !== 'patch') {
				suggestion.change = {
					kind: 'report',
					target: suggestion.proposedPath,
					reason: suggestion.detail,
					risk: 'medium',
					diff: `Proposed path: ${suggestion.proposedPath}`,
					requiresConfirmation: true,
				};
				return suggestion;
			}
			const sourcePath = item.sourcePath === undefined
				? suggestion.proposedPath
				: assertKnowledgeBasePath(item.sourcePath, root, 'sourcePath');
			suggestion.sourcePath = sourcePath;
			if (operation === 'move') {
				suggestion.change = { kind: 'move', target: suggestion.proposedPath, reason: suggestion.detail, risk: 'medium', requiresConfirmation: true, action: 'moveFile' };
			} else {
				const afterContent = item.afterContent;
				if (typeof afterContent !== 'string') throw new Error('AI patch suggestion requires afterContent');
				suggestion.change = { kind: 'patch', target: sourcePath, reason: suggestion.detail, risk: 'medium', requiresConfirmation: true, action: 'patchFrontmatter', afterContent };
			}
		}
		return suggestion;
	});
}

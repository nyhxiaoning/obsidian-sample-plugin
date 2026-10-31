import type { AiRequest } from './openai-compatible-client';

export interface AiPrompt {
	system: string;
	user: string;
}

export function buildAiPrompt(request: AiRequest): AiPrompt {
	const system = [
		'You are an offline knowledge-base organization advisor.',
		'You cannot execute, write, move, rename, or delete files. Return suggestions only.',
		'Return a JSON array only, with no Markdown fences or other text.',
		'Each item must have kind, title, and detail. kind must be one of: classification, summary, relation, change, review.',
		'For a change item, proposedPath must be a relative path inside the configured knowledge-base root.',
		'Never invent file contents or claim that an operation was executed.',
	].join('\n');
	const user = JSON.stringify({
		task: request.task,
		structuredRules: request.rules,
		ruleGuidance: request.ruleGuidance,
		selectedFiles: request.files,
		outputSchema: [
			{ kind: 'summary', title: 'Short title', detail: 'Actionable explanation.' },
			{ kind: 'change', title: 'Suggested change', detail: 'Why it may help.', proposedPath: `${request.rules.scope.root}/folder/file.md`, relatedFiles: [`${request.rules.scope.root}/related.md`] },
		],
	}, null, 2);
	return { system, user };
}

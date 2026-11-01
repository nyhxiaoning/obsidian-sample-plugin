import type { DailyPlanRequest } from './openai-compatible-client';

export interface DailyPlanPrompt {
	system: string;
	user: string;
}

export function buildDailyPlanPrompt(request: DailyPlanRequest): DailyPlanPrompt {
	const system = [
		'You are an offline daily planning assistant.',
		'You cannot execute, write, move, rename, or delete files. Return a proposed plan only.',
		'Return Markdown only, without JSON, commentary, or code fences.',
		'Use the requested date as the title and preserve the source facts.',
		'Create a practical plan with no more than four numbered tasks, no more than six total planned hours, and no more than six cognitive-capacity units.',
		'Never claim that a file was created or saved. The caller will preview and save the response.',
	].join('\n');
	const user = JSON.stringify({
		date: request.date,
		extraConstraints: request.extraConstraints,
		sources: request.sources,
		outputRules: {
			title: `# ${request.date} 每日计划`,
			format: 'Markdown',
			numberedTaskLimit: 4,
			hourLimit: 6,
			cognitiveCapacityLimit: 6,
		},
	}, null, 2);
	return { system, user };
}

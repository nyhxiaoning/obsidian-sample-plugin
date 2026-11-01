import { AiClientError } from './openai-compatible-client';

export function parseDailyPlanResponse(text: string): string {
	const normalized = text.trim().replace(/^```(?:markdown|md)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
	if (!normalized) throw new AiClientError('invalid_response', 'AI provider returned an empty daily plan');
	return normalized;
}

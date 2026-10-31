import type { KnowledgeRules } from '../rules/rule-schema';
import { buildAiPrompt } from './prompt-builder';
import { parseAiSuggestions, type AiSuggestion } from './response-parser';

export interface AiRequest {
	task: 'classify' | 'summarize' | 'suggestRelations' | 'suggestChanges' | 'dailyBackfill' | 'weeklyReview';
	rules: KnowledgeRules;
	ruleGuidance: string;
	files: Array<{ path: string; content: string }>;
}

export interface AiClient {
	analyze(request: AiRequest, signal?: AbortSignal): Promise<AiSuggestion[]>;
}

export interface OpenAICompatibleClientOptions {
	baseUrl: string;
	model: string;
	apiKey: string;
	timeoutMs: number;
	fetchImpl?: typeof fetch;
}

export class AiClientError extends Error {
	readonly code: 'configuration' | 'unauthorized' | 'rate_limit' | 'provider' | 'timeout' | 'network' | 'invalid_response';

	constructor(code: AiClientError['code'], message: string) {
		super(message);
		this.name = 'AiClientError';
		this.code = code;
	}
}

function endpoint(baseUrl: string): string {
	return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

interface ChatChoice {
	message: { content: string };
}

function isChatChoice(value: unknown): value is ChatChoice {
	if (typeof value !== 'object' || value === null || !('message' in value)) return false;
	const message = value.message;
	return typeof message === 'object'
		&& message !== null
		&& 'content' in message
		&& typeof message.content === 'string';
}

function responseContent(value: unknown): string {
	if (typeof value !== 'object' || value === null) {
		throw new AiClientError('invalid_response', 'AI provider returned an invalid response');
	}
	const choices = (value as Record<string, unknown>).choices;
	if (!Array.isArray(choices)) throw new AiClientError('invalid_response', 'AI provider returned an invalid response');
	const first = (choices as unknown[])[0];
	if (!isChatChoice(first)) {
		throw new AiClientError('invalid_response', 'AI provider returned no assistant content');
	}
	return first.message.content;
}

export class OpenAICompatibleClient implements AiClient {
	private readonly fetchImpl: typeof fetch;

	constructor(private readonly options: OpenAICompatibleClientOptions) {
		this.fetchImpl = options.fetchImpl ?? fetch;
	}

	async analyze(request: AiRequest, signal?: AbortSignal): Promise<AiSuggestion[]> {
		if (!this.options.baseUrl || !this.options.model || !this.options.apiKey) {
			throw new AiClientError('configuration', 'AI provider URL, model, and API key are required');
		}
		if (!Number.isFinite(this.options.timeoutMs) || this.options.timeoutMs <= 0) {
			throw new AiClientError('configuration', 'AI request timeout must be positive');
		}

		const prompt = buildAiPrompt(request);
		const controller = new AbortController();
		let timedOut = false;
		const timeout = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, this.options.timeoutMs);
		const abortCaller = () => controller.abort();
		signal?.addEventListener('abort', abortCaller, { once: true });
		try {
			let response: Response;
			try {
				response = await this.fetchImpl(endpoint(this.options.baseUrl), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.options.apiKey}` },
					body: JSON.stringify({ model: this.options.model, temperature: 0, messages: [
						{ role: 'system', content: prompt.system },
						{ role: 'user', content: prompt.user },
					] }),
					signal: controller.signal,
				});
			} catch (error) {
				if (timedOut) throw new AiClientError('timeout', 'AI request timed out');
				if (signal?.aborted) throw new AiClientError('network', 'AI request was cancelled');
				throw new AiClientError('network', `AI request failed: ${error instanceof Error ? error.message : 'network error'}`);
			}
			if (!response.ok) {
				if (response.status === 401 || response.status === 403) throw new AiClientError('unauthorized', 'AI provider rejected the API key');
				if (response.status === 429) throw new AiClientError('rate_limit', 'AI provider rate limit reached');
				if (response.status >= 500) throw new AiClientError('provider', 'AI provider is temporarily unavailable');
				throw new AiClientError('network', `AI provider request failed with status ${response.status}`);
			}
			let payload: unknown;
			try {
				payload = await response.json() as unknown;
			} catch {
				throw new AiClientError('invalid_response', 'AI provider returned invalid JSON');
			}
			return parseAiSuggestions(responseContent(payload), { root: request.rules.scope.root });
		} finally {
			clearTimeout(timeout);
			signal?.removeEventListener('abort', abortCaller);
		}
	}
}

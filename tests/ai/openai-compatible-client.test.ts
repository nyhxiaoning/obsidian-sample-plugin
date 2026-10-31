import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OpenAICompatibleClient } from '../../src/ai/openai-compatible-client';
import type { AiRequest } from '../../src/ai/openai-compatible-client';
import type { KnowledgeRules } from '../../src/rules/rule-schema';

const rules = {
	schemaVersion: 1,
	scope: { root: '000ai知识库价值写作体系', include: ['**/*.md'], exclude: ['系统/**'] },
	frontmatter: { enabled: true, required: [], allowedStatus: [] },
	checks: { fileName: true, directory: true, source: true, duplicateTopic: true, relatedLinks: true },
	actions: { patchFrontmatter: 'confirm', applyTemplate: 'confirm', moveFile: 'confirm', regenerateIndex: 'allowed', deleteFile: 'denied' },
	ai: { tasks: ['summarize'], manualOnly: true },
	dailyBackfill: { enabled: true, dailyReview: 'manual', weeklyReview: 'manual' },
} satisfies KnowledgeRules;

const request: AiRequest = {
	task: 'summarize', rules, ruleGuidance: 'Keep it concise.', files: [{ path: `${rules.scope.root}/note.md`, content: '# Note' }],
};

void describe('OpenAICompatibleClient', () => {
	void it('posts a chat completion request and parses its content', async () => {
		let received: { url: string; authorization: string | null; body: string } | undefined;
		const client = new OpenAICompatibleClient({
			baseUrl: 'https://example.test/v1/', model: 'test-model', apiKey: 'secret', timeoutMs: 1000,
			fetchImpl: async (input, init) => {
				const body = init?.body as string | undefined;
				const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input instanceof Request ? input.url : '';
				received = { url, authorization: new Headers(init?.headers).get('authorization'), body: body ?? '' };
				return new Response(JSON.stringify({ choices: [{ message: { content: '[{"kind":"summary","title":"Done","detail":"Okay"}]' } }] }), { status: 200 });
			},
		});

		const result = await client.analyze(request);

		assert.equal(result[0]?.title, 'Done');
		assert.equal(received?.url, 'https://example.test/v1/chat/completions');
		assert.equal(received?.authorization, 'Bearer secret');
		assert.match(received?.body ?? '', /test-model/);
	});

	void it('maps HTTP failures without exposing response details or the key', async () => {
		const client = new OpenAICompatibleClient({
			baseUrl: 'https://example.test/v1', model: 'test-model', apiKey: 'secret', timeoutMs: 1000,
			fetchImpl: async () => new Response('secret response body', { status: 429 }),
		});

		await assert.rejects(client.analyze(request), (error: unknown) => {
			assert.match(String(error), /rate limit/i);
			assert.doesNotMatch(String(error), /secret/);
			return true;
		});
	});

	void it('aborts a request that exceeds the timeout', async () => {
		const client = new OpenAICompatibleClient({
			baseUrl: 'https://example.test/v1', model: 'test-model', apiKey: 'secret', timeoutMs: 5,
			fetchImpl: (_input, init) => new Promise<Response>((_, reject) => {
				init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
			}),
		});

		await assert.rejects(client.analyze(request), /timed out/i);
	});
});

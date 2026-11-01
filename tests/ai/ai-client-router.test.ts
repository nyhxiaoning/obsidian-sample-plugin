import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AiClientError, type AiClient } from '../../src/ai/openai-compatible-client';
import { AiClientRouter } from '../../src/ai/ai-client-router';
import { buildTestRequest, createCliProviderAdapters } from '../../src/ai/cli-provider-adapters';
import { DEFAULT_SETTINGS, type KnowledgeBaseSettings } from '../../src/settings-model';

const request = buildTestRequest('000ai知识库价值写作体系');
const emptySuggestions: AiClient = { analyze: async () => [], generateDailyPlan: async () => '# plan' };

function settings(provider: KnowledgeBaseSettings['aiProvider']): KnowledgeBaseSettings {
	return structuredClone({ ...DEFAULT_SETTINGS, aiProvider: provider });
}

void describe('AiClientRouter', () => {
	void it('uses the custom client when custom is selected', async () => {
		let created = 0;
		const router = new AiClientRouter({
			getSettings: () => settings('custom'),
			customClientFactory: () => { created += 1; return emptySuggestions; },
		});
		assert.deepEqual(await router.analyze(request), []);
		assert.equal(created, 1);
	});

	void it('refuses an untested CLI without starting a process', async () => {
		const current = settings('codex');
		let runs = 0;
		const router = new AiClientRouter({ getSettings: () => current, runnerFactory: () => ({ run: async () => { runs += 1; throw new Error('must not run'); } }) });
		await assert.rejects(router.analyze(request), (error: unknown) => error instanceof AiClientError && error.code === 'configuration');
		assert.equal(runs, 0);
	});

	void it('routes dynamically to a tested CLI and passes the current request', async () => {
		const current = settings('codex');
		current.localCliProviders.codex.status = 'tested';
		const calls: string[] = [];
		const router = new AiClientRouter({
			getSettings: () => current,
			adapters: createCliProviderAdapters(),
			runnerFactory: () => ({ run: async (options: { args: string[] }) => {
				calls.push(options.args.join(' '));
				return { stdout: '[]', stderr: '', exitCode: 0, signal: null };
			} }),
		});
		assert.deepEqual(await router.analyze(request), []);
		assert.equal(calls.length, 1);
	});

	void it('selects a different provider after settings change', async () => {
		let selected = '';
		const current = settings('codex');
		for (const kind of ['codex', 'claude'] as const) current.localCliProviders[kind].status = 'tested';
		const router = new AiClientRouter({
			getSettings: () => current,
		localClientFactory: (kind) => ({ analyze: async () => { selected = kind; return []; }, generateDailyPlan: async () => '# plan' }),
		});
		await router.analyze(request);
		current.aiProvider = 'claude';
		await router.analyze(request);
		assert.equal(selected, 'claude');
	});

	void it('routes daily plan generation to the tested CLI', async () => {
		const current = settings('opencode');
		current.localCliProviders.opencode.status = 'tested';
		let generated = false;
		const router = new AiClientRouter({
			getSettings: () => current,
			localClientFactory: () => ({ analyze: async () => [], generateDailyPlan: async () => { generated = true; return '# plan'; } }),
		});

		assert.equal(await router.generateDailyPlan({ date: '2026-11-01', sources: [], extraConstraints: '' }), '# plan');
		assert.equal(generated, true);
	});
});

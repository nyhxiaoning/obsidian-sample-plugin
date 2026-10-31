import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCliProviderAdapters } from '../../src/ai/cli-provider-adapters';
import { AiClientError, type AiRequest } from '../../src/ai/openai-compatible-client';
import { LocalCliAiClient } from '../../src/ai/local-cli-client';
import type { LocalCliRunOptions, LocalCliRunResult } from '../../src/ai/local-cli-runner';

const root = '000ai知识库价值写作体系';
const request: AiRequest = {
	task: 'summarize',
	rules: { schemaVersion: 1, scope: { root, include: ['**/*.md'], exclude: [] }, frontmatter: { enabled: false, required: [], allowedStatus: [] }, checks: { fileName: true, directory: true, source: true, duplicateTopic: true, relatedLinks: true }, actions: { patchFrontmatter: 'confirm', applyTemplate: 'confirm', moveFile: 'confirm', regenerateIndex: 'allowed', deleteFile: 'denied' }, ai: { tasks: ['summarize'], manualOnly: true }, dailyBackfill: { enabled: false, dailyReview: 'manual', weeklyReview: 'manual' } },
	ruleGuidance: 'Keep the response concise.',
	files: [{ path: `${root}/note.md`, content: '# Note' }],
};

function createRunner(handler: (options: LocalCliRunOptions) => LocalCliRunResult | Error | Promise<LocalCliRunResult | Error>) {
	const calls: LocalCliRunOptions[] = [];
	return {
		calls,
		runner: { run: async (options: LocalCliRunOptions) => {
			calls.push(options);
			const result = await handler(options);
			if (result instanceof Error) throw result;
			return result;
		} },
	};
}

void describe('LocalCliAiClient', () => {
	void it('detects the executable with versionArgs and returns its version', async () => {
		const context = createRunner(() => ({ stdout: 'codex 1.2.3\n', stderr: '', exitCode: 0, signal: null }));
		const client = new LocalCliAiClient({
			adapter: createCliProviderAdapters().codex,
			executable: 'codex',
			cwd: '/vault',
			runner: context.runner,
		});

		assert.equal(await client.detect(), 'codex 1.2.3');
		assert.deepEqual(context.calls[0], { executable: 'codex', args: ['--version'], cwd: '/vault', timeoutMs: undefined, signal: undefined });
	});

	void it('sends only the fixed test prompt and parses an empty suggestion list', async () => {
		const context = createRunner((options) => options.args.includes('--version')
			? { stdout: 'claude 1.0.0', stderr: '', exitCode: 0, signal: null }
			: { stdout: JSON.stringify({ result: '[]' }), stderr: '', exitCode: 0, signal: null });
		const client = new LocalCliAiClient({ adapter: createCliProviderAdapters().claude, executable: 'claude', cwd: '/vault', runner: context.runner });

		const result = await client.testConnection();
		assert.equal(result.version, 'claude 1.0.0');
		assert.deepEqual(result.suggestions, []);
		assert.equal(context.calls.length, 2);
		assert.doesNotMatch(context.calls[1]?.args.join(' ') ?? '', /note\.md|# Note/);
	});

	void it('uses the formal prompt and parses suggestions for analysis', async () => {
		const context = createRunner((options) => options.args.includes('--version')
			? { stdout: 'gemini 1.0.0', stderr: '', exitCode: 0, signal: null }
			: { stdout: JSON.stringify({ response: JSON.stringify([{ kind: 'summary', title: '摘要', detail: '完成' }]) }), stderr: '', exitCode: 0, signal: null });
		const client = new LocalCliAiClient({ adapter: createCliProviderAdapters().gemini, executable: 'gemini', cwd: '/vault', runner: context.runner });

		const suggestions = await client.analyze(request);
		assert.equal(suggestions[0]?.title, '摘要');
		assert.equal(context.calls[0]?.args[0], '--prompt');
		assert.match(context.calls[0]?.args.join(' ') ?? '', /note\.md/);
	});

	void it('maps runner failures, nonzero exits, and invalid output to safe AiClientErrors', async () => {
		const errors = [
			new (class extends Error { kind = 'not_found' as const; })('secret executable'),
			new (class extends Error { kind = 'timeout' as const; })('secret input'),
			new (class extends Error { kind = 'cancelled' as const; })('secret cancellation'),
		];
		for (const error of errors) {
			const context = createRunner(() => error);
			const client = new LocalCliAiClient({ adapter: createCliProviderAdapters().codex, executable: '/secret/codex', runner: context.runner });
			await assert.rejects(client.detect(), (caught: unknown) => caught instanceof AiClientError && ['configuration', 'timeout', 'network'].includes(caught.code) && !caught.message.includes('secret'));
		}

		const nonzero = createRunner(() => ({ stdout: '', stderr: 'private diagnostics', exitCode: 2, signal: null }));
		const failedClient = new LocalCliAiClient({ adapter: createCliProviderAdapters().codex, executable: 'codex', runner: nonzero.runner });
		await assert.rejects(failedClient.detect(), (caught: unknown) => caught instanceof AiClientError && caught.code === 'provider' && caught.message.includes('检测失败') && caught.message.includes('private diagnostics'));

		const invalid = createRunner(() => ({ stdout: 'not-json', stderr: '', exitCode: 0, signal: null }));
		const invalidClient = new LocalCliAiClient({ adapter: createCliProviderAdapters().codex, executable: 'codex', runner: invalid.runner });
		await assert.rejects(invalidClient.testConnection(), (caught: unknown) => caught instanceof AiClientError && caught.code === 'invalid_response');
	});
});

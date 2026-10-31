import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCliProviderAdapters } from '../../src/ai/cli-provider-adapters';
import type { AiRequest } from '../../src/ai/openai-compatible-client';

const root = '000ai知识库价值写作体系';
const request: AiRequest = {
	task: 'summarize',
	rules: { schemaVersion: 1, scope: { root, include: ['**/*.md'], exclude: ['系统/**'] }, frontmatter: { enabled: true, required: [], allowedStatus: [] }, checks: { fileName: true, directory: true, source: true, duplicateTopic: true, relatedLinks: true }, actions: { patchFrontmatter: 'confirm', applyTemplate: 'confirm', moveFile: 'confirm', regenerateIndex: 'allowed', deleteFile: 'denied' }, ai: { tasks: ['summarize'], manualOnly: true }, dailyBackfill: { enabled: true, dailyReview: 'manual', weeklyReview: 'manual' } },
	ruleGuidance: 'Keep the response concise.',
	files: [{ path: `${root}/note.md`, content: '# Note' }],
};

const suggestion = JSON.stringify([{ kind: 'summary', title: '摘要', detail: '内容已整理。' }]);

void describe('CLI provider adapters', () => {
	void it('defines safe non-interactive arguments and fixed test prompts', () => {
		const adapters = createCliProviderAdapters();
		assert.equal(adapters.codex.promptTransport, 'stdin');
		assert.equal(adapters.claude.promptTransport, 'argv');
		assert.equal(adapters.gemini.promptTransport, 'argv');
		assert.equal(adapters.opencode.promptTransport, 'argv');
		assert.deepEqual(adapters.codex.requestArgs(true), ['exec', '--json', '--skip-git-repo-check']);
		assert.deepEqual(adapters.claude.requestArgs(true, 'Return exactly []'), ['-p', 'Return exactly []', '--output-format', 'json']);
		assert.deepEqual(adapters.gemini.requestArgs(true, 'Return exactly []'), ['--prompt', 'Return exactly []', '--output-format', 'json']);
		assert.deepEqual(adapters.opencode.requestArgs(true, 'Return exactly []'), ['run', 'Return exactly []']);
		for (const adapter of Object.values(adapters)) {
			assert.match(adapter.buildPrompt(request, true), /\[\]/);
			assert.doesNotMatch(adapter.buildPrompt(request, true), /# Note|note\.md/);
		}
	});

	void it('keeps formal prompts as literal argv values instead of shell text', () => {
		const prompt = 'Return []; $(touch hacked) && cat /vault/secret.md';
		const adapters = createCliProviderAdapters();
		assert.deepEqual(adapters.codex.requestArgs(false, prompt), ['exec', '--json', '--skip-git-repo-check']);
		assert.equal(adapters.claude.requestArgs(false, prompt)[1], prompt);
		assert.equal(adapters.gemini.requestArgs(false, prompt)[1], prompt);
		assert.equal(adapters.opencode.requestArgs(false, prompt)[1], prompt);
	});

	void it('parses direct JSON assistant content for every provider', () => {
		for (const adapter of Object.values(createCliProviderAdapters())) {
			assert.equal(adapter.parseOutput(JSON.stringify({ result: suggestion }), '', request)[0]?.kind, 'summary');
		}
	});

	void it('parses JSONL final assistant messages', () => {
		const output = [
			JSON.stringify({ type: 'thread.started', id: 'thread-1' }),
			JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: suggestion } }),
		].join('\n');
		const result = createCliProviderAdapters().codex.parseOutput(output, '', request);
		assert.equal(result[0]?.title, '摘要');
	});

	void it('parses a plain-text wrapper around the final JSON array', () => {
		const result = createCliProviderAdapters().opencode.parseOutput(`最终结果：\n${suggestion}\n完成。`, '', request);
		assert.equal(result[0]?.detail, '内容已整理。');
	});

	void it('requires invalid output to be reported as invalid_response', () => {
		assert.throws(
			() => createCliProviderAdapters().claude.parseOutput('{"result":"not suggestions"}', '', request),
			(error: unknown) => error instanceof Error && 'code' in error && error.code === 'invalid_response',
		);
	});

	void it('keeps root path validation in the final parser', () => {
		const unsafe = JSON.stringify([{ kind: 'change', title: '移动', detail: '越界', proposedPath: 'outside/note.md' }]);
		assert.throws(
			() => createCliProviderAdapters().gemini.parseOutput(JSON.stringify({ response: unsafe }), '', request),
			(error: unknown) => error instanceof Error && 'code' in error && error.code === 'invalid_response',
		);
	});

	void it('parses version text without exposing unrelated output', () => {
		const adapter = createCliProviderAdapters().codex;
		assert.equal(adapter.parseVersion('codex-cli 1.2.3\nextra diagnostics', ''), 'codex-cli 1.2.3');
		assert.deepEqual(adapter.versionArgs, ['--version']);
	});
});

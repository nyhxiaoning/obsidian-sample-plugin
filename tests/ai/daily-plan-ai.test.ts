import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AiClientError, type DailyPlanRequest } from '../../src/ai/openai-compatible-client';
import { buildDailyPlanPrompt } from '../../src/ai/daily-plan-prompt';
import { parseDailyPlanResponse } from '../../src/ai/daily-plan-response';
import { createCliProviderAdapters } from '../../src/ai/cli-provider-adapters';
import { LocalCliAiClient } from '../../src/ai/local-cli-client';
import type { LocalCliRunOptions, LocalCliRunResult } from '../../src/ai/local-cli-runner';

const request: DailyPlanRequest = {
	date: '2026-11-01',
	sources: [
		{ path: 'AI-Daily-Planner/01-规划规则.md', content: '# 规则\n每天完成重要任务。' },
		{ path: 'AI-Daily-Planner/02-参考任务池.md', content: '# 任务池\n- 写作' },
	],
	extraConstraints: '下午需要参加会议。',
};

const markdown = '# 2026-11-01 每日计划\n\n## 今日重点\n\n- 完成写作';

function createRunner(result: LocalCliRunResult) {
	const calls: LocalCliRunOptions[] = [];
	return {
		calls,
		runner: { run: async (options: LocalCliRunOptions) => { calls.push(options); return result; } },
	};
}

void describe('daily plan AI flow', () => {
	void it('builds a Markdown-only prompt with every source and no API key material', () => {
		const prompt = buildDailyPlanPrompt(request);
		assert.match(prompt.system, /Markdown/i);
		assert.match(prompt.system, /cannot execute, write, move, rename, or delete files/i);
		assert.match(prompt.user, /01-规划规则\.md/);
		assert.match(prompt.user, /下午需要参加会议/);
		assert.doesNotMatch(`${prompt.system}\n${prompt.user}`, /secret-api-key/);
	});

	void it('cleans optional fences while preserving Markdown and rejects empty output', () => {
		assert.equal(parseDailyPlanResponse(`\n\`\`\`markdown\n${markdown}\n\`\`\`\n`), markdown);
		assert.throws(() => parseDailyPlanResponse('```\n```'), (error: unknown) => error instanceof AiClientError && error.code === 'invalid_response');
	});

	void it('generates a daily plan through the local CLI text path', async () => {
		const context = createRunner({ stdout: JSON.stringify({ response: `\`\`\`markdown\n${markdown}\n\`\`\`` }), stderr: '', exitCode: 0, signal: null });
		const client = new LocalCliAiClient({ adapter: createCliProviderAdapters().gemini, executable: 'gemini', runner: context.runner });

		assert.equal(await client.generateDailyPlan(request), markdown);
		assert.equal(context.calls[0]?.args[0], '--prompt');
		assert.match(context.calls[0]?.args.join(' ') ?? '', /01-规划规则\.md/);
	});
});

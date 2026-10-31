import assert from 'node:assert/strict';
import { it } from 'node:test';
import { buildAiPrompt } from '../../src/ai/prompt-builder';
import type { AiRequest } from '../../src/ai/openai-compatible-client';
import { validateRuleDocument } from '../../src/rules/rule-document';
import { readFile } from 'node:fs/promises';

const document = await readFile(new URL('../fixtures/rules-valid.md', import.meta.url), 'utf8');
const parsed = validateRuleDocument(document);
if (!parsed.valid) throw new Error('Fixture must contain valid rules');

const request: AiRequest = {
	task: 'summarize',
	rules: parsed.rules,
	ruleGuidance: 'Prefer concise knowledge cards and preserve source attribution.',
	files: [{ path: '000ai知识库价值写作体系/Inbox/note.md', content: '# Note\nA thought.' }],
};

void it('builds a JSON-only prompt with rules, guidance, task, and selected files', () => {
	const prompt = buildAiPrompt(request);

	assert.match(prompt.system, /cannot execute, write, move, rename, or delete files/i);
	assert.match(prompt.system, /JSON array only/i);
	assert.match(prompt.user, /summarize/);
	assert.match(prompt.user, /Prefer concise knowledge cards/);
	assert.match(prompt.user, /Inbox\/note\.md/);
	assert.match(prompt.user, /schemaVersion/);
});

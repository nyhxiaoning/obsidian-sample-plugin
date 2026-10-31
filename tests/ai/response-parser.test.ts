import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseAiSuggestions } from '../../src/ai/response-parser';

const root = '000ai知识库价值写作体系';

void describe('parseAiSuggestions', () => {
	void it('parses a valid JSON array and creates confirmation-only change plans', () => {
		const result = parseAiSuggestions(JSON.stringify([
			{
				kind: 'classification',
				title: 'Architecture',
				detail: 'This is an architecture note.',
			},
			{
				kind: 'change',
				title: 'Move to architecture',
				detail: 'The note belongs in the architecture folder.',
				proposedPath: `${root}/架构/note.md`,
				relatedFiles: [`${root}/架构/index.md`],
			},
		]), { root });

		assert.equal(result.length, 2);
		assert.deepEqual(result[1]?.change, {
			kind: 'report',
			target: `${root}/架构/note.md`,
			reason: 'The note belongs in the architecture folder.',
			risk: 'medium',
			diff: `Proposed path: ${root}/架构/note.md`,
			requiresConfirmation: true,
		});
	});

	void it('accepts JSON wrapped in a markdown fence', () => {
		const result = parseAiSuggestions('```json\n[{"kind":"summary","title":"Summary","detail":"Done."}]\n```', { root });

		assert.deepEqual(result[0], {
			kind: 'summary',
			title: 'Summary',
			detail: 'Done.',
		});
	});

	void it('rejects malformed JSON and missing fields', () => {
		assert.throws(() => parseAiSuggestions('{not-json}', { root }), /invalid JSON/);
		assert.throws(() => parseAiSuggestions('[{"kind":"summary","title":"Only title"}]', { root }), /detail/);
		assert.throws(() => parseAiSuggestions('[{"kind":"unknown","title":"x","detail":"y"}]', { root }), /kind/);
	});

	void it('rejects absolute, traversal, and outside-root paths', () => {
		for (const proposedPath of ['/tmp/note.md', `${root}/../outside.md`, 'other-root/note.md']) {
			assert.throws(
				() => parseAiSuggestions(JSON.stringify([{ kind: 'change', title: 'Move', detail: 'Move it.', proposedPath }]), { root }),
				/outside the knowledge base/,
			);
		}
	});

	void it('rejects related files outside the knowledge base', () => {
		assert.throws(
			() => parseAiSuggestions(JSON.stringify([{
				kind: 'relation',
				title: 'Related',
				detail: 'Link these.',
				relatedFiles: ['outside.md'],
			}]), { root }),
			/outside the knowledge base/,
		);
	});
});

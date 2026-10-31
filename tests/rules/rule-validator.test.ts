import { deepStrictEqual, equal, ok } from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validateRuleDocument } from '../../src/rules/rule-document';
import { validateRules } from '../../src/rules/rule-validator';

const validDocument = await readFile(new URL('../fixtures/rules-valid.md', import.meta.url), 'utf8');

void test('accepts the valid fixture', () => {
	const result = validateRuleDocument(validDocument);
	ok(result.valid);
});

void test('reports unsupported schema, absolute root, and unsafe settings', () => {
	const result = validateRules({
		schemaVersion: 2,
		scope: { root: '/outside', include: [], exclude: [] },
		frontmatter: { enabled: true, required: [], allowedStatus: ['draft'] },
		checks: {},
		actions: { deleteFile: 'confirm' },
		ai: { tasks: ['summarize'], manualOnly: false },
		dailyBackfill: { enabled: true, dailyReview: 'automatic', weeklyReview: 'manual' },
	});

	ok(!result.valid);
	if (!result.valid) {
		const paths = result.errors.map((error) => error.path);
		ok(paths.includes('schemaVersion'));
		ok(paths.includes('scope.root'));
		ok(paths.includes('checks.fileName'));
		ok(paths.includes('actions.deleteFile'));
		ok(paths.includes('ai.manualOnly'));
		ok(paths.includes('dailyBackfill.dailyReview'));
	}
});

void test('reports missing required fields and invalid statuses', () => {
	const result = validateRules({
		schemaVersion: 1,
		scope: { root: 'knowledge', include: ['**/*.md'], exclude: [] },
		frontmatter: { enabled: true, required: ['title'], allowedStatus: [1] },
		checks: { fileName: true, directory: true, source: true, duplicateTopic: true, relatedLinks: true },
		actions: {
			patchFrontmatter: 'confirm', applyTemplate: 'confirm', moveFile: 'confirm',
			regenerateIndex: 'allowed', deleteFile: 'denied',
		},
		ai: { tasks: ['summarize'], manualOnly: true },
		dailyBackfill: { enabled: true, dailyReview: 'manual', weeklyReview: 'manual' },
	});

	ok(!result.valid);
	if (!result.valid) {
		equal(result.errors[0]?.path, 'frontmatter.allowedStatus');
	}
});

void test('keeps validation errors human-readable for malformed YAML', () => {
	const result = validateRuleDocument(validDocument.replace('schemaVersion: 1', 'schemaVersion: [1'));
	ok(!result.valid);
	if (!result.valid) {
		deepStrictEqual(result.errors[0]?.path, 'document.rules');
		ok(result.errors[0]?.message.startsWith('invalid YAML:'));
	}
});


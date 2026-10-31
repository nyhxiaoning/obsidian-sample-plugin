import { deepStrictEqual, equal, match, ok, throws } from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { extractRuleBlock, insertRuleBlock, replaceRuleBlock, validateRuleDocument } from '../../src/rules/rule-document';
import { createDefaultKnowledgeRules } from '../../src/rules/default-rules';

const validDocument = await readFile(new URL('../fixtures/rules-valid.md', import.meta.url), 'utf8');

void test('extracts the single marked YAML block and preserves its positions', () => {
	const block = extractRuleBlock(validDocument);

	ok(block);
	equal(block.start, validDocument.indexOf('<!-- KNOWLEDGE-RULES-BEGIN -->'));
	equal(validDocument.slice(block.end).startsWith('\n'), true);
	match(block.yaml, /schemaVersion: 1/);
});

void test('rejects missing, incomplete, and duplicate rule blocks', () => {
	equal(extractRuleBlock('plain prose'), null);
	equal(extractRuleBlock('<!-- KNOWLEDGE-RULES-BEGIN -->\n```yaml\nschemaVersion: 1\n```'), null);
	equal(extractRuleBlock(`${validDocument}\n${validDocument}`), null);
	const invalidFence = validDocument.replace('```yaml', '```json');
	equal(extractRuleBlock(invalidFence), null);
});

void test('replaces only the executable block and preserves surrounding prose', () => {
	const result = validateRuleDocument(validDocument);
	ok(result.valid);
	if (!result.valid) return;

	const replacement = replaceRuleBlock(validDocument, {
		...result.rules,
		scope: { ...result.rules.scope, root: 'another-root' },
	});
	equal(replacement.startsWith('# Knowledge base rules\n\n'), true);
	equal(replacement.endsWith('Keep the executable configuration synchronized with the guidance below.\n'), true);
	match(replacement, /root: another-root/);
	match(replacement, /<!-- KNOWLEDGE-RULES-END -->/);
	throws(() => replaceRuleBlock('no rule block', result.rules), /exactly one valid rule block/);
});

void test('parses a valid document into typed rules', () => {
	const result = validateRuleDocument(validDocument);
	ok(result.valid);
	if (result.valid) {
		equal(result.rules.schemaVersion, 1);
		deepStrictEqual(result.rules.actions.deleteFile, 'denied');
	}
});

void test('inserts default executable rules while preserving existing prose', () => {
	const prose = '# Existing rules\n\nKeep this guidance exactly as written.\n';
	const migrated = insertRuleBlock(prose, createDefaultKnowledgeRules());

	equal(migrated.startsWith(prose), true);
	match(migrated, /<!-- KNOWLEDGE-RULES-BEGIN -->/);
	match(migrated, /root: 000ai知识库价值写作体系/);
	const result = validateRuleDocument(migrated);
	ok(result.valid);
});

void test('does not insert a second block or alter malformed marker documents', () => {
	throws(() => insertRuleBlock(validDocument, createDefaultKnowledgeRules()), /already contains rule markers/);
	throws(() => insertRuleBlock('<!-- KNOWLEDGE-RULES-BEGIN -->\nExisting prose', createDefaultKnowledgeRules()), /already contains rule markers/);
});


import { deepStrictEqual, equal, ok, rejects } from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { RuleStore } from '../../src/rules/rule-store';
import type { KnowledgeRules } from '../../src/rules/rule-schema';

const validDocument = await readFile(new URL('../fixtures/rules-valid.md', import.meta.url), 'utf8');
const parsed = new RuleStore({ loadData: async () => null, saveData: async () => undefined }).validateDocument(validDocument);
if (!parsed.valid) throw new Error('valid fixture must parse');
const validRules: KnowledgeRules = parsed.rules;

function persistence(initial: unknown) {
	let data = initial;
	return {
		loadData: async () => data,
		saveData: async (next: unknown) => { data = next; },
		read: () => data,
	};
}

void test('has no effective configuration before a valid activation', async () => {
	const store = new RuleStore(persistence(null));
	equal(await store.loadEffectiveRules(), null);
});

void test('activates valid rules and persists the document hash', async () => {
	const storage = persistence({ unrelated: 'value' });
	const store = new RuleStore(storage);
	await store.activateValidRules(validRules, 'sha256:abc');

	const saved = storage.read() as { unrelated: string; ruleActivation: { documentHash: string; schemaVersion: number } };
	equal(saved.unrelated, 'value');
	equal(saved.ruleActivation.documentHash, 'sha256:abc');
	equal(saved.ruleActivation.schemaVersion, 1);
	deepStrictEqual(await store.loadEffectiveRules(), validRules);
});

void test('falls back to the previous valid configuration when a new document is invalid', async () => {
	const storage = persistence(null);
	const store = new RuleStore(storage);
	await store.activateValidRules(validRules, 'old-hash');

	const invalid = store.validateDocument(validDocument.replace('schemaVersion: 1', 'schemaVersion: 2'));
	ok(!invalid.valid);
	deepStrictEqual(await store.loadEffectiveRules(), validRules);
});

void test('does not activate invalid rules', async () => {
	const store = new RuleStore(persistence(null));
	await rejects(
		store.activateValidRules({ ...validRules, schemaVersion: 2 } as unknown as KnowledgeRules,
			'bad-hash'),
		/Cannot activate invalid rules/,
	);
});


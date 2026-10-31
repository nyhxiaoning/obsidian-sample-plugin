import { deepStrictEqual, equal, ok } from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { LocalCheckEngine } from '../../src/checks/local-check-engine';
import type { CheckContext } from '../../src/checks/local-check-engine';
import type { KnowledgeRules } from '../../src/rules/rule-schema';
import type { VaultLike } from '../../src/types';
import { RuleStore } from '../../src/rules/rule-store';

const validDocument = await readFile(new URL('../fixtures/rules-valid.md', import.meta.url), 'utf8');
const parsed = new RuleStore({ loadData: async () => null, saveData: async () => undefined }).validateDocument(validDocument);
if (!parsed.valid) throw new Error('valid fixture must parse');
const rules: KnowledgeRules = parsed.rules;

function context(files: Record<string, string>, overrides: Partial<KnowledgeRules> = {}): CheckContext {
	const vault: VaultLike = { read: async (path) => files[path] ?? '' };
	return {
		vault,
		rootPath: '000ai知识库价值写作体系',
		rules: { ...rules, ...overrides },
		filePaths: Object.keys(files),
	};
}

void test('reports an outside-root file and proposes a confirmed safe move', async () => {
	const results = await new LocalCheckEngine().check(context({ 'Inbox/note.md': '# Note' }));
	const result = results.find((item) => item.id === 'path.outside-root');
	ok(result);
	equal(result.severity, 'error');
	equal(result.change?.kind, 'move');
	equal(result.change?.target, '000ai知识库价值写作体系/note.md');
	ok(result.change?.target.startsWith('000ai知识库价值写作体系/'));
});

void test('reports missing required frontmatter as a confirmed patch', async () => {
	const results = await new LocalCheckEngine().check(context({
		'000ai知识库价值写作体系/notes/card.md': '---\ntitle: Card\nstatus: draft\n---\nBody',
	}));
	const result = results.find((item) => item.id === 'frontmatter.required');
	ok(result);
	equal(result.severity, 'error');
	equal(result.change?.kind, 'patch');
	ok(result.message.includes('created'));
	ok(result.message.includes('updated'));
});

void test('reports unsupported status and missing source metadata', async () => {
	const results = await new LocalCheckEngine().check(context({
		'000ai知识库价值写作体系/notes/card.md': '---\ntitle: Card\nstatus: unknown\ncreated: 2026-10-31\nupdated: 2026-10-31\n---\nBody',
	}));
	equal(results.find((item) => item.id === 'frontmatter.status')?.severity, 'error');
	equal(results.find((item) => item.id === 'source.missing')?.severity, 'warning');
	deepStrictEqual(results.find((item) => item.id === 'source.missing')?.change, undefined);
});

void test('reports malformed WikiLinks without proposing a file operation', async () => {
	const results = await new LocalCheckEngine().check(context({
		'000ai知识库价值写作体系/notes/card.md': '---\ntitle: Card\nstatus: draft\ncreated: 2026-10-31\nupdated: 2026-10-31\nsource: test\n---\nSee [[Broken and [[Good]].',
	}));
	const result = results.find((item) => item.id === 'links.malformed');
	ok(result);
	equal(result.severity, 'error');
	deepStrictEqual(result.change, undefined);
});

void test('keeps duplicate candidates informational and sorts results deterministically', async () => {
	const results = await new LocalCheckEngine().check(context({
		'000ai知识库价值写作体系/notes/card.md': '---\ntitle: Same Topic\nstatus: draft\ncreated: 2026-10-31\nupdated: 2026-10-31\nsource: test\n---\n# Same Topic',
		'000ai知识库价值写作体系/notes/same-topic.md': '---\ntitle: Other\nstatus: draft\ncreated: 2026-10-31\nupdated: 2026-10-31\nsource: test\n---\nBody',
	}));
	const candidate = results.find((item) => item.id === 'duplicate.candidate');
	ok(candidate);
	equal(candidate.severity, 'info');
	deepStrictEqual(candidate.change, undefined);
	ok(candidate.message.includes('heuristic'));
	const paths = results.map((item) => item.filePath);
	deepStrictEqual(paths, [...paths].sort());
});

void test('honors disabled check flags', async () => {
	const disabled: Partial<KnowledgeRules> = {
		checks: { ...rules.checks, source: false, relatedLinks: false, duplicateTopic: false },
	};
	const results = await new LocalCheckEngine().check(context({
		'000ai知识库价值写作体系/notes/card.md': '---\ntitle: Card\nstatus: draft\ncreated: 2026-10-31\nupdated: 2026-10-31\n---\n[[Broken',
	}, disabled));
	ok(!results.some((item) => item.id === 'source.missing' || item.id === 'links.malformed' || item.id === 'duplicate.candidate'));
});

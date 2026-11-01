import { deepEqual } from 'node:assert/strict';
import test from 'node:test';
import { selectMarkdownPaths } from '../../src/views/tabs/file-selection';

const files = [
	'000ai知识库价值写作体系/README.md',
	'000ai知识库价值写作体系/02-资产/知识卡片.md',
	'000ai知识库价值写作体系/02-资产/子目录/另一张卡片.md',
	'000ai知识库价值写作体系/03-资源/资料.md',
	'Inbox/想法.md',
];

void test('selects the active Markdown document within the safe root', () => {
	deepEqual(
		selectMarkdownPaths(files, '000ai知识库价值写作体系/02-资产/知识卡片.md', 'file', '000ai知识库价值写作体系'),
		{ paths: ['000ai知识库价值写作体系/02-资产/知识卡片.md'], reason: 'ready' },
	);
});

void test('selects all Markdown files recursively in the active folder', () => {
	deepEqual(
		selectMarkdownPaths(files, '000ai知识库价值写作体系/02-资产/知识卡片.md', 'folder', '000ai知识库价值写作体系'),
		{
			paths: [
				'000ai知识库价值写作体系/02-资产/知识卡片.md',
				'000ai知识库价值写作体系/02-资产/子目录/另一张卡片.md',
			],
			reason: 'ready',
		},
	);
});

void test('reports an active document outside the configured safe root', () => {
	deepEqual(
		selectMarkdownPaths(files, 'Inbox/想法.md', 'file', '000ai知识库价值写作体系'),
		{ paths: [], reason: 'outside-root' },
	);
});

void test('reports a missing active Markdown document', () => {
	deepEqual(selectMarkdownPaths(files, undefined, 'folder', '000ai知识库价值写作体系'), { paths: [], reason: 'no-active-document' });
});

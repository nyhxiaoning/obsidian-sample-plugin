import { deepStrictEqual, equal } from 'node:assert/strict';
import { test } from 'node:test';
import {
	DEFAULT_SETTINGS,
	clearLocalProviderTestState,
	normalizeSettings,
	type AiProviderKind,
	type KnowledgeBaseSettings,
} from '../../src/settings-model';
import { resolveDefaultCliPaths } from '../../src/ai/cli-path-resolver';

void test('backfills local provider settings for existing configuration', () => {
	const settings = normalizeSettings({
		apiBaseUrl: 'https://example.test/v1',
		model: 'existing-model',
		apiKey: 'existing-key',
	});

	equal(settings.aiProvider, 'custom');
	equal(settings.apiBaseUrl, 'https://example.test/v1');
	equal(settings.model, 'existing-model');
	equal(settings.apiKey, 'existing-key');
	deepStrictEqual(
		Object.fromEntries(
			Object.entries(settings.localCliProviders).map(([kind, provider]) => [kind, provider.executablePath]),
		),
		resolveDefaultCliPaths(),
	);
});

void test('changing a local executable clears its previous test state', () => {
	const provider = clearLocalProviderTestState({
		executablePath: '/custom/codex',
		status: 'tested',
		version: '1.2.3',
		lastTestedAt: 123,
		error: 'old error',
	});

	deepStrictEqual(provider, {
		executablePath: '/custom/codex',
		status: 'unknown',
		version: '',
		lastTestedAt: null,
		error: '',
	});
});

void test('local provider test state defaults to unknown without credential-like metadata', () => {
	const settings = normalizeSettings({});

	for (const kind of ['codex', 'claude', 'gemini', 'opencode'] as Exclude<AiProviderKind, 'custom'>[]) {
		const provider = settings.localCliProviders[kind];
		equal(provider.status, 'unknown');
		equal(provider.version, '');
		equal(provider.lastTestedAt, null);
		equal(provider.error, '');
	}
});

void test('default settings expose the custom provider and stable local defaults', () => {
	const settings: KnowledgeBaseSettings = normalizeSettings(DEFAULT_SETTINGS);

	equal(settings.aiProvider, 'custom');
	equal(settings.dailyPlannerRoot, '000ai知识库价值写作体系/AI-Daily-Planner');
	equal(settings.requestTimeoutMs, 60000);
	equal(settings.localCliProviders.codex.executablePath, resolveDefaultCliPaths().codex);
	equal(settings.localCliProviders.opencode.executablePath, resolveDefaultCliPaths().opencode);
});

void test('preserves a persisted custom daily planner root', () => {
	const settings = normalizeSettings({ dailyPlannerRoot: '个人计划/AI-Daily-Planner' });

	equal(settings.dailyPlannerRoot, '个人计划/AI-Daily-Planner');
});

void test('resolving a legacy bare command clears its stale failure state', () => {
	const settings = normalizeSettings({
		localCliProviders: {
			codex: { executablePath: 'codex', status: 'failed', version: '', lastTestedAt: null, error: 'old error' },
		} as KnowledgeBaseSettings['localCliProviders'],
	});

	equal(settings.localCliProviders.codex.executablePath, resolveDefaultCliPaths().codex);
	equal(settings.localCliProviders.codex.status, 'unknown');
	equal(settings.localCliProviders.codex.error, '');
});

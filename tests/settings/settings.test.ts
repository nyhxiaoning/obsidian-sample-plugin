import { deepStrictEqual, equal } from 'node:assert/strict';
import { test } from 'node:test';
import {
	DEFAULT_SETTINGS,
	normalizeSettings,
	type AiProviderKind,
	type KnowledgeBaseSettings,
} from '../../src/settings-model';

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
		{
			codex: 'codex',
			claude: 'claude',
			gemini: 'gemini',
			opencode: 'opencode',
		},
	);
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
	equal(settings.requestTimeoutMs, 60000);
	equal(settings.localCliProviders.codex.executablePath, 'codex');
	equal(settings.localCliProviders.opencode.executablePath, 'opencode');
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCliExecutable, resolveDefaultCliPaths } from '../../src/ai/cli-path-resolver';

void describe('CLI path resolver', () => {
	void it('resolves commands from PATH', () => {
		assert.equal(resolveCliExecutable('sh', { PATH: '/bin' }), '/bin/sh');
	});

	void it('resolves known Homebrew paths even when GUI PATH is incomplete', () => {
		const paths = resolveDefaultCliPaths({ PATH: '/usr/bin', HOME: '/Users/test' });
		assert.equal(paths.codex, '/opt/homebrew/bin/codex');
	});

	void it('preserves an explicit path or unresolved command', () => {
		assert.equal(resolveCliExecutable('/custom/codex', { PATH: '' }), '/custom/codex');
		assert.equal(resolveCliExecutable('missing-cli', { PATH: '' }), 'missing-cli');
	});
});

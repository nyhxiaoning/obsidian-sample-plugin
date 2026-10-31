import { deepStrictEqual, equal, match, rejects } from 'node:assert/strict';
import { test } from 'node:test';
import { ChangeApplier } from '../../src/changes/change-applier';
import { createChangePreview } from '../../src/changes/diff-preview';
import type { ChangePlan } from '../../src/changes/change-plan';
import type { VaultMutationLike } from '../../src/types';

class MemoryVault implements VaultMutationLike {
	files = new Map<string, string>();
	modified: string[] = [];
	renamed: string[] = [];

	async read(path: string): Promise<string> {
		const value = this.files.get(path);
		if (value === undefined) throw new Error(`Missing file: ${path}`);
		return value;
	}
	async exists(path: string): Promise<boolean> { return this.files.has(path); }
	async modify(path: string, data: string): Promise<void> {
		if (!this.files.has(path)) throw new Error(`Missing file: ${path}`);
		this.files.set(path, data);
		this.modified.push(path);
	}
	async rename(path: string, newPath: string): Promise<void> {
		if (!this.files.has(path)) throw new Error(`Missing file: ${path}`);
		if (this.files.has(newPath)) throw new Error(`Exists: ${newPath}`);
		const content = this.files.get(path) as string;
		this.files.delete(path);
		this.files.set(newPath, content);
		this.renamed.push(`${path}->${newPath}`);
	}
}

const patchPlan = (overrides: Partial<ChangePlan> = {}): ChangePlan => ({
	kind: 'patch', target: 'kb/note.md', reason: 'Add metadata', risk: 'low', requiresConfirmation: true, ...overrides,
});

void test('creates and applies a patch preview using the snapshot hash', async () => {
	const vault = new MemoryVault();
	vault.files.set('kb/note.md', 'before');
	const preview = await createChangePreview(patchPlan(), { vault, after: 'after', ruleVersion: 1 });
	equal(preview.before, 'before');
	equal(preview.after, 'after');
	match(preview.plan.diff ?? '', /-before/);
	match(preview.plan.diff ?? '', /\+after/);
	const results = await new ChangeApplier(vault).apply([preview]);
	const result = results[0];
	if (!result) throw new Error('expected one apply result');
	equal(result.status, 'applied');
	equal(await vault.read('kb/note.md'), 'after');
});

void test('creates and applies a move preview with source and target', async () => {
	const vault = new MemoryVault();
	vault.files.set('Inbox/note.md', 'content');
	const preview = await createChangePreview({
		kind: 'move', target: 'kb/note.md', reason: 'Move into root', risk: 'medium', requiresConfirmation: true,
	}, { vault, sourcePath: 'Inbox/note.md' });
	equal(preview.sourcePath, 'Inbox/note.md');
	equal(preview.targetPath, 'kb/note.md');
	const results = await new ChangeApplier(vault).apply([preview]);
	const result = results[0];
	if (!result) throw new Error('expected one apply result');
	equal(result.status, 'applied');
	deepStrictEqual(vault.renamed, ['Inbox/note.md->kb/note.md']);
});

void test('rejects denied actions and unsafe Vault paths', async () => {
	const vault = new MemoryVault();
	vault.files.set('kb/note.md', 'content');
	const denied = await createChangePreview(patchPlan({ action: 'deleteFile' }), { vault, after: 'new' });
	const deniedResults = await new ChangeApplier(vault).apply([denied]);
	const deniedResult = deniedResults[0];
	if (!deniedResult) throw new Error('expected one apply result');
	equal(deniedResult.status, 'skipped');
	await rejects(() => createChangePreview(patchPlan({ target: '../outside.md' }), { vault, after: 'new' }), /outside the Vault/);
});

void test('blocks move conflicts and stale content without modifying the Vault', async () => {
	const vault = new MemoryVault();
	vault.files.set('Inbox/note.md', 'original');
	vault.files.set('kb/note.md', 'existing');
	const conflictPreview = await createChangePreview({
		kind: 'move', target: 'kb/note.md', reason: 'Move', risk: 'medium', requiresConfirmation: true,
	}, { vault, sourcePath: 'Inbox/note.md' });
	const conflictResults = await new ChangeApplier(vault).apply([conflictPreview]);
	const conflict = conflictResults[0];
	if (!conflict) throw new Error('expected one apply result');
	equal(conflict.status, 'failed');
	const stalePreview = await createChangePreview(patchPlan(), { vault, after: 'new' });
	vault.files.set('kb/note.md', 'changed');
	const staleResults = await new ChangeApplier(vault).apply([stalePreview]);
	const stale = staleResults[0];
	if (!stale) throw new Error('expected one apply result');
	equal(stale.status, 'skipped');
	deepStrictEqual(vault.modified, []);
});

void test('reports partial failures and keeps successful changes', async () => {
	const vault = new MemoryVault();
	vault.files.set('kb/one.md', 'one');
	vault.files.set('kb/two.md', 'two');
	const first = await createChangePreview(patchPlan({ target: 'kb/one.md' }), { vault, after: 'ONE' });
	const second = await createChangePreview(patchPlan({ target: 'kb/two.md' }), { vault, after: 'TWO' });
	vault.files.delete('kb/two.md');
	const results = await new ChangeApplier(vault).apply([first, second]);
	deepStrictEqual(results.map((result) => result.status), ['applied', 'failed']);
	equal(await vault.read('kb/one.md'), 'ONE');
});

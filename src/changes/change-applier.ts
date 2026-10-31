import type { ChangeAction, ChangePlan } from './change-plan';
import type { ChangePreview } from './diff-preview';
import { assertVaultPath, hashSnapshot } from './diff-preview';
import type { VaultMutationLike } from '../types';

export interface ApplyResult {
	target: string;
	status: 'applied' | 'skipped' | 'failed';
	message: string;
}

export type ActionPolicy = Partial<Record<ChangeAction, 'confirm' | 'allowed' | 'denied'>>;

export interface ChangeApplierOptions {
	actionPolicy?: ActionPolicy;
}

function defaultAction(plan: ChangePlan): ChangeAction | undefined {
	if (plan.action) return plan.action;
	if (plan.kind === 'patch') return 'patchFrontmatter';
	if (plan.kind === 'move') return 'moveFile';
	if (plan.kind === 'index') return 'regenerateIndex';
	return undefined;
}

function isDenied(plan: ChangePlan, policy: ActionPolicy): boolean {
	const action = defaultAction(plan);
	return plan.kind === 'report' || action === 'deleteFile' || policy[action ?? 'deleteFile'] === 'denied';
}

export class ChangeApplier {
	constructor(private readonly vault: VaultMutationLike, private readonly options: ChangeApplierOptions = {}) {}

	async apply(previews: readonly ChangePreview[]): Promise<ApplyResult[]> {
		const results: ApplyResult[] = [];
		for (const preview of previews) {
			results.push(await this.applyOne(preview));
		}
		return results;
	}

	private async applyOne(preview: ChangePreview): Promise<ApplyResult> {
		const { plan } = preview;
		const resultTarget = preview.targetPath ?? preview.sourcePath ?? plan.target;
		try {
			if (isDenied(plan, this.options.actionPolicy ?? {})) {
				return { target: resultTarget, status: 'skipped', message: 'Action is denied by the active rules.' };
			}
			if (plan.kind !== 'patch' && plan.kind !== 'move') {
				return { target: resultTarget, status: 'skipped', message: 'This change type has no Vault mutation handler.' };
			}
			const sourcePath = assertVaultPath(preview.sourcePath ?? plan.target);
			const current = await this.vault.read(sourcePath);
			if (hashSnapshot(current) !== preview.beforeHash) {
				return { target: resultTarget, status: 'skipped', message: 'Preview is stale; the source file changed after analysis.' };
			}

			if (plan.kind === 'patch') {
				if (preview.after === undefined) return { target: resultTarget, status: 'failed', message: 'Patch preview has no replacement content.' };
				await this.vault.modify(sourcePath, preview.after);
				return { target: sourcePath, status: 'applied', message: 'Patch applied.' };
			}

			const targetPath = assertVaultPath(preview.targetPath ?? plan.target);
			if (await this.targetExists(targetPath)) {
				return { target: targetPath, status: 'failed', message: 'Move target already exists; no file was changed.' };
			}
			await this.vault.rename(sourcePath, targetPath);
			return { target: targetPath, status: 'applied', message: `Moved ${sourcePath} to ${targetPath}.` };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { target: resultTarget, status: 'failed', message };
		}
	}

	private async targetExists(path: string): Promise<boolean> {
		if (this.vault.exists) return this.vault.exists(path);
		try {
			await this.vault.read(path);
			return true;
		} catch {
			return false;
		}
	}
}


import type { ChangePlan } from './change-plan';
import type { VaultLike } from '../types';

export interface ChangePreview {
	plan: ChangePlan;
	before?: string;
	after?: string;
	sourcePath?: string;
	targetPath?: string;
	beforeHash: string;
	ruleVersion?: number;
}

export interface PreviewOptions {
	vault: VaultLike;
	sourcePath?: string;
	after?: string;
	ruleVersion?: number;
}

const normalizePath = (path: string): string => path.replaceAll('\\', '/');

/** Vault paths are relative paths; reject traversal and absolute paths before touching the Vault. */
export function assertVaultPath(path: string): string {
	const normalized = normalizePath(path).replace(/^\.\//, '');
	if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
		throw new Error(`Path is outside the Vault: ${path}`);
	}
	const segments = normalized.split('/');
	if (segments.some((segment) => segment === '..' || segment === '')) {
		throw new Error(`Path is outside the Vault: ${path}`);
	}
	return normalized;
}

/** Stable content hash used to prevent applying a preview to content that changed meanwhile. */
export function hashSnapshot(content: string): string {
	let hash = 2166136261;
	for (let index = 0; index < content.length; index += 1) {
		hash ^= content.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

function makeDiff(before: string, after: string): string {
	if (before === after) return 'No content changes.';
	const beforeLines = before.split(/\r?\n/);
	const afterLines = after.split(/\r?\n/);
	const lines = [`@@ -1,${beforeLines.length} +1,${afterLines.length} @@`];
	for (const line of beforeLines) lines.push(`-${line}`);
	for (const line of afterLines) lines.push(`+${line}`);
	return lines.join('\n');
}

function actionForPlan(plan: ChangePlan): ChangePlan {
	if (plan.action) return plan;
	if (plan.kind === 'patch') return { ...plan, action: 'patchFrontmatter' };
	if (plan.kind === 'move') return { ...plan, action: 'moveFile' };
	if (plan.kind === 'index') return { ...plan, action: 'regenerateIndex' };
	return plan;
}

/** Build an immutable preview from the current Vault snapshot. */
export async function createChangePreview(planInput: ChangePlan, options: PreviewOptions): Promise<ChangePreview> {
	const plan = actionForPlan(planInput);
	if (plan.kind === 'report' || plan.kind === 'index') {
		return {
			plan,
			beforeHash: hashSnapshot(''),
			ruleVersion: options.ruleVersion,
		};
	}

	const sourcePath = assertVaultPath(options.sourcePath ?? plan.target);
	const before = await options.vault.read(sourcePath);
	if (plan.kind === 'patch') {
		const after = options.after ?? plan.afterContent;
		if (after === undefined) throw new Error(`Patch preview requires replacement content for ${sourcePath}`);
		const previewPlan = { ...plan, diff: makeDiff(before, after) };
		return { plan: previewPlan, before, after, sourcePath, beforeHash: hashSnapshot(before), ruleVersion: options.ruleVersion };
	}

	const targetPath = assertVaultPath(plan.target);
	if (sourcePath === targetPath) throw new Error('Move source and target must be different paths.');
	const previewPlan = { ...plan, diff: `Move ${sourcePath} → ${targetPath}` };
	return { plan: previewPlan, before, sourcePath, targetPath, beforeHash: hashSnapshot(before), ruleVersion: options.ruleVersion };
}

export { makeDiff };

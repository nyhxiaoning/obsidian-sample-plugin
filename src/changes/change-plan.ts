export type ChangeKind = 'patch' | 'move' | 'index' | 'report';
export type ChangeRisk = 'low' | 'medium' | 'high';
export type ChangeAction = 'patchFrontmatter' | 'applyTemplate' | 'moveFile' | 'regenerateIndex' | 'deleteFile';

export interface ChangePlan {
	kind: ChangeKind;
	target: string;
	reason: string;
	risk: ChangeRisk;
	diff?: string;
	requiresConfirmation: boolean;
	/** Optional fields used to bind a plan to a specific preview snapshot. */
	action?: ChangeAction;
	afterContent?: string;
}

export type CheckSeverity = 'info' | 'warning' | 'error';

export interface CheckResult {
	id: string;
	severity: CheckSeverity;
	message: string;
	filePath: string;
	change?: ChangePlan;
}

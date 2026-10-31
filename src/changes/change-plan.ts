export type ChangeKind = 'patch' | 'move' | 'index' | 'report';
export type ChangeRisk = 'low' | 'medium' | 'high';

export interface ChangePlan {
	kind: ChangeKind;
	target: string;
	reason: string;
	risk: ChangeRisk;
	diff?: string;
	requiresConfirmation: boolean;
}

export type CheckSeverity = 'info' | 'warning' | 'error';

export interface CheckResult {
	id: string;
	severity: CheckSeverity;
	message: string;
	filePath: string;
	change?: ChangePlan;
}

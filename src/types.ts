/** Metadata persisted for the most recently activated executable rule set. */
export interface RuleActivationState {
	rules: unknown;
	documentHash: string;
	schemaVersion: number;
	activatedAt: string;
}

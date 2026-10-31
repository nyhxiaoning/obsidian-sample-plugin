/** Metadata persisted for the most recently activated executable rule set. */
import type { KnowledgeRules } from './rules/rule-schema';

/** Minimal read-only Vault surface used by deterministic checks. */
export interface VaultLike {
	read(path: string): Promise<string>;
	exists?(path: string): Promise<boolean>;
	modify?(path: string, data: string): Promise<void>;
	rename?(path: string, newPath: string): Promise<void>;
}

/** Vault surface required by confirmed change application. */
export interface VaultMutationLike extends VaultLike {
	modify(path: string, data: string): Promise<void>;
	rename(path: string, newPath: string): Promise<void>;
}

export interface RuleActivationState {
	rules: KnowledgeRules;
	documentHash: string;
	schemaVersion: number;
	activatedAt: string;
}

export type OperationStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface OperationRecord {
	id: string;
	startedAt: number;
	finishedAt?: number;
	kind: string;
	scope: string;
	ruleVersion: number;
	status: OperationStatus;
	message: string;
}

export type IndexMode = 'check' | 'generate';

export interface IndexResult {
	mode: IndexMode;
	status: 'consistent' | 'stale' | 'generated' | 'failed';
	stdout: string;
	stderr: string;
	exitCode: number | null;
}

export interface IndexRunner {
	run(mode: IndexMode): Promise<IndexResult>;
}

export type AiTask =
	| 'classify'
	| 'summarize'
	| 'suggestRelations'
	| 'suggestChanges'
	| 'dailyBackfill'
	| 'weeklyReview';

export interface AiRequest {
	task: AiTask;
	rules: KnowledgeRules;
	ruleGuidance: string;
	files: Array<{ path: string; content: string }>;
}


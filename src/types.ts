/** Metadata persisted for the most recently activated executable rule set. */
import type { KnowledgeRules } from './rules/rule-schema';

/** Minimal read-only Vault surface used by deterministic checks. */
export interface VaultLike {
	read(path: string): Promise<string>;
}

export interface RuleActivationState {
	rules: KnowledgeRules;
	documentHash: string;
	schemaVersion: number;
	activatedAt: string;
}

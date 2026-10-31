/** Metadata persisted for the most recently activated executable rule set. */
import type { KnowledgeRules } from './rules/rule-schema';

export interface RuleActivationState {
	rules: KnowledgeRules;
	documentHash: string;
	schemaVersion: number;
	activatedAt: string;
}

import { OperationRecord, RuleActivationState } from '../types';
import type { KnowledgeRules } from './rule-schema';
import { validateRules } from './rule-validator';
import type { RuleValidationError } from './rule-validator';
import { validateRuleDocument } from './rule-document';

export interface RuleStorePersistence {
	loadData(): Promise<unknown>;
	saveData(data: unknown): Promise<void>;
}

export type DocumentValidationResult =
	| { valid: true; rules: KnowledgeRules }
	| { valid: false; errors: RuleValidationError[] };

export class RuleStore {
	constructor(private readonly persistence: RuleStorePersistence) {}

	async loadEffectiveRules(): Promise<KnowledgeRules | null> {
		const state = await this.loadEffectiveRuleState();
		return state?.rules ?? null;
	}

	async loadEffectiveRuleState(): Promise<RuleActivationState | null> {
		const data = await this.persistence.loadData();
		if (data === null || typeof data !== 'object' || !('ruleActivation' in data)) return null;

		const state = data.ruleActivation;
		if (state === null || typeof state !== 'object' || !('rules' in state)) return null;
		const result = validateRules(state.rules);
		return result.valid ? state as RuleActivationState : null;
	}

	validateDocument(markdown: string): DocumentValidationResult {
		const result = validateRuleDocument(markdown);
		return result.valid ? { valid: true, rules: result.rules } : result;
	}

	async activateValidRules(rules: KnowledgeRules, documentHash: string): Promise<void> {
		const result = validateRules(rules);
		if (!result.valid) {
			throw new Error(`Cannot activate invalid rules: ${result.errors.map((error) => `${error.path}: ${error.message}`).join('; ')}`);
		}

		const current = await this.persistence.loadData();
		const data: Record<string, unknown> = current !== null && typeof current === 'object' ? { ...current } : {};
		const activation: RuleActivationState = {
			rules: result.rules,
			documentHash,
			schemaVersion: result.rules.schemaVersion,
			activatedAt: new Date().toISOString(),
		};
		await this.persistence.saveData({ ...data, ruleActivation: activation });
	}

	async recordOperation(record: OperationRecord): Promise<void> {
		const current = await this.persistence.loadData();
		const data: Record<string, unknown> = current !== null && typeof current === 'object' ? { ...current } : {};
		const operations: unknown[] = Array.isArray(data.operations) ? data.operations as unknown[] : [];
		const metadata: OperationRecord = {
			id: record.id,
			startedAt: record.startedAt,
			...(record.finishedAt === undefined ? {} : { finishedAt: record.finishedAt }),
			kind: record.kind,
			scope: record.scope,
			ruleVersion: record.ruleVersion,
			status: record.status,
			message: record.message,
		};
		await this.persistence.saveData({ ...data, operations: [...operations, metadata].slice(-50) });
	}
}

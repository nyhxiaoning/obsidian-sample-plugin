import { RuleActivationState } from '../types';
import { KnowledgeRules, RuleValidationError, validateRules } from './rule-schema';
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
		const data = await this.persistence.loadData();
		if (data === null || typeof data !== 'object' || !('ruleActivation' in data)) return null;

		const state = data.ruleActivation;
		if (state === null || typeof state !== 'object' || !('rules' in state)) return null;
		const result = validateRules(state.rules);
		return result.valid ? result.rules : null;
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
		const data = current !== null && typeof current === 'object' ? { ...current } : {};
		const activation: RuleActivationState = {
			rules: result.rules,
			documentHash,
			schemaVersion: result.rules.schemaVersion,
			activatedAt: new Date().toISOString(),
		};
		await this.persistence.saveData({ ...data, ruleActivation: activation });
	}
}

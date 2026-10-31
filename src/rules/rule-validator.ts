import type { KnowledgeRules } from './rule-schema';

export interface RuleValidationError {
	path: string;
	message: string;
}

export type RuleValidationResult =
	| { valid: true; rules: KnowledgeRules }
	| { valid: false; errors: RuleValidationError[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
	Object.prototype.hasOwnProperty.call(value, key);

const errorsForRecord = (
	value: unknown,
	path: string,
	fields: Record<string, (field: unknown) => RuleValidationError[]>,
): RuleValidationError[] => {
	if (!isRecord(value)) {
		return [{ path, message: 'must be an object' }];
	}

	return Object.entries(fields).flatMap(([key, validate]) => {
		const fieldPath = path ? `${path}.${key}` : key;
		if (!hasOwn(value, key)) {
			return [{ path: fieldPath, message: 'is required' }];
		}
		return validate(value[key]).map((error) => ({
			...error,
			path: error.path ? `${fieldPath}.${error.path}` : fieldPath,
		}));
	});
};

const booleanValue = (value: unknown): RuleValidationError[] =>
	typeof value === 'boolean' ? [] : [{ path: '', message: 'must be a boolean' }];

const stringArray = (value: unknown): RuleValidationError[] =>
	Array.isArray(value) && value.every((item) => typeof item === 'string')
		? []
		: [{ path: '', message: 'must be an array of strings' }];

const oneOf = (allowed: readonly string[]) => (value: unknown): RuleValidationError[] =>
	allowed.includes(value as string)
		? []
		: [{ path: '', message: `must be one of: ${allowed.join(', ')}` }];

const isRelativeVaultPath = (value: unknown): boolean => {
	if (typeof value !== 'string' || value.length === 0) return false;
	if (value.startsWith('/') || value.startsWith('\\')) return false;
	if (/^[A-Za-z]:[\\/]/.test(value)) return false;
	return !value.split(/[\\/]/).includes('..');
};

export function validateRules(value: unknown): RuleValidationResult {
	const errors: RuleValidationError[] = [];

	if (!isRecord(value)) {
		return { valid: false, errors: [{ path: '', message: 'rules must be an object' }] };
	}

	if (value.schemaVersion !== 1) {
		errors.push({ path: 'schemaVersion', message: 'must be the supported value 1' });
	}

	errors.push(
		...errorsForRecord(value.scope, 'scope', {
			root: (field) => isRelativeVaultPath(field)
				? []
				: [{ path: '', message: 'must be a non-empty relative Vault path' }],
			include: stringArray,
			exclude: stringArray,
		}),
		...errorsForRecord(value.frontmatter, 'frontmatter', {
			enabled: booleanValue,
			required: stringArray,
			allowedStatus: stringArray,
		}),
		...errorsForRecord(value.checks, 'checks', {
			fileName: booleanValue,
			directory: booleanValue,
			source: booleanValue,
			duplicateTopic: booleanValue,
			relatedLinks: booleanValue,
		}),
		...errorsForRecord(value.actions, 'actions', {
			patchFrontmatter: oneOf(['confirm', 'denied']),
			applyTemplate: oneOf(['confirm', 'denied']),
			moveFile: oneOf(['confirm', 'denied']),
			regenerateIndex: oneOf(['allowed', 'denied']),
			deleteFile: (field) => field === 'denied' ? [] : [{ path: '', message: 'must always be denied' }],
		}),
		...errorsForRecord(value.ai, 'ai', {
			tasks: stringArray,
			manualOnly: (field) => field === true ? [] : [{ path: '', message: 'must be true' }],
		}),
		...errorsForRecord(value.dailyBackfill, 'dailyBackfill', {
			enabled: booleanValue,
			dailyReview: oneOf(['manual']),
			weeklyReview: oneOf(['manual']),
		}),
	);

	return errors.length > 0
		? { valid: false, errors }
		: { valid: true, rules: value as unknown as KnowledgeRules };
}

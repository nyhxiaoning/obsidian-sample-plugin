import { parse, stringify } from 'yaml';
import { KnowledgeRules, RuleValidationError, RuleValidationResult, validateRules } from './rule-schema';

const BEGIN_MARKER = '<!-- KNOWLEDGE-RULES-BEGIN -->';
const END_MARKER = '<!-- KNOWLEDGE-RULES-END -->';

export interface RuleBlock {
	yaml: string;
	start: number;
	end: number;
}

export interface RuleDocumentValidation {
	valid: true;
	rules: KnowledgeRules;
	block: RuleBlock;
}

export interface InvalidRuleDocument {
	valid: false;
	errors: RuleValidationError[];
}

const lineEnd = (markdown: string, start: number): number => {
	const newline = markdown.indexOf('\n', start);
	return newline === -1 ? markdown.length : newline;
};

export function extractRuleBlock(markdown: string): RuleBlock | null {
	const markerPattern = /^<!-- KNOWLEDGE-RULES-(?:BEGIN|END) -->$/gm;
	const markers = [...markdown.matchAll(markerPattern)];
	const begins = markers.filter((match) => match[0] === BEGIN_MARKER);
	const ends = markers.filter((match) => match[0] === END_MARKER);
	if (begins.length !== 1 || ends.length !== 1 || begins[0] === undefined || ends[0] === undefined) {
		return null;
	}

	const beginPosition = begins[0].index;
	const endPosition = ends[0].index;
	if (beginPosition === undefined || endPosition <= beginPosition) return null;

	const beginLineEnd = lineEnd(markdown, beginPosition);
	const endLineEnd = lineEnd(markdown, endPosition);
	const body = markdown.slice(beginLineEnd + (markdown[beginLineEnd] === '\n' ? 1 : 0), endPosition);
	const fenced = body.match(/^```ya?ml\r?\n([\s\S]*?)\r?\n```\r?\n?$/);
	if (fenced === null || fenced[1] === undefined) return null;

	return { yaml: fenced[1], start: beginPosition, end: endLineEnd };
}

export function replaceRuleBlock(markdown: string, rules: KnowledgeRules): string {
	const block = extractRuleBlock(markdown);
	if (block === null) {
		throw new Error('Cannot replace rules: the document must contain exactly one valid rule block');
	}

	const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
	const replacement = [
		BEGIN_MARKER,
		'```yaml',
		stringify(rules).trimEnd().replace(/\r?\n/g, newline),
		'```',
		END_MARKER,
	].join(newline);
	return `${markdown.slice(0, block.start)}${replacement}${markdown.slice(block.end)}`;
}

export function validateRuleDocument(markdown: string): RuleDocumentValidation | InvalidRuleDocument {
	const block = extractRuleBlock(markdown);
	if (block === null) {
		return {
			valid: false,
			errors: [{ path: 'document', message: 'must contain exactly one valid marked YAML rule block' }],
		};
	}

	let parsed: unknown;
	try {
		parsed = parse(block.yaml);
	} catch (error) {
		return {
			valid: false,
			errors: [{ path: 'document.rules', message: `invalid YAML: ${error instanceof Error ? error.message : String(error)}` }],
		};
	}

	const result: RuleValidationResult = validateRules(parsed);
	return result.valid ? { valid: true, rules: result.rules, block } : result;
}

export { BEGIN_MARKER, END_MARKER };

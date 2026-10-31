import { buildAiPrompt } from './prompt-builder';
import { AiClientError, type AiRequest } from './openai-compatible-client';
import { parseAiSuggestions, type AiSuggestion } from './response-parser';

export interface CliProviderAdapter {
	readonly versionArgs: string[];
	readonly promptTransport: 'stdin' | 'argv';
	requestArgs(test: boolean, prompt?: string): string[];
	buildPrompt(request: AiRequest, test?: boolean): string;
	parseOutput(stdout: string, stderr: string, request: AiRequest): AiSuggestion[];
	parseVersion(stdout: string, stderr: string): string;
}

export type CliProviderAdapters = Record<'codex' | 'claude' | 'gemini' | 'opencode', CliProviderAdapter>;

const TEST_PROMPT = 'Return exactly [] and no other text. Do not use tools or access files.';

function invalidResponse(): AiClientError {
	return new AiClientError('invalid_response', 'AI CLI returned an invalid assistant response');
}

function jsonValue(text: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
}

function candidateStrings(value: unknown): string[] {
	if (typeof value === 'string') return [value];
	if (Array.isArray(value)) return value.flatMap(candidateStrings);
	if (typeof value !== 'object' || value === null) return [];
	const record = value as Record<string, unknown>;
	const preferred = ['text', 'content', 'result', 'response', 'message', 'output'];
	const preferredValues = preferred.flatMap((key) => record[key] === undefined ? [] : candidateStrings(record[key]));
	const otherValues = Object.entries(record)
		.filter(([key]) => !preferred.includes(key))
		.flatMap(([, item]) => candidateStrings(item));
	return [...preferredValues, ...otherValues];
}

function embeddedArray(text: string): string | undefined {
	const start = text.indexOf('[');
	if (start < 0) return undefined;
	let depth = 0;
	let quoted = false;
	let escaped = false;
	for (let index = start; index < text.length; index += 1) {
		const character = text[index];
		if (quoted) {
			if (escaped) escaped = false;
			else if (character === '\\') escaped = true;
			else if (character === '"') quoted = false;
			continue;
		}
		if (character === '"') quoted = true;
		else if (character === '[') depth += 1;
		else if (character === ']' && --depth === 0) return text.slice(start, index + 1);
	}
	return undefined;
}

function parseAssistantText(text: string, root: string): AiSuggestion[] {
	const candidates = [text, embeddedArray(text)].filter((candidate): candidate is string => candidate !== undefined);
	for (const candidate of candidates) {
		try {
			return parseAiSuggestions(candidate, { root });
		} catch {
			// Try the next wrapper shape, then expose one normalized error.
		}
	}
	throw invalidResponse();
}

function extractSuggestions(stdout: string, stderr: string, root: string): AiSuggestion[] {
	const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	const values = [jsonValue(stdout), ...lines.map(jsonValue).filter((value) => value !== undefined)];
	const candidates = [...values.flatMap(candidateStrings), stdout, stderr];
	for (const candidate of candidates.reverse()) {
		try {
			return parseAssistantText(candidate, root);
		} catch {
			// Continue searching for the final assistant message.
		}
	}
	throw invalidResponse();
}

function parseVersion(stdout: string, stderr: string): string {
	const firstLine = `${stdout}\n${stderr}`.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
	if (!firstLine) throw new AiClientError('invalid_response', 'AI CLI did not return a version');
	return firstLine.slice(0, 200);
}

function createAdapter(versionArgs: string[], promptTransport: 'stdin' | 'argv', requestArgs: string[]): CliProviderAdapter {
	return {
		versionArgs,
		promptTransport,
		requestArgs: (_test, prompt) => {
			if (promptTransport === 'stdin' || prompt === undefined) return [...requestArgs];
			if (requestArgs[0] === '-p' || requestArgs[0] === '--prompt') return [requestArgs[0], prompt, ...requestArgs.slice(1)];
			return [...requestArgs, prompt];
		},
		buildPrompt: (request, test = false) => test ? TEST_PROMPT : (() => {
			const prompt = buildAiPrompt(request);
			return `${prompt.system}\n\n${prompt.user}`;
		})(),
		parseOutput: (stdout, stderr, request) => extractSuggestions(stdout, stderr, request.rules.scope.root),
		parseVersion,
	};
}

export function createCliProviderAdapters(): CliProviderAdapters {
	return {
		codex: createAdapter(['--version'], 'stdin', ['exec', '--json', '--skip-git-repo-check']),
		claude: createAdapter(['--version'], 'argv', ['-p', '--output-format', 'json']),
		gemini: createAdapter(['--version'], 'argv', ['--prompt', '--output-format', 'json']),
		opencode: createAdapter(['--version'], 'argv', ['run']),
	};
}

export function buildTestRequest(root: string): AiRequest {
	return {
		task: 'summarize',
		rules: {
			schemaVersion: 1,
			scope: { root, include: ['**/*.md'], exclude: [] },
			frontmatter: { enabled: false, required: [], allowedStatus: [] },
			checks: { fileName: true, directory: true, source: true, duplicateTopic: true, relatedLinks: true },
			actions: { patchFrontmatter: 'confirm', applyTemplate: 'confirm', moveFile: 'confirm', regenerateIndex: 'allowed', deleteFile: 'denied' },
			ai: { tasks: ['summarize'], manualOnly: true },
			dailyBackfill: { enabled: false, dailyReview: 'manual', weeklyReview: 'manual' },
		},
			ruleGuidance: '',
		files: [],
	};
}

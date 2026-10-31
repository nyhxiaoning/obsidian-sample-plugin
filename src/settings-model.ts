import { resolveDefaultCliPaths } from './ai/cli-path-resolver';

export type AiProviderKind = 'custom' | 'codex' | 'claude' | 'gemini' | 'opencode';

export type LocalCliProviderStatus = 'unknown' | 'available' | 'tested' | 'failed';

export interface LocalCliProviderSettings {
	executablePath: string;
	status: LocalCliProviderStatus;
	version: string;
	lastTestedAt: number | null;
	error: string;
}

export interface KnowledgeBaseSettings {
	knowledgeBaseRoot: string;
	rulesPath: string;
	indexScriptPath: string;
	pythonPath: string;
	aiProvider: AiProviderKind;
	localCliProviders: Record<Exclude<AiProviderKind, 'custom'>, LocalCliProviderSettings>;
	apiBaseUrl: string;
	model: string;
	apiKey: string;
	requestTimeoutMs: number;
}

export const DEFAULT_SETTINGS: KnowledgeBaseSettings = {
	knowledgeBaseRoot: '000ai知识库价值写作体系',
	rulesPath: '000ai知识库价值写作体系/系统/知识库规则.md',
	indexScriptPath: '000ai知识库价值写作体系/系统/generate-index.py',
	pythonPath: '/usr/bin/python3',
	aiProvider: 'custom',
	localCliProviders: {
		codex: createLocalCliProvider(resolveDefaultCliPaths().codex),
		claude: createLocalCliProvider(resolveDefaultCliPaths().claude),
		gemini: createLocalCliProvider(resolveDefaultCliPaths().gemini),
		opencode: createLocalCliProvider(resolveDefaultCliPaths().opencode),
	},
	apiBaseUrl: '',
	model: '',
	apiKey: '',
	requestTimeoutMs: 60000,
};

export function normalizeSettings(data: Partial<KnowledgeBaseSettings> | null | undefined): KnowledgeBaseSettings {
	const partialProviders = data?.localCliProviders;
	const defaults = resolveDefaultCliPaths();
	return {
		...DEFAULT_SETTINGS,
		...data,
		localCliProviders: {
			codex: mergeLocalCliProvider('codex', partialProviders?.codex, defaults.codex),
			claude: mergeLocalCliProvider('claude', partialProviders?.claude, defaults.claude),
			gemini: mergeLocalCliProvider('gemini', partialProviders?.gemini, defaults.gemini),
			opencode: mergeLocalCliProvider('opencode', partialProviders?.opencode, defaults.opencode),
		},
	};
}

export function clearLocalProviderTestState(provider: LocalCliProviderSettings): LocalCliProviderSettings {
	return {
		...provider,
		status: 'unknown',
		version: '',
		lastTestedAt: null,
		error: '',
	};
}

function createLocalCliProvider(executablePath: string): LocalCliProviderSettings {
	return {
		executablePath,
		status: 'unknown',
		version: '',
		lastTestedAt: null,
		error: '',
	};
}

function mergeLocalCliProvider(
	kind: Exclude<AiProviderKind, 'custom'>,
	provider: Partial<LocalCliProviderSettings> | undefined,
	defaultPath: string = kind,
): LocalCliProviderSettings {
	const resolvedPath = !provider?.executablePath || provider.executablePath === kind ? defaultPath : provider.executablePath;
	const pathChanged = provider?.executablePath !== undefined && provider.executablePath !== resolvedPath;
	return {
		...createLocalCliProvider(defaultPath),
		...provider,
		executablePath: resolvedPath,
		...(pathChanged ? { status: 'unknown' as const, version: '', lastTestedAt: null, error: '' } : {}),
	};
}

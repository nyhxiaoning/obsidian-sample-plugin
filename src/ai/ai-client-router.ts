import { createCliProviderAdapters, type CliProviderAdapters } from './cli-provider-adapters';
import { LocalCliAiClient, type LocalCliRunnerLike } from './local-cli-client';
import { LocalCliRunner, type LocalCliSpawn } from './local-cli-runner';
import { AiClientError, OpenAICompatibleClient, type AiClient, type AiRequest } from './openai-compatible-client';
import type { AiSuggestion } from './response-parser';
import type { AiProviderKind, KnowledgeBaseSettings } from '../settings-model';

type LocalProviderKind = Exclude<AiProviderKind, 'custom'>;

export interface AiClientRouterOptions {
	getSettings: () => KnowledgeBaseSettings;
	cwd?: string;
	spawn?: LocalCliSpawn;
	runner?: LocalCliRunnerLike;
	runnerFactory?: (kind: LocalProviderKind, settings: KnowledgeBaseSettings) => LocalCliRunnerLike;
	adapters?: CliProviderAdapters;
	customClientFactory?: (settings: KnowledgeBaseSettings) => AiClient;
	localClientFactory?: (kind: LocalProviderKind, settings: KnowledgeBaseSettings, adapter: CliProviderAdapters[LocalProviderKind], runner: LocalCliRunnerLike) => AiClient;
}

export class AiClientRouter implements AiClient {
	private readonly adapters: CliProviderAdapters;

	constructor(private readonly options: AiClientRouterOptions) {
		this.adapters = options.adapters ?? createCliProviderAdapters();
	}

	async analyze(request: AiRequest, signal?: AbortSignal): Promise<AiSuggestion[]> {
		const settings = this.options.getSettings();
		if (settings.aiProvider === 'custom') {
			return (this.options.customClientFactory?.(settings) ?? new OpenAICompatibleClient({
				baseUrl: settings.apiBaseUrl,
				model: settings.model,
				apiKey: settings.apiKey,
				timeoutMs: settings.requestTimeoutMs,
			})).analyze(request, signal);
		}

		const kind = settings.aiProvider;
		const provider = settings.localCliProviders[kind];
		if (provider.status !== 'tested') {
			throw new AiClientError('configuration', '请先测试当前本机 AI 服务商，再开始分析');
		}
		const adapter = this.adapters[kind];
		const runner = this.options.runner
			?? this.options.runnerFactory?.(kind, settings)
			?? new LocalCliRunner({ spawn: this.options.spawn, timeoutMs: settings.requestTimeoutMs });
		const client = this.options.localClientFactory?.(kind, settings, adapter, runner)
			?? new LocalCliAiClient({ adapter, executable: provider.executablePath, cwd: this.options.cwd, timeoutMs: settings.requestTimeoutMs, runner });
		return client.analyze(request, signal);
	}
}

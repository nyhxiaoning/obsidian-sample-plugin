import { buildTestRequest, type CliProviderAdapter } from './cli-provider-adapters';
import { LocalCliRunner, LocalCliRunnerError, type LocalCliRunOptions, type LocalCliRunResult } from './local-cli-runner';
import { AiClientError, type AiClient, type AiRequest } from './openai-compatible-client';
import type { AiSuggestion } from './response-parser';

export interface LocalCliRunnerLike {
	run(options: LocalCliRunOptions): Promise<LocalCliRunResult>;
}

export interface LocalCliAiClientOptions {
	adapter: CliProviderAdapter;
	executable: string;
	cwd?: string;
	root?: string;
	timeoutMs?: number;
	runner?: LocalCliRunnerLike;
}

export interface LocalCliTestResult {
	version: string;
	suggestions: AiSuggestion[];
}

function safeError(code: AiClientError['code'], message: string): AiClientError {
	return new AiClientError(code, message);
}

function mapRunnerError(error: unknown): AiClientError {
	if (error instanceof AiClientError) return error;
	const kind = error instanceof LocalCliRunnerError || (typeof error === 'object' && error !== null && 'kind' in error)
		? (error as { kind?: string }).kind
		: undefined;
	if (kind !== undefined) {
		switch (kind) {
			case 'not_found': return safeError('configuration', 'AI CLI executable was not found');
			case 'timeout': return safeError('timeout', 'AI CLI request timed out');
			case 'cancelled': return safeError('network', 'AI CLI request was cancelled');
			case 'configuration': return safeError('configuration', 'AI CLI configuration is invalid');
			case 'process_error':
			case 'output_limit':
			default: return safeError('provider', 'AI CLI process failed');
		}
	}
	return safeError('provider', 'AI CLI process failed');
}

function assertSuccessful(result: LocalCliRunResult): void {
	if (result.exitCode !== 0) throw safeError('provider', 'AI CLI returned a nonzero exit status');
}

export class LocalCliAiClient implements AiClient {
	private readonly runner: LocalCliRunnerLike;

	constructor(private readonly options: LocalCliAiClientOptions) {
		this.runner = options.runner ?? new LocalCliRunner({ timeoutMs: options.timeoutMs });
	}

	async detect(signal?: AbortSignal): Promise<string> {
		try {
			const result = await this.runner.run({
				executable: this.options.executable,
				args: [...this.options.adapter.versionArgs],
				cwd: this.options.cwd,
				timeoutMs: this.options.timeoutMs,
				signal,
			});
			assertSuccessful(result);
			try {
				return this.options.adapter.parseVersion(result.stdout, result.stderr);
			} catch {
				throw safeError('invalid_response', 'AI CLI returned an invalid version');
			}
		} catch (error) {
			throw mapRunnerError(error);
		}
	}

	async testConnection(signal?: AbortSignal): Promise<LocalCliTestResult> {
		const version = await this.detect(signal);
		const request = buildTestRequest(this.options.root ?? '');
		const prompt = this.options.adapter.buildPrompt(request, true);
		try {
			const result = await this.runPrompt(true, prompt, signal);
			assertSuccessful(result);
			return { version, suggestions: this.parse(result, request) };
		} catch (error) {
			throw mapRunnerError(error);
		}
	}

	async analyze(request: AiRequest, signal?: AbortSignal): Promise<AiSuggestion[]> {
		const prompt = this.options.adapter.buildPrompt(request);
		try {
			const result = await this.runPrompt(false, prompt, signal);
			assertSuccessful(result);
			return this.parse(result, request);
		} catch (error) {
			throw mapRunnerError(error);
		}
	}

	private async runPrompt(test: boolean, prompt: string, signal?: AbortSignal): Promise<LocalCliRunResult> {
		const useArgv = this.options.adapter.promptTransport === 'argv';
		return this.runner.run({
			executable: this.options.executable,
			args: this.options.adapter.requestArgs(test, useArgv ? prompt : undefined),
			cwd: this.options.cwd,
			stdin: useArgv ? undefined : prompt,
			timeoutMs: this.options.timeoutMs,
			signal,
		});
	}

	private parse(result: LocalCliRunResult, request: AiRequest): AiSuggestion[] {
		try {
			return this.options.adapter.parseOutput(result.stdout, result.stderr, request);
		} catch (error) {
			if (error instanceof AiClientError && error.code === 'invalid_response') throw error;
			throw safeError('invalid_response', 'AI CLI returned an invalid assistant response');
		}
	}
}

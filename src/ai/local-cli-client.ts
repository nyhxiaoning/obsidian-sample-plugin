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

function sanitizeDiagnostic(value: string): string {
	return value
		.replace(/[\r\n]+/g, ' ')
		.replace(/(api[_ -]?key|token|secret)\s*[:=]\s*\S+/gi, '$1=[已隐藏]')
		.slice(0, 240);
}

function mapRunnerError(error: unknown, stage: '检测' | '测试请求' | '分析'): AiClientError {
	if (error instanceof AiClientError) return error;
	const kind = error instanceof LocalCliRunnerError || (typeof error === 'object' && error !== null && 'kind' in error)
		? (error as { kind?: string }).kind
		: undefined;
	const diagnostic = error instanceof LocalCliRunnerError && error.diagnostic ? `：${sanitizeDiagnostic(error.diagnostic)}` : '';
	if (kind !== undefined) {
		switch (kind) {
			case 'not_found': return safeError('configuration', `${stage}失败：找不到可执行文件${diagnostic}`);
			case 'timeout': return safeError('timeout', `${stage}超时`);
			case 'cancelled': return safeError('network', `${stage}已取消`);
			case 'configuration': return safeError('configuration', `${stage}配置无效${diagnostic}`);
			case 'process_error':
				return safeError('provider', `${stage}无法启动${diagnostic}`);
			case 'output_limit': return safeError('provider', `${stage}输出超过限制`);
			default: return safeError('provider', `${stage}进程失败${diagnostic}`);
		}
	}
	return safeError('provider', `${stage}进程失败${error instanceof Error ? `：${sanitizeDiagnostic(error.message)}` : ''}`);
}

function assertSuccessful(result: LocalCliRunResult, stage: '检测' | '测试请求' | '分析'): void {
	if (result.exitCode !== 0) {
		const diagnostic = sanitizeDiagnostic(result.stderr || `exitCode=${String(result.exitCode)}`);
		if (/log in|login|authenticate|authentication|api key|unauthorized|未登录|认证/i.test(diagnostic)) {
			throw safeError('unauthorized', `${stage}需要登录或有效的 API Key：${diagnostic}`);
		}
		throw safeError('provider', `${stage}失败（退出码 ${String(result.exitCode)}）：${diagnostic}`);
	}
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
			assertSuccessful(result, '检测');
			try {
				return this.options.adapter.parseVersion(result.stdout, result.stderr);
			} catch {
				throw safeError('invalid_response', 'AI CLI returned an invalid version');
			}
		} catch (error) {
			throw mapRunnerError(error, '检测');
		}
	}

	async testConnection(signal?: AbortSignal): Promise<LocalCliTestResult> {
		const version = await this.detect(signal);
		const request = buildTestRequest(this.options.root ?? '');
		const prompt = this.options.adapter.buildPrompt(request, true);
		try {
			const result = await this.runPrompt(true, prompt, signal);
			assertSuccessful(result, '测试请求');
			return { version, suggestions: this.parse(result, request) };
		} catch (error) {
			throw mapRunnerError(error, '测试请求');
		}
	}

	async analyze(request: AiRequest, signal?: AbortSignal): Promise<AiSuggestion[]> {
		const prompt = this.options.adapter.buildPrompt(request);
		try {
			const result = await this.runPrompt(false, prompt, signal);
			assertSuccessful(result, '分析');
			return this.parse(result, request);
		} catch (error) {
			throw mapRunnerError(error, '分析');
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

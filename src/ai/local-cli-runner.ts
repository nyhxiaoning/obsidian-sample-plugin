import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';

export interface LocalCliChild {
	stdout: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown };
	stderr: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown };
	stdin: { write(input: string): boolean; end(): void };
	on(event: 'close', listener: (exitCode: number | null, signal: NodeJS.Signals | null) => void): unknown;
	on(event: 'error', listener: (error: Error & { code?: string }) => void): unknown;
	kill(signal?: NodeJS.Signals): boolean;
}

export type LocalCliSpawn = (executable: string, args: string[], options: SpawnOptions) => LocalCliChild;

export interface LocalCliRunnerOptions {
	spawn?: LocalCliSpawn;
	timeoutMs?: number;
	maxOutputBytes?: number;
}

export interface LocalCliRunOptions {
	executable: string;
	args: string[];
	cwd?: string;
	stdin?: string;
	timeoutMs?: number;
	maxOutputBytes?: number;
	signal?: AbortSignal;
}

export interface LocalCliRunResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
	signal: NodeJS.Signals | null;
}

export type LocalCliErrorKind = 'not_found' | 'process_error' | 'timeout' | 'cancelled' | 'output_limit' | 'configuration';

export class LocalCliRunnerError extends Error {
	readonly kind: LocalCliErrorKind;

	constructor(kind: LocalCliErrorKind, message: string) {
		super(message);
		this.name = 'LocalCliRunnerError';
		this.kind = kind;
	}
}

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

export class LocalCliRunner {
	private readonly spawn: LocalCliSpawn;
	private readonly timeoutMs: number;
	private readonly maxOutputBytes: number;

	constructor(options: LocalCliRunnerOptions = {}) {
		this.spawn = options.spawn ?? ((executable, args, spawnOptions) => nodeSpawn(executable, args, spawnOptions) as LocalCliChild);
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
		if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
			throw new LocalCliRunnerError('configuration', 'CLI timeout must be positive');
		}
		if (!Number.isFinite(this.maxOutputBytes) || this.maxOutputBytes <= 0) {
			throw new LocalCliRunnerError('configuration', 'CLI output limit must be positive');
		}
	}

	run(options: LocalCliRunOptions): Promise<LocalCliRunResult> {
		const timeoutMs = options.timeoutMs ?? this.timeoutMs;
		const maxOutputBytes = options.maxOutputBytes ?? this.maxOutputBytes;
		if (!options.executable || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(maxOutputBytes) || maxOutputBytes <= 0) {
			return Promise.reject(new LocalCliRunnerError('configuration', 'Invalid CLI runner options'));
		}
		if (options.signal?.aborted) {
			return Promise.reject(new LocalCliRunnerError('cancelled', 'CLI process was cancelled'));
		}

		return new Promise<LocalCliRunResult>((resolve, reject) => {
			let child: LocalCliChild;
			try {
				child = this.spawn(options.executable, [...options.args], {
					cwd: options.cwd,
					shell: false,
					stdio: 'pipe',
				});
			} catch (error: unknown) {
				reject(this.toSpawnError(error));
				return;
			}

			let stdout = '';
			let stderr = '';
			let outputBytes = 0;
			let settled = false;
			let timer: ReturnType<typeof setTimeout> | undefined;

			const finishWithError = (error: LocalCliRunnerError): void => {
				if (settled) return;
				settled = true;
				if (timer !== undefined) clearTimeout(timer);
				child.kill();
				reject(error);
			};
			const append = (target: 'stdout' | 'stderr', chunk: Buffer | string): void => {
				if (settled) return;
				const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
				outputBytes += buffer.byteLength;
				if (outputBytes > maxOutputBytes) {
					finishWithError(new LocalCliRunnerError('output_limit', 'CLI output exceeded the configured limit'));
					return;
				}
				if (target === 'stdout') stdout += buffer.toString('utf8');
				else stderr += buffer.toString('utf8');
			};

			child.stdout.on('data', (chunk) => append('stdout', chunk));
			child.stderr.on('data', (chunk) => append('stderr', chunk));
			child.on('error', (error) => finishWithError(this.toProcessError(error)));
			child.on('close', (exitCode, signal) => {
				if (settled) return;
				settled = true;
				if (timer !== undefined) clearTimeout(timer);
				resolve({ stdout, stderr, exitCode, signal });
			});

			const cancel = (): void => finishWithError(new LocalCliRunnerError('cancelled', 'CLI process was cancelled'));
			options.signal?.addEventListener('abort', cancel, { once: true });
			timer = setTimeout(() => finishWithError(new LocalCliRunnerError('timeout', 'CLI process timed out')), timeoutMs);
			try {
				if (options.stdin !== undefined) child.stdin.write(options.stdin);
				child.stdin.end();
			} catch {
				finishWithError(new LocalCliRunnerError('process_error', 'CLI process failed while receiving input'));
			}
		});
	}

	private toSpawnError(error: unknown): LocalCliRunnerError {
		const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
		return code === 'ENOENT'
			? new LocalCliRunnerError('not_found', 'CLI executable was not found')
			: new LocalCliRunnerError('process_error', 'CLI process could not be started');
	}

	private toProcessError(_error: Error): LocalCliRunnerError {
		return new LocalCliRunnerError('process_error', 'CLI process reported an error');
	}
}

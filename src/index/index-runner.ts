import { spawn as nodeSpawn } from 'node:child_process';
import path from 'node:path';
import type { IndexMode, IndexResult, IndexRunner } from '../types';

export interface ProcessStream {
	on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
}

export interface SpawnedProcess {
	stdout?: ProcessStream | null;
	stderr?: ProcessStream | null;
	once(event: 'error', listener: (error: Error) => void): unknown;
	once(event: 'close', listener: (code: number | null) => void): unknown;
	kill(signal?: NodeJS.Signals | number): boolean;
}

export type SpawnLike = (
	command: string,
	args: string[],
	options: { cwd: string; stdio: 'pipe' },
) => SpawnedProcess;

export interface IndexRunnerOptions {
	vaultRoot: string;
	scriptPath: string;
	pythonPath: string;
	timeoutMs?: number;
	spawn?: SpawnLike;
	isDesktop?: boolean;
}

const defaultSpawn: SpawnLike = (command, args, options) =>
	nodeSpawn(command, args, options);

export class IndexRunnerImpl implements IndexRunner {
	private readonly timeoutMs: number;
	private readonly spawn: SpawnLike;
	private readonly isDesktop: boolean;

	constructor(private readonly options: IndexRunnerOptions) {
		this.timeoutMs = options.timeoutMs ?? 60000;
		this.spawn = options.spawn ?? defaultSpawn;
		this.isDesktop = options.isDesktop ?? detectDesktopPlatform();
	}

	async run(mode: IndexMode): Promise<IndexResult> {
		const baseResult = (status: IndexResult['status'], stdout = '', stderr = '', exitCode: number | null = null): IndexResult => ({
			mode,
			status,
			stdout,
			stderr,
			exitCode,
		});

		if (!this.isDesktop) {
			return baseResult('failed', '', 'Index scripts require the desktop platform.', null);
		}

		const script = resolveVaultScript(this.options.vaultRoot, this.options.scriptPath);
		if (!script.ok) {
			return baseResult('failed', '', script.error, null);
		}
		if (!this.options.pythonPath.trim()) {
			return baseResult('failed', '', 'Python executable is not configured.', null);
		}

		const args = [script.path];
		if (mode === 'check') args.push('--check');

		let child: SpawnedProcess;
		try {
			child = this.spawn(this.options.pythonPath, args, { cwd: this.options.vaultRoot, stdio: 'pipe' });
		} catch (error) {
			return baseResult('failed', '', errorMessage(error), null);
		}

		return new Promise<IndexResult>((resolve) => {
			let stdout = '';
			let stderr = '';
			let settled = false;
			const timerHost = typeof window === 'undefined' ? globalThis : window;
			const timer = timerHost.setTimeout(() => {
				if (settled) return;
				settled = true;
				child.kill('SIGTERM');
				resolve(baseResult('failed', stdout, `${stderr}${stderr ? '\n' : ''}Index script timed out after ${this.timeoutMs} ms.`, null));
			}, this.timeoutMs);

			child.stdout?.on('data', (chunk) => {
				stdout += chunk.toString();
			});
			child.stderr?.on('data', (chunk) => {
				stderr += chunk.toString();
			});
			child.once('error', (error) => {
				if (settled) return;
				settled = true;
				timerHost.clearTimeout(timer);
				resolve(baseResult('failed', stdout, `${stderr}${stderr ? '\n' : ''}${errorMessage(error)}`, null));
			});
			child.once('close', (exitCode) => {
				if (settled) return;
				settled = true;
				timerHost.clearTimeout(timer);
				if (exitCode !== 0) {
					resolve(baseResult('failed', stdout, stderr, exitCode));
					return;
				}
				const status = mode === 'generate'
					? 'generated'
					: stdout.includes('索引已过期') ? 'stale' : 'consistent';
				resolve(baseResult(status, stdout, stderr, exitCode));
			});
		});
	}
}

function resolveVaultScript(vaultRoot: string, configuredPath: string): { ok: true; path: string } | { ok: false; error: string } {
		if (!path.isAbsolute(vaultRoot)) return { ok: false, error: 'Vault root must be an absolute path.' };
		if (path.isAbsolute(configuredPath)) return { ok: false, error: 'Index script path must be relative to the Vault.' };
		const root = path.resolve(vaultRoot);
		const script = path.resolve(root, configuredPath);
		const relative = path.relative(root, script);
		if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
			return { ok: false, error: 'Index script is outside the Vault.' };
		}
		return { ok: true, path: script };
}

function detectDesktopPlatform(): boolean {
	return typeof process !== 'undefined' && process.versions.electron !== undefined;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

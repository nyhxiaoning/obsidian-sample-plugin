import { EventEmitter } from 'node:events';
import type { SpawnOptions } from 'node:child_process';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	LocalCliRunner,
	type LocalCliRunnerOptions,
	type LocalCliChild,
} from '../../src/ai/local-cli-runner';

class FakeStream extends EventEmitter {
	write(chunk: string | Buffer): void {
		this.emit('data', Buffer.from(chunk));
	}
}

class FakeChild extends EventEmitter implements LocalCliChild {
	stdout = new FakeStream();
	stderr = new FakeStream();
	killed = false;
	stdin = {
		write: (chunk: string) => {
			this.receivedStdin += chunk;
			return true;
		},
		end: () => {
			this.stdinEnded = true;
		},
	};
	receivedStdin = '';
	stdinEnded = false;

	kill(): boolean {
		this.killed = true;
		return true;
	}
}

function createRunner(
	configure?: (child: FakeChild, command: string, args: string[], options: SpawnOptions) => void,
	options?: Partial<LocalCliRunnerOptions>,
) {
	let child: FakeChild | undefined;
	let call: { command: string; args: string[]; options: SpawnOptions } | undefined;
	const runner = new LocalCliRunner({
		spawn: (command, args, spawnOptions) => {
			child = new FakeChild();
			call = { command, args, options: spawnOptions };
			configure?.(child, command, args, spawnOptions);
			return child;
		},
		...options,
	});
	return { runner, get child() { return child; }, get call() { return call; } };
}

function createTrackedSignal() {
	let listener: (() => void) | undefined;
	let added = 0;
	let removed = 0;
	const signal = {
		aborted: false,
		addEventListener: (_type: string, callback: () => void) => {
			listener = callback;
			added += 1;
		},
		removeEventListener: (_type: string, callback: () => void) => {
			if (listener === callback) listener = undefined;
			removed += 1;
		},
		abort: () => listener?.(),
	};
	return { signal: signal as unknown as AbortSignal, abort: signal.abort, get added() { return added; }, get removed() { return removed; } };
}

void describe('LocalCliRunner', () => {
	void it('spawns without a shell, passes args literally, and writes stdin', async () => {
		const context = createRunner((created) => {
			queueMicrotask(() => created.emit('close', 0, null));
		});

		const result = await context.runner.run({
			executable: 'codex', args: ['--prompt', '$(touch hacked)', '--flag=value'], stdin: 'hello', cwd: '/vault',
		});

		assert.equal(context.call?.command, 'codex');
		assert.deepEqual(context.call?.args, ['--prompt', '$(touch hacked)', '--flag=value']);
		assert.equal(context.call?.options.shell, false);
		assert.match(String(context.call?.options.env?.PATH), /\/opt\/homebrew\/bin/);
		assert.equal(context.call?.options.cwd, '/vault');
		assert.equal(context.child?.receivedStdin, 'hello');
		assert.equal(context.child?.stdinEnded, true);
		assert.deepEqual(result, { stdout: '', stderr: '', exitCode: 0, signal: null });
	});

	void it('collects stdout and stderr', async () => {
		const { runner } = createRunner((child) => {
			queueMicrotask(() => {
				child.stdout.write('answer');
				child.stderr.write('warning');
				child.emit('close', 0, null);
			});
		});

		assert.deepEqual(await runner.run({ executable: 'tool', args: [] }), {
			stdout: 'answer', stderr: 'warning', exitCode: 0, signal: null,
		});
	});

	void it('fails safely when total output exceeds the configured limit', async () => {
		const context = createRunner((created) => {
			queueMicrotask(() => created.stdout.write('123456'));
		}, { maxOutputBytes: 5 });

		await assert.rejects(context.runner.run({ executable: 'tool', args: [], stdin: 'secret-api-key' }), (error: unknown) => {
			assert.match(String(error), /output.*limit/i);
			assert.doesNotMatch(String(error), /secret-api-key/);
			return true;
		});
		assert.equal(context.child?.killed, true);
	});

	void it('kills and reports a timeout without exposing stdin or output', async () => {
		const context = createRunner(() => undefined, { timeoutMs: 5 });

		await assert.rejects(context.runner.run({ executable: 'tool', args: [], stdin: 'api-key-secret' }), (error: unknown) => {
			assert.match(String(error), /timed out/i);
			assert.doesNotMatch(String(error), /api-key-secret/);
			return true;
		});
		assert.equal(context.child?.killed, true);
	});

	void it('kills and reports caller cancellation', async () => {
		const controller = new AbortController();
		const context = createRunner(() => undefined);
		const promise = context.runner.run({ executable: 'tool', args: [], signal: controller.signal });
		controller.abort();

		await assert.rejects(promise, /cancel/i);
		assert.equal(context.child?.killed, true);
	});

	void it('maps missing executables to a safe typed error', async () => {
		const runner = new LocalCliRunner({
			spawn: () => {
				throw Object.assign(new Error('spawn ENOENT: /secret/path'), { code: 'ENOENT' });
			},
		});

		await assert.rejects(runner.run({ executable: '/secret/path', args: [], stdin: 'secret-api-key' }), (error: unknown) => {
			assert.match(String(error), /not found/i);
			assert.doesNotMatch(String(error), /secret-api-key|secret\/path/);
			return true;
		});
	});

	void it('returns nonzero exit information without leaking output', async () => {
		const { runner } = createRunner((child) => {
			queueMicrotask(() => child.emit('close', 3, null));
		});

		assert.deepEqual(await runner.run({ executable: 'tool', args: [] }), {
			stdout: '', stderr: '', exitCode: 3, signal: null,
		});
	});

	void it('reports child process errors', async () => {
		const { runner } = createRunner((child) => {
			queueMicrotask(() => child.emit('error', new Error('connection secret-api-key failed')));
		});

		await assert.rejects(runner.run({ executable: 'tool', args: [], stdin: 'secret-api-key' }), (error: unknown) => {
			assert.match(String(error), /process.*error/i);
			assert.doesNotMatch(String(error), /secret-api-key|connection/);
			return true;
		});
	});

	void it('removes the abort listener on every terminal path', async () => {
		const successSignal = createTrackedSignal();
		const success = createRunner((child) => queueMicrotask(() => child.emit('close', 0, null)));
		await success.runner.run({ executable: 'tool', args: [], signal: successSignal.signal });
		assert.deepEqual({ added: successSignal.added, removed: successSignal.removed }, { added: 1, removed: 1 });

		const timeoutSignal = createTrackedSignal();
		const timeout = createRunner(() => undefined, { timeoutMs: 5 });
		await assert.rejects(timeout.runner.run({ executable: 'tool', args: [], signal: timeoutSignal.signal }));
		assert.deepEqual({ added: timeoutSignal.added, removed: timeoutSignal.removed }, { added: 1, removed: 1 });

		const outputSignal = createTrackedSignal();
		const output = createRunner((child) => queueMicrotask(() => child.stdout.write('12')), { maxOutputBytes: 1 });
		await assert.rejects(output.runner.run({ executable: 'tool', args: [], signal: outputSignal.signal }));
		assert.deepEqual({ added: outputSignal.added, removed: outputSignal.removed }, { added: 1, removed: 1 });

		const errorSignal = createTrackedSignal();
		const processError = createRunner((child) => queueMicrotask(() => child.emit('error', new Error('failed'))));
		await assert.rejects(processError.runner.run({ executable: 'tool', args: [], signal: errorSignal.signal }));
		assert.deepEqual({ added: errorSignal.added, removed: errorSignal.removed }, { added: 1, removed: 1 });

		const cancelSignal = createTrackedSignal();
		const cancelled = createRunner(() => undefined);
		const cancelledRun = cancelled.runner.run({ executable: 'tool', args: [], signal: cancelSignal.signal });
		cancelSignal.abort();
		await assert.rejects(cancelledRun, /cancel/i);
		assert.deepEqual({ added: cancelSignal.added, removed: cancelSignal.removed }, { added: 1, removed: 1 });
	});
});

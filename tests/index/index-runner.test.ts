import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IndexRunnerImpl, type SpawnLike } from '../../src/index/index-runner';

class FakeStream extends EventEmitter {
	write(chunk: string): void {
		this.emit('data', Buffer.from(chunk));
	}
}

class FakeChild extends EventEmitter {
	stdout = new FakeStream();
	stderr = new FakeStream();
	killed = false;

	kill(): boolean {
		this.killed = true;
		return true;
	}
}

function createRunner(
	configure?: (child: FakeChild, args: string[], options: { cwd: string }) => void,
	options?: Partial<ConstructorParameters<typeof IndexRunnerImpl>[0]>,
) {
	const calls: { command: string; args: string[]; options: { cwd: string } }[] = [];
	const spawn: SpawnLike = (command, args, spawnOptions) => {
		const child = new FakeChild();
		calls.push({ command, args, options: { cwd: spawnOptions.cwd } });
		configure?.(child, args, { cwd: spawnOptions.cwd });
		return child;
	};
	const runner = new IndexRunnerImpl({
		vaultRoot: '/vault',
		scriptPath: '000ai知识库价值写作体系/系统/generate-index.py',
		pythonPath: '/usr/bin/python3',
		timeoutMs: 100,
		spawn,
		isDesktop: true,
		...options,
	});
	return { runner, calls };
}

void describe('IndexRunner', () => {
	void it('runs check mode with a vault-root cwd and --check argument', async () => {
		const { runner, calls } = createRunner((child) => {
			queueMicrotask(() => {
				child.stdout.write('索引一致');
				child.emit('close', 0);
			});
		});

		const result = await runner.run('check');

		assert.deepEqual(calls, [{
			command: '/usr/bin/python3',
			args: ['/vault/000ai知识库价值写作体系/系统/generate-index.py', '--check'],
			options: { cwd: '/vault' },
		}]);
		assert.deepEqual({ mode: result.mode, status: result.status, exitCode: result.exitCode }, {
			mode: 'check', status: 'consistent', exitCode: 0,
		});
	});

	void it('maps an expired index response to stale', async () => {
		const { runner } = createRunner((child) => {
			queueMicrotask(() => {
				child.stdout.write('索引已过期');
				child.emit('close', 0);
			});
		});

		assert.deepEqual(await runner.run('check'), {
			mode: 'check', status: 'stale', stdout: '索引已过期', stderr: '', exitCode: 0,
		});
	});

	void it('generates the index without --check and reports generated', async () => {
		const { runner, calls } = createRunner((child) => queueMicrotask(() => child.emit('close', 0)));

		const result = await runner.run('generate');

		assert.deepEqual(calls[0]?.args, ['/vault/000ai知识库价值写作体系/系统/generate-index.py']);
		assert.deepEqual({ mode: result.mode, status: result.status, exitCode: result.exitCode }, {
			mode: 'generate', status: 'generated', exitCode: 0,
		});
	});

	void it('returns failed for a nonzero exit and preserves output', async () => {
		const { runner } = createRunner((child) => {
			queueMicrotask(() => {
				child.stderr.write('permission denied');
				child.emit('close', 2);
			});
		});

		assert.deepEqual(await runner.run('check'), {
			mode: 'check',
			status: 'failed',
			exitCode: 2,
			stderr: 'permission denied',
			stdout: '',
		});
	});

	void it('kills and fails a process that exceeds the timeout', async () => {
		let child!: FakeChild;
		const { runner } = createRunner((created) => {
			child = created;
		}, { timeoutMs: 5 });

		const result = await runner.run('check');

		assert.equal(child.killed, true);
		assert.equal(result.status, 'failed');
		assert.equal(result.exitCode, null);
		assert.match(result.stderr, /timed out/);
	});

	void it('returns failed when the executable cannot be started', async () => {
		const spawn: SpawnLike = () => {
			throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
		};
		const runner = new IndexRunnerImpl({
			vaultRoot: '/vault',
			scriptPath: 'script.py',
			pythonPath: '/missing/python3',
			spawn,
			isDesktop: true,
		});

		assert.deepEqual(await runner.run('generate'), {
			mode: 'generate', status: 'failed', stdout: '', stderr: 'spawn ENOENT', exitCode: null,
		});
	});

	void it('rejects a script outside the vault before spawning', async () => {
		let spawned = false;
		const runner = new IndexRunnerImpl({
			vaultRoot: '/vault',
			scriptPath: '../outside/generate-index.py',
			pythonPath: '/usr/bin/python3',
			spawn: () => {
				spawned = true;
				return new FakeChild();
			},
			isDesktop: true,
		});

		const result = await runner.run('check');

		assert.equal(spawned, false);
		assert.equal(result.status, 'failed');
		assert.equal(result.exitCode, null);
		assert.match(result.stderr, /outside the Vault/);
	});

	void it('returns an unsupported-platform failure without spawning', async () => {
		let spawned = false;
		const { runner } = createRunner(() => undefined, {
			isDesktop: false,
			spawn: () => {
				spawned = true;
				return new FakeChild();
			},
		});

		const result = await runner.run('check');

		assert.equal(spawned, false);
		assert.equal(result.status, 'failed');
		assert.equal(result.exitCode, null);
		assert.match(result.stderr, /desktop/);
	});
});

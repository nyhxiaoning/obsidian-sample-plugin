import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

export type LocalCliKind = 'codex' | 'claude' | 'gemini' | 'opencode';

const KNOWN_BIN_DIRS = [
	'/opt/homebrew/bin',
	'/usr/local/bin',
	'/usr/bin',
];

function isExecutable(path: string): boolean {
	try {
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

export function resolveCliExecutable(command: string, env: NodeJS.ProcessEnv = process.env): string {
	if (command.includes('/')) return isExecutable(command) ? command : command;
	const pathEntries = (env.PATH ?? '').split(delimiter).filter(Boolean);
	const candidates = [
		...pathEntries.map((directory) => join(directory, command)),
		...KNOWN_BIN_DIRS.map((directory) => join(directory, command)),
		...(env.HOME ? [join(env.HOME, '.opencode', 'bin', command)] : []),
	];
	return candidates.find(isExecutable) ?? command;
}

export function resolveDefaultCliPaths(env: NodeJS.ProcessEnv = process.env): Record<LocalCliKind, string> {
	return {
		codex: resolveCliExecutable('codex', env),
		claude: resolveCliExecutable('claude', env),
		gemini: resolveCliExecutable('gemini', env),
		opencode: resolveCliExecutable('opencode', env),
	};
}

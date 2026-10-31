import type { CheckResult } from '../../changes/change-plan';
import type { CheckContext } from '../local-check-engine';

const normalize = (path: string): string => path.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');

export const isPathInside = (path: string, root: string): boolean => {
	const normalizedPath = normalize(path);
	const normalizedRoot = normalize(root);
	return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
};

const isExcluded = (path: string, root: string, excludes: string[]): boolean => {
	const relative = normalize(path).slice(normalize(root).length).replace(/^\/+/, '');
	return excludes.some((pattern) => {
		const clean = normalize(pattern).replace(/^\*\*\//, '').replace(/\/\*\*$/, '');
		return relative === clean || relative.startsWith(`${clean}/`) || (pattern.endsWith('**') && relative.startsWith(clean));
	});
};

export function checkPath(context: CheckContext, filePath: string): CheckResult[] {
	const { rootPath, rules } = context;
	const results: CheckResult[] = [];
	if (rules.checks.directory && !isPathInside(filePath, rootPath)) {
		const fileName = normalize(filePath).split('/').pop() ?? 'untitled.md';
		const target = `${normalize(rootPath)}/${fileName}`;
		results.push({
			id: 'path.outside-root',
			severity: 'error',
			message: `File is outside the configured knowledge-base root: ${rootPath}`,
			filePath,
			change: rules.actions.moveFile === 'confirm' ? {
				kind: 'move', target, reason: 'Move the file below the configured knowledge-base root.', risk: 'medium', requiresConfirmation: true,
			} : undefined,
		});
	}

	if (rules.checks.directory && isPathInside(filePath, rootPath) && isExcluded(filePath, rootPath, rules.scope.exclude)) {
		results.push({ id: 'path.excluded', severity: 'info', message: 'File is in an excluded directory.', filePath });
	}

	if (rules.checks.fileName && !normalize(filePath).toLowerCase().endsWith('.md')) {
		results.push({ id: 'path.file-name', severity: 'warning', message: 'File name does not use the Markdown extension.', filePath });
	}

	return results;
}

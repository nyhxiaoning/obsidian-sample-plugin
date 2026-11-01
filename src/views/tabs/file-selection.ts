export type FileSelectionScope = 'file' | 'folder';

export type FileSelectionResult =
	| { paths: string[]; reason: 'ready' }
	| { paths: []; reason: 'no-active-document' | 'outside-root' | 'no-folder-files' };

function normalizePath(path: string): string {
	return path.replace(/^\/+|\/+$/g, '');
}

function isInsideRoot(path: string, root: string): boolean {
	const normalizedPath = normalizePath(path);
	const normalizedRoot = normalizePath(root);
	return normalizedRoot.length === 0 || normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function isMarkdown(path: string): boolean {
	return path.toLowerCase().endsWith('.md');
}

export function selectMarkdownPaths(files: readonly string[], activePath: string | undefined, scope: FileSelectionScope, root: string): FileSelectionResult {
	if (!activePath || !isMarkdown(activePath)) return { paths: [], reason: 'no-active-document' };
	if (!isInsideRoot(activePath, root)) return { paths: [], reason: 'outside-root' };

	if (scope === 'file') return { paths: [activePath], reason: 'ready' };

	const separator = activePath.lastIndexOf('/');
	const folder = separator === -1 ? '' : activePath.slice(0, separator);
	const paths = files.filter((path) => {
		if (!isMarkdown(path) || !isInsideRoot(path, root)) return false;
		return folder.length === 0 ? !path.includes('/') : path.startsWith(`${folder}/`);
	});
	return paths.length > 0 ? { paths, reason: 'ready' } : { paths: [], reason: 'no-folder-files' };
}

import type { Config } from '../core/config';
import type { TreeNode } from '../core/fs';
import { ignoredPaths } from '../core/git';

export function hiddenTreeNodes(
	rootDir: string,
	config: Pick<Config, 'showDotfiles' | 'respectGitignore'>,
): ((node: TreeNode) => boolean) | undefined {
	const hideDots = !config.showDotfiles;
	const ignored = config.respectGitignore ? ignoredPaths(rootDir) : null;
	if (!hideDots && ignored === null) return undefined;
	return (node) => (hideDots && node.name.startsWith('.')) || (ignored?.has(node.path) ?? false);
}

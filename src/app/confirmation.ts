import { basename } from 'node:path';

import { isDirectory } from '../core/fs';
import type { Confirmation, Prompt } from './types';

export function confirmationForPrompt(prompt: Prompt): Confirmation | null {
	switch (prompt?.kind) {
		case 'delete': {
			const only = prompt.targets.length === 1 ? prompt.targets[0]! : null;
			return {
				title: 'Delete',
				verb: 'delete',
				danger: true,
				message: only
					? `Delete "${basename(only)}"${isDirectory(only) ? ' and its contents' : ''}?`
					: `Delete these ${prompt.targets.length} items and anything inside them?`,
			};
		}
		case 'closeDirty':
			return {
				title: 'Unsaved changes',
				verb: 'close without saving',
				danger: true,
				message: `Unsaved edits in ${prompt.names.join(', ')} will be lost. Close anyway?`,
			};
		case 'quitDirty':
			return {
				title: 'Unsaved changes',
				verb: 'quit without saving',
				danger: true,
				message: `Unsaved edits in ${prompt.names.join(', ')} will be lost. Quit anyway?`,
			};
		case 'undoCommit':
			return {
				title: 'Undo last commit',
				verb: 'undo commit',
				danger: true,
				message: `Undo "${prompt.subject}" and keep its changes staged?`,
			};
		case 'mergeBranch':
			return {
				title: 'Merge branch',
				verb: 'merge it',
				danger: false,
				message: `Merge "${prompt.name}" into the current branch? Conflicts are left in the working tree.`,
			};
		default:
			return null;
	}
}

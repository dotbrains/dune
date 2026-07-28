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
		default:
			return null;
	}
}

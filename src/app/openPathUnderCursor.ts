import { dirname } from 'node:path';

import { pathTokenAt, resolvePathToken } from '../core/pathTarget';

export function openPathUnderCursor(deps: {
	activePath: () => string | null;
	activeLine: () => string | null;
	cursorCol: () => number;
	rootDir: () => string;
	openResolvedFile: (path: string) => void;
	markNavigation: () => void;
	goToDefinition: () => void;
	say: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
}) {
	const path = deps.activePath();
	const line = deps.activeLine();
	if (!path || line === null) return deps.say('Open a file first', 'warn');
	const token = pathTokenAt(line, deps.cursorCol());
	if (!token) return deps.say('No file path under cursor', 'warn');
	const target = resolvePathToken(token, dirname(path), deps.rootDir());
	deps.markNavigation();
	if (target) return deps.openResolvedFile(target);
	deps.goToDefinition();
}

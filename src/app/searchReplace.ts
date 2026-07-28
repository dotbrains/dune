import { basename } from 'node:path';

import type { Match, SearchOptions } from '../core/search';
import { replaceAll, replaceMatch } from '../core/search';
import type { BufferState } from './types';

interface ReplacementContext {
	activePath: () => string | null;
	buffer: (path: string) => BufferState | undefined;
	closeSearch: () => void;
	applyReplacement: (path: string, next: string) => void;
	say: (message: string, tone?: 'info' | 'warn' | 'error') => void;
}

export function createReplacementHandlers(ctx: ReplacementContext) {
	return {
		replaceOne(match: Match, replacement: string) {
			const path = ctx.activePath();
			const buffer = path ? ctx.buffer(path) : undefined;
			if (!path || !buffer) return;
			const next = replaceMatch(buffer.content, match, replacement);
			if (next === null) return ctx.say('That match is gone', 'warn');
			ctx.applyReplacement(path, next);
		},
		replaceEvery(query: string, replacement: string, options: SearchOptions) {
			const path = ctx.activePath();
			const buffer = path ? ctx.buffer(path) : undefined;
			if (!path || !buffer) return;
			const next = replaceAll(buffer.content, query, replacement, options);
			ctx.closeSearch();
			if (next === buffer.content) return ctx.say('Nothing to replace');
			ctx.applyReplacement(path, next);
			ctx.say(`Replaced "${query}" in ${basename(path)}`);
		},
	};
}

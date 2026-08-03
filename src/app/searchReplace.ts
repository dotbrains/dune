import { basename } from 'node:path';

import { readTextFile, writeFile } from '../core/fs';
import type { Match, SearchOptions } from '../core/search';
import {
	buildQuery,
	planProjectReplace,
	replaceAll,
	replaceMatch,
	replaceProject,
} from '../core/search';
import { MIN_QUERY } from '../ui/SearchPanel';
import type { BufferState, Prompt } from './types';

interface ReplacementContext {
	rootDir: string;
	activePath: () => string | null;
	buffers: Record<string, BufferState>;
	buffer: (path: string) => BufferState | undefined;
	closeSearch: () => void;
	pinTab: (path: string) => void;
	applyReplacement: (path: string, next: string) => void;
	applyBufferReplacement: (path: string, next: string) => void;
	syncFromDisk: () => void;
	bumpGit: () => void;
	setPrompt: (prompt: Prompt) => void;
	say: (message: string, tone?: 'info' | 'warn' | 'error') => void;
}

const searchFlags = (options: SearchOptions) => {
	const parts = [
		options.caseSensitive && 'case',
		options.wholeWord && 'word',
		options.regex && 'regex',
	].filter(Boolean);
	return parts.length > 0 ? ` (${parts.join(', ')})` : '';
};

export function createReplacementHandlers(ctx: ReplacementContext) {
	const replaceOverlay = (): Map<string, string> => {
		const overlay = new Map<string, string>();
		const active = ctx.activePath();
		for (const [path, buffer] of Object.entries(ctx.buffers)) {
			if (buffer.dirty || path === active) overlay.set(path, buffer.content);
		}
		return overlay;
	};

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
		replaceProjectOne(match: Match, replacement: string) {
			const open = replaceOverlay().get(match.path);
			if (open != null) {
				const next = replaceMatch(open, match, replacement);
				if (next === null) return ctx.say('That match is gone', 'warn');
				ctx.applyBufferReplacement(match.path, next);
				return;
			}
			let file: ReturnType<typeof readTextFile>;
			try {
				file = readTextFile(match.path);
			} catch {
				return ctx.say('That match is gone', 'warn');
			}
			const next = replaceMatch(file.content, match, replacement);
			if (next === null) return ctx.say('That match is gone', 'warn');
			const error = writeFile(match.path, next, file.encoding);
			if (error) return ctx.say(`Replace failed: ${error}`, 'error');
			ctx.syncFromDisk();
			ctx.bumpGit();
		},
		confirmProject(query: string, replacement: string, options: SearchOptions) {
			if (!buildQuery(query, options)) return ctx.say('Invalid regex', 'warn');
			if (query.length < MIN_QUERY) return;
			const { targets, matches } = planProjectReplace(
				ctx.rootDir,
				query,
				options,
				replaceOverlay(),
			);
			if (matches === 0) return ctx.say('Nothing to replace');
			ctx.setPrompt({
				kind: 'replaceProject',
				query,
				replacement,
				options,
				paths: targets.map((target) => target.path),
				matches,
				files: targets.length,
				flags: searchFlags(options),
			});
		},
		applyProject(
			paths: readonly string[],
			query: string,
			replacement: string,
			options: SearchOptions,
		) {
			const result = replaceProject(paths, query, replacement, options, replaceOverlay());
			let pending = 0;
			let wroteDisk = false;
			const active = ctx.activePath();
			for (const file of result.replaced) {
				if (file.content == null) {
					wroteDisk = true;
					continue;
				}
				ctx.pinTab(file.path);
				ctx.applyBufferReplacement(file.path, file.content);
				if (file.path !== active) pending++;
			}
			if (wroteDisk) {
				ctx.syncFromDisk();
				ctx.bumpGit();
			}
			const files = result.replaced.length;
			if (result.matches === 0 && result.failed.length === 0) return ctx.say('Nothing to replace');
			const counts = `Replaced ${result.matches} ${result.matches === 1 ? 'match' : 'matches'} in ${files} ${files === 1 ? 'file' : 'files'}`;
			const tail = pending > 0 ? ` — ${pending} in open tabs, unsaved` : '';
			if (result.failed.length > 0) {
				const names = result.failed.map((entry) => basename(entry.split(' — ')[0]!)).join(', ');
				ctx.say(`${counts}${tail}; failed: ${names}`, 'warn');
			} else ctx.say(`${counts}${tail}`);
		},
		replaceOverlay,
	};
}

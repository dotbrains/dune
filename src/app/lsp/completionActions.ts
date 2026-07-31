import { createSignal } from 'solid-js';

import type { Config } from '../../core/config';
import type { CompletionReply } from '../../lsp/completion';
import type { DefinitionTarget } from '../../lsp/definition';
import type { CompletionItem } from '../../lsp/protocol';
import type { CompletionRequest } from '../types';

export function createCompletionActions(
	activePath: () => string | null,
	config: Config,
	cursor: () => { line: number; col: number },
	lsp: {
		complete: (path: string, line: number, col: number) => Promise<CompletionReply | null>;
		resolveCompletion: (path: string, item: CompletionItem) => Promise<CompletionItem | null>;
		definition: (path: string, line: number, col: number) => Promise<DefinitionTarget | null>;
	},
	openFile: (path: string) => void,
	setFocus: (focus: 'editor') => void,
	setGoto: (
		update: (prev: { line: number; col: number; key: number } | null) => {
			line: number;
			col: number;
			key: number;
		},
	) => void,
	say: (msg: string, tone?: 'info' | 'warn' | 'error') => void,
) {
	const [request, setRequest] = createSignal<CompletionRequest>(null);
	const show = () => {
		if (!activePath()) return say('Open a file for completions', 'warn');
		setFocus('editor');
		setRequest((prev) => ({ key: (prev?.key ?? 0) + 1 }));
	};
	const complete = (line: number, col: number) => {
		const path = activePath();
		return path ? lsp.complete(path, line, col) : Promise.resolve(null);
	};
	const resolve = (item: CompletionItem) => {
		const path = activePath();
		return path ? lsp.resolveCompletion(path, item) : Promise.resolve(null);
	};
	const goToDefinition = async () => {
		const path = activePath();
		if (!path) return say('Open a file first', 'warn');
		if (!config.lsp) return say('LSP is off', 'warn');
		const target = await lsp.definition(path, cursor().line, cursor().col);
		if (!target) return say('No definition found', 'warn');
		if (target.path !== path) openFile(target.path);
		setGoto((prev) => ({ line: target.line, col: target.col, key: (prev?.key ?? 0) + 1 }));
		setFocus('editor');
	};
	return { request, show, complete, resolve, goToDefinition };
}

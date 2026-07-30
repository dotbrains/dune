import { createSignal } from 'solid-js';

import type { CompletionReply } from '../../lsp/completion';
import type { CompletionItem } from '../../lsp/protocol';
import type { CompletionRequest } from '../types';

export function createCompletionActions(deps: {
	activePath: () => string | null;
	lsp: {
		complete: (path: string, line: number, col: number) => Promise<CompletionReply | null>;
		resolveCompletion: (path: string, item: CompletionItem) => Promise<CompletionItem | null>;
	};
	setFocus: (focus: 'editor') => void;
	say: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
}) {
	const [request, setRequest] = createSignal<CompletionRequest>(null);
	const show = () => {
		if (!deps.activePath()) return deps.say('Open a file for completions', 'warn');
		deps.setFocus('editor');
		setRequest((prev) => ({ key: (prev?.key ?? 0) + 1 }));
	};
	const complete = (line: number, col: number) => {
		const path = deps.activePath();
		return path ? deps.lsp.complete(path, line, col) : Promise.resolve(null);
	};
	const resolve = (item: CompletionItem) => {
		const path = deps.activePath();
		return path ? deps.lsp.resolveCompletion(path, item) : Promise.resolve(null);
	};
	return { request, show, complete, resolve };
}

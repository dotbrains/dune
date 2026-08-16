import type { KeyEvent, TextareaRenderable } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/solid';
import { createEffect, createMemo, createSignal, on, onCleanup } from 'solid-js';

import {
	applyCompletion,
	extendsWord,
	filterCompletions,
	isWordChar,
	wordStart,
} from '../lsp/completion';
import type { CompletionReply } from '../lsp/completion';
import type { CompletionItem } from '../lsp/protocol';
import { CompletionMenu } from './CompletionMenu';
import { completionInfo, completionMenuLayout } from './completionLayout';

const COMPLETION_DEBOUNCE_MS = 80;
const TRIGGER_CHARS = new Set(['.', ':', '/', '@']);

interface CompletionAnchor {
	row: number;
	col: number;
	start: number;
}

export interface EditorCompletionProps {
	blocked: boolean;
	focused: boolean;
	path: string | null;
	filetype?: string;
	content: string;
	completion: { key: number } | null;
	complete: ((line: number, col: number) => Promise<CompletionReply | null>) | null;
	resolveCompletion: ((item: CompletionItem) => Promise<CompletionItem | null>) | null;
}

export function createEditorCompletion(
	props: EditorCompletionProps,
	deps: {
		editor: () => TextareaRenderable | undefined;
		onChange: (text: string) => void;
		rehighlight: (text: string) => void;
		scheduleCursorSync: () => void;
	},
) {
	const dimensions = useTerminalDimensions();
	const [items, setItems] = createSignal<CompletionItem[]>([]);
	const [anchor, setAnchor] = createSignal<CompletionAnchor | null>(null);
	const [selected, setSelected] = createSignal(0);
	const [resolved, setResolved] = createSignal<CompletionItem | null>(null);
	let requestGeneration = 0;
	let resolveGeneration = 0;
	let autoTimer: ReturnType<typeof setTimeout> | null = null;

	const prefix = () => {
		const at = deps.editor()?.logicalCursor;
		const a = anchor();
		if (!at || !a || at.row !== a.row || at.col < a.start) return '';
		return lineText(props.content, at.row).slice(a.start, at.col);
	};
	const matches = createMemo(() => filterCompletions(items(), prefix()));
	const close = () => {
		requestGeneration++;
		resolveGeneration++;
		if (autoTimer) clearTimeout(autoTimer);
		autoTimer = null;
		setItems([]);
		setAnchor(null);
		setSelected(0);
		setResolved(null);
	};
	const request = async () => {
		const editor = deps.editor();
		if (!editor || !props.path || !props.complete) return close();
		const generation = ++requestGeneration;
		const path = props.path;
		const at = editor.logicalCursor;
		const text = lineText(editor.plainText, at.row);
		const start = wordStart(text, at.col);
		const reply = await props.complete(at.row, at.col);
		if (generation !== requestGeneration || deps.editor() !== editor || props.path !== path) return;
		const now = editor.logicalCursor;
		if (now.row !== at.row || !extendsWord(lineText(editor.plainText, now.row), at.col, now.col)) {
			return;
		}
		if (!reply?.items.length) return close();
		setAnchor({ row: at.row, col: at.col, start });
		setItems(reply.items);
		setSelected(0);
		setResolved(null);
	};
	const accept = async () => {
		const editor = deps.editor();
		const a = anchor();
		const match = matches()[selected()];
		if (!editor || !a || !match) return close();
		const at = editor.logicalCursor;
		const resolvedItem =
			resolved()?.label === match.item.label
				? resolved()!
				: ((await props.resolveCompletion?.(match.item)) ?? match.item);
		const result = applyCompletion(
			editor.plainText,
			{ line: at.row, character: at.col },
			a.start,
			resolvedItem,
		);
		editor.setText(result.content);
		editor.setCursor(result.cursor.line, result.cursor.character);
		deps.onChange(result.content);
		deps.rehighlight(result.content);
		deps.scheduleCursorSync();
		close();
	};
	const scheduleAutoRequest = () => {
		if (autoTimer) clearTimeout(autoTimer);
		autoTimer = setTimeout(() => {
			autoTimer = null;
			if (!props.focused || props.blocked || !props.path || !props.complete) return;
			void request();
		}, COMPLETION_DEBOUNCE_MS);
	};

	createEffect(on(() => [props.path, props.focused], close));
	createEffect(
		on(
			() => props.completion?.key,
			() => void request(),
			{ defer: true },
		),
	);
	createEffect(
		on(
			() => props.content,
			() => {
				if (!props.focused || props.blocked || anchor()) return;
				const editor = deps.editor();
				if (!editor) return;
				const at = editor.logicalCursor;
				const previous = lineText(editor.plainText, at.row)[at.col - 1];
				if (previous && (isWordChar(previous) || TRIGGER_CHARS.has(previous)))
					scheduleAutoRequest();
			},
			{ defer: true },
		),
	);
	createEffect(() => {
		const count = matches().length;
		if (selected() >= count) setSelected(Math.max(0, count - 1));
	});
	createEffect(
		on(
			() => [matches()[selected()]?.item, props.path] as const,
			([item]) => {
				const generation = ++resolveGeneration;
				setResolved(null);
				if (!item) return;
				void (async () => {
					const next = (await props.resolveCompletion?.(item)) ?? item;
					if (generation === resolveGeneration) setResolved(next);
				})();
			},
		),
	);
	onCleanup(() => {
		if (autoTimer) clearTimeout(autoTimer);
	});

	useKeyboard((key: KeyEvent) => {
		if (key.defaultPrevented || props.blocked || !props.focused || !anchor()) return;
		const count = matches().length;
		if (key.name === 'escape') {
			key.preventDefault();
			close();
		} else if (key.name === 'up' || key.name === 'down') {
			key.preventDefault();
			if (count > 0) setSelected((prev) => (prev + (key.name === 'up' ? count - 1 : 1)) % count);
		} else if (key.name === 'return' || key.name === 'enter' || key.name === 'tab') {
			key.preventDefault();
			void accept();
		}
	});

	const menu = () => {
		const editor = deps.editor();
		const visible = matches();
		if (!editor || !anchor()) return null;
		const cursor = editor.visualCursor;
		const info = completionInfo(resolved() ?? visible[selected()]?.item);
		const layout = completionMenuLayout(
			visible.map((match) => match.item),
			info,
			{ width: dimensions().width - 2, height: dimensions().height - 2 },
			true,
		);
		const left = Math.max(
			0,
			Math.min(dimensions().width - layout.width, editor.x + cursor.visualCol),
		);
		const below = editor.y + cursor.visualRow + 1;
		const above = editor.y + cursor.visualRow - layout.height;
		const top =
			below + layout.height <= dimensions().height
				? below
				: Math.max(0, Math.min(dimensions().height - layout.height, above));
		return (
			<CompletionMenu
				matches={visible}
				selected={selected()}
				layout={layout}
				detail={info?.detail ?? ''}
				filetype={props.filetype}
				top={top}
				left={left}
			/>
		);
	};

	return { menu };
}

function lineText(content: string, row: number): string {
	return content.split('\n')[row] ?? '';
}

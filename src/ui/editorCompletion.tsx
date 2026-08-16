import type { KeyEvent, TextareaRenderable } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/solid';
import { createEffect, createMemo, createSignal, on, onCleanup } from 'solid-js';

import {
	applyCompletion,
	extendsWord,
	filterCompletions,
	itemInfo,
	isWordChar,
	wordStart,
} from '../lsp/completion';
import type { CompletionReply, ItemInfo } from '../lsp/completion';
import type { CompletionItem } from '../lsp/protocol';
import { COMPLETION_MENU_ROWS, CompletionMenu, completionMenuWidth } from './CompletionMenu';
import { DOC_ROWS, DOC_WIDTH, layoutPanel } from './completionLayout';

const COMPLETION_DEBOUNCE_MS = 80;
const TRIGGER_CHARS = new Set(['.', ':', '/', '@']);
/** Servers withhold docs from the list — expensive per candidate — so the
 * selected item is only resolved once the selection has rested a moment. */
const INFO_DEBOUNCE_MS = 120;
/** Border top and bottom; the divider above the panel and the counter row
 * under the list are added on top of this where they actually apply. */
const CHROME_ROWS = 2;

interface CompletionAnchor {
	row: number;
	col: number;
	start: number;
}

export interface EditorCompletionProps {
	blocked: boolean;
	focused: boolean;
	path: string | null;
	content: string;
	filetype?: string;
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
	let requestGeneration = 0;
	let autoTimer: ReturnType<typeof setTimeout> | null = null;

	/** Signature and documentation for the selected item; null until they arrive. */
	const [info, setInfo] = createSignal<ItemInfo | null>(null);
	/** Items already resolved, so walking back up the list costs no round trip. */
	const resolvedItems = new WeakMap<CompletionItem, CompletionItem>();
	let infoTimer: ReturnType<typeof setTimeout> | null = null;
	let infoGen = 0;

	const prefix = () => {
		const at = deps.editor()?.logicalCursor;
		const a = anchor();
		if (!at || !a || at.row !== a.row || at.col < a.start) return '';
		return lineText(props.content, at.row).slice(a.start, at.col);
	};
	const matches = createMemo(() => filterCompletions(items(), prefix()));
	const close = () => {
		requestGeneration++;
		if (autoTimer) clearTimeout(autoTimer);
		autoTimer = null;
		if (infoTimer) clearTimeout(infoTimer);
		infoTimer = null;
		infoGen++;
		setItems([]);
		setAnchor(null);
		setSelected(0);
		setInfo(null);
	};

	const askForInfo = async (item: CompletionItem, gen: number) => {
		const reply = await props.resolveCompletion?.(item);
		// A null reply is cached as the item itself: the server has answered, and
		// asking again every time the selection returns is pure traffic.
		const merged = reply ? { ...item, ...reply } : item;
		resolvedItems.set(item, merged);
		if (gen === infoGen && anchor()) setInfo(itemInfo(merged));
	};

	/**
	 * Fill the detail panel for whatever is selected. Servers withhold docs from
	 * the list — they are expensive per candidate — so the item under the
	 * selection is resolved on its own, and what came with the list is shown
	 * meanwhile rather than leaving the panel blank until the reply lands.
	 */
	createEffect(
		on([anchor, selected, matches], () => {
			if (infoTimer) clearTimeout(infoTimer);
			infoTimer = null;
			const item = anchor() ? matches()[selected()]?.item : undefined;
			if (!item) {
				setInfo(null);
				return;
			}
			const known = resolvedItems.get(item);
			setInfo(itemInfo(known ?? item));
			if (known || !props.resolveCompletion) return;
			const gen = ++infoGen;
			infoTimer = setTimeout(() => {
				infoTimer = null;
				void askForInfo(item, gen);
			}, INFO_DEBOUNCE_MS);
		}),
	);
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
	};
	const accept = async () => {
		const editor = deps.editor();
		const a = anchor();
		const match = matches()[selected()];
		if (!editor || !a || !match) return close();
		const at = editor.logicalCursor;
		const resolved = (await props.resolveCompletion?.(match.item)) ?? match.item;
		const result = applyCompletion(
			editor.plainText,
			{ line: at.row, character: at.col },
			a.start,
			resolved,
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
		// A server that can resolve one gets the width reserved whether the panel
		// has anything to show yet or not — walking the list must not jump the box.
		const panel = props.resolveCompletion !== null;
		const width = Math.min(
			Math.max(completionMenuWidth(visible), panel ? DOC_WIDTH : 0),
			dimensions().width - 2,
		);
		const left = Math.max(0, Math.min(dimensions().width - width, editor.x + cursor.visualCol));
		const top = Math.max(0, Math.min(dimensions().height - 2, editor.y + cursor.visualRow + 1));
		const shown = Math.min(visible.length, COMPLETION_MENU_ROWS);
		const counterRow = visible.length > COMPLETION_MENU_ROWS ? 1 : 0;
		const available = dimensions().height - top - CHROME_ROWS - shown - counterRow - 1;
		const panelLayout = layoutPanel(info(), width, panel ? Math.min(DOC_ROWS, available) : 0);
		return (
			<CompletionMenu
				matches={visible}
				selected={selected()}
				top={top}
				left={left}
				width={width}
				panelLayout={panelLayout}
				detail={info()?.detail ?? ''}
				filetype={props.filetype}
			/>
		);
	};

	return { menu };
}

function lineText(content: string, row: number): string {
	return content.split('\n')[row] ?? '';
}

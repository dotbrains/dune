import type { TextareaRenderable } from '@opentui/core';
import { useRenderer, useTerminalDimensions } from '@opentui/solid';
import { createEffect, createMemo, createSignal, on, onCleanup, Show } from 'solid-js';
import type { LineChange } from '../core/git';
import { changeRows } from '../editor/changes';
import { History } from '../editor/history';
import { duplicateLines, moveLines, toggleComment } from '../editor/lines';
import { initialVimState } from '../editor/vim';
import type { VimMode } from '../editor/vim';
import { lineAt, logicalWindow } from '../editor/window';
import { commentPrefix } from '../languages';
import { computeHighlights, getSyntaxStyle, segmentsIn, STALE } from '../languages/highlight';
import type { Highlighted, Segment } from '../languages/highlight';
import { ui } from '../themes';
import type { ThemeName } from '../themes';
import { EditorEmptyState, EditorNotice } from './EditorEmptyState';
import { EditorPaneBody } from './EditorPaneBody';
import type { GutterHost } from './EditorPaneBody';
import { afterResize, allowSelectionOnlyInEditor, ignoreScrollOutsideBounds } from './editorHost';
import { useEditorKeymap } from './editorKeymap';
export { ignoreScrollOutsideBounds } from './editorHost';
export interface EditorPaneProps {
	path: string | null;
	content: string;
	filetype?: string;
	focused: boolean;
	theme: ThemeName;
	reloadKey: number;
	goto: { line: number; col: number; key: number } | null;
	history: { kind: 'undo' | 'redo'; key: number } | null;
	edit: { content: string; key: number } | null;
	lineOp: { op: 'comment' | 'up' | 'down' | 'duplicate'; key: number } | null;
	vim: boolean;
	tabSize: number;
	blocked: boolean;
	gitLines: Map<number, LineChange>;
	notice: { name: string; reason: string } | null;
	onChange: (text: string) => void;
	onCursor: (pos: { line: number; col: number }) => void;
	onFocus: () => void;
	onVimMode: (mode: VimMode | null) => void;
	onQuit: () => void;
}
const DEBOUNCE_MS = 16;
const OVERSCAN = 60;
const SIGN_GLYPH: Record<LineChange, string> = { added: '▎', modified: '▎', deleted: '▁' };
export function EditorPane(props: EditorPaneProps) {
	const dimensions = useTerminalDimensions();
	const renderer = useRenderer();
	let gutter: GutterHost | undefined;
	let editor: TextareaRenderable | undefined;
	let highlightTimer: ReturnType<typeof setTimeout> | null = null;
	let parsing = false;
	let queuedParse = false;
	let byLine = new Map<number, Segment[]>();
	let parsed: Highlighted | null = null;
	const segmented = new Set<number>();
	const appliedLines = new Set<number>();
	const cursor = { line: 0, col: 0 };
	const history = new History({ content: props.content, cursor: 0 });
	let cursorBeforeEdit = 0;
	const vimState = initialVimState();
	const [editorEl, setEditorEl] = createSignal<TextareaRenderable | null>(null);
	const [cursorLine, setCursorLine] = createSignal(0);
	const [viewTop, setViewTop] = createSignal(0);
	const [viewHeight, setViewHeight] = createSignal(0);
	const [viewTotal, setViewTotal] = createSignal(0);
	const viewport = () => ({ top: viewTop(), height: viewHeight(), total: viewTotal() });
	let visualToLogical: number[] | null = null;
	const forgetWrapMap = () => {
		visualToLogical = null;
	};
	const wrapMap = (): number[] => {
		if (!editor) return [];
		if (!visualToLogical) visualToLogical = editor.lineInfo.lineSources as number[];
		return visualToLogical;
	};
	const lineAtRow = (row: number): number => lineAt(wrapMap(), row);
	const rowAtLine = (line: number): number => {
		const map = wrapMap();
		if (map.length === 0) return line;
		let low = 0;
		let high = map.length - 1;
		while (low < high) {
			const mid = (low + high) >> 1;
			if ((map[mid] ?? 0) < line) low = mid + 1;
			else high = mid;
		}
		return low;
	};
	const lineCount = createMemo(() => {
		let lines = 1;
		for (let at = props.content.indexOf('\n'); at >= 0; at = props.content.indexOf('\n', at + 1)) {
			lines++;
		}
		return lines;
	});
	const scrollMetrics = createMemo(() => {
		const measured = viewport();
		const height = measured.height || dimensions().height - 2;
		const total = measured.total || lineCount();
		if (height <= 0 || total <= height) return null;
		const size = Math.max(1, Math.round((height * height) / total));
		return { height, total, size, span: height - size, top: lineAtRow(measured.top) };
	});
	const scrollbar = createMemo(() => {
		const m = scrollMetrics();
		if (!m) return [];
		const at = Math.min(m.span, Math.round((m.top / (m.total - m.height)) * m.span));
		return Array.from({ length: m.height }, (_, row) => row >= at && row < at + m.size);
	});
	let track: { y: number } | undefined;
	const [dragging, setDragging] = createSignal(false);
	const gutterWidth = () => String(lineCount()).length + 2;
	createEffect(() => {
		const width = gutterWidth();
		if (gutter?.gutter) gutter.gutter._minWidth = width;
	});
	const applyLineSigns = () => {
		const signColor: Record<LineChange, string> = {
			added: ui.gitAdded,
			modified: ui.gitModified,
			deleted: ui.gitDeleted,
		};
		gutter?.setLineSigns?.(
			new Map(
				[...props.gitLines].map(([line, change]) => [
					line,
					{ before: SIGN_GLYPH[change], beforeColor: signColor[change] },
				]),
			),
		);
	};
	createEffect(applyLineSigns);
	const syncViewport = () => {
		if (!editor) return;
		setViewTop(editor.scrollY);
		setViewHeight(editor.height);
		setViewTotal(editor.lineCount);
	};
	const syncCursor = () => {
		if (!editor) return;
		syncViewport();
		const at = editor.visualCursor;
		if (!at) return;
		if (at.logicalRow === cursor.line && at.logicalCol === cursor.col) return;
		cursor.line = at.logicalRow;
		cursor.col = at.logicalCol;
		setCursorLine(at.visualRow);
		props.onCursor({ ...cursor });
	};
	const ensureSegments = (from: number, to: number) => {
		if (!parsed) return;
		for (let line = from; line <= to; line++) {
			if (segmented.has(line)) continue;
			let last = line;
			while (last + 1 <= to && !segmented.has(last + 1)) last++;
			for (const segment of segmentsIn(parsed, line, last)) {
				const list = byLine.get(segment.line);
				if (list) list.push(segment);
				else byLine.set(segment.line, [segment]);
			}
			for (let done = line; done <= last; done++) segmented.add(done);
			line = last;
		}
	};
	const applyWindow = (force = false) => {
		if (!editor) return;
		syncViewport();
		if (force) {
			editor.clearAllHighlights();
			appliedLines.clear();
		}
		const { from, to } = logicalWindow(editor.scrollY, editor.height, wrapMap(), OVERSCAN);
		for (const line of appliedLines) {
			if (line < from || line > to) {
				editor.clearLineHighlights(line);
				appliedLines.delete(line);
			}
		}
		ensureSegments(from, to);
		for (let line = from; line <= to; line++) {
			if (appliedLines.has(line)) continue;
			appliedLines.add(line);
			for (const segment of byLine.get(line) ?? []) editor.addHighlight(line, segment);
		}
	};
	const scrollTo = (wanted: number) => {
		if (!editor) return;
		const delta = rowAtLine(Math.round(wanted)) - editor.scrollY;
		if (delta === 0) return;
		const host = editor as unknown as { onMouseEvent: (event: unknown) => void };
		host.onMouseEvent({
			type: 'scroll',
			x: editor.x + 1,
			y: editor.y + 1,
			scroll: { direction: delta > 0 ? 'down' : 'up', delta: Math.abs(delta) },
		});
		syncViewport();
		applyWindow();
	};
	const dragTo = (screenY: number) => {
		const m = scrollMetrics();
		if (!m || !track) return;
		const within = Math.max(0, Math.min(m.span, screenY - track.y - Math.floor(m.size / 2)));
		scrollTo(m.span === 0 ? 0 : (within / m.span) * Math.max(0, m.total - 1));
	};
	let cursorSync: ReturnType<typeof setTimeout> | null = null;
	const scheduleCursorSync = () => {
		if (cursorSync) return;
		cursorSync = setTimeout(() => {
			cursorSync = null;
			applyWindow();
			syncCursor();
		}, 0);
	};
	const highlight = async (snapshot: string, forPath: string | null) => {
		const result = await computeHighlights(
			snapshot,
			props.filetype,
			props.tabSize,
			() => !editor || forPath !== props.path || editor.plainText !== snapshot,
		);
		if (result === STALE) return;
		if (!editor || forPath !== props.path || editor.plainText !== snapshot) return;
		parsed = result;
		byLine = new Map();
		segmented.clear();
		applyWindow(true);
	};
	const runHighlight = async (text: string) => {
		if (parsing) {
			queuedParse = true;
			return;
		}
		parsing = true;
		try {
			await highlight(text, props.path);
		} finally {
			parsing = false;
		}
		if (!queuedParse) return;
		queuedParse = false;
		if (editor) void runHighlight(editor.plainText);
	};
	const rehighlight = (text: string) => {
		forgetWrapMap();
		parsed = null;
		byLine = new Map();
		segmented.clear();
		void runHighlight(text);
	};
	const rowOfOffset = (text: string, offset: number) => {
		let row = 0;
		for (let at = text.indexOf('\n'); at >= 0 && at < offset; at = text.indexOf('\n', at + 1))
			row++;
		return row;
	};
	const editRange = (text: string) => {
		const selection = editor?.getSelection();
		if (!selection || selection.start === selection.end) {
			const row = editor!.logicalCursor.row;
			return { from: row, to: row };
		}
		const start = Math.min(selection.start, selection.end);
		const end = Math.max(selection.start, selection.end);
		return { from: rowOfOffset(text, start), to: rowOfOffset(text, Math.max(start, end - 1)) };
	};
	const applyLineEdit = (content: string, row: number, col: number) => {
		if (!editor) return;
		editor.setText(content);
		editor.setCursor(row, col);
		props.onChange(content);
		rehighlight(content);
		scheduleCursorSync();
	};
	const toggleCommentLines = () => {
		if (!editor) return;
		const prefix = commentPrefix(props.filetype);
		if (!prefix) return;
		const text = editor.plainText;
		const { from, to } = editRange(text);
		const next = toggleComment(text, from, to, prefix);
		const { row, col } = editor.logicalCursor;
		if (next !== text) applyLineEdit(next, row, col);
	};
	const moveSelectedLines = (delta: -1 | 1) => {
		if (!editor) return;
		const text = editor.plainText;
		const { from, to } = editRange(text);
		const { row, col } = editor.logicalCursor;
		const next = moveLines(text, from, to, delta);
		if (next !== null) applyLineEdit(next, row + delta, col);
	};
	const duplicateSelectedLines = (follow: boolean) => {
		if (!editor) return;
		const text = editor.plainText;
		const { from, to } = editRange(text);
		const { row, col } = editor.logicalCursor;
		applyLineEdit(duplicateLines(text, from, to), follow ? row + (to - from + 1) : row, col);
	};
	const stepHistory = (kind: 'undo' | 'redo') => {
		if (!editor) return;
		const at = kind === 'undo' ? history.undo() : history.redo();
		if (!at) return;
		editor.setText(at.content);
		editor.cursorOffset = Math.min(at.cursor, at.content.length);
		props.onChange(at.content);
		rehighlight(at.content);
		scheduleCursorSync();
	};
	createEffect(
		on(
			() => props.history?.key,
			() => {
				const request = props.history;
				if (request) stepHistory(request.kind);
			},
			{ defer: true },
		),
	);
	createEffect(
		on(
			() => props.lineOp?.key,
			() => {
				switch (props.lineOp?.op) {
					case 'comment':
						return toggleCommentLines();
					case 'up':
						return moveSelectedLines(-1);
					case 'down':
						return moveSelectedLines(1);
					case 'duplicate':
						return duplicateSelectedLines(true);
				}
			},
			{ defer: true },
		),
	);
	const scheduleHighlight = () => {
		if (highlightTimer) clearTimeout(highlightTimer);
		highlightTimer = setTimeout(() => {
			if (editor) void runHighlight(editor.plainText);
		}, DEBOUNCE_MS);
	};
	const changeTrack = createMemo(() => {
		const m = scrollMetrics();
		const height = m?.height ?? viewHeight();
		const total = m?.total ?? viewTotal();
		if (height <= 0) return [];
		return changeRows(props.gitLines, total, height);
	});
	const jumpToRow = (row: number) => {
		const m = scrollMetrics();
		if (!m || !editor) return;
		const line = Math.round((row / Math.max(1, m.height - 1)) * (m.total - 1));
		scrollTo(Math.max(0, line - Math.floor(editor.height / 2)));
	};
	const releaseEditor = () => {
		editor = undefined;
		setEditorEl(null);
		if (highlightTimer) clearTimeout(highlightTimer);
		if (cursorSync) clearTimeout(cursorSync);
		highlightTimer = null;
		cursorSync = null;
	};
	onCleanup(releaseEditor);
	useEditorKeymap({
		blocked: () => props.blocked, focused: () => props.focused, vim: () => props.vim,
		tabSize: () => props.tabSize, editor: () => editor, vimState, renderer,
		onChange: props.onChange, onQuit: props.onQuit, onVimMode: props.onVimMode,
		applyWindow, scheduleCursorSync, scheduleHighlight,
		setCursorBeforeEdit: (offset) => {
			cursorBeforeEdit = offset;
		},
		stepHistory, toggleCommentLines, moveSelectedLines, duplicateSelectedLines,
	});
	createEffect(
		on(
			() => props.path,
			() => {
				if (!editor) return;
				scheduleCursorSync();
				if (editor.plainText !== props.content) editor.setText(props.content);
				editor.setCursor(0, 0);
				history.reset({ content: props.content, cursor: 0 });
				editor.syntaxStyle = getSyntaxStyle();
				rehighlight(props.content);
			},
		),
	);
	createEffect(on(() => props.focused, (focused) => void (focused && editor?.focus())));
	createEffect(on(() => props.blocked, (blocked) => void (!blocked && props.focused && editor?.focus()), { defer: true }));
	createEffect(on(() => [props.vim, props.path], () => {
		Object.assign(vimState, initialVimState());
		props.onVimMode(props.vim ? 'normal' : null);
	}));
	createEffect(on(() => [props.theme, props.tabSize], () => {
		if (!editor) return;
		editor.syntaxStyle = getSyntaxStyle();
		void highlight(editor.plainText, props.path);
	}, { defer: true }));
	createEffect(
		on(
			() => props.reloadKey,
			() => {
				if (editor && props.content !== editor.plainText) {
					editor.setText(props.content);
					history.reset({ content: props.content, cursor: editor.cursorOffset });
					rehighlight(props.content);
				}
			},
			{ defer: true },
		),
	);
	createEffect(
		on(
			() => props.edit?.key,
			() => {
				const edit = props.edit;
				if (!edit || !editor || edit.content === editor.plainText) return;
				const at = editor.cursorOffset;
				editor.setText(edit.content);
				editor.cursorOffset = Math.min(at, edit.content.length);
				props.onChange(edit.content);
				rehighlight(edit.content);
				scheduleCursorSync();
			},
			{ defer: true },
		),
	);
	createEffect(on(() => props.goto?.key, () => {
		const target = props.goto;
		if (!target || !editor) return;
		editor.setCursor(target.line, target.col);
		editor.focus();
	}));
	return (
		<box flexGrow={1} flexDirection="column" backgroundColor={ui.bg}>
			<Show when={props.notice}>
				{(refused: () => { name: string; reason: string }) => <EditorNotice notice={refused()} />}
			</Show>
				<Show when={props.path != null} fallback={<EditorEmptyState />}>
					{}
					<EditorPaneBody
						content={props.content} focused={props.focused} tabSize={props.tabSize}
						editorEl={editorEl()} cursorLine={cursorLine()} gutterWidth={gutterWidth()}
						changeTrack={changeTrack()} scrollbar={scrollbar()} dragging={dragging()}
						onFocus={() => props.onFocus()}
						onDrag={(event) => {
							if (dragging()) dragTo(event.y);
					}}
					onDragEnd={() => setDragging(false)}
					onGutter={(el) => {
						gutter = el as GutterHost;
					}}
					onEditor={(el) => {
						editor = el;
						setEditorEl(el);
						ignoreScrollOutsideBounds(el);
						afterResize(el, () => {
							applyLineSigns();
							syncViewport();
							forgetWrapMap();
							applyWindow(true);
						});
						allowSelectionOnlyInEditor(el);
						onCleanup(releaseEditor);
					}}
						onContentChange={() => {
							if (!editor) return;
							history.record({ content: editor.plainText, cursor: cursorBeforeEdit }, Date.now());
							props.onChange(editor.plainText);
							scheduleHighlight();
						}}
						onMouse={() => applyWindow()}
						onCursorChange={() => {
							applyWindow();
							syncCursor();
						}}
						onJumpTrack={(row) => jumpToRow(row - (editor?.y ?? 0))}
						onStartScrollbarDrag={(y) => {
							setDragging(true);
							dragTo(y);
						}}
					onTrack={(el) => {
						track = el;
					}}
				/>
			</Show>
		</box>
	);
}

import type { KeyEvent, TextareaRenderable } from '@opentui/core';
import { latinKey } from '../core/keylayout';
import {
	lineEnd,
	lineStart,
	moveParagraphDown,
	moveParagraphUp,
	resolveTextObject,
	TEXT_OBJECT_TARGETS,
} from './vimObjects';

export type VimMode = 'normal' | 'insert' | 'visual';
type VisualKind = 'char' | 'line';
type FindKind = 'f' | 'F' | 't' | 'T';

export const MODE_LABELS: Record<VimMode, string> = {
	normal: 'NORMAL',
	insert: 'INSERT',
	visual: 'VISUAL',
};

/** Mutable state a vim session carries between keystrokes. */
export interface VimState {
	mode: VimMode;
	pending: string; // partial operator, e.g. "d" waiting for a motion, or "g"
	count: string; // numeric prefix, e.g. "12" in 12j
	register: string; // last yanked/deleted text
	registerLinewise: boolean;
	/** Offset the visual selection grows from; meaningless outside visual mode. */
	anchor: number;
	visualKind: VisualKind;
	pendingTextObject: 'i' | 'a' | null;
	textObjectOp: string;
	pendingFind: FindKind | null;
	findOp: '' | 'd' | 'c' | 'y';
	lastFind: { kind: FindKind; char: string } | null;
}

export function initialVimState(): VimState {
	return {
		mode: 'normal',
		pending: '',
		count: '',
		register: '',
		registerLinewise: false,
		anchor: 0,
		visualKind: 'char',
		pendingTextObject: null,
		textObjectOp: '',
		pendingFind: null,
		findOp: '',
		lastFind: null,
	};
}

export interface VimActions {
	undo: () => void;
	redo: () => void;
}

type Editor = TextareaRenderable;

function markVisual(editor: Editor, state: VimState): void {
	const cursor = editor.cursorOffset;
	if (state.visualKind === 'line') {
		const text = editor.plainText;
		const start = lineStart(text, Math.min(state.anchor, cursor));
		const end = lineEnd(text, Math.max(state.anchor, cursor));
		editor.setSelectionInclusive(start, Math.max(start, end));
		return;
	}
	editor.setSelectionInclusive(Math.min(state.anchor, cursor), Math.max(state.anchor, cursor));
}

const MOTION_KEYS = new Set([
	'h',
	'left',
	'l',
	'right',
	'j',
	'down',
	'k',
	'up',
	'w',
	'b',
	'0',
	'$',
	'G',
	'{',
	'}',
	';',
	',',
]);

const FIND_KEYS = new Set(['f', 'F', 't', 'T']);
const OPPOSITE: Record<FindKind, FindKind> = { f: 'F', F: 'f', t: 'T', T: 't' };

function motion(editor: Editor, k: string, state: VimState, count: number, counted: boolean) {
	if (!MOTION_KEYS.has(k)) return false;
	// A cursor move with a selection live collapses it instead of moving, so in visual
	// mode the selection is dropped first and painted again from the anchor after.
	if (state.mode === 'visual') editor.clearSelection();
	const repeat = (fn: () => void) => {
		for (let i = 0; i < count; i++) fn();
	};

	switch (k) {
		case 'h':
		case 'left':
			repeat(() => editor.moveCursorLeft());
			return true;
		case 'l':
		case 'right':
			repeat(() => editor.moveCursorRight());
			return true;
		case 'j':
		case 'down':
			repeat(() => editor.moveCursorDown());
			return true;
		case 'k':
		case 'up':
			repeat(() => editor.moveCursorUp());
			return true;
		case 'w':
			repeat(() => editor.moveWordForward());
			return true;
		case 'b':
			repeat(() => editor.moveWordBackward());
			return true;
		case '0':
			editor.gotoLineHome();
			return true;
		case '$':
			editor.gotoLineEnd();
			return true;
		case 'G':
			if (counted) editor.gotoLine(count - 1);
			else editor.gotoBufferEnd();
			return true;
		case '{':
			moveParagraphUp(editor, count);
			return true;
		case '}':
			moveParagraphDown(editor, count);
			return true;
		case ';':
		case ',': {
			const last = state.lastFind;
			if (last) {
				runFind(
					editor,
					state,
					k === ';' ? last.kind : OPPOSITE[last.kind],
					last.char,
					count,
					true,
					'',
				);
			}
			return true;
		}
		default:
			return false;
	}
}

function yankSelection(editor: Editor, state: VimState): void {
	const text = editor.getSelectedText();
	if (text) {
		state.register = text;
		state.registerLinewise = false;
	}
}

function yankLines(editor: Editor, state: VimState, count: number): void {
	const { row } = editor.logicalCursor;
	state.register = `${editor.plainText
		.split('\n')
		.slice(row, row + count)
		.join('\n')}\n`;
	state.registerLinewise = true;
}

function deleteLine(editor: Editor, state: VimState, count: number): void {
	yankLines(editor, state, count);
	for (let i = 0; i < count; i++) editor.deleteLine();
}

const OPERATOR_TARGETS: Record<string, (editor: Editor, count: number) => void> = {
	w: (e, n) => {
		for (let i = 0; i < n; i++) e.deleteWordForward();
	},
	b: (e, n) => {
		for (let i = 0; i < n; i++) e.deleteWordBackward();
	},
	$: (e) => e.deleteToLineEnd(),
	0: (e) => e.deleteToLineStart(),
};

function findTarget(
	text: string,
	cursor: number,
	kind: FindKind,
	char: string,
	count: number,
	repeat: boolean,
): number | null {
	const forward = kind === 'f' || kind === 't';
	const from = lineStart(text, cursor);
	const to = lineEnd(text, cursor);
	const skip = repeat && (kind === 't' || kind === 'T') ? 1 : 0;
	let left = count;
	for (let i = forward ? cursor + 1 + skip : cursor - 1 - skip; forward ? i <= to : i >= from;) {
		if (text[i] === char && --left === 0) {
			if (kind === 'f' || kind === 'F') return i;
			const target = kind === 't' ? i - 1 : i + 1;
			return target === cursor ? null : target;
		}
		i += forward ? 1 : -1;
	}
	return null;
}

function runFind(
	editor: Editor,
	state: VimState,
	kind: FindKind,
	char: string,
	count: number,
	repeat: boolean,
	op: '' | 'd' | 'c' | 'y',
): void {
	const cursor = editor.cursorOffset;
	const target = findTarget(editor.plainText, cursor, kind, char, count, repeat);
	if (target === null) return;
	if (state.mode === 'visual') editor.clearSelection();
	if (!op) {
		editor.cursorOffset = target;
		return;
	}
	const forward = kind === 'f' || kind === 't';
	const start = forward ? cursor : target;
	const end = forward ? target : cursor - 1;
	if (end < start) return;
	editor.setSelectionInclusive(start, end);
	yankSelection(editor, state);
	if (op === 'y') {
		editor.clearSelection();
		editor.cursorOffset = start;
		return;
	}
	editor.deleteSelection();
	state.mode = op === 'c' ? 'insert' : 'normal';
}

function atLineEnd(editor: Editor): boolean {
	const { row, col } = editor.logicalCursor;
	return col >= (editor.plainText.split('\n')[row]?.length ?? 0);
}

function clampToLine(editor: Editor, state: VimState): void {
	if (state.mode === 'insert') return;
	if (atLineEnd(editor) && editor.logicalCursor.col > 0) editor.moveCursorLeft();
}

function paste(editor: Editor, state: VimState, before: boolean): void {
	if (!state.register) return;
	if (state.registerLinewise) {
		if (before) editor.gotoLineStart();
		else {
			editor.gotoLineEnd();
			editor.newLine();
		}
		// The register already ends in a newline; drop it so we don't add a blank line.
		editor.insertText(state.register.replace(/\n$/, ''));
		if (before) {
			editor.newLine();
			editor.moveCursorUp();
		}
	} else {
		// `p` puts the text after the character under the cursor — but the caret can sit
		// past the last one, where stepping right would carry the paste onto the next
		// line. At the end of a line there is nothing to step over.
		if (!before && !atLineEnd(editor)) editor.moveCursorRight();
		editor.insertText(state.register);
	}
}

export function handleVimKey(
	editor: Editor,
	key: KeyEvent,
	state: VimState,
	actions: VimActions,
): boolean {
	const consumed = dispatch(editor, key, state, actions);
	const visual = state.mode === 'visual';
	if (visual) editor.clearSelection();
	clampToLine(editor, state);
	if (visual) markVisual(editor, state);
	return consumed;
}

function dispatch(editor: Editor, key: KeyEvent, state: VimState, actions: VimActions): boolean {
	const pressed = latinKey(key);
	const k = key.shift && /^[a-z]$/.test(pressed) ? pressed.toUpperCase() : pressed;
	if (state.mode === 'insert') {
		if (k === 'escape') {
			state.mode = 'normal';
			editor.moveCursorLeft();
			return true;
		}
		return false;
	}

	if (state.pendingFind) {
		const kind = state.pendingFind;
		const op = state.findOp;
		const digits = state.count;
		state.pendingFind = null;
		state.findOp = '';
		state.count = '';
		if (key.ctrl || k.length !== 1) return true;
		const char = key.sequence.length === 1 ? key.sequence : key.name;
		state.lastFind = { kind, char };
		runFind(editor, state, kind, char, Math.max(1, Number.parseInt(digits || '1', 10)), false, op);
		return true;
	}

	if (key.ctrl) {
		if (k === 'r') {
			actions.redo();
			return true;
		}
		if (k === 'd' || k === 'u') {
			for (let i = 0; i < 10; i++) {
				if (k === 'd') editor.moveCursorDown();
				else editor.moveCursorUp();
			}
			return true;
		}
		return false;
	}

	if (/^\d$/.test(k) && !(k === '0' && state.count === '')) {
		state.count += k;
		return true;
	}
	const digits = state.count;
	state.count = '';
	const count = Math.max(1, Number.parseInt(digits || '1', 10));

	if (state.pending) {
		const op = state.pending;
		state.pending = '';
		if ((k === 'i' || k === 'a') && !state.pendingTextObject) {
			state.textObjectOp = op;
			state.pendingTextObject = k;
			state.count = digits;
			return true;
		}
		if (op === 'd' || op === 'c' || op === 'y') {
			if (FIND_KEYS.has(k)) {
				state.pendingFind = k as FindKind;
				state.findOp = op;
				state.count = digits;
				return true;
			}
			if ((k === ';' || k === ',') && state.lastFind) {
				const last = state.lastFind;
				runFind(
					editor,
					state,
					k === ';' ? last.kind : OPPOSITE[last.kind],
					last.char,
					count,
					true,
					op,
				);
				return true;
			}
		}
		if (op === 'g') {
			if (k === 'g') {
				if (digits) editor.gotoLine(count - 1);
				else editor.gotoBufferHome();
				if (state.mode === 'visual') markVisual(editor, state);
			}
			return true;
		}
		if (k === op) {
			// dd / yy / cc — linewise
			if (op === 'd') deleteLine(editor, state, count);
			else if (op === 'y') yankLines(editor, state, count);
			else if (op === 'c') {
				editor.gotoLineStart();
				editor.deleteToLineEnd();
				state.mode = 'insert';
			}
			return true;
		}
		if (op === 'd' || op === 'c') {
			const cut = OPERATOR_TARGETS[k];
			if (cut) {
				cut(editor, count);
				if (op === 'c') state.mode = 'insert';
			}
		}
		return true; // an unknown operator target is swallowed, never passed on
	}

	if (state.pendingTextObject) {
		if (TEXT_OBJECT_TARGETS.has(k)) {
			resolveTextObject(editor, k, state);
			state.pendingTextObject = null;
			const op = state.textObjectOp;
			state.textObjectOp = '';
			if (op) {
				const start = Math.min(state.anchor, editor.cursorOffset);
				const end = Math.max(state.anchor, editor.cursorOffset);
				editor.setSelectionInclusive(start, end);
				if (op === 'd' || op === 'x') {
					yankSelection(editor, state);
					editor.deleteSelection();
					state.mode = 'normal';
				} else if (op === 'y') {
					yankSelection(editor, state);
					editor.clearSelection();
					state.mode = 'normal';
				} else if (op === 'c') {
					yankSelection(editor, state);
					editor.deleteSelection();
					state.mode = 'insert';
				}
			} else if (state.mode === 'visual') {
				editor.clearSelection();
				const cursor = editor.cursorOffset;
				editor.setSelectionInclusive(
					Math.min(state.anchor, cursor),
					Math.max(state.anchor, cursor),
				);
			}
			return true;
		}
		state.textObjectOp = '';
		state.pendingTextObject = null;
	}

	if (FIND_KEYS.has(k)) {
		state.pendingFind = k as FindKind;
		state.count = digits;
		return true;
	}

	if (motion(editor, k, state, count, digits !== '')) {
		if (state.mode === 'visual') markVisual(editor, state);
		return true;
	}

	if (state.mode === 'visual') {
		if (k === 'i' || k === 'a') {
			state.pendingTextObject = k;
			return true;
		}

		const start = Math.min(state.anchor, editor.cursorOffset);
		if (state.visualKind === 'line') {
			const text = editor.plainText;
			const lines = text.split('\n');
			const cursorRow = editor.logicalCursor.row;
			const anchorRow = text.slice(0, state.anchor).split('\n').length - 1;
			const rowStart = Math.min(anchorRow, cursorRow);
			const rowCount = Math.abs(anchorRow - cursorRow) + 1;

			editor.clearSelection();
			switch (k) {
				case 'escape':
					state.mode = 'normal';
					break;
				case 'd':
				case 'x':
				case 'c':
					editor.gotoLine(rowStart);
					deleteLine(editor, state, rowCount);
					state.mode = k === 'c' ? 'insert' : 'normal';
					break;
				case 'y':
					state.register = `${lines.slice(rowStart, rowStart + rowCount).join('\n')}\n`;
					state.registerLinewise = true;
					editor.cursorOffset = start;
					state.mode = 'normal';
					break;
			}
			return true;
		}
		switch (k) {
			case 'escape':
				editor.clearSelection();
				state.mode = 'normal';
				break;
			case 'd':
			case 'x':
				yankSelection(editor, state);
				editor.deleteSelection();
				state.mode = 'normal';
				break;
			case 'y':
				yankSelection(editor, state);
				editor.clearSelection();
				editor.cursorOffset = start;
				state.mode = 'normal';
				break;
			case 'c':
				yankSelection(editor, state);
				editor.deleteSelection();
				state.mode = 'insert';
				break;
		}
		return true;
	}

	switch (k) {
		case 'i':
			state.mode = 'insert';
			break;
		case 'a':
			editor.moveCursorRight();
			state.mode = 'insert';
			break;
		case 'I':
			editor.gotoLineStart();
			state.mode = 'insert';
			break;
		case 'A':
			editor.gotoLineEnd();
			state.mode = 'insert';
			break;
		case 'o':
			editor.gotoLineEnd();
			editor.newLine();
			state.mode = 'insert';
			break;
		case 'O':
			editor.gotoLineStart();
			editor.newLine();
			editor.moveCursorUp();
			state.mode = 'insert';
			break;
		case 'v':
			state.visualKind = 'char';
			state.mode = 'visual';
			state.anchor = editor.cursorOffset;
			markVisual(editor, state);
			break;
		case 'V':
			state.visualKind = 'line';
			state.mode = 'visual';
			state.anchor = lineStart(editor.plainText, editor.cursorOffset);
			markVisual(editor, state);
			break;
		case 'x':
			for (let i = 0; i < count; i++) {
				if (atLineEnd(editor)) {
					if (editor.logicalCursor.col === 0) break; // empty line: nothing to take
					editor.moveCursorLeft();
				}
				editor.deleteChar();
			}
			break;
		case 'D':
			editor.deleteToLineEnd();
			break;
		case 'C':
			editor.deleteToLineEnd();
			state.mode = 'insert';
			break;
		case 'u':
			for (let i = 0; i < count; i++) actions.undo();
			break;
		case 'p':
			paste(editor, state, false);
			break;
		case 'P':
			paste(editor, state, true);
			break;
		case 'd':
		case 'c':
		case 'y':
		case 'g':
			state.pending = k;
			state.count = digits; // the motion after the operator still needs it
			return true;
		case 'escape':
			break;
		default:
			return true; // swallow unknown keys so they never reach the buffer
	}
	return true;
}

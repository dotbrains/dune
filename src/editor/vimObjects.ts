import type { TextareaRenderable } from '@opentui/core';

type Editor = TextareaRenderable;

export type TextObjectState = {
	anchor: number;
	pendingTextObject: 'i' | 'a' | null;
	textObjectOp: string;
};

/** First character offset of the line containing `offset`. */
export function lineStart(text: string, offset: number): number {
	return text.lastIndexOf('\n', offset - 1) + 1;
}

/** Last character offset of the line containing `offset`, before the newline. */
export function lineEnd(text: string, offset: number): number {
	const idx = text.indexOf('\n', offset);
	return idx >= 0 ? Math.max(0, idx - 1) : text.length - 1;
}

export function moveParagraphUp(editor: Editor, count: number): void {
	const lines = editor.plainText.split('\n');
	let row = editor.logicalCursor.row;
	for (let n = 0; n < count; n++) {
		if (row <= 0) break;
		row--;
		while (row > 0 && lines[row]!.trim() !== '') row--;
	}
	editor.gotoLine(row);
}

export function moveParagraphDown(editor: Editor, count: number): void {
	const lines = editor.plainText.split('\n');
	let row = editor.logicalCursor.row;
	const maxRow = lines.length - 1;
	for (let n = 0; n < count; n++) {
		if (row >= maxRow) break;
		row++;
		while (row < maxRow && lines[row]!.trim() !== '') row++;
	}
	editor.gotoLine(Math.min(row, maxRow));
}

const PAIR_OPEN: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
const PAIR_CLOSE: Record<string, string> = { '}': '{', ')': '(', ']': '[' };
export const TEXT_OBJECT_TARGETS = new Set(['{', '}', '(', ')', '[', ']']);

function findEnclosingPair(
	text: string,
	cursor: number,
	open: string,
	close: string,
): { open: number; close: number } | null {
	let depth = 1;
	let openIdx = -1;
	const start = cursor > 0 && text[cursor] === close ? cursor - 1 : cursor;
	for (let i = start; i >= 0; i--) {
		if (text[i] === close) depth++;
		else if (text[i] === open) {
			depth--;
			if (depth === 0) {
				openIdx = i;
				break;
			}
		}
	}
	if (openIdx === -1) return null;

	depth = 1;
	let closeIdx = -1;
	for (let i = openIdx + 1; i < text.length; i++) {
		if (text[i] === open) depth++;
		else if (text[i] === close) {
			depth--;
			if (depth === 0) {
				closeIdx = i;
				break;
			}
		}
	}
	if (closeIdx === -1) return null;
	return { open: openIdx, close: closeIdx };
}

export function resolveTextObject(editor: Editor, k: string, state: TextObjectState): boolean {
	if (!TEXT_OBJECT_TARGETS.has(k)) return false;
	const open = k in PAIR_OPEN ? k : PAIR_CLOSE[k]!;
	const close = PAIR_OPEN[open]!;
	const pair = findEnclosingPair(editor.plainText, editor.cursorOffset, open, close);
	if (!pair) {
		state.textObjectOp = '';
		return true;
	}

	if (state.pendingTextObject === 'i') {
		if (pair.open + 1 >= pair.close) {
			state.textObjectOp = '';
			return true;
		}
		state.anchor = pair.open + 1;
		editor.cursorOffset = pair.close - 1;
	} else {
		state.anchor = pair.open;
		editor.cursorOffset = pair.close;
	}
	return true;
}

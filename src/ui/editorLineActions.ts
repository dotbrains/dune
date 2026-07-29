import type { TextareaRenderable } from '@opentui/core';
import { duplicateLines, moveLines, toggleComment } from '../editor/lines';
import type { History } from '../editor/history';
import { commentPrefix } from '../languages';

const rowOfOffset = (text: string, offset: number) => {
	let row = 0;
	for (let at = text.indexOf('\n'); at >= 0 && at < offset; at = text.indexOf('\n', at + 1)) row++;
	return row;
};

export function createEditorLineActions(deps: {
	editor: () => TextareaRenderable | undefined;
	filetype: () => string | undefined;
	history: History;
	onChange: (text: string) => void;
	rehighlight: (text: string) => void;
	scheduleCursorSync: () => void;
}) {
	const editRange = (text: string) => {
		const editor = deps.editor();
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
		const editor = deps.editor();
		if (!editor) return;
		editor.setText(content);
		editor.setCursor(row, col);
		deps.onChange(content);
		deps.rehighlight(content);
		deps.scheduleCursorSync();
	};

	const toggleCommentLines = () => {
		const editor = deps.editor();
		if (!editor) return;
		const prefix = commentPrefix(deps.filetype());
		if (!prefix) return;
		const text = editor.plainText;
		const { from, to } = editRange(text);
		const next = toggleComment(text, from, to, prefix);
		const { row, col } = editor.logicalCursor;
		if (next !== text) applyLineEdit(next, row, col);
	};

	const moveSelectedLines = (delta: -1 | 1) => {
		const editor = deps.editor();
		if (!editor) return;
		const text = editor.plainText;
		const { from, to } = editRange(text);
		const { row, col } = editor.logicalCursor;
		const next = moveLines(text, from, to, delta);
		if (next !== null) applyLineEdit(next, row + delta, col);
	};

	const duplicateSelectedLines = (follow: boolean) => {
		const editor = deps.editor();
		if (!editor) return;
		const text = editor.plainText;
		const { from, to } = editRange(text);
		const { row, col } = editor.logicalCursor;
		applyLineEdit(duplicateLines(text, from, to), follow ? row + (to - from + 1) : row, col);
	};

	const stepHistory = (kind: 'undo' | 'redo') => {
		const editor = deps.editor();
		if (!editor) return;
		const at = kind === 'undo' ? deps.history.undo() : deps.history.redo();
		if (!at) return;
		editor.setText(at.content);
		editor.cursorOffset = Math.min(at.cursor, at.content.length);
		deps.onChange(at.content);
		deps.rehighlight(at.content);
		deps.scheduleCursorSync();
	};

	return { duplicateSelectedLines, moveSelectedLines, stepHistory, toggleCommentLines };
}

import type { CompletionItem, CompletionList, Position, Range } from './protocol';

export interface CompletionReply {
	items: CompletionItem[];
	isIncomplete: boolean;
}

export interface CompletionMatch {
	item: CompletionItem;
	score: number;
	positions: number[];
}

export type KindGroup = 'fn' | 'var' | 'type' | 'module' | 'keyword' | 'text';

const KIND_GROUPS: Record<number, { glyph: string; group: KindGroup }> = {
	1: { glyph: '·', group: 'text' },
	2: { glyph: 'ƒ', group: 'fn' },
	3: { glyph: 'ƒ', group: 'fn' },
	4: { glyph: 'ƒ', group: 'fn' },
	5: { glyph: '◦', group: 'var' },
	6: { glyph: 'ν', group: 'var' },
	7: { glyph: '◆', group: 'type' },
	8: { glyph: '◇', group: 'type' },
	9: { glyph: '⧉', group: 'module' },
	10: { glyph: '◦', group: 'var' },
	11: { glyph: '#', group: 'var' },
	12: { glyph: 'π', group: 'var' },
	13: { glyph: 'Σ', group: 'type' },
	14: { glyph: 'κ', group: 'keyword' },
	15: { glyph: '⌗', group: 'text' },
	16: { glyph: '□', group: 'var' },
	17: { glyph: '⧉', group: 'module' },
	18: { glyph: '→', group: 'module' },
	19: { glyph: '⧉', group: 'module' },
	20: { glyph: 'Σ', group: 'var' },
	21: { glyph: 'π', group: 'var' },
	22: { glyph: '◆', group: 'type' },
	23: { glyph: '⚡︎', group: 'fn' },
	24: { glyph: '±', group: 'fn' },
	25: { glyph: 'τ', group: 'type' },
};

const WORD = /[A-Za-z0-9_$]/;
const SNIPPET = /\$(?:(\d+)|\{(\d+)(?::((?:[^{}]|\{[^}]*\})*))?(?:\|([^,|]*)[^}]*)?\})/g;

export function normalizeCompletion(result: unknown): CompletionReply | null {
	if (result == null) return null;
	if (Array.isArray(result)) return { items: result as CompletionItem[], isIncomplete: false };
	const list = result as CompletionList;
	if (!Array.isArray(list.items)) return null;
	return { items: list.items, isIncomplete: list.isIncomplete === true };
}

export function isWordChar(char: string): boolean {
	return WORD.test(char);
}

export function wordStart(text: string, col: number): number {
	let at = Math.min(col, text.length);
	while (at > 0 && isWordChar(text[at - 1]!)) at--;
	return at;
}

export function fuzzyMatch(
	query: string,
	text: string,
): { score: number; positions: number[] } | null {
	if (query.length === 0) return { score: 0, positions: [] };
	const lowerQuery = query.toLowerCase();
	const lowerText = text.toLowerCase();
	const positions: number[] = [];
	let score = 0;
	let searchAt = 0;
	for (let q = 0; q < lowerQuery.length; q++) {
		const found = lowerText.indexOf(lowerQuery[q]!, searchAt);
		if (found < 0) return null;
		const prev = text[found - 1];
		const boundary =
			found === 0 ||
			prev === '_' ||
			prev === '-' ||
			prev === '.' ||
			(Boolean(prev) && text[found]! >= 'A' && text[found]! <= 'Z' && prev! >= 'a' && prev! <= 'z');
		if (boundary) score += 8;
		if (positions.at(-1) === found - 1) score += 6;
		if (text[found] === query[q]) score += 1;
		score -= found - searchAt;
		positions.push(found);
		searchAt = found + 1;
	}
	return { score: score - Math.floor(text.length / 8), positions };
}

export function filterCompletions(items: CompletionItem[], prefix: string): CompletionMatch[] {
	const matches: CompletionMatch[] = [];
	for (const item of items) {
		const target = item.filterText ?? item.label;
		const match = fuzzyMatch(prefix, target);
		if (!match) continue;
		matches.push({
			item,
			score: match.score,
			positions: target === item.label ? match.positions : [],
		});
	}
	return matches.toSorted(
		(a, b) =>
			b.score - a.score ||
			(a.item.sortText ?? a.item.label).localeCompare(b.item.sortText ?? b.item.label) ||
			a.item.label.length - b.item.label.length,
	);
}

export function kindInfo(kind: number | undefined): { glyph: string; group: KindGroup } {
	return KIND_GROUPS[kind ?? 1] ?? { glyph: '·', group: 'text' };
}

export function stripSnippet(text: string): { text: string; caret: number | null } {
	let out = '';
	let at = 0;
	let caret: number | null = null;
	for (let hit = SNIPPET.exec(text); hit; hit = SNIPPET.exec(text)) {
		out += text.slice(at, hit.index);
		if (caret === null) caret = out.length;
		out += hit[3] ?? hit[4] ?? '';
		at = hit.index + hit[0].length;
	}
	out += text.slice(at);
	return { text: out, caret: caret === out.length ? null : caret };
}

function offsetOf(content: string, position: Position): number {
	let offset = 0;
	for (let line = 0; line < position.line; line++) {
		const next = content.indexOf('\n', offset);
		if (next < 0) return content.length;
		offset = next + 1;
	}
	const lineEnd = content.indexOf('\n', offset);
	return Math.min(offset + position.character, lineEnd < 0 ? content.length : lineEnd);
}

function positionOf(content: string, offset: number): Position {
	let line = 0;
	let lineStart = 0;
	for (let at = content.indexOf('\n'); at >= 0 && at < offset; at = content.indexOf('\n', at + 1)) {
		line++;
		lineStart = at + 1;
	}
	return { line, character: offset - lineStart };
}

function editRange(item: CompletionItem, cursor: Position, anchorCol: number): Range {
	if (item.textEdit) {
		if ('range' in item.textEdit) return item.textEdit.range;
		return item.textEdit.replace;
	}
	return { start: { line: cursor.line, character: anchorCol }, end: cursor };
}

export function applyCompletion(
	content: string,
	cursor: Position,
	anchorCol: number,
	item: CompletionItem,
): { content: string; cursor: Position } {
	const raw = item.textEdit?.newText ?? item.insertText ?? item.label;
	const prepared =
		item.insertTextFormat === 2 || raw.includes('$')
			? stripSnippet(raw)
			: { text: raw, caret: null };
	let range = editRange(item, cursor, anchorCol);
	if (
		range.start.line === cursor.line &&
		range.end.line === cursor.line &&
		range.end.character < cursor.character
	) {
		range = { start: range.start, end: cursor };
	}
	const edits = [
		{
			start: offsetOf(content, range.start),
			end: offsetOf(content, range.end),
			text: prepared.text,
			primary: true,
		},
		...(item.additionalTextEdits ?? []).map((edit) => ({
			start: offsetOf(content, edit.range.start),
			end: offsetOf(content, edit.range.end),
			text: edit.newText,
			primary: false,
		})),
	].toSorted((a, b) => b.start - a.start || b.end - a.end);

	let next = content;
	for (const edit of edits) next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
	const primary = edits.find((edit) => edit.primary)!;
	const beforeDelta = edits
		.filter((edit) => !edit.primary && edit.end <= primary.start)
		.reduce((sum, edit) => sum + edit.text.length - (edit.end - edit.start), 0);
	const cursorOffset = primary.start + beforeDelta + (prepared.caret ?? prepared.text.length);
	return { content: next, cursor: positionOf(next, cursorOffset) };
}

export function matchRuns(
	label: string,
	positions: number[],
): Array<{ text: string; hit: boolean }> {
	if (positions.length === 0) return [{ text: label, hit: false }];
	const hits = new Set(positions);
	const runs: Array<{ text: string; hit: boolean }> = [];
	let at = 0;
	while (at < label.length) {
		const hit = hits.has(at);
		let end = at + 1;
		while (end < label.length && hits.has(end) === hit) end++;
		runs.push({ text: label.slice(at, end), hit });
		at = end;
	}
	return runs;
}

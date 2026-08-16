/**
 * What the completion menu's detail panel holds — pure computation, so
 * `test/completion.test.ts` can exercise it without rendering. `EditorPane`
 * needs the rows to size the box; `CompletionMenu` needs them to draw.
 */
import { hasInfo } from '../lsp/completion';
import type { ItemInfo } from '../lsp/completion';
import { wrapText } from './modal';

/** Rows the detail panel under the list may take, signature included. */
export const DOC_ROWS = 9;
/** Rows a wrapped signature is always granted, however long the docs are. */
const SIG_ROWS = 3;
/** A panel narrower than this wraps a signature into confetti. */
export const DOC_WIDTH = 56;

/**
 * One row of a wrapped signature. `start` is where the row begins in the
 * flattened signature, which is what lets the panel paint it: the highlighter
 * parses that one string and the spans are sliced back onto these rows.
 */
export interface SignatureLine {
	text: string;
	start: number;
}

export interface PanelLayout {
	/** Rows reserved for the panel, filled or not; 0 when there is none. */
	panelRows: number;
	/** The selected item's signature, wrapped to the panel. */
	signature: SignatureLine[];
	/** Its documentation, wrapped, blank rows kept where paragraphs break. */
	documentation: string[];
	/** Where the symbol comes from, drawn only into a row that would be blank. */
	origin: string;
}

const EMPTY_PANEL: PanelLayout = { panelRows: 0, signature: [], documentation: [], origin: '' };

/**
 * `wrapText` over a single-spaced string, with each row's offset into it. The
 * offsets are only meaningful because `itemInfo` collapsed the signature's
 * whitespace: a row break costs exactly the one space it replaces, so a row's
 * characters sit contiguously in the source the panel colours from.
 */
function wrapSignature(text: string, width: number): SignatureLine[] {
	const lines: SignatureLine[] = [];
	let line = '';
	let start = 0;
	for (const match of text.matchAll(/\S+/g)) {
		const word = match[0]!;
		const at = match.index;
		if (line && line.length + 1 + word.length > width) {
			lines.push({ text: line, start });
			line = '';
		}
		if (word.length > width) {
			if (line) lines.push({ text: line, start });
			for (let from = 0; from < word.length; from += width) {
				lines.push({ text: word.slice(from, from + width), start: at + from });
			}
			line = '';
			continue;
		}
		if (!line) start = at;
		line = line ? `${line} ${word}` : word;
	}
	if (line) lines.push({ text: line, start });
	return lines;
}

/** Wrap `text` to `width`, keeping the blank rows that separate paragraphs. */
function wrapBlock(text: string, width: number): string[] {
	const lines: string[] = [];
	for (const paragraph of text.split('\n')) {
		if (paragraph.trim().length === 0) {
			if (lines.length > 0) lines.push('');
		} else lines.push(...wrapText(paragraph, width));
	}
	return lines;
}

/** First `rows` of `lines`, the cut marked so the panel does not read as whole. */
function capped(lines: string[], rows: number): string[] {
	if (rows <= 0) return [];
	if (lines.length <= rows) return lines;
	const kept = lines.slice(0, rows);
	kept[rows - 1] = `${kept[rows - 1]!.slice(0, Math.max(0, kept[rows - 1]!.length - 1))}…`;
	return kept;
}

/**
 * `maxRows` is the room actually left for the panel once the list, its
 * chrome, and the panel's own divider are paid for by the caller — under two
 * rows it is not worth the divider, so the caller should pass 0 or less then.
 *
 * The panel's height is reserved rather than measured: an item's docs change
 * on every keystroke, and a box that resized itself around them would jump
 * under the cursor faster than it could be read.
 */
export function layoutPanel(info: ItemInfo | null, boxWidth: number, maxRows: number): PanelLayout {
	if (maxRows < 2) return EMPTY_PANEL;
	// Reserved whether `info` has anything yet or not: a server resolves the
	// selected item on its own, and a panel that only appeared once the reply
	// landed would resize the box under the cursor on every selection change.
	const panelRows = maxRows;
	if (!hasInfo(info)) return { panelRows, signature: [], documentation: [], origin: '' };
	// Border (2) and the leading space every panel row is drawn with (1).
	const width = Math.max(1, boxWidth - 3);
	const wrapped = info.detail ? wrapSignature(info.detail, width) : [];
	const docs = wrapBlock(info.documentation, width);
	// The signature takes whatever the documentation leaves. Capping it at
	// SIG_ROWS regardless spends the rest of a reserved panel on blank filler
	// while the signature it had room for ends in an ellipsis — which is most
	// items, a TypeScript generic being several rows and its doc comment one.
	const rows = capped(
		wrapped.map((line) => line.text),
		Math.min(Math.max(SIG_ROWS, panelRows - docs.length), panelRows),
	);
	const signature = rows.map((text, at) => ({ text, start: wrapped[at]!.start }));
	const documentation = capped(docs, panelRows - signature.length);
	// Only ever into a row that was going to be drawn blank: the origin is the
	// least of what the panel has to say, and moving the rest down for it would
	// cost documentation the user was reading.
	const origin =
		panelRows > signature.length + documentation.length && info.source
			? info.source.slice(0, width)
			: '';
	return { panelRows, signature, documentation, origin };
}

const OURS = /^<{7}(?: (.*))?\r?$/;
const BASE = /^\|{7}(?: (.*))?\r?$/;
const SEPARATOR = /^={7}\r?$/;
const THEIRS = /^>{7}(?: (.*))?\r?$/;

export interface MergeConflict {
	start: number;
	base: number | null;
	separator: number;
	end: number;
	ours: string;
	theirs: string;
}

export type ConflictSide = 'ours' | 'theirs' | 'both';

export function parseConflicts(text: string): MergeConflict[] {
	if (!text.startsWith('<<<<<<<') && !text.includes('\n<<<<<<<')) return [];
	const lines = text.split('\n');
	const found: MergeConflict[] = [];
	let open: { start: number; ours: string; base: number | null; separator: number | null } | null =
		null;

	for (const [at, line] of lines.entries()) {
		const ours = OURS.exec(line);
		if (ours) {
			open = { start: at, ours: ours[1] ?? '', base: null, separator: null };
			continue;
		}
		if (!open) continue;
		if (BASE.test(line)) {
			open.base ??= at;
			continue;
		}
		if (SEPARATOR.test(line)) {
			open.separator ??= at;
			continue;
		}
		const theirs = THEIRS.exec(line);
		if (!theirs) continue;
		if (open.separator !== null) {
			found.push({
				start: open.start,
				base: open.base,
				separator: open.separator,
				end: at,
				ours: open.ours,
				theirs: theirs[1] ?? '',
			});
		}
		open = null;
	}

	return found;
}

export const conflictAt = (
	conflicts: readonly MergeConflict[],
	line: number,
): MergeConflict | null =>
	conflicts.find((conflict) => line >= conflict.start && line <= conflict.end) ?? null;

export function conflictFrom(
	conflicts: readonly MergeConflict[],
	line: number,
	direction: 1 | -1,
): MergeConflict | null {
	if (conflicts.length === 0) return null;
	if (direction === 1) return conflicts.find((conflict) => conflict.start > line) ?? conflicts[0]!;
	return conflicts.findLast((conflict) => conflict.start < line) ?? conflicts.at(-1)!;
}

function lineOffsets(text: string): number[] {
	const offsets = [0];
	for (let at = text.indexOf('\n'); at >= 0; at = text.indexOf('\n', at + 1)) offsets.push(at + 1);
	offsets.push(text.length + 1);
	return offsets;
}

export function resolveConflict(text: string, conflict: MergeConflict, side: ConflictSide): string {
	const offsets = lineOffsets(text);
	const at = (line: number) => offsets[Math.min(line, offsets.length - 1)] ?? text.length;
	const ours = text.slice(at(conflict.start + 1), at(conflict.base ?? conflict.separator));
	const theirs = text.slice(at(conflict.separator + 1), at(conflict.end));
	const kept = side === 'ours' ? ours : side === 'theirs' ? theirs : ours + theirs;
	return text.slice(0, at(conflict.start)) + kept + text.slice(at(conflict.end + 1));
}

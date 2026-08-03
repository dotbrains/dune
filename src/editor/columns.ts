const TAB_CELLS = 2;

export function cellColumn(line: string, col: number): number {
	const stop = Math.min(col, line.length);
	let cells = col - stop;
	for (let at = 0; at < stop; at++) cells += line.charCodeAt(at) === 9 ? TAB_CELLS : 1;
	return cells;
}

export function inCells<T extends { start: number; end: number }>(span: T, line: string): T {
	if (!line.includes('\t')) return span;
	return { ...span, start: cellColumn(line, span.start), end: cellColumn(line, span.end) };
}

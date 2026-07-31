import type { TextareaRenderable } from '@opentui/core';
import type { ProblemSeverity } from '../lsp/protocol';

export interface ProblemNote {
	top: number;
	left: number;
	text: string;
	severity: ProblemSeverity;
}

export function inlineProblemNotes(args: {
	editor: TextareaRenderable;
	host: { x: number; y: number; width: number };
	problems: Map<number, { severity: ProblemSeverity; message: string }>;
	top: number;
	height: number;
	sources: number[];
	widths: number[];
	rowAtLine: (line: number) => number;
}): ProblemNote[] {
	const notes: ProblemNote[] = [];
	for (const [line, problem] of args.problems) {
		const first = args.rowAtLine(line);
		if (args.sources[first] !== line) continue;
		let last = first;
		while (args.sources[last + 1] === line) last++;
		if (last < args.top || last >= args.top + args.height) continue;
		const left = args.editor.x - args.host.x + 1 + (args.widths[last] ?? 0) + 2;
		const room = args.host.width - left - 2;
		if (room < 8) continue;
		const message = problem.message.replaceAll(/\s+/g, ' ');
		notes.push({
			top: args.editor.y - args.host.y + (last - args.top),
			left,
			text: message.length > room ? `${message.slice(0, room - 1)}…` : message,
			severity: problem.severity,
		});
	}
	return notes;
}

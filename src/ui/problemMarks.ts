import type { LineChange } from '../core/git';
import type { ProblemSeverity } from '../lsp/protocol';
import { ui } from '../themes';

const SIGN_GLYPH: Record<LineChange, string> = { added: '▎', modified: '▎', deleted: '▁' };

export const problemColor = (severity: ProblemSeverity) =>
	severity === 'error' ? ui.error : severity === 'warning' ? ui.dirty : ui.dim;

export const problemGlyph = (severity: ProblemSeverity | undefined) =>
	severity === 'error' ? '●' : severity === 'warning' ? '▲' : ' ';

export function editorLineSigns(
	gitLines: Map<number, LineChange>,
	problems: Map<number, { severity: ProblemSeverity }>,
) {
	const gitColor: Record<LineChange, string> = {
		added: ui.gitAdded,
		modified: ui.gitModified,
		deleted: ui.gitDeleted,
	};
	const signs = new Map<number, { before?: string; beforeColor?: string }>();
	for (const [line, change] of gitLines) {
		signs.set(line, { before: SIGN_GLYPH[change], beforeColor: gitColor[change] });
	}
	for (const [line, problem] of problems) {
		signs.set(line, { before: '●', beforeColor: problemColor(problem.severity) });
	}
	return signs;
}

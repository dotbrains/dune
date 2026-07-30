import { createEffect, createMemo } from 'solid-js';
import type { Accessor, Setter } from 'solid-js';
import type { ProblemSeverity } from '../../lsp/protocol';
import { SEVERITY_RANK } from '../../lsp/protocol';
import type { Choice } from '../../ui/ChoiceModal';
import type { Focus } from '../types';
import type { Problem } from './index';

export type ProblemLine = { severity: ProblemSeverity; message: string };
export type ProblemChoice = Pick<Problem, 'path' | 'line' | 'col' | 'message' | 'severity'>;

export function activeProblemLines(problems: readonly Problem[] | undefined) {
	const lines = new Map<number, ProblemLine>();
	for (const problem of problems ?? []) {
		const held = lines.get(problem.line);
		if (!held || SEVERITY_RANK[problem.severity] < SEVERITY_RANK[held.severity]) {
			lines.set(problem.line, { severity: problem.severity, message: problem.message });
		}
	}
	return lines;
}

export function problemCounts(problems: readonly Problem[] | undefined) {
	let errors = 0;
	let warnings = 0;
	for (const problem of problems ?? []) {
		if (problem.severity === 'error') errors++;
		else if (problem.severity === 'warning') warnings++;
	}
	return { errors, warnings };
}

export function openProblemRows(paths: readonly string[], problems: Record<string, Problem[]>) {
	return paths.flatMap((path) =>
		(problems[path] ?? []).map((problem) => ({
			path,
			line: problem.line,
			col: problem.col,
			severity: problem.severity,
			message: problem.message,
		})),
	);
}

export function problemChoices(rootDir: string, rows: readonly ProblemChoice[]): Choice[] {
	return rows.map((problem, index) => ({
		id: String(index),
		label: `${problem.path.slice(rootDir.length + 1)}:${problem.line + 1}:${problem.col + 1} ${problem.severity}: ${problem.message.replaceAll(/\s+/g, ' ')}`,
	}));
}

export function createProblemUi(deps: {
	rootDir: string;
	problems: Record<string, Problem[]>;
	tabs: Accessor<string[]>;
	activePath: Accessor<string | null>;
	cursor: Accessor<{ line: number; col: number }>;
	problemsOpen: Accessor<boolean>;
	setProblemsOpen: Setter<boolean>;
	setGoto: Setter<{ line: number; col: number; key: number } | null>;
	setFocus: Setter<Focus>;
	openFile: (path: string) => void;
	say: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
	nextFrom: (
		list: readonly Problem[],
		line: number,
		col: number,
		direction: 1 | -1,
	) => Problem | null;
}) {
	const rows = createMemo(() => openProblemRows(deps.tabs(), deps.problems));
	const lines = createMemo(() => {
		const path = deps.activePath();
		return activeProblemLines(path ? deps.problems[path] : undefined);
	});
	const counts = createMemo(() => {
		const path = deps.activePath();
		return problemCounts(path ? deps.problems[path] : undefined);
	});
	const choices = createMemo(() => problemChoices(deps.rootDir, rows()));

	createEffect(() => {
		if (deps.problemsOpen() && rows().length === 0) deps.setProblemsOpen(false);
	});

	const jumpTo = (problem: ProblemChoice) => {
		if (problem.path !== deps.activePath()) deps.openFile(problem.path);
		deps.setGoto((prev) => ({ line: problem.line, col: problem.col, key: (prev?.key ?? 0) + 1 }));
		deps.setFocus('editor');
		deps.say(problem.message, 'warn');
	};
	const list = () => {
		if (rows().length === 0) return deps.say('No problems');
		deps.setProblemsOpen(true);
	};
	const next = (direction: 1 | -1) => {
		const path = deps.activePath();
		const problems = path ? deps.problems[path] : undefined;
		const cursor = deps.cursor();
		const target = problems ? deps.nextFrom(problems, cursor.line, cursor.col, direction) : null;
		if (!target) return deps.say('No problems in this file');
		jumpTo(target);
	};
	const pick = (id: string) => {
		const problem = rows()[Number(id)];
		deps.setProblemsOpen(false);
		if (problem) jumpTo(problem);
	};

	return { lines, counts, choices, list, next, pick };
}

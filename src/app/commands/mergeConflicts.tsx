import type { Accessor, Setter } from 'solid-js';
import { createSignal } from 'solid-js';

import {
	conflictAt,
	conflictFrom,
	parseConflicts,
	resolveConflict,
	type ConflictSide,
} from '../../core/git/conflicts';
import { MergeConflictModal } from '../../ui/overlays/MergeConflictModal';
import type { BufferState, Focus, GotoRequest } from '../types';

export function createMergeConflictActions(deps: {
	activePath: Accessor<string | null>;
	activeBuffer: Accessor<BufferState | undefined>;
	cursor: Accessor<{ line: number; col: number }>;
	applyBufferReplacement: (path: string, next: string) => void;
	setFocus: Setter<Focus>;
	setGoto: Setter<GotoRequest>;
	say: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
}) {
	const [choice, setChoice] = createSignal<{ ours: string; theirs: string } | null>(null);
	const activeConflicts = () => parseConflicts(deps.activeBuffer()?.content ?? '');
	const accept = (side: ConflictSide) => {
		const path = deps.activePath();
		const buffer = deps.activeBuffer();
		if (!path || !buffer) return deps.say('No active file', 'warn');
		const conflicts = parseConflicts(buffer.content);
		const currentConflict = conflictAt(conflicts, deps.cursor().line);
		if (!currentConflict) return deps.say('No merge conflict on this line', 'warn');
		const next = resolveConflict(buffer.content, currentConflict, side);
		deps.applyBufferReplacement(path, next);
		const remaining = parseConflicts(next).length;
		deps.say(
			remaining === 0
				? 'Resolved conflict'
				: `${remaining} conflict${remaining === 1 ? '' : 's'} left`,
		);
	};
	const choose = () => {
		const currentConflict = conflictAt(activeConflicts(), deps.cursor().line);
		if (!currentConflict) return deps.say('No merge conflict on this line', 'warn');
		setChoice({ ours: currentConflict.ours, theirs: currentConflict.theirs });
	};
	const next = (direction: 1 | -1) => {
		const conflicts = activeConflicts();
		const nextConflict = conflictFrom(conflicts, deps.cursor().line, direction);
		if (!nextConflict) return deps.say('No merge conflicts in this file', 'warn');
		const index = conflicts.indexOf(nextConflict) + 1;
		deps.setGoto((prev) => ({
			line: nextConflict.start,
			col: 0,
			key: (prev?.key ?? 0) + 1,
		}));
		deps.setFocus('editor');
		deps.say(
			`Conflict ${index} of ${conflicts.length}${nextConflict.ours || nextConflict.theirs ? `: ${nextConflict.ours || 'current'} vs ${nextConflict.theirs || 'incoming'}` : ''}`,
		);
	};
	const view = () => {
		const conflict = choice();
		if (!conflict) return null;
		return (
			<MergeConflictModal
				conflict={conflict}
				onPick={(side) => {
					setChoice(null);
					if (side === 'ours' || side === 'theirs' || side === 'both') accept(side);
				}}
				onCancel={() => setChoice(null)}
			/>
		);
	};
	return { accept, choose, next, open: choice, view };
}

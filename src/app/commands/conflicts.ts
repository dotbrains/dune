import type { Command, CommandActions } from '../commands';

export const conflictCommands = (actions: CommandActions): Command[] => [
	{
		id: 'editor.resolveConflict',
		label: 'Resolve conflict at cursor',
		run: actions.resolveMergeConflict,
	},
	{
		id: 'editor.acceptCurrentChange',
		label: 'Accept current change',
		run: actions.acceptCurrentChange,
	},
	{
		id: 'editor.acceptIncomingChange',
		label: 'Accept incoming change',
		run: actions.acceptIncomingChange,
	},
	{ id: 'editor.acceptBothChanges', label: 'Accept both changes', run: actions.acceptBothChanges },
	{ id: 'editor.nextConflict', label: 'Next conflict', run: actions.nextMergeConflict },
	{ id: 'editor.previousConflict', label: 'Previous conflict', run: actions.prevMergeConflict },
];

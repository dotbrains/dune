import { ChoiceModal } from '../ChoiceModal';

export function MergeConflictModal(props: {
	conflict: { ours: string; theirs: string };
	onPick: (side: string) => void;
	onCancel: () => void;
}) {
	return (
		<ChoiceModal
			title="Merge conflict"
			message="Choose which side to keep for the conflict under the cursor."
			choices={[
				{
					id: 'ours',
					label: `Current change${props.conflict.ours ? ` (${props.conflict.ours})` : ''}`,
				},
				{
					id: 'theirs',
					label: `Incoming change${props.conflict.theirs ? ` (${props.conflict.theirs})` : ''}`,
				},
				{ id: 'both', label: 'Both changes' },
			]}
			onPick={props.onPick}
			onCancel={props.onCancel}
		/>
	);
}

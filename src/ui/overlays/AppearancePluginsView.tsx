import type { Choice } from '../ChoiceModal';
import { ChoiceModal } from '../ChoiceModal';

export function AppearancePluginsView(props: {
	choices: Choice[];
	onPick: (id: string) => void;
	onDelete: (id: string) => void;
	onClose: () => void;
}) {
	return (
		<ChoiceModal
			title="Plugins"
			message="Enter toggles installed plugins or installs cached market entries. Backspace removes an installed plugin."
			choices={props.choices}
			onPick={props.onPick}
			onDelete={props.onDelete}
			onCancel={props.onClose}
		/>
	);
}

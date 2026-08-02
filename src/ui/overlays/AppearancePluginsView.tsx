import type { Choice } from '../ChoiceModal';
import { ChoiceModal } from '../ChoiceModal';

export function AppearancePluginsView(props: {
	choices: Choice[];
	onPick: (id: string) => void;
	onClose: () => void;
}) {
	return (
		<ChoiceModal
			title="Appearance plugins"
			message="Enter toggles installed plugins or installs cached market entries."
			choices={props.choices}
			onPick={props.onPick}
			onCancel={props.onClose}
		/>
	);
}

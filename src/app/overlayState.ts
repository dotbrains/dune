import type { Accessor } from 'solid-js';
import type { Conflict, PickerState, Prompt, SearchState } from './types';

export function isOverlayOpen(deps: {
	prompt: Accessor<Prompt>;
	palette: Accessor<boolean>;
	conflict: Accessor<Conflict | null>;
	help: Accessor<boolean>;
	search: Accessor<SearchState>;
	update: Accessor<unknown>;
	picker: Accessor<PickerState>;
	commitFiles: Accessor<unknown>;
}) {
	return !!(
		deps.prompt() ||
		deps.palette() ||
		deps.conflict() ||
		deps.help() ||
		deps.search() ||
		deps.update() ||
		deps.picker() ||
		deps.commitFiles()
	);
}

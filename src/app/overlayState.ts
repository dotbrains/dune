import { createMemo } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { Conflict, PickerState, Prompt, SearchState } from './types';

export function isOverlayOpen(deps: {
	prompt: Accessor<Prompt>;
	palette: Accessor<boolean>;
	conflict: Accessor<Conflict | null>;
	help: Accessor<boolean>;
	search: Accessor<SearchState>;
	settingsPage: Accessor<boolean>;
	diff: Accessor<unknown>;
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
		deps.settingsPage() ||
		deps.diff() ||
		deps.update() ||
		deps.picker() ||
		deps.commitFiles()
	);
}

export function createOverlayOpen(deps: Parameters<typeof isOverlayOpen>[0]) {
	return createMemo(() => isOverlayOpen(deps));
}

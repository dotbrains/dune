import type { KeyEvent } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/solid';
import { createSignal, For, Show } from 'solid-js';

import { fuzzyScore } from '../core/search';
import { ui } from '../themes';
import { modalWidth, PAD, wrapText } from './modal';
import { Overlay } from './Overlay';

export interface Choice {
	id: string;
	label: string;
}

export interface ChoiceModalProps {
	title: string;
	message: string;
	choices: Choice[];
	onPick: (id: string) => void;
	onCancel: () => void;
}

export function ChoiceModal(props: ChoiceModalProps) {
	const dimensions = useTerminalDimensions();
	const [index, setIndex] = createSignal(0);
	const [query, setQuery] = createSignal('');

	const width = () => modalWidth(dimensions().width, 0.54, 64, 88);
	const lines = () => wrapText(props.message, width() - PAD * 2);
	const choices = () => {
		const q = query().trim();
		if (!q) return props.choices;
		return props.choices
			.map((choice) => ({ choice, score: fuzzyScore(choice.label, q) }))
			.filter((entry): entry is { choice: Choice; score: number } => entry.score !== null)
			.toSorted((a, b) => b.score - a.score)
			.map((entry) => entry.choice);
	};
	const setFilter = (value: string) => {
		setQuery(value);
		setIndex(0);
	};

	useKeyboard((key: KeyEvent) => {
		const k = key.name;
		const typed = key.sequence;
		const printable =
			typed?.length === 1 && typed >= ' ' && typed !== '\u007F' && !key.ctrl && !key.meta;
		if (k === 'up') {
			key.preventDefault();
			const count = choices().length;
			if (count > 0) setIndex((i) => (i - 1 + count) % count);
		} else if (k === 'down') {
			key.preventDefault();
			const count = choices().length;
			if (count > 0) setIndex((i) => (i + 1) % count);
		} else if (k === 'backspace') {
			key.preventDefault();
			setFilter(query().slice(0, -1));
		} else if (k === 'return' || k === 'enter') {
			key.preventDefault();
			const choice = choices()[index()];
			if (choice) props.onPick(choice.id);
		} else if (k === 'escape') {
			key.preventDefault();
			if (query()) setFilter('');
			else props.onCancel();
		} else if (printable) {
			key.preventDefault();
			setFilter(`${query()}${typed}`);
		}
	});

	return (
		<Overlay zIndex={160}>
			<box
				width={width()}
				flexDirection="column"
				backgroundColor={ui.panelBg}
				border
				borderStyle="rounded"
				borderColor={ui.dirty}
				title={` ${props.title} `}
				titleColor={ui.dirty}
				paddingLeft={PAD}
				paddingRight={PAD}
			>
				<For each={lines()}>{(line) => <text fg={ui.text} bg={ui.panelBg} content={line} />}</For>
				<text fg={ui.dim} bg={ui.panelBg} content={query() ? `filter: ${query()}` : ''} />
				<For each={choices()}>
					{(choice, i) => {
						const active = () => i() === index();
						const bg = () => (active() ? ui.treeSelectedBg : ui.panelBg);
						return (
							<box flexDirection="row" backgroundColor={bg()}>
								<text fg={ui.dirty} bg={bg()} flexShrink={0} content={active() ? '▌ ' : '  '} />
								<box flexGrow={1} backgroundColor={bg()}>
									<text fg={active() ? ui.text : ui.dim} bg={bg()} content={choice.label} />
								</box>
							</box>
						);
					}}
				</For>
				<Show when={choices().length === 0}>
					<text fg={ui.dim} bg={ui.panelBg} content="No matches" />
				</Show>
				<text fg={ui.dim} bg={ui.panelBg} content="" />
				<text
					fg={ui.dim}
					bg={ui.panelBg}
					content="type filter · ↑↓ choose · Enter confirm · Esc cancel"
				/>
			</box>
		</Overlay>
	);
}

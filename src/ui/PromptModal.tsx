import type { KeyEvent } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/solid';
import { createSignal } from 'solid-js';

import { stepHistory } from '../core/messageHistory';
import { ui } from '../themes';
import { modalWidth, PAD } from './modal';
import { Overlay } from './Overlay';
import { TextInput } from './TextInput';

export interface PromptModalProps {
	title: string;
	initialValue: string;
	history?: string[];
	onSubmit: (value: string) => void;
	onCancel: () => void;
}

export function PromptModal(props: PromptModalProps) {
	const dimensions = useTerminalDimensions();
	const [value, setValue] = createSignal(props.initialValue);
	const [at, setAt] = createSignal(-1);
	const [draft, setDraft] = createSignal('');

	const width = () => modalWidth(dimensions().width, 0.5, 60, 80);
	const history = () => props.history ?? [];

	const walk = (delta: number) => {
		const step = stepHistory(history(), at(), delta, value(), draft());
		if (!step) return;
		setAt(step.at);
		setDraft(step.draft);
		setValue(step.value);
	};

	const input = (next: string) => {
		setValue(next);
		const walked = at();
		if (walked >= 0 && next !== history()[walked]) setAt(-1);
	};

	useKeyboard((key: KeyEvent) => {
		// Solid applies focus synchronously; without this the submitting key also
		// reaches whatever the modal focuses next.
		if (key.name === 'return' || key.name === 'enter') {
			key.preventDefault();
			props.onSubmit(value());
		} else if (key.name === 'escape') {
			key.preventDefault();
			props.onCancel();
		} else if ((key.name === 'up' || key.name === 'down') && history().length > 0) {
			key.preventDefault();
			walk(key.name === 'up' ? 1 : -1);
		}
	});

	return (
		<Overlay>
			<box
				width={width()}
				flexDirection="column"
				backgroundColor={ui.panelBg}
				border
				borderStyle="rounded"
				borderColor={ui.accent}
				title={` ${props.title} `}
				titleColor={ui.text}
				paddingLeft={PAD}
				paddingRight={PAD}
			>
				<TextInput value={value()} onInput={input} />
				<text fg={ui.panelBg} bg={ui.panelBg} content="" />
				<text
					fg={ui.dim}
					bg={ui.panelBg}
					content={`Enter to confirm · Esc to cancel${history().length > 0 ? ' · ↑↓ history' : ''}`}
				/>
			</box>
		</Overlay>
	);
}

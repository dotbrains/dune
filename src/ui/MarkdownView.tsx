import type { KeyEvent, ScrollBoxRenderable, TreeSitterClient } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/solid';
import { createEffect, createMemo, createSignal, on, onMount } from 'solid-js';

import { getSyntaxStyle, highlightClient } from '../languages/highlight';
import { ui } from '../themes';

export interface MarkdownViewProps {
	path: string;
	name: string;
	content: string;
	width: number;
	theme: string;
	focused: boolean;
	blocked: boolean;
	onFocus: () => void;
	onShowSource: () => void;
}

export function MarkdownView(props: MarkdownViewProps) {
	const dimensions = useTerminalDimensions();
	const [client, setClient] = createSignal<TreeSitterClient | null | undefined>(undefined);
	let box: ScrollBoxRenderable | undefined;

	onMount(() => void highlightClient().then((c) => setClient(c)));

	const style = createMemo(
		on(
			() => props.theme,
			() => getSyntaxStyle(),
		),
	);
	const scroll = (delta: number) => {
		if (box) box.scrollTop = Math.max(0, box.scrollTop + delta);
	};
	const scrollTo = (row: number) => {
		if (box) box.scrollTop = Math.max(0, row);
	};

	createEffect(
		on(
			() => props.path,
			() => scrollTo(0),
			{ defer: true },
		),
	);

	const page = () => Math.max(1, dimensions().height - 3);
	const hints = () => {
		const full = ' rendered · Tab source · ↑↓ scroll ';
		return full.length + props.name.length + 4 <= props.width ? full : ' Tab source ';
	};

	useKeyboard((key: KeyEvent) => {
		if (props.blocked || !props.focused || key.defaultPrevented) return;
		const k = key.name;
		if (k === 'up' || k === 'k') scroll(-1);
		else if (k === 'down' || k === 'j') scroll(1);
		else if (k === 'pageup' || (key.ctrl && k === 'u')) scroll(-page());
		else if (k === 'pagedown' || k === 'space' || (key.ctrl && k === 'd')) scroll(page());
		else if (k === 'end' || (k === 'g' && key.shift)) scrollTo(Number.MAX_SAFE_INTEGER);
		else if (k === 'home' || k === 'g') scrollTo(0);
		else if (k === 'escape' || k === 'tab' || k === 'q') props.onShowSource();
		else return;
		key.preventDefault();
	});

	return (
		<box
			width="100%"
			height="100%"
			flexDirection="column"
			backgroundColor={ui.bg}
			onMouseDown={() => props.onFocus()}
		>
			<box flexDirection="row" backgroundColor={ui.barBg}>
				<text fg={ui.text} bg={ui.barBg} flexShrink={0} content={` ${props.name}`} />
				<box flexGrow={1} backgroundColor={ui.barBg} />
				<text fg={ui.dim} bg={ui.barBg} flexShrink={0} content={hints()} />
			</box>
			<scrollbox
				ref={(el: ScrollBoxRenderable) => (box = el)}
				flexGrow={1}
				backgroundColor={ui.bg}
				paddingLeft={2}
				paddingRight={2}
				scrollbarOptions={{
					trackOptions: { foregroundColor: ui.scrollbar, backgroundColor: ui.bg },
				}}
			>
				<markdown
					content={props.content}
					syntaxStyle={style()}
					treeSitterClient={client() ?? undefined}
					fg={ui.text}
					bg={ui.bg}
				/>
			</scrollbox>
		</box>
	);
}

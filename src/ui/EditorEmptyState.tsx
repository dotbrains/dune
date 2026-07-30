import { TextAttributes } from '@opentui/core';
import { useTerminalDimensions } from '@opentui/solid';
import { createMemo, For, Show } from 'solid-js';

import { ui } from '../themes';
import { welcomeKeys } from './keys';

const CHROME_ROWS = 8;

export function EditorEmptyState() {
	const dimensions = useTerminalDimensions();
	const rows = createMemo(() => {
		const all = welcomeKeys();
		const room = Math.max(0, dimensions().height - CHROME_ROWS);
		const width = Math.max(...all.map(([key]) => key.length));
		return all.slice(0, room).map(([key, label]) => [key.padEnd(width), label] as const);
	});

	return (
		<box
			flexGrow={1}
			flexDirection="column"
			backgroundColor={ui.bg}
			alignItems="center"
			justifyContent="center"
		>
			<box flexDirection="column" backgroundColor={ui.bg} alignItems="flex-start">
				<text fg={ui.dim} bg={ui.bg} content="dune" attributes={TextAttributes.BOLD} />
				<Show when={rows().length > 0}>
					<text fg={ui.faint} bg={ui.bg} content="" />
					<For each={rows()}>
						{([key, label]) => (
							<box flexDirection="row" backgroundColor={ui.bg}>
								<text fg={ui.dim} bg={ui.bg} content={`${key}  `} />
								<text fg={ui.faint} bg={ui.bg} content={label} />
							</box>
						)}
					</For>
				</Show>
			</box>
		</box>
	);
}

export function EditorNotice(props: { notice: { name: string; reason: string } }) {
	return (
		<box
			position="absolute"
			top={0}
			left={0}
			width="100%"
			height="100%"
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			backgroundColor={ui.bg}
			zIndex={10}
		>
			<text
				fg={ui.text}
				bg={ui.bg}
				content={`${props.notice.name} cannot be shown`}
				attributes={TextAttributes.BOLD}
			/>
			<text fg={ui.faint} bg={ui.bg} content="" />
			<text fg={ui.dim} bg={ui.bg} content={props.notice.reason} />
			<text fg={ui.faint} bg={ui.bg} content="" />
			<text fg={ui.faint} bg={ui.bg} content="Press any key to go back" />
		</box>
	);
}

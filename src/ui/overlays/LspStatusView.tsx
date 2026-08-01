import type { KeyEvent } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/solid';
import { createSignal, For, Show } from 'solid-js';

import type { LspStatusRow } from '../../app/lsp';
import { ui } from '../../themes';
import { listRows, modalWidth, PAD } from '../modal';
import { Overlay } from '../Overlay';

const STATE_LABEL: Record<LspStatusRow['state'], string> = {
	ready: 'ready',
	starting: 'starting',
	stopped: 'stopped',
	disabled: 'disabled',
};

const stateColor = (state: LspStatusRow['state']) =>
	state === 'ready'
		? ui.gitAdded
		: state === 'starting'
			? ui.gitModified
			: state === 'disabled'
				? ui.dim
				: ui.faint;

export function LspStatusView(props: { rows: LspStatusRow[]; onClose: () => void }) {
	const dimensions = useTerminalDimensions();
	const [index, setIndex] = createSignal(0);
	const width = () => modalWidth(dimensions().width, 0.7, 72, 108);
	const visibleRows = () => listRows(dimensions().height, 5, 8);
	const selected = () => Math.min(index(), Math.max(0, props.rows.length - 1));
	const windowStart = () =>
		Math.max(0, Math.min(selected() - visibleRows() + 1, props.rows.length));
	const visible = () => props.rows.slice(windowStart(), windowStart() + visibleRows());

	useKeyboard((key: KeyEvent) => {
		const count = Math.max(1, props.rows.length);
		if (key.name === 'up') setIndex((selected() - 1 + count) % count);
		else if (key.name === 'down') setIndex((selected() + 1) % count);
		else if (key.name === 'escape') props.onClose();
		else return;
		key.preventDefault();
	});

	return (
		<Overlay zIndex={145}>
			<box
				width={width()}
				flexDirection="column"
				backgroundColor={ui.panelBg}
				border
				borderStyle="rounded"
				borderColor={ui.accent}
				title=" Language Servers "
				titleColor={ui.text}
				paddingLeft={PAD}
				paddingRight={PAD}
			>
				<For each={visible()}>
					{(row, i) => {
						const absolute = () => windowStart() + i();
						const active = () => absolute() === selected();
						const bg = () => (active() ? ui.treeSelectedBg : ui.panelBg);
						return (
							<box flexDirection="column" backgroundColor={bg()}>
								<box flexDirection="row" backgroundColor={bg()}>
									<text fg={ui.accent} bg={bg()} flexShrink={0} content={active() ? '▌ ' : '  '} />
									<box flexGrow={1} backgroundColor={bg()}>
										<text fg={active() ? ui.text : ui.dim} bg={bg()} content={row.id} />
									</box>
									<text
										fg={stateColor(row.state)}
										bg={bg()}
										content={` ${STATE_LABEL[row.state]} `}
									/>
									<text fg={ui.dim} bg={bg()} content={` ${row.problems} problems `} />
								</box>
								<text fg={ui.dim} bg={bg()} content={`   ${row.filetypes.join(', ')}`} />
								<text fg={ui.text} bg={bg()} content={`   ${row.command}`} />
							</box>
						);
					}}
				</For>
				<Show when={props.rows.length === 0}>
					<text fg={ui.dim} bg={ui.panelBg} content="No language servers configured." />
				</Show>
				<text fg={ui.dim} bg={ui.panelBg} content="↑↓ move · Esc close" />
			</box>
		</Overlay>
	);
}

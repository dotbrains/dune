import { TextAttributes } from '@opentui/core';
import type { MouseEvent } from '@opentui/core';
import { useTerminalDimensions } from '@opentui/solid';
import { createMemo, For, Show } from 'solid-js';

import { ui } from '../themes';
import { ALT } from './keys';
import { createHoverTooltip } from './tooltip';

export interface TabInfo {
	path: string;
	name: string;
	dirty: boolean;
	preview: boolean;
}

export interface TabsProps {
	tabs: TabInfo[];
	activePath: string | null;
	canBack: boolean;
	canForward: boolean;
	onSelect: (path: string) => void;
	onClose: (path: string) => void;
	onBack: () => void;
	onForward: () => void;
	/** Clicking an overflow counter asks for the full list of open tabs. */
	onOverflow: () => void;
	tooltipsEnabled: boolean;
	keybindings: Record<string, string>;
}

const MAX_LABEL = 18;
/** Padding, the dirty/close glyph and the separator around a label. */
const CHROME = 5;
const NAV_CHROME = 6;

const shorten = (name: string) =>
	name.length <= MAX_LABEL ? name : `${name.slice(0, MAX_LABEL - 1)}…`;

export function Tabs(props: TabsProps) {
	const dimensions = useTerminalDimensions();
	const tooltip = createHoverTooltip(() => props.tooltipsEnabled);
	const shortcut = (id: string, fallback: string) => props.keybindings[id] ?? fallback;

	/**
	 * Only the tabs that fit are rendered, scrolled to keep the active one in
	 * view. Letting flexbox shrink them instead clips names mid-character.
	 */
	const visible = createMemo(() => {
		// The bar spans the terminal: the tree sits below it, not beside it. Taking
		// the sidebar's width off the budget made tabs reflow on every resize.
		const budget = Math.max(0, dimensions().width - NAV_CHROME);
		const width = (tab: TabInfo) => shorten(tab.name).length + CHROME;

		const active = Math.max(
			0,
			props.tabs.findIndex((tab) => tab.path === props.activePath),
		);
		let first = active;
		let last = active;
		let used = props.tabs[active] ? width(props.tabs[active]!) : 0;

		// Grow outwards from the active tab until the row is full.
		while (first > 0 || last < props.tabs.length - 1) {
			const before = first > 0 ? width(props.tabs[first - 1]!) : Infinity;
			const after = last < props.tabs.length - 1 ? width(props.tabs[last + 1]!) : Infinity;
			const next = Math.min(before, after);
			if (used + next > budget) break;
			if (after <= before) {
				last++;
			} else {
				first--;
			}
			used += next;
		}
		return {
			tabs: props.tabs.slice(first, last + 1),
			before: first,
			after: props.tabs.length - 1 - last,
		};
	});

	return (
		<box flexDirection="column" flexShrink={0}>
			<box height={1} flexDirection="row" backgroundColor={ui.barBg}>
				<text bg={ui.bg} content=" " />
				<Show
					when={props.tabs.length > 0}
					fallback={<text fg={ui.faint} bg={ui.barBg} content=" no open files" />}
				>
					<Show when={visible().before > 0}>
						<box
							paddingLeft={1}
							backgroundColor={ui.barBg}
							onMouseDown={() => props.onOverflow()}
							onMouseOver={() => tooltip.onOver('overflow', `Switch tabs (${shortcut('tabs.switch', 'Ctrl+T')})`)}
							onMouseOut={() => tooltip.onOut('overflow')}
						>
							<text fg={ui.dim} bg={ui.barBg} content={`‹${visible().before}`} />
						</box>
					</Show>
					<For each={visible().tabs}>
						{(tab) => {
							const active = () => tab.path === props.activePath;
							const bg = () => (active() ? ui.bg : ui.barBg);
							return (
								<box
									flexDirection="row"
									flexShrink={0}
									backgroundColor={bg()}
									paddingLeft={1}
									paddingRight={1}
									onMouseDown={() => props.onSelect(tab.path)}
								>
									<text
										fg={active() ? ui.activeTabFg : ui.inactiveTabFg}
										bg={bg()}
										content={shorten(tab.name)}
										attributes={
											tab.preview
												? TextAttributes.ITALIC
												: active()
													? TextAttributes.BOLD
													: undefined
										}
									/>
									<box
										paddingLeft={1}
										onMouseDown={(e: MouseEvent) => {
											e.stopPropagation();
											props.onClose(tab.path);
										}}
										onMouseOver={() =>
											tooltip.onOver(
												`close:${tab.path}`,
												`Close tab (${shortcut('tabs.close', 'Ctrl+W')})`,
											)
										}
										onMouseOut={() => tooltip.onOut(`close:${tab.path}`)}
									>
										<text
											fg={tab.dirty ? ui.dirty : active() ? ui.dim : ui.barBg}
											bg={bg()}
											content={tab.dirty ? '●' : '×'}
										/>
									</box>
								</box>
							);
						}}
					</For>
					<Show when={visible().after > 0}>
						<box
							paddingLeft={1}
							paddingRight={1}
							backgroundColor={ui.barBg}
							onMouseDown={() => props.onOverflow()}
							onMouseOver={() => tooltip.onOver('overflow', `Switch tabs (${shortcut('tabs.switch', 'Ctrl+T')})`)}
							onMouseOut={() => tooltip.onOut('overflow')}
						>
							<text fg={ui.dim} bg={ui.barBg} content={`${visible().after}›`} />
						</box>
					</Show>
					<box
						paddingLeft={1}
						backgroundColor={ui.barBg}
						onMouseDown={() => props.onBack()}
						onMouseOver={() =>
							tooltip.onOver('back', `Go back (${shortcut('navigation.back', `Ctrl+${ALT}+Z`)})`)
						}
						onMouseOut={() => tooltip.onOut('back')}
					>
						<text fg={props.canBack ? ui.dim : ui.faint} bg={ui.barBg} content="‹" />
					</box>
					<box
						paddingLeft={1}
						paddingRight={1}
						backgroundColor={ui.barBg}
						onMouseDown={() => props.onForward()}
						onMouseOver={() =>
							tooltip.onOver(
								'forward',
								`Go forward (${shortcut('navigation.forward', `Ctrl+${ALT}+Y`)})`,
							)
						}
						onMouseOut={() => tooltip.onOut('forward')}
					>
						<text fg={props.canForward ? ui.dim : ui.faint} bg={ui.barBg} content="›" />
					</box>
				</Show>
				<box flexGrow={1} flexDirection="row" justifyContent="flex-end" backgroundColor={ui.barBg}>
					<Show when={tooltip.label()}>
						{(label: () => string) => (
							<text fg={ui.dim} bg={ui.barBg} content={`${label().slice(0, dimensions().width)} `} />
						)}
					</Show>
				</box>
			</box>
		</box>
	);
}

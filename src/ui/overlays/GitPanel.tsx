import { relative } from 'node:path';

import { For, Show } from 'solid-js';

import type { FileStatus } from '../../core/git';
import { ui } from '../../themes';
import { MARKS, statusColor } from '../FileTree';

export function GitPanel(props: {
	rootDir: string;
	branch: string | null;
	width: number;
	focused: boolean;
	status: Map<string, FileStatus>;
	onFocus: () => void;
	onDiff: (path: string) => void;
}) {
	const changes = () =>
		[...props.status]
			.map(([path, status]) => ({ path, status, rel: relative(props.rootDir, path) }))
			.toSorted((a, b) => a.rel.localeCompare(b.rel));
	return (
		<box
			width={props.width}
			flexDirection="column"
			backgroundColor={ui.panelBg}
			flexShrink={0}
			onMouseDown={props.onFocus}
		>
			<box height={2} flexDirection="column" backgroundColor={ui.panelBg} paddingLeft={2}>
				<text
					fg={props.focused ? ui.text : ui.dim}
					bg={ui.panelBg}
					content={props.branch ?? 'git'}
				/>
				<text fg={ui.faint} bg={ui.panelBg} content="source control" />
			</box>
			<Show
				when={changes().length > 0}
				fallback={
					<box flexGrow={1} backgroundColor={ui.panelBg} paddingLeft={2}>
						<text fg={ui.faint} bg={ui.panelBg} content="no changes" />
					</box>
				}
			>
				<box flexGrow={1} flexDirection="column" backgroundColor={ui.panelBg}>
					<For each={changes()}>
						{(change) => (
							<box
								height={1}
								flexDirection="row"
								backgroundColor={ui.panelBg}
								onMouseDown={() => props.onDiff(change.path)}
							>
								<box flexGrow={1} backgroundColor={ui.panelBg}>
									<text fg={ui.text} bg={ui.panelBg} content={` ${change.rel}`} />
								</box>
								<text
									fg={statusColor(change.status)}
									bg={ui.panelBg}
									flexShrink={0}
									content={`${MARKS[change.status]} `}
								/>
							</box>
						)}
					</For>
				</box>
			</Show>
			<box height={1} backgroundColor={ui.panelBg} paddingLeft={1}>
				<text fg={ui.faint} bg={ui.panelBg} content="enter diff · c commit · p push" />
			</box>
		</box>
	);
}

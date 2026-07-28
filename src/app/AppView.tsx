import { basename } from 'node:path';

import type { MouseEvent } from '@opentui/core';
import { For, Show } from 'solid-js';

import type { Config } from '../core/config';
import type { TreeNode } from '../core/fs';
import type { FileStatus, LineChange, Upstream } from '../core/git';
import type { Match } from '../core/search';
import type { VimMode } from '../editor/vim';
import { languageLabel } from '../languages';
import { filetypeForPath } from '../languages/highlight';
import { ui } from '../themes';
import { ChoiceModal } from '../ui/ChoiceModal';
import { CommandPalette } from '../ui/CommandPalette';
import { ConfirmModal } from '../ui/ConfirmModal';
import { EditorPane } from '../ui/EditorPane';
import { FilePicker } from '../ui/FilePicker';
import { FileTree } from '../ui/FileTree';
import { HelpOverlay } from '../ui/HelpOverlay';
import { KeyPeek } from '../ui/KeyPeek';
import { PromptModal } from '../ui/PromptModal';
import { SearchPanel } from '../ui/SearchPanel';
import type { SearchScope } from '../ui/SearchPanel';
import { StatusBar } from '../ui/StatusBar';
import type { Tone } from '../ui/StatusBar';
import { Tabs } from '../ui/Tabs';
import { UpdateBanner } from '../ui/UpdateBanner';
import type { SearchOptions } from '../core/search';
import type { UpdateInfo } from '../core/update';
import type { Command } from './commands';
import type { BufferState, Confirmation, Conflict, Focus } from './types';

const GRIP = [0, 1, 2, 3, 4];

interface AppViewProps {
	rootDir: string;
	config: Config;
	tabs: string[];
	activePath: string | null;
	activeBuffer: BufferState | undefined;
	buffers: Record<string, BufferState>;
	previewPath: string | null;
	sidebar: boolean;
	nodes: TreeNode[];
	selectedPath: string | null;
	expanded: Set<string>;
	focus: Focus;
	treeWidth: number;
	gitStatus: Map<string, FileStatus>;
	cutPaths: string[];
	markedPaths: string[];
	resizing: boolean;
	reloadKey: number;
	goto: { line: number; col: number; key: number } | null;
	history: { kind: 'undo' | 'redo'; key: number } | null;
	edit: { content: string; key: number } | null;
	lineOp: { op: 'comment' | 'up' | 'down' | 'duplicate'; key: number } | null;
	gitLines: Map<number, LineChange>;
	notice: { name: string; reason: string } | null;
	blocked: boolean;
	status: { msg: string; tone: Tone };
	cursor: { line: number; col: number };
	vimMode: VimMode | null;
	branch: string | null;
	upstream: Upstream | null;
	busy: { label: string; done: number; total: number } | null;
	promptTitle: string | undefined;
	promptValue: string;
	confirmation: Confirmation | null;
	search: { scope: SearchScope; replacing?: boolean } | null;
	picker: 'files' | 'tabs' | null;
	palette: boolean;
	commands: Command[];
	conflict: Conflict | null;
	update: { current: string; latest: string } | null;
	peek: boolean;
	help: boolean;
	selection: string;
	onSelectTab: (path: string) => void;
	onCloseTab: (path: string) => void;
	onOverflowTabs: () => void;
	onResizeDrag: (event: MouseEvent) => void;
	onResizeEnd: () => void;
	onActivateNode: (node: TreeNode) => void;
	onPinNode: (node: TreeNode) => void;
	onTreeFocus: () => void;
	onResizeStart: (event: MouseEvent) => void;
	onEditorChange: (text: string) => void;
	onCursor: (pos: { line: number; col: number }) => void;
	onEditorFocus: () => void;
	onVimMode: (mode: VimMode | null) => void;
	onQuit: () => void;
	onSubmitPrompt: (value: string) => void;
	onCancelPrompt: () => void;
	onConfirmPrompt: () => void;
	onPickSearch: (match: Match) => void;
	onReplaceOne?: (match: Match, replacement: string) => void;
	onReplaceAll?: (query: string, replacement: string, options: SearchOptions) => void;
	onCloseSearch: () => void;
	onPickFile: (path: string) => void;
	onClosePicker: () => void;
	onClosePalette: () => void;
	onResolveConflict: (choice: string) => void;
	onCancelConflict: () => void;
	onCloseUpdate: () => void;
	onSkipUpdate: () => void;
}

export function AppView(props: AppViewProps) {
	return (
		<box flexDirection="column" width="100%" height="100%" backgroundColor={ui.bg}>
			<Tabs
				tabs={props.tabs.map((p) => ({
					path: p,
					name: basename(p),
					dirty: props.buffers[p]?.dirty ?? false,
					preview: p === props.previewPath,
				}))}
				activePath={props.activePath}
				onSelect={props.onSelectTab}
				onClose={props.onCloseTab}
				onOverflow={() => props.onOverflowTabs()}
			/>
			{/* Drag capture lives on the row, not the divider: the pointer leaves a
          one-column target immediately, and each drag event is delivered to
          whatever sits under it. */}
			<box
				flexDirection="row"
				flexGrow={1}
				onMouseDrag={props.onResizeDrag}
				onMouseDragEnd={() => props.onResizeEnd()}
				onMouseUp={() => props.onResizeEnd()}
			>
				<Show when={props.sidebar}>
					<FileTree
						rootName={basename(props.rootDir) || props.rootDir}
						nodes={props.nodes}
						selectedPath={props.selectedPath}
						expanded={props.expanded}
						focused={props.focus === 'tree'}
						width={props.treeWidth}
						gitStatus={props.gitStatus}
						cutPaths={props.cutPaths}
						markedPaths={props.markedPaths}
						onActivate={props.onActivateNode}
						onPin={(node) => props.onPinNode(node)}
						onFocus={() => props.onTreeFocus()}
					/>
					{/* Drag handle: the whole column is the grab target, but only a short
              grip is drawn at its middle — a full-height rule is a heavy line
              down the screen for something you touch once. The spacers centre it
              without anyone having to know the pane's height. `scrollbar` is the
              palette's quiet rule colour, and the accent while dragging says the
              grab took. The sidebar starts at column 0, so the pointer's x is the
              width asked for. */}
					<box
						width={1}
						flexShrink={0}
						flexDirection="column"
						backgroundColor={ui.bg}
						onMouseDown={props.onResizeStart}
					>
						<box flexGrow={1} backgroundColor={ui.bg} />
						<For each={GRIP}>
							{() => <text fg={props.resizing ? ui.accent : ui.scrollbar} bg={ui.bg} content="│" />}
						</For>
						<box flexGrow={1} backgroundColor={ui.bg} />
					</box>
				</Show>
				<EditorPane
					path={props.activePath}
					content={props.activeBuffer?.content ?? ''}
					filetype={props.activePath ? filetypeForPath(props.activePath!) : undefined}
					focused={props.focus === 'editor'}
					theme={props.config.theme}
					reloadKey={props.reloadKey}
					goto={props.goto}
					history={props.history}
					edit={props.edit}
					lineOp={props.lineOp}
					vim={props.config.vim}
					tabSize={props.config.tabSize}
					gitLines={props.gitLines}
					notice={props.notice}
					blocked={props.blocked}
					onChange={props.onEditorChange}
					onCursor={props.onCursor}
					onFocus={props.onEditorFocus}
					onVimMode={props.onVimMode}
					onQuit={props.onQuit}
				/>
			</box>
			<StatusBar
				message={props.status.msg}
				tone={props.status.tone}
				filetype={
					props.activePath
						? languageLabel(filetypeForPath(props.activePath!) ?? 'plain')
						: undefined
				}
				cursor={props.activePath ? props.cursor : undefined}
				dirty={props.activeBuffer?.dirty ?? false}
				vimMode={props.activePath ? props.vimMode : null}
				branch={props.branch}
				ahead={props.upstream?.ahead ?? 0}
				behind={props.upstream?.behind ?? 0}
				changed={props.gitStatus.size}
				focus={props.focus}
				busy={props.busy}
			/>

			<Show when={props.promptTitle}>
				{(title: () => string) => (
					<PromptModal
						title={title()}
						initialValue={props.promptValue}
						onSubmit={props.onSubmitPrompt}
						onCancel={() => props.onCancelPrompt()}
					/>
				)}
			</Show>
			<Show when={props.confirmation}>
				{(ask: () => Confirmation) => (
					<ConfirmModal
						title={ask().title}
						verb={ask().verb}
						danger={ask().danger}
						message={ask().message}
						onConfirm={props.onConfirmPrompt}
						onCancel={() => props.onCancelPrompt()}
					/>
				)}
			</Show>
			<Show when={props.search}>
				{(open: () => { scope: SearchScope; replacing?: boolean }) => {
					const search = open();
					return (
						<SearchPanel
							scope={search.scope}
							rootDir={props.rootDir}
							activePath={props.activePath}
							activeContent={props.activeBuffer?.content ?? ''}
							initialQuery={props.selection}
							replacing={search.replacing}
							onPick={props.onPickSearch}
							onReplaceOne={search.scope === 'file' ? props.onReplaceOne : undefined}
							onReplaceAll={search.scope === 'file' ? props.onReplaceAll : undefined}
							onClose={() => props.onCloseSearch()}
						/>
					);
				}}
			</Show>
			<Show when={props.picker}>
				{(kind: () => 'files' | 'tabs') => (
					<FilePicker
						rootDir={props.rootDir}
						files={kind() === 'tabs' ? props.tabs : undefined}
						title={kind() === 'tabs' ? 'Switch tab' : 'Open file'}
						onPick={(path) => {
							props.onClosePicker();
							props.onPickFile(path);
						}}
						onClose={() => props.onClosePicker()}
					/>
				)}
			</Show>
			<Show when={props.palette}>
				<CommandPalette commands={props.commands} onClose={() => props.onClosePalette()} />
			</Show>
			<Show when={props.conflict}>
				{(c: () => Conflict) => (
					<ChoiceModal
						title={c().deleted ? 'File deleted on disk' : 'File changed on disk'}
						message={
							c().deleted
								? `"${basename(c().path)}" was deleted on disk and has unsaved edits here.`
								: `"${basename(c().path)}" changed on disk and has unsaved edits here.`
						}
						choices={
							c().deleted
								? [
										{ id: 'overwrite', label: 'Write it back (recreate the file)' },
										{ id: 'cancel', label: 'Cancel (keep editing)' },
									]
								: [
										{ id: 'overwrite', label: 'Overwrite (keep my version)' },
										{ id: 'reload', label: 'Reload (discard my changes)' },
										{ id: 'cancel', label: 'Cancel' },
									]
						}
						onPick={props.onResolveConflict}
						onCancel={() => props.onCancelConflict()}
					/>
				)}
			</Show>
			<Show when={props.update}>
				{(info: () => UpdateInfo) => (
					<UpdateBanner
						update={info()}
						onClose={() => props.onCloseUpdate()}
						onSkip={props.onSkipUpdate}
					/>
				)}
			</Show>
			<Show when={props.peek}>
				<KeyPeek pane={props.focus} />
			</Show>
			<Show when={props.help}>
				<HelpOverlay />
			</Show>
		</box>
	);
}

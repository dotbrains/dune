import type { Tone } from '../ui/StatusBar';
import type { Config } from '../core/config';

export type Focus = 'tree' | 'editor';
export type PickerState = 'files' | 'tabs' | null;
export type SearchState = { scope: 'file' | 'project'; replacing?: boolean } | null;
export type ClipboardState = { paths: string[]; mode: 'cut' | 'copy' };
export type HistoryRequest = { kind: 'undo' | 'redo'; key: number } | null;
export type GotoRequest = { line: number; col: number; key: number } | null;
export type EditRequest = { content: string; key: number } | null;
export type CompletionRequest = { key: number } | null;
export type LineOpRequest = { op: 'comment' | 'up' | 'down' | 'duplicate'; key: number } | null;
export type BusyState = { label: string; done: number; total: number } | null;

export interface AppProps {
	rootDir: string;
	openFile?: string | null;
	openLine?: number | null;
	initialConfig: Config;
	projectConfig?: Partial<Config>;
	checkUpdates?: boolean;
}

export interface BufferState {
	content: string;
	dirty: boolean;
	/** Disk mtime this buffer was last in sync with; used to detect outside edits. */
	mtime: number;
}

/** Dirty buffers a disk sync refused to touch, split by what happened to the file. */
export interface DiskSync {
	changed: string[];
	deleted: string[];
}

/** An unsaved buffer whose file also changed on disk. */
export interface Conflict {
	path: string;
	disk: string;
	/** The file is gone: there is no outside version to accept. */
	deleted: boolean;
}

export type Prompt =
	| { kind: 'gotoLine' }
	| { kind: 'commitMessage' }
	| { kind: 'newBranch' }
	| { kind: 'newFile'; dir: string }
	| { kind: 'newFolder'; dir: string }
	| { kind: 'rename'; target: string }
	| { kind: 'formatterCommand' }
	| { kind: 'keybindingCommand' }
	| { kind: 'sidebarWidth' }
	| { kind: 'delete'; targets: string[] }
	| { kind: 'closeDirty'; paths: string[]; names: string[] }
	| { kind: 'quitDirty'; names: string[] }
	| { kind: 'undoCommit'; subject: string }
	| { kind: 'mergeBranch'; name: string }
	| null;

export type PromptKind = NonNullable<Prompt>['kind'];

/** What a yes/no prompt asks and how loudly it asks it. */
export interface Confirmation {
	title: string;
	message: string;
	verb: string;
	danger: boolean;
}

export interface StatusMessage {
	msg: string;
	tone: Tone;
}

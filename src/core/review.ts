/**
 * Review notes: the remarks made while reading code, and where they are kept.
 *
 * A note is a line, a kind and a sentence — nothing else, because the whole
 * point is that writing one costs a keystroke and a line of typing. They are
 * kept beside the config rather than in the project, keyed by project path, as
 * `sessions.json` is: a draft remark is personal scratch, and a `.dune/` file
 * would land in somebody's commit the first time they staged everything.
 */
import fs from 'node:fs';
import { dirname, join } from 'node:path';

import { CONFIG_FILE } from './config';

const NOTES_FILE = join(dirname(CONFIG_FILE), 'review.json');

/** Projects remembered before the least recently touched are dropped. */
const MAX_PROJECTS = 20;

/**
 * What a remark is. The four are the ones a reviewer actually separates: a
 * defect, a change worth considering, a question, and a plain observation —
 * and an agent reading the export treats each differently.
 */
export const NOTE_KINDS = ['issue', 'suggestion', 'question', 'note'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const NOTE_LABELS: Record<NoteKind, string> = {
	issue: 'ISSUE',
	suggestion: 'SUGGESTION',
	question: 'QUESTION',
	note: 'NOTE',
};

export interface ReviewNote {
	/** Stable across a rewrite of the list — what a delete addresses. */
	id: string;
	/** Absolute path, so a note survives the tree being reopened elsewhere. */
	path: string;
	/** 0-based, as every line number in dune is. */
	line: number;
	/** Last line of the span; equal to `line` for a note on one line. */
	endLine: number;
	kind: NoteKind;
	body: string;
	/** Epoch ms — the order notes were written in, which is the order they read in. */
	at: number;
	/**
	 * The note this one answers. Always the *thread's* id, never another
	 * reply's — a reply to a reply still points at the root, so the thread
	 * never nests more than one level deep regardless of how it was answered.
	 */
	parent?: string;
}

/**
 * The id a note's thread is keyed by: itself, unless it is a reply, in which
 * case its own `parent` — which by construction is always a root, not another
 * reply. Missing from the list (its root was deleted) answers with the note's
 * own id, so a reply whose parent is gone still stands as its own thread
 * rather than disappearing.
 */
export function rootIdOf(notes: readonly ReviewNote[], id: string): string {
	const note = notes.find((held) => held.id === id);
	if (!note?.parent) return id;
	return notes.some((held) => held.id === note.parent) ? note.parent : id;
}

const isKind = (raw: unknown): raw is NoteKind => NOTE_KINDS.includes(raw as NoteKind);

function parseNote(raw: unknown): ReviewNote | null {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
	const note = raw as Record<string, unknown>;
	if (typeof note.id !== 'string' || typeof note.path !== 'string') return null;
	if (typeof note.line !== 'number' || typeof note.body !== 'string') return null;
	if (!isKind(note.kind)) return null;
	const line = Math.max(0, Math.floor(note.line));
	const endLine =
		typeof note.endLine === 'number' ? Math.max(line, Math.floor(note.endLine)) : line;
	return {
		id: note.id,
		path: note.path,
		line,
		endLine,
		kind: note.kind,
		body: note.body,
		at: typeof note.at === 'number' ? note.at : 0,
		...(typeof note.parent === 'string' ? { parent: note.parent } : {}),
	};
}

type NotesFile = Record<string, { notes: unknown; touchedAt?: number }>;

function readAll(file = NOTES_FILE): NotesFile {
	try {
		const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
		return typeof raw === 'object' && raw !== null ? (raw as NotesFile) : {};
	} catch {
		return {};
	}
}

/** This project's notes. Anything unreadable means "no notes", never an error. */
export function loadNotes(rootDir: string, file = NOTES_FILE): ReviewNote[] {
	const entry = readAll(file)[rootDir];
	if (!entry || !Array.isArray(entry.notes)) return [];
	return entry.notes.map(parseNote).filter((note): note is ReviewNote => note !== null);
}

export function saveNotes(
	rootDir: string,
	notes: ReviewNote[],
	now = Date.now(),
	file = NOTES_FILE,
): void {
	try {
		const all = readAll(file);
		if (notes.length === 0) delete all[rootDir];
		else all[rootDir] = { notes, touchedAt: now };

		const trimmed = Object.entries(all)
			.toSorted((a, b) => (b[1].touchedAt ?? 0) - (a[1].touchedAt ?? 0))
			.slice(0, MAX_PROJECTS);

		fs.mkdirSync(dirname(file), { recursive: true });
		fs.writeFileSync(file, `${JSON.stringify(Object.fromEntries(trimmed), null, 2)}\n`);
	} catch {
		// best-effort — losing a draft note is never worth interrupting the editor
	}
}

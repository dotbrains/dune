import { extname } from 'node:path';

import { firstLine, notInstalled, run } from './process';

export type Formatters = Record<string, string[]>;

export type FormatterEdit =
	| { ok: true; key: string; command: string[] }
	| { ok: true; key: string; command: null }
	| { ok: false; error: string };

export function parseFormatterEdit(input: string): FormatterEdit {
	const at = input.indexOf('=');
	if (at < 0) return { ok: false, error: 'Formatter syntax: extensions = command' };
	const key = input
		.slice(0, at)
		.split(',')
		.map((part) => part.trim().replace(/^\./, '').toLowerCase())
		.filter(Boolean)
		.join(',');
	if (!key) return { ok: false, error: 'Formatter needs an extension key' };
	const command = input
		.slice(at + 1)
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	if (command.length === 0) return { ok: true, key, command: null };
	if (command[0] === '{}') return { ok: false, error: 'Formatter needs a program' };
	return { ok: true, key, command };
}

export function formatterFor(path: string, formatters: Formatters): string[] | null {
	const ext = extname(path).slice(1).toLowerCase();
	let fallback: string[] | null = null;
	for (const [rawKey, command] of Object.entries(formatters)) {
		if (command.length === 0) continue;
		const keys = new Set(
			rawKey
				.split(',')
				.map((key) => key.trim().replace(/^\./, '').toLowerCase())
				.filter(Boolean),
		);
		if (keys.has('*')) fallback = command;
		if (ext && keys.has(ext)) return command;
	}
	return fallback;
}

export function formatArgs(command: string[], path: string): string[] {
	const [, ...args] = command;
	if (args.some((arg) => arg.includes('{}'))) return args.map((arg) => arg.replaceAll('{}', path));
	return [...args, path];
}

const FORMAT_TIMEOUT_MS = 10_000;

export async function runFormatter(
	command: string[],
	path: string,
	cwd: string,
): Promise<string | null> {
	const program = command[0];
	if (!program) return null;
	const result = await run(program, formatArgs(command, path), {
		cwd,
		timeout: FORMAT_TIMEOUT_MS,
	});
	if (result.error)
		return notInstalled(result)
			? `${program} is not installed, or not on PATH`
			: result.error.message;
	if (result.timedOut) return `${program} timed out`;
	if (result.status === 0) return null;
	return (
		firstLine(result.stderr || result.stdout) || `${program} exited with status ${result.status}`
	);
}

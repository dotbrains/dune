import { spawnSync } from 'node:child_process';
import { extname } from 'node:path';

export type Formatters = Record<string, string[]>;

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

export function runFormatter(command: string[], path: string, cwd: string): string | null {
	const program = command[0];
	if (!program) return null;
	const result = spawnSync(program, formatArgs(command, path), {
		cwd,
		encoding: 'utf8',
		shell: false,
	});
	if (result.error) return `${program} is not installed, or not on PATH`;
	if (result.status === 0) return null;
	const stderr = result.stderr.trim().split(/\r?\n/, 1)[0]?.trim();
	return stderr || `${program} exited with status ${result.status ?? 'unknown'}`;
}

import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { firstLine, notInstalled, run } from '../core/process';
import type { ProcessResult } from '../core/process';

const INSTALL_TIMEOUT_MS = 180_000;
export type PackageManager = 'npm' | 'bun' | 'pnpm';

const MANAGERS: PackageManager[] = ['npm', 'bun', 'pnpm'];
const MANAGER_FILE = '.manager';

export const SERVER_ROOT = join(
	process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'),
	'dune',
	'lsp',
);

export function installedCommand(command: string[], root = SERVER_ROOT): string[] | null {
	const [executable, ...args] = command;
	if (!executable) return null;
	const local = join(root, 'node_modules', '.bin', executable);
	if (existsSync(local)) return [local, ...args];
	const downloaded = join(
		root,
		'bin',
		process.platform === 'win32' ? `${executable}.exe` : executable,
	);
	return existsSync(downloaded) ? [downloaded, ...args] : null;
}

export function hasNodeRuntime(): boolean {
	return which('node') !== null;
}

function which(bin: string): string | null {
	return Bun.which(bin, { PATH: process.env.PATH ?? '' });
}

function savedManager(root: string): PackageManager | null {
	try {
		const saved = readFileSync(join(root, MANAGER_FILE), 'utf8').trim();
		return MANAGERS.find((manager) => manager === saved) ?? null;
	} catch {
		return null;
	}
}

function rememberManager(root: string, manager: PackageManager): void {
	try {
		writeFileSync(join(root, MANAGER_FILE), manager);
	} catch {}
}

export function availablePackageManagers(root = SERVER_ROOT): PackageManager[] {
	if (!hasNodeRuntime()) return [];
	const chosen = savedManager(root);
	if (chosen) return which(chosen) ? [chosen] : [];
	return MANAGERS.filter((manager) => which(manager));
}

const INSTALL_ARGS: Record<PackageManager, (root: string) => string[]> = {
	npm: (root) => ['install', '--prefix', root, '--no-save', '--no-audit', '--no-fund'],
	bun: (root) => ['add', '--cwd', root],
	pnpm: (root) => ['add', '--dir', root],
};

function failureOf(result: ProcessResult, manager: PackageManager): string | null {
	if (result.error) {
		return notInstalled(result)
			? `${manager} is not installed, or not on PATH`
			: result.error.message;
	}
	if (result.timedOut) return `${manager} timed out`;
	if (result.status === 0) return null;
	return firstLine(result.stderr) || `${manager} exited with code ${result.status}`;
}

export async function installServer(
	packages: string[],
	root = SERVER_ROOT,
	manager: PackageManager = 'npm',
): Promise<string | null> {
	mkdirSync(root, { recursive: true });
	const result = await run(manager, [...INSTALL_ARGS[manager](root), ...packages], {
		timeout: INSTALL_TIMEOUT_MS,
	});
	const failure = failureOf(result, manager);
	if (failure) return failure;
	rememberManager(root, manager);
	return null;
}

export async function downloadServer(
	url: string,
	name: string,
	root = SERVER_ROOT,
): Promise<string | null> {
	const target = join(root, 'bin', process.platform === 'win32' ? `${name}.exe` : name);
	const partial = `${target}.part`;
	try {
		mkdirSync(join(root, 'bin'), { recursive: true });
		const response = await fetch(url, { signal: AbortSignal.timeout(INSTALL_TIMEOUT_MS) });
		if (!response.ok) return `HTTP ${response.status}`;
		await Bun.write(partial, response);
		if (process.platform !== 'win32') chmodSync(partial, 0o755);
		renameSync(partial, target);
		return null;
	} catch (error) {
		rmSync(partial, { force: true });
		return error instanceof Error ? error.message : String(error);
	}
}

import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const INSTALL_TIMEOUT_MS = 180_000;

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
	try {
		const child = spawnSync('node', ['--version'], { stdio: 'ignore' });
		return child.status === 0;
	} catch {
		return false;
	}
}

export function installServer(packages: string[], root = SERVER_ROOT): Promise<string | null> {
	return new Promise((resolve) => {
		const child = spawn(
			'npm',
			['install', '--prefix', root, '--no-save', '--no-audit', '--no-fund', ...packages],
			{ stdio: ['ignore', 'ignore', 'pipe'] },
		);
		let stderr = '';
		child.stderr?.on('data', (chunk) => (stderr += chunk));

		let killed = false;
		const timer = setTimeout(() => {
			killed = true;
			child.kill('SIGKILL');
		}, INSTALL_TIMEOUT_MS);
		timer.unref?.();

		let settled = false;
		const finish = (error: string | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(error);
		};

		child.on('error', (error: NodeJS.ErrnoException) =>
			finish(error.code === 'ENOENT' ? 'npm is not installed, or not on PATH' : error.message),
		);
		child.on('close', (code) => {
			if (killed) return finish('npm timed out');
			if (code === 0) return finish(null);
			return finish(firstLine(stderr) || `npm exited with code ${code}`);
		});
	});
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

function firstLine(text: string): string {
	return text.trim().split('\n')[0]?.trim() ?? '';
}

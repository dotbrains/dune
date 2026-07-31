import { spawn } from 'node:child_process';

export interface ProcessResult {
	status: number | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
	overflow: boolean;
	error: NodeJS.ErrnoException | null;
}

export interface RunOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	timeout: number;
	maxOutput?: number;
}

export function run(bin: string, args: string[], options: RunOptions): Promise<ProcessResult> {
	return new Promise((resolve) => {
		const child = spawn(bin, args, {
			cwd: options.cwd,
			env: options.env,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		let size = 0;
		let timedOut = false;
		let overflow = false;
		let settled = false;
		let timer: ReturnType<typeof setTimeout>;

		const finish = (status: number | null, error: NodeJS.ErrnoException | null = null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({
				status,
				stdout: Buffer.concat(stdout).toString('utf8'),
				stderr: Buffer.concat(stderr).toString('utf8'),
				timedOut,
				overflow,
				error,
			});
		};

		const collect = (target: Buffer[], chunk: Buffer) => {
			if (options.maxOutput !== undefined) {
				size += chunk.length;
				if (size > options.maxOutput) {
					overflow = true;
					child.kill('SIGKILL');
					return;
				}
			}
			target.push(chunk);
		};

		timer = setTimeout(() => {
			timedOut = true;
			child.kill('SIGKILL');
		}, options.timeout);

		child.stdout.on('data', (chunk: Buffer) => collect(stdout, chunk));
		child.stderr.on('data', (chunk: Buffer) => collect(stderr, chunk));
		child.on('error', (error) => finish(null, error));
		child.on('close', (code) => finish(code));
	});
}

export const notInstalled = (result: ProcessResult): boolean => result.error?.code === 'ENOENT';

export function firstLine(text: string): string {
	return text.trim().split('\n')[0]?.trim() ?? '';
}

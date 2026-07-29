import { execFileSync } from 'node:child_process';

const UNSIGNED = ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false'];

export function git(cwd: string, ...args: string[]) {
	return execFileSync('git', [...UNSIGNED, ...args], { cwd });
}

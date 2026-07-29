import { dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

interface DirectoryBudget {
	limit: number;
	reason: string;
}
interface BudgetFile {
	default_files: number;
	directories?: Record<string, DirectoryBudget>;
	exclude?: string[];
}
const budgetPath = process.argv[2] ?? 'scripts/flat-directory-budgets.json';
const budget = JSON.parse(readFileSync(budgetPath, 'utf8')) as BudgetFile;
const tracked = spawnSync('git', ['ls-files'], { encoding: 'utf8' });
if (tracked.status !== 0) process.exit(tracked.status ?? 1);
const excluded = budget.exclude?.map((pattern) => new RegExp(pattern)) ?? [];
const counts = new Map<string, number>();
for (const file of tracked.stdout.trim().split('\n').filter(Boolean)) {
	if (excluded.some((pattern) => pattern.test(file))) continue;
	const dir = dirname(file);
	counts.set(dir, (counts.get(dir) ?? 0) + 1);
}
let failed = false;
for (const [dir, count] of [...counts].toSorted()) {
	const limit = budget.directories?.[dir]?.limit ?? budget.default_files;
	if (count > limit) {
		console.error(`${dir}: ${count} direct files > budget ${limit}`);
		failed = true;
	}
}
if (failed) process.exit(1);

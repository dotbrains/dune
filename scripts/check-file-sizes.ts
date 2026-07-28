import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

interface BudgetFile {
	default_lines: number;
	files?: Record<string, number>;
	exclude?: string[];
}
const budgetPath = process.argv[2] ?? 'scripts/file-size-budgets.json';
const budget = JSON.parse(readFileSync(budgetPath, 'utf8')) as BudgetFile;
const tracked = spawnSync('git', ['ls-files'], { encoding: 'utf8' });
if (tracked.status !== 0) process.exit(tracked.status ?? 1);
const excluded = budget.exclude?.map((pattern) => new RegExp(pattern)) ?? [];
const suffix = /\.(ts|tsx|js|mjs|json|md|yml|yaml|toml|sh)$/;
let failed = false;
for (const file of tracked.stdout.trim().split('\n').filter(Boolean)) {
	if (!suffix.test(file) || excluded.some((pattern) => pattern.test(file))) continue;
	const lines = readFileSync(file, 'utf8').split('\n').length - 1;
	const limit = budget.files?.[file] ?? budget.default_lines;
	if (lines > limit) {
		console.error(`${file}: ${lines} lines > budget ${limit}`);
		failed = true;
	}
}
if (failed) process.exit(1);

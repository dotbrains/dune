import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = 'test';
const BATCH_SIZE = Number.parseInt(process.env.DUNE_TEST_BATCH_SIZE ?? '10', 10);

const tests = readdirSync(TEST_DIR)
	.filter((name) => /\.test\.tsx?$/.test(name))
	.toSorted()
	.map((name) => join(TEST_DIR, name));

if (tests.length === 0) {
	console.error('No test files found');
	process.exit(1);
}

for (let at = 0; at < tests.length; at += BATCH_SIZE) {
	const batch = tests.slice(at, at + BATCH_SIZE);
	console.log(`\n# bun test ${at + 1}-${at + batch.length} of ${tests.length}`);
	const run = Bun.spawnSync(['bun', 'test', ...batch], {
		stdout: 'inherit',
		stderr: 'inherit',
	});
	if (run.exitCode !== 0) process.exit(run.exitCode ?? 1);
}

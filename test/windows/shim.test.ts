import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { removeWindowsBareShim } from '../../bin/windows-shim.mjs';

async function createShims() {
	const prefix = await mkdtemp(join(tmpdir(), 'dune-windows-shim-'));
	for (const name of ['dune', 'dune.cmd', 'dune.ps1']) writeFileSync(join(prefix, name), name);
	return prefix;
}

function withNpmEnv(env: Record<string, string | undefined>, run: () => void) {
	const keys = [
		'npm_config_global',
		'npm_config_location',
		'npm_config_global_prefix',
		'npm_config_prefix',
	];
	const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
	try {
		for (const key of keys) delete process.env[key];
		for (const [key, value] of Object.entries(env)) {
			if (value !== undefined) process.env[key] = value;
		}
		run();
	} finally {
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

describe('Windows npm shim cleanup', () => {
	test('removes only the extensionless global shim on Windows', async () => {
		const prefix = await createShims();
		try {
			removeWindowsBareShim({ platform: 'win32', global: 'true', prefix });
			expect(existsSync(join(prefix, 'dune'))).toBe(false);
			expect(existsSync(join(prefix, 'dune.cmd'))).toBe(true);
			expect(existsSync(join(prefix, 'dune.ps1'))).toBe(true);
		} finally {
			await rm(prefix, { recursive: true, force: true });
		}
	});

	test('leaves shims alone outside a Windows global install', async () => {
		const prefixes = await Promise.all([createShims(), createShims(), createShims()]);
		try {
			removeWindowsBareShim({ platform: 'linux', global: 'true', prefix: prefixes[0] });
			removeWindowsBareShim({ platform: 'win32', global: 'false', prefix: prefixes[1] });
			withNpmEnv({}, () => removeWindowsBareShim({ platform: 'win32', prefix: prefixes[2] }));
			expect(prefixes.every((prefix) => existsSync(join(prefix, 'dune')))).toBe(true);
		} finally {
			await Promise.all(prefixes.map((prefix) => rm(prefix, { recursive: true, force: true })));
		}
	});

	test('uses either global prefix npm exports', async () => {
		const [globalPrefix, explicitPrefix] = await Promise.all([createShims(), createShims()]);
		try {
			withNpmEnv({ npm_config_global: 'true', npm_config_global_prefix: globalPrefix }, () =>
				removeWindowsBareShim({ platform: 'win32' }),
			);
			expect(existsSync(join(globalPrefix, 'dune'))).toBe(false);

			withNpmEnv({ npm_config_global: 'true', npm_config_prefix: explicitPrefix }, () =>
				removeWindowsBareShim({ platform: 'win32' }),
			);
			expect(existsSync(join(explicitPrefix, 'dune'))).toBe(false);
		} finally {
			await Promise.all(
				[globalPrefix, explicitPrefix].map((prefix) =>
					rm(prefix, { recursive: true, force: true }),
				),
			);
		}
	});

	test('treats npm_config_location=global as a global install', async () => {
		const prefix = await createShims();
		try {
			withNpmEnv({ npm_config_location: 'global', npm_config_global_prefix: prefix }, () =>
				removeWindowsBareShim({ platform: 'win32' }),
			);
			expect(existsSync(join(prefix, 'dune'))).toBe(false);
		} finally {
			await rm(prefix, { recursive: true, force: true });
		}
	});

	test('does not fail when there is no bare shim to delete', async () => {
		const prefix = await mkdtemp(join(tmpdir(), 'dune-windows-shim-'));
		try {
			mkdirSync(join(prefix, 'node_modules'));
			expect(() =>
				removeWindowsBareShim({ platform: 'win32', global: 'true', prefix }),
			).not.toThrow();
		} finally {
			await rm(prefix, { recursive: true, force: true });
		}
	});
});

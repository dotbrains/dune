import { afterEach, expect, test } from 'bun:test';
import { createRoot, createSignal } from 'solid-js';

import { DEFAULTS } from '../src/core/config';
import { resetProgress } from '../src/core/progress';
import { createAppRuntime } from '../src/app/runtime';
import type { BusyState } from '../src/app/types';

afterEach(resetProgress);

test('a busy operation reports through the terminal progress indicator', async () => {
	const originalWrite = process.stdout.write;
	const originalIsTty = process.stdout.isTTY;
	const written: string[] = [];
	process.stdout.write = ((text: string) => {
		written.push(text);
		return true;
	}) as typeof process.stdout.write;
	Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
	process.env.DUNE_PROGRESS = 'on';

	let dispose!: () => void;
	let setBusy!: (state: BusyState) => void;
	try {
		createRoot((disposeRoot) => {
			dispose = disposeRoot;
			const [busy, setBusySignal] = createSignal<BusyState>(null);
			setBusy = setBusySignal;
			createAppRuntime({
				buffers: {},
				busy,
				rootDir: '/tmp',
				userConfig: DEFAULTS,
				projectConfig: {},
				config: DEFAULTS,
				renderer: { destroy: () => {} },
				setConfig: () => {},
				setUserConfig: () => {},
				setProjectConfig: () => {},
				setPrompt: () => {},
				setStatus: () => {},
			});
		});

		setBusy({ label: 'Deleting', done: 0, total: 0 });
		await Promise.resolve();
		setBusy({ label: 'Deleting', done: 2, total: 4 });
		await Promise.resolve();
		setBusy(null);
		await Promise.resolve();

		expect(written).toEqual(['\x1B]9;4;3\x07', '\x1B]9;4;1;50\x07', '\x1B]9;4;0\x07']);
	} finally {
		dispose();
		process.stdout.write = originalWrite;
		Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTty, configurable: true });
		delete process.env.DUNE_PROGRESS;
	}
});

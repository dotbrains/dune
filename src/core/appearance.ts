import { spawnSync } from 'node:child_process';

export type Appearance = 'dark' | 'light';

export const APPEARANCE_ENV = 'DUNE_OS_APPEARANCE';

type Probe = {
	command: string;
	args: string[];
	read: (stdout: string, ok: boolean) => Appearance | null;
};

const PROBES: Record<string, Probe[]> = {
	darwin: [
		{
			command: 'defaults',
			args: ['read', '-g', 'AppleInterfaceStyle'],
			read: (stdout, ok) => (ok && stdout.trim() === 'Dark' ? 'dark' : 'light'),
		},
	],
	linux: [
		{
			command: 'gsettings',
			args: ['get', 'org.gnome.desktop.interface', 'color-scheme'],
			read: (stdout, ok) => {
				if (!ok) return null;
				const value = stdout.trim();
				if (value.includes('prefer-dark')) return 'dark';
				if (value.includes('prefer-light')) return 'light';
				return null;
			},
		},
		{
			command: 'gsettings',
			args: ['get', 'org.gnome.desktop.interface', 'gtk-theme'],
			read: (stdout, ok) =>
				ok ? (stdout.toLowerCase().includes('dark') ? 'dark' : 'light') : null,
		},
	],
	win32: [
		{
			command: 'reg',
			args: [
				'query',
				'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize',
				'/v',
				'AppsUseLightTheme',
			],
			read: (stdout, ok) => {
				if (!ok) return null;
				const value = /AppsUseLightTheme\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(stdout)?.[1];
				return value === undefined ? null : Number.parseInt(value, 16) === 0 ? 'dark' : 'light';
			},
		},
	],
};

export function parseEnvAppearance(value: string | undefined): Appearance | null {
	const wanted = value?.trim().toLowerCase();
	return wanted === 'dark' || wanted === 'light' ? wanted : null;
}

export function detectAppearance(): Appearance | null {
	const forced = parseEnvAppearance(process.env[APPEARANCE_ENV]);
	if (forced) return forced;
	for (const probe of PROBES[process.platform] ?? []) {
		try {
			const run = spawnSync(probe.command, probe.args, { encoding: 'utf8', timeout: 2000 });
			const appearance = probe.read(run.stdout ?? '', run.status === 0);
			if (appearance) return appearance;
		} catch {}
	}
	return null;
}

export function watchAppearance(
	onChange: (appearance: Appearance) => void,
	intervalMs = 2000,
): () => void {
	let last: Appearance | null = null;
	const poll = () => {
		const next = detectAppearance();
		if (!next || next === last) return;
		last = next;
		onChange(next);
	};
	poll();
	const timer = setInterval(poll, intervalMs);
	timer.unref?.();
	return () => clearInterval(timer);
}

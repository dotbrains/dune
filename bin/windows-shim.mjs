import { rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * npm creates three global launchers on Windows: dune, dune.cmd and dune.ps1.
 * PowerShell can choose the extensionless launcher first, then cannot execute it.
 */
export function removeWindowsBareShim({
	platform = process.platform,
	global: isGlobal = process.env.npm_config_global,
	location = process.env.npm_config_location,
	prefix = process.env.npm_config_global_prefix || process.env.npm_config_prefix,
} = {}) {
	if (platform !== 'win32' || !prefix) return;
	if (isGlobal !== 'true' && location !== 'global') return;
	try {
		rmSync(join(prefix, 'dune'));
	} catch {
		// Best effort: dune.cmd and dune.ps1 are the supported native Windows launchers.
	}
}

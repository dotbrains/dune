#!/usr/bin/env node
/**
 * Fetch the binary at install time, so the first run is instant.
 *
 * Nothing here is load-bearing: the shim fetches too, on first run, for installs that
 * skipped scripts or had no network at the time. Failure is therefore silent and the
 * exit code is always zero — installing something that merely depends on dune must not
 * break because a download did.
 */
import { fetchBinary, findBinary, supported, target } from './binary.mjs';
import { removeWindowsBareShim } from './windows-shim.mjs';

removeWindowsBareShim();

if (supported && !findBinary()) {
	process.stderr.write(`dune: fetching the ${target} binary...\n`);
	await fetchBinary();
}

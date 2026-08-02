import { registerLocalThemes } from '../themes';
import { loadIconThemes } from './iconThemes';
import type { IconTheme } from './iconThemes';
import { loadLocalThemes } from './localThemes';

export function loadAppearancePlugins(rootDir: string): readonly IconTheme[] {
	registerLocalThemes(loadLocalThemes(rootDir).themes);
	return loadIconThemes(rootDir).themes;
}

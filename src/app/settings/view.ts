import type { Config } from '../../core/config';
import type { IconTheme } from '../../core/iconThemes';
import type { createAppControls } from '../appControls';
import { createSettingsRows } from '../settingsRows';

export function createAppSettingRows(deps: {
	config: Config;
	iconThemes: () => readonly IconTheme[];
	controls: Pick<
		ReturnType<typeof createAppControls>,
		| 'applyTheme'
		| 'applyThemeSlot'
		| 'applyTabSize'
		| 'applyVim'
		| 'editFormatter'
		| 'editLspServer'
		| 'editTypescriptTsdk'
		| 'editKeybinding'
		| 'editSidebarWidth'
		| 'toggleAutoSave'
		| 'toggleFormat'
		| 'toggleThemeSync'
		| 'toggleTransparent'
		| 'toggleDotfiles'
		| 'toggleGitignored'
		| 'toggleWrap'
		| 'toggleTrim'
	>;
	patchConfig: (patch: Partial<Config>) => void;
	configScope: () => 'user' | 'project';
}) {
	return createSettingsRows({
		config: deps.config,
		iconThemes: deps.iconThemes,
		applyTheme: deps.controls.applyTheme,
		applyThemeSlot: deps.controls.applyThemeSlot,
		applyTabSize: deps.controls.applyTabSize,
		applyVim: deps.controls.applyVim,
		editFormatter: deps.controls.editFormatter,
		editLspServer: deps.controls.editLspServer,
		editTypescriptTsdk: deps.controls.editTypescriptTsdk,
		editKeybinding: deps.controls.editKeybinding,
		editSidebarWidth: deps.controls.editSidebarWidth,
		toggleAutoSave: deps.controls.toggleAutoSave,
		toggleFormat: deps.controls.toggleFormat,
		toggleThemeSync: deps.controls.toggleThemeSync,
		toggleTransparent: deps.controls.toggleTransparent,
		toggleDotfiles: deps.controls.toggleDotfiles,
		toggleGitignored: deps.controls.toggleGitignored,
		toggleWrap: deps.controls.toggleWrap,
		toggleTrim: deps.controls.toggleTrim,
		patchConfig: deps.patchConfig,
		configScope: deps.configScope,
	});
}

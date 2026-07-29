import { defineTheme } from './builder';

interface CatppuccinColors {
	rosewater: string;
	pink: string;
	mauve: string;
	red: string;
	peach: string;
	yellow: string;
	green: string;
	sky: string;
	blue: string;
	text: string;
	subtext0: string;
	overlay2: string;
	overlay0: string;
	surface2: string;
	surface1: string;
	surface0: string;
	base: string;
	mantle: string;
	crust: string;
	guide: string;
}

const flavor = (name: string, c: CatppuccinColors) =>
	defineTheme(`Catppuccin ${name}`, {
		bg: c.base,
		panel: c.mantle,
		bar: c.crust,
		line: c.mantle,
		guide: c.guide,
		text: c.text,
		dim: c.subtext0,
		faint: c.overlay0,
		accent: c.blue,
		accentText: c.crust,
		selection: c.surface0,
		focus: c.surface1,
		warn: c.yellow,
		error: c.red,
		folder: c.text,
		cursor: c.rosewater,
		scrollbar: c.surface2,
		gutter: c.overlay0,
		added: c.green,
		modified: c.yellow,
		deleted: c.red,
		comment: c.overlay0,
		keyword: c.mauve,
		string: c.green,
		number: c.peach,
		function: c.blue,
		type: c.yellow,
		variable: c.text,
		property: c.blue,
		tag: c.red,
		operator: c.sky,
		punctuation: c.overlay2,
		label: c.pink,
	});

export const catppuccinMocha = flavor('Mocha', {
	rosewater: '#f5e0dc',
	pink: '#f5c2e7',
	mauve: '#cba6f7',
	red: '#f38ba8',
	peach: '#fab387',
	yellow: '#f9e2af',
	green: '#a6e3a1',
	sky: '#89dceb',
	blue: '#89b4fa',
	text: '#cdd6f4',
	subtext0: '#a6adc8',
	overlay2: '#9399b2',
	overlay0: '#6c7086',
	surface2: '#585b70',
	surface1: '#45475a',
	surface0: '#313244',
	base: '#1e1e2e',
	mantle: '#181825',
	crust: '#11111b',
	guide: '#28293a',
});

export const catppuccinMacchiato = flavor('Macchiato', {
	rosewater: '#f4dbd6',
	pink: '#f5bde6',
	mauve: '#c6a0f6',
	red: '#ed8796',
	peach: '#f5a97f',
	yellow: '#eed49f',
	green: '#a6da95',
	sky: '#91d7e3',
	blue: '#8aadf4',
	text: '#cad3f5',
	subtext0: '#a5adcb',
	overlay2: '#939ab7',
	overlay0: '#6e738d',
	surface2: '#5b6078',
	surface1: '#494d64',
	surface0: '#363a4f',
	base: '#24273a',
	mantle: '#1e2030',
	crust: '#181926',
	guide: '#2b2f42',
});

export const catppuccinFrappe = flavor('Frappé', {
	rosewater: '#f2d5cf',
	pink: '#f4b8e4',
	mauve: '#ca9ee6',
	red: '#e78284',
	peach: '#ef9f76',
	yellow: '#e5c890',
	green: '#a6d189',
	sky: '#99d1db',
	blue: '#8caaee',
	text: '#c6d0f5',
	subtext0: '#a5adce',
	overlay2: '#949cbb',
	overlay0: '#737994',
	surface2: '#626880',
	surface1: '#51576d',
	surface0: '#414559',
	base: '#303446',
	mantle: '#292c3c',
	crust: '#232634',
	guide: '#373b4e',
});

export const catppuccinLatte = flavor('Latte', {
	rosewater: '#dc8a78',
	pink: '#ea76cb',
	mauve: '#8839ef',
	red: '#d20f39',
	peach: '#fe640b',
	yellow: '#df8e1d',
	green: '#40a02b',
	sky: '#04a5e5',
	blue: '#1e66f5',
	text: '#4c4f69',
	subtext0: '#6c6f85',
	overlay2: '#7c7f93',
	overlay0: '#9ca0b0',
	surface2: '#acb0be',
	surface1: '#bcc0cc',
	surface0: '#ccd0da',
	base: '#eff1f5',
	mantle: '#e6e9ef',
	crust: '#dce0e8',
	guide: '#e5e7ed',
});

import { Show } from 'solid-js';

import { isPdfPath } from '../core/pdf';
import { ImageView } from './ImageView';
import { PdfView } from './PdfView';

interface ViewerPaneProps {
	path: string;
	width: number;
	height: number;
	focused: boolean;
	blocked: boolean;
	onFocus: () => void;
}

export function ViewerPane(props: ViewerPaneProps) {
	return (
		<Show
			when={isPdfPath(props.path)}
			fallback={
				<ImageView
					path={props.path}
					width={props.width}
					height={props.height}
					onFocus={props.onFocus}
				/>
			}
		>
			<PdfView
				path={props.path}
				width={props.width}
				height={props.height}
				focused={props.focused}
				blocked={props.blocked}
				onFocus={props.onFocus}
			/>
		</Show>
	);
}

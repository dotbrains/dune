import { TextAttributes } from '@opentui/core';

import { ui } from '../themes';

export function EditorEmptyState() {
	return (
		<box
			flexGrow={1}
			flexDirection="column"
			backgroundColor={ui.bg}
			alignItems="center"
			justifyContent="center"
		>
			<text fg={ui.dim} bg={ui.bg} content="dune" attributes={TextAttributes.BOLD} />
			<text fg={ui.faint} bg={ui.bg} content="" />
			<text fg={ui.faint} bg={ui.bg} content="Enter   open file from the tree" />
			<text fg={ui.faint} bg={ui.bg} content="Ctrl+P  commands" />
			<text fg={ui.faint} bg={ui.bg} content="Ctrl+F  find" />
		</box>
	);
}

export function EditorNotice(props: { notice: { name: string; reason: string } }) {
	return (
		<box
			position="absolute"
			top={0}
			left={0}
			width="100%"
			height="100%"
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			backgroundColor={ui.bg}
			zIndex={10}
		>
			<text
				fg={ui.text}
				bg={ui.bg}
				content={`${props.notice.name} cannot be shown`}
				attributes={TextAttributes.BOLD}
			/>
			<text fg={ui.faint} bg={ui.bg} content="" />
			<text fg={ui.dim} bg={ui.bg} content={props.notice.reason} />
			<text fg={ui.faint} bg={ui.bg} content="" />
			<text fg={ui.faint} bg={ui.bg} content="Press any key to go back" />
		</box>
	);
}

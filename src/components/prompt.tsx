import React, {Component, ReactElement} from 'react';

export interface PromptProps {
	text:ReactElement
}

export class Prompt extends Component<PromptProps, {}> {

	render() {
		return (
			<div className='sq-info-prompt'>
				{this.props.text}
			</div>
		);
	}
}
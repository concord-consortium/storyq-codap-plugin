import React, {Component} from 'react';
import {PromptsManager} from "../managers/promptsManager";
import {observer} from "mobx-react";

export interface PromptProps {
	promptsManager:PromptsManager
}

export const Prompt = observer(class Prompt extends Component<PromptProps, {}> {

	render() {
		return (
			<div className='sq-info-prompt'>
				{this.props.promptsManager.getCurrentPrompt()}
			</div>
		);
	}
})
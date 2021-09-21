/**
 * This component manages the lower part of the TargetPanel
 */

import React, {Component} from "react";
import {SelectBox} from "devextreme-react/select-box";
import {TargetManager} from "../managers/target_manager";

export class TargetTextArea extends Component<{targetManager:TargetManager}, {}> {

	constructor(props: any) {
		super(props);
	}

	public async componentDidMount() {
	}

	render() {
		if(this.props.targetManager.targetDatasetInfo) {
			return (
				<div className='sq-target-text-panel'>
					<p>Target Text:</p>
				</div>
			);
		}
	}
}
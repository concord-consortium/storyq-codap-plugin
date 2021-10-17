/**
 * This component shows under the Training tab
 */

import React, {Component} from "react";
import {DomainStore} from "../stores/domain_store";
import {observer} from "mobx-react";
import {UiStore} from "../stores/ui_store";
import {TargetInfoPane} from "./target_info_pane";
import codapInterface, {CODAP_Notification} from "../lib/CodapInterface";
import {TrainingPane} from "./training_pane";

interface TrainingPanelState {
	count: number,
}

interface TrainingPanelInfo {
	subscriberIndex: number
}

export interface Training_Props {
	uiStore: UiStore
	domainStore: DomainStore
}

export const TrainingPanel = observer(class TrainingPanel extends Component<Training_Props, TrainingPanelState> {

	private trainingPanelInfo: TrainingPanelInfo;

	constructor(props: any) {
		super(props);
		this.state = {
			count: 0
		};
		this.trainingPanelInfo = {subscriberIndex: -1}
	}

	async componentDidMount() {
		this.trainingPanelInfo.subscriberIndex = codapInterface.on('notify', '*', '', this.handleNotification);
		await this.props.domainStore.updateNonNtigramFeaturesDataset()
	}

	async handleNotification(iNotification: CODAP_Notification) {
		if (iNotification.action === 'notify') {
			/*
						let tOperation = iNotification.values.operation;
						if (tOperation === 'dataContextCountChanged') {
							await this.updateNonNtigramFeaturesDataset();
						}
			*/
		}
	}

	render() {

		return (
			<div className='sq-feature-panel'>
				<TargetInfoPane
					domainStore={this.props.domainStore}
				/>
				<TrainingPane
					uiStore={this.props.uiStore}
					domainStore={this.props.domainStore}
				/>
			</div>
		);
	}
})
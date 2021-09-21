/**
 * This component lists constructed features and provides an interface for construction and deletion
 */

import React, {Component} from "react";
import {SelectBox} from "devextreme-react/select-box";
import {getDatasetInfoWithFilter} from "../lib/codap-helper";
import codapInterface, {CODAP_Notification} from "../lib/CodapInterface";
import {TargetTextArea} from "./target_text_area";
import {TargetManager} from "../managers/target_manager";

interface TargetPanelState {
	count: number,
}

interface TargetPanelInfo {
	subscriberIndex: number
}

export interface Target_Props {
	targetManager: TargetManager
}

export class TargetPanel extends Component<Target_Props, TargetPanelState> {

	private targetPanelInfo: TargetPanelInfo;
	private targetPanelConstants = {
		createNewEntityInfo: {
			title: 'NEW',
			name: '',
			id: 0
		}
	}

	constructor(props: any) {
		super(props);
		this.state = {
			count: 0
		};
		this.handleNotification = this.handleNotification.bind(this);
		this.targetPanelInfo = {subscriberIndex: -1}
	}

	public async componentDidMount() {
		this.targetPanelInfo.subscriberIndex = codapInterface.on('notify', '*', '', this.handleNotification);
		await this.updateTargetPanelInfo();
	}

	async handleNotification(iNotification: CODAP_Notification) {
		if (iNotification.action === 'notify') {
			let tOperation = iNotification.values.operation;
			if (tOperation === 'dataContextCountChanged') {
				await this.updateTargetPanelInfo();
			}
		}
	}

	async updateTargetPanelInfo() {
		this.props.targetManager.datasetInfoArray = await getDatasetInfoWithFilter(() => true);
		this.forcePanelUpdate();
	}

	forcePanelUpdate() {
		this.setState({count: this.state.count + 1})
	}

	render() {

		function chooseDatasetMenu() {
			let tDatasetInfoArray = this_.props.targetManager.datasetInfoArray,
				tValue = (this_.props.targetManager.targetDatasetInfo === this_.targetPanelConstants.createNewEntityInfo) ?
					'' : this_.props.targetManager.targetDatasetInfo.title,
				tDatasetChoices: string[] = (tDatasetInfoArray.map(iInfo => iInfo.title));
			tDatasetChoices.push(this_.targetPanelConstants.createNewEntityInfo.title);
			return (
				<label>
					<span>Training Set:</span>
					<SelectBox
						dataSource={tDatasetChoices}
						placeholder={'Choose or create a dataset'}
						value={tValue}
						style={{display: 'inline-block'}}
						onValueChange={(e) => {
							let newInfo = tDatasetInfoArray.find(iInfo => iInfo.title === e) ||
								this_.targetPanelConstants.createNewEntityInfo;
							if (newInfo)
								this_.props.targetManager.targetDatasetInfo = newInfo;
							this_.forcePanelUpdate();
						}
						}
						width={'100%'}
					>
					</SelectBox>
				</label>)
		}

		let this_ = this;
		return (
			<div className='sq-target-panel'>
				{chooseDatasetMenu()}
				<TargetTextArea
					targetManager={this.props.targetManager}/>
			</div>
		);
	}
}
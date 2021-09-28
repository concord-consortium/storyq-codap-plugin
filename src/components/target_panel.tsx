/**
 * This component lists constructed features and provides an interface for construction and deletion
 */

import React, {Component} from "react";
import {SelectBox} from "devextreme-react/select-box";
import codapInterface, {CODAP_Notification} from "../lib/CodapInterface";
import {TargetTextArea} from "./target_text_area";
import {action, toJS} from "mobx";
import {DomainStore} from "../stores/domain_store";
import {observer} from "mobx-react";
import {UiStore} from "../stores/ui_store";

interface TargetPanelState {
	count: number,
}

interface TargetPanelInfo {
	subscriberIndex: number
}

export interface Target_Props {
	uiStore: UiStore
	domainStore: DomainStore
}

export const TargetPanel = observer(class TargetPanel extends Component<Target_Props, TargetPanelState> {

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
		await this.props.domainStore.targetStore.updateFromCODAP()
	}

	render() {

		function choicesMenu(iPrompt: string, iChoices: string[], iValue: string, iCallback: (choice: string) => void) {
			return (
				<label>
					<span>{iPrompt}:</span>
					<SelectBox
						dataSource={iChoices}
						placeholder={'Choose or create a dataset'}
						value={iValue}
						style={{display: 'inline-block'}}
						onValueChange={action((e) => iCallback(e))}
						width={'100%'}
					>
					</SelectBox>
				</label>)

		}

		function chooseDatasetMenu() {

			function handleChoice(iChoice: string) {
				let newInfo = toJS(tDatasetInfoArray.find(iInfo => iInfo.title === iChoice)) ||
					this_.targetPanelConstants.createNewEntityInfo;
				if (newInfo) {
					this_.props.domainStore.targetStore.targetDatasetInfo = newInfo;
					this_.updateTargetPanelInfo()
				}
			}

			let tDatasetInfoArray = this_.props.domainStore.targetStore.datasetInfoArray,
				tValue = (this_.props.domainStore.targetStore.targetDatasetInfo === this_.targetPanelConstants.createNewEntityInfo) ?
					'' : this_.props.domainStore.targetStore.targetDatasetInfo.title,
				tDatasetChoices: string[] = (tDatasetInfoArray.map(iInfo => iInfo.title));
			tDatasetChoices.push(this_.targetPanelConstants.createNewEntityInfo.title);
			return choicesMenu('Choose or create a dataset', tDatasetChoices, tValue, handleChoice)
		}

		function targetAttributeChoice() {
			if( this_.props.domainStore.targetStore.targetAttributeNames.length > 0) {
				return choicesMenu('Target Text', this_.props.domainStore.targetStore.targetAttributeNames,
					this_.props.domainStore.targetStore.targetAttributeName, (iChoice) => {
						this_.props.domainStore.targetStore.targetAttributeName = iChoice
						this_.updateTargetPanelInfo()
					})
			}
		}

		function targetClassChoice() {
			if( this_.props.domainStore.targetStore.targetAttributeName !== '') {
				return choicesMenu('Target Class', this_.props.domainStore.targetStore.targetAttributeNames,
					this_.props.domainStore.targetStore.targetClassAttributeName, (iChoice) => {
						this_.props.domainStore.targetStore.targetClassAttributeName = iChoice
						this_.updateTargetPanelInfo()
					})
			}
		}

		function lowerPanel() {
			if (this_.props.domainStore.targetStore.targetCases.length > 0) {
				return (
						<TargetTextArea
							uiStore={this_.props.uiStore}
							domainStore={this_.props.domainStore}>
						</TargetTextArea>
				)
			}
		}

		let this_ = this;
		return (
			<div className='sq-target-panel'>
				{chooseDatasetMenu()}
				<div className='sq-target-choices-panel'>
					{targetAttributeChoice()}
					{targetClassChoice()}
				</div>
				{lowerPanel()}
			</div>
		);
	}
})
/**
 * This component lists constructed features and provides an interface for construction and deletion
 */

import React, {Component} from "react";
import codapInterface, {CODAP_Notification} from "../lib/CodapInterface";
import {TargetTextArea} from "./target_text_area";
import {toJS} from "mobx";
import {DomainStore} from "../stores/domain_store";
import {observer} from "mobx-react";
import {UiStore} from "../stores/ui_store";
import {choicesMenu} from "./component_utilities";

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

	async updateTargetPanelInfo(iPropName?:string | null, iValue?:any) {
		await this.props.domainStore.targetStore.updateFromCODAP(iPropName, iValue)
	}

	render() {

		function chooseDatasetMenu() {

			async function handleChoice(iChoice: string) {
				let newInfo = toJS(tDatasetInfoArray.find(iInfo => iInfo.title === iChoice)) ||
					this_.targetPanelConstants.createNewEntityInfo;
				if (newInfo) {
					this_.props.domainStore.targetStore.targetDatasetInfo = newInfo;
					await this_.updateTargetPanelInfo()
				}
			}

			let tDatasetInfoArray = this_.props.domainStore.targetStore.datasetInfoArray,
				tValue = (this_.props.domainStore.targetStore.targetDatasetInfo === this_.targetPanelConstants.createNewEntityInfo) ?
					'' : this_.props.domainStore.targetStore.targetDatasetInfo.title,
				tDatasetChoices: string[] = (tDatasetInfoArray.map(iInfo => iInfo.title));
			tDatasetChoices.push(this_.targetPanelConstants.createNewEntityInfo.title);
			return choicesMenu('Choose or create a dataset', 'Choose or create a dataset',
				tDatasetChoices, tValue, handleChoice)
		}

		function targetAttributeChoice() {
			if (this_.props.domainStore.targetStore.targetAttributeNames.length > 0) {
				return choicesMenu('Target Text', 'Choose a target attribute',
					this_.props.domainStore.targetStore.targetAttributeNames,
					this_.props.domainStore.targetStore.targetAttributeName, async (iChoice) => {
						this_.props.domainStore.targetStore.targetAttributeName = iChoice
						await this_.updateTargetPanelInfo()
						this_.props.domainStore.addTextComponent()
					})
			}
		}

		function targetClassChoice() {
			if (this_.props.domainStore.targetStore.targetAttributeName !== '') {
				return choicesMenu('Target Class', 'Choose an attribute with classes',
					this_.props.domainStore.targetStore.targetAttributeNames,
					this_.props.domainStore.targetStore.targetClassAttributeName, async (iChoice) => {
						// this_.props.domainStore.targetStore.targetClassAttributeName = iChoice
						await this_.updateTargetPanelInfo('targetClassAttributeName', iChoice)
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
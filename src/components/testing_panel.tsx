/**
 * This component shows under the Testing tab
 */

import React, {Component} from "react";
import {DomainStore} from "../stores/domain_store";
import {observer} from "mobx-react";
import {UiStore} from "../stores/ui_store";
import codapInterface, {CODAP_Notification} from "../lib/CodapInterface";
import {choicesMenu} from "./component_utilities";
import Button from "devextreme-react/button";
import {action} from "mobx";

interface TestingPanelInfo {
	subscriberIndex: number
}

export interface Testing_Props {
	uiStore: UiStore
	domainStore: DomainStore
}

export const TestingPanel = observer(class TestingPanel extends Component<Testing_Props> {

	private testingPanelInfo: TestingPanelInfo;

	constructor(props: any) {
		super(props);
		this.handleNotification = this.handleNotification.bind(this)
		this.testingPanelInfo = {subscriberIndex: -1}
		this.testingPanelInfo.subscriberIndex = codapInterface.on('notify', '*', '', this.handleNotification);
	}

	async componentDidMount() {
		await this.updateCodapInfo()
	}

	async handleNotification(iNotification: CODAP_Notification) {
		if (iNotification.action === 'notify') {
			if (iNotification.values.operation === 'dataContextCountChanged') {
				await this.updateCodapInfo();
			}
		}
	}

	async updateCodapInfo() {
		await this.props.domainStore.testingStore.updateCodapInfoForTestingPanel()
	}

	render() {
		const this_ = this

		function getModelChoice() {
			const tModelChoices = this_.props.domainStore.trainingStore.trainingResults.map(iResult => iResult.name)
			return choicesMenu('Choose a model to test', tModelChoices,
				this_.props.domainStore.testingStore.chosenModelName, (iChoice) => {
					this_.props.domainStore.testingStore.chosenModelName = iChoice
				})
		}

		function getTestingDatasetChoice() {
			const tDatasetInfoArray = this_.props.domainStore.testingStore.testingDatasetInfoArray,
				tDatasetNames = tDatasetInfoArray.map(iEntity => iEntity.name)
			return choicesMenu('Choose a dataset for testing', tDatasetNames,
				this_.props.domainStore.testingStore.testingDatasetInfo.name,
				async (iChoice) => {
					const tChosenInfo = tDatasetInfoArray.find(iInfo => iInfo.name === iChoice)
					if (tChosenInfo)
						this_.props.domainStore.testingStore.testingDatasetInfo = tChosenInfo
					await this_.updateCodapInfo()
				})
		}

		function getTestingAttributeChoice() {
			if( this_.props.domainStore.testingStore.testingDatasetInfo.name !== '') {
				const tAttributeNames = this_.props.domainStore.testingStore.testingAttributeNames
				return choicesMenu('Choose a target test column', tAttributeNames,
					this_.props.domainStore.testingStore.testingAttributeName,
					(iChoice) => {
						this_.props.domainStore.testingStore.testingAttributeName = iChoice
					})
			}
		}

		function getButtons() {
			const tDisabled = this_.props.domainStore.testingStore.testingDatasetInfo.name === '' ||
				this_.props.domainStore.testingStore.chosenModelName === '' ||
				this_.props.domainStore.testingStore.testingAttributeName === ''
			return (
				<div className='sq-training-buttons'>
					<Button
						className='sq-button'
						disabled={tDisabled}
						onClick={action(async () => {
						})}>
						Run
					</Button>
				</div>
			)
		}

		return (
			<div className='sq-feature-panel'>
				{getModelChoice()}
				{getTestingDatasetChoice()}
				{getTestingAttributeChoice()}
				{getButtons()}
			</div>
		)
	}
})
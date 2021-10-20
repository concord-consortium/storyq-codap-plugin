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
import {action, toJS} from "mobx";
import {TestingManager} from "../managers/testing_manager";

interface TestingPanelInfo {
	subscriberIndex: number
}

export interface Testing_Props {
	uiStore: UiStore
	domainStore: DomainStore
}

export const TestingPanel = observer(class TestingPanel extends Component<Testing_Props> {

	private testingPanelInfo: TestingPanelInfo;
	testingManager: TestingManager
	kNonePresent = 'None present'

	constructor(props: any) {
		super(props);
		this.handleNotification = this.handleNotification.bind(this)
		this.testingPanelInfo = {subscriberIndex: -1}
		this.testingPanelInfo.subscriberIndex = codapInterface.on('notify', '*', '', this.handleNotification);

		this.testingManager = new TestingManager(this.props.domainStore, this.kNonePresent)
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
			return choicesMenu('Choose a model to test', 'Choose a model', tModelChoices,
				this_.props.domainStore.testingStore.chosenModelName, async (iChoice) => {
					this_.props.domainStore.testingStore.chosenModelName = iChoice
					await this_.updateCodapInfo()
				})
		}

		function getTestingDatasetChoice() {
			const tDatasetInfoArray = this_.props.domainStore.testingStore.testingDatasetInfoArray,
				tDatasetNames = tDatasetInfoArray.map(iEntity => iEntity.title)
			return choicesMenu('Choose a dataset to classify', 'Choose a dataset', tDatasetNames,
				this_.props.domainStore.testingStore.testingDatasetInfo.title,
				async (iChoice) => {
					const tChosenInfo = tDatasetInfoArray.find(iInfo => iInfo.title === iChoice)
					if (tChosenInfo)
						this_.props.domainStore.testingStore.testingDatasetInfo = tChosenInfo
					await this_.updateCodapInfo()
				})
		}

		function getTestingAttributeChoice() {
			if (this_.props.domainStore.testingStore.testingDatasetInfo.title !== '') {
				const tAttributeNames = this_.props.domainStore.testingStore.testingAttributeNames
				return choicesMenu('Choose the column with texts', 'Choose a column', tAttributeNames,
					this_.props.domainStore.testingStore.testingAttributeName,
					async (iChoice) => {
						this_.props.domainStore.testingStore.testingAttributeName = iChoice
						await this_.updateCodapInfo()
					})
			}
		}

		function getClassAttributeChoice() {
			if (this_.props.domainStore.testingStore.testingDatasetInfo.title !== '') {
				const tAttributeNames: string[] = toJS(this_.props.domainStore.testingStore.testingAttributeNames)
				tAttributeNames.unshift(this_.kNonePresent)
				return choicesMenu('Choose the column with class labels', 'Choose a column', tAttributeNames,
					this_.props.domainStore.testingStore.testingClassAttributeName,
					async (iChoice: string) => {
						this_.props.domainStore.testingStore.testingClassAttributeName = iChoice
						await this_.updateCodapInfo()
					})
			}
		}

		function getButtons() {
			const
				tTestingDatasetName = this_.props.domainStore.testingStore.testingDatasetInfo.title,
				tChosenModelName = this_.props.domainStore.testingStore.chosenModelName,
				tTestingAttributeName = this_.props.domainStore.testingStore.testingAttributeName,
				tTestingClassAttributeName = this_.props.domainStore.testingStore.testingClassAttributeName,
				tDisabled = tTestingDatasetName === '' || tChosenModelName === '' || tTestingAttributeName === '' ||
					tTestingClassAttributeName === ''
			return (
				<div className='sq-training-buttons'>
					<Button
						className='sq-button'
						disabled={tDisabled}
						onClick={action(async () => {
							this_.testingManager.classify()
						})}>
						{tDisabled ? 'Classify' : `Classify "${tTestingAttributeName}" using model "${tChosenModelName}"`}
					</Button>
				</div>
			)
		}

		function showResults() {
			const tResult = this_.props.domainStore.testingStore.testingResults
			return (
				<div>
					<table>
						<thead>
						<tr>
							<th>Model Name</th>
							<th>Accuracy</th>
							<th>Kappa</th>
						</tr>
						</thead>
						<tbody>
						<tr>
							<td>{tResult.modelName}</td>
							<td>{tResult.accuracy.toFixed(2)}</td>
							<td>{tResult.kappa.toFixed(2)}</td>
						</tr>
						</tbody>
					</table>
				</div>
			)
		}

		return (
			<div className='sq-feature-panel'>
				{getModelChoice()}
				{getTestingDatasetChoice()}
				{getTestingAttributeChoice()}
				{getClassAttributeChoice()}
				{getButtons()}
				{showResults()}
			</div>
		)
	}
})
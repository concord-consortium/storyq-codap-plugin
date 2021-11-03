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
		const this_ = this,
			tTestingStore = this.props.domainStore.testingStore,
			tReadyForNewTest = !tTestingStore.currentTestingResults.testBeingConstructed

		function getNewTestButton() {
			if (tReadyForNewTest) {
				return (
					<div className='sq-training-buttons'>
						<Button
							className='sq-button'
							onClick={action(async () => {
								this_.props.domainStore.testingStore.prepareForConstruction()
							})}>
							+ NewTest
						</Button>
					</div>
				)
			}
		}

		function getModelChoice() {
			if (!tReadyForNewTest) {
				const tModelChoices = this_.props.domainStore.trainingStore.trainingResults.map(iResult => iResult.name)
				return choicesMenu('Choose a model to test', 'Choose a model', tModelChoices,
					this_.props.domainStore.testingStore.chosenModelName, async (iChoice) => {
						this_.props.domainStore.testingStore.chosenModelName = iChoice
						await this_.updateCodapInfo()
					})
			}
		}

		function getTestingDatasetChoice() {
			if (!tReadyForNewTest) {
				const tDatasetInfoArray = tTestingStore.testingDatasetInfoArray,
					tDatasetNames = tDatasetInfoArray.map(iEntity => iEntity.title)
				return choicesMenu('Choose a dataset to classify', 'Choose a dataset', tDatasetNames,
					tTestingStore.testingDatasetInfo.title,
					async (iChoice) => {
						const tChosenInfo = tDatasetInfoArray.find(iInfo => iInfo.title === iChoice)
						if (tChosenInfo)
							tTestingStore.testingDatasetInfo = tChosenInfo
						await this_.updateCodapInfo()
					})
			}
		}

		function getTestingAttributeChoice() {
			if (!tReadyForNewTest && tTestingStore.testingDatasetInfo.title !== '') {
				const tAttributeNames = tTestingStore.testingAttributeNames
				return choicesMenu('Choose the column with texts', 'Choose a column', tAttributeNames,
					tTestingStore.testingAttributeName,
					async (iChoice) => {
						tTestingStore.testingAttributeName = iChoice
						await this_.updateCodapInfo()
					})
			}
		}

		function getClassAttributeChoice() {
			if (!tReadyForNewTest && tTestingStore.testingDatasetInfo.title !== '') {
				const tAttributeNames: string[] = toJS(tTestingStore.testingAttributeNames)
				tAttributeNames.unshift(this_.kNonePresent)
				return choicesMenu('Choose the column with class labels', 'Choose a column', tAttributeNames,
					tTestingStore.testingClassAttributeName,
					async (iChoice: string) => {
						tTestingStore.testingClassAttributeName = iChoice
						await this_.updateCodapInfo()
					})
			}
		}

		function getButtons() {
			if (!tReadyForNewTest) {
				const
					tTestingDatasetName = tTestingStore.testingDatasetInfo.title,
					tChosenModelName = tTestingStore.chosenModelName,
					tTestingAttributeName = tTestingStore.testingAttributeName,
					tTestingClassAttributeName = tTestingStore.testingClassAttributeName,
					tDisabled = tTestingDatasetName === '' || tChosenModelName === '' || tTestingAttributeName === '' ||
						tTestingClassAttributeName === ''
				return (
					<div className='sq-training-buttons'>
						<Button
							className='sq-button'
							disabled={tDisabled}
							onClick={action(async () => {
								await this_.testingManager.classify()
							})}>
							{tDisabled ? 'Classify' : `Classify "${tTestingAttributeName}" using model "${tChosenModelName}"`}
						</Button>
					</div>
				)
			}
		}

		function showResults() {

			function getRows() {
				return tTestingResults.map(iResult=>{
					return (
						<tr>
							<td>{iResult.modelName}</td>
							<td>{iResult.targetDatasetTitle}</td>
							<td>{iResult.accuracy.toFixed(2)}</td>
							<td>{iResult.kappa.toFixed(2)}</td>
						</tr>
					)
				})
			}

			const tTestingResults = tTestingStore.testingResultsArray
			if( tTestingResults.length > 0) {
				return (
					<div>
						<table>
							<thead>
							<tr>
								<th>Model Name</th>
								<th>Dataset</th>
								<th>Accuracy</th>
								<th>Kappa</th>
							</tr>
							</thead>
							<tbody>
							{getRows()}
							</tbody>
						</table>
					</div>
				)
			}
		}

		return (
			<div className='sq-feature-panel'>
				{getNewTestButton()}
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
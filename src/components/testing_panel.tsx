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

export interface Testing_Props {
	uiStore: UiStore
	domainStore: DomainStore
}

export const TestingPanel = observer(class TestingPanel extends Component<Testing_Props> {

	testingManager: TestingManager
	kNonePresent = 'None present'

	constructor(props: any) {
		super(props);
		this.handleNotification = this.handleNotification.bind(this)
		codapInterface.on('notify', '*', '', this.handleNotification);

		this.testingManager = new TestingManager(this.props.domainStore, this.kNonePresent)
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
			tTestingClassAttributeName = tTestingStore.testingClassAttributeName,
			tReadyForNewTest = !tTestingStore.currentTestingResults.testBeingConstructed,
			tNumModels = this.props.domainStore.trainingStore.trainingResults.length,
			tTestingResults = tTestingStore.testingResultsArray


		function testingInstructions() {
			if(tTestingResults.length === 0) {
				return (
					<div className='sq-info-prompt'>
						<p>Test your model{tNumModels > 1 ? 's' : ''} on new data.</p>
					</div>
				)
			}
			else {
				return (
					<div className='sq-info-prompt'>
						<p>You've tested {tTestingResults.length} time{tTestingResults.length > 1 ? 's' : ''}. Test again?</p>
					</div>
				)
			}
		}

		function getNewTestButton() {
			if (tReadyForNewTest) {
				return (
					<div className='sq-training-buttons'>
						<Button
							className='sq-button'
							onClick={action(async () => {
								this_.props.domainStore.testingStore.prepareForConstruction()
							})}
							hint={'Click to set up a test using a model you have trained to classify texts.'}>
							+ NewTest
						</Button>
					</div>
				)
			}
		}

		function getModelChoice() {
			if (!tReadyForNewTest) {
				const tModelChoices = this_.props.domainStore.trainingStore.trainingResults.map(iResult => iResult.name)
				return choicesMenu('Choose a model to test', 'Choose a model',
					'This model will be used to classify the dataset you choose as a test of how well' +
					' the model performs on a dataset other than the one that was used to train it.',
					tModelChoices,
					this_.props.domainStore.testingStore.chosenModelName, 'No models to choose from', async (iChoice) => {
						this_.props.domainStore.testingStore.chosenModelName = iChoice
						await this_.updateCodapInfo()
					})
			}
		}

		function getTestingDatasetChoice() {
			if (!tReadyForNewTest) {
				const tDatasetInfoArray = tTestingStore.testingDatasetInfoArray,
					tDatasetNames = tDatasetInfoArray.map(iEntity => iEntity.title)
				return choicesMenu('Choose testing data', 'Your choice',
					'This dataset will be analyzed by the chosen model. It should have at least one column' +
					' containing texts to be classified. It may or may not have a label column.',
					tDatasetNames,
					tTestingStore.testingDatasetInfo.title,
					'',
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
				return choicesMenu('Choose the column with text', 'Choose a column',
					'The chosen column should contain the texts that are to be classified.',
					tAttributeNames,
					tTestingStore.testingAttributeName,
					'',
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
				return choicesMenu('Choose the column with the labels (optional)', 'Choose a column',
					'If this column is specified, it should contain two unique labels, one for each group.',
					tAttributeNames,
					tTestingClassAttributeName,
					'',
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
					tDisabled = tTestingDatasetName === '' || tChosenModelName === '' || tTestingAttributeName === '',
					// The following hint doesn't display if the button is disabled. See
					// https://supportcenter.devexpress.com/ticket/details/t844498/button-how-to-add-tooltip-to-disabled-button
					// for suggested solution
					tHint = tTestingDatasetName === '' ? 'Please choose a dataset with texts to classify.' :
						(tChosenModelName === '' ? 'Please choose a model you have trained.' :
							(tTestingAttributeName === '' ? 'Please choose the attribute that contains the texts you wish to classify' :
								'Click this button to carry out the classification test.'))
				return (
					<div className='sq-training-buttons'>
						<Button
							className='sq-button'
							disabled={tDisabled}
							onClick={action(async () => {
								await this_.testingManager.classify()
							})}
							hint={tHint}>
							Test
						</Button>
					</div>
				)
			}
		}

		function showResults() {

			function getRows() {
				return tTestingResults.map((iResult, iIndex) => {
					return (
						<tr key={iIndex}>
							<td style={{textAlign:'center'}}>{iResult.modelName}</td>
							<td>{iResult.targetDatasetTitle}</td>
							<td style={{textAlign:'right'}}>{iResult.accuracy !== 0 ? (100 * iResult.accuracy).toFixed(1)+'%' : 'NA'}</td>
						</tr>
					)
				})
			}

			if (tTestingResults.length > 0) {
				return (
					<div>
						<table>
							<thead>
							<tr>
								<th style={{textAlign:'center'}} title={'The name of the model used in this test'}>Model Name</th>
								<th style={{textAlign:'center'}} title={'The dataset whose texts were classified in this test'}>Dataset</th>
								<th style={{textAlign:'center'}} title={'If the test dataset has labels, the percent of classifications that were correct'}>
									Accuracy
								</th>
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
				{testingInstructions()}
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
/**
 * This component shows under the Testing tab
 */

import { action, toJS } from "mobx";
import { observer } from "mobx-react";
import React, { Component } from "react";
import codapInterface, { CODAP_Notification } from "../lib/CodapInterface";
import { SQ } from "../lists/lists";
import { TestingManager } from "../managers/testing_manager";
import { testingStore } from "../stores/testing_store";
import { trainingStore } from "../stores/training_store";
import { ChoicesMenu } from "./choices-menu";
import { Button } from "./ui/button";

export const kNonePresent = 'None present';

export interface Testing_Props {
	testingManager: TestingManager
}

export const TestingPanel = observer(class TestingPanel extends Component<Testing_Props> {

	testingManager: TestingManager

	constructor(props: Testing_Props) {
		super(props);
		this.handleDataContextNotification = this.handleDataContextNotification.bind(this)
		codapInterface.on('notify', '*', '', this.handleDataContextNotification);

		this.testingManager = props.testingManager;
	}

	async handleDataContextNotification(iNotification: CODAP_Notification) {
		if (iNotification.action === 'notify') {
			if (iNotification.values.operation === 'dataContextCountChanged') {
				await this.updateCodapInfo();
			} else if (iNotification.values.operation === 'titleChange') {
				action(() => {
					testingStore.testingDatasetInfo.name = ''
				})()
				await this.updateCodapInfo()
			}
		}
	}

	async updateCodapInfo() {
		await testingStore.updateCodapInfoForTestingPanel()
	}

	render() {
		const this_ = this,
			tTestingClassAttributeName = testingStore.testingClassAttributeName,
			tNumModels = trainingStore.trainingResults.length,
			tTestingResults = testingStore.testingResultsArray


		function testingInstructions() {
			if (tTestingResults.length === 0) {
				return (
					<div className='sq-info-prompt'>
						<p>Test your model{tNumModels > 1 ? 's' : ''} on new data.</p>
					</div>
				)
			} else {
				return (
					<div className='sq-info-prompt'>
						<p>You've tested {tTestingResults.length} time{tTestingResults.length > 1 ? 's' : ''}. Test again?</p>
						<p>Note that if you add new texts to {testingStore.testingDatasetInfo.title}, the testing results will
							update.</p>
					</div>
				)
			}
		}

		function getModelChoice() {
			const { chosenModelName } = testingStore;
			const tModelChoices = trainingStore.trainingResults.map(iResult => iResult.name),
				tPrompt = chosenModelName === '' ? 'Choose a model to test'
					: 'The model to test'
			return (
				<ChoicesMenu
					choices={tModelChoices}
					hint={SQ.hints.testingModelChoices}
					noDataText="No models to choose from"
					onValueChange={async (iChoice) => {
						testingStore.chosenModelName = iChoice;
						await this_.updateCodapInfo();
					}}
					placeHolder="Choose a model"
					prompt={tPrompt}
					value={chosenModelName}
				/>
			);
		}

		function getTestingDatasetChoice() {
			const tDatasetInfoArray = testingStore.testingDatasetInfoArray,
				tDatasetNames = tDatasetInfoArray.map(iEntity => iEntity.title)
			return (
				<ChoicesMenu
					choices={tDatasetNames}
					hint={SQ.hints.testingDatasetChoices}
					onValueChange={async (iChoice) => {
						const tChosenInfo = tDatasetInfoArray.find(iInfo => iInfo.title === iChoice);
						if (tChosenInfo) testingStore.testingDatasetInfo = tChosenInfo;
						await this_.updateCodapInfo();
					}}
					placeHolder="Your choice"
					prompt="Choose a data set"
					value={testingStore.testingDatasetInfo.title}
				/>
			);
		}

		function getTestingAttributeChoice() {
			if (testingStore.testingDatasetInfo.title !== '') {
				const tAttributeNames = testingStore.testingAttributeNames
				return (
					<ChoicesMenu
						choices={tAttributeNames}
						hint={SQ.hints.testingAttributeChoices}
						onValueChange={async (iChoice) => {
							testingStore.testingAttributeName = iChoice;
							await this_.updateCodapInfo();
						}}
						placeHolder="Choose a column"
						prompt="Choose the column with text"
						value={testingStore.testingAttributeName}
					/>
				);
			}
		}

		function getClassAttributeChoice() {
			if (testingStore.testingDatasetInfo.title !== '') {
				const tAttributeNames: string[] = toJS(testingStore.testingAttributeNames)
				tAttributeNames.unshift(kNonePresent)
				return (
					<ChoicesMenu
						choices={tAttributeNames}
						hint={SQ.hints.testingLabelsChoices}
						onValueChange={async (iChoice) => {
							testingStore.testingClassAttributeName = iChoice;
							await this_.updateCodapInfo();
						}}
						placeHolder="Choose a column"
						prompt="Choose the column with the labels (optional)"
						value={tTestingClassAttributeName}
					/>
				);
			}
		}

		function getTestButton() {
			const
				tTestingDatasetName = testingStore.testingDatasetInfo.title,
				tChosenModelName = testingStore.chosenModelName,
				tTestingAttributeName = testingStore.testingAttributeName,
				tDisabled = tTestingDatasetName === '' || tChosenModelName === '' || tTestingAttributeName === '',
				// The following hint doesn't display if the button is disabled. See
				// https://supportcenter.devexpress.com/ticket/details/t844498/button-how-to-add-tooltip-to-disabled-button
				// for suggested solution
				tHint = tTestingDatasetName === '' ? SQ.hints.testingChooseDataset :
					(tChosenModelName === '' ? SQ.hints.testingChooseModel :
						(tTestingAttributeName === '' ? SQ.hints.testingChooseAttribute :
							SQ.hints.testingTest))
			return (
				<div className='sq-training-buttons'>
					<Button
						className='sq-button'
						disabled={tDisabled}
						onClick={action(async () => {
							await this_.testingManager.classify(true)
						})}
						hint={tHint}>
						Test
					</Button>
				</div>
			)
		}

		function showResults() {

			function getRows() {
				return tTestingResults.map((iResult, iIndex) => {
					return (
						<tr key={iIndex}>
							<td style={{textAlign: 'center'}}>{iResult.modelName}</td>
							<td>{iResult.targetDatasetTitle}</td>
							<td
								style={{textAlign: 'right'}}>{iResult.accuracy !== 0 ? (100 * iResult.accuracy).toFixed(1) + '%' : 'NA'}</td>
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
								<th style={{textAlign: 'center'}} title={SQ.hints.testResultsName}>Model Name</th>
								<th style={{textAlign: 'center'}}
										title={SQ.hints.testResultsDataset}>Data set
								</th>
								<th style={{textAlign: 'center'}}
										title={SQ.hints.testResultsAccuracy}>
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
				{getModelChoice()}
				{getTestingDatasetChoice()}
				{getTestingAttributeChoice()}
				{getClassAttributeChoice()}
				{getTestButton()}
				{showResults()}
			</div>
		)
	}
})
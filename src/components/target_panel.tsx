/**
 * This component lists constructed features and provides an interface for construction and deletion
 */

import { action, toJS } from "mobx";
import { observer } from "mobx-react";
import React, { Component } from "react";
import codapInterface from "../lib/CodapInterface";
import { SQ } from "../lists/lists";
import { domainStore } from "../stores/domain_store";
import { featureStore } from "../stores/feature_store";
import { targetDatasetStore } from "../stores/target_dataset_store";
import { targetStore } from "../stores/target_store";
import { ChoicesMenu } from "./choices-menu";
import { TargetTextArea } from "./target_text_area";
import { CreateComponentResponse, CreateDataContextResponse } from "../types/codap-api-types";

export const TargetPanel = observer(class TargetPanel extends Component {

	private targetPanelConstants = {
		createNewEntityInfo: {
			title: 'Create your own'/*'NEW'*/,
			name: 'NEW',
			id: 0
		}
	}

	private currState: 'welcome' | 'chosen-no-target-attribute' | 'chosen-no-target-label-attribute' |
		'chosen-no-chosen-pos-class' | 'chosen-complete' | 'create' = 'welcome'

	public async componentDidMount() {
		await targetStore.updateFromCODAP();
	}

	render() {
		const this_ = this,
			tDatasetInfoArray = targetStore.datasetInfoArray,
			tMode = targetStore.targetPanelMode

		function welcomeText() {
			if (this_.currState === 'welcome')
				return (
					<div className='sq-welcome'>
						<h1>Welcome to StoryQ!</h1>
						<p>StoryQ is a tool for learning how to train computer models to classify text. For example, you
							can train models to recognize intents, filter spam emails, or detect emotions in social media feeds.
							The possibilities are endless!</p>
					</div>
				)
		}

		function chooseDatasetMenu() {

			function instructions() {
				if (this_.currState === 'welcome')
					if(tDatasetInfoArray.length === 0) {
						return (
							<div className='sq-info-prompt'>
								<p>Ready to begin?</p>
								<p>First, prepare data to train your model by
dragging a 'csv' data file with your data into CODAP or choosing <em>Create a new dataset</em> from the dropdown menu.</p>
							</div>
						)
					}
				else {
						return (
							<div className='sq-info-prompt'>
								<p>Ready to begin?</p>
								<p>First, prepare data to train your model.</p>
							</div>
						)
					}
			}

			function menu() {

				async function handleChoice(iChoice: string) {
					targetStore.resetTargetDataForNewTarget()
					let newInfo = toJS(tDatasetInfoArray.find(iInfo => iInfo.title === iChoice)) ||
						this_.targetPanelConstants.createNewEntityInfo;
					if (newInfo.title !== this_.targetPanelConstants.createNewEntityInfo.title) {
						targetDatasetStore.setTargetDatasetInfo(newInfo);
						await targetStore.updateFromCODAP()
						targetStore.setTargetPanelMode('chosen');
					} else if (iChoice === tNewDatasetChoice) {
						let tContextName = 'Training Data',
							n = 1
						while (tDatasetChoices.includes(tContextName)) {
							tContextName = 'Training Data ' + n
							n++
						}
						const [createDataContextResponse] = await codapInterface.sendRequest([
							{
								"action": "create",
								"resource": "dataContext",
								"values": {
									"name": tContextName,
									"title": tContextName,
									"collections": [ {
										"name": "Texts",
										"title": "Texts",
										"labels": {
											"singleCase": "text",
											"pluralCase": "texts"
										},
										"attrs": [
											{ "name": "text" },
											{ "name": "label" }
										]
									}]
								}
							},
							{
								action: 'create',
								resource: 'component',
								values: {
									type: 'caseTable',
									name: tContextName,
									title: tContextName,
									dataContext: tContextName
								}
							}
						]) as [CreateDataContextResponse, CreateComponentResponse];
						if (createDataContextResponse.success && createDataContextResponse.values) {
							targetDatasetStore.setTargetDatasetInfo({
								title: tContextName,
								name: tContextName,
								id: createDataContextResponse.values.id
							});
						}
						targetStore.setTargetPanelMode('chosen');
					}
				}

				const tNewDatasetChoice = 'Create a new dataset',
					tPrompt = this_.currState === 'welcome' ? 'Choose the training data' : 'Training data',
					tValue = (targetStore.targetDatasetInfo === this_.targetPanelConstants.createNewEntityInfo) ?
						'' : targetStore.targetDatasetInfo.title,
					tDatasetChoices: string[] = (tDatasetInfoArray.map(iInfo => iInfo.title)),
					tHint = tValue === '' ? SQ.hints.targetDatasetChoices : SQ.hints.targetDatasetChosen
				tDatasetChoices.push( tNewDatasetChoice)
				return (
					<ChoicesMenu
						choices={tDatasetChoices}
						hint={tHint}
						noDataText="No datasets to choose from"
						onValueChange={handleChoice}
						placeHolder="Choose from"
						prompt={tPrompt}
						value={tValue}
					/>
				);
			}

			return (
				<div>
					{instructions()}
					{menu()}
				</div>
			)
		}

/*
		function createButton() {
			if (tMode === 'welcome')
				return (
					<div>
						<p className='sq-connect-text'>or</p>
						<Button
							className='sq-button'
							onClick={action(() => {
								tTargetStore.targetPanelMode = 'create'
							})}
							hint={'Click here to classify your text in real time.'}
						>
							Create text data from scratch
						</Button>
					</div>
				)
		}
*/

		function chosenMode() {

			function targetAttributeInstructions() {
				if (this_.currState === 'chosen-no-target-attribute') {
					return (
						<div className='sq-info-prompt'>
							<p>What <strong>text</strong> will you use to train your model?</p>
						</div>
					)
				}
			}

			function targetLabelsInstructions() {
				if (this_.currState === 'chosen-no-target-label-attribute') {
					return (
						<div className='sq-info-prompt'>
							<p>What <strong>labels</strong> will you use to train your model?</p>
						</div>
					)
				}
			}

			function targetAttributeChoice() {
				const tPrompt = this_.currState === 'chosen-no-target-attribute' ?
					'Choose the column that has the text' : 'Text',
					tHint = this_.currState === 'chosen-no-target-attribute' ?
						SQ.hints.targetAttributeChoices : SQ.hints.targetAttributeChosen
				if (targetStore.targetAttributeNames.length > 0) {
					return (
						<ChoicesMenu
							choices={targetStore.targetAttributeNames}
							hint={tHint}
							noDataText="No attributes to choose from"
							onValueChange={async (iChoice) => {
								targetStore.setTargetAttributeName(iChoice);
								await targetStore.updateFromCODAP();
							}}
							placeHolder="Choose from"
							prompt={tPrompt}
							value={targetStore.targetAttributeName}
						/>
					);
				}
			}

			function targetClassChoice() {
				const tPrompt = this_.currState === 'chosen-no-target-label-attribute' ?
					'Choose the column that has the labels' : 'Labels',
					tHint = this_.currState === 'chosen-no-target-label-attribute' ?
						SQ.hints.targetClassAttributeChoices : SQ.hints.targetClassAttributeChosen
				if (targetStore.targetAttributeName !== '') {
					const tCandidateAttributeNames = targetStore.targetAttributeNames.filter((iName) => {
						return featureStore.features.findIndex(aFeature => aFeature.name === iName) < 0
					})
					return (
						<ChoicesMenu
							choices={tCandidateAttributeNames}
							hint={tHint}
							noDataText="No attributes to choose from"
							onValueChange={async (iChoice) => {
								await targetStore.updateFromCODAP({ targetClassAttributeName: iChoice });
							}}
							placeHolder="Choose an attribute with labels"
							prompt={tPrompt}
							value={targetStore.targetClassAttributeName}
						/>
					);
				}
			}

			function lowerPanel() {
				if (targetStore.targetCases.length > 0) {
					return (
						<TargetTextArea />
					)
				}
			}

			function positiveClassInstructions() {
				if (this_.currState === 'chosen-no-chosen-pos-class') {
					if (targetStore.targetCases.length > 0) {
						if(targetStore.targetClassAttributeValues.length === 2) {
							return (
								<div className='sq-info-prompt'>
									<p
										title={SQ.hints.positiveClassInstructions}>
										Choose your target label.</p>
								</div>
							)
						}
						else {
							const tRightColumnKey = 'right',
								tLeftColumnKey = 'left',
								tLeftColumnValue = targetStore.targetClassNames[tLeftColumnKey]
							return (
								<ChoicesMenu
									choices={targetStore.targetClassAttributeValues}
									hint={SQ.hints.targetLabelChoices}
									noDataText="No labels were found"
									onValueChange={action((e) => {
										targetStore.targetClassNames[tLeftColumnKey] = e;
										targetStore.targetClassNames[tRightColumnKey] = targetStore.targetClassAttributeValues.slice(0, 3)
											.filter((iValue:string)=>iValue!== e).join(',') + '…';
									})}
									placeHolder="Your choice"
									prompt="Choose a target label"
									value={tLeftColumnValue}
								/>
							);
						}
					}
				}
			}

			if (targetStore.targetPanelMode === 'chosen') {
				return (
					<div>
						{targetAttributeInstructions()}
						<div className='sq-target-choices-panel'>
							{targetAttributeChoice()}
						</div>
						{targetLabelsInstructions()}
						{targetClassChoice()}
						{positiveClassInstructions()}
						{lowerPanel()}
					</div>
				)
			}
		}

		function createMode() {
			if (targetStore.targetPanelMode === 'create')
				return (
					<div className='sq-welcome'>
						<h1>Sorry, It's not yet possible to create a dataset from scratch.</h1>
					</div>
				)
		}

		function onwardInstructions() {
			if (this_.currState === 'chosen-complete') {
				return (
					<div className='sq-info-prompt'
							 title={SQ.hints.onwardInstructions}>
						<p>Continue preparing your training data in <span
							title={SQ.hints.featuresDef}
							onClick={() => domainStore.setPanel(1)}
							style={{cursor: 'pointer'}}
						>
								<strong>Features.</strong></span></p>
					</div>
				)
			}
		}

		function computeState() {
			switch (tMode) {
				case 'welcome':
					this_.currState = tMode
					break;
				case 'chosen':
					if (targetStore.targetAttributeName === '')
						this_.currState = 'chosen-no-target-attribute'
					else if (targetStore.targetClassAttributeName === '')
						this_.currState = 'chosen-no-target-label-attribute'
					else if (!targetStore.targetChosenClassColumnKey)
						this_.currState = 'chosen-no-chosen-pos-class'
					else
						this_.currState = 'chosen-complete'
					break;
				case 'create':
					this_.currState = tMode
			}
		}

		computeState()
		return (
			<div className='sq-target-panel'>
				{welcomeText()}
				{chooseDatasetMenu()}
				{/*{createButton()}*/}
				{chosenMode()}
				{createMode()}
				{onwardInstructions()}
			</div>
		);
	}
});

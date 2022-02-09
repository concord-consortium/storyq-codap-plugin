/**
 * This component lists constructed features and provides an interface for construction and deletion
 */

import React, {Component} from "react";
import codapInterface from "../lib/CodapInterface";
import {TargetTextArea} from "./target_text_area";
import {action, toJS} from "mobx";
import {DomainStore} from "../stores/domain_store";
import {observer} from "mobx-react";
import {UiStore} from "../stores/ui_store";
import {choicesMenu} from "./component_utilities";

export interface Target_Props {
	uiStore: UiStore
	domainStore: DomainStore
}

export const TargetPanel = observer(class TargetPanel extends Component<Target_Props, {}> {

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
		await this.updateTargetPanelInfo();
	}

	async updateTargetPanelInfo(iPropName?: string | null, iValue?: any) {
		await this.props.domainStore.targetStore.updateFromCODAP(iPropName, iValue)
	}

	render() {

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
					tTargetStore.resetTargetDataForNewTarget()
					let newInfo = toJS(tDatasetInfoArray.find(iInfo => iInfo.title === iChoice)) ||
						this_.targetPanelConstants.createNewEntityInfo;
					if (newInfo.title !== this_.targetPanelConstants.createNewEntityInfo.title) {
						tTargetStore.targetDatasetInfo = newInfo;
						await this_.updateTargetPanelInfo()
						tTargetStore.targetPanelMode = 'chosen'
					} else if(iChoice === tNewDatasetChoice) {
						let tContextName = 'Training Data',
							n = 1
						while(tDatasetChoices.includes(tContextName)) {
							tContextName = 'Training Data ' + n
							n++
						}
						const tResults:any = await codapInterface.sendRequest([
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
						])
						tTargetStore.targetDatasetInfo = {
							title: tContextName,
							name: tContextName,
							id: tResults[0].values.id
						}
						tTargetStore.targetPanelMode = 'chosen'
					}
				}

				const tNewDatasetChoice = 'Create a new dataset',
					tPrompt = this_.currState === 'welcome' ? 'Choose the training data' : 'Training data',
					tValue = (tTargetStore.targetDatasetInfo === this_.targetPanelConstants.createNewEntityInfo) ?
						'' : tTargetStore.targetDatasetInfo.title,
					tDatasetChoices: string[] = (tDatasetInfoArray.map(iInfo => iInfo.title))
				tDatasetChoices.push( tNewDatasetChoice)
				return (
					choicesMenu(tPrompt, 'Your choice',
						'The dataset you choose will be used to train a model. ' +
						'It should have at least two attributes, one containing texts to analyze and the other containing ' +
						'labels with two values.',
						tDatasetChoices, tValue, 'No datasets to choose from', handleChoice)
				)
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
					'Choose the column that has the text' : 'Text'
				if (tTargetStore.targetAttributeNames.length > 0) {
					return choicesMenu(tPrompt, 'Choose from',
						'The target attribute should contain the texts to analyze.',
						tTargetStore.targetAttributeNames,
						tTargetStore.targetAttributeName, 'No attributes to choose from',
						async (iChoice) => {
							tTargetStore.targetAttributeName = iChoice
							await this_.updateTargetPanelInfo()
							this_.props.domainStore.addTextComponent()
						})
				}
			}

			function targetClassChoice() {
				const tPrompt = this_.currState === 'chosen-no-target-label-attribute' ?
					'Choose the column that has the labels' : 'Labels'
				if (tTargetStore.targetAttributeName !== '') {
					const tCandidateAttributeNames = tTargetStore.targetAttributeNames.filter((iName) => {
						return this_.props.domainStore.featureStore.features.findIndex(aFeature => aFeature.name === iName) < 0
					})
					return choicesMenu(tPrompt,
						'Choose an attribute with labels',
						'The target labels attribute should have two values. These are the labels of each of the ' +
						'groups into which the texts will be classified.',
						tCandidateAttributeNames,
						tTargetStore.targetClassAttributeName, 'No attributes to choose from', async (iChoice) => {
							await this_.updateTargetPanelInfo('targetClassAttributeName', iChoice)
						})
				}
			}

			function lowerPanel() {
				if (tTargetStore.targetCases.length > 0) {
					return (
						<TargetTextArea
							uiStore={this_.props.uiStore}
							domainStore={this_.props.domainStore}>
						</TargetTextArea>
					)
				}
			}

			function positiveClassInstructions() {
				if (this_.currState === 'chosen-no-chosen-pos-class') {
					if (tTargetStore.targetCases.length > 0) {
						if(tTargetStore.targetClassAttributeValues.length === 2) {
							const tLeftColumnKey = tTargetStore.targetLeftColumnKey,
								tLeftColumnValue = tTargetStore.targetClassNames[tLeftColumnKey],
								tRightColumnKey = tLeftColumnKey === 'left' ? 'right' : 'left',
								tRightColumnValue = tTargetStore.targetClassNames[tRightColumnKey]
							return (
								<div className='sq-info-prompt'>
									<p
										title={'The model will pay attention to one of the labels, with the remaining labels as ' +
											'“not” the label in question. The label we pay attention to is called the target label. \n' +
											'A target label is the most important among all labels for your model to recognize.'}>
										Choose either "{tLeftColumnValue}" or "{tRightColumnValue}" as your target label.</p>
								</div>
							)
						}
						else {
							const tRightColumnKey = 'right',
								tLeftColumnKey = 'left',
								tLeftColumnValue = tTargetStore.targetClassNames[tLeftColumnKey]
							return (
								choicesMenu('Choose a target label', 'Your choice',
									'This will be the label your model tries to predict.',
									tTargetStore.targetClassAttributeValues,
									tLeftColumnValue, 'No labels were found',
									action((e)=>{
										tTargetStore.targetClassNames[tLeftColumnKey] = e
										tTargetStore.targetClassNames[tRightColumnKey] = tTargetStore.targetClassAttributeValues.slice(0, 3)
											.filter((iValue:string)=>iValue!== e).join(',') + '…'
									}))
							)
						}
					}
				}
			}

			if (tTargetStore.targetPanelMode === 'chosen') {
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
			if (tTargetStore.targetPanelMode === 'create')
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
							 title={'Let StoryQ know what to pay attention to in the texts.'}>
						<p>Continue preparing your training data in <span
							onClick={action(() => this_.props.domainStore.setPanel(1))}
							style={{cursor: 'pointer'}}
						>
								<strong>Features</strong></span>.</p>
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
					if (tTargetStore.targetAttributeName === '')
						this_.currState = 'chosen-no-target-attribute'
					else if (tTargetStore.targetClassAttributeName === '')
						this_.currState = 'chosen-no-target-label-attribute'
					else if (tTargetStore.targetChosenClassColumnKey === '')
						this_.currState = 'chosen-no-chosen-pos-class'
					else
						this_.currState = 'chosen-complete'
					break;
				case 'create':
					this_.currState = tMode
			}
		}

		const this_ = this,
			tTargetStore = this.props.domainStore.targetStore,
			tDatasetInfoArray = tTargetStore.datasetInfoArray,
			tMode = tTargetStore.targetPanelMode
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
})
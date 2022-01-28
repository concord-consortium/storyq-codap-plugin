/**
 * This component lists constructed features and provides an interface for construction and deletion
 */

import React, {Component} from "react";
import codapInterface, {CODAP_Notification} from "../lib/CodapInterface";
import {TargetTextArea} from "./target_text_area";
import {action, toJS} from "mobx";
import {DomainStore} from "../stores/domain_store";
import {observer} from "mobx-react";
import {UiStore} from "../stores/ui_store";
import {choicesMenu} from "./component_utilities";
import {kEmptyEntityInfo} from "../stores/store_types_and_constants";
import {Button} from "devextreme-react";

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
			title: 'Create your own'/*'NEW'*/,
			name: 'NEW',
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

	async updateTargetPanelInfo(iPropName?: string | null, iValue?: any) {
		await this.props.domainStore.targetStore.updateFromCODAP(iPropName, iValue)
	}

	render() {

		function welcomeText() {
			if (tMode === 'welcome')
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

			async function handleChoice(iChoice: string) {
				let newInfo = toJS(tDatasetInfoArray.find(iInfo => iInfo.title === iChoice)) ||
					this_.targetPanelConstants.createNewEntityInfo;
				if (newInfo.title !== this_.targetPanelConstants.createNewEntityInfo.title) {
					tTargetStore.targetDatasetInfo = newInfo;
					await this_.updateTargetPanelInfo()
					tTargetStore.targetPanelMode = 'chosen'
				} else {
					tTargetStore.targetDatasetInfo = kEmptyEntityInfo
					tTargetStore.targetPanelMode = 'create'
				}
			}

			const tDatasetInfoArray = tTargetStore.datasetInfoArray,
				tValue = (tTargetStore.targetDatasetInfo === this_.targetPanelConstants.createNewEntityInfo) ?
					'' : tTargetStore.targetDatasetInfo.title,
				tDatasetChoices: string[] = (tDatasetInfoArray.map(iInfo => iInfo.title)),
				tInstructions = tMode === 'welcome' ?
					(<div className='sq-info-prompt'>
						<p>Ready to begin?</p>
						<p>First, prepare data to train your model.</p>
					</div>) : '',
				tChoicesMenu = choicesMenu('Choose the training data', 'Your Choice',
					'The dataset you choose will be used to train a model. ' +
					'It should have at least two attributes, one containing texts to analyze and the other containing ' +
					'labels with two values.',
					tDatasetChoices, tValue, 'No datasets to choose from', handleChoice)
			return (
				<div>
					{tInstructions}
					{tChoicesMenu}
				</div>
			)
		}

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

		function chosenMode() {

			function targetAttributeChoice() {
				if (tTargetStore.targetAttributeNames.length > 0) {
					return choicesMenu('Target Text', 'Choose a target attribute',
						'The target attribute should contain the texts to analyze.',
						tTargetStore.targetAttributeNames,
						tTargetStore.targetAttributeName, 'No attributes to choose from', async (iChoice) => {
							tTargetStore.targetAttributeName = iChoice
							await this_.updateTargetPanelInfo()
							this_.props.domainStore.addTextComponent()
						})
				}
			}

			function targetClassChoice() {
				if (tTargetStore.targetAttributeName !== '') {
					const tCandidateAttributeNames = tTargetStore.targetAttributeNames.filter((iName) => {
						return this_.props.domainStore.featureStore.features.findIndex(aFeature => aFeature.name === iName) < 0
					})
					return choicesMenu('Target Labels', 'Choose an attribute with labels',
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

			if (tTargetStore.targetPanelMode === 'chosen') {
				return (
					<div>
						<div className='sq-target-choices-panel'>
							{targetAttributeChoice()}
							{targetClassChoice()}
						</div>
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

		const this_ = this,
			tTargetStore = this.props.domainStore.targetStore,
			tMode = tTargetStore.targetPanelMode
		return (
			<div className='sq-target-panel'>
				{welcomeText()}
				{chooseDatasetMenu()}
				{createButton()}
				{chosenMode()}
				{createMode()}
			</div>
		);
	}
})
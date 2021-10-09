/**
 * The PromptsManager infers the current prompt that StoryQ should display
 */

import React, {ReactElement} from "react";
import {UiStore} from "../stores/ui_store";
import {DomainStore} from "../stores/domain_store";

export class PromptsManager {
	uiStore: UiStore
	domainStore: DomainStore
	currentKey: string = 'blank'

	prompts: { [key: number]: { [key: string]: ReactElement } } = {
		100: {
			welcome: <p>Welcome to StoryQ Studio!</p>
		},
		0: {	// Target panel
			blank: <p>StoryQ needs data. Enter new text data or import a training dataset</p>,
			noChosenTargetDataset: <p>A dataset needs to be chosen (unless you want to create your own).</p>,
			noTargetText: <p>Choose the attribute that contains the target text.</p>,
			noTargetClass: <p>Choose the attribute that contains the classes of each text.</p>,
			readyFeatures: <p>You can move on to <strong>Features</strong>.</p>
		},
		1: {	// Features panel
			noFeatures: <p>Not much can be done without at least one feature.</p>,
			oneFeature: <p>One feature! Do you need more?</p>,
			manyFeatures: <p>You can proceed to <strong>Training</strong>.</p>
		},
		2: {	// Training panel
			noModels: <p>The model needs a name before you can train it.</p>,
			noTraining: <p>Go ahead and train your model.</p>,
			oneModel: <p>You have one trained model. Make more? Go on to <strong>Testing?</strong></p>,
			manyModels: <p>You can proceed to <strong>Testing</strong>.</p>
		}
	}

	constructor(iUiStore: UiStore, iDomainStore: DomainStore) {
		this.uiStore = iUiStore
		this.domainStore = iDomainStore
	}

	getCurrentPrompt() {
		let tKey = 'welcome',
			tPanelIndex = this.uiStore.tabPanelSelectedIndex
		switch (tPanelIndex) {
			case 0:	// Target
				if (this.domainStore.targetStore.datasetInfoArray.length === 0)
					tKey = 'blank'
				else if (this.domainStore.targetStore.targetDatasetInfo.name === '')
					tKey = 'noChosenTargetDataset'
				else if (this.domainStore.targetStore.targetAttributeName === '')
					tKey = 'noTargetText'
				else if (this.domainStore.targetStore.targetClassAttributeName === '')
					tKey = 'noTargetClass'
				else if (this.domainStore.targetStore.targetClassAttributeName !== '')
					tKey = 'readyFeatures'
				else
					tPanelIndex = 100
				break
			case 1:	// Features
				if (this.domainStore.featureStore.features.length === 0)
					tKey = 'noFeatures'
				else if (this.domainStore.featureStore.features.length === 1)
					tKey = 'oneFeature'
				else if (this.domainStore.featureStore.features.length > 1)
					tKey = 'manyFeatures'
				else tPanelIndex = 100
				break
			case 2:	// Training
				if (this.domainStore.trainingStore.trainingResults.length === 0)
							tKey = this.domainStore.trainingStore.model.name === '' ? 'noModels' : 'noTraining'
				else if (this.domainStore.trainingStore.trainingResults.length === 1)
					tKey = 'oneModel'
				else if (this.domainStore.trainingStore.trainingResults.length > 1)
					tKey = 'manyModels'
				else tPanelIndex = 100
				break
			default:
				tPanelIndex = 100
		}
		return this.prompts[tPanelIndex][tKey]
	}

}
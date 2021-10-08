/**
 * The PromptsManager infers the current prompt that StoryQ should display
 */

import React, {ReactElement} from "react";
import {UiStore} from "../stores/ui_store";
import {DomainStore} from "../stores/domain_store";

const prompts: { [key: number]: { [key: string]: ReactElement } } = {
	100: {
		welcome: <p>Welcome to StoryQ Studio!</p>
	},
	0: {	// Target panel
		blank: <p>StoryQ needs data. Enter new text data or import a training dataset</p>,
		noChosenTargetDataset: <p>A dataset needs to be chosen (unless you want to create your own).</p>
	},
	1: {	// Features panel
		noFeatures: <p>Not much can be done without a feature.</p>
	}
}

export class PromptsManager {
	uiStore: UiStore
	domainStore: DomainStore
	currentKey: string = 'blank'

	constructor(iUiStore:UiStore, iDomainStore:DomainStore) {
		this.uiStore = iUiStore
		this.domainStore = iDomainStore
	}

	getCurrentPrompt() {
		let tKey = 'welcome',
			tPanelIndex = this.uiStore.tabPanelSelectedIndex
		switch (tPanelIndex) {
			case 0:
				if( this.domainStore.targetStore.datasetInfoArray.length === 0)
					tKey = 'blank'
				else if( this.domainStore.targetStore.targetDatasetInfo.name === '')
					tKey = 'noChosenTargetDataset'
				break
			default:
				tPanelIndex = 100
		}
		return prompts[tPanelIndex][tKey]
	}

}
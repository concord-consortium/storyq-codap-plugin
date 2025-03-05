/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import { makeAutoObservable } from 'mobx'
import pluralize from "pluralize";
import { getComponentByTypeAndTitleOrName } from "../lib/codap-helper";
import codapInterface from "../lib/CodapInterface";
import { CreateComponentResponse, GetComponentListResponse } from '../types/codap-api-types';
import { ITextSection, kStoryQPluginName, TitleDataset } from './store_types_and_constants';
import { targetStore } from './target_store';

export interface ITextStoreJSON {
	textComponentTitle: string;
	textComponentID: number;
}

export class TextStore {
	textComponentTitle: string = '';
	textComponentID: number = -1;
	textSections: ITextSection[] = [];
	titleDataset: TitleDataset = "target";

	constructor() {
		makeAutoObservable(this, {}, { autoBind: true });
	}

	asJSON() {
		return {
			textComponentTitle: this.textComponentTitle,
			textComponentID: this.textComponentID
		};
	}

	fromJSON(json: ITextStoreJSON) {
		if (json) {
			this.textComponentTitle = json.textComponentTitle || '';
			this.textComponentID = json.textComponentID || -1;
		}
	}

	setTextComponentTitle(title: string) {
		this.textComponentTitle = title;
	}

	setTitleDataset(titleDataset: TitleDataset) {
		this.titleDataset = titleDataset;
	}

	setTextSections(sections: ITextSection[]) {
		this.textSections = sections;
	}

	getTextSectionId(textSection: ITextSection) {
		return `section-${textSection.title?.actual}-${textSection.title?.predicted}`;
	}

	toggleTextSectionVisibility(textSection: ITextSection) {
		textSection.hidden = !textSection.hidden;
	}

	updateTitle(datasetName: string, attributeName: string) {
		this.textComponentTitle = `Selected ${pluralize(attributeName)} in ${datasetName}`;
	}

	/**
	 * Only add a text component if one with the designated name does not already exist.
	 */
	async addTextComponent() {
		const iDatasetName = targetStore.targetDatasetInfo.title;
		const iAttributeName = targetStore.targetAttributeName;
		this.updateTitle(iDatasetName, iAttributeName);
		let tFoundIt = false;
		const tListResult = await codapInterface.sendRequest(
			{
				action: 'get',
				resource: `componentList`
			}
		).catch(() => {
			console.log('Error getting component list')
		}) as GetComponentListResponse;

		if (tListResult.success && tListResult.values) {
			const tFoundValue = tListResult.values.find(iValue => {
				return iValue.type === 'text' && iValue.id === this.textComponentID;
			});
			if (tFoundValue) {
				this.textComponentID = tFoundValue.id;
				tFoundIt = true;
			}
		}
		if (!tFoundIt) {
			let tResult = await codapInterface.sendRequest({
				action: 'create',
				resource: 'component',
				values: {
					type: 'text',
					name: this.textComponentTitle,
					title: this.textComponentTitle,
					dimensions: {
						width: 500,
						height: 150
					},
					position: 'top',
					cannotClose: true
				}
			}) as CreateComponentResponse;
			this.textComponentID = tResult?.values?.id ?? -1;
		}
		await this.clearText();

		// Take the focus away from the newly created text component
		const tPluginID = await getComponentByTypeAndTitleOrName('game', kStoryQPluginName, kStoryQPluginName);
		await codapInterface.sendRequest({
			action: 'notify',
			resource: `component[${tPluginID}]`,
			values: {
				request: 'select'
			}
		});
	}

	async clearText() {
		const attributeName = pluralize(targetStore.targetAttributeName)
		this.setTextSections([]);
		await codapInterface.sendRequest({
			action: 'update',
			resource: `component[${this.textComponentID}]`,
			values: {
				text: {
					"object": "value",
					"document": {
						"children": [
							{
								"type": "paragraph",
								"children": [
									{
										"text": `This is where selected ${attributeName} appear.`
									}
								]
							}
						],
						"objTypes": {
							"paragraph": "block"
						}
					}
				}
			}
		});
	}

	async closeTextComponent() {
		await codapInterface.sendRequest({
			action: 'delete',
			resource: `component[${this.textComponentTitle}]`
		});
	}
}

export const textStore = new TextStore();

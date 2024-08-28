/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import {makeAutoObservable} from 'mobx'
import codapInterface from "../lib/CodapInterface";
import pluralize from "pluralize";

export class TextStore {
	textComponentTitle: string = ''
	textComponentID: number = -1

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true})
	}

	asJSON() {
		return {
			textComponentTitle: this.textComponentTitle,
			textComponentID: this.textComponentID
		}
	}

	fromJSON(json: any) {
		if (json) {
			this.textComponentTitle = json.textComponentTitle || ''
			this.textComponentID = json.textComponentID || -1
		}
	}

	/**
	 * Only add a text component if one with the designated name does not already exist.
	 */
	async addTextComponent(iDatasetName:string, iAttributeName: string) {
		let tFoundIt = false
		this.textComponentTitle = `Selected  ${pluralize(iAttributeName)} in ${iDatasetName}`;
		const tListResult: any = await codapInterface.sendRequest(
			{
				action: 'get',
				resource: `componentList`
			}
		)
			.catch(() => {
				console.log('Error getting component list')
			});

		if (tListResult.success) {
			const tFoundValue = tListResult.values.find((iValue: any) => {
				return iValue.type === 'text' && iValue.id === this.textComponentID;
			});
			if (tFoundValue) {
				this.textComponentID = tFoundValue.id;
				tFoundIt = true
			}
		}
		if (!tFoundIt) {
			let tResult: any = await codapInterface.sendRequest({
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
			});
			this.textComponentID = tResult.values.id
		}
	}

	async clearText(iAttributeName: string) {
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
										"text": `This is where selected ${pluralize(iAttributeName)} appear.`
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
		// this.textComponentTitle = 'Selected ' + pluralize(this.targetAttributeName);
		await codapInterface.sendRequest({
			action: 'delete',
			resource: `component[${this.textComponentTitle}]`
		});
	}

}
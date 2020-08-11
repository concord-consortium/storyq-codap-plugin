import codapInterface from "./lib/CodapInterface";

export default class DataManager {

	private dataContextID: number | undefined;

	private dataSetString = (contextName: string) => `dataContext[${contextName}]`;
	private dataSetIDString = () => `dataContext[${this.dataContextID}]`;

	private wordMap: any = {};

	public createDataContext(dataContextName: string) {
		let this_ = this;
		// Determine if CODAP already has the Data Context we need.
		// If not, create it.
		return codapInterface.sendRequest({
				action: 'get',
				resource: this.dataSetString(dataContextName)
			}, function (result: { success: boolean; }) {
				if (result && !result.success) {
					codapInterface.sendRequest({
						action: 'create',
						resource: 'dataContext',
						values: {
							name: dataContextName,
							title: dataContextName,
							collections: [
								{
									name: 'items',
									labels: {
										pluralCase: "items",
										setOfCasesWithArticle: "an item"
									},
									attrs: [{name: "word"}, {name: "count"}]
								}
							]
						}
					}, function (result: { success: boolean; values: any }) {
						if (result && result.success) {
							this_.dataContextID = result.values.id;
						}
					});
				}
			}
		);
	}

	public deleteAll() {
		codapInterface.sendRequest({
			action: 'delete',
			resource: this.dataSetIDString() + '.collection[items].allCases'
		});
	}

	public async getSelectedWords():Promise<[] | string[]> {
		let this_ = this,
				tSelectedWords:string[] = [];
		let tCasesRequest = [];
		let tResult:any = await codapInterface.sendRequest({
			action: 'get',
			resource: `${this.dataSetIDString()}.selectionList`
		});
		if (tResult.success && Array.isArray(tResult.values)) {
			tCasesRequest = tResult.values.map(function (iValue: { caseID:number }) {
				return {
					action: 'get',
					resource: `${this_.dataSetIDString()}.caseByID[${iValue.caseID}]`
				}
			});
			tResult = await codapInterface.sendRequest(tCasesRequest);
			tSelectedWords = tResult.map( function( iCaseResult:any) {
				return ( iCaseResult.success) ? ( iCaseResult.values.case.values.word) :
					null;
			});
		}
		return tSelectedWords;
	}

	public async processAndAddData(iText: string) {
		/*
				const commonWords = ['a', 'an', 'the', 'of', 'for', 'in', 'is', 'or', 'to', 'as', 'on', 'and', 'are', 'has',
					'this', 'that', 'with'];
		*/
		let words = this.wordMap,
			splitText: RegExpMatchArray | [] = iText.toLowerCase().match(/\w+/g) || [],
			itemsToCreate: { word:string, count:number }[] = [],
			itemsToDelete: string[] = [],
			itemsToUpdate: { ID:number, count:number }[] = [],
			tRequests: { action:string, resource:any, values?:any }[] = [],
			tResults: any;

		// Prepare wordMap
		for (let key in words) {
			if (words.hasOwnProperty(key)) {
				words[key].state = 'untouched';
				words[key].newCount = 0;
			}
		}

		splitText.forEach(function (iString: string) {
			// if (commonWords.indexOf(iString) < 0) {
			if (!words[iString]) {
				words[iString] = {count: 1, state: 'created', newCount: 1};
			}
			else {
				words[iString].newCount++;
				if( words[iString].state === 'untouched')
					words[iString].state = 'changed';
				if (words[iString].newCount > words[iString].count) {
					words[iString].count++;
					if(words[iString].state !== 'created')
						words[iString].state = 'changed';
				}
				else if (words[iString].newCount === words[iString].count) {
					words[iString].state = 'unchanged';
				}
			}
			// }
		});
		for (let key in words) {
			if (words.hasOwnProperty(key)) {
				switch (words[key].state) {
					case 'created':
						itemsToCreate.push({word: key, count: words[key].count});
						break;
					case 'untouched':
						itemsToDelete.push(words[key].itemID);
						delete words[key];
						break;
					case 'changed':
						words[key].count = words[key].newCount;
						itemsToUpdate.push({ID: words[key].itemID, count: words[key].count})
				}
			}
		}
		if (itemsToCreate.length > 0) {
			tRequests.push({
				action: 'create',
				resource: `${this.dataSetIDString()}.item`,
				values: itemsToCreate
			});
		}
		if (itemsToDelete.length > 0) {
			itemsToDelete.forEach((itemID: string) => {
				tRequests.push({
					action: 'delete',
					resource: `${this.dataSetIDString()}.itemByID[${itemID}]`,
				});
			});
		}
		if (itemsToUpdate.length > 0) {
			itemsToUpdate.forEach((item: any) => {
				tRequests.push({
					action: 'update',
					resource: `${this.dataSetIDString()}.itemByID[${item.ID}]`,
					values: {count: item.count}
				});
			});
		}

		tResults = await codapInterface.sendRequest(tRequests);
		// Store the item IDs of any created items
		if (itemsToCreate.length > 0) {
			for (let i = 0; i < itemsToCreate.length; i++) {
				let word = itemsToCreate[i].word;
				words[word].itemID = tResults[0].itemIDs[i];
			}
		}

	}

	public async restoreFromStorage( iStorage: any) {
		this.dataContextID = iStorage.dataContextID;
		if( this.dataContextID) {
			codapInterface.sendRequest({
				action: "delete",
				resource: `${this.dataSetIDString()}.collection[items].allCases`
			});
		}
	}

	createStorage():any {
		return {
			dataContextID: this.dataContextID
		}
	}

}


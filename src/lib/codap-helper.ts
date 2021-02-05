import codapInterface from "./CodapInterface";

export function initializePlugin(pluginName: string, version: string, dimensions: { width: number, height: number },
																 iRestoreStateHandler: (arg0: any) => void) {
	const interfaceConfig = {
		name: pluginName,
		version: version,
		dimensions: dimensions,
		preventDataContextReorg: false
	};
	return codapInterface.init(interfaceConfig, iRestoreStateHandler);
}

export function registerObservers() {
	codapInterface.on('get', 'interactiveState', '', undefined)
}

// const dataSetString = (contextName: string) => `dataContext[${contextName}]`;

export function openTable(dataContextName: string) {
	codapInterface.sendRequest({
		action: 'create',
		resource: 'component',
		values: {
			type: 'caseTable',
			name: dataContextName,
			title: dataContextName,
			dataContext: dataContextName
		}
	});
}

export async function openStory(iTextComponentName: string): Promise<number> {
	let theMessage = {
		action: 'create',
		resource: 'component',
		values: {
			type: 'text',
			name: iTextComponentName,
			title: iTextComponentName,
			dimensions: {
				width: 500,
				height: 300
			},
			position: 'top'
		}
	};
	const theResult: any = await codapInterface.sendRequest(theMessage)
		.catch(() => {
			console.log(`Could not open text component`);
			return 0;
		});
	console.log(`openStoryResult is ${JSON.stringify(theResult)}`);
	return theResult.values.id;
}

/**
 * Return the names of datasets that pass the given filter
 * @param iFilter
 */
export async function getDatasetNamesWithFilter(iFilter: (value: any) => boolean): Promise<string[]> {
	let tDropDownItems: string[] = [];
	let tContextListResult: any = await codapInterface.sendRequest({
		"action": "get",
		"resource": "dataContextList"
	}).catch((reason) => {
		console.log('unable to get datacontext list because ' + reason);
	});
	tContextListResult.values.forEach((aValue: any) => {
		if (iFilter(aValue))
			tDropDownItems.push(aValue.title);
	});
	return tDropDownItems;
}

export async function getSelectedCasesFrom(iDatasetName: string | null): Promise<any[]> {
	let tCasesRequest = [],
		tSelectedCases = [],
		tResult: any = await codapInterface.sendRequest({
			action: 'get',
			resource: `dataContext[${iDatasetName}].selectionList`
		});
	if (tResult.success && Array.isArray(tResult.values)) {
		tCasesRequest = tResult.values.map(function (iValue: any) {
			return {
				action: 'get',
				resource: `dataContext[${iDatasetName}].caseByID[${iValue.caseID}]`
			}
		});
		tResult = await codapInterface.sendRequest(tCasesRequest);
		tSelectedCases = tResult.map(function (iCaseResult: any) {
			return (iCaseResult.success) ? (iCaseResult.values.case) :
				null;
		});
	}
	return tSelectedCases;
}

export async function getCaseCount(iDatasetName: string | null, iCollectionName: string | null): Promise<number> {
	const tCountResult: any = await codapInterface.sendRequest(
		{
			action: 'get',
			resource: `dataContext[${iDatasetName}].collection[${iCollectionName}].caseCount`
		}
	)
		.catch(() => {
			console.log('Error getting case count')
		});
	return tCountResult.values;
}

/**
 * Resulting array of collection names has parent-most names with lowest index.
 * @param iDatasetName
 */
export async function getCollectionNames(iDatasetName: string | null): Promise<string[]> {
	const tListResult: any = await codapInterface.sendRequest(
		{
			action: 'get',
			resource: `dataContext[${iDatasetName}].collectionList`
		}
	)
		.catch(() => {
			console.log('Error getting collection list')
		});
	return tListResult.values.map((aCollection:any)=> {
		return aCollection.name;
	});
}

export async function addAttributesToTarget( iPredictionClass:string, iDatasetName:string,
																						 iCollectionName:string, iAttributeName:string) {
	// Add the predicted label and probability attributes to the target collection
	await codapInterface.sendRequest(
		{
			action: 'create',
			resource:`dataContext[${iDatasetName}].collection[${iCollectionName}].attribute`,
			values: [
				{
					name: iAttributeName,
					description: 'The label predicted by the model'
				},
				{
					name: 'probability of ' + iPredictionClass,
					precision: 5,
					description: 'A computed probability based on the logistic regression model'
				},
				{
					name: 'featureIDs',
					hidden: true
				}
			]
		}
	)
		.catch(() => { console.log('Error showing adding target attributes')});

}

export async function getAttributeNameByIndex(iDatasetName:string, iCollectionName:string, iIndex:number): Promise<string> {
	const tListResult:any = await codapInterface.sendRequest(
	{
		action: 'get',
		resource:`dataContext[${iDatasetName}].collection[${iCollectionName}].attributeList`
	}
)
	.catch(() => { console.log('Error getting attribute list')});
if( tListResult.values.length > iIndex)
	return tListResult.values[ iIndex].name;
else return '';
}


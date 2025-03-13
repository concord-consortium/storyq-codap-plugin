import { setupTextFeedbackManager } from "../managers/text_feedback_manager";
import { APIRequest, CaseInfo, GetCaseByIDResponse, GetSelectionListResponse } from "../types/codap-api-types";
import codapInterface from "./CodapInterface";

export interface entityInfo {
	name: string,
	title: string,
	id: number,
	numAttributes?: number
}

export function initializePlugin(pluginName: string, version: string, dimensions: { width: number, height: number },
																 iRestoreStateHandler: (arg0: any) => void) {
	const interfaceConfig = {
		name: pluginName,
		version: version,
		dimensions: dimensions,
		preventDataContextReorg: false,
		preventBringToFront: true,
		cannotClose: true
	};
	try {
		const response = codapInterface.init(interfaceConfig, iRestoreStateHandler);
		setupTextFeedbackManager();
		return response;
	} catch (error) {
		const errorMessage = `Error initializing interactiveFrame: ${error}`;
		console.warn(errorMessage);
		return new Promise((resolve, reject) => resolve(errorMessage));
	}
}

export function registerObservers() {
	codapInterface.on('get', 'interactiveState', '', undefined)
}

// const dataSetString = (contextName: string) => `dataContext[${contextName}]`;

export async function openTable(dataContextName: string) {
	await codapInterface.sendRequest({
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

/**
 * Find the case table or case card corresponding to the given dataset
 * @param iDatasetInfo
 */
export async function guaranteeTableOrCardIsVisibleFor(iDatasetInfo: entityInfo) {
	if (iDatasetInfo.name !== '' && iDatasetInfo.title !== '') {
		const tTableID = await getComponentByTypeAndTitleOrName('caseTable', iDatasetInfo.title, iDatasetInfo.name),
			tFoundTable = tTableID >= 0,
			tType = tFoundTable ? 'caseTable' : 'caseCard'

		await codapInterface.sendRequest({
			action: 'create',
			resource: `component`,
			values: {
				type: tType,
				name: iDatasetInfo.name,
				title: iDatasetInfo.name,
				dataContext: iDatasetInfo.name
			}
		})
	}
}

export function isNotAModel(iValue: any): boolean {
	return iValue.title.toLowerCase().indexOf('model') < 0;
}

/**
 * Used to determine if an dataset name qualifies the dataset as containing one or more models.
 * @param iValue
 * @private
 */
export function isAModel(iValue: any): boolean {
	return iValue.title.toLowerCase().indexOf('model') >= 0;
}

export async function datasetExists(iDatasetName: string): Promise<boolean> {
	const tContextListResult: any = await codapInterface.sendRequest({
		"action": "get",
		"resource": "dataContextList"
	}).catch((reason) => {
		console.log('unable to get datacontext list because ' + reason);
	});
	return tContextListResult.values.some((aContext: any) => aContext.name === iDatasetName)
}

/**
 * Return the number of attributes in the rightmost collection
 * @param iDataContextID
 */
export async function getNumChildAttributesInContext(iDataContextID: number) {
	const tListResult: any = await codapInterface.sendRequest(
		{
			action: 'get',
			resource: `dataContext[${iDataContextID}].collectionList`
		}
	)
		.catch(() => {
			console.log('Error getting collection list')
		});
	const tCollectionID = tListResult && tListResult.values && Array.isArray(tListResult.values) &&
		tListResult.values.length > 0 && tListResult.values.pop().id
	if( tCollectionID) {
		const tAttrsResult: any = await codapInterface.sendRequest({
			action: 'get',
			resource: `dataContext[${iDataContextID}].collection[${tCollectionID}].attributeList`
		})
		return tAttrsResult.values.length
	}
	else
		return 0
}

/**
 * Return the names of datasets that pass the given filter
 * @param iFilter
 */
export async function getDatasetInfoWithFilter(iFilter: (value: any) => boolean): Promise<entityInfo[]> {
	const tDatasetInfoArray: entityInfo[] = [],
		tContextListResult: any = await codapInterface.sendRequest({
			"action": "get",
			"resource": "dataContextList"
		}).catch((reason) => {
			console.log('unable to get datacontext list because ' + reason);
		});
	if (!(tContextListResult && tContextListResult.success))
		return []
	else {
		for (let tIndex = 0; tIndex < tContextListResult.values.length; tIndex++) {
			let aValue = tContextListResult.values[tIndex]
			aValue.numAttributes = await getNumChildAttributesInContext(aValue.id)
			if (iFilter(aValue))
				tDatasetInfoArray.push(
					{
						title: aValue.title,
						name: aValue.name,
						id: aValue.id,
						numAttributes: aValue.numAttributes
					});
		}
	}
	return tDatasetInfoArray
}

export async function guaranteeAttribute(iAttributeInfo: { name: string, hidden: boolean },
																				 iDatasetName: string, iCollectionName: string): Promise<void> {
	const tNamesResult: any = await codapInterface.sendRequest({
		action: 'get',
		resource: `dataContext[${iDatasetName}].collection[${iCollectionName}].attributeList`
	}).catch(reason => console.log(`Unable to get attribute names because ${reason}`))
	if (tNamesResult.success) {
		if (!tNamesResult.values.map((iValue: any) => iValue.name).includes(iAttributeInfo.name)) {
			// The attribute doesn't exist, so create it
			await codapInterface.sendRequest({
				action: 'create',
				resource: `dataContext[${iDatasetName}].collection[${iCollectionName}].attribute`,
				values: [iAttributeInfo]
			}).catch(reason => {
				console.log(`could not create attribute because ${reason}`)
			})
		}
	}
}

export async function getAttributeNames(iDatasetName: string, iCollectionName: string): Promise<string[]> {
	// console.log(`Begin getAttributeNames with ${iDatasetName}(${iCollectionName})`)
	const tNamesResult: any = await codapInterface.sendRequest({
		action: 'get',
		resource: `dataContext[${iDatasetName}].collection[${iCollectionName}].attributeList`
	}).catch(reason => console.log(`Unable to get attribute names because ${reason}`))
	// console.log('About to return from getAttributeNames')
	return tNamesResult.success ? tNamesResult.values.map((iValue: any) => iValue.name) : []
}

/**
 * Return all the cases in the given dataset/collection.
 * @param iDatasetName
 * @param iCollectionName
 */
export async function getCaseValues(
	iDatasetName: string, iCollectionName: string, searchFormula?: string
): Promise<CaseInfo[]> {
	const formula = searchFormula ?? `true`;
	const tResult: any = await codapInterface.sendRequest({
		action: 'get',
		resource: `dataContext[${iDatasetName}].collection[${iCollectionName}].caseFormulaSearch[${formula}]`
	}).catch(reason => console.log(`Unable to get cases in ${iDatasetName} because ${reason}`))
	if (tResult.success) {
		return tResult.values.map((iValue: any) => {
			delete iValue.parent
			delete iValue.collections
			return iValue
		})
	} else
		return []
}

export async function getSelectedCasesFrom(iDatasetName: string | null, iCollectionName: string) {
	const tSelectedCases: CaseInfo[] = [];
	const selectionListResult = await codapInterface.sendRequest({
		action: 'get',
		resource: `dataContext[${iDatasetName}].selectionList`
	}) as GetSelectionListResponse;
	if (selectionListResult.success && selectionListResult.values) {
		const tIDsOfSelectedCasesFromCollection = selectionListResult.values
			.filter(iValue => iValue.collectionName === iCollectionName).map(iObject => iObject.caseID);
		const tCasesRequest: APIRequest[] = tIDsOfSelectedCasesFromCollection.map(iID => {
			return {
				action: 'get',
				resource: `dataContext[${iDatasetName}].caseByID[${iID}]`
			}
		});
		const caseResults = await codapInterface.sendRequest(tCasesRequest) as GetCaseByIDResponse[];
		caseResults.forEach(iCaseResult => {
			if (iCaseResult.success && iCaseResult.values) {
				tSelectedCases.push(iCaseResult.values.case);
			}
		});
	}
	return tSelectedCases;
}

/**
 * Deselect all cases
 * @param iDatasetName
 */
export async function deselectAllCasesIn(iDatasetName: string | null) {
	await codapInterface.sendRequest({
		action: 'update',
		resource: `dataContext[${iDatasetName}].selectionList`,
		values: []
	});
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
	return tListResult.values.map((aCollection: any) => {
		return aCollection.name;
	});
}

export async function getAttributeNameByIndex(iDatasetName: string, iCollectionName: string, iIndex: number): Promise<string> {
	const tListResult: any = await codapInterface.sendRequest(
		{
			action: 'get',
			resource: `dataContext[${iDatasetName}].collection[${iCollectionName}].attributeList`
		}
	)
		.catch(() => {
			console.log('Error getting attribute list')
		});
	if (tListResult.values.length > iIndex)
		return tListResult.values[iIndex].name;
	else return '';
}

export async function attributeExists(iDatasetName: string, iCollectionName: string, iAttributeName: string): Promise<boolean> {
	const tNames = await getAttributeNames(iDatasetName, iCollectionName)
	return tNames.includes(iAttributeName)
}

export async function getComponentByTypeAndTitleOrName(iType: string, iTitle: string, iName:string): Promise<number> {
	const tListResult: any = await codapInterface.sendRequest(
		{
			action: 'get',
			resource: `componentList`
		}
	)
		.catch(() => {
			console.log('Error getting component list')
		});
	// console.log(`tListResult = ${JSON.stringify(tListResult)}`)
	let tID = -1;
	if (tListResult.success) {
		let tFoundValue = tListResult.values.find((iValue: any) => {
			return iValue.type === iType && (iValue.title === iTitle || iValue.name === iName);
		});
		if (tFoundValue)
			tID = tFoundValue.id;
	}
	return tID;
}

export async function getIdOfCaseTableForDataContext(iDataContextName: string): Promise<number> {
	const tListResult: any = await codapInterface.sendRequest(
		{
			action: 'get',
			resource: `componentList`
		}
	)
		.catch(() => {
			console.log('Error getting component list')
		});

	let tCaseTableID;
	if (tListResult.success) {
		let tFoundValue = tListResult.values.find((iValue: any) => {
			return iValue.type === 'caseTable' && [iValue.title, iValue.name].includes(iDataContextName)
		});
		if (tFoundValue)
			tCaseTableID = tFoundValue.id;
	}
	return tCaseTableID;
}

export async function scrollCaseTableToRight(iDataContextName: string): Promise<boolean> {
	const tCaseTableID = await getIdOfCaseTableForDataContext(iDataContextName);
	let tScrollResult: any;
	if (tCaseTableID) {
		tScrollResult = await codapInterface.sendRequest({
			action: 'update',
			resource: `component[${tCaseTableID}]`,
			values: {
				horizontalScrollOffset: 10000	// all the way
			}
		})
			.catch(() => console.log('error scrolling case table'));
		return tScrollResult.success;
	}
	return false;
}

export async function updatePluginDimensions(width: number, height: number) {
	codapInterface.sendRequest({
		action: 'update',
		resource: 'interactiveFrame',
		values: {
			dimensions: { width, height }
		}
	});
}

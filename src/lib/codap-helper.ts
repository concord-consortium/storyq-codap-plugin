import codapInterface from "./CodapInterface";

export function initializePlugin(pluginName: string, version: string, dimensions: { width: number, height: number },
																 iRestoreStateHandler:(arg0: any) => void) {
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
	console.log(`openStoryResult is ${JSON.stringify( theResult)}`);
	return theResult.values.id;
}

export async function getDatasetNames(): Promise<any[]> {
	let tDropDownItems: string[];
	let tContextListResult: any = await codapInterface.sendRequest({
		"action": "get",
		"resource": "dataContextList"
	}).catch((reason) => {
		console.log('unable to get datacontext list because ' + reason);
	});
	tDropDownItems = tContextListResult.values.map((aValue: any) => {
		return aValue.title;
	});
	if (tDropDownItems.length === 0)
		tDropDownItems.push('--No Datasets Found--');
	return tDropDownItems;
}

export async function getSelectedCasesFrom( iDatasetName:string):Promise<any[]> {
	let tCasesRequest = [],
			tSelectedCases = [],
			tResult:any = await codapInterface.sendRequest({
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
		tSelectedCases = tResult.map( function( iCaseResult:any) {
			return ( iCaseResult.success) ? ( iCaseResult.values.case) :
				null;
		});
	}
	return tSelectedCases;
}
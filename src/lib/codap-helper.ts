import codapInterface from "./CodapInterface";

export function initializePlugin(pluginName: string, version: string, dimensions: { width: number, height: number }) {
	const interfaceConfig = {
		name: pluginName,
		version: version,
		dimensions: dimensions,
		preventDataContextReorg: false
	};
	return codapInterface.init(interfaceConfig);
}

export function registerObservers() {
	codapInterface.on('get', 'interactiveState', '', undefined)
}

const dataSetString = (contextName: string) => `dataContext[${contextName}]`;

export function openTable(dataContextName: string) {
	codapInterface.sendRequest({
		action: 'create',
		resource: 'component',
		values: {
			type: 'caseTable',
			name: dataContextName,
			title: dataContextName
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
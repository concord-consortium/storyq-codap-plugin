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

export function createDataContext(dataContextName: string) {
	// Determine if CODAP already has the Data Context we need.
	// If not, create it.
	return codapInterface.sendRequest({
			action: 'get',
			resource: dataSetString(dataContextName)
		}, function (result: { success: any; }) {
			if (result && !result.success) {
				codapInterface.sendRequest({
					action: 'create',
					resource: 'dataContext',
					values: {
						name: dataContextName,
						collections: [
							{
								name: 'items',
								labels: {
									pluralCase: "items",
									setOfCasesWithArticle: "an item"
								},
								attrs: [{name: "words"}, {name: "type"}, {name: "count"}]
							}
						]
					}
				}, function( result: {success:any; }) {
					if( result && result.success) {
						codapInterface.sendRequest( {
							action: 'create',
							resource: 'component',
							values: {
								type: 'caseTable',
								name: dataContextName,
								title: dataContextName,
								dimensions: {
									width: 300,
									height: 200
								},
								position: {left: 400, top: 0},
  							dataContext: dataContextName
							}
						})
					}
				});
			}
		}
	);
}

export function processAndAddData(dataContextName: string, iText: string) {
	const commonWords = ['a', 'an', 'the', 'of', 'for', 'in', 'is', 'or', 'to', 'as', 'on', 'and', 'are', 'has',
		'this', 'that', 'with'];
	let words: any = {},
		splitText: any = iText.toLowerCase().match(/\w+/g),
		dataValues: any = [];
	splitText.forEach(function (iString: string) {
		if(commonWords.indexOf( iString) < 0) {
			if (!words[iString]) {
				words[iString] = {type: 'unigram', count: 1};
			}
			else {
				words[iString].count++;
			}
		}
	});
	for (let word in words) {
		if (words.hasOwnProperty(word)) {
			dataValues.push({words: word, type: words[word].type, count: words[word].count});
		}
	}
	addData(dataContextName, dataValues);
}

export function openTable() {
	codapInterface.sendRequest({
		action: 'create',
		resource: 'component',
		values: {
			type: 'caseTable'
		}
	});
}

export function addData(dataContextName: string, data: any) {
	codapInterface.sendRequest({
		action: 'create',
		resource: `${dataSetString(dataContextName)}.item`,
		values: data
	});
}
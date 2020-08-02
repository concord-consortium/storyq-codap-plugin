import React, {Component} from 'react';
import codapInterface from "./lib/CodapInterface";
import Dropdown from 'react-bootstrap/Dropdown';
import DropdownButton from 'react-bootstrap/DropdownButton';
import ButtonGroup from "react-bootstrap/esm/ButtonGroup";
import 'bootstrap/dist/css/bootstrap.min.css';
import './storyq.css';

export interface StorageCallbackFuncs {
	createStorageCallback: ()=> any,
	restoreStorageCallback: ( iStorage:any)=> void
}

export class FeatureManager extends Component<{status:string,
	setStorageCallbacks:(iCallbacks: StorageCallbackFuncs)=>void },
	{ status:string, count:number}> {
	private datasetName = '';
	private datasetNames:string[] = [];
	private collectionName = '';
	private targetAttributeName = '';
	private featureDatasetName = 'Features';
	private featureDatasetID = 0;
	private featureCollectionName = 'features';
	private textComponentName = 'Selected';
	private textComponentID = 0;
	private subscriberIndex:number | null = null;

	constructor(props: any) {
		super(props);
		this.state = {status: props.status, count: props.count};
		this.extract = this.extract.bind(this);
		this.handleNotification = this.handleNotification.bind(this);
		this.createStorage = this.createStorage.bind(this);
		this.restoreStorage = this.restoreStorage.bind(this);
		props.setStorageCallbacks( {
			createStorageCallback: this.createStorage,
			restoreStorageCallback: this.restoreStorage
		})

	}

	public async componentDidMount() {
		this.datasetNames = await this.getDatasetNames();
		this.setState({count: 1});
		this.subscriberIndex = codapInterface.on('notify', '*', '', this.handleNotification);
	}

	public createStorage():any {
		return {
			datasetName: this.datasetName,
			collectionName: this.collectionName,
			targetAttributeName: this.targetAttributeName,
			featureDatasetName: this.featureDatasetName,
			featureDatasetID: this.featureDatasetID,
			featureCollectionName: this.featureCollectionName,
			textComponentName: this.textComponentName,
			textComponentID: this.textComponentID
		}
	}

	public restoreStorage( iStorage:any) {
		this.datasetName = iStorage.datasetName;
			this.collectionName = iStorage.collectionName;
			this.targetAttributeName = iStorage.targetAttributeName;
			this.featureDatasetName = iStorage.featureDatasetName;
			this.featureDatasetID = iStorage.featureDatasetID;
			this.featureCollectionName = iStorage.featureCollectionName;
			this.textComponentName = iStorage.textComponentName;
			this.textComponentID = iStorage.textComponentID;
	}

	/**
	 *
	 * @param iNotification    (from CODAP)
	 */
	private async handleNotification(iNotification: any) {
		if (iNotification.action === 'notify' && iNotification.values.operation === 'dataContextCountChanged') {
			this.datasetNames = await this.getDatasetNames();
			this.setState({count: this.state.count + 1});
		}
		else if(iNotification.action === 'notify' && iNotification.values.operation === 'selectCases') {
			this.handleSelection( iNotification.resource, iNotification.values.result.cases);
		}
	}

	/**
	 * If the Features dataset has cases selected, for each selected case
	 * 	- Pull out the array of 'usages' - the the case IDs of the cases in the dataset being analyzed
	 * 	- Select these cases in that dataset
	 * 	- Pull the phrase from the target case
	 * 	- Cause the text component to display these phrases with the selected features highlighted
	 * @param iResource
	 * @param iArrayOfCases
	 */
	private async handleSelection( iResource:any, iArrayOfCases:any) {
		let tDataContextName:string = iResource.match(/\[(.+)\]/)[1];
		if( tDataContextName === this.featureDatasetName && iArrayOfCases) {
			let tUsedCaseIDs:any = [];
			iArrayOfCases.forEach( (iCase:any) => {
				tUsedCaseIDs = tUsedCaseIDs.concat( JSON.parse(iCase.values.usages))
			});
			codapInterface.sendRequest( {
				action: 'create',
				resource: `dataContext[${this.datasetName}].selectionList`,
				values: tUsedCaseIDs
			});
		}
	}

	private async getDatasetNames():Promise<any[]> {
		let tDropDownItems:string[] = [];
		let tContextListResult:any = await codapInterface.sendRequest( {
			"action": "get",
			"resource": "dataContextList"
		}).catch((reason) => {
			console.log('unable to get datacontext list');
		});
		tDropDownItems = tContextListResult.values.map( (aValue:any) => {
			return aValue.title;
		});
		if( tDropDownItems.length === 0)
			tDropDownItems.push('No Datasets Found');
		return tDropDownItems;
	}

	private async getCaseCount(): Promise<number> {
		const tCountResult:any = await codapInterface.sendRequest(
			{
				action: 'get',
				resource:`dataContext[${this.datasetName}].collection[${this.collectionName}].caseCount`
			}
		)
			.catch(() => { console.log('Error getting case count')});
		return tCountResult.values;
	}

	private async getChildMostCollectionName(): Promise<string> {
		const tListResult:any = await codapInterface.sendRequest(
			{
				action: 'get',
				resource:`dataContext[${this.datasetName}].collectionList`
			}
		)
			.catch(() => { console.log('Error getting collection name')});
		let tNumCollections = tListResult.values.length;
		if( tNumCollections > 0)
			return tListResult.values[ tNumCollections - 1].name;
		else return '';
	}

	private async getFirstAttributeName(): Promise<string> {
		const tListResult:any = await codapInterface.sendRequest(
			{
				action: 'get',
				resource:`dataContext[${this.datasetName}].collection[${this.collectionName}].attributeList`
			}
		)
			.catch(() => { console.log('Error getting attribute list')});
		if( tListResult.values.length > 0)
			return tListResult.values[ 0].name;
		else return '';
	}

	private async createFeatureDataset() {
		let tFeatureDataSetName = this.featureDatasetName,
			tFeatureCollectionName = this.featureCollectionName;
		const tResult: any = await codapInterface.sendRequest(
			{
				action: "create",
				resource: "dataContext",
				values: {
					name: tFeatureDataSetName,
					title: tFeatureDataSetName,
					collections: [ {
						name: tFeatureCollectionName,
						title: tFeatureCollectionName,
						labels: {
							singleCase: "feature",
							pluralCase: "features"
						},
						attrs: [
							{ name: "feature" },
							{ name: "type" },
							{ name: "count" },
							{ name: "usages", hidden: true },
							{ name: "weight"}
						]
					}]
				}
			})
			.catch(() => {
				console.log(`Error creating feature dataset`);
			});
		this.featureDatasetID = tResult.values.id;

		await codapInterface.sendRequest({
			action: 'create',
			resource: 'component',
			values: {
				type: 'caseTable',
				name: tFeatureDataSetName,
				dataContext: tFeatureDataSetName
			}
		});
	}

	private async addFeatures( ) {
		let tCaseCount = await this.getCaseCount(),
			tFeatureMap:any = {};
		for (let i = 0; i < tCaseCount; i++) {
			const tGetResult: any = await codapInterface.sendRequest({
				"action": "get",
				"resource": `dataContext[${this.datasetName}].collection[${this.collectionName}].caseByIndex[${i}]`
			})
				.catch(() => {
					console.log('unable to get case');
				});

			let tCaseID = tGetResult.values.case.id,
				tText: string = tGetResult.values.case.values[this.targetAttributeName],
				tWords: RegExpMatchArray | [] = tText.toLowerCase().match(/\w+/g) || [];
			tWords.forEach((aWord) => {
				if (!tFeatureMap[aWord]) {
					tFeatureMap[aWord] = {count: 1, caseIDs: [tCaseID]};
				} else {
					tFeatureMap[aWord].count++;
					tFeatureMap[aWord].caseIDs.push(tCaseID);
				}
			});
		}
		let tFeaturesValues: any = Object.keys(tFeatureMap).map((aWord: string) => {
			let aValue = tFeatureMap[aWord];
			return {
				values: {
					feature: aWord, type: 'unigram', count: aValue.count, usages: JSON.stringify(aValue.caseIDs),
					weight: Math.random() + Math.random() - 1
				}
			};
		});
		await  codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${this.featureDatasetName}].collection[${this.featureCollectionName}].case`,
			values: tFeaturesValues
		});
	}

	private async addTextComponent() {
		this.textComponentName = 'Selected ' + this.targetAttributeName;
		let tResult:any = await codapInterface.sendRequest( {
			action: 'create',
			resource: 'component',
			values: {
				type: 'text',
				name: this.textComponentName,
				title: this.textComponentName,
				dimensions: {
					width: 500,
					height: 150
				},
				position: 'top'
			}
		});
		this.textComponentID = tResult.values.id
	}

	private async extract(eventKey: any, event: Object) {
		this.datasetName = eventKey;
		this.collectionName = await this.getChildMostCollectionName();
		this.targetAttributeName = await this.getFirstAttributeName();
		await this.createFeatureDataset();
		await this.addFeatures();
		await this.addTextComponent();
	}

	public render() {
		return (<div>Dataset:
			<DropdownButton as={ButtonGroup} key='Secondary'
											title="Choose One" size="sm" variant="secondary">
				{this.datasetNames.map((aName, iIndex) => {
					return <Dropdown.Item as="button" eventKey={aName} onSelect={this.extract}>{aName}</Dropdown.Item>
				})}
			</DropdownButton>
		</div>)
	}
}

export default FeatureManager;

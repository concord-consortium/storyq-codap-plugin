import React, {Component} from 'react';
import pluralize from 'pluralize';
import codapInterface, {CODAP_Notification} from "./lib/CodapInterface";
import {getDatasetNames, getSelectedCasesFrom} from './lib/codap-helper';
import Dropdown from 'react-bootstrap/Dropdown';
import DropdownButton from 'react-bootstrap/DropdownButton';
import ButtonGroup from "react-bootstrap/esm/ButtonGroup";
import 'bootstrap/dist/css/bootstrap.min.css';
import {textToObject} from "./utilities";
import './storyq.css';

export interface StorageCallbackFuncs {
	createStorageCallback: ()=> any,
	restoreStorageCallback: ( iStorage:any)=> void
}

export interface FM_Props {
	status:string, setStorageCallbacks:(iCallbacks: StorageCallbackFuncs)=>void
}

interface FMStorage {
	datasetName: string,
	collectionName: string,
	targetAttributeName: string,
	classAttributeName: string,
	featureDatasetName: string,
	featureDatasetID: number,
	featureCollectionName: string,
	textComponentName: string,
	textComponentID: number,
	status: string

}

export class FeatureManager extends Component<FM_Props, { status:string, count:number}> {
	private datasetName = '';
	private datasetNames:string[] = [];
	private collectionName = '';
	private targetAttributeName = '';
	private classAttributeName = '';
	private featureDatasetName = 'Features';
	private featureDatasetID = 0;
	private featureCollectionName = 'features';
	private textComponentName = 'Selected';
	private textComponentID = 0;
	private subscriberIndex:number | null = null;
	private stashedStatus:string = '';	// Used to circumvent problem getting state.status to stick in restoreStorage

	constructor(props: FM_Props) {
		super(props);
		this.state = {status: props.status, count: 0};
		this.extract = this.extract.bind(this);
		this.handleNotification = this.handleNotification.bind(this);
		this.createStorage = this.createStorage.bind(this);
		this.restoreStorage = this.restoreStorage.bind(this);
		props.setStorageCallbacks( {
			createStorageCallback: this.createStorage,
			restoreStorageCallback: this.restoreStorage
		});

	}

	public async componentDidMount() {
		this.datasetNames = await getDatasetNames();
		this.setState({count: 1});
		this.subscriberIndex = codapInterface.on('notify', '*', '', this.handleNotification);
	}

	public createStorage():FMStorage {
		return {
			datasetName: this.datasetName,
			collectionName: this.collectionName,
			targetAttributeName: this.targetAttributeName,
			classAttributeName: this.classAttributeName,
			featureDatasetName: this.featureDatasetName,
			featureDatasetID: this.featureDatasetID,
			featureCollectionName: this.featureCollectionName,
			textComponentName: this.textComponentName,
			textComponentID: this.textComponentID,
			status: this.state.status
		}
	}

	public restoreStorage( iStorage:FMStorage) {
		this.datasetName = iStorage.datasetName;
		this.collectionName = iStorage.collectionName;
		this.targetAttributeName = iStorage.targetAttributeName;
		this.classAttributeName = iStorage.classAttributeName;
		this.featureDatasetName = iStorage.featureDatasetName;
		this.featureDatasetID = iStorage.featureDatasetID;
		this.featureCollectionName = iStorage.featureCollectionName;
		this.textComponentName = iStorage.textComponentName;
		this.textComponentID = iStorage.textComponentID;
		this.stashedStatus = iStorage.status;
		this.setState({status: iStorage.status})
	}

	/**
	 *
	 * @param iNotification    (from CODAP)
	 */
	private async handleNotification(iNotification: CODAP_Notification) {
		if (iNotification.action === 'notify' && iNotification.values.operation === 'dataContextCountChanged') {
			this.datasetNames = await getDatasetNames();
			this.setState({count: this.state.count + 1});
		}
		else if(iNotification.action === 'notify' && iNotification.values.operation === 'selectCases') {
			this.handleSelection( iNotification.resource);
		}
	}

	/**
	 * If the Features dataset has cases selected, for each selected case
	 * 	- Pull out the array of 'usages' - the the case IDs of the cases in the dataset being analyzed
	 * 	- Select these cases in that dataset
	 * 	- Pull the phrase from the target case
	 * 	- Cause the text component to display these phrases with the selected features highlighted
	 * @param iResource
	 */
	private async handleSelection( iResource:string) {
		// @ts-ignore
		let tDataContextName:string = iResource && iResource.match(/\[(.+)]/)[1];
		if( tDataContextName === this.featureDatasetName) {
			let tSelectedCases = await getSelectedCasesFrom( this.featureDatasetName);
			let tFeatures:string[] = [],
					tUsedIDsSet:Set<number> = new Set();
			tSelectedCases.forEach( (iCase:any) => {
				( JSON.parse(iCase.values.usages)).forEach((anID:number)=> { tUsedIDsSet.add(anID);});
				tFeatures.push( iCase.values.feature);
			});
			let tUsedCaseIDs:number[] = Array.from(tUsedIDsSet);
			codapInterface.sendRequest( {
				action: 'create',
				resource: `dataContext[${this.datasetName}].selectionList`,
				values: tUsedCaseIDs
			});
			let tItems:any = [];
			for(let i = 0; i < tUsedCaseIDs.length; i++) {
				let tGetCaseResult:any = await codapInterface.sendRequest({
					action: 'get',
					resource: `dataContext[${this.datasetName}].collection[${this.collectionName}].caseByID[${tUsedCaseIDs[i]}]`
				});
				let tClass = tGetCaseResult.values.case.values[this.classAttributeName];
				let tPhrase = tGetCaseResult.values.case.values[this.targetAttributeName];
				let tPhraseObjectArray = textToObject(tClass + ' - ' + tPhrase, tFeatures);
				tItems.push( {
					type: 'list-item',
					children: tPhraseObjectArray
				})
			}
			await codapInterface.sendRequest({
				action: 'update',
				resource: `component[${this.textComponentID}]`,
				values: {
					text: {
						document: {
							children: [
								{
									type: "bulleted-list",
									children: tItems
								}
							],
							objTypes: {
								'list-item': 'block',
								'bulleted-list': 'block'
							}
						}
					}
				}
			});
		}
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

	private async getAttributeNameByIndex(iIndex:number): Promise<string> {
		const tListResult:any = await codapInterface.sendRequest(
			{
				action: 'get',
				resource:`dataContext[${this.datasetName}].collection[${this.collectionName}].attributeList`
			}
		)
			.catch(() => { console.log('Error getting attribute list')});
		if( tListResult.values.length > iIndex)
			return tListResult.values[ iIndex].name;
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
							{ name: "frequency" },
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
					tFeatureMap[aWord] = {frequency: 1, caseIDs: [tCaseID]};
				} else {
					tFeatureMap[aWord].frequency++;
					tFeatureMap[aWord].caseIDs.push(tCaseID);
				}
			});
		}
		let tFeaturesValues: any = Object.keys(tFeatureMap).map((aWord: string) => {
			let aValue = tFeatureMap[aWord];
			return {
				values: {
					feature: aWord, type: 'unigram', frequency: aValue.frequency, usages: JSON.stringify(aValue.caseIDs),
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
		this.textComponentName = 'Selected ' + pluralize(this.targetAttributeName);
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

	private async extract(eventKey: any) {
		this.datasetName = eventKey;
		this.collectionName = await this.getChildMostCollectionName();
		// todo: arbitrary assumption of column positions!
		this.targetAttributeName = await this.getAttributeNameByIndex(0);
		this.classAttributeName = await this.getAttributeNameByIndex(1);
		await this.createFeatureDataset();
		await this.addFeatures();
		await this.addTextComponent();
		this.stashedStatus = '';
		this.setState({status: 'finished'});
	}

	private renderForActiveState() {
		return (<div>Dataset:
			<DropdownButton as={ButtonGroup} key='Secondary'
											title="Choose One" size="sm" variant="secondary">
				{this.datasetNames.map((aName, iIndex) => {
					const tNoneFound = aName.indexOf('--') === 0;
					return <Dropdown.Item as="button" id={String(iIndex)}
																eventKey={aName} onSelect={this.extract} disabled={tNoneFound}>
						{aName}</Dropdown.Item>
				})}
			</DropdownButton>
		</div>)
	}

	private static renderForFinishedState() {
		return <div>
			<p>Your analysis is finished!</p>
			<p>Try:</p>
			<ul>
				<li>Click on a feature</li>
				<li>Make a graph of your classifier</li>
				<li>Make a graph of frequency or weight and select points</li>
			</ul>
		</div>
	}

	public render() {
		let tStatus:string = (this.stashedStatus === '') ? this.state.status : this.stashedStatus;
		switch (tStatus) {
			case 'active':
				return this.renderForActiveState();
			case 'finished':
			default:
				return FeatureManager.renderForFinishedState();
		}
	}
}

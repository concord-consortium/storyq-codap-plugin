import React, {Component} from 'react';
import pluralize from 'pluralize';
import naiveBaseClassifier from './lib/NaiveBayesClassifier';
import codapInterface, {CODAP_Notification} from "./lib/CodapInterface";
import {getDatasetNames, getSelectedCasesFrom} from './lib/codap-helper';
import Dropdown from 'react-bootstrap/Dropdown';
import DropdownButton from 'react-bootstrap/DropdownButton';
import ButtonGroup from "react-bootstrap/esm/ButtonGroup";
import 'bootstrap/dist/css/bootstrap.min.css';
import {textToObject} from "./utilities";
import {oneHot} from "./lib/one_hot";
import './storyq.css';
import NaiveBayesClassifier from "./lib/NaiveBayesClassifier";
import {LogisticRegression} from './lib/jsregression';
// import tf from "@tensorflow/tfjs";

export interface StorageCallbackFuncs {
	createStorageCallback: ()=> any,
	restoreStorageCallback: ( iStorage:any)=> void
}

export interface FM_Props {
	status:string, setStorageCallbacks:(iCallbacks: StorageCallbackFuncs)=>void
}

interface FMStorage {
	datasetName: string | null,
	collectionName: string,
	targetAttributeName: string,
	targetCaseCount: number,
	targetCategories: string[],
	classAttributeName: string,
	featureDatasetName: string,
	featureDatasetID: number,
	featureCollectionName: string,
	featureCaseCount: number,
	textComponentName: string,
	textComponentID: number,
	status: string

}

export class FeatureManager extends Component<FM_Props, { status:string, count:number}> {
	private targetDatasetName:string | null = '';
	private datasetNames:string[] = [];
	private targetCollectionName = '';
	private targetAttributeName = '';
	private targetPredictedLabelAttributeName = 'predicted label';
	private classAttributeName = '';
	private targetCaseCount = 0;
	private targetCategories:string[] = [];
	private featureDatasetName = 'Features';
	private featureDatasetID = 0;
	private featureCollectionName = 'features';
	private featureCaseCount = 0;
	private textComponentName = 'Selected';
	private textComponentID = 0;
	private subscriberIndex:number | null = null;
	private stashedStatus:string = '';	// Used to circumvent problem getting state.status to stick in restoreStorage
	private createdTargetChildCases:number[] = [];
	private nbClassifier: NaiveBayesClassifier;
	// private logisticModel: tf.Sequential = new tf.Sequential();
	// @ts-ignore
	private logisticModel:LogisticRegression = new LogisticRegression({
		alpha: 0.001,
		iterations: 30,
		lambda: 0.0,
		trace: true,
		progressCallback: this.handleFittingProgress.bind(this)
	});
	private feedbackNames = {
		dataContextName: 'FittingFeedback',
		collectionName: 'iterations',
		iterationName: 'iteration',
		costName: 'cost'
	};

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
		this.nbClassifier = new NaiveBayesClassifier();
	}

	public createStorage():FMStorage {
		return {
			datasetName: this.targetDatasetName,
			collectionName: this.targetCollectionName,
			targetAttributeName: this.targetAttributeName,
			targetCaseCount: this.targetCaseCount,
			targetCategories: this.targetCategories,
			classAttributeName: this.classAttributeName,
			featureDatasetName: this.featureDatasetName,
			featureDatasetID: this.featureDatasetID,
			featureCollectionName: this.featureCollectionName,
			featureCaseCount: this.featureCaseCount,
			textComponentName: this.textComponentName,
			textComponentID: this.textComponentID,
			status: this.state.status
		}
	}

	public restoreStorage( iStorage:FMStorage) {
		this.targetDatasetName = iStorage.datasetName;
		this.targetCollectionName = iStorage.collectionName;
		this.targetAttributeName = iStorage.targetAttributeName;
		this.targetCaseCount = iStorage.targetCaseCount;
		this.targetCategories = iStorage.targetCategories;
		this.classAttributeName = iStorage.classAttributeName;
		this.featureDatasetName = iStorage.featureDatasetName;
		this.featureDatasetID = iStorage.featureDatasetID;
		this.featureCollectionName = iStorage.featureCollectionName;
		this.textComponentName = iStorage.textComponentName;
		this.textComponentID = iStorage.textComponentID;
		this.stashedStatus = iStorage.status;
		// this.state.status = iStorage.status;
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
			// @ts-ignore
			let tDataContextName:string = iNotification.resource && iNotification.resource.match(/\[(.+)]/)[1];
			if( tDataContextName === this.featureDatasetName) {
				this.handleFeatureSelection();
			}/*
			else if( tDataContextName === this.targetDatasetName) {
				this.handleTargetSelection();
			}*/
		}
	}

	/**
	 * If the Features dataset has cases selected, for each selected case
	 * 	- Pull out the array of 'usages' - the the case IDs of the cases in the dataset being analyzed
	 * 	- Select these cases in that dataset
	 * 	- Pull the phrase from the target case
	 * 	- Cause the text component to display these phrases with the selected features highlighted
	 */
	private async handleFeatureSelection() {
		let tSelectedCases = await getSelectedCasesFrom(this.featureDatasetName);
		let tFeatures: string[] = [],
			tUsedIDsSet: Set<number> = new Set();
		tSelectedCases.forEach((iCase: any) => {
			(JSON.parse(iCase.values.usages)).forEach((anID: number) => {
				tUsedIDsSet.add(anID);
			});
			tFeatures.push(iCase.values.feature);
		});
		let tUsedCaseIDs: number[] = Array.from(tUsedIDsSet);
		codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${this.targetDatasetName}].selectionList`,
			values: tUsedCaseIDs
		});
		let tItems: any = [];
		const tTargetPhrasesToShow = Math.min( tUsedCaseIDs.length, 20);
		for (let i = 0; i < tTargetPhrasesToShow; i++) {
			let tGetCaseResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${this.targetDatasetName}].collection[${this.targetCollectionName}].caseByID[${tUsedCaseIDs[i]}]`
			});
			let tActualClass = tGetCaseResult.values.case.values[this.classAttributeName];
			let tPredictedClass = tGetCaseResult.values.case.values[this.targetPredictedLabelAttributeName];
			let tPhrase = tGetCaseResult.values.case.values[this.targetAttributeName];
			// let tPhraseObjectArray = textToObject(tActualClass + ' - ' + tPhrase, tFeatures);
			let tPhraseObjectArray = textToObject(`Predicted = ${tPredictedClass}, Actual = ${tActualClass} - ${tPhrase}`, tFeatures);
			tItems.push({
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
		// await this.handleTargetSelection();
	}

	/**
	 * When one or more cases at the parent level of the target collection are selected, we generate
	 * child cases for each of the features contained in the parent target phrase.
	 */
	private async handleTargetSelection() {
		// Delete the child-level cases from the target dataset that were previously created
		let tDeleteRequests:any[] = this.createdTargetChildCases.map(iID => {
			return { action: 'delete',
			resource: `dataContext[${this.targetDatasetName}].collection[features].caseByID[${iID}]`};
		});
		this.createdTargetChildCases = [];
		await codapInterface.sendRequest( tDeleteRequests);

		const kMaxSelectedTargetsToExpand = 4;
		let this_ = this,
			tSelectedTargetCases = await getSelectedCasesFrom(this.targetDatasetName);
		let tCasesToRequest:any[] = [],
				tNumExpanded = 0;
		tSelectedTargetCases.forEach(iCase=> {
			if( tNumExpanded < kMaxSelectedTargetsToExpand) {
				let tTargetPhrase = iCase.values[this_.targetAttributeName];
				if (tTargetPhrase) {
					let tTargetWords: RegExpMatchArray | [] = tTargetPhrase.toLowerCase().match(/\w+/g) || [];
					tTargetWords.forEach(iWord => {
						tCasesToRequest.push({
							parent: iCase.id,
							values: {
								feature: iWord
							}
						});
					});
					tNumExpanded++;
				}
			}
		});
	 let tCreateResults:any =	await codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${this.targetDatasetName}].collection[features].case`,
			values: tCasesToRequest
		});
	 this.createdTargetChildCases = tCreateResults.values.map((iValue:any)=> {
	 		return iValue.id;
	 });
	}

	private async getCaseCount(): Promise<number> {
		const tCountResult:any = await codapInterface.sendRequest(
			{
				action: 'get',
				resource:`dataContext[${this.targetDatasetName}].collection[${this.targetCollectionName}].caseCount`
			}
		)
			.catch(() => { console.log('Error getting case count')});
		return tCountResult.values;
	}

	private async setupFeedbackDataset() {
		const tContextList:any = await codapInterface.sendRequest( {
			action: 'get',
			resource: 'dataContextList'
		});
		let tAlreadyPresent = tContextList.values.findIndex((iValue:any)=>{
						return iValue.name === this.feedbackNames.dataContextName;
					}) >= 0;
		if( !tAlreadyPresent) {
			await codapInterface.sendRequest( {
				action: 'create',
				resource: 'dataContext',
				values: {
					name: this.feedbackNames.dataContextName,
					collections: [ {
						name: this.feedbackNames.collectionName,
						attrs: [
							{ name: this.feedbackNames.iterationName},
							{ name: this.feedbackNames.costName}
						]
					}],
				}
			});
		}
	}

	private async makeFeedbackGraph():Promise<string> {
		await codapInterface.sendRequest({
			action: 'create',
			resource: 'component',
			values: {
				type: 'graph',
				name: 'Fitting Progress',
				dimensions: {
					width: 200,
					height: 150
				},
				dataContext: this.feedbackNames.dataContextName,
				xAttributeName: this.feedbackNames.iterationName,
				yAttributeName: this.feedbackNames.costName,
			}
		});
		return 'made graph';
	}

	private async handleFittingProgress (iIteration:number, iCost:number):Promise<string> {
		if( iIteration === 3) {
			await this.makeFeedbackGraph();
		}
		let tCaseValues:any = {};
		tCaseValues[this.feedbackNames.iterationName] = iIteration;
		tCaseValues[this.feedbackNames.costName] = iCost;
		await codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${this.feedbackNames.dataContextName}].collection[${this.feedbackNames.collectionName}].case`,
			values: [{
				values: tCaseValues
			}]
		});
		return 'case added';
	}

	private async showPredictedLabels(iTools:{
		logisticModel: any,
		threshold: number,
		oneHotData: number[][],
		documents: any,
		classNames: string[]
	}) {
		await codapInterface.sendRequest(
			{
				action: 'create',
				resource:`dataContext[${this.targetDatasetName}].collection[${this.targetCollectionName}].attribute`,
				values: [
					{
						name: this.targetPredictedLabelAttributeName,
						description: 'The label predicted by the model'
					},
					{
						name: 'probability of ' + iTools.classNames[1],
						precision: 5,
						description: 'A computed probability based on the logistic regression model'
					}
				]
			}
		)
			.catch(() => { console.log('Error showing predicted labels')});

		// Determine the probability threshold that yields the fewest discrepant classifications
		let tOneHotLength = iTools.oneHotData[0].length,
				tPosProbs:number[] = [],
				tNegProbs:number[] = [];
		iTools.documents.forEach((aDoc:any, iIndex:number)=>{
			let tProbability:number = iTools.logisticModel.transform(iTools.oneHotData[iIndex]),
					tActual = iTools.oneHotData[iIndex][ tOneHotLength - 1];
			if( tActual)
				tPosProbs.push(tProbability);
			else
				tNegProbs.push(tProbability);
		});
		tPosProbs.sort();
		tNegProbs.sort();
		let tCurrValue = tPosProbs[0],
				tNegLength = tNegProbs.length;

		function findNegIndex( iStarting:number, iTargetProb:number):number {
			while( tNegProbs[iStarting] < iTargetProb && iStarting < tNegLength) {
				iStarting++;
			}
			return iStarting;
		}

		let tRecord = {
			posIndex: 0,	// Position at which we testing for discrepancies
			negIndex: tNegProbs.findIndex((v: number) => {
				return v > tCurrValue;
			}),
			currMinDescrepancies: Number.MAX_VALUE,
			threshold: tPosProbs[0]
		};
		while(tRecord.negIndex < tNegLength) {
			let tCurrDiscrepancies = tRecord.posIndex + (tNegLength - tRecord.negIndex);
			if( tCurrDiscrepancies < tRecord.currMinDescrepancies) {
				tRecord.currMinDescrepancies = tCurrDiscrepancies;
				tRecord.threshold = tPosProbs[tRecord.posIndex];
			}
			tRecord.posIndex++;
			tRecord.negIndex = findNegIndex( tRecord.negIndex, tPosProbs[tRecord.posIndex]);
		}
		let tThreshold = tRecord.threshold,
				tLabelValues: { id: number, values: any	}[] = [],
				tPosIndex = 0,
				tNegIndex = 0;
		iTools.documents.forEach((aDoc:any, iIndex:number)=>{
			let tActual:number = iTools.oneHotData[iIndex][tOneHotLength - 1],
					tProbability:number,
					tPredictedLabel,
					// tPredictedLabel = tProbability > iTools.threshold ? iTools.classNames[1] : iTools.classNames[0],
					tValues:any = {},
					tProbName = `probability of ${iTools.classNames[1]}`;
			tProbability = tActual ? tPosProbs[tPosIndex++] : tNegProbs[tNegIndex++];
			tPredictedLabel = tProbability > tThreshold ? iTools.classNames[1] : iTools.classNames[0];
			tValues[this.targetPredictedLabelAttributeName] = tPredictedLabel;
			tValues[tProbName] = tProbability;
			tLabelValues.push( {
				id: aDoc.caseID,
				values: tValues
			})
		});
		await codapInterface.sendRequest( {
			action: 'update',
			resource:`dataContext[${this.targetDatasetName}].collection[${this.targetCollectionName}].case`,
			values: tLabelValues
		});
	}

	private async getTargetCollectionNames(): Promise<string[]> {
		const tListResult:any = await codapInterface.sendRequest(
			{
				action: 'get',
				resource:`dataContext[${this.targetDatasetName}].collectionList`
			}
		)
			.catch(() => { console.log('Error getting collection name')});
		return tListResult.values.map((iValue:{name:string}) => { return iValue.name });
	}

	/**
	 * The target dataset is (currently) assumed to be flat at the start with each case containing a target
	 * phrase. We add a child collection level in which features of selected target phrases are shown, along with
	 * the number of occurrences and computed weight in the model.
	 * @return boolean true if successful
	 */
	private async setupTargetDataset() {
		// Create a child collection
		await codapInterface.sendRequest([{
			action: 'create',
			resource: `dataContext[${this.targetDatasetName}].collection`,
			values: [{
				name: 'features',
				title: 'Features of selected phrases',
				parent: `${this.targetCollectionName}`
			}]
		},
			{
				action: 'create',
				resource: `dataContext[${this.targetDatasetName}].collection[features].attribute`,
				values: [{
					name: 'feature',
					description: `A feature of the ${this.targetAttributeName}`
				}, {
					name: 'occurrences',
					description: `The number of times the feature appears in ${this.targetAttributeName}`,
					formula: `if(feature, patternMatches(toLower(\`${this.targetAttributeName}\`),"(\\\\\\\\W|^)"+feature + "(\\\\\\\\W|$)"),"")`
				}, {
					name: 'weight',
					description: 'The weight of the feature in the computed model',
					precision: 5,
					formula: 'lookupByKey("Features", "weight", "feature", feature)'
				}
				]
			}]).catch(reason => console.log(`Error on creating target child collection: ${reason}`));
	}

	private async getAttributeNameByIndex(iIndex:number): Promise<string> {
		const tListResult:any = await codapInterface.sendRequest(
			{
				action: 'get',
				resource:`dataContext[${this.targetDatasetName}].collection[${this.targetCollectionName}].attributeList`
			}
		)
			.catch(() => { console.log('Error getting attribute list')});
		if( tListResult.values.length > iIndex)
			return tListResult.values[ iIndex].name;
		else return '';
	}

	private async createFeatureDataset() {
		let tFeatureDataSetName = this.featureDatasetName,
				tFeatureCollectionName = this.featureCollectionName,
				tAttributes:any[] = [
					{ name: "feature", description: `A feature is something that comes from the ${this.targetAttributeName} that can help in the classification process` },
					{ name: "type", description: `The kind of feature (unigram, bigram, count, …)` },
					{ name: "frequency", description: `The number of times the feature appears` },
					{ name: "usages", hidden: true },
					{ name: "weight",
						precision: 5,
						description: `A computed value that is proportional to the importance of the feature in the logistic regression classification model`}
				];
		this.targetCategories.forEach( (aCategory) => {
			tAttributes.push( { name: aCategory, precision: 5,
					description: `The probability assigned by a Naive Bayes classification model that the feature belongs to "${aCategory}"`});
		});
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
						attrs: tAttributes
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
		this.targetCaseCount = await this.getCaseCount();
		let tFeatureMap:any = {},
				// tClassifier = this.nbClassifier,
				tCategories: string[] = [],
				tDocuments: {example:string, class:string, caseID:number}[] = [],
				tZeroClassName: string,
				tOneClassName:string;
		for (let i = 0; i < this.targetCaseCount; i++) {
			const tGetResult: any = await codapInterface.sendRequest({
				"action": "get",
				"resource": `dataContext[${this.targetDatasetName}].collection[${this.targetCollectionName}].caseByIndex[${i}]`
			})
				.catch(() => {
					console.log('unable to get case');
				});

			let tCaseID = tGetResult.values.case.id,
				tText: string = tGetResult.values.case.values[this.targetAttributeName],
				tClass: string = tGetResult.values.case.values[this.classAttributeName];
			// tClassifier.learn(tText, tClass);	// NaiveBayes can learn as we go along
			tDocuments.push({example: tText, class: tClass, caseID: tCaseID});
		}
		tZeroClassName = tDocuments[0].class;
		let tDocOfOtherClass:any = tDocuments.find(aDoc=>{
			return aDoc.class !== tZeroClassName;
		});
		tOneClassName = tDocOfOtherClass.class;
		// Logistic can't happen until we've isolated the features
		let tOneHot = oneHot(tDocuments),
				tData:number[][] = [];
		tOneHot.oneHotResult.forEach(iResult=>{
			iResult.oneHotExample.push( iResult.class === tZeroClassName ? 0 : 1);
			tData.push(iResult.oneHotExample);
		});
		await this.setupFeedbackDataset();
		let tTrainedModel:any = await this.logisticModel.fit(tData);

		// We wait until now to create the features dataset so that we know the categories
		// tCategories = this.targetCategories = Object.keys(tClassifier.categories);
		await this.createFeatureDataset();

		let tFeaturesValues: any = [];
		tOneHot.tokenArray.forEach((aToken, iIndex) => {
			let tValues: any = {
				feature: aToken.token, type: 'unigram', frequency: aToken.count,
				usages: JSON.stringify(aToken.caseIDs),
				weight: tTrainedModel.theta[iIndex]
			};
/*
			tCategories.forEach((aCategory) => {
				tValues[aCategory] = tClassifier.tokenProbability(aToken.token, aCategory);
			});
*/
			tFeaturesValues.push({
				values: tValues
			});
			tOneHot.tokenMap[aToken.token].weight = tTrainedModel.theta[iIndex];
		});
		this.featureCaseCount = tOneHot.tokenArray.length;
		await  codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${this.featureDatasetName}].collection[${this.featureCollectionName}].case`,
			values: tFeaturesValues
		});

		let tPredictionTools = {
			logisticModel: this.logisticModel,
			threshold: tTrainedModel.threshold,
			oneHotData: tData,
			documents: tDocuments,
			classNames: [tZeroClassName, tOneClassName]
		}
		await this.showPredictedLabels(tPredictionTools);
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

	private async extract(iTargetDatasetName: string | null) {
		this.targetDatasetName = iTargetDatasetName;
		let tCollectionNames = await this.getTargetCollectionNames();
		// todo: arbitrary assumption that target dataset is initially flat
		if( tCollectionNames.length === 1) {
			this.targetCollectionName = tCollectionNames[0];
			// todo: arbitrary assumption of column positions!
			this.targetAttributeName = await this.getAttributeNameByIndex(0);
			this.classAttributeName = await this.getAttributeNameByIndex(1);
			await this.addFeatures();
			await this.addTextComponent();
			this.stashedStatus = '';
			// await this.setupTargetDataset();
			this.setState({status: 'finished'});
		}
		else {
			this.setState({status:'error'})
		}
	}

	private renderForActiveState() {
		return (<div>
			<p>Extract features and train model for a dataset.</p>
			Dataset:
			<DropdownButton as={ButtonGroup} key='Secondary'
											title="Choose One" size="sm" variant="secondary">
				{this.datasetNames.map((aName, iIndex) => {
					const tNoneFound = aName.indexOf('--') === 0;
					return <Dropdown.Item as="button" key={String(iIndex)}
																eventKey={aName} onSelect={this.extract} disabled={tNoneFound}>
						{aName}</Dropdown.Item>
				})}
			</DropdownButton>
		</div>)
	}

	private renderForFinishedState() {
		return <div className={'sq-output'}>
			<p>Your analysis is finished!</p>
			<p>In <b>{this.targetDatasetName}</b> identified {this.featureCaseCount} <b>unigrams </b>
				in <b>{pluralize(this.targetAttributeName)}</b>.</p>
			<p>Feature weights were computed by a logistic regression model.</p>
			<p>Threshold = {Math.round(this.logisticModel.threshold * 10000)/10000}</p>
		</div>
	}

	private static renderForErrorState() {
		return <div>
			<p>Sorry but something isn't set up correctly.</p>
			<p>Currently we can only handle text analysis with a flat dataset with the text in the first
			column.</p>
		</div>
	}

	public render() {
		let tStatus:string = (this.stashedStatus === '') ? this.state.status : this.stashedStatus;
		switch (tStatus) {
			case 'error':
				return FeatureManager.renderForErrorState();
			case 'active':
				return this.renderForActiveState();
			case 'finished':
			default:
				return this.renderForFinishedState();
		}
	}
}

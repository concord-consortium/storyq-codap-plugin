/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import {makeAutoObservable, runInAction, toJS} from 'mobx'
import {
	Case,
	entityInfo,
	getAttributeNames,
	getCaseValues,
	getCollectionNames,
	getDatasetInfoWithFilter,
	guaranteeAttribute,
	scrollCaseTableToRight
} from "../lib/codap-helper";
import codapInterface from "../lib/CodapInterface";
import {SQ} from "../lists/personal-pronouns";
import React from "react";
import {
	Feature, featureDescriptors, kEmptyEntityInfo,
	SearchDetails
} from "./store_types_and_constants";

export class TargetStore {
	[index: string]: any

	targetDatasetInfo: entityInfo = kEmptyEntityInfo
	datasetInfoArray: entityInfo[] = []
	targetCollectionName: string = ''
	targetAttributeNames: string[] = []
	targetAttributeName: string = ''
	targetPredictedLabelAttributeName = ''
	targetResultsCollectionName = 'results'
	targetFeatureIDsAttributeName = 'featureIDs'
	targetCases: Case[] = []
	targetClassAttributeName: string = ''
	targetClassNames: { [index: string]: string, left: string, right: string } = {left: '', right: ''}
	targetLeftColumnKey: 'left' | 'right' = 'left'
	targetChosenClassColumnKey: 'left' | 'right' = 'left'
	textRefs: { ownerCaseID: number, ref: React.RefObject<any> }[] = []
	resultCaseIDsToFill:number[] = []

	constructor() {
		makeAutoObservable(this,
			{targetCases: false, textRefs: false, targetLeftColumnKey: false, resultCaseIDsToFill: false},
			{autoBind: true})
	}

	asJSON() {
		return {
			targetDatasetInfo: toJS(this.targetDatasetInfo),
			targetAttributeName: toJS(this.targetAttributeName),
			targetClassAttributeName: toJS(this.targetClassAttributeName),
			targetClassNames: toJS(this.targetClassNames),
			targetPredictedLabelAttributeName: toJS(this.targetPredictedLabelAttributeName),
			resultCaseIDsToFill: this.resultCaseIDsToFill
		}
	}

	fromJSON(json: any) {
		// todo: Only here for legacy files
		if (Array.isArray(json.targetClassNames))
			json.targetClassNames = null
		this.targetDatasetInfo = json.targetDatasetInfo || kEmptyEntityInfo
		this.targetAttributeName = json.targetAttributeName || ''
		this.targetClassAttributeName = json.targetClassAttributeName || ''
		if (json.targetClassNames)
			this.targetClassNames = json.targetClassNames
		this.targetPredictedLabelAttributeName = json.targetPredictedLabelAttributeName || ''
		this.resultCaseIDsToFill = json.resultCaseIDsToFill || []
	}

	getClassName(iClass: 'positive' | 'negative') {
		const tChosenClassKey = iClass === 'positive' ? this.targetChosenClassColumnKey : (
			this.targetChosenClassColumnKey === 'left' ? 'right' : 'left'
		)
		return this.targetClassNames[tChosenClassKey]
	}

	async updateFromCODAP(iPropName?: string | null, iValue?: any) {
		const this_ = this

		/**
		 * The results collection is a child of the target collection and is where we show the predicted labels and
		 * probabilities for each target text for each model
		 */
		async function guaranteeResultsCollection() {
			const tTargetClassAttributeName = this_.targetClassAttributeName,
				tPositiveClassName = this_.getClassName('positive')
			console.log(`tTargetClassAttributeName = ${tTargetClassAttributeName}; tPositiveClassName = ${tPositiveClassName}`)
			if( tTargetClassAttributeName !== '' && tPositiveClassName !== '') {
				const tPredictedLabelAttributeName = this_.targetPredictedLabelAttributeName
					const tCollectionListResult: any = await codapInterface.sendRequest({
					action: 'get',
					resource: `dataContext[${tTargetDatasetName}].collectionList`
				})
				if (tCollectionListResult.values.length === 1) {
					const tResultsCollectionName = this_.targetResultsCollectionName
					const tAttributeValues = [
						{
							name: 'model name',
							description: 'The model used for predicting these results'
						},
						{
							name: tPredictedLabelAttributeName,
							description: 'The label predicted by the model'
						},
						{
							name: 'probability of ' + tPositiveClassName,
							precision: 5,
							description: 'A computed probability based on the logistic regression model'
						}
					]
					await codapInterface.sendRequest({
						action: 'create',
						resource: `dataContext[${tTargetDatasetName}].collection`,
						values: [{
							name: tResultsCollectionName,
							title: tResultsCollectionName,
							attrs: tAttributeValues
						}]
					}).catch(reason => {
						console.log(`Exception in creating results collection because ${reason}`)
					})

					// This unfortunately installs an empty child case for each parent case. We store their IDs so we can delete them
					// after we create the legitimate cases
					const tCaseIDResult: any = await codapInterface.sendRequest({
						action: 'get',
						resource: `dataContext[${tTargetDatasetName}].collection[${tResultsCollectionName}].caseFormulaSearch[true]`
					})
					this_.resultCaseIDsToFill = tCaseIDResult.values.map((iValue: any) => Number(iValue.id))
				}
			}
		}

		/**
		 * We go through the target cases to find the first two unique values of the targetClassAttributeName
		 */
		function chooseClassNames() {
			const tTargetClassAttributeName = this_.targetClassAttributeName !== '' ?
				this_.targetClassAttributeName : (
					iPropName === 'targetClassAttributeName' ? iValue : ''
				)
			if (tTargetClassAttributeName !== '') {
				tPositiveClassName = this_.targetClassNames.left !== '' ?
					this_.targetClassNames.left : tCaseValues[0].values[tTargetClassAttributeName]
				const tNegativeClassCase = tCaseValues.find(iCase => iCase.values[tTargetClassAttributeName] !== tPositiveClassName)
				tNegativeClassName = tNegativeClassCase ? tNegativeClassCase.values[tTargetClassAttributeName] : ''
				tClassNames = {left: tPositiveClassName, right: tNegativeClassName}
			}
		}

		const tDatasetNames = await getDatasetInfoWithFilter(() => true);
		let tCollectionNames: string[] = []
		let tCollectionName = ''
		let tAttrNames: string[] = []
		let tCaseValues: Case[] = []
		let tPositiveClassName = ''
		let tNegativeClassName = ''
		let tClassNames = {left: '', right: ''}
		const tTargetDatasetName = this.targetDatasetInfo.name
		if (tTargetDatasetName !== '') {
			tCollectionNames = await getCollectionNames(tTargetDatasetName)
			tCollectionName = tCollectionNames.length > 0 ? tCollectionNames[0] : ''
			tAttrNames = tCollectionName !== '' ? await getAttributeNames(tTargetDatasetName, tCollectionName) : []
			tCaseValues = this.targetAttributeName !== '' ? await getCaseValues(tTargetDatasetName,
				tCollectionName) : []
			chooseClassNames()
			for (let i = 0; i < Math.min(40, tCaseValues.length); i++) {
				this.textRefs[i] = {ownerCaseID: tCaseValues[i].id, ref: React.createRef()}
			}
		}
		runInAction(() => {
			this.datasetInfoArray = tDatasetNames
			this.targetCollectionName = tCollectionName
			this.targetAttributeNames = tAttrNames
			this.targetCases = tCaseValues
			this.targetClassNames = tClassNames
			if (iPropName)
				this[iPropName] = iValue
			this.targetPredictedLabelAttributeName = 'predicted ' + this.targetClassAttributeName
		})
		if (tTargetDatasetName !== '' && this.targetCollectionName !== '') {
			await guaranteeAttribute({name: this.targetFeatureIDsAttributeName, hidden: true},
				tTargetDatasetName, this.targetCollectionName)
			await guaranteeResultsCollection()
		}
	}

	async updateTargetCases() {
		const tTargetDatasetName = this.targetDatasetInfo.name,
			tCollectionName = this.targetCollectionName,
			tCaseValues = this.targetAttributeName !== '' ? await getCaseValues(tTargetDatasetName, tCollectionName) : []
		runInAction(() => {
			this.targetCases = tCaseValues
		})
		return tCaseValues
	}

	/**
	 * 'search' features affect the target by adding an attribute. ngrams do not.
	 * @param iNewFeature
	 * @param iUpdate
	 */
	async addOrUpdateFeatureToTarget(iNewFeature: Feature, iUpdate ?: boolean) {
		const this_ = this,
			tTargetAttr = `${this_.targetAttributeName}`
		if (!this_.targetDatasetInfo || iNewFeature.info.kind === 'ngram')
			return;

		function freeFormFormula() {
			const option = (iNewFeature.info.details as SearchDetails).where;
			const tBegins = option === featureDescriptors.containsOptions[0] ? '^' : '';
			const tEnds = option === featureDescriptors.containsOptions[3] ? '$' : '';
			const tParamString = `${this_.targetAttributeName},"${tBegins}\\\\\\\\b${(iNewFeature.info.details as SearchDetails).freeFormText}\\\\\\\\b${tEnds}"`;
			let tResult = '';
			switch (option) {//['starts with', 'contains', 'does not contain', 'ends with']
				case featureDescriptors.containsOptions[0]:	// starts with
					tResult = `patternMatches(${tParamString})>0`
					break;
				case featureDescriptors.containsOptions[1]:	// contains
					tResult = `patternMatches(${tParamString})>0`
					break;
				case featureDescriptors.containsOptions[2]:	// does not contain
					tResult = `patternMatches(${tParamString})=0`
					break;
				case featureDescriptors.containsOptions[3]:	// ends with
					tResult = `patternMatches(${tParamString})>0`
					break;
			}
			return tResult;
		}

		function anyNumberFormula() {
			const kNumberPattern = `[0-9]+`;
			let tExpression = '';
			switch ((iNewFeature.info.details as SearchDetails).where) {//['starts with', 'contains', 'does not contain', 'ends with']
				case featureDescriptors.containsOptions[0]:	// starts with
					tExpression = `patternMatches(${tTargetAttr}, "^${kNumberPattern}")>0`
					break;
				case featureDescriptors.containsOptions[1]:	// contains
					tExpression = `patternMatches(${tTargetAttr}, "${kNumberPattern}")>0`
					break;
				case featureDescriptors.containsOptions[2]:	// does not contain
					tExpression = `patternMatches(${tTargetAttr}, "${kNumberPattern}")=0`
					break;
				case featureDescriptors.containsOptions[3]:	// ends with
					tExpression = `patternMatches(${tTargetAttr}, "${kNumberPattern}$")>0`
					break;
			}
			return tExpression;
		}

		function anyListFormula() {
			let tExpression;
			const kListName = (iNewFeature.info.details as SearchDetails).wordList.datasetName,
				kListAttributeName = (iNewFeature.info.details as SearchDetails).wordList.firstAttributeName,
				kWords = SQ.lists[kListName];
			if (kWords) {
				tExpression = kWords.reduce((iSoFar, iWord) => {
					return iSoFar === '' ? `\\\\\\\\b${iWord}\\\\\\\\b` : iSoFar + `|\\\\\\\\b${iWord}\\\\\\\\b`;
				}, '');
				switch ((iNewFeature.info.details as SearchDetails).where) {//['starts with', 'contains', 'does not contain', 'ends with']
					case featureDescriptors.containsOptions[0]:	// starts with
						tExpression = `patternMatches(${tTargetAttr}, "^${tExpression}")>0`;
						break;
					case featureDescriptors.containsOptions[1]:	// contains
						tExpression = `patternMatches(${tTargetAttr}, "${tExpression}")>0`;
						break;
					case featureDescriptors.containsOptions[2]:	// does not contain
						tExpression = `patternMatches(${tTargetAttr}, "${tExpression}")=0`;
						break;
					case featureDescriptors.containsOptions[3]:	// ends with
						tExpression = `patternMatches(${tTargetAttr}, "${tExpression}$")>0`;
						break;
				}
			} else {
				tExpression = `wordListMatches(${tTargetAttr},"${kListName}","${kListAttributeName}")>0`
			}
			return tExpression;
		}

		let tFormula = '';
		switch ((iNewFeature.info.details as SearchDetails).what) {
			case 'any number':
				tFormula = anyNumberFormula()
				break;
			case 'any from List':
				tFormula = anyListFormula()
				break;
			case 'free form text':
				tFormula = freeFormFormula()
				break;
			case 'part of speech':
			// tFormula = posFormula()
		}
		if (tFormula !== '')
			iNewFeature.formula = tFormula
		if (!iUpdate) {
			const tAttributeResponse: any = await codapInterface.sendRequest({
				action: 'create',
				resource: `dataContext[${this_.targetDatasetInfo.name}].collection[${this_.targetCollectionName}].attribute`,
				values: {
					name: iNewFeature.name,
					formula: tFormula
				}
			});
			if (tAttributeResponse.success) {
				iNewFeature.attrID = tAttributeResponse.values.attrs[0].id
				await scrollCaseTableToRight(this_.targetDatasetInfo.name);
			}
		} else {
			const tResource = `dataContext[${this_.targetDatasetInfo.name}].collection[${this_.targetCollectionName}].attribute[${iNewFeature.attrID}]`
			await codapInterface.sendRequest({
				action: 'update',
				resource: tResource,
				values: {
					title: iNewFeature.name,
					name: iNewFeature.name
				}
			})
		}
		// targetCases are now out of date
	}
}


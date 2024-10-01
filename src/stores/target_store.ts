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
import {SQ} from "../lists/lists";
import React from "react";
import {
	Feature, featureDescriptors, kEmptyEntityInfo, SearchDetails
} from "./store_types_and_constants";

export class TargetStore {
	[index: string]: any

	targetPanelMode:'welcome' | 'create' | 'chosen' = 'welcome'
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
	targetClassAttributeValues: string[] = []
	targetClassNames: { [index: string]: string, left: string, right: string } = {left: '', right: ''}
	targetColumnFeatureNames:string[] = []
	targetLeftColumnKey: 'left' | 'right' = 'left'
	targetChosenClassColumnKey: '' | 'left' | 'right' = ''
	textRefs: { ownerCaseID: number, ref: React.RefObject<any> }[] = []
	getFeatureNamesFunc:()=>string[]

	constructor(iGetFeatureNamesFunc:()=>string[]) {
		makeAutoObservable(this,
			{textRefs: false, targetLeftColumnKey: false,
					getFeatureNamesFunc: false},
			{autoBind: true})
		this.getFeatureNamesFunc = iGetFeatureNamesFunc
	}

	asJSON() {
		return {
			targetPanelMode: toJS(this.targetPanelMode),
			targetDatasetInfo: toJS(this.targetDatasetInfo),
			targetAttributeName: toJS(this.targetAttributeName),
			targetClassAttributeName: toJS(this.targetClassAttributeName),
			targetClassAttributeValues: toJS(this.targetClassAttributeValues),
			targetClassNames: toJS(this.targetClassNames),
			targetPredictedLabelAttributeName: toJS(this.targetPredictedLabelAttributeName),
			targetColumnFeatureNames: toJS(this.targetColumnFeatureNames),
			targetChosenClassColumnKey: toJS(this.targetChosenClassColumnKey)
		}
	}

	fromJSON(json: any) {
		this.targetPanelMode = json.targetPanelMode ||
			(json.targetDatasetInfo && json.targetDatasetInfo.name !== '' ? 'chosen' : 'welcome')
		if (Array.isArray(json.targetClassNames))
			json.targetClassNames = null
		this.targetDatasetInfo = json.targetDatasetInfo || kEmptyEntityInfo
		this.targetAttributeName = json.targetAttributeName || ''
		this.targetClassAttributeValues = json.targetClassAttributeValues || []
		this.targetClassAttributeName = json.targetClassAttributeName || ''
		if (json.targetClassNames)
			this.targetClassNames = json.targetClassNames
		this.targetPredictedLabelAttributeName = json.targetPredictedLabelAttributeName || ''
		this.targetColumnFeatureNames = json.targetColumnFeatureNames || []
		this.targetChosenClassColumnKey = json.targetChosenClassColumnKey || ''
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
		 * We go through the target cases to find the first two unique values of the targetClassAttributeName
		 */
		function chooseClassNames() {
			const tTargetClassAttributeName = iPropName === 'targetClassAttributeName' ? iValue : this_.targetClassAttributeName
			if (tTargetClassAttributeName !== '' && tCaseValues.length > 0) {
				tPositiveClassName = tCaseValues[0].values[tTargetClassAttributeName]
				const tNegativeClassCase = tCaseValues.find(iCase => iCase.values[tTargetClassAttributeName] !== tPositiveClassName)
				tNegativeClassName = tNegativeClassCase ? tNegativeClassCase.values[tTargetClassAttributeName] : ''
				tClassNames = {left: tPositiveClassName, right: tNegativeClassName}

				// Also make a set of the unique values of the class attribute
				const tClassAttributeValuesSet:Set<string> = new Set()
				tCaseValues.forEach(iCase=>{
					tClassAttributeValuesSet.add(iCase.values[tTargetClassAttributeName])
				})
				tClassAttributeValues = Array.from(tClassAttributeValuesSet)
			}
		}

		function gatherColumnFeatures() {
			if( tAttrNames.length > 0 && this_.targetAttributeName !== '' &&
					this_.targetClassAttributeName !== '') {
				tColumnFeatureNames = tAttrNames.filter(iName=>{
					return iName !== this_.targetAttributeName && iName !== this_.targetClassAttributeName &&
						this_.getFeatureNamesFunc().indexOf(iName) < 0
				})
			}
		}

		const tDatasetNames = await getDatasetInfoWithFilter((anInfo:entityInfo) => {
			return anInfo && anInfo.numAttributes ? anInfo.numAttributes > 1 : false
		});
		let tCollectionNames: string[] = []
		let tCollectionName = ''
		let tAttrNames: string[] = []
		let tCaseValues: Case[] = []
		let tPositiveClassName = ''
		let tNegativeClassName = ''
		let tClassNames = {left: '', right: ''}
		let tClassAttributeValues:string[]
		let tColumnFeatureNames:string[] = []
		const tTargetDatasetName = this.targetDatasetInfo.name
		if (tTargetDatasetName !== '') {
			tCollectionNames = await getCollectionNames(tTargetDatasetName)
			tCollectionName = tCollectionNames.length > 0 ? tCollectionNames[0] : ''
			tAttrNames = tCollectionName !== '' ? await getAttributeNames(tTargetDatasetName, tCollectionName) : []
			tAttrNames = tAttrNames.filter(iName=>iName!==this.targetFeatureIDsAttributeName)
			tCaseValues = this.targetAttributeName !== '' ? await getCaseValues(tTargetDatasetName,
				tCollectionName) : []
			chooseClassNames()
			for (let i = 0; i < Math.min(40, tCaseValues.length); i++) {
				this.textRefs[i] = {ownerCaseID: tCaseValues[i].id, ref: React.createRef()}
			}
		}
		gatherColumnFeatures()

		runInAction(() => {
			this.datasetInfoArray = tDatasetNames
			this.targetCollectionName = tCollectionName
			this.targetAttributeNames = tAttrNames
			this.targetCases = tCaseValues
			this.targetClassNames = tClassNames
			if (iPropName)
				this[iPropName] = iValue
			this.targetClassAttributeValues = tClassAttributeValues
			this.targetPredictedLabelAttributeName = 'predicted ' + this.targetClassAttributeName
			this.targetColumnFeatureNames = tColumnFeatureNames
		})
		if (tTargetDatasetName !== '' && this.targetCollectionName !== '') {
			await guaranteeAttribute({name: this.targetFeatureIDsAttributeName, hidden: true},
				tTargetDatasetName, this.targetCollectionName)
		}
	}

	resetTargetDataForNewTarget() {
		this.targetCollectionName = ''
		this.targetAttributeNames = []
		this.targetAttributeName = ''
		this.targetPredictedLabelAttributeName = ''
		this.targetCases = []
		this.targetClassAttributeName = ''
		this.targetClassAttributeValues = []
		this.targetClassNames = {left: '', right: ''}
		this.targetColumnFeatureNames = []
		this.targetLeftColumnKey = 'left'
		this.targetChosenClassColumnKey = ''

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
			tTargetAttr = `\`${this_.targetAttributeName}\``
		if (!this_.targetDatasetInfo || iNewFeature.info.kind === 'ngram' || iNewFeature.info.kind === 'column')
			return;

		function freeFormFormula() {
			const option = (iNewFeature.info.details as SearchDetails).where;
			const tBegins = option === featureDescriptors.containsOptions[2] ? '^' : '';
			const tEnds = option === featureDescriptors.containsOptions[3] ? '$' : '';
			const text = (iNewFeature.info.details as SearchDetails).freeFormText.trim();
			// note: the multiple slash escaping is due to all the layers between this code and the CODAP formula evaluator
			const escapedText = text
				.replace(/[.*+?^${}()|[\]\\]/g, '\\\\\\\\$&') // escape regex modifiers
				.replace(/\s+/g, '\\\\\\\\s+') // allow multiple spaces between words
				.replace(/['"“”‘’]/g, (match) => { // allow both regular and smart quotes to match each other
					switch (match) {
						case '"':
						case '“':
						case '”':
							return `["“”]`;
						case "'":
						case '‘':
						case '’':
							return `['‘’]`;
						default:
							return match;
					}
				});
			// don't add word boundaries when the user input starts/ends with non-word characters, like ! or , as that would fail matching
			const wordBoundary = `\\\\\\\\b`;
			const maybeStartingWordBoundary = /^\w/.test(text) ? wordBoundary : '';
			const maybeEndingWordBoundary = /\w$/.test(text) ? wordBoundary : '';
			const tParamString = `${tTargetAttr},"${tBegins}${maybeStartingWordBoundary}${escapedText}${maybeEndingWordBoundary}${tEnds}"`;
			console.log("tParamString", tParamString);
			let tResult = '';
			switch (option) {//['contain', 'not contain', 'start with', 'end with']
				case featureDescriptors.containsOptions[0]:	// contain
					tResult = `patternMatches(${tParamString})>0`
					break;
				case featureDescriptors.containsOptions[1]:	// not contain
					tResult = `patternMatches(${tParamString})=0`
					break;
				case featureDescriptors.containsOptions[2]:	// start with
					tResult = `patternMatches(${tParamString})>0`
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
			switch ((iNewFeature.info.details as SearchDetails).where) {//['contain', 'not contain', 'start with', 'end with']
				case featureDescriptors.containsOptions[0]:	// contain
					tExpression = `patternMatches(${tTargetAttr}, "${kNumberPattern}")>0`
					break;
				case featureDescriptors.containsOptions[1]:	// not contain
					tExpression = `patternMatches(${tTargetAttr}, "${kNumberPattern}")=0`
					break;
				case featureDescriptors.containsOptions[2]:	// start with
					tExpression = `patternMatches(${tTargetAttr}, "^${kNumberPattern}")>0`
					break;
				case featureDescriptors.containsOptions[3]:	// end with
					tExpression = `patternMatches(${tTargetAttr}, "${kNumberPattern}$")>0`
					break;
			}
			return tExpression;
		}

		function punctuationFormula() {
			const tPunc = `\\\\\\\\${(iNewFeature.info.details as SearchDetails).punctuation}`
			let tExpression = '';
			switch ((iNewFeature.info.details as SearchDetails).where) {//['contain', 'not contain', 'start with', 'end with']
				case featureDescriptors.containsOptions[0]:	// contain
					tExpression = `patternMatches(${tTargetAttr}, "${tPunc}")>0`
					break;
				case featureDescriptors.containsOptions[1]:	// not contain
					tExpression = `patternMatches(${tTargetAttr}, "${tPunc}")=0`
					break;
				case featureDescriptors.containsOptions[2]:	// start with
					tExpression = `patternMatches(${tTargetAttr}, "^${tPunc}")>0`
					break;
				case featureDescriptors.containsOptions[3]:	// end with
					tExpression = `patternMatches(${tTargetAttr}, "${tPunc}$")>0`
					break;
			}
			return tExpression;
		}

		function anyListFormula() {
			let tExpression;
			const kListName = (iNewFeature.info.details as SearchDetails).wordList.datasetName,
				kListAttributeName = (iNewFeature.info.details as SearchDetails).wordList.firstAttributeName,
				kWords = SQ.lists[kListName],
				tWhere = (iNewFeature.info.details as SearchDetails).where,
				tStartsWithOption = featureDescriptors.containsOptions[0],
				tEndsWithOption = featureDescriptors.containsOptions[3],
				tCaret = tWhere === tStartsWithOption ? '^' : '',
				tDollar = tWhere === tEndsWithOption ? '$' : ''
			if (kWords) {
				tExpression = kWords.reduce((iSoFar, iWord) => {
					return iSoFar === '' ? `${tCaret}\\\\\\\\b${iWord}\\\\\\\\b${tDollar}` : iSoFar + `|${tCaret}\\\\\\\\b${iWord}\\\\\\\\b${tDollar}`;
				}, '');
				switch (tWhere) {//['contain', 'not contain', 'start with', 'end with']
					case featureDescriptors.containsOptions[0]:	// contain
						tExpression = `patternMatches(${tTargetAttr}, "${tExpression}")>0`;
						break;
					case featureDescriptors.containsOptions[1]:	// not contain
						tExpression = `patternMatches(${tTargetAttr}, "${tExpression}")=0`;
						break;
					case featureDescriptors.containsOptions[2]:	// start with
						tExpression = `patternMatches(${tTargetAttr}, "^${tExpression}")>0`;
						break;
					case featureDescriptors.containsOptions[3]:	// end with
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
			case 'any item from a list':
				tFormula = anyListFormula()
				break;
			case 'text':
				tFormula = freeFormFormula()
				break;
			case 'punctuation':
				tFormula = punctuationFormula()
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


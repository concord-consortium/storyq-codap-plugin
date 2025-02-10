/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import { makeAutoObservable, toJS } from 'mobx'
import {
	Case, entityInfo, getAttributeNames, getCaseValues, getCollectionNames, getDatasetInfoWithFilter, guaranteeAttribute,
	scrollCaseTableToRight
} from "../lib/codap-helper";
import codapInterface from "../lib/CodapInterface";
import { SQ } from "../lists/lists";
import { featureStore } from './feature_store';
import { targetDatasetStore } from './target_dataset_store';
import {
	containOptionAbbreviations, Feature, kContainOptionContain, kContainOptionEndWith, kContainOptionNotContain,
	kContainOptionStartWith, kEmptyEntityInfo, SearchDetails
} from "./store_types_and_constants";
import { CreateAttributeResponse } from '../types/codap-api-types';

type panelModes = 'welcome' | 'create' | 'chosen';
type classColumns = "left" | "right";
type maybeClassColumns = classColumns | undefined;

export function otherClassColumn(column: maybeClassColumns) {
	return column === "left" ? "right" : "left";
}

interface ITargetStore {
	targetPanelMode: panelModes;
	datasetInfoArray: entityInfo[];
	targetCollectionName: string;
	targetAttributeNames: string[];
	targetAttributeName: string;
	targetPredictedLabelAttributeName: string;
	targetResultsCollectionName: string;
	targetFeatureIDsAttributeName: string;
	targetCases: Case[];
	targetClassAttributeName: string;
	targetClassAttributeValues: string[];
	targetClassNames: Record<classColumns, string>;
	targetColumnFeatureNames: string[];
	targetLeftColumnKey: classColumns;
	targetChosenClassColumnKey: maybeClassColumns;
}
export interface ITargetStoreJSON extends ITargetStore {
	targetDatasetInfo: entityInfo;
}

export class TargetStore {
	targetPanelMode: panelModes = 'welcome'
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
	targetClassNames: Record<classColumns, string> = { left: "", right: "" }
	targetColumnFeatureNames: string[] = []
	targetLeftColumnKey: classColumns = 'left'
	targetChosenClassColumnKey: maybeClassColumns

	constructor() {
		makeAutoObservable(this, { targetLeftColumnKey: false }, { autoBind: true });
	}
	
	setTargetPanelMode(mode: panelModes) {
		this.targetPanelMode = mode;
	}

	setDatasetInfoArray(infoArray: entityInfo[]) {
		this.datasetInfoArray = infoArray;
	}

	setTargetCollectionName(name: string) {
		this.targetCollectionName = name;
	}

	setTargetAttributeNames(names: string[]) {
		this.targetAttributeNames = names;
	}

	setTargetAttributeName(name: string) {
		this.targetAttributeName = name;
	}

	setTargetPredictedLabelAttributeName(name: string) {
		this.targetPredictedLabelAttributeName = name;
	}

	setTargetResultsCollectionName(name: string) {
		this.targetResultsCollectionName = name;
	}

	setTargetFeatureIDsAttributeName(name: string) {
		this.targetFeatureIDsAttributeName = name;
	}

	setTargetCases(cases: Case[]) {
		this.targetCases = cases;
	}

	setTargetClassAttributeName(name: string) {
		this.targetClassAttributeName = name;
	}

	setTargetClassAttributeValues(values: string[]) {
		this.targetClassAttributeValues = values;
	}

	setTargetClassNames(names: Record<classColumns, string>) {
		this.targetClassNames = names;
	}

	setTargetColumnFeatureNames(names: string[]) {
		this.targetColumnFeatureNames = names;
	}

	setTargetLeftColumnKey(key: classColumns) {
		this.targetLeftColumnKey = key;
	}

	setTargetChosenClassColumnKey(key: maybeClassColumns) {
		this.targetChosenClassColumnKey = key;
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

	fromJSON(json: ITargetStoreJSON) {
		this.setTargetPanelMode(json.targetPanelMode ||
			(json.targetDatasetInfo && json.targetDatasetInfo.name !== '' ? 'chosen' : 'welcome'));
		if (Array.isArray(json.targetClassNames))
			json.targetClassNames = { left: "", right: "" };
		targetDatasetStore.setTargetDatasetInfo(json.targetDatasetInfo || kEmptyEntityInfo);
		this.setTargetAttributeName(json.targetAttributeName || '');
		this.setTargetClassAttributeValues(json.targetClassAttributeValues || []);
		this.setTargetClassAttributeName(json.targetClassAttributeName || '');
		if (json.targetClassNames)
			this.setTargetClassNames(json.targetClassNames);
		this.setTargetPredictedLabelAttributeName(json.targetPredictedLabelAttributeName || '');
		this.setTargetColumnFeatureNames(json.targetColumnFeatureNames || []);
		this.setTargetChosenClassColumnKey(json.targetChosenClassColumnKey);
	}

	getTargetClassName(key: maybeClassColumns) {
		return key ? this.targetClassNames[key] : "";
	}

	getClassName(iClass: 'positive' | 'negative') {
		const tChosenClassKey = iClass === 'positive'
			? this.targetChosenClassColumnKey
			: otherClassColumn(this.targetChosenClassColumnKey);
		return this.getTargetClassName(tChosenClassKey);
	}

	get targetDatasetInfo() {
		return targetDatasetStore.targetDatasetInfo;
	}

	async updateFromCODAP(args: { targetClassAttributeName?: string } = {}) {
		const { targetClassAttributeName } = args;

		const tDatasetNames = await getDatasetInfoWithFilter((anInfo:entityInfo) => {
			return anInfo && anInfo.numAttributes ? anInfo.numAttributes > 1 : false
		});
		let tCollectionNames: string[] = [];
		let tCollectionName = '';
		let tAttrNames: string[] = [];
		let tCaseValues: Case[] = [];
		let tPositiveClassName = '';
		let tNegativeClassName = '';
		let tClassNames = { left: '', right: '' };
		let tClassAttributeValues: string[] = [];
		let tColumnFeatureNames: string[] = [];
		const tTargetDatasetName = this.targetDatasetInfo.name;
		if (tTargetDatasetName !== '') {
			tCollectionNames = await getCollectionNames(tTargetDatasetName);
			tCollectionName = tCollectionNames.length > 0 ? tCollectionNames[0] : '';
			tAttrNames = tCollectionName !== '' ? await getAttributeNames(tTargetDatasetName, tCollectionName) : [];
			tAttrNames = tAttrNames.filter(iName => iName !== this.targetFeatureIDsAttributeName);
			tCaseValues = this.targetAttributeName !== ''
				? await getCaseValues(tTargetDatasetName, tCollectionName) : [];

			// choose class names
			const tTargetClassAttributeName = targetClassAttributeName ?? this.targetClassAttributeName;
			if (tTargetClassAttributeName !== '' && tCaseValues.length > 0) {
				tPositiveClassName = tCaseValues[0].values[tTargetClassAttributeName];
				const tNegativeClassCase =
					tCaseValues.find(iCase => iCase.values[tTargetClassAttributeName] !== tPositiveClassName);
				tNegativeClassName = tNegativeClassCase ? tNegativeClassCase.values[tTargetClassAttributeName] : '';
				tClassNames = { left: tPositiveClassName, right: tNegativeClassName };

				// Also make a set of the unique values of the class attribute
				const tClassAttributeValuesSet: Set<string> = new Set();
				tCaseValues.forEach(iCase => {
					tClassAttributeValuesSet.add(iCase.values[tTargetClassAttributeName]);
				})
				tClassAttributeValues = Array.from(tClassAttributeValuesSet);
			}
		}

		// gather column features
		if (
			tAttrNames.length > 0 && this.targetAttributeName !== '' && this.targetClassAttributeName !== ''
		) {
			tColumnFeatureNames = tAttrNames.filter(iName => {
				return iName !== this.targetAttributeName && iName !== this.targetClassAttributeName &&
					featureStore.features.map(iFeature => iFeature.name).indexOf(iName) < 0;
			});
		}

		this.setDatasetInfoArray(tDatasetNames);
		this.setTargetCollectionName(tCollectionName);
		this.setTargetAttributeNames(tAttrNames);
		this.setTargetCases(tCaseValues);
		this.setTargetClassNames(tClassNames);
		if (targetClassAttributeName) this.setTargetClassAttributeName(targetClassAttributeName);
		this.setTargetClassAttributeValues(tClassAttributeValues);
		this.setTargetPredictedLabelAttributeName('predicted ' + this.targetClassAttributeName);
		this.setTargetColumnFeatureNames(tColumnFeatureNames);
			
		if (tTargetDatasetName !== '' && this.targetCollectionName !== '') {
			await guaranteeAttribute({ name: this.targetFeatureIDsAttributeName, hidden: true },
				tTargetDatasetName, this.targetCollectionName);
		}
	}

	resetTargetDataForNewTarget() {
		this.targetCollectionName = '';
		this.targetAttributeNames = [];
		this.targetAttributeName = '';
		this.targetPredictedLabelAttributeName = '';
		this.targetCases = [];
		this.targetClassAttributeName = '';
		this.targetClassAttributeValues = [];
		this.targetClassNames = { left: '', right: '' };
		this.targetColumnFeatureNames = [];
		this.targetLeftColumnKey = 'left';
		this.targetChosenClassColumnKey = undefined;
	}

	async updateTargetCases(formula?: string) {
		this.targetCases = this.targetAttributeName !== ''
			? await getCaseValues(this.targetDatasetInfo.name, this.targetCollectionName, formula)
			: [];

		return this.targetCases;
	}

	/**
	 * 'search' features affect the target by adding an attribute. ngrams do not.
	 * @param iNewFeature
	 * @param iUpdate
	 */
	// TODO Clean up this function
	async addOrUpdateFeatureToTarget(iNewFeature: Feature, iUpdate ?: boolean) {
		const this_ = this,
			tTargetAttr = `\`${this_.targetAttributeName}\``;

		if (!this.targetDatasetInfo || iNewFeature.info.kind === 'ngram' || iNewFeature.info.kind === 'column')
			return;

		function freeFormFormula() {
			const option = (iNewFeature.info.details as SearchDetails).where;
			const tBegins = option === containOptionAbbreviations[kContainOptionStartWith] ? '^' : '';
			const tEnds = option === containOptionAbbreviations[kContainOptionEndWith] ? '$' : '';
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
			let tResult = '';
			switch (option) {
				case containOptionAbbreviations[kContainOptionContain]:
					tResult = `patternMatches(${tParamString})>0`
					break;
				case containOptionAbbreviations[kContainOptionNotContain]:
					tResult = `patternMatches(${tParamString})=0`
					break;
				case containOptionAbbreviations[kContainOptionStartWith]:
					tResult = `patternMatches(${tParamString})>0`
					break;
				case containOptionAbbreviations[kContainOptionEndWith]:
					tResult = `patternMatches(${tParamString})>0`
					break;
			}
			return tResult;
		}

		function anyNumberFormula() {
			const kNumberPattern = `[0-9]+`;
			let tExpression = '';
			switch ((iNewFeature.info.details as SearchDetails).where) {
				case containOptionAbbreviations[kContainOptionContain]:
					tExpression = `patternMatches(${tTargetAttr}, "${kNumberPattern}")>0`
					break;
				case containOptionAbbreviations[kContainOptionNotContain]:
					tExpression = `patternMatches(${tTargetAttr}, "${kNumberPattern}")=0`
					break;
				case containOptionAbbreviations[kContainOptionStartWith]:
					tExpression = `patternMatches(${tTargetAttr}, "^${kNumberPattern}")>0`
					break;
				case containOptionAbbreviations[kContainOptionEndWith]:
					tExpression = `patternMatches(${tTargetAttr}, "${kNumberPattern}$")>0`
					break;
			}
			return tExpression;
		}

		function punctuationFormula() {
			const tPunc = `\\\\\\\\${(iNewFeature.info.details as SearchDetails).punctuation}`
			let tExpression = '';
			switch ((iNewFeature.info.details as SearchDetails).where) {
				case containOptionAbbreviations[kContainOptionContain]:
					tExpression = `patternMatches(${tTargetAttr}, "${tPunc}")>0`
					break;
				case containOptionAbbreviations[kContainOptionNotContain]:
					tExpression = `patternMatches(${tTargetAttr}, "${tPunc}")=0`
					break;
				case containOptionAbbreviations[kContainOptionStartWith]:
					tExpression = `patternMatches(${tTargetAttr}, "^${tPunc}")>0`
					break;
				case containOptionAbbreviations[kContainOptionEndWith]:
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
				tStartsWithOption = containOptionAbbreviations[kContainOptionStartWith],
				tEndsWithOption = containOptionAbbreviations[kContainOptionEndWith],
				tCaret = tWhere === tStartsWithOption ? '^' : '',
				tDollar = tWhere === tEndsWithOption ? '$' : ''
			if (kWords) {
				tExpression = kWords.reduce((iSoFar, iWord) => {
					return iSoFar === '' ? `${tCaret}\\\\\\\\b${iWord}\\\\\\\\b${tDollar}` : iSoFar + `|${tCaret}\\\\\\\\b${iWord}\\\\\\\\b${tDollar}`;
				}, '');
				switch (tWhere) {
					case containOptionAbbreviations[kContainOptionContain]:
						tExpression = `patternMatches(${tTargetAttr}, "${tExpression}")>0`;
						break;
					case containOptionAbbreviations[kContainOptionNotContain]:
						tExpression = `patternMatches(${tTargetAttr}, "${tExpression}")=0`;
						break;
					case containOptionAbbreviations[kContainOptionStartWith]:
						tExpression = `patternMatches(${tTargetAttr}, "^${tExpression}")>0`;
						break;
					case containOptionAbbreviations[kContainOptionEndWith]:
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
		const targetDatasetName = this.targetDatasetInfo.name;
		if (!iUpdate) {
			const tAttributeResponse = await codapInterface.sendRequest({
				action: 'create',
				resource: `dataContext[${targetDatasetName}].collection[${this_.targetCollectionName}].attribute`,
				values: {
					name: iNewFeature.name,
					formula: tFormula
				}
			}) as CreateAttributeResponse;
			if (tAttributeResponse.success && tAttributeResponse.values && tAttributeResponse.values.attrs.length > 0) {
				iNewFeature.attrID = String(tAttributeResponse.values.attrs[0].id);
				await scrollCaseTableToRight(targetDatasetName);
			}
		} else {
			const tResource = 
				`dataContext[${targetDatasetName}].collection[${this_.targetCollectionName}].attribute[${iNewFeature.attrID}]`;
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

export const targetStore = new TargetStore();

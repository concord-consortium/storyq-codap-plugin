// ==========================================================================
//
//  Author:   William Finzer
//
//  Copyright (c) 2020 by The Concord Consortium, Inc. All rights reserved.
//
//  Licensed under the Apache License, Version 2.0 (the "License");
//  you may not use this file except in compliance with the License.
//  You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
//  Unless required by applicable law or agreed to in writing, software
//  distributed under the License is distributed on an "AS IS" BASIS,
//  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//  See the License for the specific language governing permissions and
//  limitations under the License.
// ==========================================================================

import {stopWords} from "./stop_words";
import {Feature, TokenMap} from "../stores/store_types_and_constants";
import { emoticons } from "./emoticons";

export const kMaxTokens = 1000;

/**
 * Convert the given string into an array of lowercase words.
 */
export const wordTokenizer = (text: string, ignoreStopWords: boolean, ignorePunctuation: boolean): string[] => {
	let tokens: string[] = [];
	if (text) {
		let words = `(\\w+['’]{0,1}\\w*)`;
		let emojis = `[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{25A0}-\u{2BFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]`;
		let emojiconsOrWords = `${emoticons}|${emojis}|${words}`;
		let tExpressionPattern = ignorePunctuation ? emojiconsOrWords : `${emojiconsOrWords}|[,!:@#$%^&*()\\-_[\\]{};'".<>/?\`~]|\\d+`;
		let tExpression = new RegExp(tExpressionPattern, 'gu');
		let tWords: RegExpMatchArray | [] = text.toLowerCase().match(tExpression) || [];
		tWords.forEach((aWord) => {
			if (!ignoreStopWords || !stopWords[aWord])
				tokens.push(aWord);
		});
	}
	return tokens;
}

export interface OneHotConfig {
	includeUnigrams: boolean,
	frequencyThreshold: number,
	ignoreStopWords: boolean,
	ignorePunctuation: boolean,
	positiveClass: string,
	negativeClass: string,
	features: Feature[],
	tokenMap?: TokenMap
}

/**
 * This function takes an array of "documents,"" each with a class, and returns a one-hot
 * encoding of those documents consisting of an array representing the presence or absence
 * of each of the "tokens" in the document set.
 * For StoryQ, with each token we keep track of the document caseIDs in which it occurs.
 * @result
 * {
 *   oneHotResult:{ oneHotExample:number[], class:string }[],
 *   tokenMap: [key:string]: { token:string, type:string, count:number, index:number,
 *			caseIDs:number[], weight:number|null, featureCaseID:number|null },
 *	 tokenArray: { token:string, count:number, index:number,
 *	 		caseIDs:number[], weight:number|null, featureCaseID:number}[]
 * }
 */
export const oneHot = (config: OneHotConfig,
											 documents: {
												 example: string, class: string, caseID: number,
												 columnFeatures: { [key: string]: number | boolean }, tokens?: string[]
											 }[]
) => {
	const tTokenMapIsPredefined = config.tokenMap && Object.keys(config).length > 0,
		tokenMap = tTokenMapIsPredefined ? config.tokenMap : {};	// Keeps track of counts of words
	if( !tokenMap)
		return
	if (tTokenMapIsPredefined) {	// Unigrams are already taken care of when the feature was added. Only constructed features remain
		documents.forEach(aDoc => {
			const tokens: Set<string> = new Set()
			Object.keys(aDoc.columnFeatures).forEach(aFeature => tokens.add(aFeature));
			tokens.forEach(aToken => {
				if (!tokenMap[aToken]) {
					const tFeatureCaseIDObject = config.features.find(aFeature => aFeature.name === aToken),
						tFeatureCaseID = tFeatureCaseIDObject ? Number(tFeatureCaseIDObject.caseID) : null
					tokenMap[aToken] = {
						token: aToken,
						type: 'constructed feature',
						count: 1,
						index: -1,
						numPositive: 0,
						numNegative: 0,
						caseIDs: [],
						weight: null,
						featureCaseID: tFeatureCaseID
					}
				}
				else
					tokenMap[aToken].count++
			})
			aDoc.tokens = aDoc.tokens ? aDoc.tokens.concat(Array.from(tokens)) : Array.from(tokens)
		})
	} else {
		// console.log(`config.features = ${JSON.stringify(toJS(config.features))}`)
		documents.forEach(aDoc => {
			const tText = config.includeUnigrams ? aDoc.example : '',
				tokens = new Set(wordTokenizer(tText, config.ignoreStopWords, config.ignorePunctuation));
			// Add the column features as tokens as well
			Object.keys(aDoc.columnFeatures).forEach(aFeature => tokens.add(aFeature));

			tokens.forEach(aToken => {
				if (!tokenMap[aToken]) {
					const tType = aDoc.columnFeatures[aToken] ? 'constructed feature' : 'unigram',
						tFeatureCaseIDObject = config.features.find(aFeature => aFeature.name === aToken),
						tFeatureCaseID = tFeatureCaseIDObject ? Number(tFeatureCaseIDObject.caseID) : null
					tokenMap[aToken] = {
						token: aToken,
						type: tType,
						count: 1,
						index: -1,
						numPositive: 0,
						numNegative: 0,
						caseIDs: [],
						weight: null,
						featureCaseID: tFeatureCaseID
					};
				} else
					tokenMap[aToken].count++;
				tokenMap[aToken].caseIDs.push(aDoc.caseID);
				if (aDoc.class === config.positiveClass)
					tokenMap[aToken].numPositive++
				else
					tokenMap[aToken].numNegative++
			});
			aDoc.tokens = Array.from(tokens);
		});
	}
	// Convert tokenMap to an array and sort descending
	let tokenArray = Object.values(tokenMap).sort((aToken1, aToken2) => {
		return aToken2.count - aToken1.count;
	});
	// Only include tokens with a count above specified threshold
	let tIndexFirstBelowThreshold = -1,
		tThreshold = config.frequencyThreshold;
	/*eslint-disable */
	while (tIndexFirstBelowThreshold < 0 && tThreshold > 0) {
		tIndexFirstBelowThreshold = tokenArray.findIndex((aToken) => {
			return aToken.count <= tThreshold;
		});
		tThreshold--;
	}
	/*eslint-enable */
	if (tIndexFirstBelowThreshold < 0)	// There were no very frequent tokens
		tIndexFirstBelowThreshold = tokenArray.length;
	tokenArray.length = Math.min(tIndexFirstBelowThreshold, tokenArray.length, kMaxTokens);
	const kVectorLength = tokenArray.length;
	// Assign each token an index given its position in the array
	tokenArray.forEach((aToken, iIndex) => {
		aToken.index = iIndex;
	});
	// Delete the unneeded tokens from tokenMap
	Object.keys(tokenMap).forEach((aKey) => {
		if (tokenMap[aKey].index === -1)
			delete tokenMap[aKey];
	});
	// Create an array of one-hot vectors corresponding to the original document examples
	// We have to do both the tokens in the example and the column features
	let oneHotArray: { oneHotExample: number[], class: string }[] = documents.map(aDoc => {
		let tText = config.includeUnigrams ? aDoc.example : '',
			tokens: string[] = wordTokenizer(tText, config.ignoreStopWords, config.ignorePunctuation),
			tVector: number[] = Array(kVectorLength).fill(0);
		Object.keys(aDoc.columnFeatures).forEach(aFeature => tokens.push(aFeature));
		tokens.forEach(aWord => {
			if (tokenMap[aWord]) {
				let tWordIndex = tokenMap[aWord].index;
				if (tWordIndex >= 0 && tWordIndex < kVectorLength)
					tVector[tWordIndex] = 1;
			}
		});

		return {oneHotExample: tVector, class: aDoc.class};
	});
	return {
		oneHotResult: oneHotArray,
		tokenMap: tokenMap,
		tokenArray: tokenArray
	};
};

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

import { featureStore } from "../stores/feature_store";
import {
	Feature, getNewToken, kNumberPattern, kTokenTypeConstructed, kTokenTypeUnigram
} from "../stores/store_types_and_constants";
import { emoticons } from "./emoticons";
import { stopWords } from "./stop_words";

export const kMaxTokens = 1000;

const words = `(\\w+['’]{0,1}\\w*)`;
const emojis = `[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{25A0}-\u{2BFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]`;
const whitespace = /\s+/.source;
const punctuation = `[,!:@#$%^&*()+\\-_[\\]{};'".<>/?\`~]|\\d+`;
const emojiconsOrWords = `${kNumberPattern}|${emoticons}|${emojis}|${words}`;

/**
 * Convert the given string into an array of tokens, maintaining case. Tokens include whitespace so the
 * text can be recreated by joining the tokens.
 */
export function allTokenizer(text: string) {
	if (text) {
		const tExpressionPattern = `${emojiconsOrWords}|${whitespace}|${punctuation}`;
		const tExpression = new RegExp(tExpressionPattern, 'gu');
		return text.match(tExpression) || [];
	}
	return [];
}

/**
 * Convert the given string into an array of lowercase words.
 */
export const wordTokenizer = (text: string, ignoreStopWords: boolean, ignorePunctuation: boolean): string[] => {
	const tokens: string[] = [];
	if (text) {
		const tExpressionPattern = ignorePunctuation ? emojiconsOrWords : `${emojiconsOrWords}|${punctuation}`;
		const tExpression = new RegExp(tExpressionPattern, 'gu');
		const tWords: RegExpMatchArray | [] = text.toLowerCase().match(tExpression) || [];
		tWords.forEach((aWord) => {
			if (!ignoreStopWords || !stopWords[aWord])
				tokens.push(aWord);
		});
	}
	return tokens;
}

export interface OneHotConfig {
	includeUnigrams: boolean;
	frequencyThreshold: number;
	ignoreStopWords: boolean;
	ignorePunctuation: boolean;
	positiveClass: string;
	negativeClass: string;
	features: Feature[];
	newTokenMap?: boolean;
}

export interface Document {
	example: string;
	class: string;
	caseID: number;
	columnFeatures: Record<string, number | boolean>;
	tokens?: string[];
}

/**
 * This function takes an array of "documents,"" each with a class, and returns a one-hot
 * encoding of those documents consisting of an array representing the presence or absence
 * of each of the "tokens" in the document set.
 * For StoryQ, with each token we keep track of the document caseIDs in which it occurs.
 */
export function oneHot(config: OneHotConfig, documents: Document[]) {
	const documentTokens: Record<number, Set<string>> = {};
	documents.forEach((aDoc, index) => {
		const tText = config.includeUnigrams ? aDoc.example : '';
		documentTokens[index] = new Set(wordTokenizer(tText, config.ignoreStopWords, config.ignorePunctuation));
		// Add the column features as tokens as well
		Object.keys(aDoc.columnFeatures).forEach(aFeature => documentTokens[index].add(aFeature));
	});

	if (!config.newTokenMap) {	// Unigrams are already taken care of when the feature was added. Only constructed features remain
		documents.forEach(aDoc => {
			const tokens = Object.keys(aDoc.columnFeatures);
			tokens.forEach(aToken => {
				if (!featureStore.tokenMap[aToken]) {
					const tFeatureCaseIDObject = config.features.find(aFeature => aFeature.name === aToken);
					const tFeatureCaseID = tFeatureCaseIDObject ? Number(tFeatureCaseIDObject.caseID) : null;
					featureStore.addToken(aToken, getNewToken({
						token: aToken,
						type: kTokenTypeConstructed,
						featureCaseID: tFeatureCaseID
					}));
				} else {
					featureStore.tokenMap[aToken].count++;
				}
			})
			aDoc.tokens = aDoc.tokens ? aDoc.tokens.concat(tokens) : tokens;
		})
	} else {
		featureStore.clearTokens();
		documents.forEach((aDoc, index) => {
			documentTokens[index].forEach(aToken => {
				if (!featureStore.tokenMap[aToken]) {
					const tType = aDoc.columnFeatures[aToken] ? kTokenTypeConstructed : kTokenTypeUnigram;
					const tFeatureCaseIDObject = config.features.find(aFeature => aFeature.name === aToken);
					const tFeatureCaseID = tFeatureCaseIDObject ? Number(tFeatureCaseIDObject.caseID) : null;
					featureStore.addToken(aToken, getNewToken({
						token: aToken,
						type: tType,
						featureCaseID: tFeatureCaseID
					}));
				} else {
					featureStore.tokenMap[aToken].count++;
				}
				featureStore.tokenMap[aToken].caseIDs.push(aDoc.caseID);
				if (aDoc.class === config.positiveClass) {
					featureStore.tokenMap[aToken].numPositive++;
				} else {
					featureStore.tokenMap[aToken].numNegative++;
				}
			});
			aDoc.tokens = Array.from(documentTokens[index]);
		});
	}

	// Convert tokenMap to an array and sort descending
	let tokenArray = Object.values(featureStore.tokenMap).sort((aToken1, aToken2) => {
		return aToken2.count - aToken1.count;
	});

	// Only include tokens with a count above specified threshold
	let tIndexFirstBelowThreshold = -1;
	let tThreshold = config.frequencyThreshold;
	while (tIndexFirstBelowThreshold < 0 && tThreshold > 0) {
		const threshold = tThreshold;
		tIndexFirstBelowThreshold = tokenArray.findIndex(token => token.count <= threshold);
		tThreshold--;
	}
	if (tIndexFirstBelowThreshold < 0) {
		// There were no very frequent tokens
		tIndexFirstBelowThreshold = tokenArray.length;
	}
	tokenArray.length = Math.min(tIndexFirstBelowThreshold, tokenArray.length, kMaxTokens);
	const kVectorLength = tokenArray.length;

	// Assign each token an index given its position in the array
	tokenArray.forEach((aToken, iIndex) => {
		aToken.index = iIndex;
	});

	// Delete the unneeded tokens from tokenMap
	Object.keys(featureStore.tokenMap).forEach((aKey) => {
		const token = featureStore.tokenMap[aKey];
		if (token.index === -1) {
			featureStore.deleteToken(aKey);
		}
	});

	// Create an array of one-hot vectors corresponding to the original document examples
	// We have to do both the tokens in the example and the column features
	let oneHotArray: { oneHotExample: number[], class: string }[] = documents.map((aDoc, index) => {
		const tVector: number[] = Array(kVectorLength).fill(0);
		documentTokens[index].forEach(aWord => {
			if (featureStore.tokenMap[aWord]) {
				const tWordIndex = featureStore.tokenMap[aWord].index;
				if (tWordIndex >= 0 && tWordIndex < kVectorLength) tVector[tWordIndex] = 1;
			}
		});

		return { oneHotExample: tVector, class: aDoc.class };
	});

	return { oneHotResult: oneHotArray, tokenArray };
}

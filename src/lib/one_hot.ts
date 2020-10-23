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

//import {on} from "cluster";
import {SQConstants} from "../storyq_constants";

export const kMaxTokens = 1000;

/**
 * Convert the given string into an array of lowercase words.
 */
export const wordTokenizer = ( text:string):string[] => {
	let tokens:string[] = [];
	let tWords: RegExpMatchArray | [] = text.toLowerCase().match(/\w+/g) || [];
	tWords.forEach((aWord) => {
		tokens.push(aWord);
	});
	return tokens;
}

/**
 * This function takes an array of "documents,"" each with a class, and returns a one-hot
 * encoding of those documents consisting of an array representing the presence or absence
 * of each of the "tokens" in the document set.
 * For StoryQ, with each token we keep track of the document caseIDs in which it occurs.
 */
export const oneHot = ( documents: { example:string, class:string, caseID:number, tokens?:string[] }[]) => {
	// Make a hash of all the tokens with their counts
	let tokenMap: { [key:string]: { token:string, count:number, index:number, caseIDs:number[], weight:number|null } } = {};	// Keeps track of counts of words
	documents.forEach(aDoc=>{
		let tokens = wordTokenizer(aDoc.example);
		tokens.forEach(aToken=>{
			if(!tokenMap[aToken])
				tokenMap[aToken] = {token: aToken, count: 1, index: -1, caseIDs: [], weight: null};
			else
				tokenMap[aToken].count++;
			tokenMap[aToken].caseIDs.push( aDoc.caseID);
		});
		aDoc.tokens = tokens;
	});
	// Convert tokenMap to an array and sort descending
	let tokenArray = Object.values( tokenMap).sort((aToken1, aToken2)=>{
		return aToken2.count - aToken1.count;
	});
	// Only include tokens with a count above specified threshold
	let tIndexFirstBelowThreshold = -1,
			tThreshold = SQConstants.featureCountThreshold;
	while( tIndexFirstBelowThreshold < 0 && tThreshold > 0) {
		tIndexFirstBelowThreshold = tokenArray.findIndex((aToken) => {
			return aToken.count <= tThreshold;
		});
		tThreshold--;
	}
	if( tIndexFirstBelowThreshold < 0)	// There were no very frequent tokens
		tIndexFirstBelowThreshold = tokenArray.length;
	tokenArray.length = Math.min(tIndexFirstBelowThreshold, tokenArray.length, kMaxTokens);
	const kVectorLength = tokenArray.length;
	// Assign each token an index given its position in the array
	tokenArray.forEach((aToken, iIndex) => {
		aToken.index = iIndex;
	});
	// Delete the unneeded tokens from tokenMap
	Object.keys(tokenMap).forEach((aKey)=>{
		if( tokenMap[aKey].index === -1)
			delete  tokenMap[aKey];
	});
	// Create an array of one-hot vectors corresponding to the original document examples
	let oneHotArray: { oneHotExample:number[], class:string }[] = documents.map(aDoc=>{
		let tVector:number[] = Array(kVectorLength).fill(0);
		wordTokenizer(aDoc.example).forEach(aWord=>{
			if(tokenMap[aWord]) {
				let tWordIndex = tokenMap[aWord].index;
				if (tWordIndex >= 0 && tWordIndex < kVectorLength)
					tVector[tWordIndex] = 1;
			}
		});
		return { oneHotExample: tVector, class: aDoc.class };
	});
	return {
		oneHotResult: oneHotArray,
		tokenMap: tokenMap,
		tokenArray: tokenArray
	};
};


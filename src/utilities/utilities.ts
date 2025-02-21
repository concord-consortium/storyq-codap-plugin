import { Descendant } from "@concord-consortium/slate-editor";
import { allTokenizer } from "../lib/one_hot";
import { SQ } from "../lists/lists";
import { ITextPart } from "../stores/store_types_and_constants";
import { featureStore } from "../stores/feature_store";

export type HighlightFunction =
	(iText: string, iSelectedWords: (string | number)[], iSpecialFeatures: string[]) => Descendant[];

/**
 *
 * @param {string} iText - the string to be converted to an RTE object with highlighted words
 * @param iSelectedWords - an array of the words to be highlighted
 * @param iSpecialFeatures - an array of features that don't appear in the text but may appear in iSelectedWords
 */
export function textToObject(iText: string, iSelectedWords: (string | number)[], iSpecialFeatures: string[]) {
	let segment = '';
	let tResultArray: Descendant[] = [];
	iSpecialFeatures.forEach(iFeature => {
		if (iSelectedWords.indexOf(iFeature) >= 0)
			tResultArray.push({
				text: `<${iFeature}> `, bold: true, underlined: true, color: "#0432ff"
			});
	});

	// NOTE: this code isn't perfect and doesn't match phrases or match lists like personal pronoun lists
	const words = allTokenizer(iText);
	words.forEach((iWord) => {
		let tRawWord = iWord.toLowerCase();
		const containedWords = iSelectedWords.map(selectedWord => {
			// Strip out the word from strings like 'contain: "word"' and 'count: "word"'
			const _containedWord = typeof selectedWord === "string" && selectedWord.match(/contain: "([^"]+)"/);
			const _countWord = typeof selectedWord === "string" && selectedWord.match(/count: "([^"]+)"/);
			const containedWord = _containedWord ? _containedWord[1]
				: _countWord ? _countWord[1]
				: selectedWord;
			return typeof containedWord === "string" ? containedWord.toLowerCase() : containedWord;
		})

		if (containedWords.indexOf(tRawWord) >= 0) {
			if (segment !== '') {
				tResultArray.push({
					text: segment
				});
				segment = '';
			}
			tResultArray.push({
				text: iWord, bold: true, underlined: true, color: "#000000"
			});
		}
		else {
			segment += iWord;
		}
	});

	if (segment !== '') tResultArray.push({ text: segment });

	return tResultArray;
}

// Highlighting for the modern internal text pane
// NOTE: this code isn't perfect and doesn't match lists like personal pronoun lists
export async function highlightFeatures(text: string, selectedFeatures: (string | number)[]) {
	let segment = '';
	const textParts: ITextPart[] = [];
	const addSegment = () => {
		if (segment !== '') {
			textParts.push({ text: segment });
			segment = '';
		}
	};
	const highlightWord = (word: string) => {
		addSegment();
		textParts.push({
			text: word, classNames: ["highlighted"]
		});
	};

	// Get pieces of text
	const words = allTokenizer(text);

	// Process features
	const targetWords: string[] = [];
	const targetPhrases: string[][] = [];
	for (const selectedWord of selectedFeatures) {
		if (typeof selectedWord === "string") {
			// Strip out the word from strings like 'contain: "word"' and 'count: "word"'
			const _containWord = selectedWord.match(/contain: "([^"]+)"/);
			const _countWord = selectedWord.match(/count: "([^"]+)"/);
			const singleWord = _containWord ? _containWord[1]
				: _countWord ? _countWord[1]
				: selectedWord;

			// Check to see if the feature references a list
			const containList = !_containWord && selectedWord.match(/^contain:\s+([^"\s].*[^"\s]|\S)$/);
			const countList = !_countWord && selectedWord.match(/^count:\s+([^"\s].*[^"\s]|\S)$/);
			const list =
				(containList && (SQ.lists[containList[1]] ?? await featureStore.getWordListFromDatasetName(containList[1])))
				|| (countList && (SQ.lists[countList[1]] ?? await featureStore.getWordListFromDatasetName(countList[1])));
			const finalList = list || [singleWord];

			// Add all relevant words and phrases
			finalList.forEach((containedWord: string) => {
				const containedPhrase = allTokenizer(containedWord);
				// If a word contains multiple parts, treat it as a phrase.
				if (containedPhrase.length > 1) {
					targetPhrases.push(containedPhrase.map(word => word.toLowerCase()));
				// Otherwise treat it as a single word.
				} else {
					targetWords.push(containedWord.toLowerCase());
				}
			});
		}
	}

	// Look through text looking for feature matches
	let phraseWords = 0;
	words.forEach((word, index) => {
		// If this word is part of a phrase that was previously found, skip it.
		if (phraseWords > 0) {
			phraseWords--;
			return;
		}

		let foundMatch = false;

		// Look for matches with phrases.
		targetPhrases.forEach(phrase => {
			if (foundMatch) return;

			let phraseMatch = true;
			const phraseParts: string[] = [];
			phrase.forEach((phraseWord, phraseIndex) => {
				if (!phraseMatch) return;

				const reviewWord = words[index + phraseIndex];
				if (reviewWord.toLowerCase() === phraseWord) {
					phraseParts.push(reviewWord);
				} else {
					phraseMatch = false;
				}
				if (phraseMatch && phraseIndex >= phrase.length - 1) {
					foundMatch = true;
					phraseWords = phrase.length - 1; // Skip the rest of the words in the phrase.
					highlightWord(phraseParts.join(""));
				}
			});
		});

		// Look for matches with single words.
		if (!foundMatch && targetWords.includes(word.toLowerCase())) {
			foundMatch = true;
			highlightWord(word);
		}

		// If it's not a match, add it to the current segment with basic text.
		if (!foundMatch) {
			segment += word;
		}
	});

	// Add the final segment, if there is one.
	addSegment();

	return textParts;
}

/**
 *
 * @param {string} iPhrase - the string to be converted to an RTE object with highlighted words
 * @param iFeatures {Set} of feature words to be hilighted
 * @param iSpecialFeatures {string[]} These are typically attribute names for column features
 */
export function phraseToFeatures(iPhrase:string, iFeatures: (string | number)[], iSpecialFeatures: string[]) {
	let tResultArray: Descendant[] = [];
	if (iPhrase) {
		// First prepend any special features that are given as regular features
		iSpecialFeatures.forEach(iFeature => {
			if (iFeatures.indexOf(iFeature) >= 0)
				tResultArray.push({
					text: `<${iFeature}> `, bold: true, underlined: true
				});
		});
		let words: RegExpMatchArray | [] = iPhrase.match(/[^ ]+/g) || [];
		words.forEach((iWord) => {
			let tRawWordArray = iWord.match(/\w+/),
				tRawWord = (tRawWordArray && tRawWordArray.length > 0 ? tRawWordArray[0] : '').toLowerCase();
			if (iFeatures.indexOf(tRawWord) >= 0) {
				tResultArray.push({
					text: iWord, bold: true, underlined: true
				});
			} else {
				tResultArray.push({
					text: iWord, color: "#888888"
				});
			}
			tResultArray.push({
				text: ' '
			})
		})
	}
	return tResultArray;
}

/**
 *
 * @param n				number of observations
 * @param bothPos	number both raters rated positive
 * @param bothNeg	number both raters rated negative
 * @param actualPos	number first rater rated positive
 * @param predPos		number second rater rated positive
 */
export function computeKappa(n:number, bothPos:number, bothNeg:number, actualPos:number, predPos:number) {
	let p0 = (bothPos + bothNeg) / n,
		randomBothPos = (actualPos / n) * (predPos / n),
		randomBothNeg = ((n-actualPos)/n)*((n-predPos)/n),
		pE = randomBothPos + randomBothNeg,
		kappa = (p0 - pE) / (1 - pE);
	return {observed: p0, kappa: kappa};
}

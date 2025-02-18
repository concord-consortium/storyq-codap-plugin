import { Descendant } from "@concord-consortium/slate-editor";
import { wordTokenizer } from "../lib/one_hot";

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
	const words = wordTokenizer(iText, false, false);
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
			tResultArray.push({
				text: ' '
			})
		}
		else {
			segment += iWord + ' ';
		}
	});

	if (segment !== '') tResultArray.push({ text: segment });

	return tResultArray;
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

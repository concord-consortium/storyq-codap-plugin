import { allTokenizer } from "../lib/one_hot";
import { SQ } from "../lists/lists";
import { ITextPart, kAnyNumberKeyword, kNumberRegExp } from "../stores/store_types_and_constants";
import { featureStore } from "../stores/feature_store";

// Highlighting for the modern internal text pane
// NOTE: this code isn't perfect and doesn't match lists like personal pronoun lists
export async function highlightFeatures(text: string, selectedFeatures: (string | number)[]) {
	let segment = '';
	const textParts: ITextPart[] = [];
	let highlightNumbers = false;
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
			const _containWord = selectedWord.match(/^contain: "([^"]+)"/);
			const _countWord = selectedWord.match(/^count: "([^"]+)"/);
			let singleWord = _containWord ? _containWord[1]
				: _countWord ? _countWord[1]
				: selectedWord;

			// Check to see if the feature references a list
			const containMatch = !_containWord && selectedWord.match(/^contain:\s+([^"\s].*[^"\s]|\S)$/);
			const countMatch = !_countWord && selectedWord.match(/^count:\s+([^"\s].*[^"\s]|\S)$/);
			const match = containMatch ? containMatch[1] : countMatch ? countMatch[1] : "";
			const list = SQ.lists[match] ?? await featureStore.getWordListFromDatasetName(match);
			if (match && !list) {
				// If we found a match without quotes but didn't find a list, just use the word or phrase,
				// unless it's the all numbers keyword.
				if (match === kAnyNumberKeyword) {
					highlightNumbers = true;
					continue;
				}
				singleWord = match;
			}
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

		// Look for numbers if we care about them.
		if (highlightNumbers && word.match(kNumberRegExp)) {
			foundMatch = true;
			highlightWord(word);
		}

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

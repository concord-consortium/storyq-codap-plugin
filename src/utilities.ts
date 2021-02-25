import {wordTokenizer} from "./lib/one_hot";

/**
 *
 * @param {string} iText - the string to be converted to an RTE object with highlighted words
 * @param iSelectedWords - an array of the words to be highlighted
 */
export function textToObject( iText:string, iSelectedWords:any):any {
	let segment = '';
	let tResultArray:any = [];
	let words:string[] = wordTokenizer(iText, false);
	words.forEach((iWord) => {
		let tRawWord = iWord.toLowerCase();
		if (iSelectedWords.indexOf(tRawWord) >= 0) {
			if (segment !== '') {
				tResultArray.push({
					text: segment
				});
				segment = '';
			}
			tResultArray.push({
				text: iWord, bold: true, underlined: true, color: "#0432ff"
			});
			tResultArray.push({
				text: ' '
			})
		}
		else {
			segment += iWord + ' ';
		}
	});
	if( segment !== '')
		tResultArray.push({ text: segment });
	return tResultArray;
}

/**
 *
 * @param {string} iPhrase - the string to be converted to an RTE object with highlighted words
 * @param iFeatures {Set} of feature words to be hilighted
 */
export function phraseToFeatures( iPhrase:string, iFeatures:string[]):any {
	let tResultArray:any = [];
	let words:RegExpMatchArray | [] = iPhrase.match(/[^ ]+/g) || [];
	words.forEach((iWord) => {
		let tRawWordArray = iWord.match(/\w+/),
			tRawWord = (tRawWordArray && tRawWordArray.length > 0 ? tRawWordArray[0] : '').toLowerCase();
		if (iFeatures.indexOf(tRawWord) >= 0) {
			tResultArray.push({
				text: iWord, bold: true, underlined: true
			});
		}
		else {
			tResultArray.push({
				text: iWord, color: "#888888"
			});
		}
		tResultArray.push({
			text: ' '
		})
	});
	return tResultArray;
}
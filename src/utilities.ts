/**
 *
 * @param {string} iText - the string to be converted to an RTE object with highlighted words
 * @param iSelectedWords - an array of the words to be highlighted
 */
export function textToObject( iText:string, iSelectedWords:any):any {
	let segment = '';
	let tResultArray:any = [];
	let words:RegExpMatchArray | [] = iText.match(/[^ ]+/g) || [];
	words.forEach((iWord) => {
		let tRawWordArray = iWord.match(/\w+/),
			tRawWord = (tRawWordArray && tRawWordArray.length > 0 ? tRawWordArray[0] : '').toLowerCase();
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
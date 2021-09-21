/**
 * Utility for use in constructing headings to show in text component for each kind of statement.
 */

export interface PhraseTriple {
	actual:string, predicted:string, phrase:string
}
export interface ClassLabel { negLabel: string, posLabel: string, blankLabel:string}
export interface HeadingSpec {negNeg:any, negPos:any, blankNeg:any, posNeg:any, posPos:any, blankPos:any}

export class HeadingsManager {


	public classLabels: ClassLabel = { negLabel: '', posLabel: '', blankLabel: ''};
	public headings:HeadingSpec = {negNeg:null, negPos: null, blankNeg: null,
		posNeg: null, posPos: null, blankPos: null};
	public colors = {green: '#04ab04', red: '#ca0303', blue: '#0000ff', orange: '#ff7700'}

	public setupHeadings(iNegLabel:string, iPosLabel:string, iBlankLabel:string,
											 iActual:string | null, iPredicted:string | null) {
		function fillInHeading( iFirst:string | null, iSecond:string, iColor:string) {
			let tFirstPhrase = !iFirst ? '{},{},' : `
				{
					"text": "${iActual} = ",
					"color": "${iColor}",
					"italic": true
				},
				{
					"text": "${iFirst}",
					"color": "${iColor}",
					"italic": true,
					"bold": true
				}, 
				{
					"text": ", "
				}, 
			`,
				tSecondPhrase = `
					{
						"text": "${iPredicted} = ",
						"color": "${iColor}",
						"italic": true
					},
					{
						"text": "${iSecond}",
						"color": "${iColor}",
						"italic": true,
						"bold": true
					}
				`,
				tHeading = `{
        "type": "paragraph",
        "children": [${tFirstPhrase}${tSecondPhrase}]
      }`;
			return JSON.parse( tHeading);
		}
		this.classLabels = {
			negLabel: iNegLabel,
			posLabel: iPosLabel,
			blankLabel: iBlankLabel
		};
		iPredicted = iPredicted === null ? 'Predicted' : iPredicted;
		this.headings = {
			negNeg: fillInHeading(iNegLabel, iNegLabel, this.colors.green),
			negPos: fillInHeading(iNegLabel, iPosLabel, this.colors.red),
			posNeg: fillInHeading(iPosLabel, iNegLabel, this.colors.red),
			posPos: fillInHeading(iPosLabel, iPosLabel, this.colors.green),
			blankNeg: fillInHeading(null, iNegLabel, this.colors.orange),
			blankPos: fillInHeading(null, iPosLabel, this.colors.blue),
		}
	}

}


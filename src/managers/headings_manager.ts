/**
 * Utility for use in constructing headings to show in text component for each kind of statement.
 */

export interface PhraseQuadruple {
	actual:string, predicted:string, phrase:string, nonNtigramFeatures:(string | number)[]
}
export interface ClassLabel { negLabel: string, posLabel: string, blankLabel:string}
export interface HeadingSpec {negNeg:any, negPos:any, negBlank:any, blankNeg:any, posNeg:any, posPos:any, posBlank:any, blankPos:any, blankBlank:any}

// TODO Make this a mobx class that doesn't need to be setup
export class HeadingsManager {
	public classLabels: ClassLabel = { negLabel: '', posLabel: '', blankLabel: '' };
	public headings:HeadingSpec = { negNeg: null, negPos: null, negBlank: null, blankNeg: null,
		posNeg: null, posPos: null, posBlank: null, blankPos: null, blankBlank:null };
	public colors = { green: '#1aff1a', red: '#4b0092', blue: '#0000ff', orange: '#ff7700' }

	public setupHeadings(iNegLabel: string, iPosLabel: string, iBlankLabel: string,
											 iActual: string | null, iPredicted: string | null) {
		function fillInHeading(iFirst: string | null, iSecond: string | null, iColor: string) {
			const children = []
			if (iFirst) {
				children.push({
					text: `${iActual} =`,
					color: iColor,
					italic: true
				})
				children.push({
					text: iFirst,
					color: iColor,
					italic: true,
					bold: true
				})
				children.push({ text: ", " })
			}
			if (iSecond) {
				children.push({
					text: `${iPredicted} = `,
					color: iColor,
					italic: true
				})
				children.push({
					text: iSecond,
					color: iColor,
					italic: true,
					bold: true
				})
			}
			if (children.length === 0) children.push({ text: "" })
			return {
				type: "paragraph",
				children
			}
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
			negBlank: fillInHeading(iNegLabel, null, this.colors.red),
			posNeg: fillInHeading(iPosLabel, iNegLabel, this.colors.red),
			posPos: fillInHeading(iPosLabel, iPosLabel, this.colors.green),
			posBlank: fillInHeading(iPosLabel, null, this.colors.green),
			blankNeg: fillInHeading(null, iNegLabel, this.colors.orange),
			blankPos: fillInHeading(null, iPosLabel, this.colors.blue),
			blankBlank: { text: "" }
		}
	}

}


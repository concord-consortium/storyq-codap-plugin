export interface PhraseTriple {
	actual:string, predicted:string, phrase:string
}
export interface ClassLabel { negLabel: string, posLabel: string};
export interface HeadingSpec {negNeg:any, negPos:any, posNeg:any, posPos:any};

export class HeadingsManager {


	public classLabels: ClassLabel;
	public headings:HeadingSpec;

	constructor(iNegLabel:string, iPosLabel:string, iActual:string | null, iPredicted:string | null) {

		function fillInHeading( iFirst:string, iSecond:string) {
			let tHeading = `{
        "type": "paragraph",
        "children": [
          {
            "text": "${iActual} = ",
            "italic": true
          },
          {
            "text": "${iFirst}",
            "italic": true,
            "bold": true
          },
          {
            "text": ", ${iPredicted} = ",
            "italic": true
          },
          {
            "text": "${iSecond}",
            "italic": true,
            "bold": true
          }
        ]
      }`;
			return JSON.parse( tHeading);
		}
		this.classLabels = {
			negLabel: iNegLabel,
			posLabel: iPosLabel
		};
		iActual = iActual === null ? 'Actual' : iActual;
		iPredicted = iPredicted === null ? 'Predicted' : iPredicted;
		this.headings = {
			negNeg: fillInHeading(iNegLabel, iNegLabel),
			negPos: fillInHeading(iNegLabel, iPosLabel),
			posNeg: fillInHeading(iPosLabel, iNegLabel),
			posPos: fillInHeading(iPosLabel, iPosLabel),
		}
	}

}


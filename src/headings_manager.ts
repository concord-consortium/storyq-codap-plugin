export interface PhraseTriple {
	actual:string, predicted:string, phrase:string
}
export interface ClassLabel { negLabel: string, posLabel: string};
export interface HeadingSpec {negNeg:any, negPos:any, posNeg:any, posPos:any};

export class HeadingsManager {


	public classLabels: ClassLabel;
	public headings:HeadingSpec;
	public colors = {green: '#04ab04', red: '#ca0303'}

	constructor(iNegLabel:string, iPosLabel:string, iActual:string | null, iPredicted:string | null) {

		function fillInHeading( iFirst:string, iSecond:string, iColor:string) {
			let tHeading = `{
        "type": "paragraph",
        "children": [
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
            "text": ", ${iPredicted} = ",
            "color": "${iColor}",
            "italic": true
          },
          {
            "text": "${iSecond}",
            "color": "${iColor}",
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
			negNeg: fillInHeading(iNegLabel, iNegLabel, this.colors.green),
			negPos: fillInHeading(iNegLabel, iPosLabel, this.colors.red),
			posNeg: fillInHeading(iPosLabel, iNegLabel, this.colors.red),
			posPos: fillInHeading(iPosLabel, iPosLabel, this.colors.green),
		}
	}

}


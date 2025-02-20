/**
 * Utility for use in constructing headings to show in text component for each kind of statement.
 */

import { Descendant } from "@concord-consortium/slate-editor";
import { ITextSectionTitle } from "../stores/store_types_and_constants";

export interface PhraseQuadruple {
	actual: string, predicted: string, phrase: string, nonNtigramFeatures: (string | number)[], index?: number
}
export interface ClassLabel { negLabel: string, posLabel: string, blankLabel: string}
export interface HeadingSpec {
	negNeg: Descendant, negPos: Descendant, negBlank: Descendant, blankNeg: Descendant, posNeg: Descendant,
	posPos: Descendant, posBlank: Descendant, blankPos: Descendant, blankBlank: Descendant
}

// TODO Make this a mobx class that doesn't need to be setup
export class HeadingsManager {
	public classLabels: ClassLabel = { negLabel: '', posLabel: '', blankLabel: '' };
	public headings:HeadingSpec = {
		negNeg: { text: "" }, negPos: { text: "" }, negBlank: { text: "" }, blankNeg: { text: "" }, posNeg: { text: "" },
		posPos: { text: "" }, posBlank: { text: "" }, blankPos: { text: "" }, blankBlank: { text: "" }
	};
	public niceHeadings: Record<string, ITextSectionTitle> = {};
	public colors = { green: '#1aff1a', red: '#4b0092', blue: '#0000ff', orange: '#ff7700' }

	getHeading(headingCode: string) {
		switch (headingCode) {
			case "negNeg": return this.headings.negNeg;
			case "negPos": return this.headings.negPos;
			case "negBlank": return this.headings.negBlank;
			case "blankNeg": return this.headings.blankNeg;
			case "posNeg": return this.headings.posNeg;
			case "posPos": return this.headings.posPos;
			case "posBlank": return this.headings.posBlank;
			case "blankPos": return this.headings.blankPos;
			case "blankBlank": return this.headings.blankBlank;
			default: return { text: "" };
		}
	}

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
		this.niceHeadings = {
			negNeg: { actual: iNegLabel, predicted: iNegLabel, color: this.colors.green },
			negPos: { actual: iNegLabel, predicted: iPosLabel, color: this.colors.red },
			negBlank: { actual: iNegLabel, color: "#5885e1" },
			posNeg: { actual: iPosLabel, predicted: iNegLabel, color: this.colors.red },
			posPos: { actual: iPosLabel, predicted: iPosLabel, color: this.colors.green },
			posBlank: { actual: iPosLabel, color: "#dd9e5a" },
			blankNeg: { predicted: iNegLabel, color: this.colors.orange },
			blankPos: { predicted: iPosLabel, color: this.colors.blue }
		}
	}
}

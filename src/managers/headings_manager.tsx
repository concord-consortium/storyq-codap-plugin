/**
 * Utility for use in constructing headings to show in text component for each kind of statement.
 */

import { FeatureOrToken, ITextSectionTitle } from "../stores/store_types_and_constants";

export interface NonNtigramFeature {
	word: (string | number),
	feature: FeatureOrToken
}
export interface PhraseQuadruple {
	actual: string,
	predicted: string,
	phrase: string,
	nonNtigramFeatures: NonNtigramFeature[],
	index?: number
}
export interface ClassLabel { negLabel: string, posLabel: string, blankLabel: string}

// TODO Make this a mobx class that doesn't need to be setup
export class HeadingsManager {
	public classLabels: ClassLabel = { negLabel: '', posLabel: '', blankLabel: '' };
	public niceHeadings: Record<string, ITextSectionTitle> = {};
	public colors = {
		green: '#1aff1a',
		red: '#4b0092',
		blue: '#0000ff',
		orange: '#ff7700',
		positiveOrange: '#e45b00',
		negativeBlue: '#0066ff'
	};

	public setupHeadings(iNegLabel: string, iPosLabel: string, iBlankLabel: string) {
		this.classLabels = {
			negLabel: iNegLabel,
			posLabel: iPosLabel,
			blankLabel: iBlankLabel
		};
		this.niceHeadings = {
			negNeg: { actual: iNegLabel, predicted: iNegLabel, color: this.colors.green },
			negPos: { actual: iNegLabel, predicted: iPosLabel, color: this.colors.red },
			negBlank: { actual: iNegLabel, color: this.colors.negativeBlue },
			posNeg: { actual: iPosLabel, predicted: iNegLabel, color: this.colors.red },
			posPos: { actual: iPosLabel, predicted: iPosLabel, color: this.colors.green },
			posBlank: { actual: iPosLabel, color: this.colors.positiveOrange },
			blankNeg: { predicted: iNegLabel, color: this.colors.orange },
			blankPos: { predicted: iPosLabel, color: this.colors.blue }
		}
	}
}

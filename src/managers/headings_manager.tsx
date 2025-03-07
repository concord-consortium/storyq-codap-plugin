/**
 * Utility for use in constructing headings to show in text component for each kind of statement.
 */

import { makeAutoObservable } from "mobx";
import { FeatureOrToken, ITextSectionTitle } from "../stores/store_types_and_constants";
import { targetStore } from "../stores/target_store";

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

export class HeadingsManager {
	public colors = {
		green: '#1aff1a',
		red: '#4b0092',
		blue: '#0000ff',
		orange: '#ff7700',
		positiveOrange: '#e45b00',
		negativeBlue: '#0066ff'
	};

	constructor() {
		makeAutoObservable(this);
	}

	get classLabels(): ClassLabel {
		return {
			negLabel: targetStore.negativeClassName,
			posLabel: targetStore.positiveClassName,
			blankLabel: ""
		};
	}

	get headings(): Record<string, ITextSectionTitle> {
		const { positiveClassName, negativeClassName } = targetStore;
		return {
			negNeg: { actual: negativeClassName, predicted: negativeClassName, color: this.colors.green },
			negPos: { actual: negativeClassName, predicted: positiveClassName, color: this.colors.red },
			negBlank: { actual: negativeClassName, color: this.colors.negativeBlue },
			posNeg: { actual: positiveClassName, predicted: negativeClassName, color: this.colors.red },
			posPos: { actual: positiveClassName, predicted: positiveClassName, color: this.colors.green },
			posBlank: { actual: positiveClassName, color: this.colors.positiveOrange },
			blankNeg: { predicted: negativeClassName, color: this.colors.orange },
			blankPos: { predicted: positiveClassName, color: this.colors.blue }
		};
	}
}

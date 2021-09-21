/**
 * The FeatureConstructorBridge serves as a bridge between the FeatureConstructor and the FeaturePanel.
 * The former passes newly constructed features to the FeatureConstructorBridge and the latter requests
 * them in order to display the list of them.
 */

export interface ContainsDetails {
	containsOption: string,
	kindOption: string,
	caseOption: string,
	freeFormText:string,
	wordList:WordListSpec
}

export interface CountDetails {
	what: string
}

export interface FeatureDetails {
	kind: string,
	details: ContainsDetails | CountDetails
}

export interface ConstructedFeature {
	name: string, chosen: boolean,
	info: FeatureDetails,
	description: string
}

export interface WordListSpec {
	datasetName:string, firstAttributeName:string
}

export default class FeatureConstructorBridge {
	
	private constructedFeaturesList:ConstructedFeature[] = [];
	private newFeatureAddedCallback:(iFeature:ConstructedFeature)=>{};

	constructor(iNewFeatureAddedCallback:any) {
		this.newFeatureAddedCallback = iNewFeatureAddedCallback;
	}
	
	public addConstructedFeature( iFeature:ConstructedFeature) {
		iFeature.description = this.getDescriptionFor(iFeature);
		this.constructedFeaturesList.push(iFeature);
		this.newFeatureAddedCallback(iFeature);
	}
	
	public getConstructedFeaturesList():any[] {
		return this.constructedFeaturesList;
	}

	private getDescriptionFor(iFeature:ConstructedFeature) {
		const tDetails = iFeature.info.details as ContainsDetails,
					tFirstPart = `${tDetails.containsOption} ${tDetails.kindOption}`,
					tSecondPart = tDetails.freeFormText !== '' ? `"${tDetails.freeFormText}"` : '',
					tThirdPart = tDetails.wordList && tDetails.wordList.datasetName !== '' ?
							` of ${tDetails.wordList.datasetName}` : '';
		return `${tFirstPart} ${tSecondPart}${tThirdPart}`
	}

	public restoreFromStorage( iStorage: ConstructedFeature[]) {
		this.constructedFeaturesList = iStorage || [];
	}

	createStorage():ConstructedFeature[] {
		return this.constructedFeaturesList;
	}

}


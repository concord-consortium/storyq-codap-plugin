/**
 * The TestingManager uses information in the domain store to classify texts in a user-chosen dataset
 */
import {DomainStore} from "../stores/domain_store";
import {attributeExists, deselectAllCasesIn} from "../lib/codap-helper";
import codapInterface from "../lib/CodapInterface";

export class TestingManager {

	domainStore: DomainStore

	constructor(iDomainStore: DomainStore) {
		this.domainStore = iDomainStore
	}

	async classify() {
		const
			tTestingDatasetName = this.domainStore.testingStore.testingDatasetInfo.name,
			tTestingCollectionName = this.domainStore.testingStore.testingCollectionName,
/*
			tChosenModelName = this.domainStore.testingStore.chosenModelName,
			// todo: We're assuming just one model here
			tChosenModel = this.domainStore.trainingStore.model,
			tTestingAttributeName = this.domainStore.testingStore.testingAttributeName,
*/
			tFeatures = this.domainStore.featureStore.features

		async function installFeatureAttributes() {
			const tAttributeRequests: object[] = []
			tFeatures.forEach(async (iFeature) => {
				if (iFeature.formula !== '' && await !attributeExists(tTestingDatasetName, tTestingCollectionName, iFeature.name)) {
					tAttributeRequests.push({
						name: iFeature.name,
						title: iFeature.name,
						formula: iFeature.formula
					})
				}
				await codapInterface.sendRequest({
					action: 'create',
					resource: `dataContext[${tTestingDatasetName}].collection[${tTestingCollectionName}].attribute`,
					values: tAttributeRequests
				})
			})
		}

		await deselectAllCasesIn(tTestingDatasetName);
		installFeatureAttributes()
	}

}


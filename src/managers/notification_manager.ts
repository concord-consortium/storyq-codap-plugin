/**
 * The NotificationManager is created at startup and handles notifications from CODAP that must be received and
 * handled regardless of which components have been created and initialized.
 * Notifications that apply only to a specific component are handled in that component.
 */

import codapInterface, {CODAP_Notification} from "../lib/CodapInterface";
import {DomainStore} from "../stores/domain_store";
import {action} from "mobx";
import {starterFeature} from "../stores/store_types_and_constants";

export default class NotificationManager {

	domainStore: DomainStore

	constructor(iDomainStore: DomainStore) {
		this.domainStore = iDomainStore;
		this.handleDataContextChange = this.handleDataContextChange.bind(this)
		this.handleAttributesChange = this.handleAttributesChange.bind(this)
		this.handleDeleteFeatureCase = this.handleDeleteFeatureCase.bind(this)
		this.handleUpdateFeatureCase = this.handleUpdateFeatureCase.bind(this)
		codapInterface.on('notify', '*', 'dataContextCountChanged', this.handleDataContextChange);
		codapInterface.on('notify', '*', 'createCases', this.handleDataContextChange);
		codapInterface.on('notify', '*', 'titleChange', this.handleDataContextChange);
		codapInterface.on('notify', '*', 'createAttributes', this.handleAttributesChange);
		codapInterface.on('notify', '*', 'deleteAttributes', this.handleAttributesChange);
		codapInterface.on('notify', '*', 'updateAttributes', this.handleAttributesChange);
		codapInterface.on('notify', '*', 'deleteCases', this.handleDeleteFeatureCase);
		codapInterface.on('notify', '*', 'updateCases', this.handleUpdateFeatureCase);
	}

	async handleDataContextChange(/*iNotification: CODAP_Notification*/) {
		action(async () => {
			console.log(`ooo handleDataContextChange`);
			await this.domainStore.featureStore.updateWordListSpecs()
			await this.domainStore.targetStore.updateFromCODAP()
		})()
	}

	async handleAttributesChange(/*iNotification: CODAP_Notification*/) {
		action(async () => {
			action(() => {
				this.domainStore.featureStore.featureUnderConstruction = Object.assign({}, starterFeature)
			})()
		})()
		await this.handleDataContextChange()
	}

	handleDeleteFeatureCase(iNotification: CODAP_Notification) {
		const tFeatureStore = this.domainStore.featureStore,
			tFeatures = tFeatureStore.features,
			tDataContextName = iNotification.resource && iNotification.resource.match(/\[(.+)]/)[1],
			tCases = iNotification.values.result.cases,
			tDeletedFeatureNames = Array.isArray(tCases) ? tCases.map((iCase: any) => {
				return iCase.values.name
			}) : []
		if (tDeletedFeatureNames.length > 0 && tDataContextName === tFeatureStore.featureDatasetInfo.datasetName) {
			action(() => {
				tDeletedFeatureNames.forEach((iName: string) => {
					const tIndex = tFeatures.findIndex(iFeature => iFeature.name === iName && iFeature.type !== 'unigram')
					if (tIndex >= 0)
						tFeatureStore.deleteFeature(tFeatures[tIndex])
				})
			})()
		}
	}

	handleUpdateFeatureCase(iNotification: CODAP_Notification) {
		const tFeatureStore = this.domainStore.featureStore,
			tFeatures = tFeatureStore.features,
			tDataContextName = iNotification.resource && iNotification.resource.match(/\[(.+)]/)[1]
		if (tDataContextName === tFeatureStore.featureDatasetInfo.datasetName) {
			const tCases = iNotification.values.result.cases,
				tUpdatedCases = Array.isArray(tCases) ? tCases : []
			if (tUpdatedCases.length > 0) {
				action(() => {
					tUpdatedCases.forEach((iCase: any) => {
						const tChosen = iCase.values.chosen === 'true',
							tType = iCase.values.type,
							tName = iCase.values.name,
							tFoundFeature = tType !== 'unigram' && tFeatures.find(iFeature => iFeature.name === tName)
						if (tFoundFeature) {
							tFoundFeature.chosen = tChosen
						} else if (tType === 'unigram') {
							const tToken = tFeatureStore.tokenMap[tName]
							if( tToken && !tChosen) {
								delete tFeatureStore.tokenMap[tName]
							} else if(!tToken && tChosen) {
								tFeatureStore.tokenMap[tName] = {
									token: tName,
									type: 'unigram',
									count: iCase.values['frequency in positive'] + iCase.values['frequency in negative'],
									index: 0,
									numPositive: iCase.values['frequency in positive'],
									numNegative: iCase.values['frequency in negative'],
									caseIDs: JSON.parse(iCase.values.usages),
									weight: null,
									featureCaseID: iCase.id
								}
							}
						}
					})
				})()
			}
		}
	}

}


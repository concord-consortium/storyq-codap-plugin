/**
 * The NotificationManager is created at startup and handles notifications from CODAP that must be received and
 * handled regardless of which components have been created and initialized.
 * Notifications that apply only to a specific component are handled in that component.
 */

import {action} from "mobx";
import codapInterface, {CODAP_Notification} from "../lib/CodapInterface";
import { featureStore } from "../stores/feature_store";
import { kFeatureTypeUnigram, kTokenTypeUnigram } from "../stores/store_types_and_constants";
import { targetStore } from "../stores/target_store";
import { getFeatureColor } from "../utilities/color-utils";

export class NotificationManager {
	updatingStores = false

	constructor() {
		this.handleDataContextChange = this.handleDataContextChange.bind(this)
		this.handleAttributesChange = this.handleAttributesChange.bind(this)
		this.handleDeleteFeatureCase = this.handleDeleteFeatureCase.bind(this)
		this.handleUpdateFeatureCase = this.handleUpdateFeatureCase.bind(this)
		codapInterface.on('notify', '*', 'dataContextCountChanged', this.handleDataContextChange);
		codapInterface.on('notify', '*', 'updateDataContext', this.handleDataContextChange);
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
			if (!this.updatingStores) {
				this.updatingStores = true;
				try {
					await featureStore.updateWordListSpecs()
					await targetStore.updateFromCODAP()
				} catch (e) {
					console.log(`Unable to update feature or target store because`, e);
				} finally {
					this.updatingStores = false;
				}
			}
		})()
	}

	async handleAttributesChange(/*iNotification: CODAP_Notification*/) {
		featureStore.startConstructingFeature();
		await this.handleDataContextChange();
	}

	handleDeleteFeatureCase(iNotification: CODAP_Notification) {
		const { features } = featureStore,
			tDataContextName = iNotification.resource && iNotification.resource.match(/\[(.+)]/)?.[1],
			{ values } = iNotification,
			tCases = Array.isArray(values) ? values[0].result.cases : values.result.cases,
			tDeletedFeatureNames = tCases && Array.isArray(tCases) ? tCases.map(iCase => String(iCase.values.name)) : [];
		if (tDeletedFeatureNames.length > 0 && tDataContextName === featureStore.featureDatasetInfo.datasetName) {
			action(() => {
				tDeletedFeatureNames.forEach((iName: string) => {
					const tIndex =
						features.findIndex(iFeature => iFeature.name === iName && iFeature.type !== kFeatureTypeUnigram);
					if (tIndex >= 0) featureStore.deleteFeature(features[tIndex]);
				});
			})();
		}
	}

	handleUpdateFeatureCase(iNotification: CODAP_Notification) {
		const { features } = featureStore,
			tDataContextName = iNotification.resource && iNotification.resource.match(/\[(.+)]/)?.[1];
		if (tDataContextName === featureStore.featureDatasetInfo.datasetName) {
			const { values } = iNotification;
			const tCases = Array.isArray(values) ? values[0].result.cases : values.result.cases,
				tUpdatedCases = Array.isArray(tCases) ? tCases : [];
			if (tUpdatedCases.length > 0) {
				action(() => {
					tUpdatedCases.forEach(iCase => {
						const tChosen = iCase.values.chosen === 'true';
						const highlight = iCase.values.highlight === "true";
						const tType = iCase.values.type;
						const tName = String(iCase.values.name);
						const tFoundFeature = tType !== kTokenTypeUnigram && features.find(iFeature => iFeature.name === tName);
						if (tFoundFeature) {
							tFoundFeature.chosen = tChosen;
							tFoundFeature.highlight = highlight;
							tFoundFeature.color = String(iCase.values.color);
						} else if (tType === kTokenTypeUnigram) {
							const tToken = featureStore.tokenMap[tName];
							if (tToken) {
								tToken.highlight = highlight;
								tToken.color = String(iCase.values.color);
							}
							if (tToken && !tChosen) {
								featureStore.deleteToken(tName);
							} else if (!tToken && tChosen) {
								featureStore.addToken(tName, {
									token: tName,
									type: kTokenTypeUnigram,
									count: Number(iCase.values['frequency in positive']) + Number(iCase.values['frequency in negative']),
									index: 0,
									color: getFeatureColor(),
									highlight: true,
									numPositive: Number(iCase.values['frequency in positive']),
									numNegative: Number(iCase.values['frequency in negative']),
									caseIDs: JSON.parse(String(iCase.values.usages)),
									weight: null,
									featureCaseID: iCase.id
								});
							}
						}
					});
				})();
			}
		}
	}
}

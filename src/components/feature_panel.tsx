/**
 * This component provides the space for a user to construct and edit features
 */

import React, {Component} from "react";
import {DomainStore} from "../stores/domain_store";
import {observer} from "mobx-react";
import {UiStore} from "../stores/ui_store";
import {TargetInfoPane} from "./target_info_pane";
import {FeaturePane} from "./feature_pane";
import codapInterface, {CODAP_Notification} from "../lib/CodapInterface";
import {action} from "mobx";

interface FeaturePanelState {
	count: number,
}

interface FeaturePanelInfo {
	subscriberIndex: number
}

export interface Feature_Props {
	uiStore: UiStore
	domainStore: DomainStore
}

export const FeaturePanel = observer(class FeaturePanel extends Component<Feature_Props, FeaturePanelState> {

	private featurePanelInfo: FeaturePanelInfo;

	constructor(props: any) {
		super(props);
		this.state = {
			count: 0
		};
		this.featurePanelInfo = {subscriberIndex: -1}
		this.handleNotification = this.handleNotification.bind(this)
		this.handleDeleteFeatureCase = this.handleDeleteFeatureCase.bind(this)
		this.handleUpdateFeatureCase = this.handleUpdateFeatureCase.bind(this)
	}

	async componentDidMount() {
		codapInterface.on('notify', '*', 'dataContextCountChanged', this.handleNotification);
		codapInterface.on('notify', '*', 'deleteCases', this.handleDeleteFeatureCase);
		codapInterface.on('notify', '*', 'updateCases', this.handleUpdateFeatureCase);
		await this.updateFeaturesDataset();
		await this.props.domainStore.featureStore.updateWordListSpecs()
	}

	async handleNotification(iNotification: CODAP_Notification) {
		if (iNotification.action === 'notify') {
			let tOperation = iNotification.values.operation;
			if (tOperation === 'dataContextCountChanged') {
				action(async () => {
					await this.props.domainStore.featureStore.updateWordListSpecs()
				})()
			}
		}
	}

	handleDeleteFeatureCase(iNotification: CODAP_Notification) {
		const tFeatureStore = this.props.domainStore.featureStore,
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
						tFeatures.splice(tIndex, 1)
				})
			})()
		}
	}

	handleUpdateFeatureCase(iNotification: CODAP_Notification) {
		const tFeatureStore = this.props.domainStore.featureStore,
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

	async updateFeaturesDataset() {
		await this.props.domainStore.updateNonNtigramFeaturesDataset()
	}

	render() {

		return (
			<div className='sq-feature-panel'>
				<TargetInfoPane
					domainStore={this.props.domainStore}
				/>
				<FeaturePane
					uiStore={this.props.uiStore}
					domainStore={this.props.domainStore}
				/>
			</div>
		);
	}
})
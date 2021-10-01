/**
 * This component provides the space for a user to construct and edit features
 */

import React, {Component} from "react";
import {DomainStore} from "../stores/domain_store";
import {observer} from "mobx-react";
import {UiStore} from "../stores/ui_store";
import {Button} from "devextreme-react";
import {FeatureConstructor} from "./feature_constructor";
import {action} from "mobx";
import {FeatureList} from "./feature_list";

interface FeaturePaneState {
	count: number,
}

interface FeaturePaneInfo {
	subscriberIndex: number
}

export interface Feature_Props {
	uiStore: UiStore
	domainStore: DomainStore
}

export const FeaturePane = observer(class FeaturePane extends Component<Feature_Props, FeaturePaneState> {

	private featurePaneInfo: FeaturePaneInfo;

	constructor(props: any) {
		super(props);
		this.state = {
			count: 0
		};
		this.featurePaneInfo = {subscriberIndex: -1}
	}

	addFeature() {

	}

	getButtons() {
		let tFeatureUnderConstruction = this.props.domainStore.featureStore.featureUnderConstruction,
			tButtonLabel = tFeatureUnderConstruction.inProgress ? 'Cancel' : '+ Add Feature',
			tAddButton =
				(<Button
						className='sq-button'
						onClick={action(() => {
							tFeatureUnderConstruction.inProgress = !tFeatureUnderConstruction.inProgress
						})}
					>
						{tButtonLabel}
					</Button>
				),
			tDoneButton = tFeatureUnderConstruction.inProgress ? (
				<Button
					className='sq-button'
					disabled={!this.props.domainStore.featureStore.constructionIsDone()}
					onClick={action(async () => {
						if( tFeatureUnderConstruction.inProgress) {
							await this.props.domainStore.targetStore.addOrUpdateFeatureToTarget(tFeatureUnderConstruction)
							this.props.domainStore.featureStore.addFeatureUnderConstruction()
							await this.props.domainStore.updateFeaturesDataset()
						}
					})}
				>
					Done
				</Button>
			) : ''
		return (
			<div>
				{tAddButton}
				{tDoneButton}
			</div>
		)
	}

	render() {
		return (
			<div className='sq-feature-pane'>
				<FeatureConstructor
					uiStore={this.props.uiStore}
					domainStore={this.props.domainStore}
				/>
				{this.getButtons()}
				<FeatureList
					uiStore={this.props.uiStore}
					domainStore={this.props.domainStore}
				/>
			</div>
		);
	}
})
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

	getButtons() {
		const tFeatureUnderConstruction = this.props.domainStore.featureStore.featureUnderConstruction,
			tInProgress = tFeatureUnderConstruction.inProgress,
			tButtonLabel = tFeatureUnderConstruction.inProgress ? 'Cancel' : '+ Add Feature',
			tButtonHint = tFeatureUnderConstruction.inProgress ? 'Press this to cancel feature construction.' :
				'Press this button to begin constructing a feature.',
			tAddButton =
				(<Button
						className='sq-button'
						onClick={action(() => {
							tFeatureUnderConstruction.inProgress = !tInProgress
						})}
						hint={tButtonHint}
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
							tFeatureUnderConstruction.name = this.props.domainStore.featureStore.constructNameFor(tFeatureUnderConstruction)
							await this.props.domainStore.targetStore.addOrUpdateFeatureToTarget(tFeatureUnderConstruction)
							await this.props.domainStore.featureStore.addFeatureUnderConstruction()
							await this.props.domainStore.updateNonNtigramFeaturesDataset()
							await this.props.domainStore.updateNgramFeatures()
							tFeatureUnderConstruction.inProgress = false
						}
					})}
					hint={'You can press this button when you have completed specifying a feature.'}
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
		const this_ = this,
			tFeatureStore = this.props.domainStore.featureStore

		function featureInstructions() {
			if (!tFeatureStore.featureUnderConstruction.inProgress) {
				const
					tFeatures =tFeatureStore.features,
					tInstructions = tFeatures.length === 0 ?
					<p>What features of the training data should StoryQ use to train the model?</p> :
					<p>You have {tFeatures.length} feature{tFeatures.length > 1 ? 's' : ''}. You can add more or
					go on to <span
							onClick={action(()=>this_.props.domainStore.setPanel(2))}
							style={{cursor: 'pointer'}}
						>
								<strong>Training</strong></span>.</p>
				return (
					<div className='sq-info-prompt'>
						{tInstructions}
					</div>
				)
			}
		}

		return (
			<div className='sq-pane'>
				{featureInstructions()}
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
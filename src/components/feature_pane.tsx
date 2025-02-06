/**
 * This component provides the space for a user to construct and edit features
 */

import { action } from "mobx";
import { observer } from "mobx-react";
import React from "react";
import { SQ } from "../lists/lists";
import { domainStore } from "../stores/domain_store";
import { featureStore } from "../stores/feature_store";
import { targetStore } from "../stores/target_store";
import { FeatureConstructor } from "./feature_constructor";
import { FeatureList } from "./feature_list";
import { Button } from "./ui/button";

const AddButton = observer(function AddButton() {
	const { featureUnderConstruction} = featureStore;
	const { inProgress } = featureUnderConstruction;

	const handleClick = action(async () => {
		if (inProgress) {	// Cancel
			featureStore.startConstructingFeature();
		}
		featureUnderConstruction.inProgress = !inProgress;
	});

	return (
		<Button
			className='sq-button'
			onClick={handleClick}
			hint={inProgress ? SQ.hints.featureCancel : SQ.hints.featureAdd}
		>
			{inProgress ? "Cancel" : "Add Features"}
		</Button>
	);
});

const DoneButton = observer(function DoneButton() {
	const { featureUnderConstruction } = featureStore;

	if (!featureUnderConstruction.inProgress) return null;

	// TODO Move this function into domainStore
	const handleClick = action(async () => {
		if( featureUnderConstruction.inProgress) {
			if(featureUnderConstruction.info.kind === 'ngram' && featureStore.hasNgram()) {
				window.alert('Sorry, you already have this feature.')
			}
			else {
				featureUnderConstruction.name = featureStore.constructNameFor(featureUnderConstruction)
				await targetStore.addOrUpdateFeatureToTarget(featureUnderConstruction)
				await featureStore.addFeatureUnderConstruction(featureUnderConstruction)
				await domainStore.updateNonNtigramFeaturesDataset()
				await domainStore.updateNgramFeatures()
				featureUnderConstruction.inProgress = false
			}
		}
	});

	return (
		<Button
			className="sq-button"
			disabled={!featureStore.constructionIsDone()}
			onClick={handleClick}
			hint={SQ.hints.featureDone}
		>
			Done
		</Button>
	);
});

const FeatureInstructions = observer(function FeatureInstructions() {
	if (featureStore.featureUnderConstruction.inProgress) return null;

	return (
		<div className="sq-info-prompt">
			{featureStore.features.length === 0
				? <p>What features of the training data should StoryQ use to train the model?</p>
				: (
					<p>
						Add more features or go to <span
							onClick={() => domainStore.setPanel(2)}
							style={{ cursor: "pointer" }}
						>
							<strong>Training</strong>
						</span> to train your model.
					</p>
				)}
		</div>
	);
});

export function FeaturePane() {
	return (
		<div className='sq-pane'>
			<FeatureInstructions />
			<FeatureConstructor />
			<div>
				<AddButton />
				<DoneButton />
			</div>
			<FeatureList />
		</div>
	);
}

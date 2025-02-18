/**
 * This component provides the space for a user to construct and edit features
 */

import React, { useEffect } from "react";
import { observer } from "mobx-react";
import { domainStore } from "../stores/domain_store";
import { featureStore } from "../stores/feature_store";
import { FeaturePane } from "./feature_pane";

export const FeaturePanel = observer(function FeaturePanel() {
	useEffect(() => {
		domainStore.updateNonNtigramFeaturesDataset();
		featureStore.updateWordListSpecs();
	}, []);

	return (
		<div className='sq-feature-panel'>
			<FeaturePane />
		</div>
	);
});

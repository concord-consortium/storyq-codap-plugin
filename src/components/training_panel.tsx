/**
 * This component shows under the Training tab
 */

import React, { useEffect } from "react";
import { domainStore } from "../stores/domain_store";
import { TargetInfoPane } from "./target_info_pane";
import { TrainingPane } from "./training_pane";

export const TrainingPanel = function TrainingPanel() {
	useEffect(() => {
		domainStore.updateNonNtigramFeaturesDataset();
	}, []);

	return (
		<div className="sq-feature-panel">
			<TargetInfoPane />
			<TrainingPane />
		</div>
	);
}

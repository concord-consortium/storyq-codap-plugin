/**
 * This component lists the constructed features and provides an interface for choosing, deleting, and editing them
 */

import { observer } from "mobx-react";
import React from "react";
import { featureStore } from "../stores/feature_store";
import { FeatureComponent } from "./feature_component";

export const FeatureList = observer(function FeatureList() {
	return (
		<div className="sq-container">
			<div className="sq-feature-list">
				{featureStore.features.map((feature, index) => {
					return <FeatureComponent
						key={index}
						feature={feature}
						shortened={true}
					/>
				})}
			</div>
		</div>
	);
});

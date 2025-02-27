/**
 * This component lists the constructed features and provides an interface for choosing, deleting, and editing them
 */

import { observer } from "mobx-react";
import React from "react";
import { featureStore } from "../stores/feature_store";
import { FeatureListItem } from "./feature_list_item";

interface IFeatureListProps {
	allowDelete?: boolean
}
export const FeatureList = observer(function FeatureList({ allowDelete = true }: IFeatureListProps) {
	return (
		<div className="sq-container">
			<div className="sq-feature-list">
				{featureStore.features.map((feature, index) => (
					<FeatureListItem allowDelete={allowDelete} key={index} feature={feature} />
				))}
			</div>
		</div>
	);
});

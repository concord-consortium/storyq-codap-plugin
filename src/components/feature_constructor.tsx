/**
 * This component provides the space for a user to construct a new feature
 */

import { observer } from "mobx-react";
import React from "react";
import { domainStore } from "../stores/domain_store";
import { FeatureComponent } from "./feature_component";

export const FeatureConstructor = observer(function FeatureConstructor() {
	if (!domainStore.featureStore.featureUnderConstruction.inProgress) return null;

	return (
		<div>
			<FeatureComponent
				feature={domainStore.featureStore.featureUnderConstruction}
				shortened = {false}
			/>
		</div>
	);
});

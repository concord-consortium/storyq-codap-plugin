/**
 * This component provides the space for a user to construct a new feature
 */

import { observer } from "mobx-react";
import React from "react";
import { featureStore } from "../stores/feature_store";
import { FeatureComponent } from "./feature_component";

export const FeatureConstructor = observer(function FeatureConstructor() {
  if (!featureStore.featureUnderConstruction.inProgress) return null;

  return (
    <div>
      <FeatureComponent feature={featureStore.featureUnderConstruction} />
    </div>
  );
});

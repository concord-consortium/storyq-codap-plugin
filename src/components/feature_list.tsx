/**
 * This component lists the constructed features and provides an interface for choosing, deleting, and editing them
 */

import { observer } from "mobx-react";
import React from "react";
import { featureStore } from "../stores/feature_store";
import { FeatureListItem } from "./feature_list_item";

interface IFeatureListProps {
  allowChoose?: boolean
  allowDelete?: boolean
  allowHighlightControls?: boolean
}
export const FeatureList = observer(function FeatureList({
  allowChoose = true, allowDelete = true, allowHighlightControls = false
}: IFeatureListProps) {
  return (
    <div className="sq-container">
      <div className="sq-feature-list">
        {featureStore.features.map(feature => (
          <FeatureListItem
            allowChoose={allowChoose}
            allowDelete={allowDelete}
            allowHighlightControls={allowHighlightControls}
            // The row owns the color picker's open state, so the key has to follow the feature rather
            // than its position: keyed by index, deleting a row above an open picker hands that picker
            // to the next feature down. Names are not guaranteed unique, so the case id disambiguates.
            key={`${feature.name}:${feature.caseID}`}
            feature={feature}
          />
        ))}
      </div>
    </div>
  );
});

/**
 * This component displays information about a feature and allows for some modification
 */

import { action } from "mobx";
import { observer } from "mobx-react";
import React from "react";
import { SQ } from "../lists/lists";
import { domainStore } from "../stores/domain_store";
import { featureStore } from "../stores/feature_store";
import { Feature, kFeatureTypeUnigram } from "../stores/store_types_and_constants";
import { textStore } from "../stores/text_store";
// import { Button } from "./ui/button";
import { CheckBox } from "./ui/check-box";

import { ReactComponent as CloseIcon } from "../assets/close-icon.svg";

import "./feature_list_item.scss";

export interface IFeatureListItemProps {
  allowChoose?: boolean
  allowDelete?: boolean
  feature: Feature
}

export const FeatureListItem = observer(function FeatureListItem({
  allowChoose = true, allowDelete = true, feature
}: IFeatureListItemProps) {
  const tHint = feature.chosen ? SQ.hints.featureTableCheckboxRemove : SQ.hints.featureTableCheckboxAdd;
  const style = { backgroundColor: feature.color };

  const handleClose = action(async () => {
    await featureStore.deleteFeature(feature);
    await textStore.clearText();
  });

  return (
    <div className='feature-list-item' style={style}>
      <div className="left-item">
        {allowChoose && (
          <CheckBox
            text=''
            value={feature.chosen}
            onValueChanged={action(async () => {
              await featureStore.toggleChosenFor(feature);
              if (feature.type === kFeatureTypeUnigram && feature.chosen) domainStore.updateNgramFeatures();
            })}
            hint={tHint}
          />
        )}
        <div className="feature-name">{feature.name}</div>
      </div>
      {allowDelete && (
        <button className="close-button" onClick={handleClose}>
          <CloseIcon />
        </button>
      )}
    </div>
  );
});

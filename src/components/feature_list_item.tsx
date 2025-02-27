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
import { Button } from "./ui/button";
import { CheckBox } from "./ui/check-box";

export interface IFeatureListItemProps {
  allowDelete?: boolean
  feature: Feature
}

export const FeatureListItem = observer(function FeatureListItem({ allowDelete = true, feature }: IFeatureListItemProps) {
  const tHint = feature.chosen ? SQ.hints.featureTableCheckboxRemove : SQ.hints.featureTableCheckboxAdd;

  return (
    <div className='sq-component'>
      <CheckBox
        text=''
        value={feature.chosen}
        onValueChanged={action(async () => {
          await featureStore.toggleChosenFor(feature);
          if (feature.type === kFeatureTypeUnigram && feature.chosen) domainStore.updateNgramFeatures();
        })}
        hint={tHint}
      />
      <p><strong>{feature.name}</strong></p>
      {allowDelete && (
        <Button
          className='sq-feature-delete'
          text=''
          icon='clear'
          onClick={action(async () => {
            await featureStore.deleteFeature(feature)
            await textStore.clearText()
          })}
          hint={SQ.hints.featureTableRemove}
        />
      )}
    </div>
  );
});

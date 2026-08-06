/**
 * This component displays information about a feature and allows for some modification
 */

import { action } from "mobx";
import { observer } from "mobx-react";
import React, { useCallback, useId, useRef, useState } from "react";
import { SQ } from "../lists/lists";
import { domainStore } from "../stores/domain_store";
import { featureStore } from "../stores/feature_store";
import { Feature, kFeatureTypeUnigram } from "../stores/store_types_and_constants";
import { textStore } from "../stores/text_store";
import { ngramTokenColor } from "../utilities/color-utils";
import { ColorPicker } from "./color_picker";
import { CheckBox } from "./ui/check-box";

import { ReactComponent as CloseIcon } from "../assets/close-icon.svg";
import { ReactComponent as ColorIcon } from "../assets/color-icon.svg";
import { ReactComponent as VisibilityOffIcon } from "../assets/visibility-off-icon.svg";
import { ReactComponent as VisibilityOnIcon } from "../assets/visibility-on-icon.svg";

import "./feature_list_item.scss";

export interface IFeatureListItemProps {
  allowChoose?: boolean
  allowDelete?: boolean
  allowHighlightControls?: boolean
  feature: Feature
}

export const FeatureListItem = observer(function FeatureListItem({
  allowChoose = true, allowDelete = true, allowHighlightControls = false, feature
}: IFeatureListItemProps) {
  const tHint = feature.chosen ? SQ.hints.featureTableCheckboxRemove : SQ.hints.featureTableCheckboxAdd;
  const colorButtonRef = useRef<HTMLButtonElement>(null);
  const [pickerIsOpen, setPickerIsOpen] = useState(false);
  const pickerId = useId();

  // The pill is filled white while highlighting is off, but only where the eye icon is there to say so.
  // On the Training tab a white row would carry that meaning by color alone, and that tab does not change.
  const style = {
    backgroundColor: allowHighlightControls && !feature.highlight ? "#ffffff" : ngramTokenColor(feature.color)
  };

  const handleClose = action(async () => {
    await featureStore.deleteFeature(feature);
    await textStore.clearText();
  });

  const handleToggleHighlight = action(async () => {
    await featureStore.setHighlightFor(feature, !feature.highlight);
  });

  const handleChoose = action(async (color: string) => {
    setPickerIsOpen(false);
    colorButtonRef.current?.focus();
    await featureStore.setColorFor(feature, color);
  });

  const handleClosePicker = useCallback((returnFocus?: boolean) => {
    setPickerIsOpen(false);
    if (returnFocus) colorButtonRef.current?.focus();
  }, []);

  return (
    <div className="feature-list-item-wrapper">
      {allowHighlightControls && (
        <>
          <button
            aria-label={feature.highlight
              ? `Hide highlighting for ${feature.name}`
              : `Show highlighting for ${feature.name}`}
            className="highlight-control visibility-button"
            onClick={handleToggleHighlight}
          >
            {feature.highlight ? <VisibilityOnIcon /> : <VisibilityOffIcon />}
          </button>
          <button
            aria-controls={pickerId}
            aria-expanded={pickerIsOpen}
            aria-haspopup="listbox"
            aria-label={`Highlight color for ${feature.name}`}
            className="highlight-control color-button"
            onClick={() => setPickerIsOpen(!pickerIsOpen)}
            ref={colorButtonRef}
            style={{ backgroundColor: ngramTokenColor(feature.color) }}
          >
            <ColorIcon />
          </button>
          {pickerIsOpen && colorButtonRef.current && (
            <ColorPicker
              button={colorButtonRef.current}
              color={ngramTokenColor(feature.color)}
              featureName={feature.name}
              id={pickerId}
              onChoose={handleChoose}
              onClose={handleClosePicker}
            />
          )}
        </>
      )}
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
    </div>
  );
});

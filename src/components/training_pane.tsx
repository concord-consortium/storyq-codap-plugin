/**
 * This component provides the space for a user to name and run a model
 */
import React, { useState } from "react";
import { observer } from "mobx-react-lite";
import { action } from "mobx";
import { SQ } from "../lists/lists";
import { ModelManager } from "../managers/model_manager";
import { domainStore } from "../stores/domain_store";
import { featureStore } from "../stores/feature_store";
import { trainingStore } from "../stores/training_store";
import { uiStore } from "../stores/ui_store";
import { TrainingResult } from "../stores/store_types_and_constants";
import { FeatureList } from "./feature_list";
import { ProgressBar } from "./progress-bar";
import { Button } from "./ui/button";
import { CheckBox } from "./ui/check-box";
import { TextBox } from "./ui/text-box";

import "./training_pane.scss";

export const TrainingPane = observer(function TrainingPane() {
  const [modelManager] = useState(() => new ModelManager());

  const tModel = trainingStore.model;
  const tNumResults = trainingStore.trainingResults.length;

  function modelTrainerInstructions() {
    if (!tModel.beingConstructed) {
      if (tNumResults === 0) {
        return (
          <div className='sq-info-prompt'>
            <p>Train your model with the features you have prepared.</p>
          </div>
        );
      }
      else {
        return (
          <div className='sq-info-prompt'>
            <p>You have trained {tNumResults} model{tNumResults > 1 ? 's' : ''}. Train another or
            proceed to <span
                onClick={() => domainStore.setPanel(3)}
                style={{cursor: 'pointer'}}
              >
              <strong>Testing</strong></span>.</p>
          </div>
        );
      }
    } else if (tModel.name === '') {
      return (
        <div className='sq-info-prompt'>
          <p>Your model must have a name before you can train it.</p>
        </div>
      );
    }
    else {
      return (
        <div className='sq-info-prompt'>
          <p>You can start training your model.</p>
        </div>
      );
    }
  }

  function modelTrainer() {
    const tFeatureString = featureStore.features.length < 2 ? 'this feature' : 'these features';

    function getButtons() {
      const tDisabled = trainingStore.model.name === '';
      const tInProgress = trainingStore.model.trainingInProgress;
      const tInStepMode = trainingStore.model.trainingInStepMode;

      function trainButton() {
        if (!tInProgress) {
          const tHint = tInStepMode ? SQ.hints.trainingStep : SQ.hints.trainingTrain;
          return (
            <Button
              className='sq-button'
              disabled={tDisabled}
              onClick={action(async () => {
                if (tInStepMode) {
                  trainingStore.model.setTrainingInStepMode(false);
                } else {
                  uiStore.setTrainingPanelShowsEditor(false);
                  trainingStore.model.setTrainingInProgress(true);
                  await modelManager.buildModel();
                  modelManager.nextStep();
                }
              })}
              hint={tHint}>
              {tInStepMode ? 'Finish' : 'Train'}
            </Button>
          );
        }
      }

      function stepButton() {
        if (!tInProgress || tInStepMode) {
          return (
            <Button
              className='sq-button'
              disabled={tDisabled}
              onClick={action(async () => {
                if (!trainingStore.model.trainingInProgress) {
                  uiStore.setTrainingPanelShowsEditor(false);
                  trainingStore.model.setTrainingInProgress(true);
                  trainingStore.model.setTrainingInStepMode(true);
                  await modelManager.buildModel();
                } else {
                  modelManager.nextStep();
                }
              })}
              hint={SQ.hints.trainingOneStep}>
              Step
            </Button>
          );
        }
      }

      function settingsButton() {
        if (!tInStepMode && !tInProgress) {
          return (
            <Button
              className='sq-button'
              onClick={action(() => {
                uiStore.setTrainingPanelShowsEditor(!uiStore.trainingPanelShowsEditor);
              })}
              hint={SQ.hints.trainingSettings}>
              Settings
            </Button>
          );
        }
      }

      function cancelButton() {
        return (
          <Button
            className='sq-button'
            onClick={action(async () => {
              await modelManager.cancel()
            })}
            hint={SQ.hints.trainingCancel}>
            Cancel
          </Button>
        );
      }

      return (
        <div className='sq-training-buttons'>
          {trainButton()}
          {stepButton()}
          {settingsButton()}
          {cancelButton()}
        </div>
      );
    }

    function getSettingsPanel() {
      if (uiStore.trainingPanelShowsEditor) {
        return (
          <div className='sq-training-settings-panel'>
            <div className='sq-fc-part'>
              <p style={{width: '50px'}}>Model Settings</p>
            </div>
            <div className='sq-training-settings'>
              <div className='sq-training-iterations'>
                <span title={SQ.hints.trainingSetupIteration}>Iterations:</span>
                <TextBox
                  className='sq-fc-part'
                  placeholder=""
                  hint={SQ.hints.trainingSetupIteration}
                  onValueChanged={value => tModel.setIterations(Number(value))}
                  value={String(tModel.iterations)}
                  maxLength={4}
                  width={40}
                />
              </div>
              <div className='sq-training-checkboxes'>
                <CheckBox
                  hint={SQ.hints.trainingLockIntercept}
                  onValueChanged={value => tModel.setLockInterceptAtZero(value)}
                  text='Lock intercept at 0'
                  value={tModel.lockInterceptAtZero}
                />
                <CheckBox
                  hint={SQ.hints.trainingPointFiveAsThreshold}
                  onValueChanged={value => tModel.setUsePoint5AsProbThreshold(value)}
                  text='Use 50% as probability threshold'
                  value={tModel.usePoint5AsProbThreshold}
                />
              </div>
            </div>
          </div>
        );
      }
    }

    if (!tModel.beingConstructed) {
      return (
        <Button
          className='sq-button'
          onClick={action(async () => {
            tModel.reset();
            tModel.setBeingConstructed(true);
          })}
          hint={SQ.hints.trainingNewModel}>
          + New Model
        </Button>
      );
    } else {
      const { iteration, iterations } = trainingStore.model;

      return (
        <div className='sq-component'>
          <div className='sq-component'>
            <span className='sq-fc-part'> Give your model a name:</span>
            <TextBox
              className='sq-fc-part'
              placeholder="Name"
              onValueChanged={value => tModel.setName(value)}
              onFocusOut={() => tModel.setName(modelManager.guaranteeUniqueModelName(tModel.name))}
              value={tModel.name}
              maxLength={20}
            />
          </div>
          <div>
            <p>Once trained,
              <strong>{tModel.name === '' ? 'your model ' : ' ' + (tModel.name + ' ')}</strong>
              will contain {tFeatureString}:</p>
            <FeatureList allowDelete={false} />
          </div>
          {getButtons()}
          {getSettingsPanel()}
          <ProgressBar percentComplete={Math.round(100 * iteration / iterations)} />
        </div>
      );
    }
  }

  function getModelResults() {
    const { trainingResults } = trainingStore;
    if (trainingResults.length <= 0) return null;

    function getIsActiveButon(iIndex: number) {
      const tTrainingResult = trainingResults[iIndex];
      const tIsDisabled = trainingResults.length < 2;
      const tHint = tTrainingResult.isActive ? SQ.hints.trainingMakeModelInactive : SQ.hints.trainingMakeModelActive;
      return (
        <td className="active-checkbox-container">
          <CheckBox
            text=''
            value={tTrainingResult.isActive}
            disabled={tIsDisabled}
            style={{'fontSize': 'large'}}
            onValueChanged={() => domainStore.setIsActiveForResultAtIndex(iIndex, !tTrainingResult.isActive)}
            hint={tHint}
          />
        </td>
      );
    }

    function getSettings(aResult: TrainingResult) {
      if (aResult.settings) {
        return (
          <div className="settings-container">
            <p>{aResult.settings.iterations} iterations</p>
            <p>intercept {aResult.settings.locked ? '' : 'not'} locked</p>
            <p>threshold = {(100 * aResult.threshold).toFixed(0)}%</p>
          </div>
        );
      }
    }

    return (
      <table>
        <thead>
        <tr>
          <th
            title={SQ.hints.trainingResultsActive}>
            Active
          </th>
          <th>Model Name</th>
          <th style={{textAlign:'center'}} title={SQ.hints.trainingResultsSettings}>Settings</th>
          <th title={SQ.hints.trainingResultsAccuracy}>Accuracy</th>
          {/*<th title={'This number is 0% when the model did no better than chance.'}>Kappa</th>*/}
          <th title={SQ.hints.trainingResultsFeatures}>Features</th>
        </tr>
        </thead>
        <tbody className='sq-model-table'>
        {trainingResults.map((iResult, iIndex) => {
          const tFeatureNames = iResult.featureNames && iResult.featureNames.map((iName, iIndex)=>{
            return <p key={'f'+iIndex}>{iName}</p>
          })
          return (
            <tr key={iIndex}>
              {getIsActiveButon(iIndex)}
              <td style={{textAlign:'center'}}>{iResult.name}</td>
              <td>{getSettings(iResult)}</td>
              <td style={{textAlign:'right'}}>{(100 * iResult.accuracy).toFixed(1)}%</td>
              {/*<td>{(100 * iResult.kappa).toFixed(1)}%</td>*/}
              <td>{tFeatureNames}</td>
            </tr>)

        })}
        </tbody>
      </table>
    );
  }

  return (
    <div className='sq-training-pane'>
      {modelTrainerInstructions()}
      {modelTrainer()}
      {getModelResults()}
    </div>
  );
});

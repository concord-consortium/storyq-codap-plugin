import { observer } from "mobx-react";
import React, { Component } from 'react';
import packageJson from "../../package.json";
import { initializePlugin, registerObservers } from '../lib/codap-helper';
import codapInterface, { CODAP_Notification } from "../lib/CodapInterface";
import { ModelManager } from "../managers/model_manager";
import { NotificationManager } from "../managers/notification_manager";
import { TestingManager } from "../managers/testing_manager";
import { domainStore, IDomainStoreJSON } from "../stores/domain_store";
import { kStoryQPluginName } from "../stores/store_types_and_constants";
import { targetStore } from '../stores/target_store';
import { testingStore } from "../stores/testing_store";
import { trainingStore } from "../stores/training_store";
import { IUiStoreJSON, uiStore } from "../stores/ui_store";
import { CollapseButton } from "./collapse-button";
import { kCollapseButtonWidth } from "./constants";
import { FeaturePanel } from "./feature_panel";
import { TargetPanel } from "./target_panel";
import { TestingPanel, kNonePresent } from "./testing_panel";
import { TextPane } from "./text-pane/text-pane";
import { TrainingPanel } from "./training_panel";
import { Item } from './ui/item';
import { TabPanel } from './ui/tab-panel';

import '../styles/light.compact.css';
import './storyq.scss';

const paneWidth = 430;
function getPluginWidth() {
  return (paneWidth + kCollapseButtonWidth) * (uiStore.showStoryQPanel && uiStore.showTextPanel ? 2 : 1);
}
const pluginHeight = 420;

interface IStorage {
  domainStore: IDomainStoreJSON;
  uiStore: IUiStoreJSON;
}

interface IStoryqProps {}
const Storyq = observer(class Storyq extends Component<IStoryqProps, {}> {
    private kPluginName = kStoryQPluginName;
    // From package.json so a release bump has one place to change. The tag deploys to
    // version/v<package.json version>, so anything else here would report a version that is
    // not the one being served.
    private kVersion = packageJson.version;
    private kInitialDimensions = {
      width: getPluginWidth(),
      height: pluginHeight
    };
    private testingManager: TestingManager;
    private resumeInFlight: Promise<void> | undefined;

    constructor(props: IStoryqProps) {
      super(props);
      this.restorePluginFromStore = this.restorePluginFromStore.bind(this);
      this.getPluginStore = this.getPluginStore.bind(this);
      this.handleSelectionChanged = this.handleSelectionChanged.bind(this);

      // Listen for CODAP changes here on the root component so it does not matter if the plugin
      // is collapsed in CODAP (which causes the tab not to render the tab panels).
      // This code to initialize the testing manager and listen for cases being created used
      // to live in TestingPanel.
      this.testingManager = new TestingManager(kNonePresent)
      this.handleCaseNotification = this.handleCaseNotification.bind(this)

      // Only visible when the plugin is opened on its own, since inside CODAP it is an iframe and
      // CODAP owns the tab. Set from the same constant the pane shows, so the two cannot disagree.
      document.title = `${this.kPluginName} ${this.kVersion}`;
      codapInterface.on('notify', '*', 'createCases', this.handleCaseNotification);
      new NotificationManager();

      codapInterface.on('update', 'interactiveState', '', this.restorePluginFromStore);
      codapInterface.on('get', 'interactiveState', '', this.getPluginStore);
      initializePlugin(this.kPluginName, this.kVersion, this.kInitialDimensions, this.restorePluginFromStore)
        .then(registerObservers).catch(registerObservers);

      // Collapsing or expanding a pane deliberately leaves the window size alone. The panes are
      // flex children, so the remaining one fills the space, and whatever width the user has set
      // is preserved.
    }

    getPluginStore() {
      // We stringify and then parse the JSON to remove functions.
      // When present, these cause attempts to transfer the stores to CODAP to fail.
      const values = JSON.parse(JSON.stringify({
        domainStore: domainStore.asJSON(),
        uiStore: uiStore.asJSON()
      }))
      return {
        success: true,
        values
      };
    }

    async handleCaseNotification(iNotification: CODAP_Notification) {
      const tDataContextName = iNotification.resource && iNotification.resource.match(/\[(.+)]/)?.[1]
      if (tDataContextName === testingStore.testingDatasetInfo.name) {
        await this.testingManager.classify(false)
      }
    }

    async restorePluginFromStore(iStorage: IStorage) {
      if (iStorage) {
        uiStore.fromJSON(iStorage.uiStore);
        // Captured rather than awaited here: awaiting it inline would serialize, on every document
        // open, work that is concurrent today, for the sake of a case that only arises when a run
        // was in progress. fromJSON's first four statements are synchronous, so the training store,
        // including the isRestoringRun it sets, is in place before the next line runs.
        const tRestored = domainStore.fromJSON(iStorage.domainStore);
        // Read before the await, because cancel() and buildModel() can clear the flag while this is
        // in flight and the question being asked is what the document arrived holding.
        const tRunWasInProgress = trainingStore.model.trainingInProgress;
        try {
          await targetStore.updateFromCODAP();
          if (tRunWasInProgress) await this.resumeInterruptedRun(tRestored);
        } catch (error) {
          // Inside the try because updateFromCODAP does reject: getCaseValues dereferences its result
          // after a .catch that returns undefined, so one failed CODAP request rejects the whole
          // restore. Without this the pane would sit on the restoring message with Step and Cancel
          // disabled and no way out, which is worse than the message it falls back to.
          if (tRunWasInProgress) this.giveUpOnResuming(error);
          throw error;
        }
      }
    }

    /**
     * A run the document was saved during is rebuilt and replayed if it still matches the current
     * features and target data, and falls to the "cannot be picked up" message if it does not.
     *
     * Sequenced behind the promise fromJSON returns as well as the updateFromCODAP await, because the
     * Features dataset migration is still writing to the very dataset this is about to read weight
     * case IDs from and stamp model names into. That promise can also reject, and a resume that
     * neither attempts nor explains is the failure this is here to remove.
     */
    private resumeInterruptedRun(iRestored: Promise<void>) {
      // In flight rather than ever-attempted. Returning early leaves the restoring state set, and the
      // resume already running is what clears it; a guard that never reset would leave a second
      // restored document showing the restoring message with Step and Cancel disabled and nothing
      // able to clear either. Returning the in-flight promise keeps the caller's await meaningful.
      //
      // Defensive: on the evidence available CODAP delivers a restore exactly once, through init, so
      // this guards a path CODAP is not known to exercise.
      if (this.resumeInFlight) return this.resumeInFlight;
      this.resumeInFlight = this.attemptResume(iRestored)
        .finally(() => { this.resumeInFlight = undefined; });
      return this.resumeInFlight;
    }

    private async attemptResume(iRestored: Promise<void>) {
      try {
        await iRestored;
        // Never targetStore.targetCases: that field is reassigned with a filtered subset by work
        // that fires unawaited on every document open. updateTargetCases returns the array it built.
        const tTargetCases = await targetStore.updateTargetCases();
        const tModelManager = new ModelManager();
        if (await tModelManager.prepareResume(tTargetCases)) {
          if (trainingStore.model.trainingInStepMode) {
            // The run is validated and waiting for the student's next press, so the pane goes back to
            // looking exactly like a live step-mode run between steps. resumeRun sets the flag again
            // when that press arrives.
            trainingStore.setRestoringRun(false);
          } else {
            // A plain run has no button to press. The flag stays set through the replay and the
            // handback clears it.
            tModelManager.resumeRun();
          }
        } else {
          this.giveUpOnResuming();
        }
      } catch (error) {
        this.giveUpOnResuming(error);
      }
    }

    /**
     * The one place the restoring state is left. Every route out of a restore that does not end in a
     * run the student can act on comes through here, so that the pane can never be left saying a run
     * is being restored when nothing is restoring it.
     */
    private giveUpOnResuming(iError?: unknown) {
      if (iError) console.log(`Could not resume the interrupted training run: ${iError}`);
      trainingStore.setRestoringRun(false);
      trainingStore.setResumeIsPending(false);
      trainingStore.setTrainingCouldNotBeResumed(true);
    }

    async handleSelectionChanged(index: number) {
      uiStore.setTabPanelSelectedIndex(index);
      await targetStore.updateFromCODAP()
    }

    public render() {
      const onStoryQButtonClick = () => uiStore.showStoryQPanel
        ? uiStore.setShowStoryQPanel(false) : uiStore.setShowStoryQPanel(true);
      const storyQButtonDirection = uiStore.showStoryQPanel ? "left" : "right";
      const onTextButtonClick = () => uiStore.showTextPanel
        ? uiStore.setShowTextPanel(false) : uiStore.setShowTextPanel(true);
      const textButtonDirection = uiStore.showTextPanel ? "right" : "left";

      return (
        <div className="storyq-container">
          {uiStore.showStoryQPanel && (
            <div className="storyq">
              <TabPanel
                id='tabPanel'
                selectedIndex={uiStore.tabPanelSelectedIndex}
                onSelectionChanged={(index: number) => this.handleSelectionChanged(index)}
              >
                <Item title='Setup' text='Specify the text data you want to work with'>
                  <TargetPanel />
                </Item>
                <Item title='Features' disabled={!domainStore.featuresPanelCanBeEnabled()}>
                  <FeaturePanel />
                </Item>
                <Item title='Training' disabled={!domainStore.trainingPanelCanBeEnabled()}>
                  <TrainingPanel />
                </Item>
                <Item title='Testing' disabled={!domainStore.testingPanelCanBeEnabled()}>
                  <TestingPanel testingManager={this.testingManager} />
                </Item>
              </TabPanel>
            </div>
          )}
          {uiStore.showTextPanel && <CollapseButton direction={storyQButtonDirection} onClick={onStoryQButtonClick} />}
          {uiStore.showStoryQPanel && <CollapseButton direction={textButtonDirection} onClick={onTextButtonClick} />}
          {uiStore.showTextPanel && <TextPane />}
        </div>
      );
    }
  }
)
export default Storyq;

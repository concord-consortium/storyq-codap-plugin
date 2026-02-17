import { IReactionDisposer, reaction } from "mobx";
import { observer } from "mobx-react";
import React, { Component } from 'react';
import { initializePlugin, registerObservers, updatePluginDimensions } from '../lib/codap-helper';
import codapInterface, { CODAP_Notification } from "../lib/CodapInterface";
import { NotificationManager } from "../managers/notification_manager";
import { TestingManager } from "../managers/testing_manager";
import { domainStore, IDomainStoreJSON } from "../stores/domain_store";
import { kStoryQPluginName } from "../stores/store_types_and_constants";
import { targetStore } from '../stores/target_store';
import { testingStore } from "../stores/testing_store";
import { IUiStoreJSON, uiStore } from "../stores/ui_store";
import { CollapseButton, collapseButtonWidth } from "./collapse-button";
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
  return (paneWidth + collapseButtonWidth) * (uiStore.showStoryQPanel && uiStore.showTextPanel ? 2 : 1);
}
const pluginHeight = 420;

interface IStorage {
  domainStore: IDomainStoreJSON;
  uiStore: IUiStoreJSON;
}

interface IStoryqProps {}
const Storyq = observer(class Storyq extends Component<IStoryqProps, {}> {
    private kPluginName = kStoryQPluginName;
    private kVersion = "2.19.0";
    private kInitialDimensions = {
      width: getPluginWidth(),
      height: pluginHeight
    };
    private testingManager: TestingManager;
    private resizeDisposer: IReactionDisposer;

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
      codapInterface.on('notify', '*', 'createCases', this.handleCaseNotification);
      new NotificationManager();

      codapInterface.on('update', 'interactiveState', '', this.restorePluginFromStore);
      codapInterface.on('get', 'interactiveState', '', this.getPluginStore);
      initializePlugin(this.kPluginName, this.kVersion, this.kInitialDimensions, this.restorePluginFromStore)
        .then(registerObservers).catch(registerObservers);

      this.resizeDisposer = reaction(
        () => [uiStore.showStoryQPanel, uiStore.showTextPanel],
        () => updatePluginDimensions(getPluginWidth(), pluginHeight)
      );
    }

    componentWillUnmount() {
      this.resizeDisposer?.();
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
        domainStore.fromJSON(iStorage.domainStore);
        await targetStore.updateFromCODAP()
      }
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

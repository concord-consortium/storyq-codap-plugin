import { action } from "mobx";
import { observer } from "mobx-react";
import React, { Component } from 'react';
import { initializePlugin, registerObservers } from '../lib/codap-helper';
import codapInterface, { CODAP_Notification } from "../lib/CodapInterface";
import { TestingManager } from "../managers/testing_manager";
import { domainStore } from "../stores/domain_store";
import { kStoryQPluginName } from "../stores/store_types_and_constants";
import { targetStore } from '../stores/target_store';
import { uiStore } from "../stores/ui_store";
import { FeaturePanel } from "./feature_panel";
import { TargetPanel } from "./target_panel";
import { TestingPanel, kNonePresent } from "./testing_panel";
import { TrainingPanel } from "./training_panel";
import { Item } from './ui/item';
import { TabPanel } from './ui/tab-panel';

import '../storyq.css';
import '../styles/light.compact.css';

const Storyq = observer(class Storyq extends Component<{}, {}> {
		private kPluginName = kStoryQPluginName;
		private kVersion = "2.17.0";
		private kInitialDimensions = {
			width: 429,
			height: 420
		};
		private testingManager: TestingManager;

		constructor(props: any) {
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

			codapInterface.on('update', 'interactiveState', '', this.restorePluginFromStore);
			codapInterface.on('get', 'interactiveState', '', this.getPluginStore);
			initializePlugin(this.kPluginName, this.kVersion, this.kInitialDimensions, this.restorePluginFromStore)
				.then(registerObservers).catch(registerObservers);
		}

		getPluginStore() {
			return {
				success: true,
				values: {
					domainStore: domainStore.asJSON(),
					uiStore: uiStore.asJSON()
				}
			};
		}

		async handleCaseNotification(iNotification: CODAP_Notification) {
			const tDataContextName = iNotification.resource && iNotification.resource.match(/\[(.+)]/)[1]
			if (tDataContextName === domainStore.testingStore.testingDatasetInfo.name) {
				await this.testingManager.classify(false)
			}
		}

		async restorePluginFromStore(iStorage: any) {
			if (iStorage) {
				uiStore.fromJSON(iStorage.uiStore);
				domainStore.fromJSON(iStorage.domainStore);
				await targetStore.updateFromCODAP()
			}
		}

		async handleSelectionChanged(e: any) {
			uiStore.tabPanelSelectedIndex = e.selectedIndex;
			await targetStore.updateFromCODAP()
		}

		renderTabPanel() {
			return (
				<TabPanel
					id='tabPanel'
					selectedIndex={uiStore.tabPanelSelectedIndex}
					onSelectionChanged={action((e: any) => {
						this.handleSelectionChanged(e)
					})}
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
			);
		}

		public render() {

			return (
				<div>
					<div className="storyq">
						{this.renderTabPanel()}
					</div>
				</div>
			);
		}
	}
)
export default Storyq;

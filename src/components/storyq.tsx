import React, {Component} from 'react';
import '../styles/light.compact.css';
import codapInterface, { CODAP_Notification } from "../lib/CodapInterface";
import { initializePlugin, registerObservers } from '../lib/codap-helper';
import '../storyq.css';
import {TabPanel} from './ui/tab-panel';
import {Item} from './ui/item';
import {TargetPanel} from "./target_panel";
import {FeaturePanel} from "./feature_panel";
import {UiStore} from "../stores/ui_store";
import {observer} from "mobx-react";
import {DomainStore} from "../stores/domain_store";
import {action} from "mobx";
import {TrainingPanel} from "./training_panel";
import {TestingPanel, kNonePresent} from "./testing_panel";
import {kStoryQPluginName} from "../stores/store_types_and_constants";
import NotificationManager from "../managers/notification_manager";
import {TestingManager} from "../managers/testing_manager";

const Storyq = observer(class Storyq extends Component<{}, {}> {
		private uiStore: UiStore
		private domainStore: DomainStore
		private notificationManager: NotificationManager
		private kPluginName = kStoryQPluginName;
		private kVersion = "2.16-pre.0";
		private kInitialDimensions = {
			width: 429,
			height: 420
		};
		private testingManager: TestingManager;

		constructor(props: any) {
			super(props);
			this.uiStore = new UiStore()
			this.domainStore = new DomainStore(this.uiStore)
			this.notificationManager = new NotificationManager(this.domainStore)
			this.restorePluginFromStore = this.restorePluginFromStore.bind(this);
			this.getPluginStore = this.getPluginStore.bind(this);
			this.handleSelectionChanged = this.handleSelectionChanged.bind(this);

			// Listen for CODAP changes here on the root component so it does not matter if the plugin
			// is collapsed in CODAP (which causes the tab not to render the tab panels).
			// This code to initialize the testing manager and listen for cases being created used
			// to live in TestingPanel.
			this.testingManager = new TestingManager(this.domainStore, kNonePresent)
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
					domainStore: this.domainStore.asJSON(),
					uiStore: this.uiStore.asJSON()
				}
			};
		}

		async handleCaseNotification(iNotification: CODAP_Notification) {
			const tDataContextName = iNotification.resource && iNotification.resource.match(/\[(.+)]/)[1]
			if (tDataContextName === this.domainStore.testingStore.testingDatasetInfo.name) {
				await this.testingManager.classify(false)
			}
		}

		async restorePluginFromStore(iStorage: any) {
			if (iStorage) {
				this.uiStore.fromJSON(iStorage.uiStore);
				this.domainStore.fromJSON(iStorage.domainStore);
				await this.domainStore.targetStore.updateFromCODAP()
			}
		}

		async handleSelectionChanged(e: any) {
			this.uiStore.tabPanelSelectedIndex = e.selectedIndex;
			await this.domainStore.targetStore.updateFromCODAP()
		}

		renderTabPanel() {
			return (
				<TabPanel
					id='tabPanel'
					selectedIndex={this.uiStore.tabPanelSelectedIndex}
					onSelectionChanged={action((e: any) => {
						this.handleSelectionChanged(e)
					})}
				>
					<Item title='Setup' text='Specify the text data you want to work with'>
						<TargetPanel
							uiStore={this.uiStore}
							domainStore={this.domainStore}
						/>
					</Item>
					<Item title='Features' disabled={!this.domainStore.featuresPanelCanBeEnabled()}>
						<FeaturePanel
							uiStore={this.uiStore}
							domainStore={this.domainStore}
						/>
					</Item>
					<Item title='Training' disabled={!this.domainStore.trainingPanelCanBeEnabled()}>
						<TrainingPanel
							uiStore={this.uiStore}
							domainStore={this.domainStore}
						/>
					</Item>
					<Item title='Testing' disabled={!this.domainStore.testingPanelCanBeEnabled()}>
						<TestingPanel
							uiStore={this.uiStore}
							domainStore={this.domainStore}
							testingManager={this.testingManager}
						/>
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

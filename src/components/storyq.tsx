import React, {Component} from 'react';
import 'devextreme/dist/css/dx.common.css';
import 'devextreme/dist/css/dx.light.compact.css';
/*
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faArrowLeft, faQuestionCircle} from '@fortawesome/free-solid-svg-icons'
*/
import codapInterface from "../lib/CodapInterface";
// import Button from 'devextreme-react/button';
import {
	initializePlugin,
	registerObservers
} from '../lib/codap-helper';
import '../storyq.css';
import {TabPanel} from "devextreme-react/ui/tab-panel";
import {Item} from "devextreme-react/tab-panel";
import {TargetPanel} from "./target_panel";
import {FeaturePanel} from "./feature_panel";
import dxTabPanel from "devextreme/ui/tab_panel";
import {UiStore} from "../stores/ui_store";
import {observer} from "mobx-react";
import {DomainStore} from "../stores/domain_store";
import {action} from "mobx";
import {TrainingPanel} from "./training_panel";
import {TestingPanel} from "./testing_panel";
import {kStoryQPluginName} from "../stores/store_types_and_constants";
import NotificationManager from "../managers/notification_manager";

const Storyq = observer(class Storyq extends Component<{}, {}> {
		private uiStore: UiStore
		private domainStore: DomainStore
		private notificationManager: NotificationManager
		private kPluginName = kStoryQPluginName;
		private kVersion = "2.13";
		private kInitialDimensions = {
			width: 429,
			height: 420
		};
		private tabPanel: dxTabPanel | null = null;	// Todo: necessary?

		constructor(props: any) {
			super(props);
			this.uiStore = new UiStore()
			this.domainStore = new DomainStore(this.uiStore)
			this.notificationManager = new NotificationManager(this.domainStore)
			this.restorePluginFromStore = this.restorePluginFromStore.bind(this);
			this.getPluginStore = this.getPluginStore.bind(this);
			this.saveTabPanelInstance = this.saveTabPanelInstance.bind(this);
			this.handleSelectionChanged = this.handleSelectionChanged.bind(this);

			codapInterface.on('update', 'interactiveState', '', this.restorePluginFromStore);
			codapInterface.on('get', 'interactiveState', '', this.getPluginStore);
			initializePlugin(this.kPluginName, this.kVersion, this.kInitialDimensions, this.restorePluginFromStore)
				.then(() => registerObservers());
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

		async restorePluginFromStore(iStorage: any) {
			if (iStorage) {
				this.uiStore.fromJSON(iStorage.uiStore);
				this.domainStore.fromJSON(iStorage.domainStore);
				await this.domainStore.targetStore.updateFromCODAP()
			}
		}

		saveTabPanelInstance(iInstance: any) {
			this.tabPanel = iInstance.component;
		}

		async handleSelectionChanged(e: any) {
			this.uiStore.tabPanelSelectedIndex = e.component.option('selectedIndex')
			await this.domainStore.targetStore.updateFromCODAP()
		}

		renderTabPanel() {
			return (
				<TabPanel
					id='tabPanel'
					selectedIndex={this.uiStore.tabPanelSelectedIndex}
					onInitialized={this.saveTabPanelInstance}
					onSelectionChanged={action(e => {
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

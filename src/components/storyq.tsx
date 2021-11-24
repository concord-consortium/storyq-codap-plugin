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
import {Prompt} from "./prompt";
import {FeaturePanel} from "./feature_panel";
import dxTabPanel from "devextreme/ui/tab_panel";
import {StoryqStorage} from "../storyq_types";
import {UiStore} from "../stores/ui_store";
import {observer} from "mobx-react";
import {DomainStore} from "../stores/domain_store";
import {action} from "mobx";
import {TrainingPanel} from "./training_panel";
import {TestingPanel} from "./testing_panel";
import {PromptsManager} from "../managers/promptsManager";

const Storyq = observer(class Storyq extends Component<{}, {}> {
		private uiStore: UiStore
		private domainStore: DomainStore
		private promptsManager: PromptsManager
		private kPluginName = "StoryQ Studio";
		private kVersion = "1.68";
		private kInitialDimensions = {
			width: 429,
			height: 420
		};
		private tabPanel: dxTabPanel | null = null;	// Todo: necessary?

		constructor(props: any) {
			super(props);
			this.uiStore = new UiStore()
			this.domainStore = new DomainStore(this.uiStore)
			this.promptsManager = new PromptsManager(this.uiStore, this.domainStore)
			this.restorePluginFromStore = this.restorePluginFromStore.bind(this);
			this.getPluginStore = this.getPluginStore.bind(this);
			this.saveTabPanelInstance = this.saveTabPanelInstance.bind(this);
			this.handleSelectionChanged = this.handleSelectionChanged.bind(this);

			codapInterface.on('update', 'interactiveState', '', this.restorePluginFromStore);
			codapInterface.on('get', 'interactiveState', '', this.getPluginStore);
			initializePlugin(this.kPluginName, this.kVersion, this.kInitialDimensions, this.restorePluginFromStore)
				.then(() => registerObservers());
		}

		getPluginStore(): StoryqStorage {
			return {
				success: true,
				values: {
					domainStore: this.domainStore.asJSON(),
					uiStore: this.uiStore.asJSON()
				}
			};
		}

		restorePluginFromStore(iStorage: any) {
			if (iStorage) {
				this.uiStore.fromJSON(iStorage.uiStore);
				this.domainStore.fromJSON(iStorage.domainStore);
			}
		}

		saveTabPanelInstance(iInstance: any) {
			this.tabPanel = iInstance.component;
		}

		handleSelectionChanged(e: any) {
			this.uiStore.tabPanelSelectedIndex = e.component.option('selectedIndex')
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
					<Item title='Target'>
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
						<Prompt promptsManager={this.promptsManager}/>
					</div>
				</div>
			);
		}
	}
)
export default Storyq;

import React, {Component} from 'react';
import 'devextreme/dist/css/dx.common.css';
import 'devextreme/dist/css/dx.light.compact.css';
/*
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faArrowLeft, faQuestionCircle} from '@fortawesome/free-solid-svg-icons'
*/
import codapInterface from "../lib/CodapInterface";
import Button from 'devextreme-react/button';
import {
	initializePlugin,
	registerObservers
} from '../lib/codap-helper';
import '../storyq.css';
import {TabPanel} from "devextreme-react/ui/tab-panel";
import {Item} from "devextreme-react/tab-panel";
import {TargetPanel} from "./target_panel";
import {Prompt} from "./prompt";
import {StoryqManager} from "../managers/storyq_manager";
import {FeaturePanel} from "./feature_panel";
import dxTabPanel from "devextreme/ui/tab_panel";
import {StoryqStorage} from "../storyq_types";
import {UiStore} from "../stores/ui_store";
import {observer} from "mobx-react";

interface StoryqState {
	tabPanelSelectedIndex:number
}

const Storyq = observer(class Storyq extends Component<{}, StoryqState> {
		private uiStore:UiStore
		private kPluginName = "StoryQ Studio";
		private kVersion = "1.5";
		private kInitialDimensions = {
			width: 429,
			height: 420
		};
		private tabPanel: dxTabPanel | null = null;	// Todo: necessary?

		private storyqManager: StoryqManager;

		private targetPanelCreateStorage: any;
		private targetPanelRestoreStorage: any;

		constructor(props: any) {
			super(props);
			this.uiStore = new UiStore()
			this.storyqManager = new StoryqManager({});
			this.state = { tabPanelSelectedIndex: 0 };
			this.restorePluginState = this.restorePluginState.bind(this);
			this.getPluginState = this.getPluginState.bind(this);
			this.saveTabPanelInstance = this.saveTabPanelInstance.bind(this);
			this.handleSelectionChanged = this.handleSelectionChanged.bind(this);

			codapInterface.on('update', 'interactiveState', '', this.restorePluginState);
			codapInterface.on('get', 'interactiveState', '', this.getPluginState);
			initializePlugin(this.kPluginName, this.kVersion, this.kInitialDimensions, this.restorePluginState)
				.then(() => registerObservers());
		}

		getPluginState(): StoryqStorage {
			return {
				success: true,
				values: {
					managerStorage: this.storyqManager.createStorage(),
					uiState: {
						tabPanelSelectedIndex: this.uiStore.tabPanelSelectedIndex
					}
				}
			};
		}

		async restorePluginState(iStorage:any) {
			if (iStorage) {
				// this.setState ({ tabPanelSelectedIndex: iStorage.uiState ? iStorage.uiState.tabPanelSelectedIndex : 0});
				this.uiStore.tabPanelSelectedIndex = iStorage.uiState.tabPanelSelectedIndex;
				this.storyqManager.restoreFromStorage(iStorage.managerStorage);
			}
		}

		saveTabPanelInstance(iInstance: any) {
			this.tabPanel = iInstance.component;
		}

		handleSelectionChanged(e: any) {
			this.uiStore.tabPanelSelectedIndex = e.component.option('selectedIndex');
		}

		renderTabPanel() {
			let this_ = this;
			return (
				<TabPanel
					id='tabPanel'
					selectedIndex={this_.uiStore.tabPanelSelectedIndex}
					onInitialized={this_.saveTabPanelInstance}
					onSelectionChanged={this_.handleSelectionChanged}
				>
					<Item title='Target'>
						<TargetPanel
							targetManager={this.storyqManager.targetManager}/>
					</Item>
					<Item title='Features'>
						{<FeaturePanel
							status={'active'}/>
						}
					</Item>
					<Item title='Training'>
						{}
					</Item>
					<Item title='Testing'>
						{}
					</Item>
				</TabPanel>
			);
		}

		public render() {

			return (
				<div className="storyq">
					{this.renderTabPanel()}
					<Prompt text={<p>Hello <strong>World!</strong></p>}/>
				</div>
			);
		}
	}
)
export default Storyq;

import React, {Component} from 'react';
import codapInterface from "./lib/CodapInterface";
import Button from 'react-bootstrap/Button';
import 'bootstrap/dist/css/bootstrap.min.css';
import {
	initializePlugin,
	openStory,
	openTable,
	registerObservers
} from './lib/codap-helper';
import './storyq.css';
import {TextManager, kStoryFeaturesContextName, kStoryTextComponentName} from './text_manager';
import DataManager from './data_manager';
import {FeatureManager, StorageCallbackFuncs} from './feature_manager';
// import {string} from "prop-types";

interface StoryqValues {
	mode: string,
	textManagerStorage: any,
	dataManagerStorage: any,
	featureManagerStorage: any
}

interface StoryqStorage {
	success: boolean,
	values: StoryqValues
}

class Storyq extends Component<{}, { className:string, mode:string}> {
	private kPluginName = "StoryQ";
	private kVersion = "0.6";
	private kInitialDimensions = {
		width: 250,
		height: 280
	};

	private textManager: TextManager;
	private dataManager: DataManager;
	private featureManagerCreateStorage:any;
	private featureManagerRestoreStorage:any;
	private stashedFeatureManagerStorage:any;

	constructor(props: any) {
		super(props);
		this.state = {className: 'storyText', mode: 'welcome'};
		this.dataManager = new DataManager();
		this.textManager = new TextManager( this.dataManager);

		this.writeStory = this.writeStory.bind(this);
		this.extractFeatures = this.extractFeatures.bind(this);
		this.restorePluginState = this.restorePluginState.bind(this);
		this.getPluginState = this.getPluginState.bind(this);
		this.setFeatureManagerStorageCallbacks = this.setFeatureManagerStorageCallbacks.bind(this);

		codapInterface.on('update', 'interactiveState', '', this.restorePluginState);
		codapInterface.on('get', 'interactiveState', '', this.getPluginState);
		initializePlugin(this.kPluginName, this.kVersion, this.kInitialDimensions, this.restorePluginState)
			.then(() => registerObservers());
	}

	getPluginState():StoryqStorage {
		return {
			success: true,
			values: {
				mode: this.state.mode,
				textManagerStorage: this.textManager.createStorage(),
				dataManagerStorage: this.dataManager.createStorage(),
				featureManagerStorage: this.featureManagerCreateStorage ? this.featureManagerCreateStorage() : null
			}
		};
	}

	async restorePluginState(iStorage: StoryqValues) {
		if( iStorage) {
			this.textManager.restoreFromStorage(iStorage.textManagerStorage);
			await this.dataManager.restoreFromStorage(iStorage.dataManagerStorage);
			this.stashedFeatureManagerStorage = iStorage.featureManagerStorage;
			if( this.featureManagerRestoreStorage && this.stashedFeatureManagerStorage) {
				this.featureManagerRestoreStorage(this.stashedFeatureManagerStorage);
				this.stashedFeatureManagerStorage = null;
			}
			this.setState( { className: this.state.className, mode: iStorage.mode || 'welcome'});
			if( this.state.mode === 'write') {
				this.textManager.setIsActive( true);
				await this.textManager.checkStory();
			}
			else
				this.textManager.setIsActive( false);
		}
	}

	public setFeatureManagerStorageCallbacks(iCallbackFuncs:StorageCallbackFuncs) {
		this.featureManagerCreateStorage = iCallbackFuncs.createStorageCallback;
		this.featureManagerRestoreStorage = iCallbackFuncs.restoreStorageCallback;
		if( this.stashedFeatureManagerStorage) {
			this.featureManagerRestoreStorage(this.stashedFeatureManagerStorage);
			// this.stashedFeatureManagerStorage = null;
		}
	}

	async writeStory() {
		this.textManager.setIsActive( true);
		this.setState({className: this.state.className, mode: 'write'});
		await this.dataManager.createDataContext( kStoryFeaturesContextName);
		openTable( kStoryFeaturesContextName);
		let textComponentID = await openStory(kStoryTextComponentName);
		this.textManager.setTextComponentID( textComponentID);
	}

	async extractFeatures() {
		this.textManager.setIsActive(false);
		this.setState({className: this.state.className, mode: 'extractFeatures'});
	}

	getPane() {
		switch (this.state.mode) {
			case 'welcome':
				return (<div className="button-list">
					<Button onClick={this.writeStory} variant="outline-primary">Write and Analyze a Story</Button>
					<br/><br/>
					<Button onClick={this.extractFeatures} variant="outline-primary">Analyze Phrases</Button>
				</div>);
			case 'write':
				return (<div>Enjoy writing and analyzing your story!</div>);
			case 'extractFeatures':
				let tStatus = (this.stashedFeatureManagerStorage && this.stashedFeatureManagerStorage.status) || 'active';
				return <FeatureManager status ={tStatus} setStorageCallbacks={this.setFeatureManagerStorageCallbacks}/>;
		}
	}

	public render() {
				return (
			<div className="storyq">
				<div className="title">
					Welcome to StoryQ
				</div>
				{this.getPane()}
			</div>
		);
	}
}

export default Storyq;

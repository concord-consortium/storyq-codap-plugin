import React, {Component} from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faArrowLeft} from '@fortawesome/free-solid-svg-icons'
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
import {WritingManager, kStoryFeaturesContextName, kStoryTextComponentName} from './writing_manager';
import DataManager from './data_manager';
import {FeatureManager, FM_StorageCallbackFuncs} from './feature_manager';
import {ClassificationManager, Classification_StorageCallbackFuncs} from './classification_manager';

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

class Storyq extends Component<{}, { className: string, mode: string }> {
	private kPluginName = "StoryQ";
	private kVersion = "0.8";
	private kInitialDimensions = {
		width: 250,
		height: 300
	};

	private textManager: WritingManager;
	private dataManager: DataManager;
	private featureManagerCreateStorage: any;
	private featureManagerRestoreStorage: any;
	private stashedFeatureManagerStorage: any;
	private classificationManagerCreateStorage: any;
	private classificationManagerRestoreStorage: any;
	private stashedClassificationManagerStorage: any;

	constructor(props: any) {
		super(props);
		this.state = {className: 'storyText', mode: 'welcome'};
		this.dataManager = new DataManager();
		this.textManager = new WritingManager(this.dataManager);

		this.writeStory = this.writeStory.bind(this);
		this.extractFeatures = this.extractFeatures.bind(this);
		this.classify = this.classify.bind(this);
		this.restorePluginState = this.restorePluginState.bind(this);
		this.getPluginState = this.getPluginState.bind(this);
		this.setFeatureManagerStorageCallbacks = this.setFeatureManagerStorageCallbacks.bind(this);
		this.setClassificationManagerStorageCallbacks = this.setClassificationManagerStorageCallbacks.bind(this);

		codapInterface.on('update', 'interactiveState', '', this.restorePluginState);
		codapInterface.on('get', 'interactiveState', '', this.getPluginState);
		initializePlugin(this.kPluginName, this.kVersion, this.kInitialDimensions, this.restorePluginState)
			.then(() => registerObservers());
	}

	getPluginState(): StoryqStorage {
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
		if (iStorage) {
			this.textManager.restoreFromStorage(iStorage.textManagerStorage);
			await this.dataManager.restoreFromStorage(iStorage.dataManagerStorage);
			this.stashedFeatureManagerStorage = iStorage.featureManagerStorage;
			if (this.featureManagerRestoreStorage && this.stashedFeatureManagerStorage) {
				this.featureManagerRestoreStorage(this.stashedFeatureManagerStorage);
				this.stashedFeatureManagerStorage = null;
			}
			if (this.classificationManagerCreateStorage && this.stashedClassificationManagerStorage) {
				this.classificationManagerRestoreStorage(this.stashedClassificationManagerStorage);
				this.stashedClassificationManagerStorage = null;
			}
			this.setState({className: this.state.className, mode: iStorage.mode || 'welcome'});
			if (this.state.mode === 'write') {
				this.textManager.setIsActive(true);
				await this.textManager.checkStory();
			} else
				this.textManager.setIsActive(false);
		}
	}

	public setFeatureManagerStorageCallbacks(iCallbackFuncs: FM_StorageCallbackFuncs) {
		this.featureManagerCreateStorage = iCallbackFuncs.createStorageCallback;
		this.featureManagerRestoreStorage = iCallbackFuncs.restoreStorageCallback;
		if (this.stashedFeatureManagerStorage) {
			this.featureManagerRestoreStorage(this.stashedFeatureManagerStorage);
			// this.stashedFeatureManagerStorage = null;
		}
	}

	public setClassificationManagerStorageCallbacks(iCallbackFuncs: Classification_StorageCallbackFuncs) {
		this.classificationManagerCreateStorage = iCallbackFuncs.createStorageCallback;
		this.classificationManagerRestoreStorage = iCallbackFuncs.restoreStorageCallback;
		if (this.stashedClassificationManagerStorage) {
			this.classificationManagerRestoreStorage(this.stashedClassificationManagerStorage);
			// this.stashedFeatureManagerStorage = null;
		}
	}

	async writeStory() {
		this.textManager.setIsActive(true);
		this.setState({className: this.state.className, mode: 'write'});
		await this.dataManager.createDataContext(kStoryFeaturesContextName);
		openTable(kStoryFeaturesContextName);
		let textComponentID = await openStory(kStoryTextComponentName);
		this.textManager.setTextComponentID(textComponentID);
	}

	extractFeatures() {
		this.textManager.setIsActive(false);
		this.setState({className: this.state.className, mode: 'extractFeatures'});
	}

	classify() {
		this.textManager.setIsActive(false);
		this.setState({className: this.state.className, mode: 'classify'});
	}

	backArrow() {
		return (
			<div className="back-arrow"
					 onClick={() => this.setState({mode: 'welcome'})}
					 title="Back Home">
				<FontAwesomeIcon icon={faArrowLeft}/>
			</div>
		);
	}

	welcome(includeBackArrow: boolean) {
		const arrow = includeBackArrow ? this.backArrow() : "";
		return (
			<div>
				{arrow}
				<div className="title">
					<p>Welcome to StoryQ</p>
				</div>
			</div>
		);
	}

	getPane() {
		switch (this.state.mode) {
			case 'welcome':
				return (
					<div>
						{this.welcome(false)}
						<div className="button-list">
							<Button onClick={this.writeStory} variant="outline-primary">Write and Analyze a Story</Button>
							<br/><br/>
							<Button onClick={this.extractFeatures} variant="outline-primary">Analyze Phrases</Button>
							<br/><br/>
							<Button onClick={this.classify} variant="outline-primary">Classify Phrases</Button>
						</div>
					</div>
				)
			case 'write':
				return (<div>
					{this.welcome(true)}
					<p>Enjoy writing and analyzing your story!</p>
				</div>);
			case 'extractFeatures':
				let tFMStatus = (this.stashedFeatureManagerStorage && this.stashedFeatureManagerStorage.status) || 'active';
				return (
					<div>
						{this.welcome(true)}
						<FeatureManager status={tFMStatus} setStorageCallbacks={this.setFeatureManagerStorageCallbacks}/>
					</div>);
			case 'classify':
				let tClassificationStatus = (this.stashedClassificationManagerStorage &&
					this.stashedClassificationManagerStorage.status) || 'active';
				return (
					<div>
						{this.welcome(true)}
						<ClassificationManager status={tClassificationStatus}
																	 setStorageCallbacks={this.setClassificationManagerStorageCallbacks}/>
					</div>);

		}
	}

	public render() {
		return (
			<div className="storyq">
				{this.getPane()}
			</div>
		);
	}
}

export default Storyq;

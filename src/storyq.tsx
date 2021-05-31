import React, {Component} from 'react';
import 'devextreme/dist/css/dx.common.css';
import 'devextreme/dist/css/dx.light.compact.css';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faArrowLeft,faQuestionCircle} from '@fortawesome/free-solid-svg-icons'
import codapInterface from "./lib/CodapInterface";
import Button from 'devextreme-react/button';
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
	featureManagerStorage: any,
	classificationManagerStorage: any
}

interface StoryqStorage {
	success: boolean,
	values: StoryqValues
}

class Storyq extends Component<{}, { className: string, mode: string }> {
	private kPluginName = "StoryQ";
	private kVersion = "0.99";
	private kInitialDimensions = {
		width: 280,
		height: 450
	};

	private writingManager: WritingManager;
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
		this.writingManager = new WritingManager(this.dataManager);

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
				textManagerStorage: this.writingManager.createStorage(),
				dataManagerStorage: this.dataManager.createStorage(),
				featureManagerStorage: this.featureManagerCreateStorage ? this.featureManagerCreateStorage() : null,
				classificationManagerStorage: this.classificationManagerCreateStorage ? this.classificationManagerCreateStorage() : null,
			}
		};
	}

	async restorePluginState(iStorage: StoryqValues) {
		if (iStorage) {
			this.writingManager.restoreFromStorage(iStorage.textManagerStorage);
			await this.dataManager.restoreFromStorage(iStorage.dataManagerStorage);
			this.stashedFeatureManagerStorage = iStorage.featureManagerStorage;
			if (this.featureManagerRestoreStorage && this.stashedFeatureManagerStorage) {
				this.featureManagerRestoreStorage(this.stashedFeatureManagerStorage);
				this.stashedFeatureManagerStorage = null;
			}
			this.stashedClassificationManagerStorage = iStorage.classificationManagerStorage;
			if (this.classificationManagerRestoreStorage && this.stashedClassificationManagerStorage) {
				this.classificationManagerRestoreStorage(this.stashedClassificationManagerStorage);
				this.stashedClassificationManagerStorage = null;
			}
			this.setState({className: this.state.className, mode: iStorage.mode || 'welcome'});
			if (this.state.mode === 'write') {
				this.writingManager.setIsActive(true);
				await this.writingManager.checkStory();
			} else
				this.writingManager.setIsActive(false);
		}
	}

	public setFeatureManagerStorageCallbacks(iCallbackFuncs: FM_StorageCallbackFuncs) {
		this.featureManagerCreateStorage = iCallbackFuncs.createStorageCallback;
		this.featureManagerRestoreStorage = iCallbackFuncs.restoreStorageCallback;
		if (this.stashedFeatureManagerStorage) {
			this.featureManagerRestoreStorage(this.stashedFeatureManagerStorage);
		}
	}

	public setClassificationManagerStorageCallbacks(iCallbackFuncs: Classification_StorageCallbackFuncs) {
		this.classificationManagerCreateStorage = iCallbackFuncs.createStorageCallback;
		this.classificationManagerRestoreStorage = iCallbackFuncs.restoreStorageCallback;
		if (this.stashedClassificationManagerStorage) {
			this.classificationManagerRestoreStorage(this.stashedClassificationManagerStorage);
		}
	}

	async writeStory() {
		this.writingManager.setIsActive(true);
		this.setState({ mode: 'write'});
		await this.dataManager.createDataContext(kStoryFeaturesContextName);
		openTable(kStoryFeaturesContextName);
		let textComponentID = await openStory(kStoryTextComponentName);
		this.writingManager.setTextComponentID(textComponentID);
	}

	extractFeatures() {
		this.writingManager.setIsActive(false);
		this.setState({mode: 'extractFeatures'});
	}

	classify(iMode:string) {
		this.writingManager.setIsActive(false);
		this.setState({mode: iMode});
	}

	backArrow() {
		return (
			<div className="back-arrow"
					 onClick={() => {
						 this.setState({mode: 'welcome'});
						 this.writingManager.setIsActive(false);
					 }}
					 title="Back Home">
				<FontAwesomeIcon icon={faArrowLeft}/>
			</div>
		);
	}

	questionMark() {
		return (
			<div className="question-circle"
					 onClick={() => {
					 	window.open("https://docs.google.com/document/d/16cYwR_2QIq24CHaL69o09shQSMeKk9gmXltBTM43q7A/edit?usp=sharing", "_blank");
					 }}
					 title="Learn how to use StoryQ">
				<FontAwesomeIcon icon={faQuestionCircle}/>
			</div>
		);
	}

	welcome(heading:string, includeBackArrow: boolean) {
		const arrow = includeBackArrow ? this.backArrow() : "";
		return (
			<div>
				{arrow}
				<div className="title">
					<p>{heading}</p>
				</div>
				{this.questionMark()}
			</div>
		);
	}

	getPane() {
		switch (this.state.mode) {
			case 'welcome':
				return (
					<div>
						{this.welcome('Welcome to StoryQ',false)}
						<div className="button-list">
							<Button onClick={this.writeStory} >Write and Analyze a Story</Button>
							<br/><br/>
							<Button onClick={this.extractFeatures} >Train a Model</Button>
							<br/><br/>
							<Button onClick={()=>this.classify('using')} >Use a Model</Button>
						</div>
					</div>
				)
			case 'write':
				return (<div>
					{this.welcome('Write and Analyze a Story',true)}
					<p>Enjoy writing and analyzing your story!</p>
				</div>);
			case 'extractFeatures':
				let tFMStatus = (this.stashedFeatureManagerStorage && this.stashedFeatureManagerStorage.status) || 'active';
				return (
					<div>
						{this.welcome('Train a Model',true)}
						<FeatureManager status={tFMStatus} setStorageCallbacks={this.setFeatureManagerStorageCallbacks}/>
					</div>);
			case 'using':
				let tClassificationStatus = this.state.mode;
				return (
					<div>
						{this.welcome('Classify using a Model',true)}
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

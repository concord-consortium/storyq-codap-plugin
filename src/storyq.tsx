import React, {Component} from 'react';
import codapInterface from "./lib/CodapInterface";
// import { AppRegistry, Text, TextInput, View } from 'react-native';
// import {natural} from 'natural'
import Button from 'react-bootstrap/Button';
import Dropdown from 'react-bootstrap/Dropdown';
import DropdownButton from 'react-bootstrap/DropdownButton';
import 'bootstrap/dist/css/bootstrap.min.css';
import {
	initializePlugin,
	openStory,
	openTable,
	registerObservers
} from './lib/codap-helper';
import './storyq.css';
import {TextManager} from './text_manager';
import DataManager from './data_manager';
import {FeatureManager} from './feature_manager';
// import {string} from "prop-types";

const kPluginName = "StoryQ";
const kVersion = "0.2a";
const kInitialDimensions = {
	width: 250,
	height: 200
}
const kDataContextName = "Story Measurements";
const kTextComponentName = 'A New Story';

class Storyq extends Component<{}, { value: string, className:string, mode:string}> {
	private textManager: TextManager;
	private dataManager: DataManager;
	private featureManager: FeatureManager;

	constructor(props: any) {
		super(props);
		this.state = {value: '', className: 'storyText', mode: 'welcome'};
		this.dataManager = new DataManager();
		this.textManager = new TextManager( this.dataManager);
		this.featureManager = new FeatureManager( {});
		this.setState( {mode: 'welcome'});

		this.writeStory = this.writeStory.bind(this);
		this.extractFeatures = this.extractFeatures.bind(this);
		this.restorePluginState = this.restorePluginState.bind(this);
		this.getPluginState = this.getPluginState.bind(this);

		codapInterface.on('update', 'interactiveState', '', this.restorePluginState);
		codapInterface.on('get', 'interactiveState', '', this.getPluginState);
	}

	public componentWillMount() {
		initializePlugin(kPluginName, kVersion, kInitialDimensions, this.restorePluginState)
			.then(() => registerObservers());
	}

	getPluginState(): any {
		return {
			success: true,
			values: {
				mode: this.state.mode,
				textManagerStorage: this.textManager.createStorage(),
				dataManagerStorage: this.dataManager.createStorage()
			}
		};
	}

	async restorePluginState(iStorage: any) {
		if( iStorage) {
			this.textManager.restoreFromStorage(iStorage.textManagerStorage);
			await this.dataManager.restoreFromStorage(iStorage.dataManagerStorage);
			this.setState( {mode: iStorage.mode || 'welcome'});
			this.textManager.checkStory();
		}
	}

	async writeStory(event: any) {
		this.setState({mode: 'write'});
		await this.dataManager.createDataContext( kDataContextName);
		openTable( kDataContextName);
		let textComponentID = await openStory(kTextComponentName);
		this.textManager.setTextComponentID( textComponentID);
	}

	async extractFeatures(event: any) {
		this.setState({mode: 'extractFeatures'});
	}

	getPane() {
		switch (this.state.mode) {
			case 'welcome':
				return (<div className="button-list">
					<Button onClick={this.writeStory} variant="outline-primary">Write and Analyze a Story</Button>
					<br/><br/>
					<Button onClick={this.extractFeatures} variant="outline-primary">Analyze Phrases</Button>
				</div>);
				break;
			case 'write':
				return (<div>Enjoy writing and analyzing your story!</div>);
				break;
			case 'extractFeatures':
				return this.featureManager.render();
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

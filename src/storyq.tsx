import React, {Component} from 'react';
import codapInterface from "./lib/CodapInterface";
// import { AppRegistry, Text, TextInput, View } from 'react-native';
// import {natural} from 'natural'
import {
	initializePlugin,
	openStory,
	openTable,
	registerObservers
} from './lib/codap-helper';
import './storyq.css';
import {TextManager} from './text_manager';
import DataManager from './data_manager';
import {string} from "prop-types";

const kPluginName = "StoryQ";
const kVersion = "0.2";
const kInitialDimensions = {
	width: 250,
	height: 150
}
const kDataContextName = "Story Measurements";
const kTextComponentName = 'A New Story';

class Storyq extends Component<{}, { value: string, className:string, mode:string}> {
	private textManager: TextManager;
	private dataManager: DataManager;

	constructor(props: any) {
		super(props);
		this.state = {value: '', className: 'storyText', mode: 'welcome'};
		this.dataManager = new DataManager();
		this.textManager = new TextManager( this.dataManager);
		this.setState( {mode: 'welcome'});

		this.writeStory = this.writeStory.bind(this);
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
				textManagerStorage: this.textManager.createStorage(),
				dataManagerStorage: this.dataManager.createStorage()
			}
		};
	}

	async restorePluginState(iStorage: any) {
		if( iStorage) {
			this.textManager.restoreFromStorage(iStorage.textManagerStorage);
			await this.dataManager.restoreFromStorage(iStorage.dataManagerStorage);
			this.setState( {mode: 'write'});
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

	public render() {
		let pane:any = (this.state.mode === 'welcome') ?
			(<div className="button-list">
				<button onClick={this.writeStory}>Write and Analyze a Story</button>
			</div>) :
			(<div>Enjoy writing and analyzing your story!</div>);

		return (
			<div className="storyq">
				<div className="title">
					Welcome to StoryQ
				</div>
				{pane}
			</div>
		);
	}
}

export default Storyq;

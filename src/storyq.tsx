import React, {Component} from 'react';
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
const kVersion = "0.1";
const kInitialDimensions = {
	width: 250,
	height: 150
}
const kDataContextName = "Story Measurements";
const kTextComponentName = 'A New Story';

class Storyq extends Component {
	private textManager: TextManager;
	private dataManager: DataManager;
	private mode:string;

	constructor(props: any) {
		super(props);
		this.state = {value: '', className: 'storyText', mode: 'welcome'};
		this.dataManager = new DataManager();
		this.textManager = new TextManager( this.dataManager);
		this.mode = 'welcome';

		this.writeStory = this.writeStory.bind(this);
	}

	public componentWillMount() {
		initializePlugin(kPluginName, kVersion, kInitialDimensions)
			.then(() => this.dataManager.createDataContext(kDataContextName)
				.then(() => registerObservers()));
	}

	async writeStory(event: any) {
		this.setState({mode: 'write'});
		this.mode = 'write';
		openTable( kDataContextName);
		let textComponentID = await openStory(kTextComponentName);
		this.textManager.setTextComponentID( textComponentID);
	}

	public render() {
		let pane:any = (this.mode === 'welcome') ?
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

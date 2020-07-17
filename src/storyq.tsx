import React, {Component} from 'react';
// import { AppRegistry, Text, TextInput, View } from 'react-native';
// import {natural} from 'natural'
import {initializePlugin, openTable, addData, createDataContext, processAndAddData, registerObservers} from './lib/codap-helper';
import './storyq.css';

const kPluginName = "StoryQ";
const kVersion = "0.1";
const kInitialDimensions = {
    width: 300,
    height: 500
}
const kDataContextName = "Story Measurements";

class StoryText extends Component<{}, { value: string, className: string }> {
    constructor(props: any) {
        super(props);
        this.state = {value: '', className: 'storyText'};

        this.handleChange = this.handleChange.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
    }

    handleChange(event: any) {
        this.setState({value: event.target.value});
    }

    handleSubmit(event: any) {
        processAndAddData( kDataContextName, this.state.value)
        event.preventDefault();
    }

    render() {
        return (
            <form onSubmit={this.handleSubmit}>
                <textarea className={this.state.className}
                          value={this.state.value} onChange={this.handleChange}/>
                <input type="submit" value="Submit" />
            </form>
        );
    }
}

class Storyq extends Component {
    public componentWillMount() {
        initializePlugin(kPluginName, kVersion, kInitialDimensions)
            .then(() => createDataContext(kDataContextName)
                .then(() => registerObservers()));
    }

    public render() {
        var tStoryText = <div><StoryText/></div>
        return (
            <div className="storyq">
                <div className="title">
                    Welcome to StoryQ
                </div>
                <div>
                    {tStoryText}
                </div>
            </div>
        );
    }

     private handleCreateData() {
        addData(kDataContextName, [1, 2, 3])
    }
}

export default Storyq;

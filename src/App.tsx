import React, { Component } from 'react';
import { initializePlugin, openTable, addData, createDataContext } from './lib/codap-helper';
import './App.css';

const kPluginName = "Sample Plugin";
const kVersion = "0.0.1";
const kInitialDimensions = {
  width: 200,
  height: 200
}
const kDataContextName = "SamplePluginData";

class App extends Component {
  public componentWillMount() {
    initializePlugin(kPluginName, kVersion, kInitialDimensions)
      .then(() => createDataContext(kDataContextName));
  }

  public render() {
    return (
      <div className="App">
        Hello World
        <div>
          <button onClick={this.handleOpenTable}>
            Open Table
          </button>
          <button onClick={this.handleCreateData}>
            Create some data
          </button>
        </div>
      </div>
    );
  }

  private handleOpenTable() {
    openTable();
  }

  private handleCreateData() {
    addData(kDataContextName, [1, 2, 3])
  }
}

export default App;

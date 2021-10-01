/**
 * This component lists constructed features and provides an interface for construction and deletion
 */

import React, {Component} from "react";
import {CheckBox} from "devextreme-react/check-box";
import {SelectBox} from "devextreme-react/select-box";
import Button from "devextreme-react/button";
import {TextBox} from "devextreme-react";
import OldFeatureConstructorBridge, {ConstructedFeature, WordListSpec} from "../feature_constructor_bridge";
import {SQ} from "../lists/personal-pronouns";
import codapInterface from "../lib/CodapInterface";

export interface FCState {
	otherFeaturesChecked: boolean,
	featureUnderConstruction: { kind: string, name: string },
	showingFeatureTemplate: boolean,
	containsFeatureOptions: {
		kindOfContains: string, 	// ['starts with', 'contains', 'does not contain', 'ends with']
		kindOfThingContained: string, // ['number', 'date', 'from list', 'free form text']
		caseOption: string,	// ['sensitive', 'insensitive']
		freeFormText: string,
		wordList: WordListSpec
	}
}

export interface FCStorage {
	fcState: FCState,
	constructedFeatures: ConstructedFeature[]
}

export interface FC_StorageCallbackFuncs {
	createStorageCallback: () => any,
	restoreStorageCallback: (iStorage: any) => void
}

export interface FC_Props {
	fcBridge: OldFeatureConstructorBridge,
	setStorageCallbacks: (iCallbacks: FC_StorageCallbackFuncs) => void
}

export const featureKinds = ['"contains" feature', '"count of" feature']
export const containsOptions = ['starts with', 'contains', 'does not contain', 'ends with']
export const kindOfThingContainedOptions = ['any number', 'any from list', 'free form text'/*, 'any date'*/]
export const caseOptions = ['sensitive', 'insensitive']

export class OldFeatureConstructor extends Component<FC_Props, FCState> {
	private wordListDatasetNames: WordListSpec[] = [];

	constructor(props: any) {
		super(props);
		this.state = {
			otherFeaturesChecked: false,
			featureUnderConstruction: {kind: '', name: ''},
			showingFeatureTemplate: false,
			containsFeatureOptions: {
				kindOfContains: '', kindOfThingContained: '',
				caseOption: caseOptions[0], freeFormText: '', wordList: {datasetName: '', firstAttributeName: ''}
			}
		}
		this.createStorage = this.createStorage.bind(this);
		this.restoreStorage = this.restoreStorage.bind(this);
		this.cancelFeatureConstruction = this.cancelFeatureConstruction.bind(this);
		this.completeFeatureConstruction = this.completeFeatureConstruction.bind(this);
	}

	public async componentDidMount() {
		this.props.setStorageCallbacks({
			createStorageCallback: this.createStorage,
			restoreStorageCallback: this.restoreStorage
		});
		await this.updateWordListDatasetNames();
	}

	public createStorage(): FCStorage {
		return {
			fcState: {
				otherFeaturesChecked: this.state.otherFeaturesChecked,
				featureUnderConstruction: this.state.featureUnderConstruction,
				showingFeatureTemplate: this.state.showingFeatureTemplate,
				containsFeatureOptions: this.state.containsFeatureOptions
			},
			constructedFeatures: this.props.fcBridge.createStorage(),
		}
	}

	public restoreStorage(iStorage: FCStorage) {
		if (iStorage.fcState) {
			this.setState({otherFeaturesChecked: iStorage.fcState.otherFeaturesChecked});
			this.setState({featureUnderConstruction: iStorage.fcState.featureUnderConstruction});
			this.setState({showingFeatureTemplate: iStorage.fcState.showingFeatureTemplate});
			this.setState({containsFeatureOptions: iStorage.fcState.containsFeatureOptions});
		}
		this.props.fcBridge.restoreFromStorage(iStorage.constructedFeatures);
	}

	async updateWordListDatasetNames() {
		let this_ = this;
		this.wordListDatasetNames = [];	// Start over
		let tContextListResult: any = await codapInterface.sendRequest({
			"action": "get",
			"resource": "dataContextList"
		}).catch((reason) => {
			console.log('unable to get datacontext list because ' + reason);
		});
		for (let index = 0; index < tContextListResult.values.length; index++) {
			let aValue = tContextListResult.values[index];
			let tCollectionsResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${aValue.id}].collectionList`
			}).catch((reason) => {
				console.log('unable to get collection list because ' + reason);
			});
			if (tCollectionsResult.values.length === 1) {
				let tAttributesResult: any = await codapInterface.sendRequest({
					action: 'get',
					resource: `dataContext[${aValue.id}].collection[${tCollectionsResult.values[0].id}].attributeList`
				}).catch((reason) => {
					console.log('unable to get attribute list because ' + reason);
				});
				if (tAttributesResult.values.length === 1) {
					this_.wordListDatasetNames.push({
						datasetName: aValue.title,
						firstAttributeName: tAttributesResult.values[0].name
					});
				}
			}
		}
	}

	createNewFeatureTemplate() {
		this.setState({showingFeatureTemplate: true})
	}

	checkBox(label: string, checked: boolean, disabled: boolean, setProp: any, key?: number) {
		return (
			<div key={key}>
				<CheckBox
					text={label}
					value={checked && !disabled}
					disabled={disabled}
					onValueChange={
						e => setProp(e)
					}
				/>
			</div>
		)
	}

	cancelFeatureConstruction() {
		this.setState({
			featureUnderConstruction: {kind: '', name: ''},
			showingFeatureTemplate: false
		})
	}

	completeFeatureConstruction() {
		this.props.fcBridge.addConstructedFeature(
			{
				name: this.state.featureUnderConstruction.name, chosen: true,
				info: {
					kind: this.state.featureUnderConstruction.kind,
					details: {
						containsOption: this.state.containsFeatureOptions.kindOfContains,
						kindOption: this.state.containsFeatureOptions.kindOfThingContained,
						caseOption: this.state.containsFeatureOptions.caseOption,
						freeFormText: this.state.containsFeatureOptions.freeFormText,
						wordList: this.state.containsFeatureOptions.wordList
					}
				},
				description: ''
			})
		this.setState({
			featureUnderConstruction: {kind: '', name: ''},
			showingFeatureTemplate: false,
			containsFeatureOptions: {
				kindOfContains: '', kindOfThingContained: '', caseOption: '',
				freeFormText: '',
				wordList: {datasetName: '', firstAttributeName: ''}
			}
		});
	}

	featureTemplate() {
		const this_ = this;

		function containsTemplate() {

			function freeForm() {
				return this_.state.containsFeatureOptions.kindOfThingContained === kindOfThingContainedOptions[2] ?
					(<div>
						<TextBox
							placeholder='type something here'
							onValueChanged={(e) => {
								this_.setState({
									containsFeatureOptions: {
										kindOfContains: this_.state.containsFeatureOptions.kindOfContains,
										kindOfThingContained: this_.state.containsFeatureOptions.kindOfThingContained,
										caseOption: this_.state.containsFeatureOptions.caseOption,
										freeFormText: e.value,
										wordList: this_.state.containsFeatureOptions.wordList
									}
								});
							}
							}
							value={this_.state.containsFeatureOptions.freeFormText}
						/>
						{/*
						<span> with </span>
						<SelectBox
							dataSource={caseOptions}
							defaultValue={this_.state.containsFeatureOptions.caseOption}
							placeholder={'choose case option'}
							style={{display: 'inline-block'}}
							onValueChange={(option: string) => {
								this_.setState({
									containsFeatureOptions: {
										kindOfContains: this_.state.containsFeatureOptions.kindOfContains,
										kindOfThingContained: this_.state.containsFeatureOptions.kindOfThingContained,
										caseOption: option,
										freeFormText: this_.state.containsFeatureOptions.freeFormText,
										wordList: this_.state.containsFeatureOptions.wordList
									}
								});
							}}
						/>
*/}
					</div>) : ""
			}

			function lists() {
				let tLists = Object.keys(SQ.lists);
				return this_.state.containsFeatureOptions.kindOfThingContained === kindOfThingContainedOptions[1] ?
					(<div>
						<SelectBox
							dataSource={tLists.concat(this_.wordListDatasetNames.map(iDataset => {
								return iDataset.datasetName;
							}))}
							defaultValue={this_.state.containsFeatureOptions.wordList}
							placeholder={'choose list'}
							style={{display: 'inline-block'}}
							onValueChange={(option: string) => {
								const tWordListSpec = this_.wordListDatasetNames.find((iSpec) => {
										return iSpec.datasetName === option;
									}),
									tAttributeName = tWordListSpec ? tWordListSpec.firstAttributeName : '';
								this_.setState({
									containsFeatureOptions: {
										kindOfContains: (tWordListSpec ? containsOptions[1] :
											this_.state.containsFeatureOptions.kindOfContains),
										kindOfThingContained: this_.state.containsFeatureOptions.kindOfThingContained,
										caseOption: this_.state.containsFeatureOptions.caseOption,
										freeFormText: this_.state.containsFeatureOptions.freeFormText,
										wordList: {datasetName: option, firstAttributeName: tAttributeName}
									}
								});
							}}
						/>
					</div>) : ""
			}

			return (
				<div className='sq-new-feature-item'>
					<SelectBox
						dataSource={containsOptions}
						value={this_.state.containsFeatureOptions.kindOfContains}
						placeholder={'choose kind of contains'}
						style={{display: 'inline-block'}}
						onValueChange={(option: string) => {
							this_.setState({
								containsFeatureOptions: {
									kindOfContains: option,
									kindOfThingContained: this_.state.containsFeatureOptions.kindOfThingContained,
									caseOption: this_.state.containsFeatureOptions.caseOption,
									freeFormText: this_.state.containsFeatureOptions.freeFormText,
									wordList: this_.state.containsFeatureOptions.wordList
								}
							});
						}}
					/>
					<SelectBox
						dataSource={kindOfThingContainedOptions}
						defaultValue={this_.state.containsFeatureOptions.kindOfThingContained}
						placeholder={'choose thing'}
						style={{display: 'inline-block'}}
						onValueChange={async (option: string) => {
							if (option === kindOfThingContainedOptions[1]) // any from list
								await this_.updateWordListDatasetNames();
							this_.setState({
								containsFeatureOptions: {
									kindOfContains: this_.state.containsFeatureOptions.kindOfContains,
									kindOfThingContained: option,
									caseOption: this_.state.containsFeatureOptions.caseOption,
									freeFormText: this_.state.containsFeatureOptions.freeFormText,
									wordList: this_.state.containsFeatureOptions.wordList
								}
							});
						}}
					/>
					{freeForm()}
					{lists()}
					<div className='sq-new-feature-name'>
						<span>Name of Feature</span>
						<TextBox
							placeholder="type the feature's name"
							onValueChanged={(e) => {
								this_.setState({
									featureUnderConstruction: {
										kind: this_.state.featureUnderConstruction.kind,
										name: e.value
									}
								});
							}}
							value={this_.state.featureUnderConstruction.name}
						/>
					</div>
				</div>
			);
		}

		function countOfTemplate() {
			return (<span>The <strong>count of</strong> feature is not yet implemented</span>);
		}

		function allFilledOut(): boolean {

			function freeFormOK() {
				return this_.state.containsFeatureOptions.kindOfContains !== '' &&
					this_.state.containsFeatureOptions.kindOfThingContained === kindOfThingContainedOptions[2] &&
					this_.state.containsFeatureOptions.freeFormText !== '';
			}

			function listOK() {
				return this_.state.containsFeatureOptions.kindOfContains !== '' &&
					this_.state.containsFeatureOptions.kindOfThingContained === kindOfThingContainedOptions[1] &&
					this_.state.containsFeatureOptions.wordList.datasetName !== '';
			}

			function otherOK() {
				return this_.state.containsFeatureOptions.kindOfContains !== '' &&
					this_.state.containsFeatureOptions.kindOfThingContained !== kindOfThingContainedOptions[1] &&
					this_.state.containsFeatureOptions.kindOfThingContained !== kindOfThingContainedOptions[2];
			}

			return (
				(this_.state.featureUnderConstruction.kind === featureKinds[0] ?
					(freeFormOK() || listOK() || otherOK())
					:
					false) &&
				this_.state.featureUnderConstruction.name !== ''
			);
		}

		return this.state.showingFeatureTemplate ?
			(<div className="sq-feature-template">
				{this.state.featureUnderConstruction.kind === featureKinds[0] ?
					containsTemplate() : countOfTemplate()}
				<Button
					className='sq-new-feature-button'
					onClick={this_.cancelFeatureConstruction}
				>
					Cancel
				</Button>
				<Button
					className='sq-new-feature-button'
					disabled={!allFilledOut()}
					onClick={this_.completeFeatureConstruction}
				>
					Done
				</Button>
			</div>) :
			'';
	}

	newFeatureControl() {
		return this.state.otherFeaturesChecked ?
			(
				<div className="sq-new-feature">
					<label>
						<SelectBox
							className='sq-new-feature-item'
							dataSource={featureKinds}
							placeholder={'Choose kind of new feature'}
							/*defaultValue={this.state.featureUnderConstruction.kind}*/
							value={this.state.featureUnderConstruction.kind}
							style={{display: 'inline-block'}}
							onValueChange={(e) => {
								this.setState({
									featureUnderConstruction: {
										kind: e,
										name: this.state.featureUnderConstruction.name
									}
								});
								this.createNewFeatureTemplate();
							}
							}
						>
						</SelectBox>
					</label>
					{this.featureTemplate()}
				</div>
			) : '';
	}

	render() {
		return (
			<div className='sq-feature-component'>
				{this.checkBox('Other features', this.state.otherFeaturesChecked, false,
					(newValue: boolean) => {
						this.setState({otherFeaturesChecked: newValue})
					})}
				{this.newFeatureControl()}
			</div>
		);
	}
}
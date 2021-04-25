/**
 * This component lists constructed features and provides an interface for construction and deletion
 */

import React, {Component} from "react";
import {CheckBox} from "devextreme-react/check-box";
import {SelectBox} from "devextreme-react/select-box";
import Button from "devextreme-react/button";
import {TextBox} from "devextreme-react";

export interface FCState {
	otherFeaturesChecked: boolean,
	constructedFeatures: { name: string, checked: boolean }[],
	featureUnderConstruction: { kind:string, name:string },
	showingFeatureTemplate: boolean,
	containsFeatureOptions: {
		kindOfContains: string, kindOfThingContained: string, caseOption: string,
		freeFormText: string
	}
}

export interface FC_StorageCallbackFuncs {
	createStorageCallback: () => any,
	restoreStorageCallback: (iStorage: any) => void
}

export interface FC_Props {
	setStorageCallbacks: (iCallbacks: FC_StorageCallbackFuncs) => void
}

export class FeatureConstructor extends Component<FC_Props, FCState> {
	private featureKinds = ['\"contains\" feature', '\"count of\" feature']
	private containsOptions = ['starts with', 'contains', 'does not contain', 'ends with']
	private kindOptions = ['number', 'date', 'from list', 'free form text']
	private caseOptions = ['all uppercase', 'all lowercase', 'any case']

	constructor(props: any) {
		super(props);
		this.state = {
			otherFeaturesChecked: true,
			constructedFeatures: [],
			featureUnderConstruction: {kind: '', name: ''},
			showingFeatureTemplate: false,
			containsFeatureOptions: {kindOfContains: '', kindOfThingContained: '', caseOption: '', freeFormText: ''}
		}
		this.createStorage = this.createStorage.bind(this);
		this.restoreStorage = this.restoreStorage.bind(this);
		this.cancelFeatureConstruction = this.cancelFeatureConstruction.bind(this);
		this.completeFeatureConstruction = this.completeFeatureConstruction.bind(this);
	}

	public async componentDidMount() {
		var this_ = this;
		this.props.setStorageCallbacks({
			createStorageCallback: this.createStorage,
			restoreStorageCallback: this.restoreStorage
		});
	}

	public createStorage(): FCState {
		return {
			otherFeaturesChecked: this.state.otherFeaturesChecked,
			constructedFeatures: this.state.constructedFeatures,
			featureUnderConstruction: this.state.featureUnderConstruction,
			showingFeatureTemplate: this.state.showingFeatureTemplate,
			containsFeatureOptions: this.state.containsFeatureOptions
		}
	}

	public restoreStorage(iStorage: FCState) {
		this.setState({otherFeaturesChecked: iStorage.otherFeaturesChecked});
		this.setState({constructedFeatures: iStorage.constructedFeatures});
		this.setState({featureUnderConstruction: iStorage.featureUnderConstruction});
		this.setState({showingFeatureTemplate: iStorage.showingFeatureTemplate});
		this.setState({containsFeatureOptions: iStorage.containsFeatureOptions});
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
			featureUnderConstruction: { kind: '', name: ''},
			showingFeatureTemplate: false
		})
	}

	completeFeatureConstruction() {
		let newFeaturesArray = this.state.constructedFeatures.concat(
			[{ name: this.state.featureUnderConstruction.name, checked: true }]);
		this.setState({
			constructedFeatures: newFeaturesArray,
			featureUnderConstruction: { kind: '', name: ''},
			showingFeatureTemplate: false
		});
		console.log(newFeaturesArray);
	}

	featureTemplate(kind: string) {
		const this_ = this;

		function containsTemplate() {

			function freeForm() {
				return this_.state.containsFeatureOptions.kindOfThingContained === this_.kindOptions[3] ?
					(<div>
						<TextBox
							hint='type something'
							onValueChanged={(e) => {
								this_.setState({
									containsFeatureOptions: {
										kindOfContains: this_.state.containsFeatureOptions.kindOfContains,
										kindOfThingContained: this_.state.containsFeatureOptions.kindOfThingContained,
										caseOption: this_.state.containsFeatureOptions.caseOption,
										freeFormText: e.value
									}
								});
							}
							}
							value={this_.state.containsFeatureOptions.freeFormText}
						></TextBox>
						<span> in </span>
						<SelectBox
							dataSource={this_.caseOptions}
							defaultValue={this_.state.containsFeatureOptions.caseOption}
							placeholder={'choose case option'}
							style={{display: 'inline-block'}}
							onValueChange={(option: string) => {
								this_.setState({
									containsFeatureOptions: {
										kindOfContains: this_.state.containsFeatureOptions.kindOfContains,
										kindOfThingContained: this_.state.containsFeatureOptions.kindOfThingContained,
										caseOption: option,
										freeFormText: this_.state.containsFeatureOptions.freeFormText
									}
								});
							}}
							/>
					</div>) : ""
			}

			return (
				<div className='sq-new-feature-item'>
					<SelectBox
						dataSource={this_.containsOptions}
						defaultValue={this_.state.containsFeatureOptions.kindOfContains}
						placeholder={'choose kind'}
						style={{display: 'inline-block'}}
						onValueChange={(option: string) => {
							this_.setState({
								containsFeatureOptions: {
									kindOfContains: option,
									kindOfThingContained: this_.state.containsFeatureOptions.kindOfThingContained,
									caseOption: this_.state.containsFeatureOptions.caseOption,
									freeFormText: this_.state.containsFeatureOptions.freeFormText
								}
							});
						}}
					/>
					<SelectBox
						dataSource={this_.kindOptions}
						defaultValue={this_.state.containsFeatureOptions.kindOfThingContained}
						placeholder={'choose thing'}
						style={{display: 'inline-block'}}
						onValueChange={(option: string) => {
							this_.setState({
								containsFeatureOptions: {
									kindOfContains: this_.state.containsFeatureOptions.kindOfContains,
									kindOfThingContained: option,
									caseOption: this_.state.containsFeatureOptions.caseOption,
									freeFormText: this_.state.containsFeatureOptions.freeFormText
								}
							});
						}}
					/>
					{freeForm()}
					<div className='sq-new-feature-name'>
						<span>Name of Feature</span>
						<TextBox
							hint='name'
							onValueChanged={(e) => {
								this_.setState({
									featureUnderConstruction: {
										kind: this_.state.featureUnderConstruction.kind,
										name: e.value
									}
								});
							}
							}
							value={this_.state.featureUnderConstruction.name}
						></TextBox>
					</div>
				</div>
			);
		}

		function countOfTemplate() {
			return (<span>This is a <strong>count of</strong> feature template</span>);
		}

		function allFilledOut():boolean {
			return (
				(this_.state.featureUnderConstruction.kind === this_.featureKinds[0] ?
					((this_.state.containsFeatureOptions.kindOfContains === 'free form text' &&
							this_.state.containsFeatureOptions.freeFormText !== '') ||
						this_.state.containsFeatureOptions.kindOfContains !== '' &&
						this_.state.containsFeatureOptions.kindOfContains !== 'free form text') &&
					this_.state.containsFeatureOptions.kindOfThingContained !== '' &&
					this_.state.containsFeatureOptions.caseOption !== ''
					:
					false) &&
					this_.state.featureUnderConstruction.name !== ''
			);
		}

		return this.state.showingFeatureTemplate ?
			(<div className="sq-feature-template">
				{this.state.featureUnderConstruction.kind === this.featureKinds[0] ?
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
						<Button
							className='sq-new-feature-item'
							disabled={this.state.featureUnderConstruction.kind === '' || this.state.showingFeatureTemplate}
							onClick={(obj: any) => {
								this.createNewFeatureTemplate();
								obj.event.preventDefault();
							}}>Create New</Button>
						<SelectBox
							className='sq-new-feature-item'
							dataSource={this.featureKinds}
							/*placeholder={'Choose one'}*/
							/*defaultValue={this.state.featureUnderConstruction.kind}*/
							value={this.state.featureUnderConstruction.kind}
							style={{display: 'inline-block'}}
							onValueChange={(e) => {
								this.setState({featureUnderConstruction: {kind: e,
										name: this.state.featureUnderConstruction.name}});
							}
							}
						>
						</SelectBox>
					</label>
					{this.featureTemplate(this.state.featureUnderConstruction.kind)}
				</div>
			) : '';
	}

	render() {
		return (
			<div className='sq-feature-constructor'>
				{this.checkBox('Other features', this.state.otherFeaturesChecked, false,
					(newValue: boolean) => {
						this.setState({otherFeaturesChecked: newValue})
					})}
				{this.newFeatureControl()}
			</div>
		);
	}
}
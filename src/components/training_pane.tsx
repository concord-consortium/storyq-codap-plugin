/**
 * This component provides the space for a user to name and run a model
 */

import React, {Component} from "react";
import {DomainStore} from "../stores/domain_store";
import {observer} from "mobx-react";
import {UiStore} from "../stores/ui_store";
import {TextBox} from "devextreme-react";
import {action} from "mobx";
import Button from "devextreme-react/button";
import {CheckBox} from "devextreme-react/check-box";
import {ModelManager} from "../managers/model_manager";
import {ProgressBar} from "./progress_bar";
import {TrainingResult} from "../stores/store_types_and_constants";

export interface Training_Props {
	uiStore: UiStore
	domainStore: DomainStore
}

export const TrainingPane = observer(class TrainingPane extends Component<Training_Props, {}> {

	private modelManager: ModelManager
	private nameBoxRef:any

	constructor(props: any) {
		super(props);
		this.nameBoxRef = React.createRef()
		this.modelManager = new ModelManager(this.props.domainStore)
	}

	render() {
		const this_ = this,
			tModel = this.props.domainStore.trainingStore.model,
			tNumResults = this.props.domainStore.trainingStore.trainingResults.length

		function modelTrainerInstructions() {
			if (!tModel.beingConstructed) {
				if (tNumResults === 0) {
					return (
						<div className='sq-info-prompt'>
							<p>Train your model with the features you have prepared.</p>
						</div>
					)
				}
				else {
					return (
						<div className='sq-info-prompt'>
							<p>You have trained {tNumResults} model{tNumResults > 1 ? 's' : ''}. Train another or
							proceed to <span
									onClick={action(()=>this_.props.domainStore.setPanel(3))}
									style={{cursor: 'pointer'}}
								>
								<strong>Testing</strong></span>.</p>
						</div>
					)
				}
			} else if (tModel.name === '') {
				return (
					<div className='sq-info-prompt'>
						<p>Your model must have a name before you can train it.</p>
					</div>
				)
			}
			else {
				return (
					<div className='sq-info-prompt'>
						<p>You can start training your model.</p>
					</div>
				)
			}
		}

		function modelTrainer() {
			const tFeatureString = this_.props.domainStore.featureStore.features.length < 2 ? 'this feature' : 'these features'

			function nameBox() {
				return (
					<TextBox
						className='sq-fc-part'
						ref = {this_.nameBoxRef}
						valueChangeEvent={'blur'}
						placeholder="Name"
						onValueChanged={action((e) => {
							tModel.name = e.value
						})}
						onFocusOut={action(() => {
							tModel.name = this_.modelManager.guaranteeUniqueModelName(tModel.name)
						})}
						onEnterKey={()=>this_.nameBoxRef.current.instance.blur()}
						value={tModel.name}
						maxLength={20}
					/>
				)
			}

			function featureList() {
				return (
					<div className='sq-indent'>
						<ul>
							{this_.props.domainStore.featureStore.getChosenFeatures().map((iFeature, iIndex) => {
								return (
									<li key={iIndex}><strong>{iFeature.name}</strong></li>
								)
							})}
						</ul>
					</div>
				)
			}

			function getButtons() {

				function trainButton() {
					if (!tInProgress) {
						const tHint = tInStepMode ? 'Click to complete the training without stepping' :
							'Click this to train your model.'
						return (
							<Button
								className='sq-button'
								disabled={tDisabled}
								onClick={action(async () => {
									if (tInStepMode) {
										this_.props.domainStore.trainingStore.model.trainingInStepMode = false
									} else {
										this_.props.uiStore.trainingPanelShowsEditor = false
										this_.props.domainStore.trainingStore.model.trainingInProgress = true
										await this_.modelManager.buildModel()
										this_.modelManager.nextStep()
									}
								})}
								hint={tHint}>
								{tInStepMode ? 'Finish' : 'Train'}
							</Button>)
					}
				}

				function stepButton() {
					if (!tInProgress || tInStepMode)
						return (
							<Button
								className='sq-button'
								disabled={tDisabled}
								onClick={action(async () => {
									const tInProgress = this_.props.domainStore.trainingStore.model.trainingInProgress
									if (!tInProgress) {
										this_.props.uiStore.trainingPanelShowsEditor = false
										this_.props.domainStore.trainingStore.model.trainingInProgress = true
										this_.props.domainStore.trainingStore.model.trainingInStepMode = true
										await this_.modelManager.buildModel()
									} else {
										this_.modelManager.nextStep()
									}
								})}
								hint={'Click to move one iteration forward in training this model.'}>
								Step
							</Button>
						)
				}

				function settingsButton() {
					if (!tInStepMode && !tInProgress)
						return (
							<Button
								className='sq-button'
								onClick={action(() => {
									this_.props.uiStore.trainingPanelShowsEditor = !this_.props.uiStore.trainingPanelShowsEditor
								})}
								hint={'Click to change the settings your model will use in training.'}>
								Settings
							</Button>
						)
				}

				function cancelButton() {
					return (
						<Button
							className='sq-button'
							onClick={action(async () => {
								await this_.modelManager.cancel()
							})}
							hint={'Click to cancel the training of this model.'}>
							Cancel
						</Button>
					)
				}

				const tDisabled = this_.props.domainStore.trainingStore.model.name === '',
					tInProgress = this_.props.domainStore.trainingStore.model.trainingInProgress,
					tInStepMode = this_.props.domainStore.trainingStore.model.trainingInStepMode
				return (
					<div className='sq-training-buttons'>
						{trainButton()}
						{stepButton()}
						{settingsButton()}
						{cancelButton()}
					</div>
				)
			}

			function getSettingsPanel() {
				const tIterationsHint = 'How many times the algorithm repeats its numerical approximation. More iterations' +
					' generally yield higher accuracy, up to a point, but training takes longer.'

				function iterationsBox() {
					return (
						<TextBox
							className='sq-fc-part'
							valueChangeEvent={'keyup'}
							placeholder="give your model a name"
							hint={tIterationsHint}
							onValueChanged={action((e) => {
								tModel.iterations = Number(e.value)
							})}
							value={String(tModel.iterations)}
							maxLength={4}
							width={40}
						/>
					)
				}

				function getCheckbox(iValue: boolean, iLabel: string, iHint: string, setter: (e: any) => void) {
					return (
						<CheckBox
							text={iLabel}
							hint={iHint}
							value={iValue}
							onValueChanged={
								action((e) => {
									setter(e)
								})
							}
						/>)
				}

				if (this_.props.uiStore.trainingPanelShowsEditor) {
					return (
						<div className='sq-training-settings-panel'>
							<div className='sq-fc-part'>
								<p style={{width: '50px'}}>Model Settings</p>
							</div>
							<div className='sq-training-settings'>
								<div className='sq-training-iterations'>
									<span title={tIterationsHint}>Iterations:</span>{iterationsBox()}
								</div>
								<div className='sq-training-checkboxes'>
									{getCheckbox(this_.props.domainStore.trainingStore.model.lockInterceptAtZero,
										'Lock intercept at zero',
										'Locking simplifies interpretation of feature weights but may introduce bias.',
										(e) => {
											this_.props.domainStore.trainingStore.model.lockInterceptAtZero = e.value
										})}
									{getCheckbox(this_.props.domainStore.trainingStore.model.usePoint5AsProbThreshold,
										'Use 0.5 as probability threshold',
										'The probability threshold defines the boundary between assignment to the two groups.',
										(e) => {
											this_.props.domainStore.trainingStore.model.usePoint5AsProbThreshold = e.value
										})}
								</div>
							</div>
						</div>
					)
				}
			}

			function getProgressBar() {
				if (this_.props.domainStore.trainingStore.model.trainingInProgress) {
					const tIterations = this_.props.domainStore.trainingStore.model.iterations,
						tCurrentIteration = this_.props.domainStore.trainingStore.model.iteration
					return (
						<ProgressBar
							percentComplete={Math.round(100 * tCurrentIteration / tIterations)}
						/>)
				}
			}

			if (!tModel.beingConstructed) {
				return (
					<Button
						className='sq-button'
						onClick={action(async () => {
							tModel.reset()
							tModel.beingConstructed = true
						})}
						hint={'Click this to begin training a new model with the current set of features.'}>
						+ New Model
					</Button>
				)
			} else {
				return (
					<div className='sq-component'>
						<div className='sq-component'>
							<span className='sq-fc-part'> Give your model a name:</span>{nameBox()}
						</div>
						<div>
							<p>Once trained,
								<strong>{tModel.name === '' ? 'your model ' : ' ' + (tModel.name + ' ')}</strong>
								will contain {tFeatureString}:</p>
							{featureList()}
						</div>
						{getButtons()}
						{getSettingsPanel()}
						{getProgressBar()}
					</div>
				)
			}
		}

		function getModelResults() {

			function getIsActiveButon(iIndex: number) {
				const tTrainingResult = tResults[iIndex],
					tIsDisabled = tResults.length < 2,
					tHint = tTrainingResult.isActive ? 'Click to make this model no longer active. This will hide its results' +
						' and weights' : 'Click to make this model active and show its results and weights.'
				return (
					<td
						style={{"textAlign": "center"}}
					>
						<CheckBox
							text=''
							value={tTrainingResult.isActive}
							disabled={tIsDisabled}
							style={{'fontSize': 'large'}}
							onValueChange={action(() => {
								this_.props.domainStore.setIsActiveForResultAtIndex(iIndex, !tTrainingResult.isActive)
							})}
							hint={tHint}
						/>
					</td>
				)
			}

			function getSettings(aResult: TrainingResult) {
				if (aResult.settings) {
					return (
						<div style={{"fontSize": "smaller", "textAlign": "left"}}>
							<p>{aResult.settings.iterations} iterations</p>
							<p>intercept {aResult.settings.locked ? '' : 'not'} locked</p>
							<p>threshold = {aResult.threshold.toFixed(2)}</p>
						</div>
					)
				}
			}

			const tResults = this_.props.domainStore.trainingStore.trainingResults
			if (tResults.length > 0) {
				return (
					<table>
						<thead>
						<tr>
							<th
								title={'If checked, the weights are shown for features as are the model\'s results in the training set'}>
								Active
							</th>
							<th>Model Name</th>
							<th title={'The settings in effect when this model was trained'}>Settings</th>
							<th title={'The percent of predicted labels that are correct'}>Accuracy</th>
							{/*<th title={'This number is 0% when the model did no better than chance.'}>Kappa</th>*/}
							<th title={'The features that were used to define this model'}>Features</th>
						</tr>
						</thead>
						<tbody className='sq-model-table'>
						{tResults.map((iResult, iIndex) => {
							const tFeatureNames = iResult.featureNames && iResult.featureNames.map(iName=>{
								return <p>{iName}</p>
							})
							return (
								<tr key={iIndex}>
									{getIsActiveButon(iIndex)}
									<td>{iResult.name}</td>
									<td>{getSettings(iResult)}</td>
									<td>{(100 * iResult.accuracy).toFixed(1)}%</td>
									{/*<td>{(100 * iResult.kappa).toFixed(1)}%</td>*/}
									<td>{tFeatureNames}</td>
								</tr>)

						})}
						</tbody>
					</table>
				)
			}
		}

		return (
			<div className='sq-training-pane'>
				{modelTrainerInstructions()}
				{modelTrainer()}
				{getModelResults()}
			</div>
		);
	}
})
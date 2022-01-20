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

interface TrainingPaneState {
	count: number,
}

interface TrainingPaneInfo {
	subscriberIndex: number
}

export interface Training_Props {
	uiStore: UiStore
	domainStore: DomainStore
}

export const TrainingPane = observer(class TrainingPane extends Component<Training_Props, TrainingPaneState> {

	private trainingPaneInfo: TrainingPaneInfo;
	private modelManager: ModelManager

	constructor(props: any) {
		super(props);
		this.state = {
			count: 0
		};
		this.trainingPaneInfo = {subscriberIndex: -1}
		this.modelManager = new ModelManager(this.props.domainStore)
	}

	render() {
		const this_ = this
		const tModel = this.props.domainStore.trainingStore.model
		const tFeatureString = this.props.domainStore.featureStore.features.length < 2 ? 'feature' : 'features'

		function modelTrainer() {

			function nameBox() {
				return (
					<TextBox
						className='sq-fc-part'
						valueChangeEvent={'keyup'}
						placeholder="give your model a name"
						onValueChanged={action((e) => {
							tModel.name = e.value
						})}
						onFocusOut={action(() => {
							tModel.name = this_.modelManager.guaranteeUniqueModelName(tModel.name)
						})}
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
					if (!tInProgress)
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
								})}>
								{tInStepMode ? 'Finish' : 'Train'}
							</Button>)
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
								})}>
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
								})}>
								Settings
							</Button>
						)
				}

				function cancelButton() {
					return (
						<Button
							className='sq-button'
							onClick={action(async() => {
								await this_.modelManager.cancel()
							})}>
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

				function iterationsBox() {
					return (
						<TextBox
							className='sq-fc-part'
							valueChangeEvent={'keyup'}
							placeholder="give your model a name"
							onValueChanged={action((e) => {
								tModel.iterations = Number(e.value)
							})}
							value={String(tModel.iterations)}
							maxLength={4}
							width={40}
						/>
					)
				}

				function getCheckbox(iValue: boolean, iLabel: string, setter: (e: any) => void) {
					return (
						<CheckBox
							text={iLabel}
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
									<span>Iterations:</span>{iterationsBox()}
								</div>
								<div className='sq-training-checkboxes'>
									{getCheckbox(this_.props.domainStore.trainingStore.model.lockInterceptAtZero,
										'Lock intercept at zero',
										(e) => {
											this_.props.domainStore.trainingStore.model.lockInterceptAtZero = e.value
										})}
									{getCheckbox(this_.props.domainStore.trainingStore.model.usePoint5AsProbThreshold,
										'Use 0.5 as probability threshold',
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
						})}>
						+ New Model
					</Button>
				)
			} else {
				return (
					<div className='sq-component'>
						<div className='sq-component'>
							<span className='sq-fc-part'> Model Name:</span>{nameBox()}
							<p>This model will be trained
								using <strong>{this_.props.domainStore.targetStore.targetDatasetInfo.title + ' '}</strong>
								and the following {tFeatureString}:</p>
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
					tIcon = tTrainingResult.isActive ? 'check' : '',
					tText = tTrainingResult.isActive ? '' : '◻︎'
				return (
					<td
						style={{"textAlign": "center"}}
					>
						<Button
							text={tText}
							style={{'fontSize': 'large'}}
							icon={tIcon}
							stylingMode='text'
							onClick={action(() => {
								this_.props.domainStore.setIsActiveForResultAtIndex(iIndex, !tTrainingResult.isActive)
							})}
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
							<th>Active</th>
							<th>Model Name</th>
							<th>Settings</th>
							<th>Accuracy</th>
							<th>Kappa</th>
							<th>Features</th>
						</tr>
						</thead>
						<tbody className='sq-model-table'>
						{tResults.map((iResult, iIndex) => {
							const tFeatureNames = iResult.featureNames ? iResult.featureNames.join() : ''
							return (
								<tr key={iIndex}>
									{getIsActiveButon(iIndex)}
									<td>{iResult.name}</td>
									<td>{getSettings(iResult)}</td>
									<td>{(100 * iResult.accuracy).toFixed(1)}%</td>
									<td>{(100 * iResult.kappa).toFixed(1)}%</td>
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
				{modelTrainer()}
				{getModelResults()}
			</div>
		);
	}
})
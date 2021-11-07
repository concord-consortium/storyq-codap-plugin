/**
 * This component provides the space for a user to construct and edit a feature
 */

import React, {Component} from "react";
import {
	SearchDetails,
	Feature,
	featureDescriptors, kKindOfThingOptionList, kKindOfThingOptionPunctuation
} from "../stores/store_types_and_constants";
import {DomainStore} from "../stores/domain_store";
import {observer} from "mobx-react";
import {UiStore} from "../stores/ui_store";
import {TextBox} from "devextreme-react";
import {action} from "mobx";
import {SelectBox} from "devextreme-react/select-box";
import {stopWords} from "../lib/stop_words";
import {NumericInput} from "./numeric_input";
import {CheckBox} from "devextreme-react/check-box";
import {SQ} from "../lists/lists";
import Button from "devextreme-react/button";

interface FeatureComponentInfo {
	subscriberIndex: number
}

export interface FeatureComponentProps {
	uiStore: UiStore
	domainStore: DomainStore
	feature: Feature
	shortened: boolean
}

export const FeatureComponent = observer(class FeatureComponent extends Component<FeatureComponentProps, {}> {

		private featureInfo: FeatureComponentInfo;

		constructor(props: any) {
			super(props);
			this.state = {
				count: 0
			};
			this.featureInfo = {subscriberIndex: -1}
		}

		async updateNonNtigramFeaturesDataset(iFeature: Feature) {
			if (!iFeature.inProgress) {
				await this.props.domainStore.targetStore.addOrUpdateFeatureToTarget(iFeature, true)
				switch (iFeature.info.kind) {
					case 'search':
					case 'count':
						await this.props.domainStore.updateNonNtigramFeaturesDataset()
						break
					case 'ngram':
						await this.props.domainStore.updateNgramFeatures()
						break
				}
			}
		}

		render() {
			const this_ = this

			function nameBox() {
				return (
					<TextBox
						className='sq-fc-part'
						valueChangeEvent={'keyup'}
						placeholder="type the feature's name"
						onValueChanged={action(async (e) => {
							tFeature.name = e.value
							await this_.updateNonNtigramFeaturesDataset(tFeature)
						})}
						value={tFeature.name}
						maxLength={20}
					/>
				)
			}

			function kindOfContainsChoice() {
				return (
					<SelectBox
						className='sq-new-feature-item sq-fc-part'
						dataSource={featureDescriptors.featureKinds}
						valueExpr='value'
						displayExpr='name'
						grouped={true}
						placeholder={'choose kind'}
						value={tContainsOption}
						style={{display: 'inline-block'}}
						onValueChanged={action(async (e) => {
							tFeature.infoChoice = e.value
							tFeature.info.kind = JSON.parse(e.value).kind
							tFeature.info.details = Object.assign(tFeature.info.details || {}, JSON.parse(e.value).details)
							if (tFeature.info.kind === 'ngram') {
								tFeature.info.frequencyThreshold = 4
								tFeature.info.ignoreStopWords = true
							}
							await this_.updateNonNtigramFeaturesDataset(tFeature)
						})}
					/>
				)
			}

			function kindOfThingContainedChoice() {
				if (tFeature.info.kind === 'search') {
					return (
						<SelectBox
							className='sq-new-feature-item sq-fc-part'
							dataSource={featureDescriptors.kindOfThingContainedOptions}
							placeholder={'choose thing'}
							value={tKindOption}
							style={{display: 'inline-block'}}
							onValueChanged={action(async (e) => {
								(tFeature.info.details as SearchDetails).what = e.value
								await this_.updateNonNtigramFeaturesDataset(tFeature)
							})}
						/>
					)
				}
			}

			function freeFormTextBox() {
				const tContainsDetails = tFeature.info.details as SearchDetails
				if (tContainsDetails && tContainsDetails.what === kKindOfThingOptionPunctuation) {
					return (
						<TextBox
							className='sq-fc-part'
							valueChangeEvent={'keyup'}
							placeholder="punctuation mark"
							onValueChanged={action(async (e) => {
								tContainsDetails.punctuation = e.value
								await this_.updateNonNtigramFeaturesDataset(tFeature)
							})}
							value={tContainsDetails.punctuation}
							maxLength={1}
						/>
					)
				}
			}

			function wordListChoice() {
				const tContainsDetails = tFeature.info.details as SearchDetails
				if (tContainsDetails && tContainsDetails.what === kKindOfThingOptionList) {
					const tWordListSpecs = this_.props.domainStore.featureStore.wordListSpecs,
						tWordListDatasetNames = tWordListSpecs.map(iDataset => {
							return iDataset.datasetName;
						}),
						tLists = Object.keys(SQ.lists).concat(tWordListDatasetNames)
					return (
						<SelectBox
							dataSource={tLists}
							defaultValue={tContainsDetails.wordList}
							placeholder={'choose list'}
							style={{display: 'inline-block'}}
							onValueChange={action((option) => {
								const tWordListSpec = tWordListSpecs.find((iSpec) => {
										return iSpec.datasetName === option
									})
								let tAttributeName = ''
								if (tWordListSpec) {
									tAttributeName = tWordListSpec.firstAttributeName
								}
								(tFeature.info.details as SearchDetails).wordList = {
									datasetName: option,
									firstAttributeName: tAttributeName
								}
							})}
						/>
					)
				}
			}

			function ngramSettings() {
				if (tFeature.info.kind === 'ngram')
					return (<div className='sq-feature-ngram-settings'>
						<CheckBox
							text=' Ignore stop words'
							value={tFeature.info.ignoreStopWords}
							hint={Object.keys(stopWords).join(', ')}
							onValueChange={
								action((e: boolean) => {
									tFeature.info.ignoreStopWords = e
								})
							}
						/>
						<NumericInput
							label='Frequency threshold'
							min={1}
							max={20}
							getter={() => tFeature.info.frequencyThreshold || 4}
							setter={action((newValue: number) => {
								tFeature.info.frequencyThreshold = newValue
							})
							}
						/>
					</div>)
			}

			const tFeature = this.props.feature
			const tContainsOption = tFeature.infoChoice ? tFeature.infoChoice : ''
			const tKindOption = tFeature.info.details ? (tFeature.info.details as SearchDetails).what : ''

			if(!this.props.shortened) {
				return (
					<div className='sq-component'>
						{nameBox()}
						<span
							className='sq-fc-part'
						>is defined as</span>
						{kindOfContainsChoice()}
						{kindOfThingContainedChoice()}
						{freeFormTextBox()}
						{wordListChoice()}
						{ngramSettings()}
					</div>
				)
			}
			else {
				return (
					<div className='sq-component'>
						<Button
							text=''
							icon='clear'
							onClick={action(() => {
								this_.props.domainStore.featureStore.deleteFeature(tFeature)
							})}
						/>
						<p><strong>{tFeature.name}:</strong> {tFeature.description}</p>
					</div>
				)
			}
		}
	}
)
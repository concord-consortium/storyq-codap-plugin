/**
 * This component provides the space for a user to construct and edit a feature
 */

import React, {Component} from "react";
import {
	Feature,
	featureDescriptors,
	kKindOfThingOptionList,
	kKindOfThingOptionPunctuation,
	kKindOfThingOptionText,
	SearchDetails
} from "../stores/store_types_and_constants";
import {DomainStore} from "../stores/domain_store";
import {observer} from "mobx-react";
import {UiStore} from "../stores/ui_store";
import {TextBox} from "./ui/text-box";
import {action, toJS} from "mobx";
import {SelectBox} from "./ui/select-box";
import {stopWords} from "../lib/stop_words";
import {CheckBox} from "./ui/check-box";
import {SQ} from "../lists/lists";
import {Button} from "./ui/button";
import {NumberBox} from "./ui/number-box";

import "./feature_component.scss";

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

		async updateFeaturesDataset(iFeature: Feature) {
			if (!iFeature.inProgress) {
				await this.props.domainStore.targetStore.addOrUpdateFeatureToTarget(iFeature, true)
				switch (iFeature.info.kind) {
					case 'search':
					case 'count':
					case 'column':
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

			/*
						function nameBox() {
							return (
								<TextBox
									className='sq-fc-part'
									valueChangeEvent={'keyup'}
									placeholder="type the feature's name"
									onValueChanged={action(async (e) => {
										tFeature.name = e.value
										await this_.updateFeaturesDataset(tFeature)
									})}
									value={tFeature.name}
									onFocusOut={action(() => {
										tFeature.name = this_.props.domainStore.featureStore.guaranteeUniqueFeatureName(tFeature.name)
									})}
									maxLength={20}
								/>
							)
						}
			*/

			function kindOfContainsChoice() {
				tFeatureDescriptors.featureKinds[2].items = this_.props.domainStore.targetStore.targetColumnFeatureNames.map(iColumnName => {
					return {
						name: iColumnName,
						value: `{"kind": "column", "details": {"columName":"${iColumnName}"}}`,
						key: 'Choose other columns as features'
					}
				})
				// @ts-ignore
				tFeatureDescriptors.featureKinds[1].items[0].disabled = this_.props.domainStore.featureStore.hasNgram()
				return (
					<SelectBox
						className='sq-new-feature-item sq-fc-part'
						dataSource={tFeatureDescriptors.featureKinds}
						placeholder={'choose a method'}
						value={tContainsOption}
						style={{display: 'inline-block'}}
						onValueChanged={action((e) => {
							tFeature.infoChoice = e.value
							tFeature.info.kind = JSON.parse(e.value).kind
							tFeature.info.details = Object.assign(tFeature.info.details || {}, JSON.parse(e.value).details)
							if (tFeature.info.kind === 'ngram') {
								tFeature.info.frequencyThreshold = 4
								tFeature.info.ignoreStopWords = true
							} else if (tFeature.info.kind === 'column') {
								tFeature.name = JSON.parse(e.value).details['columName']
								tFeature.type = 'column'
							}
							// await this_.updateFeaturesDataset(tFeature)
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
							placeholder={'choose from'}
							value={tKindOption}
							style={{display: 'inline-block'}}
							onValueChanged={action(async (e) => {
								(tFeature.info.details as SearchDetails).what = e.value as any
								await this_.updateFeaturesDataset(tFeature)
							})}
						/>
					)
				}
			}

			function freeFormTextBox() {
				const tContainsDetails = tFeature.info.details as SearchDetails
				if (tContainsDetails && tContainsDetails.what === kKindOfThingOptionText) {
					return (
						<TextBox
							className='sq-fc-part'
							placeholder="type something here"
							onValueChanged={action(async (e) => {
								tContainsDetails.freeFormText = e.value
								await this_.updateFeaturesDataset(tFeature)
							})}
							value={tContainsDetails.freeFormText}
							maxLength={100}
						/>
					)
				}
			}

			function punctuationChoice() {
				const tContainsDetails = tFeature.info.details as SearchDetails
				if (tContainsDetails && tContainsDetails.what === kKindOfThingOptionPunctuation) {
					return (
						<TextBox
							className='sq-fc-part'
							placeholder="punctuation mark"
							onValueChanged={action(async (e) => {
								tContainsDetails.punctuation = e.value
								await this_.updateFeaturesDataset(tFeature)
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

					const handleValueChange = action((option: string) => {
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
					})

					return (
						<SelectBox
							className='word-list-select'
							dataSource={tLists}
							defaultValue={tContainsDetails.wordList}
							placeholder={'choose list'}
							style={{display: 'inline-block'}}
							onValueChange={handleValueChange}
							value={tContainsDetails?.wordList.datasetName}
						/>
					)
				}
			}

			function ngramSettings() {
				if (tFeature.info.kind === 'ngram')
					return (<div className='sq-feature-ngram-settings'>
						<CheckBox
							text=' Ignore stopwords'
							value={!!tFeature.info.ignoreStopWords}
							hint={Object.keys(stopWords).join(', ')}
							onValueChanged={
								action((e) => {
									tFeature.info.ignoreStopWords = !tFeature.info.ignoreStopWords;
								})
							}
						/>
						<div className='sq-feature-ngram-ignore-settings'>
							<span>Ignore words that appear fewer than </span>
							<NumberBox
								width={40}
								min={1}
								max={100}
								value={tFeature.info.frequencyThreshold}
								onValueChanged={action((e) => {
									tFeature.info.frequencyThreshold = e.value
								})}
							/>
							<span> times</span>
						</div>
					</div>)
			}

			const tFeature = this.props.feature
			const tFeatureDescriptors = toJS(featureDescriptors)
			const tContainsOption = tFeature.infoChoice ? tFeature.infoChoice : ''
			const tKindOption = tFeature.info.details ? (tFeature.info.details as SearchDetails).what : ''

			if (!this.props.shortened) {
				return (
					<div className='sq-component'>
						{kindOfContainsChoice()}
						{kindOfThingContainedChoice()}
						{freeFormTextBox()}
						{punctuationChoice()}
						{wordListChoice()}
						{ngramSettings()}
					</div>
				)
			} else {
				const tHint = tFeature.chosen ? SQ.hints.featureTableCheckboxRemove :
					SQ.hints.featureTableCheckboxAdd
				return (
					<div className='sq-component'>
						<CheckBox
							text=''
							value={tFeature.chosen}
							onValueChanged={action(async () => {
								await this.props.domainStore.featureStore.toggleChosenFor(tFeature)
								console.log(`type = ${tFeature.type}; chosen = ${tFeature.chosen}`)
								if( tFeature.type === 'unigram' && tFeature.chosen)
									this.props.domainStore.updateNgramFeatures()
							})}
							hint={tHint}
						/>
						<p><strong>{tFeature.name}</strong></p>
						<Button
							className='sq-feature-delete'
							text=''
							icon='clear'
							onClick={action(async () => {
								await this_.props.domainStore.featureStore.deleteFeature(tFeature)
								await this_.props.domainStore.clearText()
							})}
							hint={SQ.hints.featureTableRemove}
						/>
					</div>
				)
			}
		}
	}
)
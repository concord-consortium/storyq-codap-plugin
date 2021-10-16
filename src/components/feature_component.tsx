/**
 * This component provides the space for a user to construct and edit a feature
 */

import React, {Component} from "react";
import {
	SearchDetails,
	DomainStore,
	Feature,
	featureDescriptors, kKindOfThingOptionText
} from "../stores/domain_store";
import {observer} from "mobx-react";
import {UiStore} from "../stores/ui_store";
import {TextBox} from "devextreme-react";
import {action} from "mobx";
import {SelectBox} from "devextreme-react/select-box";
import {stopWords} from "../lib/stop_words";
import {NumericInput} from "./numeric_input";
import {CheckBox} from "devextreme-react/check-box";

interface FeatureComponentInfo {
	subscriberIndex: number
}

export interface FeatureComponentProps {
	uiStore: UiStore
	domainStore: DomainStore
	feature: Feature
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
						await this.props.domainStore.updateFeaturesDataset()
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
							await this_.updateFeaturesDataset(tFeature)
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
							if( tFeature.info.kind === 'ngram') {
								tFeature.info.frequencyThreshold = 4
								tFeature.info.ignoreStopWords = true
							}
							await this_.updateFeaturesDataset(tFeature)
						})}
					/>
				)
			}

			function kindOfThingContainedChoice() {
				if( tFeature.info.kind === 'search') {
					return (
						<SelectBox
							className='sq-new-feature-item sq-fc-part'
							dataSource={featureDescriptors.kindOfThingContainedOptions}
							placeholder={'choose thing'}
							value={tKindOption}
							style={{display: 'inline-block'}}
							onValueChanged={action(async (e) => {
								(tFeature.info.details as SearchDetails).what = e.value
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
							valueChangeEvent={'keyup'}
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

			function ngramSettings() {
				if( tFeature.info.kind === 'ngram')
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
							setter={action((newValue:number)=>{
									tFeature.info.frequencyThreshold = newValue
								})
							}
						/>
					</div>)
			}

			const tFeature = this.props.feature
			const tContainsOption = tFeature.infoChoice ? tFeature.infoChoice : ''
			const tKindOption = tFeature.info.details ? (tFeature.info.details as SearchDetails).what : ''

			return (
				<div className='sq-component'>
					{nameBox()}
					<span
						className='sq-fc-part'
					>is defined as</span>
					{kindOfContainsChoice()}
					{kindOfThingContainedChoice()}
					{freeFormTextBox()}
					{ngramSettings()}
				</div>
			)
		}
	}
)
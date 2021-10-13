/**
 * This component provides the space for a user to construct and edit a feature
 */

import React, {Component} from "react";
import {
	ContainsDetails,
	DomainStore,
	Feature,
	featureDescriptors, kKindOfThingOptionText
} from "../stores/domain_store";
import {observer} from "mobx-react";
import {UiStore} from "../stores/ui_store";
import {TextBox} from "devextreme-react";
import {action} from "mobx";
import {SelectBox} from "devextreme-react/select-box";

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
				await this.props.domainStore.updateFeaturesDataset()
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

			/*function kindOfFeatureChoice() {
				return (
					<SelectBox
						className='sq-new-feature-item sq-fc-part'
						dataSource={featureDescriptors.featureKinds}
						placeholder={'Choose kind of new feature'}
						value={tFeature.info.kind}
						style={{display: 'inline-block'}}
						onValueChanged={action(async (e) => {
							tFeature.info.kind = e.value
							await this_.updateFeaturesDataset(tFeature)
						})}
					/>
				)
			}*/

			function kindOfContainsChoice() {
				return (
					<SelectBox
						className='sq-new-feature-item sq-fc-part'
						dataSource={featureDescriptors.containsOptions}
						placeholder={'choose kind of contains'}
						value={tContainsOption}
						style={{display: 'inline-block'}}
						onValueChanged={action(async (e) => {
							(tFeature.info.details as ContainsDetails).containsOption = e.value
							await this_.updateFeaturesDataset(tFeature)
						})}
					/>
				)
			}

			function kindOfThingContainedChoice() {
				return (
					<SelectBox
						className='sq-new-feature-item sq-fc-part'
						dataSource={featureDescriptors.kindOfThingContainedOptions}
						placeholder={'choose thing'}
						value={tKindOption}
						style={{display: 'inline-block'}}
						onValueChanged={action(async (e) => {
							(tFeature.info.details as ContainsDetails).kindOption = e.value
							await this_.updateFeaturesDataset(tFeature)
						})}
					/>
				)
			}

			function freeFormTextBox() {
				const tContainsDetails = tFeature.info.details as ContainsDetails
				if (tContainsDetails.kindOption === kKindOfThingOptionText) {
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

			const tFeature = this.props.feature
			const tContainsOption = tFeature.info.details ? (tFeature.info.details as ContainsDetails).containsOption : ''
			const tKindOption = tFeature.info.details ? (tFeature.info.details as ContainsDetails).kindOption : ''

			return (
				<div className='sq-component'>
					{nameBox()}
					<span
						className='sq-fc-part'
					>is defined as</span>
					{/*{kindOfFeatureChoice()}*/}
					{kindOfContainsChoice()}
					{kindOfThingContainedChoice()}
					{freeFormTextBox()}
				</div>
			)
		}
	}
)
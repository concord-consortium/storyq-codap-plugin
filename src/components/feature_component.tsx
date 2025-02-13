/**
 * This component provides the space for a user to construct and edit a feature
 */

import { action } from "mobx";
import { observer } from "mobx-react";
import React from "react";
import { stopWords } from "../lib/stop_words";
import { SQ } from "../lists/lists";
import { domainStore } from "../stores/domain_store";
import { featureStore } from "../stores/feature_store";
import {
	Feature, featureDescriptors, isWhatOption, kFeatureKindColumn, kFeatureKindCount, kFeatureKindNgram,
	kFeatureKindSearch, kWhatOptionList, kWhatOptionPunctuation, kWhatOptionText, SearchDetails
} from "../stores/store_types_and_constants";
import { targetStore } from "../stores/target_store";
import { textStore } from "../stores/text_store";
import { Button } from "./ui/button";
import { CheckBox } from "./ui/check-box";
import { NumberBox } from "./ui/number-box";
import { SelectBox } from "./ui/select-box";
import { TextBox } from "./ui/text-box";

import "./feature_component.scss";

export interface FeatureComponentProps {
	feature: Feature
	shortened: boolean
}

export const FeatureComponent = observer(function FeatureComponent({ feature, shortened }: FeatureComponentProps) {
	if (shortened) {
		const tHint = feature.chosen ? SQ.hints.featureTableCheckboxRemove :
			SQ.hints.featureTableCheckboxAdd
		return (
			<div className='sq-component'>
				<CheckBox
					text=''
					value={feature.chosen}
					onValueChanged={action(async () => {
						await featureStore.toggleChosenFor(feature);
						if (feature.type === 'unigram' && feature.chosen) domainStore.updateNgramFeatures();
					})}
					hint={tHint}
				/>
				<p><strong>{feature.name}</strong></p>
				<Button
					className='sq-feature-delete'
					text=''
					icon='clear'
					onClick={action(async () => {
						await featureStore.deleteFeature(feature)
						await textStore.clearText()
					})}
					hint={SQ.hints.featureTableRemove}
				/>
			</div>
		);
	}

	const featureDetails = feature.info.details as SearchDetails;

	const updateFeaturesDataset = async (iFeature: Feature) => {
		if (!iFeature.inProgress) {
			await targetStore.addOrUpdateFeatureToTarget(iFeature, true)
			switch (iFeature.info.kind) {
				case kFeatureKindSearch:
				case kFeatureKindCount:
				case kFeatureKindColumn:
					await domainStore.updateNonNtigramFeaturesDataset()
					break
				case kFeatureKindNgram:
					await domainStore.updateNgramFeatures()
					break
			}
		}
	};

	function kindOfContainsChoice() {
		featureDescriptors.featureKinds[2].items = targetStore.targetColumnFeatureNames.map(iColumnName => {
			return {
				name: iColumnName,
				value: { kind: "column", details: { columnName: `${iColumnName}`} },
				key: 'Choose other columns as features'
			}
		})
		// @ts-ignore
		featureDescriptors.featureKinds[1].items[0].disabled = featureStore.hasNgram()
		return (
			<SelectBox
				className='sq-new-feature-item sq-fc-part'
				dataSource={featureDescriptors.featureKinds}
				placeholder={'choose a method'}
				value={feature.infoChoice ?? ""}
				style={{display: 'inline-block'}}
				onValueChanged={action(value => {
					feature.infoChoice = value;
					feature.info.kind = JSON.parse(value).kind;
					feature.info.details = Object.assign(feature.info.details || {}, JSON.parse(value).details);
					if (feature.info.kind === kFeatureKindNgram) {
						feature.info.frequencyThreshold = 4;
						feature.info.ignoreStopWords = true;
					} else if (feature.info.kind === kFeatureKindColumn) {
						feature.name = JSON.parse(value).details['columnName'];
						feature.type = 'column';
					}
				})}
			/>
		)
	}

	function kindOfThingContainedChoice() {
		if (feature.info.kind === kFeatureKindSearch) {
			return (
				<SelectBox
					className='sq-new-feature-item sq-fc-part'
					dataSource={featureDescriptors.kindOfThingContainedOptions}
					placeholder={'choose from'}
					value={featureDetails?.what ?? ""}
					style={{display: 'inline-block'}}
					onValueChanged={action(async value => {
						if (isWhatOption(value)) (feature.info.details as SearchDetails).what = value;
						await updateFeaturesDataset(feature);
					})}
				/>
			)
		}
	}

	function freeFormTextBox() {
		if (featureDetails && featureDetails.what === kWhatOptionText) {
			return (
				<TextBox
					className='sq-fc-part'
					placeholder="type something here"
					onValueChanged={action(async value => {
						featureDetails.freeFormText = value;
						await updateFeaturesDataset(feature);
					})}
					value={featureDetails.freeFormText}
					maxLength={100}
				/>
			)
		}
	}

	function punctuationChoice() {
		if (featureDetails && featureDetails.what === kWhatOptionPunctuation) {
			return (
				<TextBox
					className='sq-fc-part'
					placeholder="punctuation mark"
					onValueChanged={action(async value => {
						featureDetails.punctuation = value;
						await updateFeaturesDataset(feature);
					})}
					value={featureDetails.punctuation}
					maxLength={1}
				/>
			)
		}
	}

	function wordListChoice() {
		if (featureDetails && featureDetails.what === kWhatOptionList) {
			const tWordListSpecs = featureStore.wordListSpecs,
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
				(feature.info.details as SearchDetails).wordList = {
					datasetName: option,
					firstAttributeName: tAttributeName
				}
			})

			return (
				<SelectBox
					className='word-list-select'
					dataSource={tLists}
					defaultValue={featureDetails.wordList.datasetName}
					placeholder={'choose list'}
					style={{display: 'inline-block'}}
					onValueChange={handleValueChange}
					value={featureDetails?.wordList.datasetName}
				/>
			)
		}
	}

	function ngramSettings() {
		if (feature.info.kind === kFeatureKindNgram)
			return (<div className='sq-feature-ngram-settings'>
				<CheckBox
					text=' Ignore stopwords'
					value={!!feature.info.ignoreStopWords}
					hint={Object.keys(stopWords).join(', ')}
					onValueChanged={action(() => feature.info.ignoreStopWords = !feature.info.ignoreStopWords)}
				/>
				<div className='sq-feature-ngram-ignore-settings'>
					<span>Ignore words that appear fewer than </span>
					<NumberBox
						width={40}
						min={1}
						max={100}
						value={feature.info.frequencyThreshold}
						onValueChanged={action(value => feature.info.frequencyThreshold = value)}
					/>
					<span> times</span>
				</div>
			</div>)
	}

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
});

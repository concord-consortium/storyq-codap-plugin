/**
 * This component manages the lower part of the TargetPanel
 */

import { observer } from "mobx-react";
import React from "react";
import { SQ } from "../lists/lists";
import { otherClassColumn, targetStore } from "../stores/target_store";
import { RadioGroup } from "./ui/radio-group";

export const TargetTextArea = observer(function TargetTextArea() {
	const tTargetClassNames = targetStore.targetClassNames,
		tLeftColumnKey = targetStore.targetLeftColumnKey,
		tLeftColumnValue = targetStore.targetClassNames[tLeftColumnKey],
		tRightColumnKey = otherClassColumn(tLeftColumnKey),
		tRightColumnValue = targetStore.targetClassNames[tRightColumnKey],
		tChosenColumnKey = targetStore.targetChosenClassColumnKey,
		tChosenColumnValue = targetStore.getTargetClassName(tChosenColumnKey);

	function getTexts(iClassName: string) {
		const tTargetAttr = targetStore.targetAttributeName;
		if (targetStore.targetCases.length > 0) {
			const tFilteredCases = targetStore.targetCases.filter(iCase => {
				return iClassName === '' || iCase.values[targetStore.targetClassAttributeName] === iClassName
			})
			return (
				<div className='sq-text-container'>
					<div className='sq-target-texts'>
						{tFilteredCases.slice(0, 40).map((iCase, iIndex) => {
							return <p className='sq-text-card' key={iIndex}>
								{iCase.values[tTargetAttr]}
							</p>
						})}
					</div>
				</div>
			)
		}
	}

	/**
	 * If index is zero we want the radio button for the 'left' column
	 * @param index
	 */
	function getTargetClassName(index: number) {
		if (targetStore.targetClassAttributeValues.length === 2) {
			const
				tDesiredColumnValue = index === 0 ? tLeftColumnValue : tRightColumnValue
			return (
				<div className='sq-target-choice'>
					<RadioGroup
						items={[tDesiredColumnValue]}
						value={tChosenColumnValue}
						onValueChange={() => targetStore.setTargetChosenClassColumnKey(index === 0 ? tLeftColumnKey : tRightColumnKey)}
						hint={SQ.hints.targetTwoGroups}
					/>
				</div>
			)
		}
	}

	if (targetStore.targetClassAttributeName !== '') {
		const tLeftClassName = tTargetClassNames[tLeftColumnKey],
			tRightClassName = tTargetClassNames[tRightColumnKey]
		return (
			<div className='sq-target-lower-panel'>
				<div className='sq-target-text-panel'>
					{getTargetClassName(0)}
					{getTexts(tLeftClassName)}
				</div>
				<div className='sq-target-text-panel'>
					{getTargetClassName(1)}
					{getTexts(tRightClassName)}
				</div>
			</div>
		);
	} else if (targetStore.targetAttributeName !== '') {
		return (
			<div className='sq-target-lower-panel'>
				<div className='sq-target-text-panel'>
					{getTexts('')}
				</div>
			</div>
		)
	}

	return null;
});

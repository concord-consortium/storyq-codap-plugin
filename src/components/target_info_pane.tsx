/**
 * This component manages the lower part of the TargetPanel
 */

import { observer } from "mobx-react";
import React from "react";
import { targetStore } from "../stores/target_store";

export const TargetInfoPane = observer(function TargetInfoPane() {
	function getInfo() {
		if (targetStore.targetDatasetInfo.title !== '') {
			const tNegKey = targetStore.targetChosenClassColumnKey === 'left' ? 'right' : 'left';
			const tNegName = targetStore.targetClassNames[tNegKey];
			
			return (
				<div className="sq-info-row">
					<div className="sq-info-column">
						<p>Text: <strong>{targetStore.targetAttributeName}</strong></p>
						<p>Labels: <strong>{targetStore.targetClassAttributeName}</strong></p>
					</div>
					<div className="sq-info-column">
						<p>Target Label: <strong>{targetStore.targetClassNames[targetStore.targetChosenClassColumnKey]}</strong></p>
						<p>Other Label(s): <strong>{tNegName}</strong></p>
					</div>
				</div>
			)
		}
	}

	return (
		<div className="sq-target-info-pane">
			<h1>Training Data: {targetStore.targetDatasetInfo.title}</h1>
			{getInfo()}
		</div>
	);
});

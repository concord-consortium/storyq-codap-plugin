/**
 * This component manages the lower part of the TargetPanel
 */

import React, {Component} from "react";
import {observer} from "mobx-react";
import {DomainStore} from "../stores/domain_store";

export interface TargetInfoPane_Props {
	domainStore: DomainStore
}

export const TargetInfoPane = observer(class TargetInfoPane extends Component<TargetInfoPane_Props, {}> {

	render() {

		function getInfo() {
			if (tTargetStore.targetDatasetInfo.title !== '') {
				const tPosName = tTargetStore.targetClassNames[tTargetStore.targetChosenClassColumnKey],
					tNegKey = tTargetStore.targetChosenClassColumnKey === 'left' ? 'right' : 'left',
					tNegName = tTargetStore.targetClassNames[tNegKey]
				return (
					<div className='sq-info-row'>
						<div className='sq-info-column'>
							<p>Text: <strong>{tTargetStore.targetAttributeName}</strong></p>
							<p>Labels: <strong>{tTargetStore.targetClassAttributeName}</strong></p>
						</div>
						<div className='sq-info-column'>
							<p>Target Label: <strong>{tPosName}</strong></p>
							<p>Other Label(s): <strong>{tNegName}</strong></p>
						</div>
					</div>
				)
			}
		}

		let tTargetStore = this.props.domainStore.targetStore

		return (
			<div className='sq-target-info-pane'>
				<h1>Training Data: {tTargetStore.targetDatasetInfo.title}</h1>
				{getInfo()}
			</div>
		);
	}
})
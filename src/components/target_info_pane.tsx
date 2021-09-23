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
				const tPosObject = tTargetStore.targetClassNames.find(iObject => iObject.positive)
				const tNegObject = tTargetStore.targetClassNames.find(iObject => !iObject.positive)
				const tPosName = tPosObject ? tPosObject.name : '<none specified>'
				const tNegName = tNegObject ? tNegObject.name : '<none specified>'
				return (
					<div className='sq-info-row'>
						<div className='sq-info-column'>
							<p>Training Set: <strong>{tTargetStore.targetDatasetInfo.title}</strong></p>
							<p>Target Text: <strong>{tTargetStore.targetAttributeName}</strong></p>
						</div>
						<div className='sq-info-column'>
							<p>Target Class: <strong>{tTargetStore.targetClassAttributeName}</strong></p>
							<p>Target Label: <strong>{tPosName}</strong></p>
							<p>Other Label: <strong>{tNegName}</strong></p>
						</div>
					</div>
				)
			}
		}

		let tTargetStore = this.props.domainStore.targetStore

		return (
			<div className='sq-target-info-pane'>
				<h1>Target Summary</h1>
				{getInfo()}
			</div>
		);
	}
})
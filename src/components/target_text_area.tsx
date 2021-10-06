/**
 * This component manages the lower part of the TargetPanel
 */

import React, {Component} from "react";
import {observer} from "mobx-react";
import {DomainStore} from "../stores/domain_store";
import {UiStore} from "../stores/ui_store";
import {RadioGroup} from "devextreme-react";
import {action} from "mobx";

export interface TargetTextArea_Props {
	domainStore: DomainStore
	uiStore: UiStore
}

export const TargetTextArea = observer(class TargetTextArea extends Component<TargetTextArea_Props, {}> {

	/*
		constructor(props: any) {
			super(props);
		}
	*/
	async updateTextAreaInfo() {
		await this.props.domainStore.targetStore.updateFromCODAP()
	}

	render() {
		let this_ = this

		function getTexts(iClassName: string) {
			const tTargetAttr = this_.props.domainStore.targetStore.targetAttributeName
			const tClassAttr = this_.props.domainStore.targetStore.targetClassAttributeName
			if (this_.props.domainStore.targetStore.targetCases.length > 0) {
				const tFilteredCases = this_.props.domainStore.targetStore.targetCases.filter(iCase => {
					return iClassName === '' || iCase[tClassAttr] === iClassName
				})
				return (
					<div className='sq-text-container'>
						<div className='sq-target-texts'>
							{tFilteredCases.map((iCase, iIndex) => {
								return <p className='sq-text-card' key={iIndex}>{iCase[tTargetAttr]}</p>
							})}
						</div>
					</div>
				)
			}
		}

		function getTargetClassName(index: number) {
			const tClassnameObjectArray = this_.props.domainStore.targetStore.targetClassNames
			const tCurrentObject = tClassnameObjectArray[index]
			const tOtherObject = tClassnameObjectArray[(index + 1) % 2]
			if (tCurrentObject && tCurrentObject.name !== '') {
				const tValue = tCurrentObject.positive ? tCurrentObject.name : ''
				return (
					<div>
						<RadioGroup
							items={[tCurrentObject.name]}
							value={tValue}
							onValueChange={action((e) => {
								if (e) {
									tCurrentObject.positive = true
									tOtherObject.positive = false
								}
							})}
						></RadioGroup>
					</div>
				)
			}
		}

		if (this.props.domainStore.targetStore.targetClassAttributeName !== '') {
			const tTargetClassNames = this.props.domainStore.targetStore.targetClassNames
			const tNames = tTargetClassNames.map(iClassNameObject => iClassNameObject.name)
			return (
				<div className='sq-target-lower-panel'>
					<div className='sq-target-text-panel'>
						{getTargetClassName(0)}
						{getTexts(tNames.length === 2 ? tTargetClassNames[0].name : '')}
					</div>
					<div className='sq-target-text-panel'>
						{getTargetClassName(1)}
						{getTexts(tNames.length === 2 ? tTargetClassNames[1].name : '')}
					</div>
				</div>
			);
		} else if (this.props.domainStore.targetStore.targetAttributeName !== '') {
			return (
				<div className='sq-target-lower-panel'>
					{getTargetClassName(0)}
					<div className='sq-target-text-panel'>
					{getTexts('')}
					</div>
				</div>
			)
		}
	}
})

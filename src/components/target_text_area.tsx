/**
 * This component manages the lower part of the TargetPanel
 */

import React, {Component} from "react";
import {observer} from "mobx-react";
import {DomainStore} from "../stores/domain_store";
import {UiStore} from "../stores/ui_store";
import {RadioGroup} from "./ui/radio-group";
import {action} from "mobx";
import {SQ} from "../lists/lists";

export interface TargetTextArea_Props {
	domainStore: DomainStore
	uiStore: UiStore
}

export const TargetTextArea = observer(class TargetTextArea extends Component<TargetTextArea_Props, {}> {

	showRefs() {
		/*
				const tParagraphs = this.props.domainStore.targetStore.textRefs.map(
					(iRef) => {
						return (iRef.ref && iRef.ref.current && iRef.ref.current.getBoundingClientRect) ?
							`${iRef.ownerCaseID}: ${JSON.stringify(iRef.ref.current.getBoundingClientRect().y)}` : 'no rect'
					})
				console.log(tParagraphs)
		*/
	}

	render() {
		// const tTextRefs = this.props.domainStore.targetStore.textRefs

		function getTexts(iClassName: string) {
			const tTargetAttr = tTargetStore.targetAttributeName
			const tClassAttr = tTargetStore.targetClassAttributeName
			if (tTargetStore.targetCases.length > 0) {
				const tFilteredCases = tTargetStore.targetCases.filter(iCase => {
					return iClassName === '' || iCase.values[tClassAttr] === iClassName
				})
				// const tTempRef = React.createRef()
				return (
					<div className='sq-text-container'>
						<div className='sq-target-texts'>
							{tFilteredCases.slice(0, 40).map((iCase, iIndex) => {
								// const tReactRef = iClassName === '' ? tTextRefs[iIndex].ref : tTempRef
								return <p className='sq-text-card'
													key={iIndex}
									/*ref={tReactRef}*/>
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
			if( tTargetStore.targetClassAttributeValues.length === 2) {
				const
					tDesiredColumnValue = index === 0 ? tLeftColumnValue : tRightColumnValue
				return (
					<div className='sq-target-choice'>
						<RadioGroup
							items={[tDesiredColumnValue]}
							value={tChosenColumnValue}
							onValueChange={action((e) => {
								if (e) {
									tTargetStore.targetChosenClassColumnKey =
										index === 0 ? tLeftColumnKey : tRightColumnKey
								}
							})}
							hint={SQ.hints.targetTwoGroups}
						/>
					</div>
				)
			}
		}

		const tTargetStore = this.props.domainStore.targetStore,
			tTargetClassNames = tTargetStore.targetClassNames,
			tLeftColumnKey = tTargetStore.targetLeftColumnKey,
			tLeftColumnValue = tTargetStore.targetClassNames[tLeftColumnKey],
			tRightColumnKey = tLeftColumnKey === 'left' ? 'right' : 'left',
			tRightColumnValue = tTargetStore.targetClassNames[tRightColumnKey],
			tChosenColumnKey = tTargetStore.targetChosenClassColumnKey,
			tChosenColumnValue = tTargetStore.targetClassNames[tChosenColumnKey]
		if (tTargetStore.targetClassAttributeName !== '') {
			const tLeftClassName = tTargetClassNames[tLeftColumnKey],
				tRightClassName = tTargetClassNames[tRightColumnKey]
			this.showRefs()
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
		} else if (tTargetStore.targetAttributeName !== '') {
			return (
				<div className='sq-target-lower-panel'>
					<div className='sq-target-text-panel'>
						{getTexts('')}
					</div>
				</div>
			)
		}
	}
})

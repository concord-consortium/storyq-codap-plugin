/**
 * This component provides the space for a user to construct a new feature
 */

import React, {Component} from "react";
import {DomainStore, featureDescriptors} from "../stores/domain_store";
import {observer} from "mobx-react";
import {UiStore} from "../stores/ui_store";
import {TextBox} from "devextreme-react";
import {action} from "mobx";
import {SelectBox} from "devextreme-react/select-box";

interface FeatureConstructorInfo {
	subscriberIndex: number
}

export interface FeatureConstructorProps {
	uiStore: UiStore
	domainStore: DomainStore
}

export const FeatureConstructor = observer(class FeatureConstructor extends Component<FeatureConstructorProps, {}> {

	private featureConstructorInfo: FeatureConstructorInfo;

	constructor(props: any) {
		super(props);
		this.state = {
			count: 0
		};
		this.featureConstructorInfo = {subscriberIndex: -1}
	}

	render() {
		const tFeatureUnderConstruction = this.props.domainStore.featureStore.featureUnderConstruction
		if (tFeatureUnderConstruction.inProgress) {
			return (
				<div className='sq-feature-constructor'>
					<TextBox
						className='sq-fc-part'
						valueChangeEvent={'keyup'}
						placeholder="type the feature's name"
						onValueChanged={action((e)=>{
							tFeatureUnderConstruction.name = e.value
						})}
						value={tFeatureUnderConstruction.name}
						maxLength={20}
					/>
					<span
						className='sq-fc-part'
					>is defined as</span>
					<SelectBox
						className='sq-new-feature-item sq-fc-part'
						dataSource={featureDescriptors.kinds}
						placeholder={'Choose kind of new feature'}
						value={tFeatureUnderConstruction.kind}
						style={{display: 'inline-block'}}
						onValueChanged={action((e)=>{
							tFeatureUnderConstruction.kind = e.value
						})}
					/>

				</div>
			)
		}
		else return ''
	}
})
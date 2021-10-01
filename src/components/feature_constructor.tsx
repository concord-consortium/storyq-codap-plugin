/**
 * This component provides the space for a user to construct a new feature
 */

import React, {Component} from "react";
import {DomainStore} from "../stores/domain_store";
import {observer} from "mobx-react";
import {UiStore} from "../stores/ui_store";
import {FeatureComponent} from "./feature_component";

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
				<div>
					<FeatureComponent
						uiStore={this.props.uiStore}
						domainStore={this.props.domainStore}
						feature={tFeatureUnderConstruction}
					/>
				</div>
			)
		} else return ''
	}
})
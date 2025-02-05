/**
 * This component provides the space for a user to construct a new feature
 */

import React, {Component} from "react";
import {DomainStore} from "../stores/domain_store";
import {observer} from "mobx-react";
import {FeatureComponent} from "./feature_component";

interface FeatureConstructorInfo {
	subscriberIndex: number
}

export interface FeatureConstructorProps {
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
						domainStore={this.props.domainStore}
						feature={tFeatureUnderConstruction}
						shortened = {false}
					/>
				</div>
			)
		} else return ''
	}
})
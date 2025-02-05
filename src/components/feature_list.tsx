/**
 * This component lists the constructed features and provides an interface for choosing, deleting, and editing them
 */

import React, {Component} from "react";
import {DomainStore} from "../stores/domain_store";
import {observer} from "mobx-react";
import {FeatureComponent} from "./feature_component";

interface FeatureListInfo {
	subscriberIndex: number
}

export interface FeatureListProps {
	domainStore: DomainStore
}

export const FeatureList = observer(class FeatureList extends Component<FeatureListProps, {}> {

	private featureListInfo: FeatureListInfo;

	constructor(props: any) {
		super(props);
		this.state = {
			count: 0
		};
		this.featureListInfo = {subscriberIndex: -1}
	}

	getList() {
		const tFeatureList = this.props.domainStore.featureStore.features
		return tFeatureList.map((iFeature, iIndex) => {
			return <FeatureComponent
				key={iIndex}
				domainStore={this.props.domainStore}
				feature={iFeature}
				shortened={true}
			/>
		})
	}

	render() {
		return (
			<div className='sq-container'>
				<div className='sq-feature-list'>
					{this.getList()}
				</div>
			</div>
		)
	}
})

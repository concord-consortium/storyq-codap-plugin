/**
 * This component provides the space for a user to construct and edit features
 */

import React, {Component} from "react";
import {DomainStore} from "../stores/domain_store";
import {observer} from "mobx-react";
import {UiStore} from "../stores/ui_store";
import {FeaturePane} from "./feature_pane";

export interface Feature_Props {
	uiStore: UiStore
	domainStore: DomainStore
}

export const FeaturePanel = observer(class FeaturePanel extends Component<Feature_Props, {}> {

	constructor(props: any) {
		super(props);
		this.state = {
			count: 0
		};
	}

	async componentDidMount() {
		await this.updateFeaturesDataset();
		await this.props.domainStore.featureStore.updateWordListSpecs()
	}

	async updateFeaturesDataset() {
		await this.props.domainStore.updateNonNtigramFeaturesDataset()
	}

	render() {

		return (
			<div className='sq-feature-panel'>
				<FeaturePane
					uiStore={this.props.uiStore}
					domainStore={this.props.domainStore}
				/>
			</div>
		);
	}
})
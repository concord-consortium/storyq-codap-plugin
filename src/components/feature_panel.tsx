/**
 * This component provides the space for a user to construct and edit features
 */

import React, {Component} from "react";
import {DomainStore} from "../stores/domain_store";
import {observer} from "mobx-react";
import {UiStore} from "../stores/ui_store";
import {TargetInfoPane} from "./target_info_pane";
import {FeaturePane} from "./feature_pane";

interface FeaturePanelState {
	count: number,
}

interface FeaturePanelInfo {
	subscriberIndex: number
}

export interface Feature_Props {
	uiStore: UiStore
	domainStore: DomainStore
}

export const FeaturePanel = observer(class FeaturePanel extends Component<Feature_Props, FeaturePanelState> {

	private featurePanelInfo: FeaturePanelInfo;

	constructor(props: any) {
		super(props);
		this.state = {
			count: 0
		};
		this.featurePanelInfo = {subscriberIndex: -1}
	}

	render() {

		return (
			<div className='sq-feature-panel'>
				<TargetInfoPane
					domainStore={this.props.domainStore}
				/>
					<FeaturePane
						uiStore = {this.props.uiStore}
						domainStore={this.props.domainStore}
					/>
			</div>
		);
	}
})
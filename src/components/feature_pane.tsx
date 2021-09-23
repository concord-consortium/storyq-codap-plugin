/**
 * This component provides the space for a user to construct and edit features
 */

import React, {Component} from "react";
import {DomainStore} from "../stores/domain_store";
import {observer} from "mobx-react";
import {UiStore} from "../stores/ui_store";
import {Button} from "devextreme-react";
import {FeatureConstructor} from "./feature_constructor";

interface FeaturePaneState {
	count: number,
}

interface FeaturePaneInfo {
	subscriberIndex: number
}

export interface Feature_Props {
	uiStore: UiStore
	domainStore: DomainStore
}

export const FeaturePane = observer(class FeaturePane extends Component<Feature_Props, FeaturePaneState> {

	private featurePaneInfo: FeaturePaneInfo;

	constructor(props: any) {
		super(props);
		this.state = {
			count: 0
		};
		this.featurePaneInfo = {subscriberIndex: -1}
	}

	addFeature() {

	}

	render() {

		return (
			<div className='sq-feature-pane'>
				<Button
					className='sq-button'
					onClick={() => {
						this.addFeature();
					}}>
					+ Add Feature
				</Button>
				<FeatureConstructor
					uiStore ={this.props.uiStore}
					domainStore = {this.props.domainStore}
				/>
			</div>
		);
	}
})
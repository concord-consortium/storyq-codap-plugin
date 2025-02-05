/**
 * This component shows under the Training tab
 */

import React, {Component} from "react";
import {DomainStore} from "../stores/domain_store";
import {observer} from "mobx-react";
import {TargetInfoPane} from "./target_info_pane";
import {TrainingPane} from "./training_pane";

export interface Training_Props {
	domainStore: DomainStore
}

export const TrainingPanel = observer(class TrainingPanel extends Component<Training_Props, {}> {


	constructor(props: any) {
		super(props);
		this.state = {
			count: 0
		};
	}

	async componentDidMount() {
		await this.props.domainStore.updateNonNtigramFeaturesDataset()
	}

	render() {

		return (
			<div className='sq-feature-panel'>
				<TargetInfoPane domainStore={this.props.domainStore} />
				<TrainingPane domainStore={this.props.domainStore} />
			</div>
		);
	}
})
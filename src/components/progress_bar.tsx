/**
 * This component displays a progress bar
 */

import React, {Component} from "react";

export class ProgressBar extends Component<{percentComplete:number}, any> {
	private barRef:any;

	constructor(props:any) {
		super(props);
		this.barRef = React.createRef();
	}

	render() {
		let tWidth = `${this.props.percentComplete}%`;
		return (
			<div className='sq-progress-bar-container'>
				<div className='sq-progress-bar'
						 style={{width: tWidth}}
						 ref={this.barRef}
				>
					<p className='sq-pb-label'>
						{this.props.percentComplete}%
					</p>
				</div>
			</div>
		);
	}
}
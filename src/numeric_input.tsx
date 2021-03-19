import React, {Component} from 'react';
import {NumberBox} from "devextreme-react";

export interface NumericInputProps {
	label:string,
	min:number,
	max:number,
	getter:any,
	setter:any
}

export class NumericInput extends Component<NumericInputProps, {}> {
	private inputInstance:any;

	constructor(props:NumericInputProps) {
		super(props);
		this.inputInstance = React.createRef();
		this.saveInputInstance = this.saveInputInstance.bind(this);
		this.blurInput = this.blurInput.bind(this);
	}

	saveInputInstance(e:any) {
		this.inputInstance = e.component;
	}

	blurInput() {
		if( this.inputInstance)
			this.inputInstance.blur();
	}

	render() {
		return (
			<label>
				<span>{this.props.label}</span>
				<NumberBox
					onInitialized={this.saveInputInstance}
					min={this.props.min}
					max={this.props.max}
					value={this.props.getter()}
					onValueChanged={e => this.props.setter(Number(e.value))}
					onEnterKey={() => {
						this.blurInput();
					}}
				/>
			</label>
		);
	}
}
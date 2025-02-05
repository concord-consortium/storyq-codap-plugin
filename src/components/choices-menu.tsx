import { action } from "mobx";
import React from "react";
import { SelectBox } from "./ui/select-box";

interface IChoicesMenuProps {
	choices: string[];
	hint?: string;
	noDataText?: string;
	onValueChange?: (choice: string) => void;
	placeHolder: string;
	prompt: string;
	value?: string;
}
export function ChoicesMenu({
	choices, hint, noDataText, onValueChange, placeHolder, prompt, value
}: IChoicesMenuProps) {
	return (
		<div className='sq-choice'>
			<span>{prompt}:</span>
			<SelectBox
				dataSource={choices}
				placeholder={placeHolder}
				hint={hint}
				value={value}
				noDataText={noDataText}
				style={{display: 'inline-block'}}
				onValueChange={action(async (e) => onValueChange?.(e))}
				width={'100%'}
			/>
		</div>
	)
}

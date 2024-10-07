/**
 * These utilities are used by more than one component
 */

import React from "react";
import {SelectBox} from "./ui/select-box";
import {action} from "mobx";

export function choicesMenu(iPrompt: string, iPlaceHolder: string, iHint:string,
														iChoices: string[], iValue: string, iNoDataText:string, iCallback: (choice: string) => void) {
	return (
		<div className='sq-choice'>
			<span>{iPrompt}:</span>
			<SelectBox
				dataSource={iChoices}
				placeholder={iPlaceHolder}
				hint={iHint}
				value={iValue}
				noDataText={iNoDataText}
				style={{display: 'inline-block'}}
				onValueChange={action(async (e) => iCallback(e))}
				width={'100%'}
			/>
		</div>
	)
}

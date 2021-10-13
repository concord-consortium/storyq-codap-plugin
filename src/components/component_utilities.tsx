/**
 * These utilities are used by more than one component
 */

import React from "react";
import {SelectBox} from "devextreme-react/select-box";
import {action} from "mobx";

export function choicesMenu(iPrompt: string, iPlaceHolder:string,
														iChoices: string[], iValue: string, iCallback: (choice: string) => void) {
	return (
		<label>
			<span>{iPrompt}:</span>
			<SelectBox
				dataSource={iChoices}
				placeholder={iPlaceHolder}
				value={iValue}
				style={{display: 'inline-block'}}
				onValueChange={action(async (e) => iCallback(e))}
				width={'100%'}
			>
			</SelectBox>
		</label>)

}

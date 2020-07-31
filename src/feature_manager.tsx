import React, {Component} from 'react';
import codapInterface from "./lib/CodapInterface";
import Dropdown from 'react-bootstrap/Dropdown';
import DropdownButton from 'react-bootstrap/DropdownButton';
import 'bootstrap/dist/css/bootstrap.min.css';
import {
	registerObservers
} from './lib/codap-helper';
import './storyq.css';

export class FeatureManager extends Component<{}, { }> {
	private kDataSetName = 'MovieReviews';
	private kCollectionName = 'cases';
	private kFeatureCollectionName = 'features';

	constructor(props: any) {
		super(props);
		this.extract = this.extract.bind(this);
	}

	public componentWillMount() {

	}

	private async createFeatureCollection() {
		let tDataSetName = this.kDataSetName,
			tFeatureCollectionName = this.kFeatureCollectionName;
		const tResult: any = await codapInterface.sendRequest(
			{
				"action": "create",
				"resource": `dataContext[${this.kDataSetName}].collection`,
				"values": [{
					"name": this.kFeatureCollectionName,
					"title": this.kFeatureCollectionName,
					"parent": this.kCollectionName
				}
				]
			})
			.catch(() => {
				console.log(`Error creating feature collection`);
			});

		const tAttrResult:any	= await codapInterface.sendRequest({
				"action": "create",
				"resource": `dataContext[${tDataSetName}].collection[${tFeatureCollectionName}].attribute`,
				"values": [
					{
						"name": "feature",
						"title": "feature"
					},
					{
						"name": "type",
						"title": "type"
					}
				]
			})
			.catch(() => {
				console.log(`Error creating feature attributes`);
			});
	}

	private async addFeatures() {
		const tGetResult: any = await codapInterface.sendRequest({
			"action": "get",
			"resource": `dataContext[${this.kDataSetName}].collection[${this.kCollectionName}].caseByIndex[0]`
		})
			.catch(() => {
				console.log('unable to get case');
			});

		let tParentID: number = tGetResult.values.case.id,
			tText: string = tGetResult.values.case.values.text,
			tWords: RegExpMatchArray | [] = tText.toLowerCase().match(/\w+/g) || [],
			tValues: any = tWords.map((aWord: string) => {
				return {
					parent: tParentID,
					values: {
						feature: aWord,
						type: 'unigram'
					}
				}
			});
		await  codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${this.kDataSetName}].collection[${this.kFeatureCollectionName}].case`,
			values: tValues
		});
		console.log('finished adding features');
	}

	private async extract() {
		await this.createFeatureCollection();
		await this.addFeatures();
	}

	public render() {
		return (<div>Dataset:
			<DropdownButton title="Choose One" size="sm">
				<Dropdown.Item as="button" onClick={this.extract}>{this.kDataSetName}</Dropdown.Item>
			</DropdownButton>
		</div>)
	}
}

export default FeatureManager;

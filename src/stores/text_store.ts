/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import { makeAutoObservable } from 'mobx'
import pluralize from "pluralize";
import { ITextPart, ITextSection } from './store_types_and_constants';

type TitleDataset = "target" | "testing";

export interface ITextStoreJSON {
  textComponentTitle: string;
}

export class TextStore {
  textComponentTitle: ITextPart[] = [];
  textSections: ITextSection[] = [];
  titleDataset: TitleDataset = "target";

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  asJSON() {
    return {
      textComponentTitle: JSON.stringify(this.textComponentTitle)
    };
  }

  fromJSON(json: ITextStoreJSON) {
    if (json) {
			try {
				const title = JSON.parse(json.textComponentTitle);
				this.textComponentTitle = title || [];
			} catch (e) {
				// The title used to be a simple string, so we have to accommodate that.
				this.textComponentTitle = [{ text: json.textComponentTitle || "" }];
			}
    }
  }

  setTextComponentTitle(title: ITextPart[]) {
    this.textComponentTitle = title;
  }

  setTitleDataset(titleDataset: TitleDataset) {
    this.titleDataset = titleDataset;
  }

  setTextSections(sections: ITextSection[]) {
    this.textSections = sections;
  }

  getTextSectionId(textSection: ITextSection) {
    return `section-${textSection.title?.actual}-${textSection.title?.predicted}`;
  }

  toggleTextSectionVisibility(textSection: ITextSection) {
    textSection.hidden = !textSection.hidden;
  }

  updateTitle(datasetName: string, attributeName: string) {
    if (datasetName && attributeName) {
      this.textComponentTitle = [
				{ text: `Selected ` },
				{ text: pluralize(attributeName), classNames: ["highlighted"] },
				{ text: " in " },
				{ text: datasetName, classNames: ["highlighted"] }
			];
    } else {
      this.textComponentTitle = [{ text: `Choose Data And Text To Begin` }];
    }
  }

  async clearText() {
    this.setTextSections([]);
  }
}

export const textStore = new TextStore();

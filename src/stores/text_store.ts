/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import { makeAutoObservable } from 'mobx'
import pluralize from "pluralize";
import { ITextSection, TitleDataset } from './store_types_and_constants';

export interface ITextStoreJSON {
  textComponentTitle: string;
}

export class TextStore {
  textComponentTitle: string = '';
  textSections: ITextSection[] = [];
  titleDataset: TitleDataset = "target";

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  asJSON() {
    return {
      textComponentTitle: this.textComponentTitle
    };
  }

  fromJSON(json: ITextStoreJSON) {
    if (json) {
      this.textComponentTitle = json.textComponentTitle || '';
    }
  }

  setTextComponentTitle(title: string) {
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
      this.textComponentTitle = `Selected ${pluralize(attributeName)} in ${datasetName}`;
    } else {
      this.textComponentTitle = `Choose Data And Text To Begin`;
    }
  }

  async clearText() {
    this.setTextSections([]);
  }
}

export const textStore = new TextStore();

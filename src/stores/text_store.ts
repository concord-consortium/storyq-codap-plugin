/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import { makeAutoObservable } from 'mobx'
import { ITextSection } from './store_types_and_constants';

type TitleDataset = "target" | "testing";

export interface ITextStoreJSON {
  textComponentTitle: string;
}

export class TextStore {
  textSections: ITextSection[] = [];
  titleDataset: TitleDataset = "target";

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
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

  async clearText() {
    this.setTextSections([]);
  }
}

export const textStore = new TextStore();

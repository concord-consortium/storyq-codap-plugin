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

  get caseCount() {
    return this.textSections.reduce((count, section) => count + section.text.length, 0);
  }

  setTitleDataset(titleDataset: TitleDataset) {
    this.titleDataset = titleDataset;
  }

  setTextSections(sections: ITextSection[]) {
    this.textSections = sections;
  }

  addTextSection(section: ITextSection) {
    this.textSections.push(section);
  }

  getTextSectionId(textSection: ITextSection) {
    return `section-${textSection.title?.actual}-${textSection.title?.predicted}`;
  }

  async clearText() {
    this.setTextSections([]);
  }
}

export const textStore = new TextStore();

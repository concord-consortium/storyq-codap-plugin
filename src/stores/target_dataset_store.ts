// targetDatasetInfo should be in targetStore, but it's in its own class to avoid an import cycle with featureStore.

import { makeAutoObservable } from "mobx";
import { entityInfo } from "../lib/codap-helper";
import { kEmptyEntityInfo } from "./store_types_and_constants";

export class TargetDatasetStore {
  targetDatasetInfo: entityInfo = kEmptyEntityInfo;

  constructor() {
    makeAutoObservable(this);
  }

  setTargetDatasetInfo(info: entityInfo) {
    this.targetDatasetInfo = info;
  }
}

export const targetDatasetStore = new TargetDatasetStore();

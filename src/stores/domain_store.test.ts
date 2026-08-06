import { getCaseValues } from "../lib/codap-helper";
import codapInterface from "../lib/CodapInterface";
import { UpdateCaseRequest } from "../types/codap-api-types";
import { domainStore } from "./domain_store";
import { featureStore } from "./feature_store";
import { targetStore } from "./target_store";

jest.mock("../lib/CodapInterface", () => ({
  __esModule: true,
  default: { sendRequest: jest.fn(), on: jest.fn(), updateInteractiveState: jest.fn() }
}));
jest.mock("../lib/codap-helper", () => ({
  ...jest.requireActual("../lib/codap-helper"),
  getCaseValues: jest.fn(),
  openTable: jest.fn()
}));

const mockSendRequest = codapInterface.sendRequest as jest.Mock;
const mockGetCaseValues = getCaseValues as jest.Mock;

const kTargetDataset = "Sentiments";
const kTargetCollection = "texts";

// CODAP v3 returns every case value as a string, which is what makes the count feature's number
// indistinguishable from a boolean without an explicit test.
const targetCases = [
  { id: 1, values: { text: "love love ice cream", rating: "positive", 'count: "love"': "2", 'contain: "good"': "false" } },
  { id: 2, values: { text: "good crackers", rating: "positive", 'count: "love"': "0", 'contain: "good"': "true" } },
  { id: 3, values: { text: "love the good crackers", rating: "positive", 'count: "love"': "1", 'contain: "good"': "true" } }
];
const featureCases = [
  { id: 100, children: [101], values: { name: 'count: "love"', type: "constructed" } },
  { id: 200, children: [201], values: { name: 'contain: "good"', type: "constructed" } }
];

function targetCaseUpdates() {
  const requests = mockSendRequest.mock.calls
    .map(call => call[0])
    .filter(request => Array.isArray(request)) as UpdateCaseRequest[][];
  const targetUpdate = requests.flat().find(
    request => request.resource === `dataContext[${kTargetDataset}].collection[${kTargetCollection}].case`
  );
  return targetUpdate?.values ?? [];
}

function featureIDsFor(targetCaseId: number) {
  const update = targetCaseUpdates().find(value => Number(value.id) === targetCaseId);
  return update ? JSON.parse(String(update.values.featureIDs)) : undefined;
}

describe("DomainStore.recreateUsagesAndFeatureIDs", () => {
  beforeEach(async () => {
    mockSendRequest.mockReset();
    mockSendRequest.mockResolvedValue([{ success: true, values: { id: 1 } }, { success: true, values: { id: 2 } }]);
    mockGetCaseValues.mockReset();
    mockGetCaseValues.mockImplementation(async (datasetName: string) =>
      datasetName === kTargetDataset ? targetCases : featureCases
    );

    targetStore.fromJSON({
      targetDatasetInfo: { name: kTargetDataset, title: kTargetDataset, id: 7 },
      targetAttributeName: "text",
      targetClassAttributeName: "rating",
      targetClassNames: { left: "positive", right: "negative" },
      targetChosenClassColumnKey: "left"
    } as any);
    targetStore.setTargetCollectionName(kTargetCollection);
    featureStore.setFeatures([]);
    featureStore.clearTokens();

    await domainStore.recreateUsagesAndFeatureIDs(true);
  });

  it("keeps a count feature in the rebuilt feature IDs", () => {
    expect(featureIDsFor(3)).toEqual([100, 200]);
  });

  it("rewrites a text that matches only the count feature", () => {
    expect(featureIDsFor(1)).toEqual([100]);
  });

  it("treats a count of zero as a non-match", () => {
    expect(featureIDsFor(2)).toEqual([200]);
  });
});

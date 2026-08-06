# Implementation: Select and Show/Hide Highlight Colors in the Plugin

**Jira**: https://concord-consortium.atlassian.net/browse/STORYQ-74
**Requirements**: [requirements.md](./requirements.md)
**Status**: **Built**, 2026-08-06. Four places where the code had to depart from this plan are marked in place, each with the reason: the picker's props in section 7b, the `targetCaseFormula` expression in section 9, and two notes in the Tests section about the mocking the harness needs.

This document says how to build what `requirements.md` specifies. It does not restate the requirements, and where the two disagree the requirements win, except for the two places below that deliberately depart from them and say so.

Requirement numbers below refer to the amended list, 1 to 42.

## Shape of the work

Ten commits, in this order. The order matters three times: the migration function has to exist before anything else can be added to it, the store write-back has to exist before the buttons that call it, and the write-back also has to exist before the restore repair, which shares its fan-out.

| # | Commit | Requirements |
|---|---|---|
| 1 | `fix: Add the missing space to the ngram feature name [STORYQ-74]` | 23 |
| 2 | `fix: Give extracted single words a single color [STORYQ-74]` | 20, 21, 27 |
| 3 | `fix: Hide the color and highlight columns in the Features table [STORYQ-74]` | 1, 2, 8 |
| 4 | `feat: Add a total frequency column to the Features table [STORYQ-74]` | 4, 5, 6, 7 |
| 5 | `feat: Write feature color and highlight back to the Features dataset [STORYQ-74]` | 3, 29, 30 |
| 6 | `fix: Repair the ngram feature color when restoring a document [STORYQ-74]` | 22 |
| 7 | `feat: Add highlight and color controls to the Features tab [STORYQ-74]` | 9 to 19, 24 to 28, 33 to 38, 41 |
| 8 | `fix: Guard the highlight style against kNoColor [STORYQ-74]` | 31, 32 |
| 9 | `fix: Re-derive the target case formula when restoring features [STORYQ-74]` | 40 |
| 10 | `fix: Keep count features in the feature IDs rebuilt after training [STORYQ-74]` | 42 |

Requirement 39 appears in no row and needs none: it is a standing guarantee about the six palette colours, and requirement 15 closing the palette is what delivers it.

**Commits 9 and 10 are numbered last and are worth landing first.** They are the same defect reached two ways: each disables a `count` feature by leaving it out of a target case's `featureIDs`, which is what `text_feedback_manager.ts` reads to decide what a text highlights. Commit 9 fixes the restore route and commit 10 the post-training route. They are independent of each other and of everything else here, and together they are what makes requirement 12's visibility toggle demonstrable on a count feature at all. Until commit 9 lands, doc 1's `count: "love"` reports `0 / 0` and highlights nothing, which makes commit 4's `total frequency` and commit 7's visibility toggle impossible to verify honestly on the one document that exercises the restore path. They are numbered 9 and 10 only so the ten sections below and every cross-reference to them keep their numbers.

The store write-back is its own commit (5) rather than the first third of the controls commit, because commit 6's restore repair calls the same fan-out. Folding it into the controls commit would put the repair ahead of the code it depends on, which is the ordering defect this table exists to avoid.

Commit 7 is the largest and is worth splitting further if it gets unwieldy: the two row buttons, then the picker. Commits 1, 8, 9 and 10 are independent of everything and can move.

## 1. The ngram feature name

`constructNameFor()` builds the name, and the missing space is at `feature_store.ts:149`; the prior-art commit `f7d9b5b` already contains the one-character fix. Graft it, nothing else in this commit. New features only, per requirement 23; no migration, and note that doc 1's saved feature keeps the old name, which is correct and expected.

## 2. One colour for single words

Most of this exists in `f7d9b5b`. Graft `color-utils.ts` and `feature_pane.tsx` from it, then add the site that commit does not know about. Do not graft its `one_hot.ts` change; see the extraction site below.

**`src/utilities/color-utils.ts`** ends up with:

```ts
export const kNoColor = "NO_COLOR";
export const featureColors = ["#ffe671", "#dbb6fb", "#45f1eb", "#a8e620", "#fb93e8", "#9ce1ff"];
export const featureColorNames: Record<string, string> = { "#ffe671": "Yellow", … };  // requirement 41
export const ngramColor = "#ffe671";           // from f7d9b5b; requirement 20
export function getFeatureColor() { … }        // unchanged
export function ngramTokenColor(featureColor?: string) { … }   // the requirement 27 rule, stated once
export function normalizeHex(color: string) { … }
export function isPaletteColor(color: string) { … }
```

`featureColors` is currently module-private; export it so the picker sources the palette rather than duplicating six hex values (Technical Notes). `normalizeHex` expands three-digit shorthand and lower-cases; `isPaletteColor` compares through it. Requirement 17 needs both because doc 1 stores `#777`.

**`featureColors` stays an array of six hex strings, and the swatch names live in a separate record keyed by hex.** This is stated here because section 7b needs names and the obvious place to put them is wrong. `getFeatureColor()` returns `featureColors[featureColorIndex]` directly (`color-utils.ts:7-11`) and all four of its call sites consume a plain string, two of which this story does not touch: `feature_pane.tsx:53` and `domain_store.ts:240`. Making the array hold objects therefore writes `[object Object]` into `Feature.color`, into the dataset's `color` attribute and from there into an inline `backgroundColor`, and it edits `getFeatureColor()`, which requirement 21 explicitly puts outside this story's surface. Keying the names by hex also serves 7b's actual goal better than a parallel array does: a palette edit cannot leave a colour and its name out of step, because an unnamed colour is a missing lookup rather than a silent mispairing by position. Requirement 17's seventh swatch is exactly that missing lookup and falls through to the generic name. See [J2](#resolved-j2-sections-2-and-7b-prescribe-two-incompatible-shapes-for-featurecolors-and-7bs-version-silently-rewrites-getfeaturecolor).

**De-alias `featureColors[0]` while grafting.** `f7d9b5b` does not write the file above. It writes `const featureColors = [ngramColor, "#dbb6fb", …]`, so the first palette entry *is* `ngramColor` rather than merely equal to it, and the graft carries that through if taken literally. The two are not interchangeable. Requirement 21 leaves the yellow collision for Jie to meet in the running build and closes with "Keeping `ngramColor` as a single constant is what makes the fix a one-line edit if she wants one"; under the alias that one-line edit does nothing, because changing `ngramColor` moves `featureColors[0]` with it and the two are still identical. Verified with a throwaway test on 2026-08-06, modelling both file shapes and applying the same change to each. The quieter half is that requirement 15 fixes the palette as six named values and requirement 39 guarantees their contrast, so under the alias an edit made for the ngram set silently moves a value two other requirements assert. Write the literal, and treat `ngramColor` and `featureColors[0]` as independent constants that happen to hold the same value today.

**Requirement 27 needs both token-creation sites, and the graft covers neither.** The prior-art commit sets `initialValues.color = ngramColor` whenever `config.includeUnigrams` is set, which is the constant unconditionally, not the ngram `Feature`'s current colour. So a student who recolours the set to purple and then unchecks and re-checks the feature in the Training tab gets 682 yellow tokens under a purple row: exactly the disagreement requirement 27 exists to prevent. Verified with a throwaway test on 2026-08-06: `oneHot` returns every token at `kNoColor` today and takes no `Feature` in its config, so there is no channel from the `Feature` into extraction unless one is added.

Add `get ngramFeature()` to `FeatureStore` beside the existing `hasNgram`, since four sites now want it (the two below, requirement 22's migration, and requirement 26's fan-out). Then fix both sites with the same expression.

**Which of the two sites serves which gesture is the opposite of what it looks like.** The natural reading, and what trap 3 says, is that `updateNgramFeatures()` is the main path, reached both from the Features tab and from re-checking the feature in the Training tab (`feature_list_item.tsx:45`), and that the notification handler is a leak that manual testing would miss. For the Training tab round trip, which is the gesture requirement 27 exists for, `updateNgramFeatures()` does nothing at all: `feature_list_item.tsx:43-46` awaits `toggleChosenFor()` first, whose `syncUnigramsInFeaturesDataset(true)` sets `chosen` on every unigram case, and CODAP broadcasts that echo synchronously before answering the request (I18), so `handleUpdateFeatureCase()` has rebuilt the whole token set by the time `updateNgramFeatures()` is called and it returns at `domain_store.ts:313` on `tokenMapAlreadyHasUnigrams`. Confirmed by throwaway jest test over the real stores on 2026-08-06: the handler rebuilt every token, in the six-colour cycle and `highlight: true`, under a `Feature` set to `#dbb6fb` and `highlight: false`, and `updateNgramFeatures()` then issued zero requests. So the handler is the site that serves the Training tab and `:353` is the site that serves first extraction from the Features tab. Both still need the fix; only the emphasis was inverted, and the same test with the fix applied produced tokens at `#dbb6fb` and `highlight: false`. See [K2](#resolved-k2-on-the-gesture-requirement-27-is-written-about-updatengramfeatures-never-runs).

- **Extraction** (`domain_store.ts:353`, inside `updateNgramFeatures()`). Today: `iFeature.color = iFeature.color !== kNoColor ? iFeature.color : getFeatureColor()`. Becomes `iFeature.color = ngramTokenColor(iNtgramFeature.color)`, the helper below.

  **And `highlight` beside it**, per requirement 27, which covers both: add `iFeature.highlight = iNtgramFeature.highlight` on the next line, and change the hardcoded `highlight: true` at `:358` to `highlight: !!iFeature.highlight`.

  The `!!` is not decoration. `highlight` is optional on `FeatureOrToken` (`store_types_and_constants.ts:190`) and the sibling feature-case write already coerces it, `highlight: !!iFeature.highlight` at `:241`. Uncoerced, an `undefined` does not write `false`, it writes nothing: `JSON.stringify({ highlight: undefined })` is `"{}"`, so the key never reaches CODAP and the case is created with no value, which `handleUpdateFeatureCase()` then reads back as hidden through `iCase.values.highlight === "true"` (`notification_manager.ts:80`). Verified with a throwaway test on 2026-08-06. `addFeatureUnderConstruction()` sets `highlight = true` (`feature_store.ts:306`) so this is not reachable today, but the notification-handler expression two bullets down already writes `?? true` against exactly this possibility, and the two sites should not disagree about whether the field can be missing. `getNewToken()` sets `highlight: true` (`store_types_and_constants.ts:317`) exactly as it sets `color` to `kNoColor`, so this is the same overwrite-just-after-extraction shape, in the same loop, for the same reason.

  This is the site rather than `one_hot.ts`, and the choice is not a preference. `oneHot`'s config carries no `Feature` at all, and `getNewToken()` takes only `initialValues.color ?? kNoColor` (`store_types_and_constants.ts:311-325`), so colouring there means either threading a `Feature` into extraction or falling back to the constant, which is exactly what requirement 27 rules out. `updateNgramFeatures()` already holds `iNtgramFeature` in scope, so it needs no new channel.

  Keep the `kNoColor` fallback. It should be unreachable, since `:317` runs the migration's repair before extraction and `feature_pane.tsx` colours a new ngram feature at creation, but it is the same one-line shape as the code it replaces and it keeps requirement 31 true by construction rather than by argument.
- **The notification handler** (`notification_manager.ts:96-102`), implementation trap 3, which builds a token with `color: getFeatureColor()`. It has no `Feature` in hand, so it reads the store:

```ts
color: ngramTokenColor(featureStore.ngramFeature?.color),   // was getFeatureColor(), at :102
highlight: featureStore.ngramFeature?.highlight ?? true,    // was the constant true, at :103
```

**Both sites go through one helper, because `??` is not the same test as `!== kNoColor` and writing them separately gets that wrong.** An earlier draft of this section prescribed `featureStore.ngramFeature?.color ?? ngramColor` here while prescribing `!== kNoColor` at the extraction site, and called the two "the same expression". `??` falls back only for `null` and `undefined`, and `kNoColor` is the string `"NO_COLOR"`, so it passes straight through. Verified with a throwaway test on 2026-08-06: with those two expressions in the source and the ngram `Feature` at `kNoColor`, a Training tab round trip wrote `color: "NO_COLOR"` into every rebuilt token, which is exactly the invalid inline `backgroundColor` requirement 32 asks never to emit. So put the rule in one place, beside `ngramFeature`:

```ts
export function ngramTokenColor(featureColor?: string) {
  return featureColor && featureColor !== kNoColor ? featureColor : ngramColor;
}
```

and let `domain_store.ts:353` call it too. It takes the colour rather than the `Feature` deliberately: `color-utils.ts` cannot import `FeatureOrToken`, because `store_types_and_constants.ts:6` already imports `kNoColor` from it and that would be a cycle. The window this closes is narrow but lands on the documents requirement 22 exists to serve: a pre-change document restores at `kNoColor`, `restorePluginFromStore` does not await `domainStore.fromJSON()` (`storyq.tsx:91-97`) so the plugin is interactive for the roughly 700 ms the migration takes, and I19's decision to log and swallow a failed migration means a failure leaves `kNoColor` in place for the whole session. It does heal, since requirement 22's gate reads the `Feature` rather than the tokens, but `asJSON()` saves the bad values in the meantime. See [K3](#resolved-k3-section-2s-two-prescribed-expressions-do-not-state-the-same-rule-and--does-not-catch-knocolor).

`highlight` needs no equivalent: `?? true` is right there, because `false` is a meaningful value and `undefined` is the only thing to default.

`ngramColor` survives as the fallback for the no-ngram-feature case and as the value a newly created ngram feature is given in `feature_pane.tsx`. It is no longer what individual tokens are assigned.

**Delete the `getFeatureColor` import from `notification_manager.ts` while you are there.** J2 established that `:102` is that file's only use of it, so the import at `:12` is orphaned by this edit, and an orphaned import is a red build rather than a nit: CI runs `npm run build` (`.github/workflows/ci.yml`), GitHub Actions sets `CI=true`, and `react-scripts` turns ESLint warnings into errors under it. Verified by running `CI=true npx react-scripts build` with the call replaced: `Failed to compile. [eslint] src/managers/notification_manager.ts Line 12:10: 'getFeatureColor' is defined but never used`. The function itself stays live, at `feature_pane.tsx:53` and `domain_store.ts:240`.

Both `highlight` changes are no-ops until commit 7 ships: `addFeatureUnderConstruction()` sets the ngram `Feature`'s `highlight` to `true` (`feature_store.ts:306`), that `Feature` has no case so no echo can change it, and nothing else sets it false, so the new expressions evaluate to the constants they replace in every document that exists today. They start mattering the moment requirement 25's toggle can make it false, which is also when the bug becomes reachable.

## 3. Hiding the two columns, and the migration function this creates

**New documents** (`domain_store.ts:88-105`): add `hidden: true` to the `color` and `highlight` entries in the `attrs` array.

**Existing documents**: `guaranteeFeaturesDataset()` returns early for them (trap 2). The narrowest correct edit is at the branch, not after it:

```ts
if (featureStore.hasFeatures) {
  if (featureStore.featureDatasetID === -1) {
    …existing creation…
  } else {
    await this.migrateExistingFeaturesDataset();
  }
  return true;
}
```

**That branch is entered far more often than once per open, so the function guards itself.** `guaranteeFeaturesDataset()` has three callers, and only one of them is the restore path: `domain_store.ts:55` (restore), `:202` inside `updateNonNtigramFeaturesDataset()`, and `:317` inside `updateNgramFeatures()`. Unguarded, the migration would re-read and re-write 682 cases on each entry, roughly half a second of API traffic plus a 682-case `updateCases` echo, for work that can only matter once. Requirement 8 asks for steps that are safe to repeat; it does not ask us to repeat them.

**Which gestures re-enter it, and which do not.** An earlier draft of this section said every switch between the Features and Training tabs re-enters `:202`, on the grounds that it runs from the `useEffect` in `feature_panel.tsx:13` and `training_panel.tsx:12`. That is wrong, and `requirements.md` carried the same error until this review. `TabPanel` renders the content of every `<Item>` and hides the unselected ones with a class (`tab-panel.tsx:57-69`, `tab-panel-tab-content.tsx:13-25`); `.ui-multiview-item-hidden` is `visibility: hidden` plus an offscreen offset (`light.compact.css:17420-17424`). Nothing unmounts, so those two effects run once each, at first mount, and a tab switch only toggles a class. Confirmed with a throwaway RTL test on 2026-08-06: two panels counting their own mounts, rendered through the real `TabPanel`, `selectedIndex` changed three times, mount counts 1 and 1 throughout.

The gestures that genuinely re-enter it are **every feature added** (`feature_pane.tsx:58`, the Done button) and **collapsing or expanding the StoryQ panel**, which is a real unmount because the whole tree hangs off `{uiStore.showStoryQPanel && …}` (`storyq.tsx:114`) and is precisely what STORYQ-77 and STORYQ-79 have people doing. The guard is still needed; only the reason changed.

**Re-checking the ngram box is not a third gesture, though two earlier passes said it was.** `updateNgramFeatures()` reaches `guaranteeFeaturesDataset()` at `:317` only if it survives `:313`'s `if (featureStore.tokenMapAlreadyHasUnigrams) return`, and on that gesture it does not: `toggleChosenFor()` runs first, its echo is delivered synchronously before the `await` resolves (I18), and `handleUpdateFeatureCase()` refills `tokenMap` from the dataset in the meantime. Confirmed by throwaway jest test on 2026-08-06, which measured zero requests issued by `updateNgramFeatures()` on that path. The second pass's "checked and sound" note reasoned that `deleteUnigramTokens()` leaves the map empty "on the way back in", which is true of the uncheck and not of the re-check. See [K2](#resolved-k2-on-the-gesture-requirement-27-is-written-about-updatengramfeatures-never-runs).

**Hold the in-flight promise, not a boolean.** Both `FeaturePanel` and `TrainingPanel` mount on the same commit and each fires `updateNonNtigramFeaturesDataset()` without awaiting it, so two calls can be inside `guaranteeFeaturesDataset()` at once. A boolean set after three awaited round trips lets the second entrant past the check and run a duplicate 682-case backfill. A promise makes "at most once" true rather than likely, and costs a line:

**And swallow a failed migration rather than rethrowing it.** This is the one place in the plan that decides that, so it is decided here. Today `guaranteeFeaturesDataset()` does no I/O at all on this path, so it cannot reject; after this change it awaits five requests, and `sendRequest` rejects on a timeout (`CodapInterface.ts:345`) and on a closed connection (`:364`). Neither caller is in a position to handle it: `storyq.tsx:94` calls `domainStore.fromJSON()` without `await` and without `.catch`, and `feature_panel.tsx:13` and `training_panel.tsx:12` call `updateNonNtigramFeaturesDataset()` the same way, whose whole body sits inside `if (await this.guaranteeFeaturesDataset())` at `:202`. A rethrow therefore buys an unhandled rejection on one path and, on the other, silently skips the frequency recount, the feature-case creation and the target `featureIDs` write. All three migration steps are cosmetic repairs and the work waiting behind them is not, so a failure has to cost the repairs rather than the document. See [I19](#resolved-i19-the-migration-puts-three-new-rejection-paths-in-front-of-work-that-today-cannot-fail-and-nothing-handles-them).

```ts
private migration?: Promise<void>;

private migrateExistingFeaturesDataset() {
  this.migration ??= this.runFeaturesDatasetMigration().catch(error => {
    console.log(`Could not bring the Features dataset up to date: ${error}`);
    this.migration = undefined;   // a transient failure retries on the next entry
  });
  return this.migration;
}

private async runFeaturesDatasetMigration() {
  const { datasetName, collectionName } = featureStore.featureDatasetInfo;
  const resource = `dataContext[${datasetName}].collection[${collectionName}]`;

  // 1. Hide, commit 3. Issued unconditionally: repeating a hide succeeds, and the flag is only
  //    readable through `get attribute[…]`, which costs a round trip to guard the cheapest step.
  //    See requirement 8.
  await codapInterface.sendRequest(["color", "highlight"].map(attr => ({
    action: "update",
    resource: `${resource}.attribute[${attr}]`,
    values: { hidden: true }
  })));

  // 2. Repair the ngram colour, commit 6. The only conditional step. See section 6.

  // 3. Create and backfill `total frequency`, commit 4. See section 4.
}
```

**The two functions are not interchangeable, and every step belongs in the second one.** `migrateExistingFeaturesDataset()` holds the guard and nothing else: its `??=` guards only the promise it creates, so anything put in its body runs on **every** entry, which is every feature added, every re-check of the ngram box and every collapse and expand of the StoryQ panel. Anything put there also sits outside the `.catch`, which wraps `runFeaturesDatasetMigration()` and only that, so a `sendRequest` timeout in a step added to the wrapper becomes the unhandled rejection [I19](#resolved-i19-the-migration-puts-three-new-rejection-paths-in-front-of-work-that-today-cannot-fail-and-nothing-handles-them) decided the plugin must not produce. `runFeaturesDatasetMigration()` is the one clearly named function requirement 8 asks for and the only place steps go: sections 4 and 6 add theirs at the two numbered comments above, in that order. See [J1](#resolved-j1-sections-4-and-6-put-the-three-migration-steps-in-the-guard-wrapper-rather-than-in-the-guarded-body-which-undoes-i7-and-i19).

Both hide requests go in one array, as `hideWeightsAttributes()` (`domain_store.ts:62-74`) does. Measured cost on doc 1 was 40 ms and 143 ms.

**Two more places the guard has to be set, both one line.**

- **In the creation branch**, `this.migration = Promise.resolve()` after a successful create. Otherwise a fresh document runs the whole migration on the first feature added: `feature_pane.tsx:58-59` awaits `updateNonNtigramFeaturesDataset()`, which creates the dataset, and then `updateNgramFeatures()`, which finds `featureDatasetID !== -1` and takes the `else`. Nothing breaks, but it re-hides attributes created hidden, re-creates an attribute declared in `attrs`, and backfills cases written seconds earlier, all inside one click. It would also mean the path most manual testing takes cannot tell an old document from a new one.
- **At the top of `domain_store.fromJSON()`**, `this.migration = undefined`. The guard is per plugin instance, not per document, and `storyq.tsx:61` registers `restorePluginFromStore` against `update interactiveState`, so the plugin is built to accept restored state into a running instance. I did not establish a sequence in which CODAP pushes a second document's state into a live plugin, so this is closing an assumption rather than a known defect; it is worth closing because it makes "once per restore" true by construction and costs nothing.

## 4. `total frequency`

**Attribute creation.** New documents declare it in the `attrs` array after the two frequency attributes. Existing documents get it from the migration, via the existing `guaranteeAttribute()` helper (`codap-helper.ts:156`), which guards the create by name:

```ts
await guaranteeAttribute({ name: "total frequency", hidden: false }, datasetName, collectionName);
```

The guard is optional, since a repeat create returns the existing attribute, and it is **not** free: `guaranteeAttribute()` issues a `get …attributeList` before deciding (`codap-helper.ts:156-174`). That is the same round-trip-to-guard-a-cheap-step trade section 3 and requirement 8 decline for the hides, so take it for readability if you want it, but take it knowingly. One hazard before adopting the helper in a migration path: it reads `tNamesResult.success` after a `.catch()` that returns `undefined`, so a rejected request throws a `TypeError` out of the migration rather than logging and continuing. **`getCaseValues()` has the identical shape** (`codap-helper.ts:196-212`), and the backfill below is built on it, so the migration has two of these whichever way the `guaranteeAttribute()` question goes. Neither needs fixing here, because section 3's `catch` swallows the failure either way; they are recorded so nobody reads either helper as fail-soft.

**The four write sites** of requirement 5:

1. Feature-case creation, `domain_store.ts:237-253`: add `'total frequency': iFeature.numberInPositive + iFeature.numberInNegative` to `tValuesObject.values`.
2. Unigram-case creation, `:352-370`: add `'total frequency': iFeature.numPositive + iFeature.numNegative` to `tCaseValues.values`.
3. The update path, `:276-291`: add it beside the two hardcoded frequency names. Add a comment there pointing at [STORYQ-85](https://concord-consortium.atlassian.net/browse/STORYQ-85), per the Technical Notes. Do not fix the hardcoding in this story.
4. The restore backfill, below.

**The backfill**, step 3 of `runFeaturesDatasetMigration()` and **not** of the guard wrapper around it (section 3 says why). This is where the implementation departs from requirement 6's wording, deliberately:

> Requirement 6 says the token half of the backfill sums `numPositive` and `numNegative` from the restored `tokenMap`. Read the two values off the *cases* instead, discovering their names by the `frequency in ` prefix on the case values. It is the same arithmetic without recounting, which is what the requirement is protecting, and it covers constructed features and tokens in one pass rather than two. It also avoids reconstructing the label-derived attribute names, which is the exact hazard requirement 7 warns about and the bug STORYQ-85 tracks. Probed on doc 1: 682 cases, 178 ms, `129 + 71 = 200`.

```ts
const cases = await getCaseValues(datasetName, collectionName);          // codap-helper.ts:196
const freqAttrs = Object.keys(cases[0]?.values ?? {}).filter(k => k.startsWith(kPosNegConstants.positive.attrKey));
```

`kPosNegConstants.positive.attrKey` and `.negative.attrKey` are the same literal, `'frequency in '` including its trailing space (`store_types_and_constants.ts:14,18`), so one `startsWith` finds both attributes whatever the class labels are. Then one batched update over every case, `{ id, values: { 'total frequency': sum } }`, against `${resource}.case`.

Cases whose two frequency values are empty (there should be none) sum to 0, not `NaN`; coerce with `Number(v) || 0`.

## 5. Store write-back

Its own commit, ahead of the restore repair and the buttons, because both call it.

Two methods on `FeatureStore`, both of which must write the parent `Feature` in the same tick as any token mutation (trap 1):

```ts
async setHighlightFor(feature: Feature, highlight: boolean)
async setColorFor(feature: Feature, color: string)
```

Each one: if `feature.type === kFeatureTypeUnigram`, mutate every **unigram** entry in `tokenMap` first; then mutate `feature`; then write to CODAP. The ngram `Feature` does carry `kFeatureTypeUnigram` (`addFeatureUnderConstruction()` maps `kFeatureKindNgram` to it, `feature_store.ts:300`), which is the same test `toggleChosenFor()` uses.

**`tokenMap` is not only unigrams, so the loop is filtered:** `Object.values(this.tokenMap).filter(token => token.type === kTokenTypeUnigram)`. `oneHot()` adds a token of type `kTokenTypeConstructed` for every entry in a document's `columnFeatures` (`one_hot.ts:100-112` and `:118-131`), and `model_manager.ts:332-334` builds `columnFeatures` from `targetColumnFeatureNames.concat(featureStore.chosenFeatures.map(f => f.name))`, which is every chosen feature. So any trained document carrying single words plus a `count` or `contain` feature has one constructed token per such feature sitting in the same map. `deleteUnigramTokens()` already filters on exactly this predicate (`feature_store.ts:317-323`), and the CODAP half of this fan-out is already scoped by `caseFormulaSearch[type='unigram']`; the filter is what makes the store half agree with the write it is paired with. Unfiltered it is invisible today, because `getFeatureOrTokenByCaseId()` resolves `Feature` before `Token` (`feature_store.ts:237-239`) so a constructed feature's highlighting never reads its token, but that is a lookup order nothing states or tests, and the corrupted values would be serialised into the saved document. See [J4](#resolved-j4-mutate-every-entry-in-tokenmap-is-over-broad-tokenmap-also-holds-one-token-per-constructed-feature-after-training).

**Tokens before the `Feature`, and both inside one mobx action.** Trap 1 establishes that a token mutation alone fires nothing and that touching the `Feature` in the same tick fixes it. It does not establish that the order is free, and it is not. Measured with a throwaway jest test on 2026-08-06, a `reaction` on `featureStore.highlights` over the real store:

| Order | Inside a mobx action | Reactions | What the reaction saw |
|---|---|---|---|
| `Feature`, then tokens | yes | 1 | every colour new |
| `Feature`, then tokens | no | 1 | new `Feature` colour, **stale token colours** |
| tokens, then `Feature` | no | 1 | every colour new |
| tokens only | yes | 0 | trap 1, reconfirmed |

Outside an action mobx flushes on the `Feature` write, before the token loop has run, so the text pane repaints with the old token colours and nothing repaints it again. As two `FeatureStore` methods these are actions already, because `makeAutoObservable(this, {...}, { autoBind: true })` (`feature_store.ts:53-55`) makes them so, and either order would work. Write them tokens-first anyway: it is the order that survives the loop being moved into a component handler, a plain helper, or anywhere after an `await`.

The two write shapes differ, and they differ in a way that invites exactly one mistake:

- Ordinary feature: `update ${resource}.caseByID[${feature.caseID}]` with **`{ values: { values: { color } } }`**. The nesting is required, not stylistic: `case-by-id-handler.ts` passes `nestedValues: true`, and `handler-functions.ts:85-88` returns `fieldRequiredResult("update", "caseByID", "values.values")` without it. `toggleChosenFor()` (`feature_store.ts:409-417`) already writes the nested form; follow it literally. A flat payload returns `success: false`, which nothing in the plugin checks, so the store, the pill and the picker would all look correct while requirement 3 quietly failed.
- Ngram feature: the fan-out. Get the cases with `caseFormulaSearch[type='unigram']` (109 ms), then **one** batched `update ${resource}.case` with a flat `{ id, values }` array (242 ms for 682) and **no** nesting: that resource is a different handler, `updateCasesBy` (`case-handler.ts:87-89`). Factor this out of `syncUnigramsInFeaturesDataset()` (`:386-403`) so all callers share it, and leave that function's `if (!iChosen) this.deleteUnigramTokens()` branch behind in `toggleChosenFor()` where it belongs. Requirement 29 spells out why that branch must not travel with the shared code.

The 109 ms lookup is avoidable, since requirement 6 establishes that every restored token carries its `featureCaseID` and tells the backfill to use those ids. It is kept here deliberately: `featureCaseID` starts as `null` on a freshly created token (`store_types_and_constants.ts:316`) and is filled in only after `updateTokenCaseId()`, so the search is the one source that is correct in every state. Recorded so the next reader does not take it for an oversight.

Note that the ngram `Feature` has no case of its own in doc 1 (its saved `caseID` is the empty string), so the fan-out covers it by covering its tokens; do not issue a `caseByID` write for it.

The echo comes back as a single `updateCases` notification carrying every case with full values, and `handleUpdateFeatureCase()` reassigns what we just wrote. That is idempotent and measured; no guard, no suppression flag.

## 6. Repairing the ngram colour on restore

**Second** step in `runFeaturesDatasetMigration()`, ahead of section 4's backfill and not in the guard wrapper (section 3 says why), and the only conditional one of the three, since its condition lives in the plugin's own restored state where it can be read:

```ts
const ngram = featureStore.ngramFeature;
if (ngram?.color === kNoColor) {
  await featureStore.setColorFor(ngram, ngramColor);   // fans out to the tokens, per requirement 26
}
```

`setColorFor()` from the previous commit already does all three parts: it sets the `Feature`, sets every unigram token in `tokenMap` because the feature is `kFeatureTypeUnigram`, and issues the one batched write. Calling it here rather than reimplementing the fan-out is what states requirement 27's rule once instead of twice. An earlier draft of this section called a `writeColorToCases()` that exists nowhere else; there is one method, and it is `setColorFor()`.

Gated on the `Feature`, tokens included, per requirement 22. Tokens take the repaired `Feature` colour rather than the constant, which is the requirement 27 rule stated once. `highlight` is untouched.

**Run the three migration steps in the order hide, repair, backfill, and note that this is not the order the sections are written in.** All three sit inside the in-flight-promise guard from section 3.

The order is chosen to make the plugin independent of when CODAP delivers an echo, **not** because the other order is known to break. Tested at `f3d41932d`, the other order is safe too, and the reason is worth knowing rather than relying on: CODAP broadcasts the `updateCases` notification synchronously inside `applyModelChange()`, before the handler returns and therefore before the request processor replies, so the plugin always sees the echo before its own `await` resolves. See [I18](#resolved-i18-the-prescribed-step-order-is-safe-in-both-directions-and-the-plugin-should-not-have-to-know-that) for the chain and the test.

What that guarantee buys, and why not to lean on it: the backfill is one batched update over 682 cases whose echo carries every case's `color`, and `handleUpdateFeatureCase()` assigns `tToken.color` from it for every unigram case (`notification_manager.ts:88-93`). Backfill-first is safe only because the echo arrives before `setColorFor()` has turned the in-memory tokens yellow. If it ever arrived later, all 682 tokens would revert while the `Feature` stayed yellow, and nothing would notice: a token-only mutation fires no reaction (trap 1) so the pane keeps its yellow render, the guard stops the migration re-running, and `asJSON()` saves the reverted map, after which requirement 22's `kNoColor` gate is false forever. Repair-first has no such precondition, because the backfill's echo then carries the repaired colour and is idempotent whenever it lands. The two steps write different attributes and neither reads the other's output, so the ordering costs nothing and removes an undocumented dependency on CODAP's internals.

## 7. The controls

### 7a. The two row buttons

`feature_list_item.tsx` gains a prop in the existing style, defaulting off so the Training tab is unchanged by construction (requirement 33):

```ts
interface IFeatureListItemProps {
  allowChoose?: boolean
  allowDelete?: boolean
  allowHighlightControls?: boolean     // new, default false
  feature: Feature
}
```

`feature_list.tsx` passes it through; `feature_pane.tsx` sets it on the Features tab only.

Both controls are real `<button>` elements (requirement 34) and must not use `src/components/ui/button.tsx`, which is a `div` with no key handler. Three new SVGs go in `src/assets/` and are imported as components, following the existing `CloseIcon` import.

Accessible names are built from the feature name, and the visibility toggle's name carries its state with no `aria-pressed` (requirement 35):

```tsx
aria-label={feature.highlight ? `Hide highlighting for ${feature.name}` : `Show highlighting for ${feature.name}`}
```

The colour button carries `aria-expanded` for the picker.

**There is no name pill today, and making one is the bulk of this commit.** `.feature-list-item` is the whole row: 400 px wide, `border: solid 1px #177991`, `border-radius: 3px`, and `style={{ backgroundColor: feature.color }}` applied to it in `feature_list_item.tsx:29`. The Zeplin 4A row is not that shape. Reading the coordinates off the board, each `Feature` group is 400x28 at x=48 and contains:

| Element | x | Width | Fill |
|---|---|---|---|
| Visibility Button | 48 | 28 | `#ffffff`, 1 px `#177991`, r=3 |
| Color Button | 81 | 28 | the feature's colour, 1 px `#177991`, r=3 |
| Feature back (the pill) | 114 | 334 | the feature's colour, 1 px `#177991`, r=3 |
| Close Icon | 422 | 24 | inside the pill, right-aligned |

So the colour and the border belong to the **pill**, and the two buttons sit outside it on a transparent background, 5 px apart (81 - 48 - 28 = 5, and again 114 - 81 - 28 = 5). Icons are 24x24 inside the 28x28 buttons (requirement 10), inset 2 px.

That makes this a markup change, not a style tweak:

- **Set `box-sizing: border-box` on the wrapper, both buttons and the pill.** There is no global reset in this plugin: `box-sizing` appears only in `collapse-button.scss`, `text-section.scss`, `text-pane.scss` and `pane-divider.scss`, plus vendor CSS under `src/styles/`, and `feature_list_item.scss` sets none. Two things below depend on it and neither is optional. The drawn row closes exactly (28 + 5 + 28 + 5 + 334 = 400), but `.feature-list-item` today is `width: 400px` with `padding: 4px` and a 1 px border, so under the inherited `content-box` it already renders 410 px and the restructured row would overflow its wrapper by the same 10 px, whether the pill takes a fixed 334 px or `flex: 1`. And the focus indicator below is a border swap, which under `content-box` grows each button from 30x30 to 32x32 and nudges the row exactly as requirement 36 is trying to prevent.
- A new outer wrapper takes over the 400 px width, the margin, and the flex layout, and carries no background or border.
- The current `.feature-list-item` becomes the pill: it keeps the border, radius, padding and `backgroundColor`, and its width becomes the remainder rather than 400 px.
- The two buttons render before the pill, inside the wrapper, only when `allowHighlightControls` is set.
- **The wrapper must collapse when the controls are absent**, or the Training tab gains 66 px of dead space to the left of every row and requirement 33 is broken by the restructure rather than by the buttons. `FeatureList` is shared; check the Training tab against doc 3 before calling this done.

The pill's `backgroundColor` becomes conditional on `feature.highlight` (requirement 11: white pill when highlighting is off) while the colour button keeps showing the colour either way (requirement 12).

**Gate that on `allowHighlightControls`, not on `feature.highlight` alone, or the Training tab changes too.** `FeatureList` is shared: `feature_pane.tsx:107` and `training_pane.tsx:230` reach the same `feature_list_item.tsx:29`, which today is `const style = { backgroundColor: feature.color };` with no reference to `highlight`. Ungated, a feature whose highlighting is off renders as a white row on the Training tab as well, which requirement 33 says does not change. That is reachable today, since `highlight` is a checkbox on every case in the current Features table and `handleUpdateFeatureCase()` copies it onto the `Feature` (`notification_manager.ts:86`), and after commit 7 it is one click. The ordinary sequence is: hide a feature's highlighting on the Features tab, switch to Training, and find that row has lost its colour with nothing on that tab to explain it.

It is also the one place in this story where requirement 38's principle fails on its own terms. Requirement 38 names the eye and eye-with-slash icons as the channel that carries highlight state independently of the pill's fill, and on the Training tab those icons are deliberately absent, so a white row there would carry the meaning by colour alone. The fill belongs to the control, not to the feature:

```tsx
const style = {
  backgroundColor: allowHighlightControls && !feature.highlight
    ? "#ffffff"
    : ngramTokenColor(feature.color)      // maps kNoColor to ngramColor; see below
};
```

`ngramTokenColor` comes from `../utilities/color-utils`, which `feature_list_item.tsx` imports nothing from today.

**`kNoColor` must not fall through to "no inline background", because that renders white and white now means something.** The obvious guard is to emit no `backgroundColor` at all for `kNoColor`, and both specs describe the result of that as a transparent pill. It is not transparent: `.feature-list-item` sets `background-color: white` (`feature_list_item.scss:3`), so dropping the inline declaration falls back to the class rule. Measured in a browser with the real stylesheet applied: a row carrying `style="background-color: NO_COLOR"` and a row carrying no inline background both compute to `rgb(255, 255, 255)`, identical to requirement 11's highlighting-off pill. So the guard that looks safest is the one that makes a pre-change ngram row claim its highlighting is off while it is on, for the roughly 700 ms before the migration repairs it, and for the whole session if I19's swallowed failure means it never does.

Mapping it to `ngramColor` instead costs nothing and removes the state: the transient render is then identical to the post-migration render, requirement 32's "never emit an invalid inline `backgroundColor`" still holds, and white keeps exactly one meaning. It is also honest about what the value is, since a rendered `kNoColor` row can only be the ngram feature awaiting requirement 22's repair, and `ngramColor` is precisely what that repair is about to assign. See [L1](#resolved-l1-a-knocolor-row-renders-white-not-transparent-and-after-this-story-white-means-highlighting-is-off), [K4](#resolved-k4-section-7as-conditional-pill-fill-is-not-gated-on-the-new-prop-so-it-changes-the-training-tab) and [K6](#resolved-k6-two-commits-leave-an-import-that-fails-the-build-and-neither-section-says-so).

**On the ngram row that flag can disagree with the words it stands for, and that is expected.** The eye reflects the ngram `Feature`'s `highlight`, but requirement 22 deliberately leaves per-token `highlight` alone on restore, and a pre-change document can carry individual choices a student made word by word through the Features table before this story hid the column. So a restored row can read "highlighting is on" while some of its 682 words do not highlight. It is a first-render presentation gap rather than a stuck state, since either press of the eye writes every token and resolves it, and it is recorded here so the first person to meet it does not file it against the new control. Deriving the icon from the tokens instead would be a computed over `tokenMap` and a requirements decision, not an implementation one. See [J8](#resolved-j8-on-a-restored-document-the-ngram-rows-eye-can-disagree-with-the-words-it-stands-for-and-nothing-says-what-that-should-look-like).

**Guard `kNoColor` here too, in the same expression.** `feature_list_item.tsx:29` is the second site that emits `feature.color` as an inline style, and it is less defended than the one section 8 fixes: `const style = { backgroundColor: feature.color }`, with no guard at all, not even the string-truthiness test `utilities.ts:21` has. Requirement 31 is supposed to make that unreachable, and on the restore path it is only *eventually* true: `restorePluginFromStore` sets the features synchronously and then does **not await** `domainStore.fromJSON()` (`storyq.tsx:91-97`), so the tab renders while the migration is in flight. On this spec's own measured figures that window is roughly 700 ms (40 and 143 for the hides, 178 for the backfill, 109 and 242 for the repair's search and write), and for all of it a pre-change document renders its ngram row from `kNoColor`. That row renders **white** for the whole of that window, not transparent as an earlier draft of this paragraph said: the invalid inline declaration is dropped and `.feature-list-item`'s own `background-color: white` (`feature_list_item.scss:3`) takes over. Today that is merely odd. After this story white is requirement 11's signal that highlighting is off, so the same render becomes a claim about state, and a false one. That is why the guard maps `kNoColor` to `ngramColor` rather than to no background at all; see the style expression above and [L1](#resolved-l1-a-knocolor-row-renders-white-not-transparent-and-after-this-story-white-means-highlighting-is-off). Requirement 32's demand that an invalid inline `backgroundColor` never be emitted is satisfied either way; the choice between them is about what the pill says.

**Button states**, all of which the design draws and none of which are optional (requirements 11, 13, 36). In `feature_list_item.scss`:

| | Visibility button | Colour button |
|---|---|---|
| Default | `#ffffff` fill, 1 px `#177991`, icon `#177991` | feature colour fill, 1 px `#177991`, droplet icon `#616161` |
| Hover | `#d3f4ff` fill | feature colour at 50% alpha |
| Pressed | `#bfefff` fill | same as default |
| `:focus-visible` | `#d3f4ff` fill, border swaps to 2 px `#0957d0` | colour at 50% alpha, border swaps to 2 px `#0957d0` |

The focus indicator is a **border swap**, not an added outline, so the box stays 28x28 with no layout shift (requirement 36) **given the `box-sizing: border-box` above**, without which it grows the button by 2 px in each dimension. The 50% alpha on the colour button is on the fill only; take it with `color-mix()` or by rendering the colour behind a translucent overlay rather than by mutating the stored hex.

### 7b. The picker

New `src/components/color_picker.tsx` and `.scss`. Nothing in the dependency tree helps here, so all of it is ours.

```tsx
interface IColorPickerProps {
  button: HTMLElement      // the colour button itself, not just its rect
  color: string            // the feature's current colour
  featureName: string      // for the accessible names of requirement 41
  id: string               // the popover's id, for the button's aria-controls
  onChoose: (color: string) => void
  onClose: (returnFocus?: boolean) => void
}
```

**Two of those signatures were `anchor: DOMRect` and `onClose: () => void` when this was written, and both had to widen while building.** The picker needs the button **element**, not only its rect: the outside-click and focus-out routes below both have to recognise events that landed on the button, and the rect is one `getBoundingClientRect()` away from the element while the element cannot be recovered from the rect. And `onClose` has to say which route fired, because the Closing list below splits five routes into three that return focus and two that must not; a bare `onClose()` cannot express that, and the row would have to guess. `id` is the popover's own id, which the button's `aria-controls` needs and which the row therefore owns.

**Placement.** Render the picker through `ReactDOM.createPortal(…, document.body)`, and give the portalled element `position: fixed` with coordinates from `button.getBoundingClientRect()`. Open below by default; if `anchor.bottom + 75 > window.innerHeight`, open above. Recompute on scroll and resize while open, or close on scroll, which is simpler and acceptable here.

**The portal is required, not a matter of taste, and `position: fixed` inside the row does not work.** Absolute positioning inside the row is clipped by the feature list's own scroll containers, `.sq-container` (`storyq.scss:238-241`) and `.sq-feature-panel` (`:146-151`), which is the failure requirement 14 warns about. The obvious escape, `position: fixed` left in place, fails for a different and much less visible reason: `tab-panel.tsx:55` and `tab-panel-tab-content.tsx:22` each set an inline `transform: translate(0px, 0px)`, and a `transform` of anything other than `none` makes an element the containing block for its `position: fixed` descendants. `translate(0px, 0px)` counts; it computes to a matrix, not to `none`. So `top` and `left` would be measured from `.ui-multiview-item`'s padding box while `getBoundingClientRect()` reports viewport coordinates, and the flip rule would compare viewport numbers against a box that is not the viewport.

Measured in a browser against `light.compact.css`, `storyq.scss` and `feature_list_item.scss` unmodified, with those two inline styles copied verbatim, at the plugin's own 460x420 starting size: in-row `position: fixed` rendered **38 px too low and 1 px too far right** at every row, which is exactly `.ui-multiview-item`'s offset and therefore the tab strip's height. A feature row is also 38 px tall, so the picker lands exactly one row too low, under the row below the one that opened it, identically at every scroll position, which is what makes it read as a styling mistake rather than a positioning bug. Portalled to `document.body` the error was zero. See [K1](#resolved-k1-the-pickers-position-fixed-does-not-resolve-against-the-viewport-because-two-ancestors-carry-an-inline-transform).

Any target outside `#tabPanel` works; `document.body` is the simplest. What must not happen is the picker being left inside the transformed subtree, which is where it lands if it is simply rendered by the row.

**Swatches.** `featureColors`, plus a seventh when `!isPaletteColor(color)`, showing `color` and checked. 24x24 cells at a 27 px pitch, four per row, 12 px inset, popover 129x75, per requirement 16.

**Names, roles and selection state** (requirement 41). The grid is one control, not seven buttons that happen to sit together, and none of this comes for free with plain elements:

- The popover is `role="listbox"` with `aria-label={`Highlight color for ${featureName}`}`; each swatch is `role="option"` with `aria-selected`. `radiogroup` and `radio` with `aria-checked` are equally correct; pick one and do not mix them. `featureName` is a prop, not a `Feature`: the picker needs nothing else from the store.
- Each swatch needs a name, since it has no text content and the six differ only by colour. Take it from `featureColorNames[normalizeHex(color)]`, the record section 2 adds beside the palette. Do **not** put the names into `featureColors` itself: that array is consumed as six hex strings by `getFeatureColor()` and two call sites this story does not touch, and section 2 says what breaks. Requirement 17's seventh swatch is a hex with no entry in the record, so it falls through to a generic name such as "Current color".
- The colour button's own `aria-label` names the feature too, the way the visibility toggle's does. Requirement 34 asks that of both controls and section 7a only showed it for one.
- The colour button also carries `aria-haspopup="listbox"` beside its `aria-expanded`, and an `aria-controls` pointing at an `id` on the popover. `aria-expanded` alone says something opens without saying what, and once the picker is portalled to `document.body` the two elements are no longer related by DOM position either, so the id pair is the only thing left tying them together. Neither attribute is what makes the control usable, since requirement 37's focus move is, but they are two attributes and they are the difference between a button that announces a listbox and one that announces an expandable something.

The roving tabindex is unchanged by any of this: `option` and `radio` both expect exactly one tab stop, which is what section 7b already specifies.

**Closing.** Five routes. The first three return focus to the colour button; the last two must **not**, because the user has already said where focus goes (requirement 37):
- **Escape**, from a `keydown` handler on the popover. Returns focus.
- **Choosing a swatch**, via `onChoose`. Returns focus.
- **Activating the colour button again.** Returns focus, trivially, since that is where the click landed. The button is a plain toggle over the open state; do not let the outside-click handler fire first and reopen it on the same click, which is the usual way this breaks. Either check `event.target` against the button before closing, or close on `mousedown` and toggle on `click`.
- **Clicking elsewhere.** A `pointerdown` listener on `document` while the picker is open, ignoring events inside the popover and inside the button. Does not move focus. **Test containment with a ref on the popover element**, `popoverRef.current?.contains(event.target)`, not against the row: the portal means the popover is no longer a DOM descendant of the row, so any check written against the row would treat every click on a swatch as an outside click and close the picker before `onChoose` could fire. The same goes the other way for React's synthetic events, which still bubble from portal children through the React tree, so a handler on the row or the new wrapper would see clicks that landed in the popover.
- **Focus leaving the popover.** A `focusout` handler on the popover that closes when `event.relatedTarget` is neither inside the popover nor the colour button. Does not move focus.

**Both conditions on the `focusout` handler are load-bearing.** `focusout` fires on the popover every time focus moves **between** swatches, which the roving tabindex does on every arrow key, and the naive handler therefore closes the picker on the first press of an arrow. Confirmed in a browser: moving focus from one swatch to the next fired `focusout` on the container with `relatedTarget` set to the incoming swatch. The button half matters for the same reason in reverse: Escape moves focus to the colour button and would otherwise re-enter this handler after the picker has already closed.

**The fifth route is the one a keyboard-only user reaches first.** The swatch grid is a roving tabindex, so it is exactly one tab stop, so a single Tab press leaves the popover. Without this handler the picker stays open, unreachable, over a row whose button still reports `aria-expanded="true"`, and the portal makes it worse rather than better: portalled to `document.body` the popover is last in DOM order, so Tab from a swatch leaves the plugin's content entirely. Shift-Tab does the same in the other direction. See [K5](#resolved-k5-nothing-closes-the-picker-when-focus-leaves-it).

One lifecycle case falls under the same clause: if the row unmounts while its picker is open, which deleting the feature does, the focus-return target is a detached button, `focus()` on it does nothing, and focus falls to `<body>`. Nothing needs building for that beyond not assuming the button is still there.

**Keyboard.** Roving tabindex over a flat array of swatches with a known row width of 4:
- Left/Right: index ±1, wrapping at both ends.
- Up/Down: index ±4, clamped to the last existing index when the target does not exist (the ragged second row).
- Enter/Space: choose. Escape: close without choosing.
- On open, focus the selected swatch; on close, focus returns to the colour button on the three routes that call for it and not on the other two, per the Closing list above and requirement 37.

Focus ring is an **outset** 2 px `#0957d0` on `:focus-visible`, not a border swap, so it does not fight the swatch's own selection border (requirement 36).

## 8. The `kNoColor` guard

`utilities.ts:19-23` currently tests `feature?.color`, which is truthy for the string `"NO_COLOR"` and would emit it as an inline `backgroundColor`. Test explicitly:

```ts
const style = feature?.color && feature.color !== kNoColor ? { backgroundColor: feature.color } : undefined;
```

`kNoColor` needs importing from `./color-utils`; `utilities.ts` imports nothing from it today, and there is no cycle risk, since `store_types_and_constants.ts:6` already imports the same constant from the same module.

Requirement 31 (no rendered row carries `kNoColor`) is delivered by commits 2 and 6; this is the belt-and-braces of requirement 32. The row's own inline style is the other half of that guarantee and is guarded in commit 7 instead, since commit 7 rewrites the line anyway; see section 7a.

## 9. Re-deriving the target case formula on restore

Requirement 40. Pre-existing defect, in scope because requirements 4 and 12 both sit on top of it; the isolation is in [I17](#open-i17-restored-count-features-lose-their-search-formula-so-they-stop-counting-and-stop-highlighting) below.

`Feature.targetCaseFormula` is a function, and `Storyq.getPluginStore()` strips functions on purpose (`storyq.tsx:71-77`). Do not try to serialise it: rebuild it from `where`, which does survive the round trip. In `featureStore.fromJSON()` (`feature_store.ts:100-108`), right after `setFeatures()`:

```ts
this.features.forEach(feature => {
  feature.targetCaseFormula = getTargetCaseFormula((feature.info.details as SearchDetails)?.where ?? "");
});
```

Nearly the same expression and the same cast as `target_store.ts:378`, which is where a newly created feature gets it. The `?.` and the `?? ""` are the difference: `details` is `SearchDetails | CountDetails | NgramDetails | ColumnDetails | null` (`store_types_and_constants.ts:200`), and the cast asserts the null away for the compiler without doing anything about it at run time, so the literal expression throws on a feature whose details are null. `""` is a `SearchWhereOption` and maps to `defaultTargetCaseFormula`, which is what this section already wants for every non-search feature. `getTargetCaseFormula` and `SearchDetails` both come from `store_types_and_constants`, which `feature_store.ts` already imports from.

Applying it to every feature rather than only to `count` features is deliberate. `getTargetCaseFormula` returns `defaultTargetCaseFormula` for every other `where` value and for a missing one (`store_types_and_constants.ts:163-174`), so the uniform version is a no-op everywhere else and states the rule once: a restored feature searches the way a created one does. Ngram and column features get one too and never use it, since `updateFrequenciesUsagesAndFeatureIDs()` iterates non-ngram features only.

Nothing else needs touching. `getPluginStore()`'s function-stripping stays, and this commit is independent of the other eight.

## 10. Keeping count features in the feature IDs rebuilt after training

Requirement 42, and the sibling of section 9. Same symptom, same consequence for requirement 12, different mechanism and a different function.

`recreateUsagesAndFeatureIDs()` (`domain_store.ts:536-617`) rebuilds every target case's `featureIDs` from scratch after a training run (`model_manager.ts:448`). It does not use `targetCaseFormula` at all; it reads each feature's own attribute off the target case and tests it for truth (`:558-563`). A `count` feature's attribute holds `patternMatches(…)`, a number, which arrives from CODAP as a string, so the test never passes and the feature is left out of the rebuild.

One predicate, and it states the rule `getTargetCaseFormula()` already states, that the default is `attr=true` and count is `attr>0`:

```ts
const value = iTargetCase.values[tFeatureName];
const tTargetHasFeature = ['constructed', 'column'].includes(tFeatureType)
  ? value === "true" || value === true || Number(value) > 0
  : tFeatureType === 'unigram'
  ? targetTextHasUnigram(String(iTargetCase.values[targetAttributeName]), tFeatureName)
  : false;
```

`Number("true")` is `NaN` and `NaN > 0` is false, so `contain` and the other boolean where-options are untouched. `Number("0") > 0` is false, so a count of zero stays a non-match, which is what the current code gets right and must keep getting right. The existing comment about v3 returning strings for booleans stays and now covers numbers too.

Deliberately not done here: teaching this function to run `targetCaseFormula` properly, which would mean a formula search per feature and would make a post-training pass far more expensive than the value read it does today. The predicate reproduces the formula's meaning at the point where the value is already in hand.

Independent of the other nine, and worth landing beside commit 9 for the reason the commit table gives.

## Files touched

| File | What |
|---|---|
| `src/utilities/color-utils.ts` | export `featureColors`, add `featureColorNames`, `ngramColor`, `ngramTokenColor`, `normalizeHex`, `isPaletteColor` |
| `src/utilities/utilities.ts` | `kNoColor` guard on the highlight style, plus the import for it |
| `src/stores/domain_store.ts` | `hidden: true` at creation; `total frequency` at all four write sites, the fourth being the backfill inside `runFeaturesDatasetMigration()`; that function, the `migrateExistingFeaturesDataset()` guard wrapper around it, and the step order hide, repair, backfill; the re-extraction token colour and highlight at `:353`; the constructed-feature predicate at `:558-563` |
| `src/stores/feature_store.ts` | `ngramFeature` getter, `setHighlightFor`, `setColorFor`, extracted fan-out, name fix, the `targetCaseFormula` re-derivation in `fromJSON()` |
| `src/managers/notification_manager.ts` | token re-creation colour and highlight (trap 3), and drop the now-orphaned `getFeatureColor` import |
| `src/components/feature_pane.tsx` | ngram feature colour (from `f7d9b5b`), pass the new prop |
| `src/components/feature_list.tsx` | pass the new prop |
| `src/components/feature_list_item.tsx` + `.scss` | the wrapper/pill restructure and the two buttons |
| `src/components/color_picker.tsx` + `.scss` | new; portalled to `document.body`, not rendered in place |
| `src/assets/` | three new SVGs from Zeplin |

**The build treats lint warnings as errors in CI**, so an import left behind by an edit is a red build rather than a tidiness note: `.github/workflows/ci.yml` runs `npm run build`, GitHub Actions sets `CI=true`, and `react-scripts` fails the compile on any ESLint warning under it. Two edits in this plan change which imports a file needs, and both are called out where they happen: section 2 orphans `getFeatureColor` in `notification_manager.ts`, and sections 7a and 8 each need a new `kNoColor` import.

## Tests

Jest with React Testing Library is set up and there are five existing test files; `text-pane.test.tsx` is the closest model for component tests. Neither `domain_store.ts` nor `notification_manager.ts` has any coverage today. This story adds two narrowly scoped tests to `domain_store.ts`, because each pins a defect that is otherwise invisible until a student meets it, and attempts no general coverage of either file.

**Mock `../managers/text_feedback_manager` in any test file that mocks `codap-helper` with a factory, or the stores will not see the mock.** `codap-helper.ts:1` imports `text_feedback_manager`, which imports the stores, which import `codap-helper`: a cycle. A factory of the usual shape, `{ ...jest.requireActual("../lib/codap-helper"), getCaseValues: jest.fn() }`, makes `requireActual` load the real module, whose imports re-enter the factory, so the module registry ends up holding a **second** set of mock functions. The test file configures one set and the stores call the other. The symptom is silent and misleading rather than a failure: `targetStore.updateTargetCases()` returns `undefined` with zero calls recorded on the mock the test is holding, and the next line dies on `targetCases.map`. One line fixes it, and it belongs beside the other mocks:

```ts
jest.mock("../managers/text_feedback_manager", () => ({ setupTextFeedbackManager: jest.fn() }));
```

`jest.spyOn(codapInterface, "sendRequest")` needs none of this, since it mutates the one module instance rather than registering a second. Prefer it where a whole-module mock is not needed. Note also that `featureStore`'s methods are bound by `autoBind`, so `jest.spyOn(featureStore, "setColorFor")` throws `Cannot assign to read only property`; mock the request layer under it instead, which is the better test anyway.

Worth writing:

- `color-utils`: `normalizeHex` and `isPaletteColor` over `#777`, `#777777`, `#FFE671`, `#ffe671`. Cheap, and it is the logic requirement 17 turns on.
- **`feature_store.fromJSON` re-derives `targetCaseFormula`** (requirement 40). Build a `count` feature and a `contain` feature the way `target_store.ts:378` does, round-trip them through `JSON.parse(JSON.stringify(...))` exactly as `getPluginStore()` does, restore, and assert the `count` feature's formula produces `>0` rather than `=true`. This is the test that would have caught the defect: it needs no CODAP, it runs in milliseconds, and the failing assertion is a one-character difference in a string. Promote the throwaway used to isolate I17 rather than writing it again.
- **`recreateUsagesAndFeatureIDs` keeps count features** (requirement 42). With `getCaseValues` and `codapInterface.sendRequest` mocked, two constructed features (`count` and `contain`) and target cases carrying the string values CODAP returns, assert three things: the rewritten `featureIDs` contain the contain feature and the count feature; a target case matching only the count feature is now rewritten rather than skipped; and a count of `"0"` is still a non-match. Promote the throwaway used to confirm I24 rather than writing it again; it already covers the first and third, and its "would survive if the value were `true`" control becomes redundant once the fix lands. It is cheap because the function takes all its input through two mockable seams.
- `feature_list_item`: the two buttons render only when `allowHighlightControls` is set, their accessible names carry the feature name and the visibility state, the colour button exposes `aria-expanded`, and neither appears in the Training tab configuration.
- `color_picker`: seven swatches when the colour is off-palette and six when it is not; arrow-key movement including the wrap and the ragged-row clamp; Escape closing. **And the accessibility contract of requirement 41**: every swatch has a non-empty accessible name, exactly one reports selected, and the grid exposes a group role and a name carrying the feature. Those are four `getByRole` assertions and they are the only cheap guard against a regression nobody can see.
- `feature_store.setColorFor`: with `codapInterface.sendRequest` mocked, an ngram feature produces exactly **one** batched update carrying every token's case id, and a constructed feature produces a single `caseByID` write with its values nested. **Assert through `featureStore.features[i]`, not through the object literal the test constructed**: `features` is a deep observable, so only the proxy read back out of it notifies, and a test that mutates its own literal passes for the wrong reason. This cost a wrong result while checking the ordering table in section 5. This is the regression guard for requirement 29, which is otherwise a performance property nobody will notice breaking until it takes a minute.
- **Requirement 27, at the extraction site.** Set the ngram `Feature`'s colour to something off-palette **and its `highlight` to false**, run `updateNgramFeatures()`, and assert every token in `tokenMap` carries that colour rather than `ngramColor` and is hidden rather than highlighted. The `highlight` half is the cheaper assertion and the more visible failure, since a regression there re-lights the whole text pane. This is the one behavioural regression in the story that a student would meet by accident (uncheck and re-check the feature on another tab) and that no visual check of the controls would catch.

  **This one needs more of a harness than "mock `codapInterface`", and without it the assertion passes while testing nothing.** `oneHot` does run without CODAP, because it takes its documents as an argument, so `one_hot.test.ts` is the right model for `oneHot` and the wrong one for this. `updateNgramFeatures()` builds its documents from `targetStore` (`domain_store.ts:315-334`), and `targetStore.updateTargetCases()` returns `[]` unless `targetAttributeName !== ''` (`target_store.ts:282-288`), so with a blanket mock the call completes, `tokenMap` stays empty, and `Object.values(tokenMap).every(…)` is vacuously true. Three things make it real, all confirmed by running it (see [J6](#resolved-j6-the-requirement-27-test-cannot-be-written-as-the-tests-section-describes-it-and-the-naive-version-passes-vacuously)):

  - a **resource-aware** `sendRequest` mock, returning target cases for the `caseFormulaSearch` request rather than one value for everything;
  - `targetStore` populated **through `targetStore.fromJSON()`**, since `targetDatasetInfo` is a computed (`target_store.ts:182-184`) and assigning it throws `It is not possible to assign a new value to a computed value`. It needs `targetDatasetInfo`, `targetAttributeName`, `targetClassAttributeName`, `targetClassNames` and `targetChosenClassColumnKey`;
  - an assertion that the token count is **non-zero** before any assertion about the tokens.

  So scaffolded it runs in 42 ms against the real `domainStore` and reproduces the defect exactly: seven tokens in the six-colour cycle, every one `highlight: true`, under a `Feature` set to `#dbb6fb` and `highlight: false`. Working scaffolding from the third review pass is in the session scratchpad as `req27-scaffolding.ts` and can be promoted rather than rewritten.

- **Requirement 27 again, at the notification handler, which is the site the student's gesture actually reaches.** The test above covers first extraction from the Features tab. It does not cover the Training tab round trip requirement 27 is written about, and it would pass unchanged if the handler fix were reverted, because `updateNgramFeatures()` returns at `:313` on that path (K2). So write the second one: set the ngram `Feature` off-palette and `highlight: false`, call `featureStore.toggleChosenFor(feature)` twice, and assert the rebuilt `tokenMap` carries the `Feature`'s colour and is hidden. The one thing the harness has to get right is CODAP's ordering: the `sendRequest` mock must fire the `updateCases` notification **synchronously, inside the batched `.case` update, before resolving**, which is what I18 established the real CODAP does and what makes the handler run before `toggleChosenFor()` returns. Assert a non-zero token count first, as in the test above. Working scaffolding is in the session scratchpad as `req27-recheck-scaffolding.ts`; it reproduces today's defect (rebuilt tokens at `#ffe671` and `highlight: true` under a `Feature` at `#dbb6fb` and `highlight: false`) and turns green with section 2's fix applied.

Manual verification follows the table in requirements.md, which says which document each requirement needs and why. The probe results in `requirements.md` cover the CODAP-side behaviour of the migration, so manual checking there is about the visible outcome (four columns, correct totals, colours repaired) rather than about whether the requests work.

## Two things to confirm before shipping

- **The popover geometry is derived, not drawn.** 129x75 follows from Michael's swatch component plus the four-per-row layout; requirement 16 says to confirm with him, as with the previous geometry.
- **The yellow collision.** `featureColors[0]` and `ngramColor` are both `#ffe671`, so the first ordinary feature in a document matches every extracted word. Requirement 21 records the decision to leave it and let Jie meet it in the running build. Keeping `ngramColor` as a single constant is what makes the fix a one-line edit if she wants one.

## Self-Review

Phase 3, Step 2 of `/cc-create-spec`, run 2026-08-06 against the implementation plan above. Roles: Senior Engineer, React/MobX Specialist, Migration and Backward Compatibility, Performance Engineer, QA Engineer, WCAG Accessibility Expert, Design Fidelity.

Every finding below was checked against source before being written down: this repo, and `codapv3` at `f3d41932d` (the commit `requirements.md` already pins as the source of the running v3.1.0 build). Four were settled with throwaway jest tests, run and then deleted; each says so and gives its result. Two items are recorded as checked-and-sound so nobody re-derives them.

One finding, I2, was contradicted by the running application after being verified against that commit. The general lesson has been moved into `requirements.md`'s Technical Notes so it survives this section: treat a source reading at `f3d41932d` as a hypothesis to check in the app rather than as a fact.

### Senior Engineer

#### RESOLVED: I1. The `caseByID` write shape in section 5 is wrong, and it fails silently

**Applied 2026-08-06.** Section 5 now spells the payload out as `{ values: { values: { color } } }`, cites the handler that requires it, and contrasts it in the same breath with the flat array the batched `.case` path takes, since that asymmetry is what invites the mistake.

Section 5 says the ordinary-feature write is `update ${resource}.caseByID[${feature.caseID}]` with `{ values: { color } }`, "following `toggleChosenFor()`". The function it cites does not use that shape. `toggleChosenFor()` sends `values: { values: { chosen } }` (`feature_store.ts:412-416`), and the nesting is required rather than stylistic: `case-by-id-handler.ts` calls `updateCaseBy(resources, values, resources.caseByID, { nestedValues: true, resourceName: "caseByID" })`, and `handler-functions.ts:85-88` returns `fieldRequiredResult("update", "caseByID", "values.values")` when the inner object is absent.

The failure is silent in both directions. CODAP returns `success: false` rather than throwing, and the plugin does not check the result of these writes anywhere. The plugin's own store would still hold the new colour, the pill and the picker would both look right, and the only casualty would be the dataset value, which is now a hidden column nobody looks at. That is requirement 3 broken with no symptom until something else in the document reads the attribute.

What makes the mistake likely rather than theoretical is that the batched fan-out in the same section is a different handler with a different shape: `update ….case` goes through `updateCasesBy` (`case-handler.ts:87-89`), which takes a flat array of `{ id, values }` with no nesting. So the section prescribes two writes, one nested and one flat, and describes them in the same breath.

Suggested resolution: write the payload out as `{ values: { values: { color } } }` in section 5, and note the asymmetry with the batched path in one clause so the reader does not normalise the two.

#### RESOLVED: I2. The update path named as `total frequency` write site 3 does land, and the source reading was wrong

**Refuted in the running app, 2026-08-06** (doc 1, CODAP v3.1.0 build 2985, StoryQ 2.20.0). Write site 3 is live; keep it as section 4 has it, and treat the reasoning below as a record of how the question arose rather than as fact.

What was run: doc 1 loaded fresh, the `single words` feature deleted so the Features table held only its two constructed features and needed no scrolling, then `Fair Trade Cafe`'s `rating` flipped from `positive` to `negative` (it is one of the texts containing "love"), then a feature added to trigger `updateNonNtigramFeaturesDataset()`.

| | Before | After | Expected |
|---|---|---|---|
| `count: "love"` | 49 / 12 | **0 / 0** | 48 / 13 |
| `contain: "good"` | 65 / 44 | 65 / 44 | 65 / 44 (that text has no "good") |
| `count: "delicious"` (new) | | 46 / 4 | correct, via the create path |

The values moved, so the write landed. It was an update rather than a delete-and-recreate: the CODAP case ids (`data-case-id` on the table rows) were identical before and after a second feature was added, `CASE272108357709510` and `CASE935969389010440` throughout. So `itemByID[<case id>]` resolves in the running build, whatever `resource-parser.ts` reads like at `f3d41932d`. Either the shipped build differs from that commit or the two id spaces coincide here; the running app is the authority and the source reading was not.

The `0 / 0` is a separate defect, recorded as I17 below.

<details>
<summary>Original finding, kept for the record</summary>

##### The update path named as `total frequency` write site 3 may never land, on any dataset

Section 4 lists `domain_store.ts:276-291` as one of the four write sites and tells the implementer to add `total frequency` beside the two hardcoded frequency names. That block writes to `itemByID[${iFeature.caseID}]`: an **item** resource addressed with a **case** id.

In CODAP v3 those are different id spaces. `resource-parser.ts:269-272` resolves `itemByID[n]` as `dataContext.getItem(toV3ItemId(n))`, which is `getItem("ITEM" + n)`, while `caseByID[n]` resolves `"CASE" + n` (`codap-utils.ts:32-36`). Ids are 15-digit random numbers (`v3Id()`, `codap-utils.ts:8-14`), so an item whose numeric id equals a case's numeric id essentially never exists, and the handler returns `caseNotFoundResult`.

Two things corroborate this rather than it resting on one reading. v3's `create case` handler returns `values: [{ id }]` and nothing else (`case-handler.ts:80-86`), so `domain_store.ts:267`'s `String(iValue.itemID)` stores the literal `"undefined"`; and `deleteFeature()` already works around exactly that, at `feature_store.ts:347` (`iFeature.featureItemID && iFeature.featureItemID !== "undefined"`), with a comment saying featureItemID is missing for saved documents.

This does not change what to build. `total frequency` should still be written there, for the reason R23 gives. What it changes is the story the spec tells around it. Requirement 5 and R23's decision table both rest on "for datasets whose labels are `positive` / `negative` the update path writes the two frequency columns perfectly well", and if the request never lands, the two columns are frozen after creation on **every** dataset, the label-name defect is not the only thing wrong with that block, and STORYQ-85 is a bigger ticket than it currently describes.

I could not settle this by clicking, so it is stated as a strong reading of both sources rather than as observed behaviour. The check is five minutes in doc 1: edit a training text so a count changes, add a feature to trigger the pass, and watch whether `frequency in positive` moves.

Suggested resolution: verify in the running app; then either add the finding to STORYQ-85 and note in section 4 that write site 3 is currently inert, or correct this item if the observed behaviour contradicts it.

</details>

#### RESOLVED: I3. Section 2 leaves a fork unresolved that the diff will have to settle anyway

**Applied 2026-08-06.** Section 2 now names `domain_store.ts:353` as the site, with the reason (`oneHot` has no `Feature` to read and `getNewToken` only accepts a colour), drops `one_hot.ts` from the graft and from the Files-touched table, and keeps a `kNoColor` fallback so requirement 31 holds by construction.

Section 2 says of the extraction-site colour: "keep whichever of the two you prefer, but not the unconditional constant", and the Files-touched table repeats the hedge ("unless the colour is set at `domain_store.ts:353` instead"). A reviewer cannot tell from the spec whether `one_hot.ts` belongs in the diff.

The two are not equally good. `oneHot`'s config carries no `Feature` (confirmed: `getNewToken` takes `initialValues.color ?? kNoColor`, `store_types_and_constants.ts:311-325`), so setting the colour there means threading one in or falling back to the constant, which is what requirement 27 rules out. `updateNgramFeatures()` has `iNtgramFeature` in scope at `:353` and needs no new channel.

Small addition while that line is being edited: the replacement should keep a `kNoColor` fallback (`iNtgramFeature.color !== kNoColor ? iNtgramFeature.color : ngramColor`). It should be unreachable, since `:317` runs the migration's repair first and `feature_pane.tsx` colours new ngram features at creation, but it is the same one-line shape as the code being replaced and it is what keeps requirement 31 true by construction rather than by argument.

Suggested resolution: pick `domain_store.ts:353`, drop `one_hot.ts` from the graft and from the Files-touched table, and keep the fallback.

---

### React/MobX Specialist

#### RESOLVED: I4. Section 5's mutation order is the one that only works inside an action; the reverse works either way

**Applied 2026-08-06.** Section 5 now prescribes tokens-then-`Feature` and carries the measured table, plus the clause that both mutations must land in one mobx action. The store methods are actions already; the order is chosen so that stays true if the loop ever moves.

Section 5 prescribes "mutate `feature`; if `feature.type === kFeatureTypeUnigram`, mutate every entry in `tokenMap` too; then write to CODAP". Verified with a throwaway jest test on 2026-08-06, run against the real `featureStore` and a `reaction` on `featureStore.highlights`:

| Order | Inside a mobx action | Reactions | Value the reaction saw |
|---|---|---|---|
| Feature, then tokens | yes | 1 | all three colours new |
| Feature, then tokens | no | 1 | new Feature colour, **stale token colours** |
| Tokens, then Feature | no | 1 | all colours new |
| Tokens only | yes | 0 | (trap 1, reconfirmed) |

The out-of-action Feature-first row is the interesting one: mobx flushes the reaction on the Feature write, before the token loop has run, so the text pane repaints with the old token colours and nothing repaints it again. mobx also logs its strict-mode warning there, which is the only outward sign.

As specified this is safe, because `setColorFor` and `setHighlightFor` are `FeatureStore` methods and `makeAutoObservable(this, {...}, { autoBind: true })` (`feature_store.ts:53-55`) makes them actions. The hazard is that trap 1's table in `requirements.md` documents the **opposite** order as the verified-safe one, so the two documents teach different orders, and the one the implementation spec teaches degrades silently the moment the loop moves into a component handler, a plain helper, or anywhere after an `await`.

Suggested resolution: reverse the order in section 5 to tokens-then-Feature, which is correct in both worlds, and add one clause saying both mutations must land in the same mobx action.

#### RESOLVED: I5. A `Feature` mutated through a raw object reference notifies nothing

**Applied 2026-08-06.** Added to the `setColorFor` bullet in the Tests section, with the reason it matters.

Not a defect in the plan, but it cost a wrong test result while checking I4 and it will cost the same in the tests section 5 asks for. `featureStore.features` is a deep observable, so only the proxy read back out of it notifies; the object literal that was passed into `setFeatures()` does not. `featureStore.ngramFeature` and anything a component receives are proxies, so production is fine.

Suggested resolution: one line in the Tests section, so the `setColorFor` regression test asserts through `featureStore.features[i]` rather than through the literal it constructed, and does not pass for the wrong reason.

---

### Migration and Backward Compatibility

#### RESOLVED: I6. Tab switches do not re-enter `guaranteeFeaturesDataset()`, so the guard's stated justification is wrong

**Applied 2026-08-06.** Section 3 now carries the correction and the test result, and names the three gestures that do re-enter the function. The same correction is applied in `requirements.md` under requirement 8 and in the Technical Notes bullet.

Section 3 argues for the `featuresDatasetMigrated` flag on the grounds that "every switch between the Features and Training tabs re-enters it", and requirement 8 and the Technical Notes say the same. That is not what the component tree does.

`TabPanel` renders the content of **every** `<Item>` and hides the unselected ones with a class (`tab-panel.tsx:57-69`, `tab-panel-tab-content.tsx:13-25`); `.ui-multiview-item-hidden` is `visibility: hidden` plus an offscreen offset (`light.compact.css:17420-17424`). Nothing unmounts. So the `useEffect(..., [])` in `feature_panel.tsx:13` and `training_panel.tsx:12` runs exactly once each, at first mount, and a tab switch only toggles a class.

Confirmed with a throwaway RTL test on 2026-08-06: two panels counting their own mounts, rendered through the real `TabPanel`, then `selectedIndex` changed three times. Mount counts after the initial render: 1 and 1. After three switches: 1 and 1.

The guard is still worth having; only the reason changes. The real repeat paths are `feature_pane.tsx:58` (every feature added, via the Done button), `feature_list_item.tsx:45` (re-checking the ngram box), and collapse or expand of the StoryQ panel, which is a genuine unmount because the whole tree hangs off `{uiStore.showStoryQPanel && …}` (`storyq.tsx:114`) and is exactly what STORYQ-77 and STORYQ-79 have people doing.

Suggested resolution: correct section 3's justification, and correct requirement 8 and the Technical Notes bullet in `requirements.md` to match. See I11 for the verification step that rests on the same wrong premise.

#### RESOLVED: I7. Both panel effects fire in the same commit, so a flag set at the end does not deliver "at most once"

**Applied 2026-08-06.** Section 3 now holds an in-flight promise with a `catch` that clears it, replacing the boolean set at the end.

Following from I6: both `FeaturePanel` and `TrainingPanel` mount on the initial render, and each fires `domainStore.updateNonNtigramFeaturesDataset()` without awaiting it. Each call awaits inside `guaranteeFeaturesDataset()`, so the second entrant reaches `if (this.featuresDatasetMigrated) return` while the first is still in flight, passes it, and runs a duplicate pass including the 682-case backfill.

In practice the window is narrow, because on a restored document the flag is usually already set by the `fromJSON()` call at `domain_store.ts:55` before either effect can matter. But section 3 states the guarantee as "the whole function runs at most once per document open", and a boolean set after three awaited round trips does not provide it.

Suggested resolution: hold the in-flight promise rather than a boolean, which costs one line and makes the guarantee true rather than likely:

```ts
private migration?: Promise<void>;

private migrateExistingFeaturesDataset() {
  this.migration ??= this.runFeaturesDatasetMigration();
  return this.migration;
}
```

Retry-on-failure then means clearing `this.migration` in a `catch`, which is the same intent as the current "set the flag last".

#### RESOLVED: I8. The flag is per plugin instance, and `fromJSON()` can run more than once

**Applied 2026-08-06.** Section 3 now asks for `this.migration = undefined` at the top of `fromJSON()`, framed as closing an assumption rather than a known defect.

Section 3 justifies not persisting the flag with "a reopened document is a new session that genuinely needs the pass again". That holds if a document open always means a fresh plugin instance. `storyq.tsx:61` registers `restorePluginFromStore` against `update interactiveState`, and that handler calls `domainStore.fromJSON()`, so the plugin is built to accept restored state into an already-running instance.

I did not establish a concrete sequence in which CODAP pushes a second, different document's state into a live plugin, so this is a stated assumption rather than a confirmed defect. It is worth closing anyway because closing it is free: clear the flag (or the promise from I7) at the top of `fromJSON()`. "Once per restore" then holds by construction and the assumption never has to be right.

#### RESOLVED: I9. The migration also runs on brand-new documents, on the first feature added

**Applied 2026-08-06.** Taken by setting the guard in the creation branch rather than by renaming, which avoids the fresh-document pass entirely and leaves every existing reference to the function name alone.

`feature_pane.tsx:58-59` awaits `updateNonNtigramFeaturesDataset()` and then `updateNgramFeatures()`. The first creates the Features dataset, so `featureDatasetID !== -1` by the time the second calls `guaranteeFeaturesDataset()`, which therefore takes the new `else` branch. A fresh document runs the full migration against a dataset created a moment earlier, in the same click: two hides of attributes already created hidden, a `total frequency` create for an attribute already declared in `attrs`, and a backfill over the cases just written.

All of it is harmless, and the arithmetic is right in both directions, so this is not a correctness finding. It matters for two smaller reasons. It is the path most manual testing will take, so "the migration ran" will not distinguish an old document from a new one. And the name `migrateExistingFeaturesDataset()` plus section 3's framing will read as dead code to the next person, who will be wrong.

Suggested resolution: either set the flag in the creation branch, or rename to something like `bringFeaturesDatasetUpToDate()` and say in one clause that it is entered by new documents too.

---

### QA Engineer

#### RESOLVED: I10. `highlight` has the identical re-extraction hole that requirement 27 closes for `color`, and nothing closes it

**Applied 2026-08-06**, fixing it alongside colour rather than recording it as a limitation. Requirement 27 now covers both values and says why this does not contradict requirement 22's decision to leave per-token `highlight` alone on restore: restore preserves individual choices a student made word by word, re-extraction destroys the token set so there are none left to preserve. Trap 3 updated to name both hardcoded values. Section 2 adds `iFeature.highlight = iNtgramFeature.highlight` beside the colour line and replaces the hardcoded `highlight: true` at `domain_store.ts:358` and `notification_manager.ts:103`, and the Tests section extends the requirement-27 regression test to assert it.

Risk assessed before applying: two lines, in the two places the colour fix already edits, no new files and no new code path; `one_hot.ts` still untouched per I3; a token carrying `highlight: false` is already a reachable, exercised state, since the Features table's checkbox produces it today and `handleUpdateFeatureCase:91` already copies it onto the token; and every change is a no-op until commit 7 ships, because `ngramFeature.highlight` is `true` in every document that exists now. It amends a resolved requirement but touches nobody's decision: requirement 25 is Jie's call that the eye on that row hides all 682 words at once, and this is what makes that stick.

Requirement 27 exists because a recoloured single-words set came back yellow after unchecking and re-checking the feature in the Training tab. The same gesture loses a hidden set, and the spec fixes neither site for `highlight`:

- `getNewToken()` hardcodes `highlight: true` (`store_types_and_constants.ts:317`), so re-extraction produces visible tokens whatever the previous state was.
- `updateNgramFeatures()` writes `highlight: true` into every unigram case it creates (`domain_store.ts:358`).
- `handleUpdateFeatureCase()` hardcodes `highlight: true` on a re-created token (`notification_manager.ts:103`), which is trap 3's site.

So a student hides highlighting for 682 words with requirement 25's control, unchecks and re-checks the feature on another tab, and every word comes back highlighted while the row's eye icon still says hidden. That is the same disagreement between the row and the words that requirement 27 was written to prevent, reached by the same route, and it is arguably more visible than the colour version because the text pane fills with highlighting rather than changing hue.

The fix is the same shape and the same three files. `getNewToken` spreads `...initialValues` last, so it already accepts an override.

This is a requirements gap as much as an implementation one, so closing it means amending requirement 27 (or adding a sibling) as well as sections 2 and 5.

Suggested resolution: extend requirement 27 and section 2 to cover `highlight` alongside `color` at both token-creation sites, sourcing both from the ngram `Feature`.

#### RESOLVED: I11. The verification step for requirement 8 cannot fail

**Applied 2026-08-06.** The Verification table row in `requirements.md` now asks for three feature additions and a collapse/expand, and says plainly why tab switching does not test this.

The Verification table in `requirements.md` says: "For requirement 8's once-per-open guard, switch between the Features and Training tabs several times with the network panel open: the migration's requests must appear on the first pass only." Per I6 the panels never remount, so that observation is true with the guard, without the guard, and with the guard implemented backwards.

Suggested resolution: replace it with a gesture that genuinely re-enters the function. Adding a feature three times exercises `feature_pane.tsx:58`; collapsing and re-expanding the StoryQ panel exercises the remount path. Both should show the migration's requests once.

#### RESOLVED: I12. Six requirements appear in no row of the commit table

**Applied 2026-08-06.** Requirements 15 to 17 and 19 added to commit 7's row, requirement 3 to commit 5's, and requirement 39 noted below the table as satisfied by requirement 15 closing the palette.

The "Shape of the work" table is what a reviewer will check the PR against. Requirements 3, 15, 16, 17, 19 and 39 are in none of its rows.

Four of them are real work that the spec does describe: 15 (the palette is exactly the six colours), 16 (swatch and popover geometry), 17 (the conditional seventh swatch) and 19 (arrow-key movement) are all built in section 7b, and commit 7's row jumps from 14 to 18 to 24. Requirement 3 is delivered by commit 5 and requirement 39 is a standing guarantee with no code behind it; both are worth saying rather than leaving to inference.

Suggested resolution: add 15 to 17 and 19 to commit 7's row, add 3 to commit 5's, and note 39 as satisfied by construction.

---

### Performance Engineer

#### RESOLVED: I13. Section 4 calls `guaranteeAttribute()`'s guard "free"; it is a round trip, and section 3 argues the opposite case

**Applied 2026-08-06.** "Free" replaced with the round trip it actually costs, the contradiction with section 3 named, and the `.catch()`-then-read-`success` hazard recorded.

Section 4: "The guard is optional (a repeat create is a no-op that returns the existing attribute) but free, and it keeps the intent readable." `guaranteeAttribute()` issues `get …attributeList` and only then decides whether to create (`codap-helper.ts:156-174`). That is precisely the trade section 3 and requirement 8 refuse for the hides, on the stated grounds that a round trip to guard the cheapest step is not worth it. The two sections reach opposite conclusions about the same trade two pages apart.

Either conclusion is defensible; only the word "free" is wrong. Worth knowing before adopting the helper in a migration path: it reads `tNamesResult.success` after a `.catch()` that returns `undefined`, so a rejected request throws a `TypeError` out of the migration rather than logging and continuing.

Suggested resolution: keep `guaranteeAttribute()` for readability if you prefer, and change "free" to name the cost; or drop it for a bare `create`, which requirement 8 has already established is safe.

#### RESOLVED: I14. The fan-out re-derives case ids the store already holds, at 109 ms a click

**Applied 2026-08-06.** Kept the `caseFormulaSearch`, and section 5 now records why: `featureCaseID` is `null` on a freshly created token, so the search is the one source correct in every state. Recorded so it does not read as an oversight.

Section 5 has both fan-outs do `caseFormulaSearch[type='unigram']` (109 ms measured) before the batched write (242 ms). The spec establishes elsewhere that this lookup is avoidable: requirement 6 tells the backfill to address cases "by the `featureCaseID` already in the restored `tokenMap`", and the probe confirmed case ids survive save and reload. So the ids are in hand at every click, and section 5 fetches them again.

About 30 percent off every colour and visibility click on the single-words row, which is the interaction most likely to feel slow. Low priority: the click is already sub-second, and the search is more robust, since `featureCaseID` starts as `null` on a freshly created token (`store_types_and_constants.ts:316`).

Suggested resolution: use the `tokenMap` ids when every token has one and fall back to the search otherwise, or record explicitly that the search is kept for robustness so the next reader does not think it was overlooked.

---

### WCAG Accessibility Expert

#### RESOLVED: I15. The border-swap focus indicator does shift layout, because nothing sets `box-sizing` here

**Applied 2026-08-06.** Section 7a now opens the restructure with `box-sizing: border-box` on the wrapper, both buttons and the pill, and the focus-indicator claim is qualified to depend on it.

Section 7a: "The focus indicator is a **border swap**, not an added outline, so the box stays 28x28 with no layout shift (requirement 36)." That holds under `box-sizing: border-box` and not otherwise, and this plugin has no global reset. `box-sizing` appears only in `collapse-button.scss`, `text-section.scss`, `text-pane.scss` and `pane-divider.scss` (plus vendor CSS in `src/styles/`); `feature_list_item.scss` sets none, so these buttons will inherit the CSS default of `content-box`.

Under `content-box` the 1 px to 2 px swap grows each button by 2 px in each dimension and nudges the row on focus, which is the layout shift requirement 36 chose the border swap to avoid. The correction proposed under R13 in `requirements.md` reasoned about the swatch case correctly and did not reach this one.

Suggested resolution: state `box-sizing: border-box` on the two buttons in section 7a, as part of the state table rather than as an aside.

#### RESOLVED: I16. The same default breaks section 7a's width arithmetic for the wrapper and pill

**Applied 2026-08-06.** Folded into I15: the same one-line fix covers the focus swap and the width arithmetic.

The Zeplin geometry in section 7a is exact; I checked every number against the dump (see D1 below). 28 + 5 + 28 + 5 + 334 = 400, so the drawn row closes.

The current CSS does not. `.feature-list-item` is `width: 400px` with `padding: 4px` and a 1 px border and no `box-sizing`, so it renders 410 px today. Section 7a's plan gives the 400 px to a new wrapper and makes the pill "the remainder"; with `content-box` the pill's padding and border are added outside whatever remainder is computed, and the row overflows its wrapper by the same 10 px, whether the remainder is a fixed 334 px or `flex: 1`.

Suggested resolution: fold this into I15. One `box-sizing: border-box` covering the wrapper, the two buttons and the pill makes both the focus swap and the arithmetic behave as drawn.

---

### Found while verifying I2

#### RESOLVED: I17. Restored `count` features lose their search formula, so they stop counting and stop highlighting

**Pulled into the story, 2026-08-06** (Doug's call). Added as requirement 40 and as commit 9, `fix: Re-derive the target case formula when restoring features`, with section 9 giving the one-line repair in `featureStore.fromJSON()` and the Tests section asking for the isolation test to be promoted rather than rewritten. Requirement 40 is appended rather than inserted so the other 39 keep their numbers, and commit 9 is numbered last but flagged to land first, since until it does, doc 1 cannot verify commit 4's `total frequency` or commit 7's visibility toggle honestly.

The isolation follows.

Isolated 2026-08-06, mechanism confirmed end to end. Pre-existing, not introduced by this story, but it lands directly on the control this story adds.

**The chain, all six links verified.**

1. `Feature.targetCaseFormula` is a **function** (`store_types_and_constants.ts:219`), assigned once at feature creation from `getTargetCaseFormula(where)` (`target_store.ts:378`).
2. Count features get their own, which builds `<attr>>0` (`store_types_and_constants.ts:169`). Every other where-option, `contain` / `not contain` / `start with` / `end with`, gets `defaultTargetCaseFormula`, which builds `<attr>=true` (`:163-171`).
3. `Storyq.getPluginStore()` serialises with `JSON.parse(JSON.stringify(...))`, and its comment says why: "to remove functions. When present, these cause attempts to transfer the stores to CODAP to fail" (`storyq.tsx:71-77`). So `targetCaseFormula` is stripped from every saved feature, deliberately. `featureStore.fromJSON()` never re-derives it (`feature_store.ts:100-108`).
4. `updateFrequenciesUsagesAndFeatureIDs()` falls back: `iFeature.targetCaseFormula ?? defaultTargetCaseFormula` (`domain_store.ts:181`). A restored count feature therefore searches `` `count: "love"`=true `` against an attribute holding `0`, `1`, `3`.
5. Nothing matches, so `numberInPositive` and `numberInNegative` stay at 0, `usages` stays empty, and the feature is never pushed into any target case's `featureIDs` (`:190-196`), which is then written back over the target dataset at `:294-307`.
6. `text_feedback_manager.ts:260-271` builds each text's highlight list from that `featureIDs` value. A feature missing from it cannot highlight.

Links 1 to 4 were pinned with a throwaway jest test: round-tripping features through the exact `JSON.parse(JSON.stringify(...))` of step 3 leaves `targetCaseFormula` undefined on both a `count` and a `contain` feature, and of the five where-options exactly one, `count`, resolves to a different formula afterwards (`X>0` before, `X=true` after). The others were already the default, which is why `contain: "good"` is unharmed.

**Confirmed in the running app**, doc 1, with a control:

| Feature | Origin | Frequencies | Highlights a text containing its word |
|---|---|---|---|
| `count: "love"` | restored | **0 / 0** | **no**, on "(5) Love ice cream, love marshmallows, love graham crackers…", with its `highlight` flag turned back **on** first |
| `count: "friendly"` | created this session | 38 / 11 | yes, `friendly` renders on `#dbb6fb` |
| `contain: "good"` | restored | 65 / 44 | unaffected, its formula was the default anyway |

The control matters: the text pane highlights perfectly well in the same document, in the same session, for the count feature that still has its function. Only the restored one is silent.

**Why this belongs in this spec and not only in a ticket.** Two of this story's requirements land on it.

- Requirement 4 says `total frequency` equals the sum of the two columns beside it. Here all three are written from the same zeroed counters, so they agree with each other and are all wrong: a feature that matches dozens of texts, in a table saying it occurs zero times, with a total confirming it.
- Requirement 12 says toggling visibility on restores that feature's highlighting. For a restored count feature it does not, because the highlighting was never wired up. A student opens last week's document, presses the new eye button, and nothing happens. That is this story's headline control appearing broken, for a defect it did not cause, on the most common feature type: `count` is the first entry in the method dropdown since Zeplin item 2 shipped in 2.20.0.

Note the loss is also partial in a way that will confuse anyone reproducing it. `:294-307` only rewrites `featureIDs` for target cases that have at least one surviving feature, so texts matching **only** the broken count feature keep their stale ids and go on highlighting, while texts that also match some other feature lose it. The same document highlights inconsistently from text to text.

**Fix**, for whoever takes it: re-derive the formula on restore rather than trying to serialise it. In `featureStore.fromJSON()`, or lazily in a getter, `feature.targetCaseFormula = getTargetCaseFormula((feature.info.details as SearchDetails).where)`. The `where` value does survive the round trip, so nothing else has to change and the deliberate function-stripping in `getPluginStore()` stays as it is.

**Open for Doug**: file it and build requirement 12 knowing it will look broken on restored count features until the ticket lands, or pull the one-line repair into this story. My recommendation is to pull it in: it is one line in `fromJSON()` next to code commit 3 already touches, it is what makes requirement 12 true on the documents requirement 2 exists to serve, and the alternative is shipping a new button that does nothing on the first document a teacher opens.

---

### Checked and sound, no change proposed

Recorded so they are not re-derived.

- **The Zeplin coordinates in section 7a are exact.** Against the dump at `/home/doug/docs/zeplin-specs/storyq-updates-6938b582.md`, every 4A feature row (lines 419 to 493) reads Visibility Button at x=48, Color Button at x=81, Feature back 334x28 at x=114 with a 1 px `#177991` border at r=3, Close Icon 24x24 at x=422, all 28 px tall. The 5 px gaps and the "colour and border belong to the pill" reading both follow from the coordinates rather than from interpretation.
- **The hidden tab panels do not leave the new buttons focusable.** I expected a 4.1.2 failure here, since `TabPanel` keeps every panel mounted and marks the inactive ones `aria-hidden="true"` (`tab-panel-tab-content.tsx:25`), and focusable content inside `aria-hidden` is a documented failure. It does not arise: `.ui-multiview-item-hidden` is `visibility: hidden` (`light.compact.css:17420-17424`), which removes the subtree from the tab order. The Features tab's new controls are unreachable while the Training tab is showing, as they should be.
- **The backfill's attribute discovery is sound.** Section 4 reads the frequency attribute names off `cases[0].values` by the `frequency in ` prefix. v3 builds those values by iterating every attribute of the collection and assigning a key for each, including empty ones (`data-interactive-utils.ts:23-37`), so the key set is the collection's full attribute list rather than "attributes that happen to have a value in the first case". Both `kPosNegConstants.positive.attrKey` and `.negative.attrKey` are the same literal `'frequency in '` (`store_types_and_constants.ts:14,18`), and `total frequency` does not match the prefix, so one `startsWith` finds exactly the two intended attributes whatever the class labels are.

---

## Self-Review, second pass

Run 2026-08-06 against the implementation plan as amended by I1 to I17, per Phase 3 Step 2's instruction to re-review after processing. Roles: Senior Engineer, React/MobX Specialist, Migration and Backward Compatibility, Performance Engineer, QA Engineer, WCAG Accessibility Expert, Design Fidelity, plus two added for this pass, CODAP Plugin API Specialist and TypeScript/Build Integrity.

Six findings, plus a seventh (I24) surfaced while auditing the pass for handoff. Every one was checked against source before being written down, and six were pinned with throwaway jest tests: nineteen assertions in this repo and three more in `codapv3` at `f3d41932d`, all run and then deleted. Each says which. Two roles produced nothing new and say so at the end.

I24 was confirmed by test and then pulled into the story as requirement 42 and commit 10, which is the second time this review has grown the story by finding a way `count` features stop highlighting. Requirement 40 fixes the restore route; requirement 42 fixes the post-training one.

**One finding, I18, was refuted by its own follow-up test** after being written up as the most serious of the six. Its resolution keeps the change it proposed, on weaker and more honest grounds, and records the lesson: the ordering it declined to chase was testable in minutes at the pinned commit.

### Migration and Backward Compatibility

#### RESOLVED: I18. The prescribed step order is safe in both directions, and the plugin should not have to know that

**Refuted by test, 2026-08-06, and the reordering kept anyway.** The race described below cannot fire at `f3d41932d`. CODAP broadcasts the `updateCases` notification **synchronously, before it replies to the request that caused it**, so the plugin always processes the echo before its own `await` resolves, and the backfill's echo therefore lands while the tokens still hold the colours it is carrying. That is a no-op, and the repair happens strictly afterwards.

Section 6 still prescribes **hide, repair, backfill**, now on the honest grounds: it costs nothing, and it removes a dependency on an ordering CODAP has never promised the plugin and could change without anyone here noticing. Section 6's prose was rewritten to say that rather than to assert a defect, its opening line and the Files-touched row follow the new order, and two stale references to the `featuresDatasetMigrated` boolean that I7 replaced were corrected to the in-flight promise while I was in there.

**How it was settled.** The chain is six synchronous hops with no `await`, no queue and no timer anywhere in it, all at `f3d41932d`:

1. `updateCasesBy()` calls `dataContext.applyModelChange(fn, { notify })` (`handler-functions.ts:100-137`).
2. `applyModelChange()` runs the action and then calls `handleApplyModelChange(options)` (`apply-model-change.ts:9-15`).
3. `handleApplyModelChange()` evaluates `notify()` and calls `tileEnv.notify(...)` in a plain loop (`app-history-service.ts:21-58`).
4. `fullEnvironment.notify` is `document.content.broadcastMessage(...)` (`create-document-model.ts:73-75`).
5. `broadcastMessage()` forwards to each tile's own (`document-content.ts:134-155`), and the web view's calls `dataInteractiveController.call(message, callback)` (`web-view-model.ts:139`).
6. iframe-phone's `post()` calls `targetWindow.postMessage()` immediately, queueing only before the handshake completes (`parent-endpoint.js:65,71`).

Only after `processAction()` returns does the request processor call `respond(callback, result)`, which posts the reply (`data-interactive-request-processor.ts`). Two messages posted from the same window to the same target are delivered in order, so the notification arrives first.

Reading it was not enough, given this spec's own note that a source reading at that commit is a hypothesis. It was tested: a git worktree at `f3d41932d` with that commit's own dependencies installed, and a throwaway test against the real `diCaseHandler` and a real `DataSet`, capturing broadcasts through `AppHistoryService.setDependencies({ notify })`. Three assertions, all passing:

| Assertion | Result |
|---|---|
| The notification fires before `diCaseHandler.update()` returns | ordering was `["notify:updateCases", "handler-returned"]` |
| The processor's own shape, `await` the handler then respond | ordering was `["notify:updateCases", "respond"]` |
| One batched update over N cases produces one notification naming all N | 1 message, `operation: "updateCases"`, N cases |

The per-case `values` payload could not be checked in a bare harness, since it needs the notification adapter that only the full app registers. That half was already established empirically on doc 1 by the probe recorded in `requirements.md`, so it is not in doubt.

<details>
<summary>Original finding, kept for the record</summary>

##### The prescribed migration step order lets the backfill's echo silently undo the requirement 22 colour repair

Section 6 ends with "Keep the three migration steps in the order hide, backfill, repair". That order is the one order of the three that is unsafe, and the failure it opens is silent, permanent, and lands on exactly the documents requirement 22 exists to serve.

The backfill is one batched `update ….case` across 682 cases. The probe recorded in `requirements.md` establishes that this comes back as **one** `updateCases` notification carrying **every case with full values**, which is the fact the idempotence argument rests on. At the moment the backfill is issued, the `color` value in each of those 682 cases is still the pre-change cycled colour, so that is what the echo carries.

The repair that follows is `featureStore.setColorFor(ngram, ngramColor)`. Per section 5 it mutates every entry in `tokenMap` and then the `Feature`, both synchronously, and only then does the `caseFormulaSearch` (109 ms measured) and the batched write (242 ms measured). So there is a window of roughly 350 ms during which the plugin's tokens are yellow and the dataset's cases are not.

`handleUpdateFeatureCase()` assigns `tToken.color = String(iCase.values.color)` for every unigram case it is handed (`notification_manager.ts:88-93`). If the backfill's echo is delivered inside that window, all 682 tokens revert to their cycled colours while the `Feature` stays yellow.

Nothing catches it afterwards:

- The revert is a token-only mutation, so by implementation trap 1 it fires no reaction and the text pane keeps painting the yellow it already rendered. The store and the screen disagree until something unrelated nudges mobx.
- The migration is guarded to run at most once per open (section 3), so it will not have another go.
- `asJSON()` serialises `tokenMap` verbatim, so the reverted colours are what gets saved. The next open finds the ngram `Feature` already yellow, requirement 22's gate is `kNoColor` only, and the repair is skipped for good.

Verified with a throwaway jest test on 2026-08-06, over the real `FeatureStore` with a `reaction` on `featureStore.highlights`: after the repair the token reads `#ffe671`; after replaying `notification_manager.ts:88-93` with the pre-repair case value it reads `#45f1eb` while the `Feature` still reads `#ffe671`, and the reaction count stays at 1. The same test re-confirmed trap 1 and section 5's mutation-order table, both unchanged.

I did not settle whether CODAP delivers the `updateCases` notification before or after it replies to the request that caused it, and I do not think it is worth chasing. `CodapInterface`'s incoming handler dispatches notifications synchronously (`CodapInterface.ts:163-190`) but the ordering between that message and the request's reply is CODAP's to choose, and the Technical Notes already say to treat a source reading at `f3d41932d` as a hypothesis rather than a fact. The point is that the plan currently depends on that ordering and does not say so.

**Suggested resolution**: reorder the three steps to **hide, repair, backfill**. Then the backfill is issued after the repair has written yellow to the dataset, so its echo carries the repaired colour and is idempotent whenever it lands. The two steps are independent (one writes `color`, the other writes `total frequency`, and neither reads the other's output), so this costs nothing and removes the ordering dependency rather than documenting it. Section 6's framing, "make the dataset current, then make the store current", is the sentence that has to change with it.

</details>

**Lesson worth keeping.** "I could not settle this" was not the same as "this cannot be settled". The paragraph above talked itself out of chasing the ordering on the grounds that a source reading at `f3d41932d` is only a hypothesis, which is true, and then stopped, which did not follow. The commit is checked out locally, its dependencies install in seconds, and the handler runs under jest without the app around it, so the hypothesis was testable all along and the test took less time than the hedging did. The mirror image of I2, where the running app refuted a confident source reading: here a test refuted a confident source-derived worry. Both point the same way, that the answer is usually one experiment away.

---

### Senior Engineer

#### RESOLVED: I19. The migration puts three new rejection paths in front of work that today cannot fail, and nothing handles them

**Applied 2026-08-06.** Section 3's guard now logs and swallows instead of rethrowing, and carries the reasoning: the three steps are cosmetic and the work behind the await is not, so a failure costs the repairs rather than the document. It still clears `this.migration`, so a transient failure retries on the next entry. Section 4's hazard note now names `getCaseValues()` alongside `guaranteeAttribute()`.

Today `guaranteeFeaturesDataset()` does **no I/O at all** on the restored-document path: `hasFeatures` is true, `featureDatasetID !== -1`, so the creation block is skipped and the function returns `true` (`domain_store.ts:76-128`). It cannot reject. After this story it awaits two attribute updates, an attribute create, a 682-case read and a 682-case write, and `codapInterface.sendRequest` genuinely rejects, on timeout (`CodapInterface.ts:345`) and on a closed connection (`:364`).

Section 3's `.catch` rethrows so the next call retries, which is right and which I confirmed works (throwaway test: two concurrent entrants run the body once; a rejection clears the guard and the next call re-runs it; a boolean set after the awaits runs it twice, which is I7 reconfirmed). The problem is downstream of the rethrow. Neither caller handles it:

- `storyq.tsx:94` calls `domainStore.fromJSON(iStorage.domainStore)` **without `await` and without `.catch`**, even though it is an `async` method whose body awaits `guaranteeFeaturesDataset()`. A rejection there is an unhandled promise rejection and nothing else.
- `feature_panel.tsx:13` and `training_panel.tsx:12` call `updateNonNtigramFeaturesDataset()` un-awaited. That method's entire body is inside `if (await this.guaranteeFeaturesDataset())` (`domain_store.ts:202`), so a rejection skips the frequency recount, the feature-case creation and the target-dataset `featureIDs` write, silently. A student would see a Features tab with rows and a Features table with no cases for them.

One helper the plan reaches for makes this likelier rather than rarer. I13 recorded that `guaranteeAttribute()` reads `tNamesResult.success` after a `.catch()` that returns `undefined`, so a rejected request throws a `TypeError` rather than logging and continuing. **`getCaseValues()` has exactly the same shape** (`codap-helper.ts:196-212`), and section 4's backfill is built on it. I13 flagged one of the two.

**Suggested resolution**: decide what a failed migration should do and say so in section 3. The cheapest answer that keeps the document usable is for `runFeaturesDatasetMigration()` to catch, log, and leave `this.migration` cleared, so `guaranteeFeaturesDataset()` still resolves `true` and the work behind it still runs. That trades "retry visibly" for "never take the document down", which seems the right way round for three cosmetic repairs. Whichever way it goes, add the second `.catch()`-then-read-`success` site to I13's note so it is not rediscovered.

---

### TypeScript and Build Integrity

#### RESOLVED: I20. Grafting `color-utils.ts` from `f7d9b5b` aliases `featureColors[0]` to `ngramColor`, which turns requirement 21's stated remedy into a no-op

**Applied 2026-08-06.** Section 2 now says explicitly that the graft must de-alias `featureColors[0]` back to the literal, gives both consequences, and says the two constants are deliberately independent. The file section 2 displays was already correct; only the instruction to graft it was not.

Section 2 says "Graft `color-utils.ts` and `feature_pane.tsx` from it", and then displays the file it expects to end up with:

```ts
export const featureColors = ["#ffe671", "#dbb6fb", …];
export const ngramColor = "#ffe671";
```

That is not what the commit contains. `f7d9b5b` writes:

```ts
export const ngramColor = "#ffe671";
const featureColors = [ngramColor, "#dbb6fb", …];
```

The two are not interchangeable, and the difference is the thing requirement 21 turns on. Requirement 21 records the `featureColors[0]` collision as a known consequence, leaves it for Jie to judge in the running build, and closes with "Keeping `ngramColor` as a single constant is what makes the fix a one-line edit if she wants one". Under the grafted file that one-line edit does nothing: changing `ngramColor` moves `featureColors[0]` with it and the two are still identical. Verified with a throwaway test on 2026-08-06, modelling both file shapes and applying the same one-line change to each.

The second consequence is quieter. Requirement 15 fixes the palette as six named hex values and requirement 39 guarantees all six clear WCAG AA against `#222222`. Under the alias, editing `ngramColor` silently edits a palette colour, so a change made for the ngram set can move a value two other requirements assert.

**Suggested resolution**: one clause in section 2 saying the graft must de-alias `featureColors[0]` back to the literal, and that `ngramColor` and the palette are deliberately independent constants that happen to hold the same value today. The file section 2 already displays is correct; only the instruction to graft it contradicts it.

---

### React and MobX

#### RESOLVED: I21. There are two sites that emit `feature.color` as an inline style and section 8 guards only one of them

**Applied 2026-08-06.** The row's guard goes into commit 7 rather than commit 8, folded into the same expression that makes the pill's fill conditional on `feature.highlight`, since that line is being rewritten regardless. Section 8 now says so, and section 7a carries the restore-window reasoning. Requirement 31 is left as the design intent it is; the timing gap is recorded in section 7a rather than turned into a requirement.

Section 8 fixes `utilities.ts:19-23`, which is the text pane's highlight style. The feature row has its own, at `feature_list_item.tsx:29`:

```ts
const style = { backgroundColor: feature.color };
```

with no guard at all, not even the string-truthiness one that section 8 is replacing. It is applied to `.feature-list-item` at `:37`. Requirement 32 asks for the explicit `kNoColor` test so "an invalid inline `backgroundColor` can never be emitted", and after this story the row is still emitting one.

Requirement 31 is what is supposed to make that unreachable, and on the restore path it is only eventually true. `restorePluginFromStore` sets the features synchronously and then does **not await** `domainStore.fromJSON()` (`storyq.tsx:91-97`), so the tab renders while the migration is in flight. Using the spec's own measured figures the window is roughly 700 ms: 40 ms and 143 ms for the two hides, 178 ms for the backfill, then 109 ms plus 242 ms for the repair's search and write. For that whole window a pre-change document renders its ngram row with `backgroundColor: "NO_COLOR"`.

This is not a regression, since the row renders transparent today and will render transparent then. It is the spec asserting a guarantee it does not deliver, in the one line commit 7 is already rewriting for requirement 11's white-pill logic.

**Corrected by [L1](#resolved-l1-a-knocolor-row-renders-white-not-transparent-and-after-this-story-white-means-highlighting-is-off), 2026-08-06.** It renders **white**, not transparent, because `.feature-list-item` carries `background-color: white` and the invalid inline declaration is simply dropped. That makes this finding's own reassurance wrong in the direction that matters: after requirement 11 ships, white is the highlighting-off signal, so the transient render is a false claim about state rather than a null change. The resolution below still stands and is what L1 builds on.

**Suggested resolution**: fold the guard into commit 7 rather than commit 8. The pill's fill is becoming conditional on `feature.highlight` anyway, so the `kNoColor` test costs nothing next to it, and requirement 31 can then be stated as a design intent rather than a timing claim.

---

### WCAG Accessibility

#### RESOLVED: I22. The picker's swatches have no accessible name, no role, and no accessible selection state

**Applied 2026-08-06.** Added to `requirements.md` as requirement 41, appended so the other 40 keep their numbers, and to section 7b as a block covering the group role, the per-swatch name and the selected state, plus the colour button's own name. Requirement 41 added to commit 7's row and the picker's test bullet extended with the four `getByRole` assertions that pin it. The names live on `featureColors` rather than in a parallel array, so a palette edit cannot leave a colour and its name out of step.

Both specs are thorough about the picker's geometry, its arrow-key movement, its focus ring and its focus return, and say nothing at all about what a swatch *is* or what it *announces*. Grepping both files, `aria-` appears only for the two row buttons (requirement 35, section 7a) and in quoted CODAP markup.

As specified, a screen reader user activating the colour button lands on one of six or seven `<button>` elements that have no text content, no `aria-label`, no group, and no expressed selected state. Requirement 16 defines "selected" as a 2 px `#006c8e` border plus a black check mark, which are both purely visual, and requirement 39's own principle, that colour must not be the only channel carrying meaning, is stated for the eye icons and not for the swatches, where it bites harder: the swatches differ from each other **only** by colour.

Three things are missing and all three are cheap:

- A name per swatch. Six colour names, plus something for requirement 17's conditional seventh, which is an arbitrary stored hex and has no name to give ("Current colour" is honest and sufficient).
- A role for the container and the swatches, so the set announces as one control rather than seven buttons. `role="listbox"` with `role="option"` and `aria-selected`, or `radiogroup` with `radio` and `aria-checked`; the roving tabindex section 7b already specifies is the right keyboard model for either.
- A name for the container itself, so it is clear which feature is being recoloured. The colour button's own name should carry the feature too, which section 7a specifies for the visibility toggle and leaves unstated for the colour button.

This is squarely inside the scope constraint: it is all new markup in a new file, not a change to existing UI.

**Suggested resolution**: add a requirement alongside 34 to 37 covering the picker's name, role and selection state, and a short block in section 7b saying which roles and attributes to use. Worth deciding at the same time whether the colour button's accessible name names the feature, since requirement 34 requires that of "both new controls" and section 7a only shows it for one.

---

### QA Engineer

#### RESOLVED: I23. Section 2's new `highlight` write is uncoerced where the sibling write coerces, and the field is optional

**Applied 2026-08-06.** Section 2 now prescribes `highlight: !!iFeature.highlight` at `domain_store.ts:358`, matching `:241`, with the reason: uncoerced, an `undefined` writes no key at all rather than `false`, and reads back as hidden.

`FeatureOrToken.highlight` is `highlight?: boolean` (`store_types_and_constants.ts:190`). The existing feature-case write coerces it, `highlight: !!iFeature.highlight` (`domain_store.ts:241`). Section 2 prescribes the unigram-case write as `highlight: iFeature.highlight`, uncoerced.

When the value is `undefined`, the two are not merely different, they are different in kind. Verified with a throwaway test: `JSON.stringify({ highlight: undefined })` is `"{}"`, so the key does not reach CODAP at all and the case is created with no `highlight` value rather than with `false`. Case values come back as strings and `handleUpdateFeatureCase()` reads `iCase.values.highlight === "true"` (`notification_manager.ts:80`), so a missing value reads as hidden, which is the opposite of the `true` the line replaces.

`addFeatureUnderConstruction()` sets `highlight = true` (`feature_store.ts:306`), so this is not reachable today. It is worth the two characters anyway, because section 2 itself already anticipates the undefined case one paragraph later, where the notification handler is given `featureStore.ngramFeature?.highlight ?? true`. The two sites should not disagree about whether the field can be missing.

**Suggested resolution**: write `highlight: !!iFeature.highlight` at `domain_store.ts:358`, matching `:241`.

---

### Performance Engineer, and Design Fidelity

Neither role produced a new finding.

Performance: the only cost this pass would add is I18's reordering, which moves two requests relative to each other and changes no totals. The 109 ms lookup I14 examined is unchanged and its justification still holds.

Design fidelity: D1 established the Zeplin coordinates are exact and nothing in this pass touched them. The one design-adjacent gap found, the swatches' missing accessible names and selection state, is recorded as I22 rather than here, since it is an accessibility defect in a design that is drawn correctly.

### Found while auditing this pass for handoff

#### RESOLVED: I24. Training rebuilds `featureIDs` by a different test that is also wrong for `count` features, and requirement 40 does not reach it

**Pulled into the story, 2026-08-06 (Doug's call, the same one he made for I17).** Added as requirement 42 and commit 10, `fix: Keep count features in the feature IDs rebuilt after training`, with section 10 giving the one-line predicate and the Tests section asking for the confirmation test to be promoted rather than rewritten. Requirement 42 is appended so the earlier numbers stay stable, and commit 10 is numbered last but flagged to land beside commit 9, since the two are the same defect by two routes and together are what make requirement 12 demonstrable on a count feature. The Verification table gains a requirement 42 row pinned to doc 3, and requirement 40's row now says doc 1 **untrained**, which turns out to be load-bearing rather than incidental.

Requirement 40 and section 9 fix one mechanism: a restored `count` feature loses `targetCaseFormula`, so `updateFrequenciesUsagesAndFeatureIDs()` searches with the default formula and matches nothing. There is a **second** mechanism that produces the same symptom by a different route, and the requirement-40 repair does not touch it.

`recreateUsagesAndFeatureIDs()` (`domain_store.ts:536-617`) also rebuilds every target case's `featureIDs`, and it does not use `targetCaseFormula` at all. It decides whether a target text has a feature by reading the feature's own attribute off the target case (`:558-563`):

```ts
const tTargetHasFeature = ['constructed', 'column'].includes(tFeatureType)
  ? iTargetCase.values[tFeatureName] === "true" || iTargetCase.values[tFeatureName] === true ? true : false
  : …
```

A `count` feature is `kFeatureTypeConstructed`, so it takes that branch. Its target attribute holds the result of `patternMatches(…)`, which is a **number**: this spec already establishes that under requirement 40 ("a `count` attribute holds numbers"), verified in the running app. `3 === "true"` is false, so a count feature is never pushed into `tTextResults`, and `:573-591` then writes each target case's `featureIDs` without it. `text_feedback_manager.ts:260-271` reads that value to decide what a text highlights, so the feature stops highlighting, exactly as in I17.

The difference that matters: this path runs **after training** (`model_manager.ts:448`, at the end of the training run), and it harms a session-created count feature just as much as a restored one. So requirement 40's guarantee as worded, that a restored count feature "counts and highlights the same as one created in the session", stays literally true while both are broken, and requirement 12's guarantee, that toggling visibility on restores a feature's highlighting, fails on a trained document for a reason requirement 40 does not cover.

Two things soften it, and neither dissolves it. The loss is partial in the same way I17 records: `:573-591` only rewrites `featureIDs` for target cases that matched at least one feature, so a text matching *only* the count feature keeps its stale ids and goes on highlighting. And a later `updateNonNtigramFeaturesDataset()` pass rebuilds `featureIDs` the right way (`:294-307`), so adding another feature after training repairs it until the next training run.

**Confirmed by test, 2026-08-06.** An earlier draft of this item called it a reading and deferred the check to the app. It did not need the app. A throwaway jest test drove the real `domainStore.recreateUsagesAndFeatureIDs()` with `getCaseValues` and `codapInterface.sendRequest` mocked, over two constructed features, `count: "love"` and `contain: "good"`, and three target cases carrying the string values CODAP v3 actually returns. Three assertions, all passing:

| Assertion | Result |
|---|---|
| A target case matching both features is rewritten with the `contain` feature's case id and **without** the `count` feature's | confirmed |
| A target case matching **only** the count feature gets no entry at all, so it keeps its stale `featureIDs` | confirmed, which is the partial loss described above |
| The same case with the count attribute set to the string `"true"` **does** keep the feature | confirmed, so the `=== "true"` comparison is the cause and not the surrounding logic |

So the defect is real, it is reachable by any document that trains a model with a `count` feature, and it harms session-created and restored features alike.

**The fix is one predicate**, and it mirrors the rule `getTargetCaseFormula()` already states: the default is `attr=true` and count is `attr>0`, so "has feature" for a constructed feature is boolean-true **or** a number greater than zero. At `:558-563`:

```ts
const value = iTargetCase.values[tFeatureName];
const tTargetHasFeature = ['constructed', 'column'].includes(tFeatureType)
  ? value === "true" || value === true || Number(value) > 0
  : …
```

`Number("true")` is `NaN` and `NaN > 0` is false, so a `contain` feature is unaffected; `Number("0") > 0` is false, so a count of zero stays a non-match. The throwaway test should be promoted rather than rewritten if this lands.

**What is genuinely still open is the scope decision, not the facts.** This is pre-existing, it sits in a function this story otherwise never touches, and Doug's scope constraint keeps changes inside the new feature. The case for pulling it in is the same one that pulled I17 in: requirement 12, this story's headline control, does not work on a trained document with a count feature, and the new eye button will read as broken for a defect it did not cause. The case against is that requirement 40 already grew this story once. Doug's call.

---

### Checked and sound, second pass

- **`feature.caseID` is not obviously the features-collection case id, and section 5's `caseByID` write is still right.** This looks like a defect and is not, so it is recorded before someone raises it. `domain_store.ts:266-272` assigns `caseID` and `childCaseID` from the same `iValue.id`, under an in-code comment saying "We're actually looking at the first child case here", and `getFeatureByCaseId()` falls back from one to the other (`feature_store.ts:176-177`), which implies they can diverge; `recreateUsagesAndFeatureIDs()` later overwrites `caseID` from the features collection (`:601`). None of that changes what to write, because `toggleChosenFor()` already sends `update collection[features].caseByID[iFeature.caseID]` and demonstrably lands, which is what section 5 says to follow literally. Requirement 3 is the reason to keep an eye on it anyway: I1 established that a mis-shaped `caseByID` write fails silently, and so would a mis-addressed one.
- **`updateNgramFeatures()` returns before it reaches `guaranteeFeaturesDataset()` on most entries.** `:313` is `if (featureStore.tokenMapAlreadyHasUnigrams) return`, ahead of the `:317` call section 3 names as one of three callers. On a restored doc 1 with 682 tokens that early return always fires, so `:317` is not a live re-entry path there.

  **Corrected by [K2](#resolved-k2-on-the-gesture-requirement-27-is-written-about-updatengramfeatures-never-runs), 2026-08-06.** This item went on to say `:317` "is live exactly where section 3 claims: re-checking the ngram box first runs `toggleChosenFor()`, whose `deleteUnigramTokens()` empties the map, so the guard is false on the way back in." That is true of the **uncheck** and not of the re-check. `deleteUnigramTokens()` runs only in the `if (!iChosen)` branch, and on the re-check the echo from the same function's batched `chosen: true` write has already refilled `tokenMap` through `handleUpdateFeatureCase()` before `toggleChosenFor()` resolves. Measured: zero requests issued by `updateNgramFeatures()` on that gesture. So `:317` is not a live re-entry path there either, and section 3's gesture list is two items rather than three.
- **`feature_component.tsx:38` and `:41` are dead code, so section 3's list of re-entry gestures is complete.** They looked like a fourth and a second caller of the two update methods, which would have added a gesture to section 3's list. They cannot fire: `updateFeaturesDataset()` is guarded by `if (!iFeature.inProgress)` (`:32`), `FeatureComponent` is only ever rendered with `featureStore.featureUnderConstruction` (`feature_constructor.tsx:15`), and `FeatureConstructor` returns `null` unless that feature's `inProgress` is true (`:11`). So the guard is never satisfied. Section 3's three gestures stand.
- **Section 9's uniform re-derivation is safe for ngram and column features.** Applying `getTargetCaseFormula((feature.info.details as SearchDetails).where)` to every restored feature reads `where` off an `NgramDetails` or a `ColumnDetails`, which do not have it. Verified with a throwaway test over a round-tripped `count`, ngram and column feature: no throw, and the two non-search features get `defaultTargetCaseFormula`, exactly as section 9 claims. The same test confirmed that the dropdown's `WhereOption` spellings that `targetCaseFormulas` is not keyed by ("not contain", "start with", "end with") also land on the default, so the only feature whose formula changes is `count`, which is requirement 40's whole claim.

  One nit, not raised as a finding because it is unreachable: `FeatureDetails.details` is typed `… | null` (`:200`), and the expression throws a `TypeError` on null, which at the top of `fromJSON()` would abort the entire restore rather than one feature. Nothing produces a null `details` today (`getStarterFeature()` supplies an object, and `feature_component.tsx:67` does `feature.info.details || {}`), so optional chaining would be belt and braces rather than a fix.
- **Jest can render the new component tests.** Section 7a adds SVG imports to `feature_list_item.tsx`, which the Tests section then asks for a component test of. `jest.config.js` maps `\.svg$` to `src/__mocks__/svg-mock.tsx`, which exports a `ReactComponent` named export, so the existing import style works under test with no new setup.

---

## Self-Review, third pass

Run 2026-08-06 against the implementation plan as amended by I1 to I24. Roles for this pass, chosen because the first two passes did not take these angles: **Fresh Implementer** (read the plan as an engineer with no context who has to build it), **Senior Engineer**, **CODAP Plugin API and Migration**, and **QA Engineer**.

Eight findings, all applied. Every one was checked against source before being written down, and three were pinned with throwaway jest tests in this repo, run and then deleted; each says which and gives its result. Two of the eight have a real failure mode (J1 and J4); the other six are the plan telling the implementer something that does not match its own other pages.

The pass also **confirmed** several things prior passes asserted, recorded at the end so they are not re-derived.

### Senior Engineer

#### RESOLVED: J1. Sections 4 and 6 put the three migration steps in the guard wrapper rather than in the guarded body, which undoes I7 and I19

**Applied 2026-08-06.** Section 3's code block now shows `runFeaturesDatasetMigration()` with all three steps as numbered comments in the prescribed order, and carries a paragraph saying the wrapper holds the guard and nothing else, with both consequences of getting it wrong. Sections 4 and 6 now name `runFeaturesDatasetMigration()` and say explicitly that the step does not go in the wrapper. The Files-touched row names both functions.

Section 3 splits the migration into two functions: `migrateExistingFeaturesDataset()`, which is nothing but the once-only guard, and `runFeaturesDatasetMigration()`, which holds the work and is the thing the `.catch` is attached to.

```ts
private migrateExistingFeaturesDataset() {
  this.migration ??= this.runFeaturesDatasetMigration().catch(…);
  return this.migration;
}
```

Every later section then names the **wrapper** as the place to add its step:

- Section 3, closing: "`migrateExistingFeaturesDataset()` is the one clearly named function requirement 8 asks for, and it is where commits 4 and 6 add their steps."
- Section 4: "**The backfill**, in `migrateExistingFeaturesDataset()`."
- Section 6: "**Second** step in `migrateExistingFeaturesDataset()`, ahead of section 4's backfill."

An implementer following those three instructions literally puts `guaranteeAttribute()`, the 682-case read, the 682-case write and `setColorFor()` into the three-line wrapper. That is not a naming nit, it reverses both of the guarantees the previous pass installed:

- The wrapper runs on **every** entry, because the `??=` guards only the promise it creates. So the 682-case read and write happen on every feature added, every re-check of the ngram box, and every collapse and expand of the StoryQ panel, which is exactly the cost I7 exists to prevent and exactly the gesture list section 3 itself enumerates.
- The steps sit **outside** the `.catch`, so a `sendRequest` timeout becomes the unhandled rejection I19 decided the plugin must not produce, on the path where `storyq.tsx:94` calls `fromJSON()` without `await` and without `.catch`.
- The wrapper is currently synchronous and would have to become `async`, which is the one visible signal that something is off, and it is easy to miss because making it `async` is a one-word change that compiles.

Nothing outside section 3 ever names `runFeaturesDatasetMigration()`, so the correct target appears exactly once in the document and the wrong one appears three times.

**Suggested resolution**: name `runFeaturesDatasetMigration()` in section 3's closing sentence, in section 4's backfill heading and in section 6's opening, and add one clause to section 3 saying the wrapper holds the guard and nothing else. Optionally show the finished body of `runFeaturesDatasetMigration()` with all three steps in the prescribed order, so there is one place the whole migration can be read.

---

#### RESOLVED: J2. Sections 2 and 7b prescribe two incompatible shapes for `featureColors`, and 7b's version silently rewrites `getFeatureColor()`

**Applied 2026-08-06.** `featureColors` stays six hex strings and section 2 adds `featureColorNames`, a record keyed by hex, with a paragraph giving the reason and naming the two untouched call sites that break otherwise. Section 7b now sources swatch names from that record and says not to put them in the array.

Section 2 says what the file ends up as:

```ts
export const featureColors = ["#ffe671", "#dbb6fb", "#45f1eb", "#a8e620", "#fb93e8", "#9ce1ff"];
export function getFeatureColor() { … }        // unchanged
```

Section 7b then says of the swatch names: "Add the name to `featureColors` rather than keeping a parallel array, so a palette edit cannot leave a colour and its name out of step."

Those cannot both hold. Verified in source: `getFeatureColor()` is `const color = featureColors[featureColorIndex]` and returns that element directly (`color-utils.ts:7-11`), and its four call sites all consume a plain hex string: `feature_pane.tsx:53` (`featureUnderConstruction.color = getFeatureColor()`), `domain_store.ts:240` (`color: iFeature.color ?? getFeatureColor()`), `domain_store.ts:353` (the line section 2 replaces), and `notification_manager.ts:102` (the line section 2 replaces). Turning `featureColors` into an array of objects makes `getFeatureColor()` return an object to the two call sites this story does **not** touch, which writes `[object Object]` into the dataset's `color` attribute and into `Feature.color`, and from there into an inline `backgroundColor`. `isPaletteColor()` would need the same change and section 2 does not mention it.

That also crosses a scope line the requirements drew deliberately. Requirement 21 leaves the yellow collision alone specifically because "changing where the cycle starts means editing `getFeatureColor()`, which is existing code outside this story's surface", and section 7b's sentence edits it as a side effect of naming swatches.

**Suggested resolution**: keep `featureColors` as the six hex strings, since three other places depend on that shape, and put the names in a separate exported record keyed by hex (`export const featureColorNames: Record<string, string>`). That keeps 7b's actual goal, which is that a palette edit cannot leave a colour and its name out of step, because the record is keyed by the value rather than by position, and an unnamed colour is then a missing lookup rather than a silent mismatch. Say so in section 2's file listing so the two sections agree.

---

### Fresh Implementer

#### RESOLVED: J3. `IColorPickerProps` gives the picker no way to name the feature, which requirement 41 and section 7b's own markup both need

**Applied 2026-08-06.** `featureName: string` added to `IColorPickerProps` and used in the container's `aria-label`. A string rather than the whole `Feature`, since the picker needs nothing else from the store.

Section 7b declares the component's contract:

```tsx
interface IColorPickerProps {
  anchor: DOMRect
  color: string
  onChoose: (color: string) => void
  onClose: () => void
}
```

Six lines later the same section writes the markup: `aria-label={`Highlight color for ${feature.name}`}`. There is no `feature` in scope. Requirement 41 makes that name mandatory ("a name identifying which feature is being recolored"), and the Tests section then asks for a `getByRole` assertion that "the grid exposes a group role and a name carrying the feature", so the gap is load-bearing rather than cosmetic: the component as declared cannot pass the test the plan asks for.

**Suggested resolution**: add `featureName: string` to the props (preferred over passing the whole `Feature`, since the picker needs nothing else from it and a narrower prop keeps the new component free of store types), and use it in both the container's `aria-label` and any per-swatch naming that mentions the feature.

---

#### RESOLVED: J4. "Mutate every entry in `tokenMap`" is over-broad: `tokenMap` also holds one token per constructed feature after training

**Applied 2026-08-06.** Section 5 now filters both fan-outs on `token.type === kTokenTypeUnigram`, with the source chain, the test result and the note that the unfiltered version is invisible only because of a lookup order. Section 6's repair wording follows. Requirements 22, 25 and 26 amended to say "unigram entry", with the reason recorded once under 22.

Section 5 defines both fan-outs as "if `feature.type === kFeatureTypeUnigram`, mutate every entry in `tokenMap` first". Requirements 22, 25 and 26 use the same phrase. `tokenMap` is not only unigrams.

Verified in source. `oneHot()` adds a token of type `kTokenTypeConstructed` for every entry in a document's `columnFeatures` (`one_hot.ts:100-112` on the restore path and `:118-131` on the fresh path), and `model_manager.ts:332-334` builds `columnFeatures` from `targetColumnFeatureNames.concat(featureStore.chosenFeatures.map(f => f.name))`, which is **every chosen feature**, not only column features. So on any trained document that has both single-word extraction and a `count` or `contain` feature, `featureStore.tokenMap` holds the 682 unigram tokens plus one `constructed feature` token per matching constructed feature. The codebase already knows this: `deleteUnigramTokens()` filters on `token.type === kTokenTypeUnigram` (`feature_store.ts:317-323`) precisely because it must not delete the others, and section 5's own CODAP write is scoped with `caseFormulaSearch[type='unigram']`. The store mutation is the only half of the fan-out that is not scoped.

**Confirmed by throwaway jest test, 2026-08-06**, three assertions over the real `featureStore`, all passing:

| Assertion | Result |
|---|---|
| `Object.values(tokenMap).forEach(…)` as section 5 words it recolours and hides the constructed-feature token alongside the unigram | confirmed |
| Adding `.filter(t => t.type === kTokenTypeUnigram)` leaves the constructed token at its own colour | confirmed, so the fix is one predicate |
| `getFeatureOrTokenByCaseId()` returns the **`Feature`**, not the token, for a constructed feature's case id | confirmed, which is why this is latent rather than live |

The third row is what keeps this off the "must fix or ship a bug" list and is worth stating plainly: `getFeatureOrTokenByCaseId()` is `getFeatureByCaseId(caseId) ?? getTokenByCaseId(caseId)` (`feature_store.ts:237-239`), and `text_feedback_manager.ts:265` and `:430-431` both resolve Feature-first, so a constructed feature's highlighting is read off the `Feature` and the corrupted token is never consulted. What the over-broad version actually costs is a store that disagrees with the dataset it just wrote (the CODAP write skipped those cases by design), a `tokenMap` serialised into the saved document with wrong colours and highlight flags on constructed tokens, and a correctness argument that depends on a lookup order nothing states or tests.

**Suggested resolution**: scope both fan-outs and the requirement 22 repair to `token.type === kTokenTypeUnigram`, matching `deleteUnigramTokens()` and matching the `caseFormulaSearch[type='unigram']` the same code already uses on the CODAP side. One predicate in `setColorFor` and `setHighlightFor`, plus the wording in requirements 22, 25 and 26.

---

#### RESOLVED: J5. Three pieces of stale text a new reader hits in the first two pages

**Applied 2026-08-06.** The `one_hot.ts` row is gone from the Files-touched table, the header says 1 to 42, the two commit-ordering paragraphs are folded into one that covers both commits 9 and 10, and commit 10 is added to the list of movable commits.

All three are one-line edits; they are grouped because none of them is worth its own item and all three mislead on first read.

- **The Files-touched table still lists `src/lib/one_hot.ts`**, with the hedge "unless the colour is set at `domain_store.ts:353` instead". I3's resolution says it "drops `one_hot.ts` from the graft and from the Files-touched table", and section 2 now says "Do not graft its `one_hot.ts` change". The table is the last thing a reviewer checks a PR against, so it is the row most likely to put the file back.
- **The header says "Requirement numbers below refer to the amended list, 1 to 40."** The list runs to 42, and the commit table on the next screen cites both 41 and 42.
- **Two paragraphs in "Shape of the work" compete over which commit is last.** One says "Commit 9 is numbered last but is worth landing first ... It is numbered 9 only so the eight sections below and every cross-reference to them keep their numbers"; the next says "Commit 10 is last only so the nine sections below keep their numbers". The first was written when the plan had nine commits and is now false on its own terms. The sentence "Commits 1, 8 and 9 are independent of everything and can move" also omits 10, which the same section calls independent two paragraphs earlier.

**Suggested resolution**: delete the `one_hot.ts` row, change "1 to 40" to "1 to 42", fold the two commit-ordering paragraphs into one, and add 10 to the list of movable commits.

---

### QA Engineer

#### RESOLVED: J6. The requirement 27 test cannot be written as the Tests section describes it, and the naive version passes vacuously

**Applied 2026-08-06.** The requirement 27 test bullet now names the three things the harness needs, says why `one_hot.test.ts` is the wrong model for this one, records that the naive version passes vacuously, and points at the working scaffolding in the session scratchpad.

The Tests section says: "Set the ngram `Feature`'s colour to something off-palette **and its `highlight` to false**, run `updateNgramFeatures()` with `codapInterface` mocked, and assert every token in `tokenMap` carries that colour rather than `ngramColor` and is hidden rather than highlighted. ... `one_hot.test.ts` is the closest model, and `oneHot` runs fine without CODAP."

`oneHot` does run fine without CODAP, because it takes its documents as an argument. `updateNgramFeatures()` does not: it builds them from `targetStore` (`domain_store.ts:315-334`), and `targetStore.updateTargetCases()` returns `[]` unless `targetAttributeName !== ''` (`target_store.ts:282-288`).

**Both halves confirmed by throwaway jest test, 2026-08-06.**

Written exactly as the bullet describes, with only `codapInterface` mocked: the call completes without throwing, issues two requests, and leaves `tokenMap` **empty**. The prescribed assertion is `Object.values(tokenMap).every(…)`, which is `true` on an empty map, so the test passes while asserting nothing. It would also keep passing if the fix were reverted.

The test is entirely writable, but it needs two things the bullet does not mention:

- **A resource-aware `sendRequest` mock**, returning target cases for the `caseFormulaSearch` request rather than one blanket return value.
- **`targetStore` populated through `targetStore.fromJSON()`.** Assigning the fields directly does not work: `targetDatasetInfo` is a computed (`target_store.ts:182-184`) and mobx throws `It is not possible to assign a new value to a computed value`. `fromJSON()` is the seam, and it needs `targetDatasetInfo`, `targetAttributeName`, `targetClassAttributeName`, `targetClassNames` and `targetChosenClassColumnKey`.

With that scaffolding the test runs in 42 ms against the real `domainStore` and reproduces today's defect exactly: seven tokens, colours `#ffe671, #45f1eb, #a8e620, #fb93e8, #dbb6fb, #9ce1ff, #ffe671` from the six-colour cycle, every one `highlight: true`, under an ngram `Feature` set to `#dbb6fb` and `highlight: false`. That is the failing assertion the fix has to turn green, and it is worth having.

**Suggested resolution**: replace "with `codapInterface` mocked" with the two requirements above, drop the `one_hot.test.ts` pointer or qualify it (it is the right model for `oneHot`, not for `updateNgramFeatures()`), and add one clause requiring the test to assert a non-zero token count before asserting anything about the tokens. The working scaffolding from this pass is saved at `/tmp/claude-1000/-home-doug-projects-storyq-codap-plugin/53ac8475-5e1b-4285-a014-4beeb000790a/scratchpad/req27-scaffolding.ts` and can be promoted rather than rewritten.

---

#### RESOLVED: J7. The Tests section contradicts itself about `domain_store.ts` coverage

**Applied 2026-08-06.** The Tests section's opening now says the story adds two narrowly scoped `domain_store.ts` tests and attempts no general coverage, and "the only coverage" is dropped from the `recreateUsagesAndFeatureIDs` bullet.

Its opening says "Neither `domain_store.ts` nor `notification_manager.ts` has any coverage today, and this story is not the place to start." Two bullets later it asks for a `recreateUsagesAndFeatureIDs` test and calls it "the only coverage `domain_store.ts` would have", and the bullet after that asks for the requirement 27 test, which drives `updateNgramFeatures()`, also in `domain_store.ts`.

Both tests are worth writing and the reasoning for each is good. Only the framing is wrong, and it matters a little because the opening sentence is the one a reviewer would quote when cutting a test under time pressure.

**Suggested resolution**: change the opening to say that neither file has coverage today, that this story adds two narrowly scoped tests to `domain_store.ts` because both pin defects that are otherwise invisible, and that it does not attempt general coverage of either file. Drop "the only coverage" from the `recreateUsagesAndFeatureIDs` bullet.

---

#### RESOLVED: J8. On a restored document the ngram row's eye can disagree with the words it stands for, and nothing says what that should look like

**Applied 2026-08-06.** Section 7a now records that the ngram row's eye reflects the `Feature`'s flag, that a restored document can carry per-token values that disagree with it, that the first press resolves it, and that deriving the icon from the tokens would be a requirements decision.

Requirement 22 deliberately leaves per-token `highlight` alone on restore, and gives the reason: those are individual choices a student made word by word through the Features table before this story hid the column. Requirement 25 then makes the eye on that row a single flag read off the ngram `Feature`.

So a pre-change document can restore into a state the new control cannot express: `Feature.highlight` true, and some fraction of the 682 tokens false. Section 7a renders the eye from `feature.highlight`, so the row reads "highlighting is on" while some of its words do not highlight. This is reachable, not theoretical: `highlight` is a checkbox on all 683 cases in the current Features table, which is the only way to set it today, and `handleUpdateFeatureCase()` copies it onto the token (`notification_manager.ts:90`).

It is self-correcting the moment the control is used, since either press writes every token, so this is a first-render presentation gap rather than a stuck state, and it costs nothing to leave as is. What is missing is that neither document says which it is, so the first person to meet it will file it as a bug against the new control.

**Suggested resolution**: one clause in section 7a saying the row's eye reflects the ngram `Feature`'s flag, that a restored document can carry per-token values that disagree with it, and that the first use of the control resolves it. If Jie would rather it never appear, the alternative is to derive the row's icon from the tokens when any exist, which is a computed over `tokenMap` and would need a requirements decision rather than an implementation one.

---

### Checked and sound, third pass

Recorded so they are not re-derived.

- **Section 9's re-derivation works through the real observable store, not just over plain objects.** The second pass tested `getTargetCaseFormula` over round-tripped plain objects. This pass ran section 9's actual loop against the real `featureStore` after `fromJSON()`: assigning a function to a property that `JSON.stringify` stripped does take on a mobx observable `Feature`, reads back as a function through `featureStore.features[i]` and through `getFeatureByName()`, and produces `` `X`>0 `` for the count feature and `` `X`=true `` for the contain feature. Confirmed by throwaway test, four assertions, all passing.
- **The two `where` spellings agree on `count`, so requirement 40's repair is not a no-op.** `store_types_and_constants.ts` carries two option sets, `whereOptions` (`kContainOptionCount = "count"`) and `searchWhereOptions` (`kSearchWhereCount = "count"`), and `targetCaseFormulas` is keyed only by the second. They differ for `notContain` versus `not contain` and the other two, which is the divergence the second pass noted, but the `count` literal is identical in both, so a restored count feature does resolve to the `>0` formula. This was worth checking, because if the two had disagreed on `count` the whole of commit 9 would have compiled, run, and changed nothing.
- **Section 10's predicate is a faithful rewrite of the code it replaces.** `domain_store.ts:558-563` reads exactly as I24 quotes it, including the `['constructed', 'column'].includes(tFeatureType)` test with string literals rather than the `kFeatureType*` constants, the `tFeatureType === 'unigram'` arm calling `targetTextHasUnigram(String(iTargetCase.values[targetAttributeName]), tFeatureName)`, and the `: false` fallback. Section 10's block preserves all three, so pasting it drops nothing.
- **Every code block in sections 2, 4, 9 and 10 type-checks against the real signatures.** `Feature.targetCaseFormula` is optional (`store_types_and_constants.ts:219`) so section 9's assignment compiles; `SearchDetails.where` is `SearchWhereOption`, which is what `getTargetCaseFormula()` takes, so the cast section 9 borrows from `target_store.ts:378` is what makes it type-check; `Token extends FeatureOrToken` carries `color` and optional `highlight`, so section 2's two new lines compile against `tTokenArray`, whose elements are the store's own token objects (`one_hot.ts:145`); `guaranteeAttribute({ name, hidden }, datasetName, collectionName)` matches section 4's call (`codap-helper.ts:156-157`); and `getCaseValues()` returns `CaseInfo[]` with `id` and `values`, which is what section 4's backfill reads and writes. `guaranteeAttribute` is not currently imported into `domain_store.ts` and would need adding, which is the only new import in the four sections.
- **`kPosNegConstants.positive.attrKey` and `.negative.attrKey` really are the same literal.** Both are `'frequency in '` including the trailing space (`store_types_and_constants.ts:14,18`), so section 4's single `startsWith` does find both frequency attributes, and `total frequency` does not match it.
- **The batched write shapes in section 5 match working code exactly.** `toggleChosenFor()` sends the nested `values: { values: { chosen } }` to `caseByID` and a flat `{ id, values }` array to `.case` (`feature_store.ts:379-419`), which is the asymmetry I1 established and section 5 now spells out. Nothing in this pass changed that reading.

---

## Self-Review, fourth pass

Run 2026-08-06 against the implementation plan as amended by I1 to I24 and J1 to J8. Roles for this pass, chosen because the first three passes did not take these angles: **Code Reviewer** (read the plan as the diff it will produce, commit by commit), **Reliability and Failure-mode Engineer**, **CSS and Browser Layout Specialist**, **ARIA and Screen Reader Specialist**, and **Maintainer** (reading this in six months).

Six findings. Every one was checked against source before being written down, and three were settled with experiments run and then deleted: a browser reproduction driven through Playwright against the plugin's own stylesheets, a jest test against the real stores, and a production build. Two of the six have a user-visible failure mode (K1 and K4) and one invalidates a claim three earlier passes rested on (K2). Things this pass checked and found sound, including one worry it raised and then refuted, are recorded at the end.

### CSS and Browser Layout Specialist

#### RESOLVED: K1. The picker's `position: fixed` does not resolve against the viewport, because two ancestors carry an inline `transform`

**Applied 2026-08-06.** Section 7b now prescribes `ReactDOM.createPortal(…, document.body)` with `position: fixed` on the portalled element, rather than offering the portal as an alternative, and carries the measured table and the reason. The Files touched row for `color_picker.tsx` says so too, since that table is the last thing a reviewer checks a PR against.

Section 7b prescribes the placement as "`position: fixed`, coordinates from `anchor`", and gives the flip rule as `anchor.bottom + 75 > window.innerHeight`. Both of those assume a fixed element's containing block is the iframe viewport. In this plugin it is not.

`tab-panel.tsx:55` renders `<div className="ui-multiview-item-container" style={{ transition: "all", transform: "translate(0px, 0px)", left: 0 }}>`, and `tab-panel-tab-content.tsx:22` renders each panel as `<div className={…} style={{transform: "translate(0px, 0px)"}} aria-hidden={hidden}>`. Both are ancestors of every feature row. A `transform` of anything other than `none` makes an element the containing block for descendants with `position: fixed`, and `translate(0px, 0px)` is a transform: it computes to a matrix, not to `none`. So the picker's `top` and `left` are measured from `.ui-multiview-item`'s padding box while `getBoundingClientRect()` reports viewport coordinates, and the two differ by exactly that element's offset.

**Measured, not reasoned.** A reproduction of the real ancestor chain, using `light.compact.css`, `storyq.scss` and `feature_list_item.scss` unmodified and the two inline styles copied verbatim from the components, driven through Playwright at the plugin's own 460x420 starting size:

| | Wanted (viewport coords from the button's rect) | Rendered | Error |
|---|---|---|---|
| Row 1, picker inside the row (section 7b as written) | top 184.2, left 15 | top 222.2, left 16 | **+38, +1** |
| Row 4, same | top 310.2, left 15 | top 348.2, left 16 | **+38, +1** |
| Row 1, picker portalled to `document.body` | top 184.2, left 15 | top 184.2, left 15 | 0, 0 |
| Row 4, same | top 310.2, left 15 | top 310.2, left 15 | 0, 0 |

The 38 px is `.ui-tabpanel-tabs`'s height, which is where `.ui-multiview-item` starts, and the 1 px is its left offset. A feature row is also 38 px tall, so the picker opens exactly one row too low: it lands under the row below the one whose button was pressed. The error is constant, so it will look like a styling mistake rather than a positioning bug, and it will look the same at every scroll position, which is what makes it easy to misdiagnose.

The flip rule inherits the same error in the other direction. It compares viewport numbers, so it decides there is room below while the popover will in fact render 38 px lower than the number it checked. Near the bottom of a short plugin window it will choose "below" and then clip, which is the outcome requirement 14 exists to prevent.

Section 7b already names the fix, as its second option: "portal the picker to the app root". That is the one that works, because a portal target outside the transformed subtree gets the viewport back as its containing block, which the last two rows of the table confirm. `document.body` or `#root` both qualify; `.storyq-container` does not need to be avoided, but anything inside `#tabPanel` does.

**Suggested resolution**: make section 7b prescribe `ReactDOM.createPortal` to `document.body` rather than offering it as an alternative to `position: fixed` in place, and say why in one clause, since "use `position: fixed`" is the obvious thing to reach for and it is wrong here for a reason nothing in the file would reveal. Keep `position: fixed` on the portalled element itself, which is then correct. Requirement 14's own wording does not need to change: it asks for a picker that is never clipped, not for a technique.

---

### Reliability and Failure-mode Engineer

#### RESOLVED: K2. On the gesture requirement 27 is written about, `updateNgramFeatures()` never runs

**Applied 2026-08-06,** in four places, since the wrong claim had spread. Section 2 gains a paragraph saying which site serves which gesture and why it is the opposite of what it looks like; `requirements.md`'s trap 3 and requirement 27 are corrected to match. Section 3's gesture list and the matching bullet under requirement 8, the Technical Notes bullet, and the Verification table row all drop the ngram re-check. The second pass's "checked and sound" item is annotated rather than deleted, since the half of it about doc 1 was right. The Tests section gains a second requirement 27 test that drives the round trip through `toggleChosenFor()` with an echo-firing mock, and points at the scaffolding. Nothing about what to build changed.

Trap 3 and section 2 both describe `updateNgramFeatures()` as the primary token-creation path, "reached from the Features tab and from re-checking the feature in the Training tab (`feature_list_item.tsx:45`)", and `handleUpdateFeatureCase()` as a second site that "quietly reintroduces cycled colours". On the re-check gesture it is the other way round: the notification handler does all of the work and `updateNgramFeatures()` does none of it.

The chain is all in this repo. `feature_list_item.tsx:43-46` awaits `toggleChosenFor()` and only then calls `updateNgramFeatures()`. `toggleChosenFor()` for a unigram feature runs `syncUnigramsInFeaturesDataset(true)`, which searches the unigram cases and sends one batched update setting `chosen: true` on all of them (`feature_store.ts:386-403`). I18 established, and verified at `f3d41932d`, that CODAP broadcasts the resulting `updateCases` notification **synchronously, before it answers the request**. So `handleUpdateFeatureCase()` runs while `toggleChosenFor()` is still awaiting, finds `tokenMap` empty (the earlier uncheck ran `deleteUnigramTokens()`), and takes its `!tToken && tChosen` branch for every case, rebuilding the whole token set (`notification_manager.ts:96-109`). By the time `updateNgramFeatures()` is called, `featureStore.tokenMapAlreadyHasUnigrams` is true and it returns at its first line (`domain_store.ts:313`).

**Confirmed by throwaway jest test**, over the real `featureStore`, `domainStore` and `NotificationManager`, with `sendRequest` mocked to fire the echo synchronously the way I18 showed CODAP does. Uncheck, then re-check, then call `updateNgramFeatures()`:

| Assertion | Result |
|---|---|
| `tokenMap` is empty after the uncheck | confirmed, 0 tokens |
| `tokenMap` is rebuilt by the notification handler during the re-check | confirmed, all tokens back before `toggleChosenFor()` resolved |
| The rebuilt tokens carry the six-colour cycle and `highlight: true`, under a `Feature` set to `#dbb6fb` and `highlight: false` | confirmed, `#ffe671` and `true` |
| `updateNgramFeatures()` then issues **zero** requests | confirmed, the `tokenMapAlreadyHasUnigrams` guard fires |

The same test with section 2's prescribed handler expression applied to `notification_manager.ts` produced tokens at `#dbb6fb` and `highlight: false`, so **the fix is right and complete**: section 2 fixes both sites, and the site that actually runs is fixed. Nothing about what to build changes. Three things the plan says around it are wrong.

- **Trap 3 and section 2 misattribute the gesture.** Section 2 calls `domain_store.ts:353` "the site" and the handler the one that "will not show up in manual testing of the control itself". For the Training tab round trip it is the handler that shows up and `:353` that does not run at all. `:353` still matters, for first extraction from the Features tab. Both need the fix; only the emphasis is inverted.
- **Re-checking the ngram box is not a re-entry gesture for the migration guard.** The third pass recorded, under "checked and sound, second pass", that `:317` is "live exactly where section 3 claims: re-checking the ngram box first runs `toggleChosenFor()`, whose `deleteUnigramTokens()` empties the map, so the guard is false on the way back in". `deleteUnigramTokens()` runs on the **uncheck**, and by the time of the re-check the echo has already refilled the map, so the guard is true and `:317` is not reached. Section 3's gesture list, requirement 8's, and the `requirements.md` Verification table row that asks for a collapse and expand plus three feature additions all lose this item. The guard is still needed; the other two gestures are unaffected.
- **The requirement 27 regression test does not cover the gesture requirement 27 is about.** The Tests section, as J6 rewrote it, drives `updateNgramFeatures()` with the scaffolding J6 worked out. That is the right test for first extraction and it would pass unchanged if the handler fix were reverted, which is the regression a student would actually meet, by the exact gesture requirement 27 names.

**Suggested resolution**: correct trap 3 and section 2 to say that the Training tab round trip is served by `handleUpdateFeatureCase()` and that `updateNgramFeatures()` returns at `:313` on that path; strike re-checking the ngram box from section 3's and requirement 8's gesture lists and from the Verification table; and add a second requirement 27 test that drives the round trip through `toggleChosenFor()` with an echo-firing `sendRequest` mock, asserting the rebuilt tokens take the `Feature`'s colour and `highlight`. The scaffolding for it is in the session scratchpad and is about forty lines.

---

### Senior Engineer

#### RESOLVED: K3. Section 2's two prescribed expressions do not state the same rule, and `??` does not catch `kNoColor`

**Applied 2026-08-06** by extracting the rule rather than by fixing the expression twice. `color-utils.ts` gains `ngramTokenColor(featureColor?: string)` and both sites call it, so "tokens follow the `Feature`" is stated once. It takes the colour rather than the `Feature` because `color-utils.ts` cannot import `FeatureOrToken` without a cycle. `highlight` keeps `?? true`, which is correct there.

Section 2 fixes the two token-creation sites and says they take "the same expression" and state "the same rule ... tokens follow the `Feature`". They do not. The extraction site is prescribed as `iNtgramFeature.color !== kNoColor ? iNtgramFeature.color : ngramColor`, which section 2 argues for at length and keeps deliberately so requirement 31 holds by construction. The notification handler is prescribed as `featureStore.ngramFeature?.color ?? ngramColor`, and `??` falls back only for `null` and `undefined`. `kNoColor` is the string `"NO_COLOR"`, so it passes straight through.

**Confirmed by throwaway test**, with section 2's expressions applied to the source: with the ngram `Feature` at `kNoColor`, the re-check round trip of K2 wrote `color: "NO_COLOR"` into every rebuilt token.

The window is real but narrow, and it is on the documents requirement 22 exists to serve. A pre-change document restores with its ngram `Feature` at `kNoColor`, and `restorePluginFromStore` does not await `domainStore.fromJSON()` (`storyq.tsx:91-97`), so the plugin is interactive for roughly the 700 ms the migration takes. I19's decision that a failed migration is logged and swallowed widens it further: if the migration fails, the `Feature` stays `kNoColor` for the whole session, and any Training tab round trip in that session writes `"NO_COLOR"` into the whole token set, which `asJSON()` then saves. It does heal, since requirement 22's gate reads the `Feature` rather than the tokens and the repair fans out through `setColorFor()`, so the next successful open repaints them. What is left in the meantime is tokens whose inline `backgroundColor` is invalid, which is exactly what requirement 32 asks never to emit.

**Suggested resolution**: write the handler site as `ngramFeature?.color !== undefined && ngramFeature.color !== kNoColor ? ngramFeature.color : ngramColor`, or extract the one expression both sites want into a small helper on `FeatureStore` beside `ngramFeature`, so that "tokens follow the `Feature`" is stated once rather than twice in two dialects. `highlight` needs no equivalent: `?? true` is correct there, because `false` is a meaningful value and `undefined` is the only thing to default.

---

### Code Reviewer

#### RESOLVED: K4. Section 7a's conditional pill fill is not gated on the new prop, so it changes the Training tab

**Applied 2026-08-06.** Section 7a now gates the fill on `allowHighlightControls`, folded into the same expression as the `kNoColor` guard, and says the fill belongs to the control rather than to the feature so nobody simplifies it back. Requirement 33 gains the guarantee explicitly, with the reason, since "the Training tab is unchanged" was doing that work implicitly and lost.

Section 7a is careful about requirement 33 in one place and misses it in another. It says the wrapper "must collapse when the controls are absent, or the Training tab gains 66 px of dead space to the left of every row and requirement 33 is broken by the restructure rather than by the buttons". One paragraph later it says, with no such qualification: "The pill's `backgroundColor` becomes conditional on `feature.highlight` (requirement 11: white pill when highlighting is off) while the colour button keeps showing the colour either way (requirement 12)."

`FeatureList` is shared. `feature_pane.tsx:107` renders it as `<FeatureList allowChoose={false} />` and `training_pane.tsx:230` as `<FeatureList allowDelete={false} />`, and both reach the same `feature_list_item.tsx:29`, which today is `const style = { backgroundColor: feature.color };` with no reference to `highlight` at all. Applied as written, a feature whose highlighting is off renders as a white row **on the Training tab too**, where requirement 33 says nothing changes.

This is reachable today and becomes easy to reach after this story. `highlight` is a checkbox on every case in the current Features table, and `handleUpdateFeatureCase()` copies it onto the `Feature` (`notification_manager.ts:86`); after commit 7, requirement 25's toggle is one click. So the ordinary sequence is: hide a feature's highlighting on the Features tab, switch to Training, and find that feature's row has lost its colour with nothing on that tab to say why.

It is also the one place in this story where requirement 38's principle fails on its own terms. Requirement 38 says colour is not the only channel carrying meaning, and points at the eye and eye-with-slash icons as the second channel. On the Training tab those icons are deliberately absent, so a white row there carries the meaning by colour alone, and carries it identically to a row whose feature colour happens to be white.

**Suggested resolution**: gate the conditional fill on the same prop as the buttons, `backgroundColor: allowHighlightControls && !feature.highlight ? "#ffffff" : feature.color`, folded into the same expression as the `kNoColor` guard section 7a already puts there, and say in one clause that the fill is part of the control rather than part of the feature, so the next person does not simplify it back. Worth a line in the `feature_list_item` test bullet as well, since "neither appears in the Training tab configuration" is already asserted there and this is the same guarantee.

---

### ARIA and Screen Reader Specialist

#### RESOLVED: K5. Nothing closes the picker when focus leaves it

**Applied 2026-08-06.** Requirement 14 gains focus-out as a fifth closing route, section 7b implements it as a `focusout` handler tested against `relatedTarget`, and requirement 37 is split: focus returns to the button on Escape, choose and re-activation, and deliberately does not on click-elsewhere or focus-out. That last part is a correction as much as an addition, since returning focus on those two routes overrides a choice the user just made.

Requirement 14 gives four ways the picker closes: activating the button again, clicking elsewhere, pressing Escape, and choosing a colour. Section 7b implements exactly those four, as a `keydown` handler for Escape, `onChoose`, a button toggle, and a `pointerdown` listener on `document`. Requirement 37 then says focus returns to the colour button "whenever the picker closes, whether by choosing a color, pressing Escape, activating the button again, or clicking elsewhere". Grepping both specs, neither mentions `focusout`, `blur`, or focus leaving by any route other than those four.

So Tab is unhandled. The picker is a roving tabindex over the swatches, which by construction means exactly one tab stop, so a single Tab press moves focus out of the popover entirely, and nothing closes it or moves it. The user is left with an open popover they are no longer in and can no longer reach, over a row whose button reports `aria-expanded="true"`. Shift-Tab does the same in the other direction. This is true of the plan as written and stays true after K1's portal fix, which if anything sharpens it: a popover portalled to `document.body` is last in DOM order, so Tab from its swatch leaves the plugin's content entirely rather than landing on the next row.

The same gap covers one lifecycle case worth naming in the same clause. If the row unmounts while its picker is open, which deleting the feature does, requirement 37's focus return targets a detached button, `focus()` on it silently does nothing, and focus falls back to `<body>`.

**Suggested resolution**: add a fifth close route to requirement 14 and to section 7b, a `focusout` handler on the popover that closes when `event.relatedTarget` is neither inside the popover nor the colour button, and note that this route is the one that must **not** move focus, since the user has already chosen where it goes. That exception is worth stating explicitly in requirement 37 rather than leaving "whenever the picker closes" to be read literally: on outside-click and focus-out the focus return is wrong, and only on Escape, choose, and re-activation is it right.

---

### Maintainer

#### RESOLVED: K6. Two commits leave an import that fails the build, and neither section says so

**Applied 2026-08-06.** Section 2 says to drop the orphaned `getFeatureColor` import and gives the verified build failure; sections 7a and 8 each name the `kNoColor` import they need and note there is no cycle. A short paragraph under the Files touched table records that CI turns lint warnings into build errors, which is the fact that makes these worth writing down at all.

Small and mechanical, grouped because both are the same shape: a prescribed edit changes which imports a file needs and the plan does not mention it.

- **Commit 2 orphans an import.** Section 2 replaces `notification_manager.ts:102`'s `color: getFeatureColor()`, which J2 confirmed is that file's only use of the function. The import at `notification_manager.ts:12` is then unused. That is not a tidiness note here: CI runs `npm run build` (`.github/workflows/ci.yml`), GitHub Actions sets `CI=true`, and `react-scripts` turns ESLint warnings into errors under it. **Verified by running it**: with the call replaced, `CI=true npx react-scripts build` fails with `Failed to compile. [eslint] src/managers/notification_manager.ts Line 12:10: 'getFeatureColor' is defined but never used`. `getFeatureColor` itself stays live, at `feature_pane.tsx:53` and `domain_store.ts:240`, so only the import goes.
- **Commit 8 needs an import that does not exist yet.** Section 8's replacement expression tests against `kNoColor`, and `utilities.ts` imports nothing from `color-utils` today: its imports are `one_hot`, `lists`, `headings_manager`, `store_types_and_constants` and `feature_store`. There is no cycle risk, since `store_types_and_constants` already imports `kNoColor` from the same module. Section 7a's guard needs the same import in `feature_list_item.tsx`, which also has none.

**Suggested resolution**: one clause in section 2 and one in section 8, and a note under the Files touched table that the build treats lint warnings as errors in CI, which is the fact that turns an orphaned import from a nit into a red build.

---

### Checked and sound, fourth pass

Recorded so they are not re-derived, including one worry this pass raised and then refuted.

- **`position: fixed` is not clipped by the intervening scroll containers, even inside the transformed subtree.** This pass first predicted that K1's transformed containing block would also reintroduce the clipping requirement 14 warns about, since `.sq-container` (`storyq.scss:238-241`) and `.sq-feature-panel` (`:146-151`) are both `overflow: auto` between the picker and `.ui-multiview-item`. Measured in the reproduction with the scroll box artificially shortened so there was room below it inside the viewport, the picker painted outside the scroll box in both the transformed and untransformed cases: with the transforms removed, `elementFromPoint` returned the picker 20 px and 55 px below the container's bottom edge, and with them present it returned the picker at every point the offset had moved it to. So K1 is a positioning defect only, and the clipping half of the worry is wrong. Worth recording because it is the natural second guess and it costs a browser to settle. (Figures re-taken after L0; the first run of this check had two stylesheets inert.)
- **The fixed picker does not scroll with the feature list.** Same reproduction: scrolling `.sq-container` by 60 px moved the picker by 0 px, re-confirmed after L0 with the stylesheets genuinely applied. So section 7b's "recompute on scroll and resize while open, or close on scroll" is answering a real question, since the picker will detach from its button, and the simpler of its two answers is still available after K1.
- **`.ui-multiview-item-hidden` really is `visibility: hidden`,** at `light.compact.css:17420-17424`, together with `top: -9999px` and `left: -9999px`. The second pass's "checked and sound" item about the new buttons not staying focusable in the inactive tab holds as written.
- **Section 4's two helper calls match their real signatures.** `guaranteeAttribute(iAttributeInfo: { name: string, hidden: boolean }, iDatasetName: string, iCollectionName: string)` (`codap-helper.ts:156-157`) takes `hidden` as **required**, not optional, so section 4's `{ name: "total frequency", hidden: false }` is not merely acceptable but necessary. `getCaseValues(iDatasetName, iCollectionName, searchFormula?)` (`:196`) issues `caseFormulaSearch[true]` and strips `parent` and `collections` from each case while keeping `id` and `values`, which is what the backfill reads. Both have the `.catch()`-then-read-`success` shape I13 and I19 recorded.
- **`kFeatureTypeUnigram` and `kTokenTypeUnigram` are both the literal `'unigram'`** (`store_types_and_constants.ts:193,296`), and unigram cases are created with `type: 'unigram'` (`domain_store.ts:360`). So `syncUnigramsInFeaturesDataset()`'s `caseFormulaSearch[type='${kFeatureTypeUnigram}']`, section 5's fan-out, and J4's `token.type === kTokenTypeUnigram` store filter all select the same set despite being written against two different constants.
- **`private migration?: Promise<void>` on `DomainStore` is safe under this repo's compiler settings, which is not obvious.** `tsconfig.json` sets `useDefineForClassFields: true`, so a declared-but-uninitialised field is defined as an own property before the constructor body runs, and `makeAutoObservable(this)` (`domain_store.ts:34`) therefore annotates `migration` as observable. That is harmless: mobx's deep enhancer converts plain objects, arrays, Maps and Sets, and returns a `Promise` untouched, and nothing observes the field, so the `this.migration = undefined` inside I19's `catch` produces no strict-mode warning either. Worth recording because "mobx made my promise observable" is a real failure mode elsewhere and someone will wonder.
- **`getNewToken()` spreads `...initialValues` last** (`store_types_and_constants.ts:311-325`), after both `color: initialValues.color ?? kNoColor` and the hardcoded `highlight: true`, so section 2's claim that it already accepts an override is right for both fields.

### Delta pass, over what the fourth pass itself changed

Run 2026-08-06 immediately after applying K1 to K6, scoped to the roughly 230 lines those six added rather than to the document again, on the grounds that new prescriptions are the text no pass has reviewed. Four findings, all applied. One of them corrects the fourth pass's own measurements.

#### RESOLVED: L0. Two of the three stylesheets in K1's reproduction were never applied, and the numbers were wrong

**Corrected 2026-08-06, conclusion unchanged.** K1 reported its measurements as taken "against `light.compact.css`, `storyq.scss` and `feature_list_item.scss` unmodified". Only the first was. The reproduction was served over `python3 -m http.server`, which types `.scss` as `application/octet-stream`, and a browser will not apply a stylesheet served with that type. So two of the three `<link>` elements did nothing, and the numbers were taken against a layout the plugin does not have.

Re-run with the two files copied to `.css` so they are typed `text/css`, and with the application confirmed rather than assumed (`.feature-list-item` computing to 400 px wide with a `#177991` border, both scroll containers computing `overflow-y: auto`): the offset is **38 px, not 33**, and a feature row is **38 px tall, not 44**. K1's table and prose now carry those figures. The finding is unaffected and its statement is cleaner than before, since the picker lands exactly one row too low rather than three quarters of one.

This is worth recording rather than quietly fixing, for the reason the Technical Notes already give about source readings at `f3d41932d`: an experiment can be run correctly and still measure the wrong thing, and the tell here was cheap to check and was not checked. Assert that the fixture is what you think it is before reading numbers off it.

#### RESOLVED: L1. A `kNoColor` row renders white, not transparent, and after this story white means "highlighting is off"

**Applied 2026-08-06.** Found while checking whether K4's prescribed expression handled `kNoColor` correctly on the Training tab, which it did not, for a reason neither spec had right.

Both specs say a `kNoColor` row renders transparent. The resolved question in `requirements.md` derives it from the browser rejecting the assignment, and section 7a leans on it for its reassurance that the restore window "is not a regression, since the row renders transparent today and would render transparent then". The row is not a bare element: `.feature-list-item` sets `background-color: white` (`feature_list_item.scss:3`), so dropping the invalid inline declaration falls back to the class rule. Measured with the stylesheet genuinely applied, a row carrying `style="background-color: NO_COLOR"` and a row carrying no inline background both compute to `rgb(255, 255, 255)`, which is requirement 11's highlighting-off pill exactly.

Today that is a cosmetic oddity, which is why it survived two specs and four review passes. After this story it is a false statement about state: a pre-change document's ngram row claims its highlighting is off, for the roughly 700 ms before the migration repairs the colour and for the entire session if I19's swallowed failure means it never does. The guard that looks safest, emitting no `backgroundColor` for `kNoColor`, reproduces it precisely.

Section 7a now maps `kNoColor` to `ngramColor` in that expression instead, so the transient render matches the post-migration render and white keeps one meaning; `requirements.md`'s resolved question is corrected, with the mechanism, since the wrong version was quoted in two places. The decision that question reached is unaffected and slightly better supported: the collision with the design's white is exact rather than approximate.

#### RESOLVED: L2. The `focusout` route K5 added closes the picker on the first arrow key

**Applied 2026-08-06.** K5 prescribed a `focusout` handler that closes "when `event.relatedTarget` is neither inside the popover nor the colour button" and did not say why both halves of that condition are there. `focusout` fires on the popover every time focus moves **between** swatches, which requirement 19's roving tabindex does on every arrow press, so the handler without its first condition closes the picker the moment a keyboard user tries to move within it. Confirmed in a browser: moving focus from one swatch to the next fired `focusout` on the container with `relatedTarget` set to the incoming swatch. Section 7b now says so, and gives the button half its reason too, which is that Escape moves focus to the colour button and would otherwise re-enter the handler after the picker has already closed.

#### RESOLVED: L3. The portal K1 added breaks the outside-click handler's containment test, and the button's popup semantics

**Applied 2026-08-06.** Two consequences of the portal that section 7b was written before, both in the same area.

The outside-click handler ignores "events inside the popover and inside the button", which was a containment test against the row while the popover lived there. Portalled to `document.body` the popover is no longer a DOM descendant of the row, so a check written that way treats every click on a swatch as an outside click and closes the picker before `onChoose` can fire. The test has to use a ref on the popover element itself. The mirror image applies to React's synthetic events, which still bubble from portal children through the React **tree**, so a handler on the row or on section 7a's new wrapper would see clicks that landed in the popover.

Separately, the colour button carries `aria-expanded` and nothing else. Once the popover is portalled, `aria-expanded` is the only remaining relationship between the two elements, and it says something opens without saying what. Section 7b now adds `aria-haspopup="listbox"` and an `aria-controls` and `id` pair.

### Checked and sound, delta pass

- **A portal to `document.body` is outside every transformed subtree.** `html` and `body` both compute `transform: none`, `filter: none`, `perspective: none`, `will-change: auto` and `contain: none`, so nothing above `#root` reintroduces K1's containing block. Worth confirming rather than assuming, since the whole of K1's remedy rests on it.
- **`position: fixed` is still not clipped by the scroll containers with the stylesheets genuinely applied.** Re-checked after L0, with `.sq-container` and `.sq-feature-panel` both computing `overflow-y: auto` and `.feature-list-item` at its real 400 px: with the scroll box shortened to 160 px, an untransformed picker hit-tested as visible 20 px and 55 px below the box's bottom edge, and the transformed one hit-tested as visible everywhere the 38 px offset had moved it to. Both of the fourth pass's browser-derived "checked and sound" notes were reached with those two stylesheets inert, so both were worth running again; neither answer changed.


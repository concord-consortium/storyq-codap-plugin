# Resume an Interrupted Training Run When a Document Is Reopened

**Jira**: https://concord-consortium.atlassian.net/browse/STORYQ-87

**Status**: **Closed**

## Overview

A CODAP document saved while a StoryQ model is training used to reopen with the run abandoned: the pane said it could not be picked up, Step was disabled, and the student's only route forward was Cancel and retrain from scratch. This story restores the run instead, by rebuilding the encoded training data and replaying the gradient descent up to the saved iteration, so Step advances from where the student left off and a plain run finishes on its own.

For a student working across two class periods, or one whose session is interrupted, the work no longer disappears. A run stopped mid-step resumes at the iteration it was saved at; a plain run resumes and completes on its own so the results are waiting when the student returns to the page. The "cannot be picked up" message stays, but only for the cases where resuming genuinely is not possible, chiefly when the features or the target data changed while the document was closed. Nothing about the training algorithm, its settings, or its results changed.

This follows [STORYQ-86](https://concord-consortium.atlassian.net/browse/STORYQ-86) (PR #75), which made a reopened document's buttons work again and told the student an interrupted run could not be picked up. This story picks it up instead.

### The chosen approach: replay to the saved iteration

A training run lives in two places, and only one is saved with the document. Saved (`AIModel.asJSON`): `beingConstructed`, `frequencyThreshold`, `ignoreStopWords`, `iteration`, `iterations`, `lockInterceptAtZero`, `name`, `trainingInProgress`, `trainingInStepMode`, `trainingIsComplete`, `usePoint5AsProbThreshold`, and now `trainingRowCount`. Not saved, deliberately: `AIModel.logisticModel`, the live `LogisticRegression` holding `theta`, the encoded data and the loop's callbacks. So a reopened document knows a run was in progress and which iteration it reached, but has no weights, no encoded data and no loop to continue.

The gradient descent is full-batch and seedless (fixed alpha, fixed lambda, no shuffling, no randomness anywhere in `grad()`), so replaying N iterations from zeroed weights reproduces the saved state exactly. Nothing new goes into the saved document except one optional row count. The cost is N gradient passes over the full training data: the same arithmetic the student already sat through, minus the 10 ms `setTimeout` between iterations in a plain run and minus the CODAP write per iteration in a step-mode run. It is quicker than the original run was, but not quick, which is what the restoring message exists for.

Two alternatives were rejected, and are recorded in Decisions: saving `theta` in the document, and reading the weights back out of CODAP.

## Requirements

### Resuming

1. A document saved during a **step-mode** run reopens with the run intact. Step advances it to the next iteration and continues to completion, producing the same weights, accuracy and kappa as the uninterrupted run.
2. A document saved during a **plain (non-step)** run reopens with the run intact and **resumes to completion on its own**. Once it completes, the pane is deliberately **indistinguishable** from one where the student trained the model themselves and walked away: no notice, and no persistent record that a resume happened. That is the chosen option, not an oversight; a student who was on another tab when they saved may never see the restoring message and will simply find a finished model.
3. The restored run is the *same* run, not a new one with the same name: no duplicate entry in the trained-model list, no second set of weight cases, no second set of result cases. Both prep steps create duplicates when re-run against a document whose cases already carry the model name (see Technical Notes), so the resume re-acquires the existing case IDs rather than letting either prep step create new ones.
4. The progress bar, the iteration count, the feature weights in the Features table and the predicted labels in the target dataset all agree with the restored iteration, before and after the student resumes.
5. Replay is silent: no per-iteration CODAP writes, no progress-bar updates, no entry pushed to the trained-model list while catching up.
   - **5a.** While a run is being restored the Training pane says so in its existing prompt area, and clears the message when control returns to the student. That covers the eager validation as well as the catch-up, so the message is on screen from the first render after a document with a run in progress is restored. The progress bar continues to show the saved iteration and is not animated, so it never misrepresents where the run is. The prompt container carries `role="status"`.
   - **5b.** A catch-up runs **asynchronously**, yielding to the browser between iterations, so the plugin stays responsive. This is the existing behavior of the fit loop when `trace` is false; it costs 10 ms per iteration, under 3% of the gradient work on the reference corpus.
   - **5c.** Step and Cancel are both disabled **for as long as a run is being restored**, which is the eager validation and the gradient replay together, beginning at the **first render after the document is restored**. The validation half is not caution: a Cancel taken in that window returns the pane to "+ New Model" *and* lets the resume complete behind it, writing weights and predicted labels back over the cases Cancel had just blanked, stamped with the emptied model name, leaving a nameless 100.0%-accuracy row in the trained-model table. Step in that window is enabled, calls into a run with no continuation, and does nothing.
   - **5cc.** A run being restored is a state the pane can always leave. Every route out clears it: validation succeeding in step mode, the replay handing back, validation refusing, and anything in the restore path throwing. **The replay owns its own failure**, because in step mode its caller is the pane's Step handler, where a throw would become an unhandled rejection with both controls already disabled.
   - **5d.** A catch-up that is itself interrupted leaves the **training** state unchanged, so the next open resumes from the same iteration. A silent replay never advances `model.iteration`. One field is exempt, and only for a document that predates this story: the row count is re-recorded before the catch-up starts. The document is not byte-identical and is not meant to be, since a resume that got as far as a catch-up has already committed its rebuild.
   - **5e.** The end of a catch-up is **signalled by a watcher**, not polled for and not inferred. `fit()` returns before the first iteration's work is visible, so with `progressCallback` detached the loop would finish with nothing notified. The watcher is installed as `progressCallback` for the duration of the catch-up only; `stepModeCallback` stays detached. Attaching it changes the resulting weights not at all (measured bit for bit).
   - **5f.** The `role="status"` goes on the prompt container in **every** branch, not on a new catch-up branch, so the live region exists from mount and the message is a content change inside an established region. `modelTrainerInstructions()` returns a `div` from each branch at the same position and React reconciles them to one DOM node, so a role added on a branch would be registered in the same commit as the text it announces, which is the one arrangement screen readers do not announce.
   - **5g.** The announcement reaches the student only while the Training tab is selected. `TabPanelTabContent` sets `aria-hidden` on every unselected tab and the Training pane renders eagerly inside it, so a live region there announces nothing. Recorded as an accepted limit; hiding an inactive tab panel from assistive technology is correct.
   - **5h.** The restoring message is announced everywhere except at document open, and that exception is accepted: on a reopened document the live region enters the accessibility tree already holding the message, and a live region does not announce content that was there when it was registered. Every other announcement survives, because each is a genuine change inside an existing region.
6. Cancel on a restored run clears the same data Cancel on a live run clears. The restore path re-acquires `featureStore.featureWeightCaseIDs` and `trainingStore.resultCaseIDs` whenever the restored model says `trainingInProgress`, **whether or not the run turns out to be resumable**, since the fallback is the path that tells the student to press Cancel.
   - **6a.** Result case IDs are re-acquired as the **last child of each target case**, in the order of the target case list the resume captured, because `showPredictedLabels` pairs them positionally. Selecting by the restored model's name does not work: a plain interrupted run has never written a name onto its result cases.
   - **6b.** Weight case IDs are re-acquired by **searching the weights collection for the restored model's name**, mapped back to token names through each case's `parent`. That name is written by `prepWeightsCollection` before any fitting starts, so it is present for a plain interrupted run as well as a step-mode one. The existing `getFeatureWeightCaseIDs` helper reads the features collection by index, which is right only for the first model a document ever had.
   - **6bb.** The attribute is named `model name`, with a space, so the formula must backquote it: `caseFormulaSearch[model name=='Model C']` comes back `success: false` against a real document, while ``caseFormulaSearch[`model name`=='Model C']`` returns the run's cases. The model name is student-typed, so it also needs backslash-escaping of backslashes and apostrophes.
   - **6c.** An ambiguous weights re-acquisition **refuses the resume** rather than guessing. This costs a resume in a case the plugin cannot identify, and buys the guarantee that a resume never writes weights over a completed model's. The check runs against the **saved** token set, so it can run before the rebuild.
   - **6cc.** That count is a count of the *visible* weight cases. An inactive model's weight cases are set aside by `syncWeightsAndResultsWithActiveModels`, and a set-aside case does not come back from a `caseFormulaSearch`. This does not weaken 6c for the run it guards, since an interrupted run is never in `trainingResults` and nothing sets its weight cases aside.
7. Resuming changes nothing about the training algorithm, its hyperparameters, or its results.

### Leaving a fresh run alone

- **7a.** Nothing about a fresh training run changes, with three stated exceptions: a fresh run records the row count it is fitting (nothing else can ever write it); a fresh run gains screen reader announcements it did not make before, because `role="status"` is on a shared prompt container; and a live step-mode run's between-steps prompt is reworded from "You can start training your model." to "You can continue training your model."
- **7b.** Concretely this constrained the implementation in seven places:
  - `fit()` gains its starting iteration and starting theta as **optional** parameters, so `fit(data)` behaves exactly as before. Those two parameters are the whole of the change to `fit`: a resume is two calls to the same function, a silent catch-up from zero and then a handback with the real callbacks restored. `fit` gains no return value and no promise.
  - `buildModel` gains a resume variant rather than a branch a fresh run passes through, and that variant takes its target cases as a parameter.
  - `prepWeightsCollection` and `prepResultsCollection` keep their existing create-versus-update logic untouched for a fresh run.
  - The Training pane's new state is a branch off the restored-run case only.
  - `FeatureStore` gains `snapshotTokens()` and `restoreTokens()`, called only from the resume path.
  - Both `buildModel` and the resume variant record the row count they are fitting.
  - **The shared encoding writes nothing to the `AIModel`, and one existing line had to move for that to be true.** `buildModel` called `setIgnoreStopWords` from the middle of the shared code, so lifting the encoding out without lifting that call would leave the *validation* rebuild writing `ignoreStopWords` into a restored model it is about to refuse, which `restoreTokens` does not undo.
  - **The session state the resume adds is cleared wherever the existing flag is cleared**, which is `buildModel` and `cancel()`. Without that, a student who reopens a step-mode run, presses Cancel and then trains a new model carries a stale pending-resume flag into the fresh run, where the Train button's `nextStep()` fires a catch-up on top of the fit loop that has just started.
- **7c / 7d.** Two pre-change golden baselines guard 7a, captured from the head of master before any of this landed: [`src/test/fixtures/golden-weights.json`](../src/test/fixtures/golden-weights.json) for `fit`, and [`src/test/fixtures/golden-fresh-run.json`](../src/test/fixtures/golden-fresh-run.json) for everything around it (the rebuilt `tokenArray` with its ordering and counts, the encoded matrix, which branch each prep step took, the resulting case-ID maps, and the shape of all 31 CODAP requests).
- **7dd.** Both baselines reproduce bit-identically against the changed code, and both were mutation-tested. Four deliberate regressions were introduced; three are caught (the shared encoder reading the unsafe field instead of its parameter, the prep steps reordered, `fit`'s starting iteration defaulting to 1). **One is not**: moving `setIgnoreStopWords` back inside the shared encoder, because on a fresh run the assignment happens either way and lands on the same value. The refused-resume assertion is what catches that one, which means the guard on that line lives in a different test from the code.
- **7e.** The fresh-run baseline has a trap that applies to any test written against a fresh run: `buildModel`'s `oneHot` call takes the branch that only adds constructed-feature tokens, so the unigrams have to already be in `tokenMap` from ngram extraction. A test that skips that seeding silently fits a **one-column** model and will pass against almost any regression.

### The fallback

8. Where the run cannot be resumed the student is told, rather than being left with a Step that silently does nothing. The STORYQ-86 message and disabled Step become the fallback rather than the rule.
9. **Six independent conditions refuse a resume**, each checked separately rather than as a special case of the others, and everything that does not need the expensive rebuild is checked before it:
   1. the rebuilt token set differs from the one recorded in the restored `tokenMap`;
   2. the current target case count differs from the saved row count;
   3. the weight cases cannot be identified unambiguously (6c);
   4. the restored `tokenMap` is empty (it records no column set at all, so there is nothing for the token-set check to compare against);
   5. there are no target cases to fit (the encoding is one row per target case, and `fit` reads `data[0].length` on its first line); reachable only for a document that predates the row count, and it does not need rows to have been deleted, since a target dataset renamed or removed while the document was closed arrives here on a successful round trip;
   6. a constructed token in the restored map no longer corresponds to a live feature. This is the one the first condition does not subsume: a constructed token stays in `tokenMap` when its feature is unchosen or deleted, because `toggleChosenFor` sweeps tokens only for the unigram feature and `deleteFeature`'s non-unigram branch never calls `deleteToken`. So the token set is unchanged while the column it encodes has gone to all zeros, and the resume would silently fit a different training set. The condition is that every constructed token still names either a chosen feature or a target column feature; the second half is not optional, because target column features have constructed tokens with no `Feature` object of their own.
   - **9e.** The token-set check **cannot see an edit to the text of an existing row**, and requirement 9 claims no more than it delivers. The unigrams come from the restored `tokenMap` rather than from the current texts, so a word introduced by an edit never enters the column set, and the row count does not catch it either. What requirement 9 covers is a changed *feature* set, a re-extraction, and a changed row count. Closing the text-edit gap would mean saving a signature of the texts and a hashing pass in code every fresh run executes; weighed and not taken.
   - **9a.** The saved column set and ordering come from the restored `tokenMap`, captured before any rebuild touches it. One new **optional** field, `trainingRowCount`, closes the case `tokenMap` alone cannot see. Documents saved before this story do not carry it, and for those the token-set comparison stands alone. The field is present-and-undefined in `defaultModel` and assigned unconditionally by `import`, so `reset()` clears it. The row count and the rebuild both read a target case list the resume captured itself, never `targetStore.targetCases`.
   - **9b.** Where the rebuilt token set matches, the saved ordering is re-imposed on the rebuilt `tokenArray`, on the columns of the encoded data, **and on the `index` values in `tokenMap` itself**. The third is not tidiness: without it a resume commits the *rebuild's* ordering, so a document interrupted a second time re-imposes that rather than the original run's. Best-effort: `getNewToken` defaults `index` to `-1`, and a map of all `-1`s sorts into insertion order, so the saved ordering counts as usable only when every restored token carries a distinct, non-negative `index`. Ordering is never a reason to refuse a resume.
   - **9c.** An interrupted document saved by the current build **must** resume. This is the acceptance test in practice.
   - **9d.** If the restore itself fails, the run falls to the fallback and says so. A resume is sequenced behind the promise `domainStore.fromJSON` returns, and that promise can reject.
10. `TrainingStore.trainingWasInterrupted` changes meaning from "a run was interrupted" to "a run could not be resumed", and is set only after a resume has been attempted and rejected. It stays session state and stays out of `asJSON()`.
    - **10a.** The flag is renamed to `trainingCouldNotBeResumed`, along with the local the pane derives from it and both of their comments. Left alone, `disabled={tDisabled || trainingWasInterrupted || isRestoringRun}` would put the old meaning and the new one side by side in one expression.
    - **10b.** A resume is attempted at most once per restored run, and a restore arriving while one is in flight is ignored. **"While one is in flight" is the operative half.** A guard that latched for the life of the plugin instance would leave a second restored document showing the restoring message with Step and Cancel disabled and no route to either.
11. Message wording stays as STORYQ-86 wrote it unless the narrower meaning makes it inaccurate.
    - **11a.** Two messages are new: "Restoring \<model name\> to where it left off…" and its hint, "This training run is being restored to where it left off. It will be ready in a moment." One is reworded: the between-steps prompt, from "You can start training your model." to "You can continue training your model." That branch is conditioned on a run being in progress in step mode, so a named model that has not been trained still reads "start". The plain-run case is left alone: "continue" is no truer there than "start", and there is no control it could be inviting.

### Testing

Run the suite with `npx jest`, which is what the `test` script does. Before this story: 16 suites, 106 tests. After: 20 suites, 182 tests.

`react-scripts test` is not green, and the difference is a path rather than a configuration subtlety. `jest.config.js` sets `setupFilesAfterEnv: ['@testing-library/jest-dom']` directly; CRA instead resolves its own setup file at `src/setupTests` and passes an **empty** `setupFilesAfterEnv` when it finds none. This repo's file is at `src/test/setupTest.ts`, the wrong directory and singular, so CRA registers no matchers and 22 tests fail on `toBeInTheDocument is not a function`. Moving it to `src/setupTests.ts` would make both runners work; it belongs to whoever wants it, not to this story.

Tests cover: the full round trip (save mid-run, restore, resume, complete, matching the uninterrupted run); the fallback path; no duplicated weight cases, result cases or list entries, **against a document that already holds one completed model**, because a document with a single model cannot tell a correct re-acquisition from a wrong one; the two rejection conditions the token set cannot reach; the optional row count on both the read and the write; the restoring message and the disabled window, including what that disabling prevents; the `role="status"` invariant walked one branch at a time (a before-and-after test on one transition is the weaker guard, and vacuous if its "before" state already had the role); the iteration off-by-one; Cancel after a refused resume, **asserting the IDs in the requests rather than only that they are non-empty**; the token maps after a refusal, whose expected value must be a deep copy taken before the rebuild; and the ordering writeback across four successive opens, **on a corpus that actually drifts**, or the test passes with the writeback removed.

They **wait on the observable end state** rather than awaiting a promise: nothing in the completion path is awaitable.

## Technical Notes

This section is the landmine map for the next person in this code. Several of these are not apparent from the source.

### The iteration off-by-one

`oneIteration(i)` applies gradient step *i+1* and *then* calls `progressCallback(i)`, which is what sets `model.iteration`. So a saved `iteration` of N means **N+1 gradient steps have been applied**, and a replay must apply N+1 steps to reproduce the saved theta, then continue from loop index N+1.

**The one exception is the terminal call**: the `else` branch runs at loop index `iterations`, builds `fitResult`, and calls `progressCallback(iterations)`, so a completed run ends with `iteration === iterations` after only `iterations` gradient steps. A document *can* be saved in that state, because `progressBar` sets the iteration synchronously and then awaits seconds of CODAP work before `reset()` clears `trainingInProgress`, and CODAP answers `get interactiveState` throughout. A replay must therefore clamp at `iterations` rather than taking `saved + 1` at face value; unclamped, it runs one gradient step the original run never ran, which at alpha 1 moves every weight by a few percent rather than by a rounding step. Getting this wrong by one is invisible in the UI and shows up only as weights that do not match an uninterrupted run.

The same window has a second consequence: the trained-model entry is pushed partway through that tail, so a save after that point carries the finished entry *and* a run that still says it is in progress. The completion path therefore records its entry by name, replacing any entry already under that name, rather than pushing unconditionally.

### There is no promise that means "the run finished"

`ModelManager.progressBar` is an `async` method whose entire body is `runInAction(async () => { ... })`, with the inner promise neither returned nor awaited. `runInAction` only wraps the synchronous prefix of an async function, so `await this.progressCallback(i)` inside `oneIteration` resolves as soon as the inner function reaches its first `await`. Traced: `progress-enter-0, progress-return-0, fit-returned, progress-after-await-0, step-0, …`. `fit()` returns during iteration 0, and at the end of a run the completion work (`computeResults`, the `trainingResults` push, `syncWeightsAndResultsWithActiveModels`, `recreateUsagesAndFeatureIDs`, `tModel.reset()`) runs unobserved by anything that could wait for it. Accuracy and kappa are set inside that region too.

Nothing in the product needs a completion promise. Only the tests do, which is why they wait on the end state. Recorded so that nobody hunts for a promise that does not exist and concludes they have wired the resume up wrongly.

### Duplicate CODAP cases on resume

Both prep steps assume they are starting a fresh run, and both misbehave when re-run against a document where the model name is already stamped:

- `prepWeightsCollection` decides between updating and creating with `allFirstWeightCasesAreEmpty()`. On a resumed run those names are already set, so it takes the **create** branch and adds a second weight case per token.
- `prepResultsCollection` finds the results collection already exists, so it takes the **else** branch and creates a new child case under every target parent case.

**`featureWeightCaseIDs` does not always hold the same kind of id**, which is why the resume does not reuse the existing helper. `prepWeightsCollection` fills it from whichever branch it takes: the update branch stores *features-collection parent* IDs, the create branch stores *weights-collection child* IDs. The first model's update works only because a parent case and its single child share an item, so a write addressed to the parent lands on the child; a second model adds a second child and that coincidence is gone. Nothing fails loudly, because CODAP resolves case updates by id and attributes by name across the whole dataset.

**One piece of pre-existing uncertainty is deliberately not resolved.** The create branch parents its new cases with `parent: aToken.featureCaseID || 0`, and `domain_store.ts:346` says in a comment that it does not know whether that id is the feature case or its first child. Measured against CODAP v3.1.0 it *is* the feature case id, resolved in the favorable direction, but this story does not build on it: an ambiguous re-acquisition refuses rather than assumes.

The results collection **accumulates**: one child per target case per model. Measured with five target cases, model A leaves five result cases and an interrupted model B leaves ten, of which only the second five are B's. `showPredictedLabels` pairs them positionally and `cancel()` maps the same array, so an unfiltered re-acquisition would write B's labels into, and Cancel would blank, cases belonging to a model the student has already finished.

**As it happens, results are never actually set aside, and weights are.** `syncWeightsAndResultsWithActiveModels` builds its set-aside messages in `trainingResults.forEach(async …)`; the weights half is synchronous and lands in the batch, while the results half awaits a search first, by which time the batched `sendRequest` has already fired. Measured on a three-model document: the inactive model's 30 weight cases were gone, its 500 result cases were still there with its name on them. Pre-existing, and wants its own ticket.

Both collections are session state, deliberately excluded from the snapshots. That single fact is the root of two separate problems, which is why the re-acquisition belongs **before** the resumable-or-not branch: requirement 3 needs the IDs so the prep steps update instead of duplicating, and requirement 6 needs them so Cancel has something to wipe.

### What an interrupted run has actually written

`computeResults` is the only thing that writes weights and predicted labels, and it is reached from `stepModeCallback` (attached only in step mode) and from `progressBar`'s completion branch. So a plain run writes nothing per iteration at all.

| | weight cases | result cases |
|---|---|---|
| interrupted in step mode | model name **and** weights | model name, predicted label, probability |
| interrupted in a plain run | model name, **no weights** | created, and **entirely blank** |

Confirmed against a real interrupted document. Three consequences: requirement 4 is satisfied vacuously for a plain run, since the student would have seen nothing at that iteration either; Cancel has only the stamped model name to clear on a plain run, which is still worth clearing since that name is what the Features table shows; and selecting result cases by model name cannot work as a general mechanism.

### Cancel wiped nothing on a reopened document

`cancel()` builds its two update requests from `featureWeightCaseIDs` and `resultCaseIDs`. After a reopen both were empty, so both requests carried an empty `values` array and CODAP was asked to update nothing, while `reset()` still ran. The pane returned to "+ New Model" while the Features table kept the abandoned model's name and weights. Pre-existing: STORYQ-86 shipped the "Press Cancel to start over" message without the case IDs that would make it true. This story is where it became load-bearing.

### Rebuilding the encoded data is not idempotent

`oneHot` mutates `featureStore.tokenMap` as a side effect: on `buildModel`'s path it increments `count` on every constructed-feature token once per document containing it, sorts by `count` descending, truncates at the frequency threshold and at `kMaxTokens = 1000`, and deletes the tokens that fall off. Since `tokenMap` **is** saved with the document, a rebuild on resume starts from counts already inflated by the original run and inflates them again. Measured across five successive opens, a constructed feature's `count` went 12, 18, 24, 30, 36.

- **Ordering drift** is nearly harmless on its own: full-batch logistic gradient descent is equivariant under column permutation, and the residue measured at `2.2e-16`. Re-imposing the saved order removes even that. But the drift is not always rounding-level: a constructed token can climb the sort past a unigram and reorder the columns materially.
- **Membership drift is not harmless.** If a rising count pushes a token across the frequency threshold or past the `kMaxTokens` cut, the rebuilt column set genuinely differs, and the fallback catches it.

### Stale indexes, a second and sharper hazard

Dropping out of `tokenArray` does not remove a token from `tokenMap`, and the index it keeps is then used. `oneHot` deletes only tokens left at `index === -1`, which on a first run means everything below the cut; a token restored from a document already carries a real index, so a truncating rebuild leaves the dropped tokens pointing at positions that now belong to other tokens. The vector builder guards only against `index >= kVectorLength`, so any stale index inside the vector sets somebody else's bit. Built and run, with a restored map of `aaa@0 bbb@1 ccc@2 ddd@3`, a document of just `ddd` encoded as `[1,0,0,1]`: it is encoded as containing a word it does not contain, and nothing throws.

The refusal catches this for the resume itself, since the sets differ. What outlives the refusal is the mutated map, because `asJSON()` serializes the live `tokenMap` and the next **fresh** run reads it. Hence the snapshot pair.

### Where resume is triggered

`storyq.tsx` restores through `restorePluginFromStore`, which calls `domainStore.fromJSON(...)` and then `await targetStore.updateFromCODAP()`.

**`fromJSON` is `async`, and it is not awaited.** Its first four statements are synchronous and do complete, so a resume attempted after the `updateFromCODAP` await sees a fully restored `trainingStore`. But the restore has not finished: `fromJSON` goes on to await `guaranteeFeaturesDataset()`, which for a document that already has a Features dataset runs a migration sweeping every feature case, still in flight against the very dataset a resume is about to read weight case IDs from. So a resume is sequenced behind **both** awaits, with the promise captured rather than awaited inline, so that ordinary document opens are not serialized:

```
const restored = domainStore.fromJSON(iStorage.domainStore);
await targetStore.updateFromCODAP();
await restored;          // only on the path where a resume is going to be attempted
```

`fromJSON` can also reject, and today nothing observes that.

**How often the restore fires.** `restorePluginFromStore` is wired up twice: as the `'update' 'interactiveState'` handler, and as the callback `codapInterface.init` invokes with the saved state. Searching CODAP itself, the only `interactiveState` traffic in v2's data-interactive layer is `requestDataInteractiveState` sending a `get`; v3's single occurrence is the same `get` inside `prepareSnapshot` (with an explicit TODO where it eventually would send an update). So neither codebase ever sends an `update` for the resource, and a restore is delivered exactly once per plugin load. The at-most-once guard is therefore **defensive**, recorded so nobody removes it believing it guards a path CODAP exercises, and so nobody writes a test asserting behavior on a path that may not exist.

**`updateFromCODAP` is not the only thing that writes `targetCases`, and the other writer holds a filtered subset.** `updateTargetCases(formula)` assigns the field from a filtered search, and `updateNonNtigramFeaturesDataset` calls it once per chosen non-ngram feature inside a `Promise.all`, so the field is left holding whichever feature's subset resolved last. `target_store.ts` already says so in a one-line comment. This fires on every document open, unawaited, whatever tab was saved as selected. Sequencing cannot fix it, so the resume captures its own list and never reads the field.

### What a replay must suppress

`progressBar` is not just a progress indicator: at `iIteration >= iterations` it calls `computeResults`, pushes the trained-model entry, syncs the CODAP datasets and calls `reset()`. Running a replay with the real callback attached would finalize the model partway through catching up. `stepModeCallback` likewise awaits `computeResults`, a CODAP round trip per iteration.

- **The progress callback is replaced rather than removed.** Detaching it outright leaves nothing to sequence the handback behind. A silent watcher is bit-for-bit identical to attaching nothing (measured, both synchronous and asynchronous shapes). Polling `fitResult` on a timer is strictly worse: it needs a timer the story does not otherwise need and notices the end 10 to 103 ms late, which is dead time with Step and Cancel disabled for no reason. Giving `fit` a promise was rejected because threading a resolver through the `setTimeout` chain is a change to code every fresh run executes.
- **`trace` false is not optional.** `oneIteration`'s trace branch continues the loop solely through `stepModeCallback`, so detaching that callback while `trace` is true, which is the state a step-mode run is already in, applies **one** gradient step and stops. Nothing throws and nothing logs; the first sign is weights that do not match.
- **Clear `fitResult` before handing back.** A catch-up reaches `fit`'s terminal `else` branch, which builds a completed-run record for a run that has not completed, and `fillOutCurrentStoredModel` reads `fitResult?.theta` without checking.
- **Truncate `iterations` on the logistic model only.** Applying it to the `AIModel` would make the progress bar read 88% where the run is at 35%, because the pane computes the percentage from the `AIModel`.

### Verified behavior

Established by running the real `oneHot`, `LogisticRegression`, `AIModel`, `ModelManager` and `TrainingPane` code rather than by reading it, and the CODAP findings by driving the real plugin against a real document.

1. **The saved `tokenMap` is the saved run's column set and ordering.** After `oneHot` the map holds exactly the tokens in `tokenArray`, each with its positional `index`, because every token left at `-1` is deleted; both `index` and `count` survive the round trip into the document. This holds for a run whose tokens all started at `-1`, which is the run that saved the document. It does **not** hold for a rebuild.
2. **Replay is bit-for-bit.** Two 12-iteration runs over 200 rows by 30 columns produced byte-identical `theta`.
3. **Column ordering drift costs one ULP** in the equivariant case: maximum absolute difference `2.2e-16` after un-permuting.
4. **The non-idempotency is real.** A round trip took a constructed feature's `count` from 2 to 4 and moved it from index 1 to index 0.
5. **Stale tokens survive and reappear as columns.** A token that no longer occurs anywhere stayed in `tokenMap` with its old index and reappeared in the rebuilt `tokenArray`. The column set is driven by `tokenMap`, not by the current documents, so *removing* target data does not shrink it. This is why the token-set comparison alone cannot see a deleted target case.
6. **What makes the fit loop synchronous is `trace`, not `progressCallback` alone.** For a fit asked for 8 iterations: `trace` true with a continuing `stepModeCallback` runs all 8 synchronously; `trace` true with the step callback detached applies **1** and stops silently, never setting `fitResult`; `trace` false runs all 8 asynchronously through the 10 ms `setTimeout`, whether or not a progress callback is attached.
7. **A restored plain run renders Cancel and nothing else.** `trainButton` is suppressed because a run is in progress, and `stepButton`'s condition is false. This is why the plain-run auto-resume is not a preference: there is no button a student could press.
8. **Replay cost is quadratic in the token count.** `grad()` calls `h()`, an O(dim) dot product, inside the loop over `d`, so each iteration costs O(dim² · N). Measured per iteration: 5.4 ms at 100 rows by 100 tokens, 157 ms at 500 by 500, 321 ms at 1000 by 500, 1122 ms at 1000 by 1000.
9. **The whole resume sequence was prototyped and reproduces an uninterrupted run exactly**, over the real fit loop: 8 gradient steps applied by the time the document was saved at iteration 7, 8 applied by the catch-up, identical theta, 3 ms of thread blocked, `stepModeContinueCallback` set after the handback, and identical final theta, cost and constant term.
10. **The rebuild half reproduces the interrupted run's matrix and weights exactly, and only because of the ordering writeback.** Driven over the real `oneHot` on a corpus chosen so the drift is real (a constructed feature's count went 8 to 12 and it rose from column 14 to column 9): the rebuilt matrix is **not** identical without re-imposing the ordering, and is byte-identical with it; four successive open-rebuild-commit cycles encode identically **only** with the `tokenMap` writeback.
11. **Both re-acquisitions were run against a real CODAP document and both are exactly right.** A three-model document built by hand in CODAP v3.1.0: every case from `caseFormulaSearch` carries its `parent`; a parent's children come back in creation order; the last-child rule reproduced the live `resultCaseIDs` exactly, all 500, zero mismatches; the weight search fails with the attribute name bare and returns 30 cases backquoted; every weight case's `parent` resolved to a feature case, 30 of 30; and an apostrophe in the model name matched when backslash-escaped.
12. **A set-aside case is invisible to `caseFormulaSearch`, and inactive models get set aside.** The same document returned 60 weight cases where three models had written 90; a `restoreSetasides` notification brought the missing 30 back.
13. **The whole resume was driven through the real `ModelManager` against a mocked CODAP and reproduces an uninterrupted run**: identical weights, accuracy and kappa, one trained-model entry, **zero** `create` requests during the resume, the same cases written with the same values. Four things it settled that the requirements could not: the document construction has to be **shared** rather than reimplemented (the first draft fitted a different training set while every check passed); `getCaseValues` **deletes `parent`** from every case it returns, so the result grouping has to issue its own search; the two-`ModelManager` arrangement works, because the pending-resume state lives on the store; and `featureStore.fromJSON` leaves `caseIdTokenMap` empty.
14. **The plan's own code was run against the real stores and it moved two things it should not have**: `ignoreStopWords` went true to false across a validation rebuild that `restoreTokens` did not undo, so a refused resume altered the document; and a restored `tokenMap` whose tokens all carry the `-1` default sorts to insertion order silently, so "no usable ordering" has to be a test rather than a hope.

Nothing in the fit loop is random: `grad()` is a plain full-batch sum, `alpha` and `lambda` are fixed, and there is no shuffling or sampling. `findThreshold` and `computeKappa` are deterministic given the weights and the data.

## Out of Scope

- Resuming a run whose features or target data changed while the document was closed. That falls to the fallback.
- Any change to the training algorithm, its hyperparameters, or its results.
- Saving `theta` or the token ordering into the document, and reading the weights back out of the Features dataset. The single row count is not a partial adoption of the former: it is one integer for the invalidation check.
- **Fixing `oneHot`'s non-idempotency.** Neither the count inflation nor the stale indexes are repaired. What the story does not do is leave them behind gratuitously: a validation rebuild that refuses restores the token maps it snapshotted, so opening a document never alters it. A rebuild that leads to an actual resume commits its mutation, exactly as an ordinary run does.
- **Stopping a fit loop that is already running.** Cancelling a live run today does not stop it: `logisticModel.reset()` empties `theta` and restores `iterations` to 20, and the in-flight loop carries on against its own captured data, computing gradients into the emptied array and finishing by setting a `fitResult` on a model the student cancelled. Nothing throws, and `reset()` also clears `progressCallback`, so none of it surfaces. This is why Cancel is disabled for the duration of a restore rather than wired to stop the loop, and why the disabling has to cover the validation and not only the replay.
- Keyboard activation of the plugin's `Button` component, a pre-existing WCAG 2.1.1 failure awaiting its own ticket. **`ProgressBar` belongs with it**: it renders two `div`s and a percentage with no `role="progressbar"`, no `aria-valuenow`/`aria-valuemin`/`aria-valuemax` and no accessible name.
- **Making completion awaitable.** A mobx misuse rather than a resume problem, and the repair is in code every fresh run executes.
- **The `targetCases` race for a fresh run.** The resume captures its own case list; the underlying field is not fixed, and a fresh run still reads it.

## Not Yet Implemented

- **`syncWeightsAndResultsWithActiveModels` never sets aside an inactive model's result cases.** A one-line repair (`for … of` with an await), but it changes what a student sees for every model they deactivate, and it is in code no part of this story executes. Wants its own ticket.
- **`src/test/setupTest.ts` is at the wrong path**, which is why `react-scripts test` registers no matchers. Moving it to `src/setupTests.ts` would make both runners work; an unrelated rename cuts against this story's posture of not churning code it does not need to change.
- **Optimizing `LogisticRegression.grad`.** It calls `h(x_i, theta)` inside the loop over `d` though `h` does not depend on `d`, so a gradient pass costs O(dim² · N) rather than O(dim · N). Hoisting it measured **131x faster** at 1000 rows by 1000 tokens and produced bit-for-bit identical weights, cost and constant term. Deliberately not taken here: it makes ordinary training dramatically faster for large corpora, which students see, so it is a product change wanting its own ticket and Jie's sign-off rather than a refactor smuggled into a resume story. This story was designed to be affordable without it. *(Done in STORYQ-88, which also replaced `prepWeightsCollection`'s per-token `itemSearch` with a single one. `golden-weights.json` is what proved the hoist bit-exact against this story's replay, and `golden-fresh-run.json`'s request shape was amended there to record the one search in place of the eleven.)*
- **`prepWeightsCollection` builds an `itemSearch` formula with no quoting or escaping at all.** Surfaced during review; pre-existing. *(No longer reachable from this call site after STORYQ-88, which stopped interpolating token names into the formula, but the pattern remains elsewhere.)*
- **Feature choose/delete controls stay live during an in-progress run**, and `nextStep` never revalidates the cached `_data`. The same exposure exists on master for live step-mode runs; the resume's validation is in fact the only feature-set validation anywhere in the codebase.

## Decisions

### Which of the three approaches?

**Context**: A resume needs the weights the interrupted run had reached, and they are not in the document.

**Options considered**:
- A) **Replay** to the saved iteration from zeroed weights.
- B) **Save `theta`** in the document.
- C) **Read the weights back out of CODAP**, from the Features dataset.

**Decision**: **A, replay.** Chosen by Doug. It adds nothing to the saved document, and the determinism argument makes "the resumed run equals the uninterrupted run" testable rather than aspirational. B is fastest to resume but puts a float array sized by the vocabulary into every saved document, and `theta` is positional, so the token-to-column ordering has to be saved alongside it and validated on the way back in. C looks free, since `computeResults` already writes each token's weight into the Features dataset, but it receives `theta.slice(1)`, so the intercept term is never written during a run and C recovers the wrong model unless `lockInterceptAtZero` is true, which is the default but not guaranteed.

### Does a plain (non-step) run resume by itself, or wait for the student?

**Context**: Resuming on its own means opening a document starts computation the student did not ask for in this session. Waiting means inventing a Resume control, which the design does not have.

**Decision**: **Resume on its own and run to completion.** Jie, on Slack: "We can either (1) let the training process finish or (2) return the state to before training start. For (1), users will see the result of training when they return to that page; For (2), users will see the training didn't start and must press the Train button. I feel that (1) makes a bit more sense, but you can choose whichever is easier to implement since this is an edge case." No Resume control is added. Option (2) is the documented fallback if replay had proved impractical, and it is close to what Cancel already does.

### Is resuming right at all for a student who reopens days later?

**Decision**: **Resume regardless of elapsed time; no staleness cutoff.** Neither of the two behaviors Jie offered is time-dependent, and a run's staleness is not something the plugin can observe: nothing records when the document was saved.

### How does a resume decide the rebuilt run is not the saved run?

**Context**: `buildModel` derives its columns from `chosenFeatures` and `targetCases` at the moment it runs, and the student can edit either while the document is closed.

**Options considered**:
- A) **Save a signature** in `IAIModel`: a hash or joined string of the token names in `tokenArray` order.
- B) **Read the saved column set back out of CODAP**, from the weight cases stamped with the model name.
- C) **Compare the coarse inputs only**, `chosenFeatureNames` plus a target case count.
- D) **Derive the signature from the restored `tokenMap`**, which is already saved with the document.

**Decision**: **D, plus one saved row count.** The saved `tokenMap` *is* the saved run's column set and ordering, exactly, at no cost. So the resume captures the ordered token list from the restored map **before anything rebuilds it**, and compares membership against the rebuilt `tokenArray`. A had nothing to add that D does not already give, at the cost of the document state approach A was chosen to avoid. B gets the same token set less reliably, since it depends on the student not having edited the Features table. C is the weakest.

**The row count is D's one blind spot, and is closed rather than accepted**: deleting a target case removes no token from `tokenMap`, so the column set is unchanged while the matrix has lost a row, and nothing in the document records how many rows the saved run used.

**Sub-decision: the saved ordering is re-imposed, not merely compared, and it is written back.** Four successive open-rebuild-commit cycles over a drifting corpus:

| what the resume re-imposes | encoding identical across four opens | open 1 matches the interrupted run |
|---|---|---|
| the array and the data columns only | **no** | yes |
| the array, the data columns and `tokenMap`'s indexes | **yes** | yes |

Membership, by contrast, was stable in every case tried: constructed features only ever rise in the sort, and one below the threshold was deleted by the original run and re-enters the rebuild at the same low count, so it is cut again. That is why a repeatedly interrupted document is not refused by drift.

### In step mode, does replay run at document open or on the first Step press?

**Context**: A step-mode run's restored state is already fully visible in CODAP, so the pane is correct before any replay happens.

**Options considered**:
- A) **Lazily, on the first Step press.** No work on documents the student opens and never touches, but the invalidation message only surfaces after the student presses.
- B) **Eagerly at document open.** Immediate feedback, but every reopen pays the full replay.
- C) **Eagerly for the invalidation check only**, deferring the gradient replay.

**Decision**: **C, validate eagerly and replay lazily.** The restore path rebuilds the encoded data once, runs the check on it, and keeps it in memory on the logistic model. The rebuild is O(documents × tokens per document), far below one gradient pass, and doing it exactly once also avoids inflating the token counts twice.

**The validation rebuild is undone when the resume is refused**, or opening a document would be a way of altering the document.

**Getting that snapshot right is not obvious, so it goes behind a named pair of methods on `FeatureStore`.** `oneHot` does not mutate the maps, it mutates the **token objects inside them**, so a copy that shares those objects protects nothing:

| how the snapshot was taken | restores the original map? |
|---|---|
| `toJS(featureStore.tokenMap)` | **no**, `colF.count` came back 8 where it should be 4 |
| `{ ...featureStore.tokenMap }` | **no**, the same |
| a deep copy | yes |

`toJS` is the sharper trap, because `asJSON()` already uses it: `tokenMap` is deliberately excluded from `makeAutoObservable`, so it is a plain object and `toJS(tokenMap) === tokenMap` measured **true**. There is a second half: the two maps share their token objects, so deep-copying `tokenMap` and restoring `caseIdTokenMap` separately leaves the id map pointing at the mutated objects and the two maps disagreeing on identity. The correct restore deep-copies `tokenMap` and then **rebuilds** `caseIdTokenMap` from the copied objects.

**The eager phase must stop short of `prepWeightsCollection` and `prepResultsCollection`.** Both write to CODAP, and running them merely because a document was opened would be a side effect of opening.

### What is the replay actually going to cost?

**Context**: The answer could have sent the story to Jie's option (2) instead of resuming at all.

**Decision**: **Measured up front**, against `testing/Ice Cream Reviews.codap3` (500 training texts), on two machines:

| frequency threshold | tokens | full 20-iteration run |
|---|---|---|
| 4, the default | 682 | **5.1 to 7.0 s**, 253 to 349 ms per iteration |
| off | 1000, the `kMaxTokens` cap | **10.4 to 14.4 s**, 521 to 720 ms per iteration |

The token counts reproduced exactly; the timings are machine-dependent and spread about 40%, and student machines are slower than either. **The design has to hold at the top of that range.** Comfortably cheaper than the run the student already sat through, so replay stays the right approach, but far too long to be invisible.

### What does the student see while replay is catching up?

**Options considered**:
- A) **Nothing.** Ruled out by the measurement.
- B) **A blocking indicator** while the catch-up runs.
- C) **Yield periodically and drive the existing progress bar.**
- D) **Fall back to Jie's option (2)** above some cost threshold.
- E) **Run the catch-up asynchronously and show a message.**

**Decision**: **E.** The catch-up does not need to block, which is what B and the original form of this decision assumed. The loop is synchronous in exactly one configuration, `trace` true with an attached `stepModeCallback` that continues immediately. With `trace` false and `progressCallback` detached the loop runs to completion on its own through the 10 ms `setTimeout` that is already there, yielding to the browser between every iteration. The suppression is satisfied by configuration alone, at a cost of about 200 ms on a 20-iteration replay against 6.98 s of gradient work, under 3%.

**The progress bar is still left showing the saved iteration and is still not animated.** That part of the argument against C stands on its own: driving the bar would drop it to 0% and climb back, misrepresenting where the run was when the student left it. D is rejected: "choose whichever is easier, this is an edge case" does not argue for a cost threshold nobody can tune well.

**Retracted implementation note, recorded so nobody reinstates it.** An earlier draft said the resume path had to yield once, an awaited `setTimeout(0)`, so the message would paint before the loop began. Counting rendering opportunities in Chromium: a DOM write then `await setTimeout(0)` gives **0**; a React 18 `setState` then `await setTimeout(0)` gives **0** (DOM committed, never painted); two awaited `requestAnimationFrame`s give 2. A `setTimeout(0)` yields the task but not a frame. Moot under E.

### If an auto-resumed plain run completes, what state should the pane be left in?

**Options considered**: A) nothing extra, the same completion path an uninterrupted run takes; B) a note saying the interrupted run finished; C) leave the finished model active.

**Decision**: **A.** The student lands on a single "+ New Model" button, the prompt "You have trained 1 model…", a reset model, and the finished result in the table with `isActive` true, which is exactly what Jie described. **C turns out to be a no-op**: `inactivateAll()` followed by pushing the result with `isActive: true` already leaves the finished model active. B is rejected as new student-facing copy that Jie would want to word herself, and it would need its own rule for when it clears. A also keeps the completion path byte-identical to an uninterrupted run's, which is the strongest available guarantee.

**Accepted consequence**: under A there is no persistent record anywhere that a resume happened.

### Should auto-resume be suppressed in any context?

**Context**: Opening a document starts computation and writes to the student's CODAP datasets without anyone asking in this session. StoryQ documents are opened in the Activity Player and can be opened by a teacher or researcher looking at a student's work.

**Decision**: **No suppression, and suppression is not available.** Both CODAP codebases were searched for a signal the plugin could use, and there is none: v3's data-interactive layer contains no `readOnly` or `isReadOnly` at all, v2's frame properties concern only reorganization and z-order, and the parent frame's URL is cross-origin so there is no way to infer it. The only way the plugin would learn it cannot write is a failed write after the fact. **If a teacher or researcher view turns out to matter, the blocker is a CODAP feature request, not a StoryQ change.**

### What happens to a document saved mid-run by a version before this story?

**Context**: Jie has a document already saved mid-run, and the point of the story is that it opens and works.

**Decision**: **The row count is optional, and the row check runs only when it is present.** Treating a missing count as unresumable would leave exactly that document broken, which inverts the goal.

**`import` needs no special case for it, and must not be given one.** For a field whose absent state *is* `undefined`, "missing from an old document" and "cleared by `reset()`" are the same value:

| import rule | restoring a pre-story document | after `reset()` | what the next save carries |
|---|---|---|---|
| skip when undefined | absent, correct | **500**, wrong | `{"trainingRowCount":500}` |
| unconditional | absent, correct | absent, correct | the key is dropped |

`JSON.stringify` omits undefined-valued keys, so an unrecorded count leaves the saved shape exactly as it was. `reset()` runs on Cancel, on completion and on "+ New Model", so a skip-when-undefined rule would carry the previous run's count into the document every time.

What an older document cannot catch is target rows *deleted* while it was closed. The consequence is bounded: the run resumes against the current data and completes coherently, it is simply not the fit the interrupted run would have produced. Better than refusing every document that predates the release.

### Findings from self-review that changed the design

Each was verified against running code before being written down. Listed compressed; the mechanism for each is in Technical Notes.

- **The prescribed way to silence the replay stopped it after one iteration.** Detaching both callbacks is safe only in combination with `trace` false.
- **A restored run needs no mechanism beyond `fit`'s two optional parameters**; an earlier reading that it left Step dead was overstated.
- **`domainStore.fromJSON` is asynchronous and is not awaited**, so a resume has to be sequenced behind the promise it returns as well as behind `updateFromCODAP`.
- **`targetStore.targetCases` is overwritten with a filtered subset** by work that fires unawaited on every document open, so the resume captures its own list.
- **Nothing wrote the new row count**, so the check it exists for would never have run.
- **The rebuild can leave a token map that mis-encodes later runs**, hence the snapshot pair.
- **`trainingWasInterrupted` kept its name after its meaning changed**, so it was renamed along with the pane's local and both comments.
- **Nothing in the completion path is awaitable**, so the tests wait on the end state.
- **The pre-change baseline had to be captured before the change landed**, or it would have been authored against the new code and guarded nothing.
- **No requirement covered a resume that is itself interrupted**, which became 5d.
- **The synchronous replay was a choice the spec never weighed**, and the asynchronous one costs under 3%.
- **Nothing stopped a second catch-up being started on top of the first.**
- **The catch-up message was a status message with no live region**, and a role added alongside its own text is not announced, hence the role on every branch.
- **The freeze left no way out, for anyone**, hence every exit clearing the restoring state.
- **The fallback told the student to press Cancel, and Cancel did nothing to their data**, hence the re-acquisition before the resumable-or-not branch.
- **Two of the three restored cases start with no student action and no way to stop**, which is accepted and recorded rather than closed.
- **Opening a student's document changed the saved feature statistics every time**, hence undoing a refused rebuild.
- **Nothing told the resume path that the silent catch-up had finished**, hence the watcher.
- **The snapshot that undoes a refused rebuild has to be a deep copy**, and the two obvious ways of taking one share the objects `oneHot` mutates.
- **`featureWeightCaseIDs` means two different things**, so the resume does not reuse the existing helper.
- **`AIModel.reset()` would not have cleared the row count** under a skip-when-undefined import rule.
- **Eager validation contradicted two requirements about what a refused resume leaves in the document**, resolved in favor of leaving it untouched.
- **The golden weights guarded one of the five constrained places**, hence the second baseline.
- **In a document that already has a trained model, "re-acquire the existing result case IDs" is ambiguous**, and getting it wrong wipes a finished model's results.
- **`role="status"` that arrives with its own message is not announced.**
- **The prompt has five branches, not four**, and the one left uncovered was the one a restored run is actually in. It is now seven, all seven carrying the role.
- **A per-plugin-instance resume guard is stricter than per restored run**, and the extra strictness had no fallback.
- **`prepareResume` could approve a resume with no rows to fit**, and the replay had no failure path, so the pane locked.
- **Nothing exercised `restorePluginFromStore`**, which is where three requirements live.
- **The empty-saved-map condition is shadowed by the token-set check** on any document that still has features, so its test has to run against a document with no features at all. Verified by removing the condition and watching the test fail; the same removal-and-run check was applied to the five other rejection conditions, to both halves of the off-by-one and to the row-count rewrite.

### Findings from code review that changed the code

- **A document saved during the completion path's asynchronous tail resumed one gradient step too far.** `progressBar` records the final iteration synchronously and then awaits seconds of CODAP work before `reset()` clears `trainingInProgress`, and `get interactiveState` is dispatched throughout, so a save landing in that tail persists `iteration === iterations` *and* a run still in progress. The replay is clamped at the configured iteration count. Found independently by review and by Copilot.
- **The same window could record a second trained-model entry under one name**, because the entry is pushed partway through the tail. The completion path now records by name, replacing rather than pushing, and `buildModel` makes the name unique before starting rather than relying on the name field's blur handler.
- **Neither re-acquisition caught a rejected CODAP request.** `sendRequest` rejects on the iframe phone's two-second timeout, so a timed-out results search would have discarded already-resolved weight IDs. Both now report an incomplete answer instead.
- **The result-case rule asserted presence-per-parent, not ownership.** It now requires the selected child's `model name` to be empty or the current model's, which covers both an interrupted plain run (created blank) and an interrupted step-mode run (stamped).
- **`TrainingStore.fromJSON` derived one restore flag and left the other two as it found them**, so in principle a refusal carried forward from an earlier document. All three are now assigned. Raised by review and independently by Copilot, whose own confidence filter suppressed it.
- **The token snapshot went through a JSON round trip**, which is safe for `Token`'s current shape but silently mangles a `NaN`, an `undefined` or a `Date` added later, on the one path whose job is to put the document back untouched. It is now a written-out clone that stops compiling when `Token` gains a field.

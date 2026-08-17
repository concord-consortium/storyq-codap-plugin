# Implementation Plan: Resume an Interrupted Training Run When a Document Is Reopened

**Jira**: https://concord-consortium.atlassian.net/browse/STORYQ-87
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## How this plan was produced

Every step below was written, run and measured before being written down, not designed on paper. The
whole sequence was drafted onto the working tree and driven through the real `ModelManager` against a
mocked CODAP; the seven checks that resulted are recorded as finding 13 in the requirements spec. The
code in this document is that draft verbatim rather than a sketch of it, so the reviewer is reading
something that has already produced a resumed run whose weights, accuracy and kappa are identical to
the uninterrupted run's.

Four things the drafting settled that the requirements could not, all of which shaped the steps:

- **The document construction has to be shared between a fresh run and a resume.** The first draft
  gave the resume its own copy of `buildModel`'s document loop. Every requirement 9 check passed and
  the harness fitted a **different training set**, because the copy read a differently named
  attribute. That is the failure requirement 7b's "resume variant" wording exists to prevent, and the
  only reliable way to prevent it is one function that both callers use. Hence the first step.
- **`getCaseValues` deletes `parent` from every case it returns**, so requirement 6a's grouping cannot
  go through the helper the rest of the file uses and has to issue its own search.
- **`featureStore.fromJSON` never touches `caseIdTokenMap`**, so on a reopened document it is empty
  and repopulates lazily. `restoreTokens()` therefore rebuilds it rather than restoring a snapshot of
  it, and the test asserts identity rather than byte-equality (requirement 19b).
- **The two-`ModelManager` arrangement works and needs no singleton.** `TrainingPane` keeps the
  instance it makes in `useState`; the restore path makes its own. The loop's continuation lands on
  the pane's instance because what is shared, the pending-resume state, lives on the store.

A later pass took the plan's own code back out of this document and ran it against the real stores, which
is a different exercise from driving the sequence and caught three things the sequence could not, all now
folded into the steps below and recorded as finding 14 in the requirements spec:

- **The shared encoding was carrying an `AIModel` write with it.** `buildModel`'s `setIgnoreStopWords`
  call sits in the middle of the code the resume variant shares, so the validation rebuild assigned it,
  and `restoreTokens` does not undo it. A refused resume therefore altered the document it exists to
  leave alone. Measured: `true` in, `false` out, token maps byte-identical, snapshot not.
- **Nothing tested whether a restored ordering was usable before re-imposing it.** `getNewToken` defaults
  `index` to `-1`, and a map of all `-1`s sorts to insertion order, which would have been re-imposed as
  though it were the run's own.
- **The pending-resume flag had no way back to false except the replay**, so a student who reopened a
  step-mode run, pressed Cancel and trained a new model carried it into the fresh run, where the pane's
  Train button calls `nextStep()` straight after `buildModel()`.

The first two were measured; the third is a reading of the plan's control flow against the current
`training_pane.tsx`, since the code it concerns does not exist yet.

The steps are ordered so that each one compiles and leaves the suite green on its own, nothing depends on a
later step, and **no step leaves the product worse than it found it**. The last of those is a stronger
condition than the other two and it is what fixes the order: the rename is the step that takes the old
fallback away, since `fromJSON` stops setting it, and the pane step is the one that puts its replacement on
screen. Measured with the two applied and the pane step not yet: a reopened interrupted document renders
"You can start training your model." with an enabled Step, which is the STORYQ-86 symptom, restored for as
long as the two are apart. So they are adjacent, and both come before the encoding work, which references
what they introduce.

Verified rather than argued: "Record the row count" applied alone compiles and leaves the suite at 16
suites and 106 tests; "Rename the interrupted flag" applied on top of it does the same.

## Implementation Plan

### Record the row count the run is fitting

**Summary**: The one optional field requirement 9a adds to the saved model, plus its setter. Assigned
unconditionally by `import`, like the other ten fields, so `reset()` clears it and a stale count from a
finished or cancelled run never reaches the next save.

**Files affected**:
- `src/models/ai-model.ts`: the field, `defaultModel`, `setTrainingRowCount`, `import`, `asJSON`

**Estimated diff size**: ~13 lines

```ts
export interface IAIModel {
  // ...
  trainingIsComplete: boolean
  // The number of target rows the run in progress is fitting. Optional because documents saved before
  // STORYQ-87 do not carry it; those fall back to the token-set comparison alone on the way back in.
  trainingRowCount?: number
  usePoint5AsProbThreshold: boolean
}

export const defaultModel: IAIModel = {
  // ...
  trainingIsComplete: false,
  trainingRowCount: undefined,
  usePoint5AsProbThreshold: true
}
```

```ts
  trainingRowCount = defaultModel.trainingRowCount;

  setTrainingRowCount(value: number | undefined) {
    this.trainingRowCount = value;
  }
```

In `import`, between `setTrainingIsComplete` and `setUsePoint5AsProbThreshold`:

```ts
    // Assigned unconditionally like every other field, so that reset() clears it and a stale count
    // from a finished or cancelled run never reaches the next save.
    this.setTrainingRowCount(model.trainingRowCount);
```

and the same position in `asJSON`'s literal: `trainingRowCount: this.trainingRowCount,`.

`JSON.stringify` drops undefined-valued keys, so an unrecorded count leaves the saved shape byte-for-byte
as it was before this story, and a recorded one round-trips. The one thing this costs is that `asJSON()`'s
explicit literal no longer makes TypeScript check that this particular field is present, optional fields
not being required in the literal.

**Tests in this step** (requirement 15's read half, `src/models/ai-model.test.ts`): a snapshot without the
field restores with it `undefined`; a model carrying a count still has none after `reset()`; a recorded
count round-trips through `JSON.parse(JSON.stringify(asJSON()))`; and the key is absent from the
stringified snapshot when the count is unrecorded.

---

### Rename the interrupted flag to say what it now means, and add the resume's session state

**Summary**: `trainingWasInterrupted` becomes `trainingCouldNotBeResumed` and `fromJSON` stops setting it,
because whether a restored run can be resumed is not known there. `fromJSON` sets a different flag in its
place, `isRestoringRun`, because *that* fact is knowable there and the pane has to have it from the first
render. A third field, `resumeIsPending`, comes in alongside.

**Files affected**:
- `src/stores/training_store.ts`: rename, comments, `fromJSON`, three setters, two new fields
- `src/managers/model_manager.ts`: two call sites, both of which clear all three flags rather than one
- `src/components/training_pane.tsx`: the local derived from the flag, its comment, and its three uses
- `src/stores/training_store.test.ts`, `src/managers/model_manager.test.ts`,
  `src/components/training_pane.test.tsx`: the rename, and two rewritten assertions

**Estimated diff size**: ~65 lines

```ts
  resultCaseIDs: number[] = [];
  // A run restored from a reopened document is normally rebuilt and replayed. This says that one
  // could not be: the features or the target data changed while the document was closed, or the
  // weight cases the run wrote cannot be identified, so the student is told to start over instead.
  // Deliberately not part of asJSON(); it describes this session, not the document.
  trainingCouldNotBeResumed = false;
  // A restored run has been validated and is waiting for its gradient replay, which a plain run
  // starts at once and a step-mode run pays for on the first Step press.
  resumeIsPending = false;
  // A run is being restored: the validation, and the replay when one follows. Step and Cancel are
  // disabled and the pane says why, until the run is handed back or refused. It covers the whole
  // restore rather than only the replay because the outcome is not known until validation finishes,
  // and a pane that lets a student act on a run whose fate is undecided acts on the wrong thing
  // (requirement 5c).
  isRestoringRun = false;
```

`isRestoringRun` rather than `isCatchingUp`, for the reason requirement 10a gives for the other rename: the
field covers the validation as well as the gradient replay, and a name that says "catching up" would have
the pane's branch read as though it were about the replay alone and invite someone to start it later.

```ts
  fromJSON(json: ITrainingStoreSnapshot) {
    if (json) {
      this.model.fromJSON(json.model);
      // Whether an interrupted run can be resumed is not known here: it takes a rebuild against the
      // current features and target data, which happens on the restore path once CODAP has answered.
      // That a run is *about to be restored*, though, is known here and nowhere earlier, and the pane
      // renders before the restore path has issued its first request. Assigned rather than only set,
      // so that restoring a document with no run in progress clears a flag an earlier one left.
      this.setRestoringRun(this.model.trainingInProgress);
      this.trainingResults = json.trainingResults || [];
    }
    this.checkForActiveModel();
  }

  setTrainingCouldNotBeResumed(value: boolean) {
    this.trainingCouldNotBeResumed = value;
  }

  setResumeIsPending(value: boolean) {
    this.resumeIsPending = value;
  }

  setRestoringRun(value: boolean) {
    this.isRestoringRun = value;
  }
```

All three new fields stay out of `asJSON()`, and `resultCaseIDs` keeps its exclusion from
`makeAutoObservable`; the three booleans are observable, because the pane branches on them.

**Why `fromJSON` sets this one when it has just stopped setting the other.** The two flags answer different
questions. "Could this run be resumed?" needs a rebuild against the current features and target data, which
is why requirement 10 moved it out. "Is this run being restored?" needs only the restored model, which
`fromJSON` is holding. Setting it here rather than on the restore path is what closes the window between
the two: `TrainingPanel` mounts and renders before `restorePluginFromStore` has issued a single request, and
in that window the pane would otherwise treat a run whose fate is undecided as an ordinary in-progress run
the student can act on. Measured, against a genuine interrupted document with CODAP answering in 20 ms, a
student who presses Cancel in that window gets the pane back to "+ New Model" **and** the resume completing
anyway behind them: real weights and predicted labels written back over the cases Cancel had just blanked,
stamped with the emptied model name, and a nameless 100.0%-accuracy row left in their trained-model table.
Requirement 5c's disabling is what prevents that, and it has to start at the first render to prevent it.

`cancel()` is the second call site, and it clears all three for the same reason `buildModel` does:

```ts
    trainingStore.model.reset();
    // All three, not just the message flag. A student who reopens a step-mode run and presses Cancel
    // rather than Step leaves a resume pending on a model that no longer exists, and the pane's Train
    // button calls nextStep() straight after buildModel(), so the next fresh run's first step would
    // divert into a catch-up (requirement 7b).
    trainingStore.setTrainingCouldNotBeResumed(false);
    trainingStore.setResumeIsPending(false);
    trainingStore.setRestoringRun(false);
```

Clearing them in both places rather than in one is not belt and braces. `cancel()` covers the run the
student abandons; `buildModel` covers every other route back to a fresh run, including the one where a
document is restored, never cancelled, and a new model is started beside it. Clearing `isRestoringRun` in
both is also the backstop on the state machine below: whatever else goes wrong, starting or cancelling a
run puts the pane back in a state the student can act on.

**Test changes in this step**: `training_store.test.ts`'s first two cases assert that `fromJSON` sets the
old flag. They are rewritten to assert what `fromJSON` now does on both counts: restoring a mid-run
snapshot leaves `trainingCouldNotBeResumed` false, because nothing has tried to resume yet, and leaves
`isRestoringRun` true, because one is about to be; restoring a snapshot saved between runs leaves both
false. The third case, that the flag stays out of the saved JSON, keeps its meaning under the new name, and
the two new fields are asserted the same way. `model_manager.test.ts` and `training_pane.test.tsx` need the
rename only. Measured while drafting: those three suites are the entire blast radius of the rename.

One test here is not a rename. `model_manager.test.ts` already asserts that `buildModel` clears the message
flag; it gains the pending-resume and catching-up flags in the same assertion, and a second case does the
same for `cancel()`. That pair is the guard on requirement 7b's last bullet, and it is cheap enough to be
worth having in the step that introduces the fields rather than waiting for an integration test to catch a
fresh run diverting into a catch-up.

---

### Say what is happening while a run is being restored

**Summary**: The pane's two new states. A restoring message in the existing prompt area, `role="status"` on
that container in every branch, and Step and Cancel disabled for exactly as long as a run is being
restored, which is the validation and the replay together.

**Files affected**:
- `src/components/training_pane.tsx`: one new branch, the role on all six prompt containers, two disabled
  conditions
- `src/lists/lists.ts`: one hint

**Estimated diff size**: ~35 lines

The role goes on the container in **every** branch, not on the new one. `modelTrainerInstructions()`
returns a `div` from each branch at the same position and React reconciles them to one DOM node, so a role
added only on the catch-up branch would be registered in the same commit as the text it is meant to
announce, which is the one arrangement screen readers reliably do not announce. Confirmed by rendering the
real pane and flipping the flag: same node, class and children patched.

**There are five existing branches, not four, and the fifth is the one that matters.**
`modelTrainerInstructions()` returns a `div.sq-info-prompt` from `training_pane.tsx:34, 41, 53, 60` and
`67`, so the new catch-up branch makes six. Measured by rendering the real pane in all five states: they
reconcile to one node, and a document reopened mid-run renders the **final `else`**, "You can start
training your model.", which is therefore the branch the catch-up transitions out of. Miss that one and the
node goes from no role to `role="status"` in the same commit as the message, which is precisely the failure
this arrangement exists to prevent. The count is spelled out because getting it wrong is invisible: every
other branch would be covered and the test in this step can still pass (see the "before" state that test
has to start from, below).

**A fresh run gains announcements, and that is the one thing 7a's "exactly today's behavior" gives up.**
The prompt container is shared with the fresh-run flow, so a live region on it announces the fresh run's
prompt changes too. Measured by walking the real pane through an ordinary run:

| after | announced |
|---|---|
| mount | nothing; the region is registered holding "Train your model with the features you have prepared." |
| pressing + New Model | "Your model must have a name before you can train it." |
| typing a name | "You can start training your model." |
| pressing Train | nothing, the branch does not change |
| the run completing | "You have trained 1 model. Train another or proceed to Testing." |

Four announcements a fresh run does not make today. This is accepted rather than worked around, and
requirement 7a records it: no button, progress bar, CODAP write or weight changes, and the last row is a
gain, closing the gap the first-round accessibility review named when it noted that a screen reader user
currently learns nothing when the pane silently switches to "You have trained 1 model". The alternative, a
separate always-mounted live region holding only the catch-up text, was weighed and not taken: it needs a
visually-hidden class this project does not have (grepped: no `sr-only`, no `visually-hidden` anywhere),
which is new shared CSS, and it would rewrite requirements 5a and 5f. It belongs with the pending
accessibility ticket that already owns `ProgressBar` and `Button`, where such a class can be added once for
the whole plugin.

The pane's local is renamed with the store field, for requirement 10a's reason applied one scope down. It
reads `const trainingWasInterrupted = tModel.trainingInProgress && trainingStore.trainingWasInterrupted`
today, under a comment saying a restored run "has nothing left to continue, so Step cannot advance it",
which this story makes false. Left alone, `disabled={tDisabled || trainingWasInterrupted || isRestoringRun}`
would read as though the first term still meant "a run was interrupted", when it now means "a resume was
attempted and refused":

```tsx
  // A restored run is normally rebuilt and replayed. This is the case where it could not be, so Step
  // has nothing to advance and the student is told to start over instead.
  const couldNotBeResumed = tModel.trainingInProgress && trainingStore.trainingCouldNotBeResumed;
  const isRestoringRun = trainingStore.isRestoringRun;
```

```tsx
    } else if (isRestoringRun) {
      return (
        <div className='sq-info-prompt' role='status'>
          <p>Restoring {tModel.name === '' ? 'this model' : tModel.name} to where it left off…</p>
        </div>
      );
    } else if (couldNotBeResumed) {
```

with `role='status'` added to the `div` in each of the other five branches, the final `else` included, and
the two buttons:

```tsx
              disabled={tDisabled || couldNotBeResumed || isRestoringRun}
              hint={isRestoringRun
                ? SQ.hints.trainingCatchingUp
                : couldNotBeResumed ? SQ.hints.trainingInterrupted : SQ.hints.trainingOneStep}>
```

```tsx
          <Button
            className='sq-button'
            disabled={isRestoringRun}
            onClick={action(async () => {
              await modelManager.cancel()
            })}
            hint={isRestoringRun ? SQ.hints.trainingCatchingUp : SQ.hints.trainingCancel}>
            Cancel
          </Button>
```

```ts
    trainingCatchingUp: 'This training run is being restored to where it left off. ' +
      'It will be ready in a moment.',
```

The progress bar is deliberately untouched: it goes on showing the saved iteration and is not animated, so
it never misrepresents where the run is. The wording is new student-facing copy and is the one thing in
this plan Jie may want to word herself.

**Tests in this step** (requirements 16 and 5f, `src/components/training_pane.test.tsx`): the prompt
container carries `role="status"` in **every** branch it can render, walked one branch at a time, which is
the invariant requirement 5f actually asks for. That shape rather than a before-and-after test on one
transition: a before-and-after test is vacuous whenever its "before" state is a branch that already had the
role, which is what the existing `beforeEach` in this file would give it, and the transitions have moved
twice during review while the invariant has not. Two assertions go alongside it: that the node is reused
across a branch change, since the reconciliation is what makes the invariant necessary, and that pressing
Step on a validated step-mode run replaces the between-steps prompt with the restoring message, since that
is the announcement a student is actually waiting on. Then Step and Cancel are disabled while
`isRestoringRun` and enabled again when it clears; and the fallback message appears only when the run could
not be resumed, never alongside the restoring message.

**One thing the test cannot assert, recorded so nobody writes a test that appears to.** Requirement 5h: on
a reopened document the region enters the tree already holding the restoring message, because
`TrainingStore.fromJSON` sets the flag before the first render, so there is no content change and nothing
is announced at document open. Measured: the first render carries the role and the text together. The DOM
is identical whether or not a screen reader would announce, so this is a fact about the arrangement rather
than something a jsdom assertion can distinguish; what the test can and should pin down is the arrangement
itself, which is the every-branch assertion above.

---

### Share the encoding between a fresh run and a resume

**Summary**: Lift the document construction and one-hot encoding out of `buildModel` into a method that
takes its target cases as a parameter, and have `buildModel` call it, moving the four writes requirement 7b
constrains out of the shared half as it goes. No new callers yet. It comes this early because it is the
step `golden-fresh-run.json` guards, and keeping it alone in a commit makes that guarantee reviewable on
its own; the two steps ahead of it are there only because it references what they introduce.

**Files affected**:
- `src/managers/model_manager.ts`: extract `encodeTrainingData`, rewrite `buildModel` to call it

**Estimated diff size**: ~137 lines, measured rather than estimated: 75 insertions and 62 deletions in
`model_manager.ts`, applied on top of the two steps that precede it. Of the 75 insertions, 62 are the
encoding body moved verbatim and about 13 are genuinely new. **Those 13 are the whole of what needs
reviewing**: the three flag clears, `setTrainingRowCount`, `setIgnoreStopWords` in its new position, and
the changed call sequence around them. They are what requirement 7b constrains and what
`golden-fresh-run.json` exists to catch, and they are easy to skim past in a diff that is otherwise a
block move.

`buildModel`'s `setup()` did two unrelated jobs: configuring the logistic model for the run, and
turning target cases into documents. Only the second is shared with a resume, and the parameter is
what keeps the resume off `targetStore.targetCases`, which is reassigned with a filtered subset by
work that fires unawaited on every document open.

```ts
  /**
   * Turns a list of target cases into the documents and the encoded matrix a fit runs on. A fresh run
   * and a resume share this so that the two cannot drift apart: a resume that rebuilt the documents
   * its own way would silently encode a different training set (STORYQ-87).
   *
   * The caller passes the target cases rather than this reading targetStore.targetCases, because that
   * field is reassigned with a filtered subset by work that fires unawaited on every document open.
   *
   * This writes nothing to the AIModel. It reports ignoreStopWords rather than assigning it, because
   * the resume calls this to validate a restored run, and a validation that assigned would leave a
   * refused resume having altered the document it was supposed to leave alone (requirement 7b).
   */
  encodeTrainingData(iTargetCases: CaseInfo[]) {
    const tTargetAttributeName = targetStore.targetAttributeName,
      tTargetColumnFeatureNames = featureStore.targetColumnFeatureNames,
      tNonNgramFeatures = featureStore.chosenFeatures.filter(iFeature => iFeature.info.kind !== kFeatureKindNgram),
      tNgramFeatures = featureStore.chosenFeatures.filter(iFeature => iFeature.info.kind === kFeatureKindNgram),
      tUnigramFeature = tNgramFeatures.find(iFeature => (iFeature.info.details as NgramDetails).n === 'uni'),
      tPositiveClassName = targetStore.positiveClassName,
      tDocuments: Document[] = [];

    const tColumnNames = tTargetColumnFeatureNames.concat(
      featureStore.chosenFeatures.map(iFeature => {
        return iFeature.name;
      })
    );
    // Grab the strings in the target collection that are the values of the target attribute.
    // Stash these in an array that can be used to produce a oneHot representation
    iTargetCases.forEach(iCase => {
      const tCaseID = iCase.id,
        tText = iCase.values[tTargetAttributeName],
        tClass = iCase.values[targetStore.targetClassAttributeName],
        tColumnFeatures: Record<string, number | boolean> = {};
      // We're going to put column features into each document as well so one-hot can include them in the vector
      tColumnNames.forEach((aName) => {
        const featureValue = iCase.values[aName];
        const numberValue = Number(featureValue);
        let tValue: number;
        if (isFinite(numberValue)) {
          if (numberValue > 0) {
            tValue = 1;
          } else {
            tValue = 0;
          }
        } else {
          if (['1', 'true'].indexOf(String(featureValue).toLowerCase()) >= 0) {
            tValue = 1;
          } else {
            tValue = 0;
          }
        }
        if (tValue) tColumnFeatures[aName] = tValue;
      });
      tDocuments.push({
        example: String(tText), class: String(tClass), caseID: tCaseID, columnFeatures: tColumnFeatures
      });
    });

    const tData: number[][] = [];

    // Logistic can't happen until we've isolated the features and produced a oneHot representation
    const tIgnore = tUnigramFeature && (tUnigramFeature.info.ignoreStopWords === true ||
      tUnigramFeature.info.ignoreStopWords === false) ? tUnigramFeature.info.ignoreStopWords : true;
    const tOneHot = oneHot({
        frequencyThreshold: (tUnigramFeature && (Number(tUnigramFeature.info.frequencyThreshold) - 1)) || 0,
        ignoreStopWords: tIgnore,
        ignorePunctuation: true,
        includeUnigrams: Boolean(tUnigramFeature),
        positiveClass: tPositiveClassName,
        negativeClass: targetStore.negativeClassName,
        features: tNonNgramFeatures
      },
      tDocuments);
    if (!tOneHot) return undefined;

    // Column feature results get pushed on after unigrams

    // The logisticModel.fit function requires that the class value (0 or 1) be the
    // last element of each oneHot.
    tOneHot.oneHotResult.forEach(iResult => {
      iResult.oneHotExample.push(iResult.class === tPositiveClassName ? 1 : 0);
      tData.push(iResult.oneHotExample);
    });

    return { data: tData, oneHot: tOneHot, documents: tDocuments, ignoreStopWords: tIgnore };
  }
```

The one line that is not simply moved is `trainingStore.model.setIgnoreStopWords(tIgnore)`, which stays behind in
`buildModel`. It has to, and the reason is not obvious enough to leave to a comment alone. Moved into the shared
method it would run on the resume's **validation** rebuild, so a restored document whose unigram feature now says
something different would have its `ignoreStopWords` overwritten by the mere act of being opened, and
`restoreTokens` would not put it back: that restores the token maps and nothing else. Measured, finding 14: with
the document saying `true` and the feature saying `false` the model came back `false`, the token maps came back
byte-identical, and the `AIModel` snapshot did not. That is the case that produces a refusal, so the write lands
precisely where the eager-validation decision promises opening a document changes nothing.

`buildModel` keeps its request order exactly: `deselectAllCasesIn` first, then the logistic model
setup, then the encoding, then the two prep steps, then `fit`. The inner `setup()` function and the
`this_` alias both go, since nothing is nested any more.

```ts
  async buildModel() {
    // This run is being started here, so whatever a reopened document restored is no longer in play.
    // All three flags, not just the message one: a pending resume left behind by a student who
    // reopened a step-mode run and pressed Cancel would otherwise divert this run's first Step.
    trainingStore.setTrainingCouldNotBeResumed(false)
    trainingStore.setResumeIsPending(false)
    trainingStore.setRestoringRun(false)

    const tTargetDatasetName = targetStore.targetDatasetInfo.name,
      tLogisticModel = trainingStore.model.logisticModel

    await deselectAllCasesIn(tTargetDatasetName);
    tLogisticModel.reset();
    tLogisticModel.iterations = trainingStore.model.iterations;
    tLogisticModel.progressCallback = this.progressBar;
    tLogisticModel.trace = trainingStore.model.trainingInStepMode;
    tLogisticModel.stepModeCallback = trainingStore.model.trainingInStepMode ?
      this.stepModeCallback : undefined;
    tLogisticModel.lockIntercept = trainingStore.model.lockInterceptAtZero;

    const tEncoded = this.encodeTrainingData(targetStore.targetCases);
    if (!tEncoded) return
    const { data: tData, oneHot: tOneHot, documents: tDocuments } = tEncoded;

    // Assigned here rather than inside the shared encoding, so that the resume's validation rebuild
    // cannot write it into a restored model it is about to refuse (requirement 7b).
    trainingStore.model.setIgnoreStopWords(tEncoded.ignoreStopWords);

    // Recorded so that a document saved during this run can have its row count checked on the way
    // back in. Nothing else ever writes it, because a document only acquires an interrupted run by
    // being saved during a fresh one.
    trainingStore.model.setTrainingRowCount(tDocuments.length);

    // In step mode we'll be repeatedly updating weights and results. Prep for that before we start fitting
    await this.prepWeightsCollection(tOneHot.tokenArray)
    await this.prepResultsCollection()

    // The fitting process is asynchronous so we fire it off here
    tLogisticModel.fit(tData);
    tLogisticModel._data = tData;
    tLogisticModel._oneHot = tOneHot;
    tLogisticModel._documents = tDocuments;
  }
```

Two notes for the reviewer. Every setter this calls already exists: `setTrainingRowCount` from "Record the
row count" and the three flag setters from "Rename the interrupted flag", which is why those two steps come
first. Applied before them, this step does not compile, measured: four `TS2339`s. Both writes are needed
here rather than deferred, and for different reasons: without the row-count write in `buildModel` no
document ever carries the field and requirement 9's row check would never run on the documents it was added
for (requirement 7b, fifth bullet), and without the flag-clearing a fresh run inherits a stale pending
resume (requirement 7b, last bullet). And `CaseInfo` joins the import from `../types/codap-api-types`.

The `// @ts-ignore` above `fit` goes with it, having guarded nothing: `fit` already takes a single typed
parameter, and removing the comment from the pre-change build typechecks clean.

**Verification for this step**: `golden-fresh-run.json` is what this is for, and **the comparison has been
run against the amended `buildModel` rather than left as an instruction**. Both artifacts reproduce exactly:
`golden-weights.json` gives bit-identical `theta`, `cost` and `constantWeightTerm` for the locked and
unlocked intercept, with `fit(data, 0, undefined)` matching `fit(data)` so the two new parameters are
invisible when omitted; `golden-fresh-run.json` gives the same 11 tokens with the same order and counts, the
same 40 by 12 matrix, the same `update` and `create` branches, the same case-ID maps and the same 31
requests in the same order. Two notes for whoever writes these as tests. The artifact's `theta` is the
**full** array, whose zeroth element is the intercept, not `fitResult.theta`, which has it sliced off. And
the documents have to carry case IDs `100…139`: the artifact pins them only implicitly, through the
`caseIDs` inside `tokenMapAfterExtraction`, so a run that numbers them differently reproduces every headline
figure and still fails that one comparison.

**The goldens were then mutation-tested, and one of the four mutants survives.** A green baseline proves
nothing about what it would catch, so four deliberate regressions were introduced:

| mutant | caught by |
|---|---|
| the shared encoder reads `targetStore.targetCases` instead of its parameter, on a filtered subset | `golden-fresh-run.json` |
| the prep steps are reordered | `golden-fresh-run.json`, on the request shape |
| `fit`'s starting iteration defaults to 1 | `golden-weights.json` |
| **`setIgnoreStopWords` moved back inside the shared encoder** | **neither** |

The last is the regression finding 14 measured, and it is the subtlest thing requirement 7b constrains. It
survives both goldens because on a *fresh* run the assignment happens either way and lands on the same
value: the baseline records the run's inputs, not where they were written. So an earlier draft of this
paragraph, which said to "assert the resulting `ignoreStopWords`, since this is now the only thing that sets
it", would not have caught it either.

What does catch it is the requirement 19 assertion in "Validate a restored run": with the document saying
`true` and the student's unigram feature saying `false`, a refused resume leaves the `AIModel` snapshot
identical with the encoder clean and takes `ignoreStopWords` from `true` to `false` with the mutant.
Measured both ways. **The guard for this step's riskiest line therefore lives in a different step**, which
is worth knowing before anyone trims it: neither golden is protecting it. A fresh run must still
produce the same 11 tokens in the same order, the same 40 by 12 matrix, the same branch in each prep
step, the same two case-ID maps and the same 31 CODAP requests. Moving `setIgnoreStopWords` to after the
encoding rather than before it is inside that guarantee: nothing between the two positions reads the
field, no `await` separates them, and it is not a CODAP request, so the baseline's request list is
unchanged. Assert the resulting `ignoreStopWords` as well, since the baseline records the run's inputs
and this is now the only thing that sets it. The seeding trap in requirement 7e
applies to whoever writes that test: without seeding `tokenMap` the way ngram extraction leaves it, the
run silently fits a one-column model and the baseline guards nothing.

---

### Let the fit loop start where the last one stopped

**Summary**: The two optional parameters requirement 7b calls for. Omitting both is exactly today's
behavior, so a fresh run is unaffected; `golden-weights.json` is the guard.

**Files affected**:
- `src/lib/jsregression.ts`: two parameters on `LogisticRegression.fit`

**Estimated diff size**: ~12 lines

```ts
  /**
   * `iStartIteration` and `iStartTheta` exist so that an interrupted run can be picked up where it
   * stopped (STORYQ-87). Omitting both is exactly today's behavior: start at iteration 0 from zeroed
   * weights. A resume calls this twice, once to replay silently up to the saved iteration and once to
   * hand control back with the real callbacks attached.
   */
  fit(data: number[][], iStartIteration = 0, iStartTheta?: number[]) {
    this.dim = data[0].length;
    // ... unchanged ...
    this.theta = iStartTheta ? iStartTheta.slice() : new Array(this.dim).fill(0.0);

    const oneIteration = async (iIteration: number) => {
      // ... unchanged ...
    }

    oneIteration(iStartIteration);
  }
```

`iStartTheta` is copied rather than adopted, so the caller's array is not aliased by the loop.

That is the whole change to `fit`. It gains no return value and no promise: what sequences the handback
behind the catch-up is the watcher in the resume step, which is configuration of the existing instance.
Threading a resolver through the `setTimeout` chain would be a change to code every fresh run executes,
which requirement 7a rules out.

---

### Give FeatureStore a snapshot pair a rebuild cannot reach into

**Summary**: `snapshotTokens()` and `restoreTokens()`, so a validation rebuild that turns out to be
refused can put the document back exactly as it found it. Neither is reached from a fresh run.

**Files affected**:
- `src/stores/feature_store.ts`: the two methods, beside `clearTokens`

**Estimated diff size**: ~28 lines

The correctness lives in one place rather than in prose at the call site, because every part of the trap
is invisible where it would be used.

```ts
  /**
   * A copy of the token state that a rebuild cannot reach into, so a resume that turns out to be
   * refused can put the document back exactly as it found it (STORYQ-87 requirement 19).
   *
   * It has to be a deep copy. `oneHot` does not mutate the maps, it mutates the token objects inside
   * them, so `toJS()` and a spread both hand back something that shares those objects and protects
   * nothing. `toJS` is the sharper trap of the two: tokenMap is deliberately excluded from
   * makeAutoObservable, so it is a plain object and `toJS(tokenMap) === tokenMap`.
   */
  snapshotTokens(): TokenMap {
    return JSON.parse(JSON.stringify(this.tokenMap));
  }

  /**
   * Restores a snapshotTokens() copy. caseIdTokenMap is rebuilt from the copied objects rather than
   * snapshotted alongside: the two maps share their token objects, so restoring them separately
   * would leave the id map pointing at the mutated originals and the two maps disagreeing on identity.
   */
  restoreTokens(snapshot: TokenMap) {
    const tokenMap: TokenMap = JSON.parse(JSON.stringify(snapshot));
    const caseIdTokenMap: Record<number, Token> = {};
    Object.values(tokenMap).forEach(token => {
      if (token.featureCaseID) caseIdTokenMap[token.featureCaseID] = token;
    });
    this.setTokenMap(tokenMap);
    this.setCaseIdTokenMap(caseIdTokenMap);
  }
```

**Tests in this step** (requirement 19a's cheaper placement, `src/stores/feature_store.test.ts`): mutate a
token's `count` and `index` after taking a snapshot, restore, and assert against a deep copy taken before
the mutation, not against `toJS(tokenMap)` or `asJSON().tokenMap`, both of which are the live map and
would pass no matter what the implementation did. Then assert the identity requirement 19b names: every
token in the restored `tokenMap` is the same object `caseIdTokenMap` holds for its `featureCaseID`.

---

### Re-acquire the case IDs a reopened document does not carry

**Summary**: The two searches, as methods on `ModelManager`. They are what makes Cancel work on a
reopened document at all, and what stops a resume duplicating cases. Both are pure reads.

**Files affected**:
- `src/managers/model_manager.ts`: `reacquireWeightCaseIDs`, `reacquireResultCaseIDs`

**Estimated diff size**: ~70 lines

```ts
  /**
   * Requirement 6b. The weight cases the interrupted run wrote, keyed by token name.
   *
   * The attribute is called `model name`, with a space, so the formula has to backquote it: without
   * the backquotes CODAP answers `success: false` and the resume is refused for no good reason.
   *
   * Returns whatever it could resolve and, separately, whether it resolved one case per token. The
   * two answers are used for different things and must not be collapsed into one: requirement 6c
   * refuses the resume unless `complete`, while requirement 6's Cancel takes `ids` as it stands,
   * because clearing a case the interrupted run stamped with its own name is safe even when the set
   * is partial, and the fallback is the path that tells the student to press Cancel.
   */
  async reacquireWeightCaseIDs(iModelName: string, iTokens: string[]) {
    const { collectionName, datasetName, weightsCollectionName } = featureStore.featureDatasetInfo;
    const tEscapedName = iModelName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const tWeightCases = await codapInterface.sendRequest({
      action: 'get',
      resource: `dataContext[${datasetName}].collection[${weightsCollectionName}]` +
        `.caseFormulaSearch[\`model name\`=='${tEscapedName}']`
    }) as GetCaseFormulaSearchResponse;
    const tFeatureCases = await codapInterface.sendRequest({
      action: 'get',
      resource: `dataContext[${datasetName}].collection[${collectionName}].caseFormulaSearch[true]`
    }) as GetCaseFormulaSearchResponse;
    if (!tWeightCases.success || !tWeightCases.values || !tFeatureCases.success || !tFeatureCases.values) {
      return { ids: {}, complete: false };
    }

    const tTokenOfFeatureCase: Record<number, string> = {};
    tFeatureCases.values.forEach(iCase => { tTokenOfFeatureCase[Number(iCase.id)] = String(iCase.values.name); });

    const tIDs: Record<string, number> = {};
    let tComplete = true;
    for (const iCase of tWeightCases.values) {
      const tToken = tTokenOfFeatureCase[Number(iCase.parent)];
      // Unresolvable, or a second case for a token already resolved. Either way the set is no longer
      // one-per-token, so the resume is off; the ids gathered so far still belong to this model's
      // name and are still the right thing for Cancel to blank.
      if (!tToken || tIDs[tToken] != null) { tComplete = false; continue; }
      tIDs[tToken] = Number(iCase.id);
    }
    if (Object.keys(tIDs).length !== iTokens.length || iTokens.some(iToken => tIDs[iToken] == null)) {
      tComplete = false;
    }
    return { ids: tIDs, complete: tComplete };
  }
```

The one thing a partial result cannot recover is a token with two weight cases: `featureWeightCaseIDs` is
keyed by token and holds a single id, so the first is kept and the second stays stamped. That shape predates
this story, requirement 18a records it, and widening the field to hold a list would be a change to the type
every fresh run writes.

The escaping is the one `feature_store.ts` already applies before an equality search, and it was measured
against a real document for a model named `Jie's Model A`. Requirement 6cc's warning belongs in the
reviewer's head here: the count this resolves against is a count of the **visible** weight cases, since an
inactive model's are set aside and a set-aside case does not come back from a search. That does not affect
the run being resumed, which is never in `trainingResults` and so is never set aside.

```ts
  /**
   * Requirement 6a. The interrupted run's result cases are the newest child of each target case, taken
   * in the order of the target case list the resume captured, because showPredictedLabels pairs them
   * positionally against the documents. The results collection accumulates one child per target case
   * per model, so the unfiltered list is not this run's set, and a plain interrupted run has written
   * no model name for a name search to find.
   *
   * This issues its own search rather than going through getCaseValues, which deletes `parent` from
   * every case it returns.
   *
   * Reports its two answers the way reacquireWeightCaseIDs does, and for the same reason: `complete`
   * gates the resume, because the positional pairing needs every target case to have paired, while
   * `ids` is what Cancel blanks and is worth having even when a target case added since the run was
   * interrupted has no result child of its own.
   */
  async reacquireResultCaseIDs(iTargetCaseIDs: number[]) {
    const tTargetDatasetName = targetStore.targetDatasetInfo.name;
    const tResultCases = await codapInterface.sendRequest({
      action: 'get',
      resource: `dataContext[${tTargetDatasetName}].collection[${targetStore.targetResultsCollectionName}]` +
        `.caseFormulaSearch[true]`
    }) as GetCaseFormulaSearchResponse;
    if (!tResultCases.success || !tResultCases.values) return { ids: [], complete: false };

    const tChildrenOf: Record<number, number[]> = {};
    tResultCases.values.forEach(iCase => {
      const tParent = Number(iCase.parent);
      (tChildrenOf[tParent] ||= []).push(Number(iCase.id));
    });
    const tIDs = iTargetCaseIDs.map(iID => {
      const tChildren = tChildrenOf[iID];
      return tChildren?.length ? tChildren[tChildren.length - 1] : undefined;
    });
    // Compacted when incomplete, which is safe because an incomplete result refuses the resume, so the
    // only thing that ever reads this array positionally has already been ruled out.
    return { ids: tIDs.filter(iID => iID != null) as number[], complete: !tIDs.some(iID => iID == null) };
  }
```

**Tests in this step** (requirements 14 and 18, `src/managers/model_manager.test.ts`): both run against a
mocked CODAP shaped like a document that already holds a completed model, because a document with a single
model cannot tell a correct re-acquisition from a wrong one; only a second model puts more result cases in
the collection than there are target cases. `real-codap-interrupted-document.json` in this folder is the
shape to copy, including the asymmetry that an inactive model's weight cases are missing from a real
document while its result cases are not. Assert the specific IDs, not their count: a re-acquisition that
reads the wrong collection also produces non-empty requests.

A third test covers the two-answer split: a weights search that comes back one case short returns
`complete: false` **and** a non-empty `ids` holding the cases it did resolve, and one that comes back with
two cases for a single token returns `complete: false` while keeping the rest. Both halves matter, and the
easy mistake is to assert only the verdict: an implementation that returned an empty map alongside
`complete: false` would pass a verdict-only test and silently leave requirement 18a's Cancel with nothing
to clear.

---

### Validate a restored run and keep the rebuild for the replay

**Summary**: The restore path's eager half. It re-acquires the case IDs whether or not the run turns out
to be resumable, then rebuilds, runs requirement 9's checks, and either commits the rebuild or puts the
token maps back.

**Files affected**:
- `src/managers/model_manager.ts`: `prepareResume`

**Estimated diff size**: ~75 lines

```ts
  async prepareResume(iTargetCases: CaseInfo[]) {
    const tModel = trainingStore.model;
    const tSnapshot = featureStore.snapshotTokens();
    const tSavedTokens = Object.values(tSnapshot);
    const tSavedNames = tSavedTokens.map(iToken => iToken.token);
    // Requirement 9b: the saved ordering counts only when every token carries a distinct, non-negative
    // index. getNewToken defaults index to -1, and a map of all -1s sorts into insertion order, which
    // would then be re-imposed as though it were the run's own ordering. Names are taken above and are
    // unaffected: membership and the weight search need the set, not the order.
    const tIndexes = tSavedTokens.map(iToken => iToken.index);
    const tOrderIsUsable = tIndexes.every(iIndex => iIndex >= 0) &&
      new Set(tIndexes).size === tIndexes.length;
    const tSavedOrder = tOrderIsUsable
      ? tSavedTokens.slice().sort((a, b) => a.index - b.index).map(iToken => iToken.token)
      : undefined;
    const tTargetCaseIDs = iTargetCases.map(iCase => iCase.id);

    // Requirement 6: acquired before the resumable-or-not branch, so Cancel works either way, and the
    // weight ids are taken as far as they resolved rather than all-or-nothing, so that Cancel on the
    // fallback path still has something to blank (requirement 18a).
    const tWeightCaseIDs = await this.reacquireWeightCaseIDs(tModel.name, tSavedNames);
    const tResultCaseIDs = await this.reacquireResultCaseIDs(tTargetCaseIDs);
    featureStore.setFeatureWeightCaseIDs(tWeightCaseIDs.ids);
    trainingStore.resultCaseIDs = tResultCaseIDs.ids;

    // Requirement 9, the conditions that do not need the rebuild. An empty saved map is its own
    // condition, not a special case of the token-set check: it records no column set, so there is
    // nothing for that check to compare the rebuild against.
    if (tSavedNames.length === 0) return false;
    // Requirement 9's fifth condition. The encoding is one row per target case, so this is exactly an
    // empty matrix, and fit reads data[0].length on its first line. Checked here rather than on the
    // encoded data so that the refusal is a clean one, with no rebuild committed and nothing for
    // restoreTokens to undo. It is reachable only for a document that predates this story, since the
    // row check below refuses a story-era one first, and it does not need rows to have been deleted:
    // updateTargetCases returns [] without querying when targetAttributeName is empty, and
    // getCaseValues returns [] on a success:false search, so a target dataset renamed or removed
    // while the document was closed arrives here on a successful round trip.
    if (iTargetCases.length === 0) return false;
    if (tModel.trainingRowCount != null && tModel.trainingRowCount !== iTargetCases.length) return false;
    // Requirement 9's sixth condition. A constructed token stays in tokenMap when its feature is
    // unchosen or deleted, because toggleChosenFor only sweeps unigram tokens and deleteFeature's
    // non-unigram branch never calls deleteToken. So the token-set check below sees no change while
    // the column it encodes has gone to all zeros, and the resume would silently fit a different
    // training set. Target column features have constructed tokens with no Feature object of their
    // own, which is why that half of the test is not optional.
    const tColumnFeatureNames = featureStore.targetColumnFeatureNames;
    const tEveryConstructedTokenIsLive = tSavedTokens.every(iToken =>
      iToken.type !== kTokenTypeConstructed ||
      tColumnFeatureNames.includes(iToken.token) ||
      Boolean(featureStore.getFeatureByName(iToken.token)?.chosen));
    if (!tEveryConstructedTokenIsLive) return false;
    // Requirement 9's third condition (requirement 6c)
    if (!tWeightCaseIDs.complete || !tResultCaseIDs.complete) return false;

    const tEncoded = this.encodeTrainingData(iTargetCases);
    if (!tEncoded) {
      featureStore.restoreTokens(tSnapshot);
      return false;
    }

    const tRebuiltNames = tEncoded.oneHot.tokenArray.map(iToken => iToken.token);
    const tSameTokenSet = tRebuiltNames.length === tSavedNames.length &&
      tSavedNames.every(iName => tRebuiltNames.includes(iName));
    if (!tSameTokenSet) {
      featureStore.restoreTokens(tSnapshot);
      return false;
    }

    // Requirement 9b: re-impose the saved ordering on the token array, on the columns of the encoded
    // data and on tokenMap's own indexes. The last of those is what keeps a document that is
    // interrupted a second time landing in the same place rather than one rounding step away. Skipped
    // entirely when the saved ordering is not usable: the resume then runs on the rebuilt order and
    // accepts the one-ULP difference, because ordering is never a reason to refuse a resume.
    let tOrderedData = tEncoded.data;
    if (tSavedOrder) {
      const tPositionOf: Record<string, number> = {};
      tEncoded.oneHot.tokenArray.forEach((iToken, iIndex) => { tPositionOf[iToken.token] = iIndex; });
      const tOrderedTokens = tSavedOrder.map(iName => tEncoded.oneHot.tokenArray[tPositionOf[iName]]);
      tOrderedTokens.forEach((iToken, iIndex) => {
        iToken.index = iIndex;
        if (featureStore.tokenMap[iToken.token]) featureStore.tokenMap[iToken.token].index = iIndex;
      });
      tOrderedData = tEncoded.data.map(iRow => {
        const tRow = tSavedOrder.map(iName => iRow[tPositionOf[iName]]);
        tRow.push(iRow[iRow.length - 1]); // the class value stays last
        return tRow;
      });
      tEncoded.oneHot.tokenArray = tOrderedTokens;
    }

    // The rebuild is kept on the logistic model so the gradient replay can wait for a Step press.
    const tLogisticModel = tModel.logisticModel;
    tLogisticModel._data = tOrderedData;
    tLogisticModel._oneHot = tEncoded.oneHot;
    tLogisticModel._documents = tEncoded.documents;
    // Re-recorded so that a run interrupted, resumed and interrupted again is still fully checked.
    tModel.setTrainingRowCount(iTargetCases.length);
    trainingStore.setResumeIsPending(true);
    return true;
  }
```

Three points a reviewer should push on, all deliberate. **The weight-case check runs against the saved
token set rather than the rebuilt one** (requirement 6c, which now says so): it lets the two searches
happen before the rebuild, and the two sets are identical in every case where the resume would proceed,
because a mismatch refuses on the next check anyway. **The weight ids are written to the store even when
they are incomplete, and only the `complete` verdict gates the resume**, which is what gives Cancel
something to blank on the fallback path requirement 8 sends every refused run down (requirement 18a); the
value being written is a set of cases the interrupted run stamped with its own name, so writing it is safe
independently of whether it is the whole set. **`setTrainingRowCount` is the only `AIModel` write on this
path**, and it is the one requirement 5d exempts. Nothing else here may assign to the model: that is why
the shared encoding reports `ignoreStopWords` rather than setting it, and it is what makes a refused resume
leave the document as it found it, since `restoreTokens` restores the token maps and nothing more.
**The prep steps are not called.** They exist to
create cases and stamp names, and a resume needs neither; running them would take `prepWeightsCollection`'s
create branch and add a second weight case per token, which is requirement 3's whole subject. The
attribute visibility they also set is already correct on a reopened interrupted document, because the
interrupted run made those attributes visible before it started fitting and `guaranteeFeaturesDataset`
re-hides them only on the branch that creates the dataset.

**Tests in this step** (requirements 9, 18a and 19, `src/managers/model_manager.test.ts`): each rejection
condition refuses on its own, with the others satisfied, which is the only way to tell a check that
works from a check that is shadowed by the one before it. That includes the empty saved map, which is
otherwise easy to lose inside the token-set case, and the unchosen constructed feature, which is easy to
lose there too and for the opposite reason: the token set is *identical* in that case, which is the whole
point of it being a condition of its own. Assert the encoded column rather than the verdict alone, since a
version that checked only `chosenFeatures` and not the target column features would also refuse, and would
then refuse every document that uses a column feature. Then requirement 18a's pair: a document whose weight
cases resolve one short is refused, and a Cancel taken from there sends update requests carrying the ids
that did resolve plus every result case. And requirement 19's two directions: a refused resume leaves
`tokenMap` byte-identical to a deep copy taken beforehand and leaves `ignoreStopWords` alone, while a
resume that proceeds commits its rebuild.

Requirement 9b's ordering guard wants a test of its own here, and it has a shape that is easy to get
wrong: a restored `tokenMap` whose tokens all carry `-1` must resume, and must resume on the **rebuilt**
order rather than on the insertion order that sorting a map of equal indexes happens to produce. Assert
the resulting column order against the rebuild, not merely that the resume was not refused; a version
that re-imposed insertion order would also not be refused, and would then re-impose a different order on
the next open, which is the drift the writeback exists to stop.

---

### Replay to the saved iteration, then hand the run back

**Summary**: The gradient half. A silent catch-up with the real callbacks off and a watcher in their
place, then a handback that starts at the saved iteration plus one with everything restored.

**Files affected**:
- `src/managers/model_manager.ts`: `resumeRun`, `handBackAfterCatchUp`, and the guard in `nextStep`

**Estimated diff size**: ~65 lines

```ts
  resumeRun() {
    const tModel = trainingStore.model;
    const tLogisticModel = tModel.logisticModel;
    const tData = tLogisticModel._data as number[][];
    if (!trainingStore.resumeIsPending || !tData) return;
    trainingStore.setResumeIsPending(false);
    trainingStore.setRestoringRun(true);

    const tSavedIteration = tModel.iteration;
    tLogisticModel.lockIntercept = tModel.lockInterceptAtZero;
    // `trace` false is not optional: the trace branch continues the loop only through
    // stepModeCallback, so detaching that callback with trace true applies one gradient step and
    // stops, silently. With trace false the loop continues through its own 10 ms setTimeout, which
    // is also what keeps the plugin responsive while it catches up.
    tLogisticModel.trace = false;
    tLogisticModel.stepModeCallback = undefined;
    // Truncated on the logistic model only. Applying it to the AIModel would make the progress bar
    // read 88% where the run is actually at 35%.
    tLogisticModel.iterations = tSavedIteration + 1;
    // Requirement 5e: not the real progress bar, so no CODAP write, no progress update and no
    // trained-model entry while catching up, but not nothing either, or the end of the catch-up
    // would go unnoticed. Measured as bit-for-bit identical to attaching no callback at all.
    tLogisticModel.progressCallback = (iIteration: number) => {
      if (iIteration < tLogisticModel.iterations) return;
      // The catch-up reaches fit's terminal branch, which builds a completed-run record for a run
      // that has not completed. fillOutCurrentStoredModel reads it without checking, so clear it.
      tLogisticModel.fitResult = undefined;
      this.handBackAfterCatchUp(tData, tSavedIteration, tLogisticModel.theta.slice());
    };

    try {
      tLogisticModel.fit(tData);
    } catch (error) {
      // The step-mode caller is the pane's Step handler, which cannot handle a throw: the exception
      // becomes an unhandled rejection and isRestoringRun is left set, with requirement 5c having
      // already disabled both of the student's controls and nothing able to re-enable them. The plain
      // caller is inside attemptResume's try and would be caught there, but this method is the only
      // place that knows it has taken ownership of the restoring state, so it hands it back here for
      // both (requirement 5cc).
      console.log(`Could not replay the interrupted training run: ${error}`);
      trainingStore.setRestoringRun(false);
      trainingStore.setTrainingCouldNotBeResumed(true);
    }
  }

  private handBackAfterCatchUp(iData: number[][], iSavedIteration: number, iTheta: number[]) {
    const tModel = trainingStore.model;
    const tLogisticModel = tModel.logisticModel;

    tLogisticModel.iterations = tModel.iterations;
    tLogisticModel.progressCallback = this.progressBar;
    tLogisticModel.trace = tModel.trainingInStepMode;
    tLogisticModel.stepModeCallback = tModel.trainingInStepMode ? this.stepModeCallback : undefined;
    trainingStore.setRestoringRun(false);

    // The handback's own first iteration is the advance from N to N+1, and in step mode it is also
    // what hands the loop's continuation to stepModeCallback so that later presses are ordinary steps.
    tLogisticModel.fit(iData, iSavedIteration + 1, iTheta);
  }
```

and, at the top of `nextStep`:

```ts
    // The first Step press on a restored run pays for the catch-up before advancing an iteration.
    if (trainingStore.resumeIsPending) {
      this.resumeRun();
      return;
    }
```

`resumeIsPending` is cleared before anything else in `resumeRun`, which is the guard against a second
catch-up being started on top of the first by a student who presses Step twice. The pane's disabling
(next step) is the visible half of the same protection; this is the half that does not depend on the pane.

**Tests in this step** (requirements 12, 17, 16's mechanics and 20): the resume round trip, waiting on the
observable end state rather than on a promise, since nothing in the completion path is awaitable. The
harness that produced finding 13 is the model: interrupt a run by setting `trace` true with no step
callback, round-trip the document through `JSON.parse(JSON.stringify(domainStore.asJSON()))`, restore, and
assert that the resumed weights, accuracy and kappa equal an uninterrupted run's, that exactly one
trained-model entry exists, that no `create` request was issued during the resume, and that the weight and
result cases hold the same values the uninterrupted run left. Sample `trainingStore.model.iteration` on a
short interval while `isRestoringRun` is true and assert it never moved: requirement 5's silence is not
observable any other way. For requirement 20, start a catch-up, let it run partway, and assert the whole
`AIModel` snapshot is unchanged, not the whole document, since the rebuild is legitimately committed.

---

### Trigger a resume when a reopened document says a run was in progress

**Summary**: The restore path. A resume is sequenced behind both the `updateFromCODAP` await and the
promise `fromJSON` returns, runs at most one at a time, and falls to the requirement 8 fallback when the
restore itself rejects.

**Files affected**:
- `src/components/storyq.tsx`: `restorePluginFromStore`, three new private methods, one field
- `src/components/storyq.test.tsx`: new suite, the first coverage of the restore path

**Estimated diff size**: ~60 lines of production code, plus the new suite

```tsx
    private resumeInFlight: Promise<void> | undefined;

    async restorePluginFromStore(iStorage: IStorage) {
      if (iStorage) {
        uiStore.fromJSON(iStorage.uiStore);
        // Captured rather than awaited here: awaiting it inline would serialize, on every document
        // open, work that is concurrent today, for the sake of a case that only arises when a run
        // was in progress. fromJSON's first four statements are synchronous, so the training store,
        // including the isRestoringRun it sets, is in place before the next line runs.
        const tRestored = domainStore.fromJSON(iStorage.domainStore);
        // Read before the await, because cancel() and buildModel() can clear the flag while this is
        // in flight and the question being asked is what the document arrived holding.
        const tRunWasInProgress = trainingStore.model.trainingInProgress;
        try {
          await targetStore.updateFromCODAP();
          if (tRunWasInProgress) await this.resumeInterruptedRun(tRestored);
        } catch (error) {
          // Inside the try because updateFromCODAP does reject: getCaseValues dereferences its result
          // after a .catch that returns undefined, so one failed CODAP request rejects the whole
          // restore. Without this the pane would sit on the restoring message with Step and Cancel
          // disabled and no way out, which is worse than the message it falls back to.
          if (tRunWasInProgress) this.giveUpOnResuming(error);
          throw error;
        }
      }
    }

    /**
     * A run the document was saved during is rebuilt and replayed if it still matches the current
     * features and target data, and falls to the "cannot be picked up" message if it does not.
     *
     * Sequenced behind the promise fromJSON returns as well as the updateFromCODAP await, because the
     * Features dataset migration is still writing to the very dataset this is about to read weight
     * case IDs from and stamp model names into. That promise can also reject, and a resume that
     * neither attempts nor explains is the failure this story exists to remove.
     */
    private resumeInterruptedRun(iRestored: Promise<void>) {
      // Requirement 10b. Defensive: on the evidence available CODAP delivers a restore exactly once,
      // through init, so this guards a path CODAP is not known to exercise. See the requirements spec
      // before removing it.
      //
      // In flight rather than ever-attempted, which is what the requirement says and, since
      // requirement 5c, what safety requires. Returning early leaves isRestoringRun set, and the
      // resume that is already running is what clears it; a guard that never reset would leave a
      // second restored document showing the restoring message with Step and Cancel disabled and
      // nothing able to clear either (requirement 5cc). Returning the in-flight promise rather than
      // undefined keeps the caller's await meaningful.
      if (this.resumeInFlight) return this.resumeInFlight;
      this.resumeInFlight = this.attemptResume(iRestored)
        .finally(() => { this.resumeInFlight = undefined; });
      return this.resumeInFlight;
    }

    private async attemptResume(iRestored: Promise<void>) {
      try {
        await iRestored;
        // Never targetStore.targetCases: that field is reassigned with a filtered subset by work
        // that fires unawaited on every document open. updateTargetCases returns the array it built.
        const tTargetCases = await targetStore.updateTargetCases();
        const tModelManager = new ModelManager();
        if (await tModelManager.prepareResume(tTargetCases)) {
          if (trainingStore.model.trainingInStepMode) {
            // The run is validated and waiting for the student's next press, so the pane goes back to
            // looking exactly like a live step-mode run between steps. resumeRun sets the flag again
            // when that press arrives.
            trainingStore.setRestoringRun(false);
          } else {
            // A plain run has no button to press. The flag stays set through the replay and the
            // handback clears it.
            tModelManager.resumeRun();
          }
        } else {
          this.giveUpOnResuming();
        }
      } catch (error) {
        this.giveUpOnResuming(error);
      }
    }

    /**
     * The one place the restoring state is left. Every route out of a restore that does not end in a
     * run the student can act on comes through here, so that the pane can never be left saying a run
     * is being restored when nothing is restoring it (requirement 5c).
     */
    private giveUpOnResuming(iError?: unknown) {
      if (iError) console.log(`Could not resume the interrupted training run: ${iError}`);
      trainingStore.setRestoringRun(false);
      trainingStore.setResumeIsPending(false);
      trainingStore.setTrainingCouldNotBeResumed(true);
    }
```

**The state machine, in one place, because it is now spread over three files.** `isRestoringRun` is set in
exactly two places and cleared in five, and every one of the five leaves the student with something to do:

| set | by |
|---|---|
| a document arrives with `trainingInProgress` | `TrainingStore.fromJSON` |
| the student presses Step on a validated step-mode run | `resumeRun` |

| cleared | by | what the student is left with |
|---|---|---|
| validation succeeded, step mode | `attemptResume` | a live-looking step-mode run, Step enabled |
| the replay handed back | `handBackAfterCatchUp` | the run continuing, exactly as an uninterrupted one |
| validation refused | `giveUpOnResuming` | requirement 8's message and Cancel |
| anything in the restore threw | `giveUpOnResuming` | the same |
| a fresh run is started, or Cancel is pressed | `buildModel`, `cancel()` | the fresh run, or "+ New Model" |

The last row is the backstop rather than a path anyone plans to take: both of those already clear all three
flags for requirement 7b's reasons, and they mean that even a state this table has missed cannot outlive
the student's next action.

The one path that sets nothing and clears nothing is requirement 10b's guard returning early, and that is
deliberate: it does not own the state, the resume already in flight does, and every exit that resume can
take is in the table. This is the whole reason the guard is in-flight rather than once-per-instance. A
guard that never reset would return early with `isRestoringRun` still set by the second document's
`fromJSON` and no resume running to clear it, which is the one combination the table cannot recover from:
Train is suppressed while `trainingInProgress`, Cancel is disabled by requirement 5c, and nothing else
touches the flag.

The `ModelManager` made here is not the one `TrainingPane` holds, and that is fine rather than an
oversight: everything the two share lives on the stores and the logistic model. In step mode
`prepareResume` leaves `resumeIsPending` set, the student presses Step, and the pane's own manager runs
the catch-up and the handback, so the loop's continuation is parked on the instance whose `nextStep` the
pane calls. Drafted and measured both ways.

**Tests in this step**: `storyq.tsx` gains a suite of its own, `src/components/storyq.test.tsx`, and it is
the first thing in the repo to drive `restorePluginFromStore` rather than the pieces underneath it. That
matters more than it looks: after this review, this file holds requirement 10b's in-flight guard, the
`updateFromCODAP` rejection path, `giveUpOnResuming`, and three of the five transitions in the state table
above. Testing the pieces individually is what left the sequencing here uncovered in the first place.

It needs no refactor to be reachable, which was checked rather than assumed. The component constructs
without rendering (`new (require('./storyq').default)({})`) once `codapInterface.on` and `sendRequest` are
mocked, which is the same setup `model_manager.test.ts` already uses, and a storage object snapshotted from
the live stores drives the whole restore: measured, 12 CODAP requests and the restored model arriving with
`trainingInProgress` true, `name` "model A" and `iteration` 4. Extracting the orchestration into a manager
class was considered on the assumption it would be needed for testability and dropped once that turned out
to be false.

The cases:

- **A plain interrupted run resumes to completion with nobody pressing anything** (requirement 2). This is
  the story's headline behavior and nothing else in the plan exercises it through the path a document
  actually takes.
- **A restored run whose rebuilt column set does not match is rejected and the flag is set**
  (requirement 13).
- **A `fromJSON` that rejects lands on the fallback rather than in limbo** (requirement 9d), and **an
  `updateFromCODAP` that rejects does too**, which is the path that left the pane in limbo before
  `giveUpOnResuming` existed.
- **A second restore arriving while one is in flight is ignored and does not freeze the pane**
  (requirements 10b and 5cc): the guard returns early, and the resume already running still clears the
  restoring state. Note the requirements spec's position that CODAP is not known to deliver a second
  restore at all, so this asserts the guard's behavior, not CODAP's.
- **Cancel during the validation window leaves nothing written afterwards** (requirement 16). This one is
  the guard on a measurement rather than on a reading, and the comment should say so: with a plain
  interrupted run restoring and CODAP answering slowly, a `cancel()` issued before `prepareResume` resolves
  must leave no weights, no predicted labels and no trained-model entry written behind it. Measured before
  `isRestoringRun` covered the validation, that sequence wrote all three.

---

### Cover the ordering writeback and the second interruption

**Summary**: The tests requirement 20a and 15's write half call for, which have no production code of
their own but guard the two claims most easily lost in a later refactor.

**Files affected**:
- `src/managers/model_manager.test.ts`: two tests
- `src/models/ai-model.test.ts`: one test

**Estimated diff size**: ~90 lines

Requirement 20a: simulate four successive open-rebuild-commit cycles and assert the encoding is identical
across all four, **and** that it matches the interrupted run's.

The corpus has to be one where the ordering actually drifts, or the test passes with the writeback removed
and guards nothing. Pick one where a constructed feature's count inflation lifts it past a unigram in the
sort: eight documents, the constructed feature true on four of them so it starts at count 4 and rebuilds to
8, past a unigram sitting at 5.

**The negative half is written by modelling a cycle in the test, not by reaching into `prepareResume`.**
There is no seam to disable the writeback through, and an earlier draft of this step asked for one; what
the test does instead is perform a cycle itself, since `encodeTrainingData` is a method after the first
step. Take a deep copy of `tokenMap`, derive the saved order from it, call `encodeTrainingData`, permute
the array and the data columns into that order, and **omit the index write** that requirement 9b's third
clause performs. Commit, round-trip through `asJSON`, repeat. That is precisely what `prepareResume` would
do without the clause, and it is about 25 lines.

Both halves were run against the real rebuild path before this was written down, so the expectation is
measured rather than predicted:

| cycle | with the writeback | without it |
|---|---|---|
| 1 | order and data match the interrupted run | order and data match |
| 2 | match | **neither matches** |
| 3 | match | neither matches |
| 4 | match | neither matches |

Cycle 1 matching in both columns is the part worth pinning down: it is why a single-open test guards
nothing, and why the assertion has to run to at least the second cycle. This reproduces the split the
requirements spec records from a throwaway harness, from a test file this time.

Requirement 15's write half: a run started by this build and saved mid-training carries the row count, and
a resumed run re-records it, so a second interruption is still fully checked. Without this the read half
passes against documents that never carry the field.

---

## Out of scope for this plan

Everything the requirements spec lists, unchanged. Two things surfaced during drafting that belong to other
tickets and are deliberately not touched here:

- **`syncWeightsAndResultsWithActiveModels` never sets aside an inactive model's result cases**, because
  its results half awaits inside a plain `forEach` and the batched send has already fired by the time
  those callbacks resume. Measured on a real document: the inactive model's weights disappeared, its 500
  result cases stayed. A one-line repair, but it changes what a student sees for every model they
  deactivate and it is in code no part of this story executes.
- **`src/test/setupTest.ts` is at the wrong path**, which is why `react-scripts test` registers no matchers.
  Moving it to `src/setupTests.ts` would make both runners work; an unrelated rename in this branch's diff
  cuts against the story's posture of not churning code it does not need to change.

## Verification summary

Run `npx jest`. The suite is green at 16 suites and 106 tests before this story; every step above either
adds tests or leaves the count alone, and no step should leave it red.

The three suites the rename touches (`training_store.test.ts`, `model_manager.test.ts`,
`training_pane.test.tsx`) are the entire blast radius, measured rather than estimated.

Two pre-change baselines in this folder are the guards on requirement 7a, and both have been run against the
amended code and mutation-tested (requirement 7dd; one of the four mutants survives them, and requirement
19's assertion is what catches it): [`golden-weights.json`](golden-weights.json) for `fit`, and
[`golden-fresh-run.json`](golden-fresh-run.json) for everything around it.
[`real-codap-interrupted-document.json`](real-codap-interrupted-document.json) is the shape the CODAP mocks
in requirements 14 and 18 should copy.

## Requirement coverage

Every requirement in the requirements spec, and the step that carries it. The short names are the step
headings above.

| Requirement | Step |
|---|---|
| 1 step-mode run resumes, Step advances | Replay and hand back |
| 2 plain run auto-resumes to completion | Trigger a resume, and its suite is what asserts it end to end |
| 3 same run, no duplicate cases or entries | Validate a restored run (the prep steps are not re-run) |
| 4 bar, count, weights and labels agree | Replay and hand back (nothing writes during the catch-up); Say what is happening (the bar is untouched) |
| 5 replay is silent | Replay and hand back |
| 5a restoring message, bar not animated | Say what is happening |
| 5b catch-up is asynchronous | Replay and hand back (`trace` false) |
| 5c Step and Cancel disabled for the whole restore | Rename the interrupted flag (`fromJSON` sets it, so the first render has it); Say what is happening; the manager-side guard is in Replay and hand back |
| 5cc every exit from the restoring state | Trigger a resume (`giveUpOnResuming` and the state table); Rename the interrupted flag (`buildModel` and `cancel()` as the backstop) |
| 5d an abandoned catch-up changes no training state | Replay and hand back (its test), guaranteed by 5's suppression; the row-count exemption is written in Validate a restored run |
| 5e the watcher signals the end | Replay and hand back |
| 5f the role is on the container in every branch | Say what is happening |
| 5g the announcement is scoped to the selected tab | Nothing to build; recorded limit |
| 6 Cancel clears what the run wrote | Re-acquire the case IDs; called before the branch in Validate a restored run |
| 6a result IDs are the last child per target case | Re-acquire the case IDs |
| 6b weight IDs by model name through `parent` | Re-acquire the case IDs |
| 6bb the attribute name must be backquoted | Re-acquire the case IDs |
| 6c an ambiguous re-acquisition refuses | Validate a restored run (the `complete` verdict); Re-acquire the case IDs (what produces it) |
| 6cc the count is of visible cases | Re-acquire the case IDs (reviewer note) |
| 7 identical results | Replay and hand back; asserted by the round-trip test |
| 7a a fresh run is unchanged | Share the encoding; guarded by both goldens |
| 7b the seven constrained places | Share the encoding (including keeping `setIgnoreStopWords` in `buildModel`), Let the fit loop start, Record the row count, Validate a restored run, Say what is happening, Rename the interrupted flag (the flags `buildModel` and `cancel()` clear) |
| 7c golden weights guard `fit` | Verification summary; run and mutation-tested in Share the encoding |
| 7d golden fresh run guards the rest | Share the encoding (its verification) |
| 7dd both baselines run against the changed code, and what they miss | Share the encoding (its verification); the `ignoreStopWords` guard is in Validate a restored run |
| 7e the seeding trap | Share the encoding (its verification) |
| 8 the student is told when a resume is impossible | Trigger a resume; Say what is happening |
| 9 the six rejection conditions | Validate a restored run |
| 9a row count and the captured case list | Record the row count; Trigger a resume |
| 9b re-impose the ordering, including the writeback, and only when it is usable | Validate a restored run |
| 9c a document saved by this build must resume | The round-trip test in Replay and hand back |
| 9d a rejected restore falls to the fallback | Trigger a resume |
| 9e edited text is not detected | Nothing to build; recorded limit |
| 10 the flag means "could not be resumed", and `fromJSON` sets the restoring flag instead | Rename the interrupted flag |
| 10a the rename and the comment | Rename the interrupted flag |
| 10b at most one resume in flight | Trigger a resume |
| 11 the wording stays as STORYQ-86 wrote it | Say what is happening: the existing message and hint are untouched, and the only new copy is the catch-up message and its hint |
| 12 the round-trip test | Replay and hand back |
| 13 the fallback test | Trigger a resume |
| 14 no duplicates, against a two-model document | Re-acquire the case IDs |
| 14a the two conditions the token set cannot reach | Validate a restored run |
| 15 the row count, read and write | Record the row count (read); Cover the ordering writeback (write) |
| 16 the restoring message, the disabled window, and what it prevents | Say what is happening; the Cancel-during-validation case is in Trigger a resume |
| 17 the off-by-one | Replay and hand back |
| 18 Cancel after a refused resume | Re-acquire the case IDs |
| 18a a refusal on ambiguous weight cases, and Cancel from there | Re-acquire the case IDs (the partial ids); Validate a restored run (the refusal) |
| 19, 19a, 19b the token maps after a refusal | Give FeatureStore a snapshot pair |
| 20 an abandoned catch-up, on a document saved by this build | Replay and hand back |
| 20a the writeback across four opens | Cover the ordering writeback |

Two requirements need no code. 5g records that a live region in an unselected tab announces nothing,
and states that nothing is done about it. 9e records what the token-set check cannot see. Both are in
the table so that a reader checking coverage does not go looking for the step that implements them.

## Open Questions

None. The one question drafting raised, that requirement 9's token-set check cannot see an edit to the text
of an existing row, was taken to Doug and resolved: the limit is accepted and recorded as requirement 9e
rather than closed with a saved text signature.

## Self-Review

A three-role pass over the implementation plan: Senior Engineer, QA Engineer, and a reviewability role
covering step ordering and commit hygiene. The standard is the one the requirements spec's own passes
used, and it was raised for this pass: every issue below was verified by putting the plan's code on the
working tree and running it, not by reading it.

The whole plan was applied verbatim to a scratch copy of the tree, in the order the steps appear, and the
suite was run at each point. Two things are recorded up front because they are load-bearing and they held:
the plan's code **compiles and leaves the suite green at 16 suites and 106 tests**, and a full round trip
(uninterrupted 12-iteration run, the same run halted at iteration 5, document round-tripped through JSON,
`prepareResume`, `resumeRun`) reproduced the uninterrupted run's **token ordering, encoded matrix and
final `theta` byte for byte**. The two negatives requirement 20a rests on were re-measured too: four
successive open-rebuild-commit cycles encode identically, on a corpus where the constructed feature's
count inflation lifts it from position 7 to position 0, with its count going 4, 8, 12, 16, 20. The throwaway
harnesses were deleted and the tree restored. Candidate issues that did not survive verification are not
listed; the ones that were checked and held are at the end.

### Senior Engineer

#### RESOLVED: The prompt has five branches, not four, and the one the plan leaves uncovered is the one a restored run is actually in

The step "Say what is happening while a run is being restored" says `role='status'` is "added to the `div`
in each of the other four branches", while its own Files-affected line says "the role on five".
`modelTrainerInstructions()` returns a `div.sq-info-prompt` from **five** places today
(`training_pane.tsx:34, 41, 53, 60, 67`), so the new catch-up branch makes six and the prose undercounts by
one. That would be pedantry if any branch would do, but requirement 5f is precisely about completeness, and
the branch the prose leaves out is the one that matters.

Measured, by rendering the real pane in the five states and comparing DOM nodes: all five reconcile to one
node, as requirement 5f says. And a document reopened mid-run, before any resume has been refused, sits in
the **fifth** branch, the final `else`:

```
BEFORE text: "You can start training your model."
BEFORE role: null
AFTER  text: "Restoring model 1 to where it left off…"
AFTER  role: status
SAME DOM NODE: true
```

That is the arrangement requirement 5f exists to prevent, produced by following the plan's prose exactly.

**Resolution** (approved by Doug): the role goes on all six prompt containers, the five existing ones and
the new catch-up branch. The step now spells the count out, names the final `else` as the branch that
matters and why, and the Files-affected line says six rather than five. Requirement 5f gains the same count
and the same reason, so the arrangement cannot later be trimmed back as a style preference.

The dive turned up a consequence the finding did not name, now recorded rather than left to be discovered.
The prompt container is shared with the fresh-run flow, so the live region announces that flow's prompt
changes too: measured, four announcements an ordinary run does not make today, on + New Model, on typing a
name, and on the run completing. Requirement 7a now carries this as its second stated exception, with the
measurement and the argument for accepting it: no button, progress bar, CODAP write or weight changes, two
of the four restate something already on screen, and the completion one closes the gap the first-round
accessibility review named and deferred.

The alternative was weighed and not taken. A separate always-mounted live region holding only the resume's
own messages would leave a fresh run announcing nothing new and is the textbook arrangement, but it needs a
visually-hidden class the project does not have (grepped: no `sr-only`, no `visually-hidden` anywhere),
which is new shared CSS, and it would rewrite requirements 5a and 5f. It belongs with the pending
accessibility ticket that already owns `ProgressBar` and `Button`, where the class can be added once for
the whole plugin rather than for one message.

---

#### RESOLVED: Taking the flag out of `TrainingStore.fromJSON` leaves a reopened interrupted document saying "You can start training your model" with Step enabled and dead

The step "Rename the interrupted flag" has `fromJSON` stop setting the flag, on the correct grounds that
whether a run can be resumed is not known there. The consequence is that between the restore and
`prepareResume` resolving, nothing is set, and the pane renders the branch above. Measured with
`trainingInProgress` true and `trainingCouldNotBeResumed` false:

| what the pane shows | value |
|---|---|
| prompt text | "You can start training your model." |
| Step `aria-disabled` | `false` |
| what `nextStep()` does | falls past the `resumeIsPending` guard to `stepModeContinueCallback?.()`, which is `null`: nothing |

An enabled Step that silently does nothing, under a prompt telling the student to start training a run that
is already in progress, is the STORYQ-86 symptom this story exists to remove. The window is not
instantaneous: it spans `fromJSON`'s Features migration, `updateFromCODAP`, `updateTargetCases`, the two
re-acquisition searches and the rebuild, and `TrainingPanel` mounts eagerly whatever tab was saved.

**It is not only a window.** `await targetStore.updateFromCODAP()` sits *before* the `trainingInProgress`
check in the plan's `restorePluginFromStore`, and outside `resumeInterruptedRun`'s `try`. Measured, with
`sendRequest` rejecting: `getCaseValues` dereferences `tResult.success` after a `.catch` that returns
`undefined`, so it rejects with a `TypeError`, and `updateFromCODAP` rejects with it. The resume then never
runs, no flag is set, and the state above is permanent. Requirement 9d covers the `fromJSON` promise and
this is the other one.

**The dive found the window doing real harm, not just looking wrong.** Cancel is enabled in it too,
because the catch-up flag is still false. Against a genuine interrupted document (real `buildModel`, halted
at iteration 4 by `trace`, round-tripped through JSON) with CODAP mocked at 20 ms per round trip, pressing
Cancel 10 ms into the restore:

```
student presses Cancel. isCatchingUp: false -> Cancel is ENABLED
after Cancel:  trainingInProgress: false  beingConstructed: false  name: ""
prepareResume resolved -> true
AFTER IT ALL -> fitResult: true | model.iteration: 20
trained-model entry after the cancel: [{"name":"","accuracy":1}]
  WRITE [Features].collection[weights].case x10  {"model name":"","weight":""}           <- Cancel's wipe
  WRITE [Target].collection[results].case  x8    {"model name":"", ...}                  <- Cancel's wipe
  WRITE [Features].collection[features].case x10 {"model name":"","weight":-0.0156...}   <- the resume, after
  WRITE [Target].collection[results].case  x8    {"model name":"","predicted":"pos",...} <- the resume, after
```

The pane returns to "+ New Model" as Cancel promises and the resume completes behind it, writing real
weights and predicted labels back over the cases Cancel had just blanked and leaving a nameless
100.0%-accuracy row in the student's trained-model table. Step mode self-heals, because a later
`buildModel` clears `resumeIsPending`; a plain run does not, and a plain run is requirement 2's headline
case.

**Resolution** (approved by Doug): the state the plan already has for this, the pane's "a run is being
restored" state, starts too late. It now covers the whole restore rather than the gradient replay alone,
and it is set in `TrainingStore.fromJSON` when the restored model says `trainingInProgress`, which is the
same line the old flag occupied and the earliest point the fact is knowable. The field is renamed
`isRestoringRun` accordingly, for the reason requirement 10a gives for the other rename: a name saying
"catching up" would invite someone to start it at the replay again.

A pessimistic `trainingCouldNotBeResumed` was considered and rejected: it disables Step but leaves Cancel
enabled, correctly so, which means it does not touch the sequence above at all, and it would flash the red
"press Cancel to start over" (now announced, after the first finding in this pass) on documents that are
about to resume perfectly well.

Requirement 5c widens from "for exactly the catch-up" to "for as long as a run is being restored", with the
measurement above as the reason the validation half is included. Requirement 5cc is new and says every exit
from that state must leave the student something to do, which is what makes the `updateFromCODAP` rejection
path load-bearing rather than tidy: the plan's `restorePluginFromStore` now wraps it, and a single
`giveUpOnResuming` owns all four failing exits. Requirement 10 records why `fromJSON` sets this flag having
just stopped setting the other, requirement 5a's message covers both halves, and requirement 16 gains the
Cancel-during-validation case and the exit cases. The step "Trigger a resume" carries the state machine as
a table, because it is now spread over three files.

One state was checked rather than assumed: when validation succeeds in step mode the flag clears and the
pane falls back to "You can start training your model." with Step enabled, which is exactly what a live
step-mode run already shows between steps, so it is not a new wrong state.

---

#### RESOLVED: `resumeAttempted` is per plugin instance where requirement 10b asks for per restored run, and the extra strictness has no fallback

Requirement 10b: "A resume is attempted at most once per restored run, and a restore arriving **while one
is in flight** is ignored." The plan's guard is a `private resumeAttempted = false` on the component that is
set once and never reset, and its early `return` sets no flag and logs nothing.

`domain_store.ts:56` says in a comment that "the plugin accepts restored state into a running instance", and
resets its own migration guard on every `fromJSON` for that reason. So a second restore into a live instance
is something the codebase already expects. Under the plan, an interrupted run in that second document gets
neither a resume nor requirement 8's message: combined with the finding above, a silently dead Step.

This is a change in the unsafe direction from a guard the spec is explicit is defensive. The requirement's
own wording, "while one is in flight", is both weaker and safer.

**The premise was re-verified independently, on a checkout that settles the half the spec left open.** In
CODAP v2 the only `interactiveState` traffic is `data_interactive_phone_handler.js:165`, a `get`; in v3 the
only occurrence is `web-view/web-view-model.ts:209`, the same `get` inside `prepareSnapshot`. Neither ever
sends an `update` for the resource, and `CodapInterface.init` invokes its callback from a single
`getFrameRespHandler`. So the guard still guards a path CODAP is not known to exercise, and Technical Notes
now records v3 as checked rather than inconclusive.

**The issue escalated while this pass was running.** Once the previous finding moved the restoring state
into `fromJSON`, the guard's early return became one of requirement 5cc's exits, and it clears nothing: a
second restored document sets the flag, the guard returns without throwing so `restorePluginFromStore`'s
catch never fires, and the pane is left on the restoring message with Step and Cancel disabled and no route
to either, since Train is suppressed while a run is in progress and Cancel is disabled by 5c. That is a
frozen pane rather than a wasted opportunity, which is a worse failure than the one the guard prevents.
This part is a reading of the plan's control flow rather than a measurement, since the code does not exist
yet, and it is flagged as such for the same reason finding 14's third item was.

**Resolution** (approved by Doug): the guard holds the in-flight resume rather than a boolean, clears in a
`finally`, and returns the in-flight promise so the caller's await still waits for the real work.
`Promise.prototype.finally` was checked against this project's `lib` setting and typechecks. That matches
requirement 10b as written, it cannot freeze, and the early return's contract is now explicit in the
comment and in the step's state table: it touches no state because it does not own it, and every exit the
running resume can take is in the table. The work moves into an `attemptResume` method so the guard reads
as a guard.

Resetting the flag per restore was rejected: it fixes the freeze but lets two deliveries attempt
concurrently, which is the case 10b's "while one is in flight" clause exists to exclude. Keeping the
lifetime guard and clearing the state on the ignore path was also rejected: it never freezes, but it tells
a student whose second document could resume perfectly well that it could not be picked up.

---

#### RESOLVED: `prepareResume` can approve a resume with no rows to fit, and `resumeRun` has no failure path, so the pane locks

Measured against a pre-story snapshot (no `trainingRowCount`, which is exactly the migration case requirement
9a's optionality was added for) whose target rows had all been deleted:

```
prepareResume with zero target cases -> true   resumeIsPending: true   _data: []
resumeRun threw: Cannot read properties of undefined (reading 'length')
isCatchingUp left at: true   resumeIsPending: false
```

`fit` reads `data[0].length` on the first line. The row-count check is skipped because the count is absent,
the result search over an empty target-case list reports `complete: true` vacuously (`![].some(...)`), and
the token set matches because a zero-document `oneHot` leaves `tokenMap` alone. So all four requirement-9
conditions pass on an empty matrix.

The throw is the smaller half. `resumeRun` sets `isCatchingUp` true and nothing clears it except the
watcher's terminal call, so **any** failure between those two points leaves requirement 5c's disabling
permanent: Step and Cancel both disabled, under a message saying the run is being restored. On the plain
path `resumeInterruptedRun`'s `catch` sets the fallback flag but cannot clear `isCatchingUp`, and the
catch-up branch is tested before the fallback branch, so the student sees the catch-up message forever. On
the step-mode path `resumeRun` is called from the pane's `onClick` and nothing catches it at all.

**Re-measured, and the trigger is more ordinary than "the rows were deleted".** `fit([])` throws
synchronously on `data[0].length`. The encoding is exactly one row per target case, measured: three
documents give three encoded rows, zero documents give zero rows while the token array stays fully
populated, which is why the token-set check passes straight through. And zero target cases does not require
anyone to have deleted rows: `updateTargetCases` returns `[]` without querying when `targetAttributeName`
is empty, and `getCaseValues` returns `[]` on a `success: false` search rather than throwing, so a target
dataset renamed or removed while the document was closed arrives here on a successful round trip. It bites
only documents without `trainingRowCount`, which is the migration case requirement 9a's optionality exists
for and the one Jie has.

**Two of the earlier fixes changed the shape of this.** Traced against the plan as it now stands: the plain
path is already covered, because `attemptResume` calls `resumeRun()` inside its `try` and
`giveUpOnResuming` clears the state. The step-mode path is not, and structurally cannot be: `resumeRun` is
called from `nextStep()` inside the pane's `action(async () => …)` handler, which nothing awaits, so the
throw becomes an unhandled rejection with `isRestoringRun` left set and requirement 5c having already
disabled both controls. The neighbouring failure modes were checked and are sound: `resumeRun`'s
`!resumeIsPending || !tData` early return sits before it sets the flag, and a rejection inside `progressBar`
during the handback cannot propagate, because `runInAction(async () => …)` swallows it and the flag is
cleared before `fit` is called anyway.

**Resolution** (approved by Doug): both halves. `prepareResume` refuses an empty target case list **before**
the rebuild, alongside the other conditions that do not need one, so the refusal is clean and there is no
committed mutation for `restoreTokens` to undo; requirement 9 gains it as a fifth rejection condition with
the reachability argument, and the migration decision's "resumes against the current data and completes
coherently" becomes true rather than aspirational. And `resumeRun` wraps its `fit` call, clearing the
restoring state and setting the fallback flag itself rather than depending on a caller, which requirement
5cc now states as a rule: the replay owns its own failure, because one of its two callers cannot.

Checking on the encoded data instead was rejected: it is the same condition one comparison later, after the
rebuild has been committed and `trainingRowCount` rewritten, so a document that should have been refused
cleanly would get the treatment of one that proceeded.

### QA Engineer

#### RESOLVED: The prescribed `role="status"` test passes against the bug it is meant to catch, unless its "before" state is the branch a restored run is in

The step prescribes: "the prompt carries `role="status"` before the catch-up and is the same DOM node
after". That is the right test and it would catch the first finding, but only from the right starting state.
`training_pane.test.tsx`'s existing `beforeEach` sets `trainingCouldNotBeResumed` true, which puts the pane
in the **alert** branch, and the plan does give that branch the role. A test written on top of that fixture
asserts `role="status"` before and after, passes, and the real transition still announces nothing.

**The dive found that an earlier fix in this pass moved the state the test was written around, and cost an
announcement.** With `fromJSON` setting the restoring flag, a reopened interrupted document renders the
restoring branch on its *first* render, so the transition the prescribed test targets no longer happens on
the restore path. Measured:

```
FIRST RENDER role: status | text: "Restoring model 1 to where it left off…"
AFTER validation (step mode): "You can start training your model."   same node: true
AFTER the Step press:         "Restoring model 1 to where it left off…"
AFTER a refusal:              "Training model 1 was stopped, and it cannot be picked up…"
```

The region is registered holding its message, and a live region does not announce content already present
when it enters the accessibility tree. Every other announcement survives, each being a real change inside
an established region: the refusal, the Step press, and completion. The only loss is the passive at-open
message. The same run confirmed all six branches carry the role, which is the property requirement 5f
wants and the one the prescribed test does not check.

**Resolution** (approved by Doug): the test asserts the invariant instead of a transition. It walks every
branch and asserts `role="status"` on each, with a node-identity assertion and a Step-press assertion
alongside, and the step says why that shape rather than before-and-after. Requirement 16 carries the same.
The lost announcement is recorded as requirement 5h rather than worked around: it is accepted on the
grounds that the student initiated nothing and is waiting on nothing at document open, which is the trade
5g already makes for a student on another tab, and every announcement tied to a press or an outcome
survives. Holding the region empty for a render and filling it on the next tick was rejected as the same
class of render-timing trickery the first-round review retracted when the `setTimeout(0)` yield turned out
not to work.

Fixing the fixture alone was rejected: it is the smallest edit, but after the earlier change that fixture
describes a transition the product no longer makes, and the lost announcement would have gone unrecorded.

---

#### RESOLVED: Nothing exercises `restorePluginFromStore`, which is where three requirements live

The step "Trigger a resume" prescribes two tests, and both go through `prepareResume` rather than through
the restore path: a rebuilt column set that does not match sets the flag, and a rejecting `fromJSON` lands in
the same place. Requirement 12's round-trip test, in "Replay and hand back", also drives `prepareResume` and
`resumeRun` directly. So `restorePluginFromStore` and `resumeInterruptedRun` are never run by the suite,
and they are where requirement 2's headline case (a plain run resuming with nobody pressing anything),
requirement 10b's guard and the sequencing behind `updateFromCODAP` all live. Both remaining Senior Engineer
findings above are in that file.

The gap grew during this pass. That file now also holds requirement 10b's in-flight guard, the
`updateFromCODAP` rejection path, `giveUpOnResuming` and three of the five transitions in the restoring
state machine, all added by the four resolutions above and none of them covered.

**The dive settled the question that decides the fix: it is testable as it stands.** I expected to have to
recommend extracting the orchestration into a manager class, matching the codebase's `ModelManager` /
`TestingManager` / `NotificationManager` pattern. That turns out to be unnecessary. With `codapInterface.on`
and `sendRequest` mocked, the component constructs without rendering and the method is callable:

```
module loaded. export is a function | name: Storyq
constructed ok. has restorePluginFromStore: function
```

and a storage object snapshotted from the live stores drives the whole restore, 12 CODAP requests, with the
restored model arriving as `{"name":"model A","iteration":4,"trainingInProgress":true}`.

**Resolution** (approved by Doug): a new `src/components/storyq.test.tsx`, listed in the step with five
cases: the plain-run auto-resume end to end (requirement 2, currently untested through the path a document
takes), the rejected rebuild, both rejection paths, the second restore, and Cancel during the validation
window. Extracting the orchestration was rejected once the testability argument for it failed: moving code
the plan has already written and reviewed, for a benefit the measurement shows is already available, is a
design change the story does not need.

---

#### RESOLVED: Requirement 20a's negative half cannot be asserted from the suite as the step describes it

The step says to "assert the without-writeback case too, so the guard is visibly two-sided". The writeback
is a line inside `prepareResume`; a test cannot disable it, so the negative half was a property of the
throwaway harness rather than something the prescribed test can express. As written the instruction will
either be skipped or will send the test author looking for a seam that is not there.

The positive half and the corpus guidance both check out: four cycles encode identically on a corpus where
the constructed feature moves from position 7 to position 0 on the rebuild.

**The dive wrote it, so the instruction turns out to be right and only underspecified.** The negative half
needs no seam in production code: the test models a cycle itself, using `encodeTrainingData`, permuting the
array and data by the saved order and omitting the index write. Run four cycles each way on a corpus where
the constructed feature goes from count 4 to 8, past a unigram at 5:

```
run order: ["awful","good","movie","acting","film","story","terrible","constructed feature","great","wonderful"]
  WITH    cycle 1..4: order matches the run = true,  data matches = true
  WITHOUT cycle 1:    order matches the run = true,  data matches = true
  WITHOUT cycle 2..4: order matches the run = false, data matches = false
```

That is the split the requirements spec records from its throwaway harness, reproduced on the real rebuild
path from a test file, and it settles something the spec asserts but does not show: the drift starts at
cycle 2, so a single-open test guards nothing. About 25 lines, and no production change beyond
`encodeTrainingData` being a method, which the first step already does.

**Resolution** (approved by Doug): the step says how, and carries the measured table for both halves so the
expectation is written down rather than rediscovered. Dropping the instruction and keeping only the
four-cycle positive assertion was rejected: the clause it guards is one line inside `prepareResume` of
exactly the kind requirement 9b's own text worries about being trimmed as redundant, and a one-sided guard
would survive its removal on any corpus that happens not to drift.

### Reviewability and commit hygiene

#### RESOLVED: The first step does not compile on its own, which is the one property the plan claims for every step

The plan claimed: "The steps are ordered so that each one leaves the suite green and nothing depends on a
later step." Applied on its own, exactly as written, the first step gives:

```
model_manager.ts(379,19): TS2339: Property 'setTrainingCouldNotBeResumed' does not exist on type 'TrainingStore'.
model_manager.ts(380,19): TS2339: Property 'setResumeIsPending' does not exist on type 'TrainingStore'.
model_manager.ts(381,19): TS2339: Property 'setRestoringRun' does not exist on type 'TrainingStore'.
model_manager.ts(401,25): TS2339: Property 'setTrainingRowCount' does not exist on type 'AIModel'.
```

Three of those arrive in "Rename the interrupted flag", five steps later, and the fourth in "Record the row
count", two steps later. The plan sees this and leaves it to the implementer: "either those steps land
together with this one or these lines wait for them". That undoes the reason the step is first, which is that
keeping it alone makes the `golden-fresh-run.json` guarantee reviewable on its own.

**The dive verified the fix and then found a second ordering problem behind it.** "Record the row count"
applied alone compiles and leaves the suite at 16 suites and 106 tests; "Rename the interrupted flag"
applied on top of it does the same. So the reorder works. But rendering the pane at that point:

```
isRestoringRun: true | trainingCouldNotBeResumed: false
PROMPT: "You can start training your model."
STEP aria-disabled: false
```

The rename is the step that *removes* the old fallback, since `fromJSON` stops setting
`trainingCouldNotBeResumed`, and the pane step, five steps later in the original order, is the one that
adds its replacement. Between them the product is in exactly the state the second finding in this pass was
about: a reopened interrupted document says "You can start training your model" with an enabled, dead Step.
The flag that fixes it is already being set; nothing renders it yet. Every commit in that window compiles
and the suite is green, so the plan's stated invariant holds while the product is worse than before the
branch started.

**Resolution** (approved by Doug): the steps are reordered to `Record the row count`, `Rename the
interrupted flag`, `Say what is happening`, `Share the encoding`, then the rest unchanged. That fixes the
compile failure and closes the regressed window in one move, by putting the step that renders the restoring
state next to the step that starts setting it. The plan's ordering claim gains a third condition, that no
step leaves the product worse than it found it, since that is the one the original order satisfied least
and the one that determined the new order. The forward-dependency note in "Share the encoding" is replaced
by a note saying every setter it calls already exists and why those two steps precede it.

Merging the rename into "Share the encoding", which is what the plan's own fallback suggested, was
rejected: it would put the golden-baseline step and a rename with a four-file blast radius in one diff,
which is the opposite of what that step's isolation is for.

---

#### RESOLVED: The first step is framed as a pure refactor and is not, and one of its stated reasons is wrong

"Pure refactor: no behavior changes, no new callers yet" sits above a step that also moves
`setIgnoreStopWords` to after the encoding, adds three flag clears, adds `setTrainingRowCount` and drops a
`// @ts-ignore`. Each of those is justified elsewhere in the plan and none is wrong; the framing is, and it
points a reviewer away from exactly the lines requirement 7b constrains.

The `@ts-ignore` reason is also wrong on the facts. The plan says it "goes with the next step, which gives
`fit` a signature that accepts one argument properly". `fit(data: number[][])` already accepts one argument:
removing the comment from today's build and running `npx tsc --noEmit` passes. The step's own code block has
already dropped it, so only the explanation is at issue, but it is an explanation a reviewer would take on
trust.

**A third claim in the same step was checked, the one this finding had not.** "~120 lines, almost all of it
moved rather than new" understates the part that matters. Measured, applied on top of the two steps that
now precede it: 75 insertions and 62 deletions. Of the 75, 62 are the encoding body moved verbatim and
about 13 are new, and those 13 are exactly the writes requirement 7b constrains. "Almost all of it moved"
is true by line count and does the same steering the "pure refactor" framing did.

**Resolution** (approved by Doug): the summary was already rewritten while reordering the steps for the
previous finding, and no longer claims a pure refactor; it now says the step moves the four writes 7b
constrains out of the shared half as it goes. The stale `@ts-ignore` sentence is deleted, leaving the
accurate one in the reviewer notes, so the step no longer says two different things about the same comment;
the correction stands on the measurement that removing the comment from the unmodified build gives
`npx tsc --noEmit` exit 0, `fit` having taken a single typed parameter all along. And the diff estimate is
replaced by the measured split, with the 13 new lines named as the ones to review, since they are what
`golden-fresh-run.json` is the guard on.

### Targeted round

The nine issues above were resolved one at a time, and five of the resolutions changed behavior rather than
wording: the restoring state moving into `fromJSON` and widening to cover validation, requirement 5cc's
exits, `giveUpOnResuming`, the in-flight guard, the empty-matrix refusal and the `try`/`catch` in
`resumeRun`. None of that had been run. Three of the nine had also been escalated by a fix made earlier in
the same pass, which is a rate of self-inflicted follow-on defects high enough to assume more were waiting.
So the amended plan was applied in full, in its new order, and the state machine driven rather than read.

**The plan as amended compiles and the suite is green at 16 suites and 106 tests.** All five exits from
`isRestoringRun` were reached for real, through `restorePluginFromStore` against a mocked CODAP and a
document interrupted by a genuine `buildModel`:

| exit | measured |
|---|---|
| validation succeeds, step mode | `restoring=false pending=true`, prompt "You can start training your model.", Step enabled: a live-looking step-mode run |
| plain run replays and hands back | `restoring=true` during, then `restoring=false`, the run completed, one trained-model entry, "You have trained 1 model. Train another or proceed to Testing." |
| validation refuses | flags cleared, requirement 8's message, Step disabled, Cancel enabled |
| the restore throws | rethrown to the caller, `restoring=false pending=false couldNot=true`, requirement 8's message, Cancel enabled |
| `cancel()` and `buildModel` as the backstop | both clear all three |

**It found one thing, and it is the sixth rejection condition requirement 9 now carries.** A constructed
feature unchosen or deleted while the document was closed leaves its token in `tokenMap`, so the token-set
check sees nothing while the column has gone to zeros:

```
interrupted run columns: 10 | includes the feature: true
prepareResume -> true
rebuilt columns: 10 | still includes the feature: true
encoded matrix identical to the interrupted run's: false
  column 7 (exclamation present) in the run:      01010101
  column 7 (exclamation present) after reopening: 00000000
```

`toggleChosenFor` sweeps tokens only for the unigram feature and `deleteFeature`'s non-unigram branch never
calls `deleteToken`, so the scope is exactly: adding a feature is caught, unchoosing the unigram feature is
caught, unchoosing or deleting a constructed feature was not. Requirement 9e claimed a changed feature set
was covered; it is now, and 9e says what it took.

The candidate check was evaluated before being written down, including the case that would have made a
naive version wrong:

```
normal document (feature still chosen)         -> true   (want true)
the student unchose the constructed feature    -> false  (want false)
the student deleted the constructed feature    -> false  (want false)
a target-column feature token, nothing changed -> true   (want true)
the column attribute is gone from the target   -> false  (want false)
```

Target column features have constructed tokens with no `Feature` object, so a check consulting only
`chosenFeatures` would have refused every document that uses one.

Two things this round did **not** settle, recorded so they are not read as cleared. The new
`storyq.test.tsx` cases are specified but not written, so the state machine has been driven by a throwaway
harness rather than by the suite. And the completion path's errors still go unobserved: driving a CODAP
failure during an in-flight `computeResults` produced an unhandled rejection with nothing to catch it,
which is the pre-existing `runInAction(async () => ...)` behavior already in Out of Scope, confirmed here
rather than introduced.

### Checked and held

Re-verified against the running code and found accurate, recorded so nobody spends the time again.

- **The plan's central claim.** An interrupted run round-tripped through JSON and resumed reproduces the
  uninterrupted run's token ordering, encoded matrix and final `theta` byte for byte, with one
  trained-model entry and the run finishing at its full iteration count.
- **Requirement 20a.** Four successive open-rebuild-commit cycles encode identically, including on a corpus
  where the constructed feature's count inflation moves it from position 7 to position 0.
- **Requirement 19 and finding 14's fix.** A refused resume leaves `tokenMap` byte-identical to a deep copy
  taken beforehand, leaves the whole `AIModel` snapshot identical **with the document saying
  `ignoreStopWords: true` and the unigram feature saying `false`**, which is the case finding 14 measured
  going wrong, and leaves every token in `tokenMap` identical to the object `caseIdTokenMap` holds for its
  `featureCaseID`.
- **Both re-acquisitions, across their edge cases.** A weights search one case short reports
  `complete: false` with the ids it did resolve; two cases for one token reports `complete: false` while
  keeping the rest; a weight case whose parent is not a feature case does the same; a model named
  `Jie's Model A` produces `` caseFormulaSearch[`model name`=='Jie\'s Model A'] ``. On a two-model results
  collection, requirement 6a's last-child rule returns the interrupted run's cases and not the completed
  model's; a target case added while the document was closed reports `complete: false` while keeping the
  results it could identify.
- **The rename's blast radius is exactly the four files the plan names**, `training_pane.tsx` plus the three
  test suites, with nothing else referencing the flag.
- **The suite is green at 16 suites and 106 tests before the story**, and green at 16 and 106 with every step
  of the plan applied.

One minor thing not worth its own issue: in `prepareResume`'s re-imposition,
`featureStore.tokenMap[iToken.token].index = iIndex` is a second write to the object `iToken.index = iIndex`
has just written, because `oneHot`'s `tokenArray` holds the very objects `tokenMap` holds. The writeback is
real and load-bearing, it just happens on the line above. Harmless as a guard against a future `tokenArray`
that holds copies, but the comment should not imply the second line is what does the work.

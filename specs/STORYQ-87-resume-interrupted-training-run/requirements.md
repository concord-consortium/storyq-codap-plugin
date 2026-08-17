# Resume an Interrupted Training Run When a Document Is Reopened

**Jira**: https://concord-consortium.atlassian.net/browse/STORYQ-87
**Repo**: https://github.com/concord-consortium/storyq-codap-plugin
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

A CODAP document saved while a StoryQ model is training reopens with the run abandoned: the pane says it cannot be picked up, Step is disabled, and the student's only route forward is Cancel and retrain from scratch. This story restores the run instead, by rebuilding the encoded training data and replaying the gradient descent up to the saved iteration, so Step advances from where the student left off and a plain run finishes on its own.

## Project Owner Overview

Training a StoryQ model is not instantaneous, and a student who saves and closes a document mid-training currently loses that run. Reopening tells them, in red, that training was stopped and cannot be picked up, and offers only Cancel, which throws away the partial weights and the predicted labels already written into their CODAP datasets and returns the pane to "+ New Model". For a student working across two class periods, or one whose session is interrupted, the work simply disappears.

This story makes reopening a saved document restore a run the student can carry on with. A run stopped mid-step resumes at the iteration it was saved at, and a plain run resumes and completes on its own so the results are waiting when the student returns to the page. The existing "cannot be picked up" message stays, but only for the cases where resuming genuinely is not possible, chiefly when the student changed their features or their target data while the document was closed. Nothing about the training algorithm, its settings, or its results changes.

## Background

A StoryQ training run lives in two places, and only one of them is saved with the document.

Saved (`AIModel.asJSON`, `src/models/ai-model.ts`): `beingConstructed`, `frequencyThreshold`, `ignoreStopWords`, `iteration`, `iterations`, `lockInterceptAtZero`, `name`, `trainingInProgress`, `trainingInStepMode`, `trainingIsComplete`, `usePoint5AsProbThreshold`.

Not saved, deliberately: `AIModel.logisticModel`, the live `LogisticRegression` instance. It holds the current weight vector (`theta`), the one-hot encoded training data (`_data`, `_oneHot`, `_documents`), and the callbacks that drive the fit loop. It is an object carrying functions rather than data, and [STORYQ-86](https://concord-consortium.atlassian.net/browse/STORYQ-86) (PR #75) removed it from `IAIModel` precisely so that a restore could not assign `undefined` over the working instance. Reading that PR's description first will save time.

So a reopened document knows a run was in progress and which iteration it reached, but has no weights, no encoded data, and no loop to continue. Two further specifics constrain any fix:

- `LogisticRegression.fit` (`src/lib/jsregression.ts`) always starts from scratch. It sets `this.theta = new Array(this.dim).fill(0.0)` and calls `oneIteration(0)`. There is no way to enter the loop at iteration N with a given theta, so resuming requires changing that signature.
- Step mode is driven by a continuation callback held only in memory. `ModelManager.stepModeCallback` stashes the loop's own `oneIteration` as `stepModeContinueCallback`, and `ModelManager.nextStep` calls it. On a reopened document that field is `null`, which is why Step does nothing.

STORYQ-86 added `TrainingStore.trainingWasInterrupted`, set at restore time whenever the restored model says `trainingInProgress`, and the Training pane's red message and disabled Step hang off it. That flag is session state, not document state. This story narrows its meaning from "was interrupted" to "could not be resumed": it stops being the rule and becomes the fallback.

### Chosen approach: replay to the saved iteration

Three approaches were considered in the ticket. **Approach A, replay, is the one being built** (decided, see Decisions).

Rebuild the encoded data the way `buildModel` already does, then run the saved number of iterations with the progress and step callbacks suppressed, then hand control back to the student at that point. The gradient descent here is full-batch and seedless (fixed alpha, fixed lambda, no shuffling, no randomness anywhere in `grad()`), so replaying N iterations from zero weights reproduces the saved state exactly. Nothing new goes into the saved document.

The cost is N gradient passes over the full training data: the same arithmetic the student already sat through, minus the 10 ms `setTimeout` between iterations in a plain run and minus the CODAP write per iteration in a step-mode run, so it is quicker than the original run was. It is not, however, quick. Measured against the project's own reference corpus it runs to about five seconds, which is what requirement 5a's catch-up message exists for. See Decisions.

The two rejected approaches, for the record:

- **B, save theta in the document.** Fastest to resume, but it puts a float array sized by the vocabulary into every saved document, and theta is positional, so the token-to-column ordering has to be saved alongside it and validated on the way back in.
- **C, read the weights back out of CODAP.** `computeResults` writes each token's weight into the Features dataset on every iteration, so they are already in the document. But `computeResults` receives `theta.slice(1)`, so the intercept term `theta[0]` is never written during a run; it is only persisted on completion, as `constantWeightTerm`. C therefore recovers the wrong model unless `lockInterceptAtZero` is true, which is the default but not guaranteed.

## Requirements

### Resuming

1. A document saved during a **step-mode** run reopens with the run intact. Step advances it to the next iteration and continues to completion, producing the same weights, accuracy and kappa as the same run would have produced uninterrupted.
2. A document saved during a **plain (non-step)** run reopens with the run intact and **resumes to completion on its own**, without the student pressing anything. The results are waiting when the student returns to the page. (Resolved with Jie, see Decisions.) Once it completes, the pane is deliberately **indistinguishable** from one where the student trained the model themselves and walked away: no notice, and no persistent record that a resume happened. That is Jie's option (1) as chosen, not an oversight, and it is stated here so that a later reader does not read the silence as a gap and add a notice. A student who was on another tab when they saved may therefore never see requirement 5a's message and will simply find a finished model.
3. The restored run is the *same* run, not a new one with the same name. Resuming does not add a duplicate entry to the trained-model list, does not create a second set of weight cases in the Features dataset, and does not create a second set of result cases in the target dataset. See Technical Notes, which describes how both `prepWeightsCollection` and `prepResultsCollection` currently create duplicates when they meet a model name that is already stamped on the cases.
4. The progress bar, the iteration count, the feature weights shown in the Features table, and the predicted labels in the target dataset all agree with the restored iteration, both before and after the student resumes.
5. Replay is silent: no per-iteration CODAP writes, no progress-bar updates, and no entry pushed to the trained-model list while catching up. Only the state the student would have seen at the saved iteration is visible when replay finishes. Silence is not the same as blindness: the catch-up keeps **one** callback, a watcher that does nothing but notice the loop reaching its truncated last iteration. It is not `progressBar`, so all three promises above still hold, and without it nothing in the plugin would know the catch-up had ended. See requirement 5e.
5e. **The end of a catch-up is signalled by that watcher**, not polled for and not inferred. `fit()` returns `undefined` before the first iteration's work is visible, and with `progressCallback` detached the loop finishes with nothing notified, so three things that all have to happen at that moment would have nothing to hang off: requirement 5a's message clearing, requirement 5c's re-enabling of Step and Cancel, and requirement 7b's handback starting. The watcher is installed as `progressCallback` for the duration of the catch-up only, and `stepModeCallback` stays detached. See Technical Notes for the measurement showing this changes the resulting weights not at all.
5a. While a run is being restored, the Training pane says so, in its existing prompt area, and clears the message when control returns to the student. That covers the eager validation as well as the catch-up, for requirement 5c's reasons, so the message is on screen from the first render after a document with a run in progress is restored. The wording is written for both halves and does not name the gradient replay: what the student needs to know is that the run is being put back, not which phase of putting it back is running. The progress bar continues to show the saved iteration and is not animated during the catch-up, so it never misrepresents where the run is. The prompt container carries `role="status"`, so the message is announced rather than only shown: it reports the status of a process, appears without a change of context, and is therefore a status message under WCAG 4.1.3 (Level AA). Today `training_pane.tsx` sets no `aria` attribute and no `role` of its own, though the rendered pane does carry `role` and `aria-disabled` by way of the `Button` component. Requirement 5b's asynchronous catch-up is what makes the announcement possible at all, since a blocking loop leaves no rendering opportunity for it to land in.
5f. **The role goes on the prompt container in every branch, not on a new catch-up branch**, so the live region exists from mount and the message is a content change inside an established region. **There were five existing branches**, at `training_pane.tsx:34, 41, 53, 60` and `67`, so the catch-up made six, and requirement 11's between-steps message makes seven; the count is stated because the fifth, the final `else` reading "You can start training your model.", is the branch a reopened interrupted document actually renders and therefore the one the catch-up transitions out of. Covering four of the five leaves that transition doing exactly what this requirement forbids. The consequence for a fresh run, which shares the container, is recorded in requirement 7a. This is not a stylistic preference. `modelTrainerInstructions()` returns a `div` from each of its branches at the same position, and React reconciles them to one DOM node: rendering the real pane and flipping the interrupted flag showed the same node reused with only its class and children patched. A role added on a branch would therefore be registered in the same commit as the text it is meant to announce, which is the one arrangement screen readers reliably do not announce.
5g. **The announcement reaches the student only while the Training tab is selected**, and requirement 5a promises no more than that. `TabPanelTabContent` sets `aria-hidden` on every unselected tab, and the Training pane renders eagerly inside it: rendering the real pane inside the real `TabPanel` with Setup selected put the prompt inside `aria-hidden="true"`. A live region there announces nothing. Since requirement 2's auto-resume fires at document open, whatever tab was saved as selected, a student on another tab may get neither the visible message nor the announcement, which is the same accepted consequence the completion decision already records. The identical limit applies to requirement 8's fallback message. Nothing is done about it here: hiding an inactive tab panel from assistive technology is correct, and changing it would mean changing shared UI every panel uses.

5h. **The restoring message is announced everywhere except at document open, and that one exception is accepted.** Requirement 5c has the restoring state set by the time the pane first renders, so on a reopened document the live region enters the accessibility tree already holding the message, and a live region does not announce content that was there when it was registered. Measured: the first render carries `role="status"` and the restoring text together, with no content change to announce. Every other announcement the resume depends on survives, because each is a genuine change inside a region that already exists: a refusal replaces the restoring message with requirement 8's, a Step press on a validated run replaces the between-steps prompt with the restoring message, and completion replaces it with "You have trained 1 model". So the only case that is shown and not heard is the one where the student initiated nothing and is waiting on nothing, which is the same trade-off 5g already accepts for a student on another tab. The alternative, holding the region empty for a render and filling it on the next tick, is deliberate render-timing trickery of the kind the first-round review already retracted once, and it is not taken.
5b. A catch-up runs **asynchronously**, yielding to the browser between iterations, so the plugin stays responsive throughout rather than freezing for the duration. See Decisions for the measurement: this is the existing behavior of the fit loop when `trace` is false, and it costs 10 ms per iteration, under 3% of the gradient work on the reference corpus.
5c. Step and Cancel are both disabled **for as long as a run is being restored**, and are re-enabled when control returns to the student. That period is the eager validation and the gradient replay together, not the replay alone, and it begins at the **first render after the document is restored** rather than when the replay starts. Requirement 5a's message is on screen throughout saying why, and this is the only period in which a student cannot act on a restored run. Disabling rather than wiring Cancel to stop the replay is deliberate: nothing can stop a fit loop in flight today, and giving it that ability is out of scope here (see Out of Scope). Cancel behaves per requirement 6 once the restore has finished, which for a refused resume is the moment requirement 8's message appears.

**The validation half is not caution, it is the half a measurement found doing harm.** In the window between the document being restored and the validation finishing, a run's fate is undecided, and a pane that treats it as an ordinary in-progress run offers the student controls that act on the wrong thing. `TrainingPanel` renders before the restore path has issued a request, and the window then spans `domainStore.fromJSON`'s Features migration, `updateFromCODAP`, the target case sweep, both re-acquisition searches and the rebuild. Measured against a genuine interrupted document with CODAP answering in 20 ms: a student who presses Cancel in that window gets the pane back to "+ New Model" as Cancel promises, **and** the resume completing behind them, writing real weights and predicted labels back over the cases Cancel had just blanked, stamped with the emptied model name, and leaving a nameless 100.0%-accuracy row in their trained-model table. Step is the same story more quietly: it is enabled, it calls into a run with no continuation, and it does nothing. Both go away if, and only if, the disabling starts at the first render.

5cc. **A run being restored is a state the pane can always leave.** Requirement 5c disables the student's only controls, so every route out of a restore must clear that state: validation succeeding in step mode (the pane returns to looking like a live step-mode run awaiting Step), the replay handing back, validation refusing, and anything in the restore path throwing, which requires the rejection path of `updateFromCODAP` to be handled and not only `fromJSON`'s (requirement 9d). **The replay owns its own failure**, rather than relying on whoever called it: in step mode the caller is the pane's Step handler, where a throw becomes an unhandled rejection and the state would be left set with both controls already disabled, so the replay clears it and falls to requirement 8 itself. Starting a fresh run and pressing Cancel clear it as well, per requirement 7b, which is the backstop rather than a path anyone plans to take. A restoring state with nothing restoring it is worse than the fallback it would otherwise reach, because the fallback at least leaves Cancel.
5d. A catch-up that is itself interrupted, by the student closing the document before it finishes, leaves the **training** state unchanged, so the next open resumes from the same iteration and reaches the same place. Specifically `model.iteration` does not move and the rest of the `AIModel` snapshot is untouched, which follows from requirement 5's suppression, since a silent replay never advances `model.iteration`. It is stated rather than left as an inference for a reader to redo. **One field is exempt, and only for a document that predates this story**: requirement 9a's row count is re-recorded before the catch-up starts, so a snapshot that arrived without it comes back carrying it. For a document saved by this build the value is necessarily the one already there, since a mismatch would have refused the resume, so the snapshot is unchanged exactly where requirement 9c cares about it. Nothing else on the `AIModel` may be written by the resume path; see requirement 7b, which is what keeps `ignoreStopWords` off this list. **The document is not byte-identical**, and is not meant to be: a resume that got as far as a catch-up is a resume that proceeded, so it has already committed its rebuild per the eager-validation decision, and `featureStore.tokenMap` carries the committed counts and ordering. That is the same state a catch-up which ran to completion would have left, which is why the next open lands in the same place, and it is why requirement 9b writes its re-imposed ordering back into the map.
6. Cancel on a restored run clears the same data that Cancel on a live run clears: the weight cases stamped with the model name, and the predicted labels and probabilities in the target dataset. The restore path therefore re-acquires `featureStore.featureWeightCaseIDs` and `trainingStore.resultCaseIDs` whenever the restored model says `trainingInProgress`, whether or not the run turns out to be resumable. See Technical Notes: neither collection is saved with the document, so today a Cancel on a reopened document issues two update requests with no values in them and wipes nothing.
6b. **The weight case IDs are re-acquired by searching the weights collection for the restored model's name**, mapped back to token names through each case's `parent`. That name is written by `prepWeightsCollection` before any fitting starts, so it is present for a plain interrupted run as well as a step-mode one, and it is the only discriminator that does not depend on which of `prepWeightsCollection`'s two branches the interrupted run happened to take. Reading the features collection by index instead, which is what the existing `getFeatureWeightCaseIDs` helper does, is right only for the first model a document ever had. See Technical Notes.
6bb. **The attribute is named `model name`, with a space, so the formula has to backquote it.** This is not a detail that can be left to the implementation: measured against a real CODAP document, `caseFormulaSearch[model name=='Model C']` comes back `success: false`, while ``caseFormulaSearch[`model name`=='Model C']`` returns the run's cases. Every existing `caseFormulaSearch` in the plugin searches `name` or `type`, both unspaced, so there is no prior art in the file to copy from and the failure is silent in the sense that matters: a refused resume, not an error. The model name is student-typed, so it also needs the escaping `feature_store.ts` already applies before an equality search, backslash-escaping backslashes and apostrophes; measured, a model named `Jie's Model A` matched correctly that way, and inside double quotes, while doubling the apostrophe failed. See Verified behavior, finding 11.
6c. **An ambiguous weights re-acquisition refuses the resume** rather than guessing. If the search does not yield exactly one weight case per token in the **saved** token set, the one recorded in the restored `tokenMap`, the run falls to requirement 8's fallback (requirement 9, third condition). This costs a resume in a case the plugin cannot identify, and it buys the guarantee that a resume never writes weights over a completed model's, which is the failure requirement 6 exists to prevent rather than to create. Requirement 9c is unaffected, because a document with one model resolves unambiguously. **The saved set rather than the rebuilt one** is deliberate and is not a weakening: it lets the search run before the rebuild, alongside requirement 6a's, so that requirement 6 has its case IDs on the path where the resume is refused as well as the one where it proceeds; and the two sets are identical in every case where a resume would go ahead, because a set that differs is refused by the token-set check regardless.
6cc. **That count is a count of the *visible* weight cases, and CODAP hides some of them.** An inactive model's weight cases are set aside by `domainStore.syncWeightsAndResultsWithActiveModels` whenever a run completes or the student changes which models are active, and a set-aside case does not come back from a `caseFormulaSearch`. Measured on a three-model document, the weights collection returned 60 cases rather than 90, the missing 30 being the inactive model's, and a `restoreSetasides` notification brought them straight back. This does not weaken requirement 6c for the run it guards: an interrupted run is never in `trainingResults`, so nothing ever sets its weight cases aside, and its own count is exact. It is recorded because the count reads like a property of the document and is not one, so a later reader must not "fix" 6c by counting every weight case in the collection, and must not conclude from a low total that the re-acquisition is broken. The resume neither restores nor creates set-asides. See finding 12.
6a. **The result case IDs are re-acquired as the last child of each target case**, taken in the order of the target case list the resume captured (requirement 9a), so that the positional pairing `showPredictedLabels` relies on still holds. One `caseFormulaSearch[true]` on the results collection is enough: every case it returns carries its `parent`, so the grouping is done in the plugin rather than in a request per target case. The results collection accumulates one child case per target case **per model**, so the unfiltered list is not the restored run's set, and taking the newest child of each parent is what selects it. Selecting by the restored model's name instead does not work, because a plain interrupted run has never written a name onto its result cases: see Technical Notes, "What an interrupted run has actually written". The rule rests on CODAP returning a parent's children in creation order, which a mocked CODAP cannot settle; it was measured against a real three-model document and reproduced the live `resultCaseIDs` exactly, all 500 of them. See finding 11.
7. Resuming changes nothing about the training algorithm, its hyperparameters, or its results. Replaying to iteration N and continuing must produce results identical to an uninterrupted run of the same model.

### Leaving a fresh run alone

7a. **Nothing about a fresh training run changes.** A student who opens a document with no run in progress, or starts a new model in this session, gets exactly today's behavior: the same buttons, the same progress bar, the same per-iteration CODAP writes, the same weights. Every mechanism this story adds is reached only from the restore path, and only when the restored model says `trainingInProgress`, with **three stated exceptions**, none of which touches an item this requirement enumerates.

The first is that a fresh run records the row count it is fitting (requirement 9a), because a document only acquires an interrupted run by being saved during a fresh one, so nothing else can ever write it. That exception adds a field to the saved snapshot and changes no button, no progress bar, no CODAP write and no weight.

The second is that **a fresh run gains screen reader announcements it does not make today**, because requirement 5f puts `role="status"` on a prompt container the fresh-run flow shares. Measured by walking the real pane through an ordinary run: nothing is announced at mount, where the region is registered holding "Train your model with the features you have prepared."; then "Your model must have a name before you can train it." on + New Model, "You can start training your model." on typing a name, nothing on Train, and "You have trained 1 model. Train another or proceed to Testing." when the run completes. Four announcements, no visual change, and nothing else about the run different. This is accepted rather than worked around. Two of the four are neutral restatements of something already on screen, and the last is a gain: it closes the gap the first-round accessibility review named when it noted that a screen reader user learns nothing today when the pane silently switches to "You have trained 1 model", a gap that review recorded and deferred. The alternative that would have avoided it, a separate always-mounted live region holding only the resume's own messages, needs a visually-hidden class the project does not have and so means new shared CSS; it is left to the pending accessibility ticket that already owns `ProgressBar` and `Button`, where such a class can be added once for the whole plugin rather than for one message.
The third is that **a live step-mode run's between-steps prompt is reworded**, from "You can start training your model." to "You can continue training your model." That branch is where a validated step-mode resume is handed back, so a restored run reads correctly only if a live one does too; the two states are the same state, which is the point of handing a resume back into it. It changes no button, no progress bar, no CODAP write and no weight, and the message it replaces was wrong for a run already part way through. Raised by Doug against the running build on Jie's document (see requirement 11).

7b. Concretely, this constrains the implementation in seven places:
    - `fit()` gains its starting iteration and starting theta as **optional** parameters, so `fit(data)` with no extra arguments behaves exactly as it does today. Those two parameters are the whole of the change **to `fit`**: a resume is two calls to the same function, a silent catch-up from zero and then a handback that starts at the saved iteration plus one with the real callbacks restored, and the handback's own first iteration is what re-establishes `stepModeContinueCallback` and advances the run one step. Nothing else in `fit` moves, no new way of getting the loop's continuation out of it is needed, and in particular `fit` does not gain a return value or a promise: what sequences the handback behind the catch-up is requirement 5e's watcher, which is configuration of the existing instance rather than a change to the function. See finding 9.
    - `buildModel` gains a resume variant rather than growing a branch that a fresh run passes through. That variant takes its target cases as a parameter, because the field `buildModel` reads today is not safe to read on the restore path (requirement 9a).
    - `prepWeightsCollection` and `prepResultsCollection` keep their existing create-versus-update logic untouched for a fresh run; resume behavior is additional, not a modification.
    - The Training pane's new state is a branch off the restored-run case only.
    - `FeatureStore` gains `snapshotTokens()` and `restoreTokens()`, called only from the resume path.
    - `buildModel` and its resume variant both record the row count they are fitting, which is 7a's one stated exception. Without it in `buildModel`, no document saved during a first interruption would ever carry the field, and requirement 9's row check would never run on the documents it was added for.
    - **The shared encoding writes nothing to the `AIModel`, and one existing line has to move for that to be true.** `buildModel` calls `trainingStore.model.setIgnoreStopWords(...)` from the middle of the code the resume variant shares, so lifting the encoding out without lifting that call out of it leaves the *validation* rebuild writing `ignoreStopWords` into the restored model. Measured (finding 14): with a restored document saying `true` and the student's unigram feature saying `false`, the model came back `false`, and `restoreTokens` does not undo it, because it restores the token maps and nothing else. A refused resume would therefore alter the very document the eager-validation decision promises it leaves alone, and it would do so in exactly the case that produces a refusal. The call stays in `buildModel`; the shared encoder reports the value and assigns nothing.
    - **The session state the resume adds is cleared wherever the existing flag is cleared**, which is `buildModel` and `cancel()`. `trainingCouldNotBeResumed` is already cleared in both; the pending-resume and catching-up flags requirement 5c and requirement 1 need have to join it. Without that, a student who reopens a step-mode run, presses Cancel rather than Step and then trains a new model carries a stale pending-resume flag into the fresh run: `TrainingPane`'s Train button calls `nextStep()` immediately after `buildModel()`, so the resume guard at the top of `nextStep` fires a catch-up on top of the fit loop that has just started, two loops driving one `LogisticRegression`, with Cancel disabled behind a message about restoring a run that was never interrupted. That is a fresh run visibly changed by this story, which is what 7a forbids.
7c. A test asserts this directly: a fresh run of N iterations produces weights bit-for-bit identical to the same run before this story. Finding 2 below shows this is achievable exactly, not approximately, so the test is a real guard rather than a tolerance check. **The golden values come from the pre-change build**, since once the change is in there is nothing left to compare against and the test would otherwise be authored against the new code and guard nothing. They are captured already, in [`golden-weights.json`](golden-weights.json) in this folder: a deterministic dataset, its generator, and the resulting `theta`, `cost` and `constantWeightTerm` for both the locked and unlocked intercept, taken from the build at the head of this branch.
7dd. **Both baselines have been run against the changed code, and mutation-tested.** Reproducing them is not left as an instruction: `golden-weights.json` gives bit-identical `theta`, `cost` and `constantWeightTerm` for both intercept settings against the two-parameter `fit`, with `fit(data, 0, undefined)` matching `fit(data)`; `golden-fresh-run.json` gives the same 11 tokens, the same 40 by 12 matrix, the same prep branches, the same case-ID maps and the same 31 requests. Because a green baseline says nothing about what it would catch, four deliberate regressions were then introduced. Three are caught: the shared encoder reading the unsafe field instead of its parameter, the prep steps reordered, and `fit`'s starting iteration defaulting to 1. **One is not**: moving `setIgnoreStopWords` back inside the shared encoder, which is requirement 7b's subtlest bullet and the regression finding 14 measured. It survives because on a fresh run the assignment happens either way and lands on the same value, so a baseline recording the run's inputs cannot see where they were written. Requirement 19's refused-resume assertion is what catches it, measured in both directions, which means the guard on that line lives in a different test from the code. Two mechanical notes for whoever writes these: the weights artifact records the **full** `theta`, whose zeroth element is the intercept, not `fitResult.theta`; and the fresh-run artifact pins its document case IDs only implicitly, inside `tokenMapAfterExtraction`, so they must be `100…139` or every headline figure matches while that one comparison fails.

7d. **Weights are only one of the five places 7b constrains**, and `golden-weights.json` reaches only that one: it feeds a matrix straight to `LogisticRegression.fit` and never goes through `oneHot`, the prep steps or the pane, which is where a regression in this story would actually live, since `fit` is the part that changes least. A second pre-change baseline therefore covers the rest, in [`golden-fresh-run.json`](golden-fresh-run.json): a fresh `buildModel` driven end to end against a mocked CODAP, recording the rebuilt `tokenArray` with its ordering and counts, the encoded matrix, which branch each prep step took, the resulting `featureWeightCaseIDs` and `resultCaseIDs`, and the shape of all 31 CODAP requests. Captured from the same commit and reproduced identically in two separate processes. A test compares a fresh run against it.
7e. **The baseline has one trap in it, recorded in the artifact and repeated here because it applies to any test written against a fresh run.** `buildModel`'s `oneHot` call takes the branch that only adds constructed-feature tokens, so the unigrams have to already be in `tokenMap` from ngram extraction. A test that sets up a fresh run without seeding the token map that way silently fits a **one-column** model, and will pass against almost any regression. The first capture attempt did exactly this before the seeding step was added.

### The fallback

8. Where the run cannot be resumed, the student is told, rather than being left with a Step that silently does nothing. The STORYQ-86 message and the disabled Step are kept for exactly this, so the behavior a student sees today becomes the fallback rather than the rule.
9. At minimum, the fallback covers a run whose chosen features or target data changed between saving and reopening, so that the rebuilt column set no longer matches the one the saved run used. Specifically, the resume is rejected when the rebuilt token set differs from the one recorded in the restored `tokenMap`, or the current target case count differs from the row count the saved run used, or the weight cases the interrupted run wrote cannot be identified unambiguously (requirement 6c), or the restored `tokenMap` is empty, or **there are no target cases to fit at all**, or **a constructed token in the restored map no longer corresponds to a live feature**. The fourth is listed because it is a condition in its own right rather than a special case of the first: an empty map records no column set at all, so there is nothing for the token-set comparison to be a comparison against, and a run whose saved columns are unknown cannot be shown to be the run being rebuilt. The fifth is listed because none of the other four catches it. The encoding produces one row per target case, so no target cases is exactly an empty matrix, and `fit` reads `data[0].length` on its first line; the token-set check passes straight through, because rebuilding over no documents leaves `tokenMap` untouched, and the row check is skipped for the documents this can happen to. It is reachable only for a document that predates this story, since a story-era one is refused by the row check, and it does not need target rows to have been deleted: `updateTargetCases` returns an empty list without querying when the target attribute name is empty, and a `success: false` search returns one too, so a target dataset renamed or removed while the document was closed arrives here on a successful round trip. The rejection is taken before the rebuild, so it costs the document nothing (requirement 19). 

The sixth is the one condition here that the first does not subsume even though it looks as though it should. A constructed token stays in `tokenMap` when its feature is unchosen or deleted: `toggleChosenFor` sweeps tokens only for the unigram feature, and `deleteFeature`'s non-unigram branch never calls `deleteToken`. So the rebuilt token set is unchanged while the column that token encodes has gone to all zeros. Measured, on a run whose constructed feature was unchosen while the document was closed: ten columns before and ten after, the token present in both, the resume approved, and the feature's column reading `01010101` in the interrupted run and `00000000` after reopening. That is a different training set fitted silently, which is the failure requirement 7b's shared-encoding wording exists to prevent. The condition is that every constructed token in the restored map still names either a chosen feature or a target column feature; the second half is not optional, because target column features have constructed tokens with no `Feature` object of their own and a check that consulted only `chosenFeatures` would refuse every document that uses one.
9e. **The token-set check cannot see an edit to the text of an existing row, and requirement 9 claims no more than it delivers.** `buildModel`'s `oneHot` call takes the branch that adds only constructed-feature tokens, so the unigrams come from the restored `tokenMap` rather than from the current texts, and a word introduced by an edit never enters the column set. Measured: three of eight texts were rewritten to introduce a word well clear of the frequency threshold, and the rebuilt column set was identical, so the resume proceeded. The row count does not catch it either, since no row was added or removed. What requirement 9 therefore covers is a changed **feature** set, a re-extraction, and a changed row count. **The feature half of that took a sixth condition to make true**, and did not hold when this was first written: adding a feature is caught by the token-set check and unchoosing the unigram feature is caught because its tokens are deleted, but unchoosing or deleting a *constructed* feature left its token in the map and went undetected. That case is now refused rather than accepted, and it is the one place this limit was cheap to close: unlike a text edit, it needs no saved signature and no hashing pass, only a comparison against state the document already carries. A run whose texts were edited in place resumes against the current data and completes coherently; it is simply not the fit the interrupted run would have produced, which is the same bounded consequence the migration decision already accepts for documents that predate this story. Closing it would mean saving a signature of the texts, which is a second saved field and a hashing pass in code every fresh run executes, and it was weighed and not taken. See finding 13.

9a. The saved run's column set and ordering are taken from the restored `tokenMap`, captured on the restore path before any rebuild touches it. One new **optional** field, the row count the run was fitting, is added to `IAIModel` to close the case that `tokenMap` alone cannot see. Documents saved before this story do not carry it, and for those the token-set comparison stands alone rather than the resume being refused. The field is present-and-undefined in `defaultModel` and assigned unconditionally by `import`, like every other field, so `reset()` clears it and a stale count from a finished or cancelled run never reaches the next save. See Decisions. The row count and the rebuild both read a target case list the resume captured itself, never `targetStore.targetCases`: that field is reassigned with a *filtered subset* by work that fires unawaited on every document open, so reading it can both reject a resumable run and rebuild against the wrong documents. See Technical Notes.
9b. Where the rebuilt token set matches, the saved column ordering is re-imposed on the rebuilt `tokenArray`, on the columns of the encoded data, **and on the `index` values in `tokenMap` itself**, so that replay reproduces the interrupted run bit for bit rather than to within floating-point rounding. The third of those is not a tidiness measure: without it a resume commits the *rebuild's* ordering, and a document interrupted a second time re-imposes that rather than the original run's, so the guarantee holds for one interruption and quietly stops holding for the next. See Decisions for the measurement, and finding 10 for the same result on the real rebuild path rather than a simulation of it.

This is best-effort, and **"no usable ordering" has to be a test rather than a hope**. `getNewToken` defaults `index` to `-1`, and a map whose tokens all carry `-1` sorts into insertion order under the obvious comparator, so the resume would re-impose that as though it were the saved ordering rather than noticing it has none; measured, finding 14. The saved ordering therefore counts as usable only when every restored token carries a distinct, non-negative `index`, and the re-imposition is skipped altogether otherwise, the resume proceeding on the rebuilt order and accepting finding 3's one-ULP difference. The token **names** are taken from the restored map either way, since membership (this requirement's first condition) and requirement 6b's weight search need the set rather than the order. Ordering is never a reason to refuse a resume.

That case does not recur, which is worth knowing before anyone tries to make it recur less. `oneHot` assigns `0…n-1` onto the token objects the map holds, so a resume that proceeded without a usable ordering commits a map that has one, and a document interrupted again after that gets the full treatment. The unusable case can only be a document from before this story whose map never carried indexes.
9c. **An interrupted document saved by the current build must resume.** This is the story's acceptance test in practice, not a hypothetical: the fallback exists for runs that genuinely cannot be rebuilt, not for every document that predates the release.
9d. If the restore itself fails, the run falls to the requirement 8 fallback and says so, rather than being left in limbo. A resume is sequenced behind the promise `domainStore.fromJSON` returns (see Technical Notes), and that promise can reject; a resume that neither attempts nor explains is the exact failure this story exists to remove.
10. `TrainingStore.trainingWasInterrupted` changes meaning from "a run was interrupted" to "a run could not be resumed", and is set only after a resume has been attempted and rejected. It stays session state and stays out of `TrainingStore.asJSON()`. **What `TrainingStore.fromJSON` sets in its place is the restoring flag requirement 5c needs**, because the two answer different questions: whether a run can be resumed takes a rebuild against the current features and target data and is not knowable there, while whether a run is *about to be restored* is knowable from the restored model alone and is needed before the restore path has issued its first request. It is assigned rather than only set, so that restoring a document with no run in progress clears what an earlier one left.
10a. **The flag is renamed to match**, to `trainingCouldNotBeResumed` or similar, and **so is the local the Training pane derives from it**, along with both of their comments. `training_store.ts`'s comment is rewritten: it currently explains at length that a restored run "has nothing left to continue, so the run has to be started over", which this story makes false. The distinction the new name draws is what the whole requirement turns on, so leaving the old name would have the pane's `tModel.trainingInProgress && trainingStore.trainingWasInterrupted` read as a redundancy check rather than as the fallback condition it becomes. Both the flag and the comment came in with STORYQ-86, so this finishes that work rather than churning unrelated code. The pane's local carries the same problem one scope down: it reads `const trainingWasInterrupted = tModel.trainingInProgress && trainingStore.trainingWasInterrupted`, under a comment saying a restored run "has nothing left to continue, so Step cannot advance it", which this story makes false. Renaming it matters more than a store field would, because it is what the pane's conditions read: left alone, `disabled={tDisabled || trainingWasInterrupted || isRestoringRun}` puts the old meaning and the new one side by side in a single expression.
10b. A resume is attempted at most once per restored run, and a restore arriving while one is in flight is ignored. See Technical Notes: this guard is defensive rather than a fix for an observed bug. **"While one is in flight" is the operative half, not a refinement of "at most once".** A guard that latched for the life of the plugin instance would satisfy the first clause and break requirement 5cc: a second restored document's `fromJSON` sets the restoring flag, the guard returns before anything can clear it, and the pane is left showing the restoring message with Step and Cancel disabled and no route to either, since Train is suppressed while a run is in progress and Cancel is disabled by requirement 5c. The guard therefore holds the in-flight resume rather than a boolean, and clears when that resume settles. Its early return deliberately touches no state: the resume already running owns the restoring flag, and every exit that resume can take clears it.
11. The message and hint wording stay as STORYQ-86 wrote them unless the narrower meaning makes them inaccurate. Current text: "Training \<model name\> was stopped, and it cannot be picked up from where it left off. Press Cancel to start over." and hint "This training run was stopped and cannot be continued. Press Cancel to start over."

11a. **Two messages are new, and one existing message is reworded.** New: the restoring message, "Restoring \<model name\> to where it left off…", and its hint, "This training run is being restored to where it left off. It will be ready in a moment." Reworded: the prompt a step-mode run shows between steps, which read "You can start training your model." and now reads "You can continue training your model." A validated resume is handed back into exactly that state, so telling a student who is part way through to start was wrong for a restored run and had been wrong for a live one since before this story; it is fixed for both rather than only where the resume exposed it. The branch is conditioned on a run being in progress in step mode, so a named model that has not been trained still reads "start". All three are student-facing copy that Jie may want to word herself. The plain-run case, which shows the same prompt while training with only Cancel to press, is left alone: "continue" is no truer there than "start", and there is no control it could be inviting.

### Testing

Run the suite with `npx jest`, which is what the `test` script does and what `jest.config.js` configures. It is green: at the time of writing, **16 suites and 106 tests, all passing**.

`react-scripts test` is not, and the difference is worth understanding before concluding that the base these tests extend is broken. Measured, `CI=true npx react-scripts test --watchAll=false` gives **5 suites failed, 11 passed; 22 tests failed, 84 passed**, every failure being `toBeInTheDocument is not a function`, `training_pane.test.tsx` among them.

The cause is a path, not a configuration subtlety. `jest.config.js` sets `setupFilesAfterEnv: ['@testing-library/jest-dom']`, importing the matcher package directly. Create React App instead resolves its own setup file at `src/setupTests` (`react-scripts/config/paths.js:74`) and passes an **empty** `setupFilesAfterEnv` when it finds none (`createJestConfig.js:36`). This repo's file is at `src/test/setupTest.ts`, which is the wrong directory and singular, so CRA finds nothing and registers no matchers. That file is loaded by neither runner and referenced nowhere in the repo; its whole content is the one import CRA would have run had it been named `src/setupTests.ts`.

Moving it there would make both runners work. That is a one-line tidy-up belonging to whoever wants it, not to this story, which is why it is recorded here rather than done.

12. Tests cover the full round trip: save mid-run, restore, resume, complete, and assert the result matches the uninterrupted run. STORYQ-86 left `training_store.test.ts`, `model_manager.test.ts` and `training_pane.test.tsx` in place, and these extend them. **They wait on the observable end state**, a trained-model entry appearing, the model being reset, the weights written, rather than awaiting a promise: nothing in the completion path is awaitable, and the same applies to the accuracy and kappa requirement 1 asks for, which are set inside that unawaited region. See Technical Notes.
13. A test covers the fallback path: a restored run whose rebuilt column set does not match is rejected, the message appears, and Step is disabled.
14. A test covers requirement 3, that a resumed run does not duplicate the weight cases, the result cases, or the trained-model list entry. **It runs against a document that already holds one completed model**, because a document with a single model cannot tell a correct re-acquisition from a wrong one: only a second model puts more result cases in the collection than there are target cases. It asserts the specific IDs requirement 6a selects, not merely their count. [`real-codap-interrupted-document.json`](real-codap-interrupted-document.json) is what its mock should be shaped like: a real three-model document, with the accumulated result children, the interrupted run's blank result cases and its named-but-weightless weight cases. Note while writing it that an inactive model's weight cases are missing from a real document and its result cases are not (Technical Notes), so a mock that hides both, or neither, is not the shape CODAP actually produces.
14a. A test covers requirement 9's fifth and sixth conditions, which are the two the token-set check cannot reach and which fail in opposite directions. The fifth, no target cases to fit: a pre-story snapshot with an empty target case list is refused rather than approved, since `fit` reads `data[0].length` on its first line. The sixth, a constructed feature unchosen or deleted: **the token set is identical in this case**, so the test must assert the encoded column rather than the verdict alone, and it must include a document using a target column feature, whose constructed tokens have no `Feature` object and which a check consulting only `chosenFeatures` would refuse outright.

15. A test covers requirement 9a's optional row count, on both the read and the write. Reading: a snapshot without the field resumes on the token-set check alone, and a snapshot with a mismatched count is rejected. This is the guard on requirement 9c, that an already-saved interrupted document still opens and works. Writing: a run started by this build and saved mid-training carries the count, and a resumed run re-records it, so that a second interruption is still fully checked. Without the write half, the read half passes against documents that never carry the field.
16. A test covers the message of requirement 5a: it is present from the first render after an interrupted document is restored, stays up through the validation and the catch-up, and is gone once control returns to the student, with Step and Cancel disabled for exactly that window (requirement 5c). **One case is about what the disabling prevents rather than about the message**: with a plain interrupted run restoring and CODAP answering slowly, a `cancel()` issued before the validation resolves must leave no weights, no predicted labels and no trained-model entry written afterwards. Measured before the window was covered, that sequence wrote all three. **And one is about leaving the state**: each of requirement 5cc's exits puts the pane back somewhere the student can act, including the one where the restore path throws. **The guard on requirement 5f is a separate test and asserts the invariant rather than a transition**: the prompt container carries `role="status"` in every branch it can render, walked one branch at a time. A before-and-after test on one transition is the weaker guard, and a vacuous one if its "before" state happens to be a branch that already had the role; the transitions have also moved twice during review while the invariant has not. One node-identity assertion belongs with it, since the reconciliation is what makes the invariant necessary, and one on the Step press, since that is the announcement a student is actually waiting on.
17. A test covers the iteration off-by-one: a run restored at iteration N and resumed lands on the same weights as an uninterrupted run, which is the only place the off-by-one is observable.
18. A test covers Cancel on a restored run whose resume was refused: the weight cases and the result cases are cleared, not left stamped with the abandoned model's name. Asserting on the requests sent to CODAP is enough, and it is what catches the current failure, since today's Cancel sends two updates whose `values` arrays are empty. **It asserts the IDs in those requests, not only that they are non-empty**, because a re-acquisition that reads the wrong collection also produces non-empty requests and would otherwise pass. It covers both modes, since a plain interrupted run has only the stamped model name on its weight cases to clear while a step-mode one has weights and predicted labels too (see Technical Notes).
18a. A test covers requirement 6c: a document whose weight cases cannot be resolved one per token falls to the requirement 8 fallback rather than resuming, and Cancel from there still clears the result cases **and every weight case the search did resolve**. Resolving the cases and deciding the resume are two separate answers taken from one search, not the same answer used twice: the resume proceeds only on a complete result, while Cancel takes whatever was resolved, because clearing a case the interrupted run wrote is safe even when the set is incomplete, and refusing to clear any of them would leave the abandoned model's name in the Features table beside a message telling the student that Cancel starts them over. An all-or-nothing re-acquisition would satisfy requirement 6c and quietly fail requirement 6 on the one path requirement 8 sends every student down. **Both searches report the same pair**, requirement 6b's and requirement 6a's alike: a target case added while the document was closed has no result child, which refuses the resume, and the results Cancel can still identify should not be thrown away with it. The residue is a token that has two weight cases: `featureWeightCaseIDs` is keyed by token and holds one id per token, so only one of the two can be cleared. That shape predates this story and is not widened by it.
19. A test covers the token maps after a refused resume: `tokenMap` and `caseIdTokenMap` are identical to the ones restored from the document, counts and indexes included, so that opening a document never alters it. The counterpart is worth asserting too: a resume that proceeds does commit its rebuild.
19b. **`caseIdTokenMap` is asserted for identity, not for byte-equality with what a reopen starts with.** `featureStore.fromJSON` restores `tokenMap` and never touches the id map, so on a reopened document it is empty and repopulates lazily through `getTokenByCaseId`. `restoreTokens()` rebuilds it from the copied token objects, which is what that lazy repopulation would have produced anyway and is the only way the two maps end up agreeing on identity. So the test asserts that every token in the restored `tokenMap` is the same object the id map holds for its `featureCaseID`, rather than comparing the id map against the empty one the reopen began with. Measured, finding 13.

19a. **That test's expected value must be a deep copy taken before the rebuild.** Written the obvious way it asserts nothing: after a rebuild that a refusal was supposed to undo, comparing the live map against `toJS(featureStore.tokenMap)` passes, and against `featureStore.asJSON().tokenMap` passes, because both are the live map. Only a comparison against a deep copy fails, which is what a guard on requirement 19 has to be able to do. A test of `snapshotTokens()` and `restoreTokens()` themselves is the cheaper place to put this, and it should assert the identity between the two restored maps as well as their contents.
20. A test covers requirement 5d: a catch-up abandoned partway leaves `model.iteration` and the rest of the **`AIModel`** snapshot exactly as the document had them, so a second open replays to the same place. It must not assert on the whole document snapshot, because a resume that reached a catch-up has already committed its rebuild and `featureStore.tokenMap` legitimately differs. **It runs against a document saved by this build**, which is the case requirement 9c makes the acceptance test and the only case where the whole-snapshot assertion is true: requirement 5d exempts the row count for a document that predates the story, where the field goes from absent to present. A test written on a pre-story snapshot has to assert every field but that one, and is the weaker guard for it. The complementary assertion is requirement 20a.
20a. A test covers requirement 9b's writeback: a document interrupted, resumed and interrupted again encodes its training data identically on the second open as on the first. Simulating four successive open-and-commit cycles, the ordering re-imposed on the array and the data alone is stable only on the first open; writing it back into `tokenMap` is what makes every open identical. Finding 10 repeated that over the real rebuild path and got the same split, so the test has a measured expectation on both sides rather than only the one it asserts. **The corpus it runs on has to drift**, or the test passes with the writeback removed: pick one where a constructed feature's count inflation lifts it past a unigram in the sort, and assert the without-writeback case as well.

## Technical Notes

### Files this touches

| File | What changes |
|------|--------------|
| `src/lib/jsregression.ts` | `fit()` needs to start at a given iteration with a given theta, and needs a silent catch-up path that does not go through `setTimeout` or the callbacks |
| `src/managers/model_manager.ts` | `buildModel`'s setup path needs a resume variant, and has to keep its `setIgnoreStopWords` call out of the shared half; `nextStep` needs a continuation callback to exist after a restore; `prepWeightsCollection` and `prepResultsCollection` need resume behavior; `buildModel` and `cancel()` clear the resume's session state along with the flag they already clear |
| `src/stores/training_store.ts` | `trainingWasInterrupted` becomes "could not be resumed" rather than "was interrupted", and `fromJSON` sets a restoring flag in its place (requirements 10 and 5c); two further pieces of session state for the resume |
| `src/components/training_pane.tsx` | the message and the disabled Step become the fallback branch; a catch-up adds its own message and disables Step and Cancel for its duration |
| `src/models/ai-model.ts` | one new **optional** saved field, the row count the run was fitting, for the invalidation check (see Decisions) |
| `src/stores/feature_store.ts` | `snapshotTokens()` and `restoreTokens()`, so the validation rebuild can be undone when the resume is refused; neither is reached from a fresh run |

### The iteration off-by-one

`oneIteration(i)` applies gradient step *i+1* and *then* calls `progressCallback(i)`, which is what sets `model.iteration`. So a saved `iteration` of N means **N+1 gradient steps have been applied**, and replay must apply N+1 steps to reproduce the saved theta, then continue from step N+2 (loop index N+1). The one exception is the terminal call: the `else` branch runs at loop index `iterations`, builds `fitResult`, and calls `progressCallback(iterations)`, so a completed run ends with `iteration === iterations` after `iterations` gradient steps. Getting this wrong by one is invisible in the UI and shows up only as weights that do not match an uninterrupted run.

### There is no promise that means "the run finished"

`ModelManager.progressBar` is an `async` method whose entire body is `runInAction(async () => { ... })`, with the inner promise neither returned nor awaited. `runInAction` only ever wraps the synchronous prefix of an async function, so `await this.progressCallback(iIteration)` inside `oneIteration` resolves as soon as the inner function reaches its first `await`. Traced order with a callback of that shape attached to a real fit:

```
progress-enter-0, progress-return-0, fit-returned, progress-after-await-0, step-0, ...
```

`fit()` returns during iteration 0, and at the end of a run the completion work (`computeResults`, the `trainingResults` push, `syncWeightsAndResultsWithActiveModels`, `recreateUsagesAndFeatureIDs`, `tModel.reset()`) runs unobserved by anything that could wait for it. Accuracy and kappa are set inside that region too, by `showPredictedLabels`.

Nothing in the product needs a completion promise: the auto-resume fires and forgets, and the pane updates through mobx observation. Only the tests need to know, which is why requirement 12 has them wait on the end state instead. Recorded here so that nobody hunts for a promise that does not exist and concludes they have wired the resume up wrongly.

### Duplicate CODAP cases on resume (requirement 3)

Both prep steps assume they are starting a fresh run, and both misbehave when re-run against a document where the model name is already stamped on the cases:

- `prepWeightsCollection` decides between updating and creating by calling `allFirstWeightCasesAreEmpty()`, which tests whether the weight case for each token has an empty `model name`. On a resumed run those names are already set from the interrupted run, so it takes the **create** branch and adds a second weight case per token.
- `prepResultsCollection` finds the results collection already exists, so it takes the **else** branch and creates a new child case under every target parent case, duplicating the result rows.

A resume path therefore has to re-acquire the existing case IDs (`featureStore.featureWeightCaseIDs` and `trainingStore.resultCaseIDs`, neither of which is saved with the document) rather than letting either prep step create new ones.

**`featureWeightCaseIDs` does not always hold the same kind of id, which is why requirement 6b does not simply reuse the existing helper.** `prepWeightsCollection` fills it from whichever branch it takes, and the branch turns on whether a model name is already stamped. Driven against a fake Features dataset with a real parent-and-child shape:

```
model A (the first this document ever had)  branch UPDATE  ids {"alpha":700,"beta":701}   <- features-collection parents
model B (started after A finished)          branch CREATE  ids {"alpha":850,"beta":851}   <- weights-collection children
```

The first model's update works only because a parent case and its single child share an item, so a write addressed to the parent lands on the child. A second model adds a second child and that coincidence is gone. Nothing fails loudly when the wrong ids are used: CODAP resolves case updates by id and attributes by name across the whole dataset (`handleCase.update` calls `getCaseByID`, `doUpdateCasesFromHashOfNameValues` calls `getAttributeByName`), so the collection named in the resource is checked for existing and otherwise ignored.

**One piece of pre-existing uncertainty is deliberately not resolved here.** The create branch parents its new cases with `parent: aToken.featureCaseID || 0`, and `domain_store.ts:346` says of that id, in a comment, that it does not know whether it is the feature case or the feature's first child case. So for a second-or-later model it is unclear whether the weight cases are correctly parented at all. This story does not investigate that and does not build on it: requirement 6c refuses the resume when the weight cases cannot be identified one per token, which turns the unclear case into the fallback requirement 8 already owns. If the two-model test called for by requirement 14 shows the parenting is wrong, that is a pre-existing defect wanting its own ticket, not a resume bug.

The results collection is not merely re-enterable, it **accumulates**: `guaranteeResultsCollection`'s else branch adds one child case under every target parent case, unconditionally, for every model after the first. Measured against a mocked CODAP with five target cases, model A leaves five result cases and an interrupted model B leaves ten, of which only the second five are B's. `showPredictedLabels` pairs them positionally, `trainingStore.resultCaseIDs[iIndex]` against `documents[iIndex]`, and `cancel()` maps the same array, so an unfiltered re-acquisition would write B's labels into, and a Cancel would blank, cases belonging to a model the student has already finished. Requirement 6a is what selects the right set, and finding 11 measured it doing so on a real three-model document. Cases that CODAP has set aside cannot confuse it: `setAside` goes through `deleteCasesAndChildren` and `regenerateCollectionCases`, so a set-aside case is gone from the collection and never comes back from a search. Finding 12 confirms that from the outside, and requirement 6cc records the consequence for the weights count.

**As it happens, results are never actually set aside, and weights are.** `syncWeightsAndResultsWithActiveModels` builds its set-aside messages in `trainingResults.forEach(async iResult => ...)`; the weights half is synchronous and lands in `tMessages`, while the results half awaits a `caseFormulaSearch` first, so the batched `sendRequest(tMessages)` at the end of the function has already fired by the time those callbacks resume. Measured on a three-model document: the inactive model's 30 weight cases were gone from the collection, its 500 result cases were still there with its name on them. This is pre-existing and out of scope here (see Out of Scope), but requirement 14's two-model test sits directly on top of it, so it is recorded rather than left to surprise whoever writes that test.

Both collections are session state, deliberately excluded from the snapshots: `featureWeightCaseIDs` is left out of `featureStore.asJSON()` and out of `makeAutoObservable`, and `resultCaseIDs` is left out of `trainingStore.asJSON()` and of `makeAutoObservable` in the same way. That single fact is the root of two separate problems, so the re-acquisition belongs **before** the resumable-or-not branch rather than inside the resume path. Requirement 3 needs the IDs so the prep steps update instead of duplicating; requirement 6 needs them so that Cancel has something to wipe. The fallback is the path that tells the student to press Cancel, so it is the path that can least afford to be missing them.

### What an interrupted run has actually written

The two modes leave different amounts behind, and several requirements read as though they leave the same amount. `computeResults` is the only thing that writes weights and predicted labels, and it is reached from `stepModeCallback`, which is attached only in step mode, and from `progressBar`'s completion branch. Counted against a real six-iteration fit driving the real `progressBar`:

| | iterations completed | `computeResults` calls |
|---|---|---|
| plain, at the moment the document is saved | 4 | **0** |
| plain, after the run finished | 7 | 1 |
| step mode, after one step | 1 | 1 |
| step mode, after two steps | 2 | 2 |

So a plain run writes nothing per iteration at all. What each kind of interrupted document therefore holds:

| | weight cases | result cases |
|---|---|---|
| interrupted in step mode | model name **and** weights | model name, predicted label, probability |
| interrupted in a plain run | model name, **no weights** | created, and **entirely blank** |

The model name on the weight cases comes from `prepWeightsCollection`, which stamps it in both of its branches before any fitting starts. The result cases come from `prepResultsCollection`, which creates them with `values: {}` and never names them. The plain-run row of that table was confirmed against a real interrupted document rather than a mocked one (finding 11): the weight cases carried the model name with `weight: ""`, and the result cases were blank in all three of their attributes.

Three consequences. Requirement 4's promise that the weights and predicted labels agree with the restored iteration is satisfied vacuously for a plain run, because the student would have seen nothing at that iteration either. Requirement 6's Cancel has only the stamped model name to clear on a plain run, which is still worth clearing since that name is what the Features table shows. And selecting result cases by model name cannot work as a general mechanism, which is why requirement 6a selects by position in the parent instead.

### Cancel wipes nothing on a reopened document (requirement 6)

`cancel()` builds its two update requests by iterating `featureStore.featureWeightCaseIDs` and mapping `trainingStore.resultCaseIDs`. After a reopen both are empty, so both requests carry an empty `values` array and CODAP is asked to update nothing. `trainingStore.model.reset()` still runs, so the pane returns to "+ New Model" while the Features table keeps the abandoned model's name and weights and the target dataset keeps its predicted labels, now belonging to a model that no longer exists anywhere in the plugin. This is pre-existing rather than introduced here: STORYQ-86 shipped the "Press Cancel to start over" message without the case IDs that would make it true. This story is where it becomes load-bearing, because requirement 8 makes that message the fallback for every run that cannot be rebuilt.

### Rebuilding the encoded data is not idempotent

`oneHot` (`src/lib/one_hot.ts`) mutates `featureStore.tokenMap` as a side effect. On `buildModel`'s path (no `newTokenMap` in the config) it increments `count` on every constructed-feature token once per document containing it, then sorts `tokenArray` by `count` descending, truncates at the frequency threshold and at `kMaxTokens = 1000`, and deletes the tokens that fall off. Since `tokenMap` **is** saved with the document, a rebuild on resume starts from counts already inflated by the original run's `buildModel`, and inflates them again.

Two consequences:

- **Ordering drift is nearly harmless, and requirement 9b closes the gap.** Constructed features rise in the sort, so the rebuilt `tokenArray` may be a permutation of the original. Full-batch logistic gradient descent is mathematically equivariant under column permutation, so a permuted ordering yields permuted weights, but only to within rounding: the dot product inside `h()` sums in column order, and finding 3 measured the residue at `2.2e-16`. Re-imposing the saved order per requirement 9b removes even that.
- **Membership drift is not.** If a rising count pushes a token across the frequency threshold or past the `kMaxTokens` cut, the rebuilt column set genuinely differs from the saved run's, and requirement 9's fallback should catch it. This is a pre-existing quirk, not one this story introduces, but resume is the first code path that re-runs `buildModel` against a `tokenMap` a previous `buildModel` already touched.

### Stale indexes, a second and sharper hazard

Dropping out of `tokenArray` does not remove a token from `tokenMap`, and the index it keeps is then used. `oneHot` deletes only the tokens left at `index === -1`, which on a first run means everything below the cut. A token restored from a document already carries a real index, so a rebuild that truncates leaves the dropped tokens in the map pointing at positions that now belong to other tokens. The vector builder guards only against `index >= kVectorLength`, so any stale index inside the vector sets somebody else's bit.

Built and run, with a restored map of `aaa@0 bbb@1 ccc@2 ddd@3` and a constructed feature whose count the previous run had inflated:

```
tokenArray:                                colF@0(c22) aaa@1(c10) bbb@2(c9) ccc@3(c8)
map after:                                 aaa@1 bbb@2 ccc@3 ddd@3 colF@0
one-hot vector for a document of just ddd: [1,0,0,1]
in the map but not the array:              ddd@3, whose index now belongs to ccc
```

The document is encoded as containing a word it does not contain. Nothing throws.

Requirement 9 catches this for the resume itself, since the restored map holds five tokens and the rebuilt array four, so the sets differ and the resume is refused. What outlives the refusal is the mutated map: `featureStore.asJSON()` serializes the live `tokenMap`, so the corruption is saved and the next **fresh** run reads it, which requirement 7a cannot allow. Hence the snapshot in the eager-validation decision.

### Where resume is triggered

`storyq.tsx` restores through `restorePluginFromStore`, which calls `domainStore.fromJSON(...)` and then `await targetStore.updateFromCODAP()`.

**`fromJSON` is `async`, and it is not awaited.** Its first four statements, restoring the target, feature, training and testing stores in that order, are synchronous and do complete before `updateFromCODAP` is reached, so a resume attempted after that await sees a fully restored `trainingStore`. But the restore itself has not finished. `fromJSON` goes on to await `guaranteeFeaturesDataset()` and `testingStore.updateCodapInfoForTestingPanel()`, and for a document that already has a Features dataset the first of those runs the migration: hiding two attributes, repairing the ngram feature's color, guaranteeing the total-frequency attribute, then sweeping every feature case with `getCaseValues` and updating them all. That work is still in flight during `updateFromCODAP` and after it returns, against the very dataset a resume is about to read weight case IDs from and stamp model names into.

So a resume is sequenced behind **both** the `updateFromCODAP` await and the promise `fromJSON` returns. Capture that promise rather than awaiting it inline:

```
const restored = domainStore.fromJSON(iStorage.domainStore);
await targetStore.updateFromCODAP();
await restored;          // only on the path where a resume is going to be attempted
```

Awaiting `fromJSON` directly at the call site would serialize, for every document open, work that is concurrent today, which is a timing change to the ordinary restore path for the sake of a case that only arises when a run was in progress.

`fromJSON` can also reject: `guaranteeFeaturesDataset`'s create branch does not catch, and `openTable` can fail. Today nothing observes that, since nothing awaits the promise. Requirement 9d covers what a resume does with it.

**How often the restore fires, and why requirement 10's guard is defensive.** `restorePluginFromStore` is wired up twice: as the `'update' 'interactiveState'` handler, and as the callback `codapInterface.init` invokes with the saved state. Searching CODAP itself rather than the plugin, the only `interactiveState` traffic in the whole of CODAP v2's data-interactive layer is `requestDataInteractiveState` sending `{action: 'get', resource: 'interactiveState'}` (`data_interactive_phone_handler.js:165`), which is CODAP asking the plugin for its state in order to save it. Nothing in that tree sends an `update` for that resource, so on the evidence available the `'update'` registration is dead wiring and a restore is delivered exactly once, through `init`. **Re-checked on a second pass, and v3 is now settled too**: its single occurrence is `web-view/web-view-model.ts:209`, the same `get` inside `prepareSnapshot`, so neither codebase ever sends an `update` for the resource. On the plugin side, `CodapInterface.init` invokes `iCallback(savedState)` from one `getFrameRespHandler`, so the `init` delivery is once per plugin load rather than once per document.

Requirement 10 asks for the at-most-once guard anyway. It costs a flag, and the failure it prevents is not a wasted computation but a second pass writing weights and predicted labels into a student's datasets. It is recorded here as defensive so that nobody later removes it believing it guards a path that CODAP actually exercises, and so that nobody adds a test asserting behavior on a path that may not exist.

`buildModel` reads `targetStore.targetCases`, and `updateFromCODAP` is what first populates it, so any resume attempt has to happen after that await rather than inside `fromJSON`. This is also why requirement 10 moves the `trainingWasInterrupted` flag out of `TrainingStore.fromJSON`: at that point nothing yet knows whether the run can be rebuilt. What `fromJSON` does set there instead is the restoring flag, which needs no such knowledge and which the pane needs before this path has issued a single request (requirement 5c).

**`updateFromCODAP` is not the only thing that writes `targetCases`, and the other writer holds a filtered subset.** `updateTargetCases(formula)` assigns the field from a filtered `caseFormulaSearch`, and `domainStore.updateNonNtigramFeaturesDataset` calls it once per chosen non-ngram feature inside a `Promise.all`, so the field is left holding whichever feature's matching subset resolved last. `target_store.ts` already says as much in a one-line comment: "targetCases are now out of date". Mocking CODAP so the unfiltered sweep returns 5 cases and a feature's sweep returns 2, the field held 2 afterwards, ids `[1,2]`.

This fires on every document open, unawaited, whatever tab was saved as selected: `TabPanelTabContent` renders every tab's children and hides the unselected ones with a class and `aria-hidden`, so `TrainingPanel`'s mount effect runs at load in all cases.

Sequencing cannot fix it, because the write is unawaited and can land after any refresh the resume does. The resume therefore captures its own list and never reads the field:

```
const cases = await targetStore.updateTargetCases();   // unfiltered; returns the array it just built
```

`updateTargetCases` assigns a fresh array rather than mutating in place, so that local stays stable even when the field is reassigned underneath it. It feeds both requirement 9a's row count and the rebuild.

### What replay must suppress

`progressBar` is not just a progress indicator: at `iIteration >= iterations` it calls `computeResults`, pushes the trained-model entry, syncs the CODAP datasets and calls `tModel.reset()`. Running replay with the real `progressCallback` attached would finalize the model partway through catching up. `stepModeCallback` likewise awaits `computeResults`, which is a CODAP round trip per iteration. So the real `progressBar` is taken off for the catch-up and put back before control returns to the student, and `stepModeCallback` is taken off and put back the same way (requirement 5).

**The progress callback is replaced rather than simply removed (requirement 5e).** Detaching it outright leaves nothing to sequence the handback behind, because `fit()` returns `undefined` before the first iteration has done anything observable and the loop then runs to its end unannounced. In its place the catch-up installs a watcher that does nothing but notice `iIteration >= this.iterations`. Measured against the real `LogisticRegression` over 60 rows by 12 columns, 8 iterations:

| catch-up configuration | gradient steps | resulting theta |
|---|---|---|
| no callbacks at all | 8 | baseline |
| silent synchronous watcher attached | 8 | **bit for bit identical**, max absolute difference 0 |
| silent asynchronous watcher attached, the shape `progressBar` has | 8 | **bit for bit identical** |

The watcher sees `i = 0, 1, … 7` and then the terminal `i = 8`, and `fitResult` is already built by the time that last call arrives:

```
i=0 fitResult=unset | i=1 unset | … | i=7 unset | i=8 fitResult=set
```

That terminal call is therefore the one place that has everything at once: it is the completion signal, and it is the right moment to clear `fitResult` before the handback. Polling `fitResult` on a timer instead was measured and is strictly worse: it needs a timer the story does not otherwise need, and it notices the end 10 ms, 27 ms or 103 ms late for poll intervals of 2 ms, 25 ms and 100 ms, which is dead time with Step and Cancel disabled for no reason. Giving `fit` a promise was rejected for a different reason: threading a resolver through the `setTimeout` chain is a change to code every fresh run executes, which requirement 7a rules out.

**The catch-up also sets `trace` to false, and that clause is not optional.** Detaching both callbacks is only safe in combination with it. `oneIteration`'s trace branch continues the loop solely by calling `stepModeCallback`, so detaching that callback while `trace` is true, which is the state a step-mode run is already in, applies one gradient step and stops. Nothing throws and nothing logs; the first sign is weights that do not match. With `trace` false the loop continues through its own 10 ms `setTimeout`, which is where requirement 5b's asynchronous catch-up comes from.

**Two further traps, both found by running the sequence.**

- **Clear `fitResult` before handing back.** A catch-up that ends at the saved iteration reaches `fit`'s terminal `else` branch, which builds a `fitResult` carrying the catch-up's truncated `config.iterations`. That is a completed-run record for a run that has not completed, and `fillOutCurrentStoredModel` reads `fitResult?.theta` without checking whether the run finished. Requirement 5e's watcher is where this belongs, since its terminal call is the first moment `fitResult` exists.
- **Truncate `iterations` on the logistic model only.** The catch-up sets `iterations` to the saved iteration plus one so the loop stops there. Applying that to `trainingStore.model.iterations` instead would make the progress bar read 7/8 and show 88% where requirement 5a promises 35%, because `TrainingPane` computes the percentage from the `AIModel` rather than from the logistic model. `buildModel` keeps the two in step, so the distinction is easy to miss.

### Verified behavior

The following were established by running the real `oneHot`, `LogisticRegression`, `AIModel` and `TrainingPane` code, not by reading it, and findings 11 and 12 by driving the real plugin against a real CODAP document rather than a mocked one. The throwaway harnesses were deleted once they had answered their questions; the findings are recorded here because several of them are not apparent from the source and would otherwise have to be rediscovered.

1. **The saved `tokenMap` is the saved run's column set and ordering.** After `oneHot`, the map holds exactly the tokens in `tokenArray`, each with its positional `index`, because every token left at `index === -1` is deleted. Both `index` and `count` survive `JSON.parse(JSON.stringify(featureStore.asJSON()))`, and sorting the restored map by `index` reproduced the original `tokenArray` order exactly. This is what makes the invalidation check free. **The equality holds for a run whose tokens all started at `index === -1`**, which is the run that saved the document. It does not hold for a rebuild: a token restored from a document already carries a real index, so a truncating rebuild leaves it in the map without deleting it. See "Stale indexes" above, which is why the resume snapshots the map rather than letting a rebuild stand.
2. **Replay is bit-for-bit.** Two 12-iteration runs over 200 rows x 30 columns produced byte-identical `theta`. The determinism argument holds as stated.
3. **Column ordering drift costs one ULP.** Swapping two columns and re-fitting gave, after un-permuting, a maximum absolute difference of `2.2e-16`. The dot product inside `h()` sums in column order, so a permutation changes the rounding but not the model. Hence requirement 9b: re-impose the saved order and the difference disappears entirely.
4. **The non-idempotency is real.** Round-tripping the token map and re-running `buildModel`'s `oneHot` path took a constructed feature's `count` from 2 to 4 and moved it from index 1 to index 0. Membership held; order drifted.
5. **Stale tokens survive and reappear as columns.** Re-running against a document set with one document removed left the token `ok`, which no longer occurred anywhere, in `tokenMap` with its old index, and it reappeared in the rebuilt `tokenArray`. The column set is driven by `tokenMap`, not by the current documents, so *removing* target data does not shrink it. This is why the token-set comparison alone cannot see a deleted target case, and why requirement 9 also compares a row count.
6. **What makes the fit loop synchronous is `trace`, not `progressCallback` alone.** `oneIteration` is `async` and its first statement is `this.progressCallback && await this.progressCallback(...)`. With no callback the `&&` short-circuits and no `await` happens, so with even a trivial synchronous `progressCallback` attached, `fit()` returned before the first iteration's callback had fired. But detaching it is necessary rather than sufficient. Counting gradient steps applied for a fit asked for 8 iterations: `trace` true with a continuing `stepModeCallback` and no progress callback runs all 8 synchronously; `trace` true with the step callback detached applies **1** and stops, silently, never setting `fitResult`; `trace` false runs all 8 asynchronously through the 10 ms `setTimeout`, whether or not a progress callback is attached. Requirement 5b's catch-up is the third of those.
7. **A restored plain run renders Cancel and nothing else.** Rendering the pane with `trainingInProgress` true and `trainingInStepMode` false showed a single button. `trainButton` is suppressed because a run is in progress, and `stepButton`'s condition `!tInProgress || tInStepMode` is false, so no Step appears either. The interrupted flag makes no difference to this. A restored step-mode run renders Step plus Cancel, and the progress bar correctly showed 35% for iteration 7 of 20. This is why requirement 2's auto-resume is not a preference: for a plain run there is no button a student could press.
8. **Replay cost is quadratic in the token count.** `grad()` calls `h(x_i, theta)`, an O(dim) dot product, inside the loop over `d`, so each iteration costs O(dim² · N). Measured per iteration: 5.4 ms at 100 rows x 100 tokens, 157 ms at 500 x 500, 321 ms at 1000 x 500, and 1122 ms at 1000 x 1000. At 500 rows, each doubling of the column count multiplied the cost by 3.0, 3.5 and 3.7. So a 20-iteration replay ranges from about 0.1 s on a small corpus to about 22 s at the `kMaxTokens = 1000` vocabulary cap. See Out of Scope for the optimization that would remove this, which this story deliberately does not take.

9. **The whole resume sequence was prototyped and reproduces an uninterrupted run exactly.** A subclass of the real `LogisticRegression`, with `fit` copied verbatim except for the two optional parameters, was driven through the full path: a baseline 20-iteration run; an interrupted run stopped after the callback for iteration 7; a silent asynchronous catch-up from zero with `trace` false and both callbacks detached; a handback starting at iteration 8 with the callbacks restored; then Step presses to completion. (The prototype drove the handback by hand, which is why it did not notice that nothing in the product would know when the catch-up had ended. Requirement 5e's watcher is what supplies that, and it leaves every figure in the table below unchanged, since attaching a silent watcher was measured as bit-for-bit identical to attaching nothing.)

    | check | result |
    |---|---|
    | gradient steps applied by the time the document was saved at iteration 7 | 8 |
    | gradient steps applied by the catch-up | 8 |
    | catch-up theta identical to the saved theta | yes |
    | thread blocked by the catch-up | 3 ms |
    | `stepModeContinueCallback` set after the handback | yes |
    | iteration the pane shows after the handback | 8, from 7 |
    | further Step presses to reach iteration 20 | 12 |
    | final theta identical to the uninterrupted run | yes |
    | final `cost` and `constantWeightTerm` identical | yes |
    | progress iterations seen after the handback | 8, 9, 10 … 20 |

    This settles three things at once: the off-by-one above is right, requirement 7's bit-for-bit promise is achievable exactly rather than to within rounding, and requirement 1 needs no mechanism beyond the two optional parameters. It did **not** exercise the rebuild of the encoded data, which was the remaining risk: the prototype was handed the same in-memory matrix rather than one rebuilt through `oneHot`. Finding 10 closes that.

10. **The rebuild half reproduces the interrupted run's matrix and weights exactly, and only because of requirement 9b's writeback.** The gap finding 9 left was closed by driving the real `oneHot` over a restored `tokenMap`: seed the map the way ngram extraction leaves it, run `buildModel`'s `oneHot` branch, fit, snapshot `featureStore.asJSON().tokenMap` as the document would hold it, then reopen with that map, rebuild, re-impose the saved ordering on the array, the data columns and the map, catch up to the saved iteration and hand back. The corpus was chosen so the drift is real rather than theoretical: the constructed feature's count went from 8 to 12 on the rebuild and it rose from column 14 to column 9.

    | check | result |
    |---|---|
    | rebuilt token set equals the saved one | yes, membership held |
    | rebuilt matrix identical **without** re-imposing the ordering | **no** |
    | rebuilt matrix identical **with** it | yes, byte for byte |
    | catch-up theta identical to the saved theta | yes, bit for bit |
    | handback's final theta, `cost` and `constantWeightTerm` identical to the uninterrupted run | yes |
    | four successive open-rebuild-commit cycles encode identically, array and data only | **no** |
    | the same four cycles with the `tokenMap` writeback | yes, and cycle 1 matches the interrupted run |

    So requirement 9b is load-bearing in both of its halves on the real path, not only in the simulation the Decisions section records, and requirement 7's promise survives contact with `oneHot`. The two negative rows are what make the positive ones worth anything: a test written on a corpus whose ordering happens not to drift passes without exercising any of this, which is the same trap requirement 7e records for the seeding step.

11. **Both re-acquisitions were run against a real CODAP document, and both are exactly right.** A three-model document was built by hand in CODAP v3.1.0 at `codap.concord.org/app` with `testing/StoryQ Local.codap3` and the dev build: a completed model deliberately named `Jie's Model A` to exercise the escaping, a completed `Model B`, and a plain `Model C` halted at iteration 7 by setting `trace` true with no step callback, which is finding 6's silent stop and stands in for closing the document. The state is recorded in [`real-codap-interrupted-document.json`](real-codap-interrupted-document.json).

    | claim | result |
    |---|---|
    | every case from `caseFormulaSearch` carries its `parent` | yes, results and weights alike |
    | result cases per target case, three models | 3 for all 500 parents |
    | a parent's children come back in creation order | yes, A then B then C |
    | requirement 6a's last-child rule reproduces the live `resultCaseIDs` | yes, all 500, zero mismatches |
    | requirement 6b's search with the attribute name bare | `success: false` |
    | the same search with the attribute name backquoted | 30 cases, one per token |
    | every weight case's `parent` resolves to a feature case | yes, 30 of 30, no collisions |
    | an apostrophe in the model name, backslash-escaped or double-quoted | matched |

    Two things fall out of it beyond the syntax. The `parent` of a create-branch weight case *is* the feature case id, which is the pre-existing uncertainty `domain_store.ts:346` records, resolved here in the favorable direction for CODAP v3.1.0; the story still does not build on it, because requirement 6c refuses rather than assumes. And the interrupted document confirms the "what an interrupted run has actually written" table exactly: `Model C`'s weight cases carry the model name with `weight: ""`, and its result cases are entirely blank.

12. **A set-aside case is invisible to `caseFormulaSearch`, and inactive models get set aside.** The same document returned 60 weight cases where three models had written 90. The missing 30 were `Jie's Model A`'s, set aside when `Model B` completed and `inactivateAll()` ran, and a `restoreSetasides` notification on the Features dataset brought all 30 back in the next search. This confirms from the outside what Technical Notes argues from CODAP's source, and it is why requirement 6cc states that the count 6c relies on is a count of visible cases.

13. **The whole resume was drafted and driven through the real `ModelManager` against a mocked CODAP, and it reproduces an uninterrupted run.** Findings 9 and 10 covered the fit loop and the rebuild; this one covers the parts only an integration exercises: the real `progressBar` reattached for the handback, the prep steps skipped rather than re-run, and the re-acquired case IDs feeding the real `updateWeights` and `showPredictedLabels`. Eight texts, eleven columns, twelve iterations, interrupted at iteration 5.

    | check | result |
    |---|---|
    | resumed weights, accuracy and kappa against the uninterrupted run | identical |
    | trained-model entries after the resume | 1 |
    | `create` requests issued during the resume | **0** (requirement 3) |
    | weight and result cases written, against the uninterrupted run's | same cases, same values |
    | iterations the pane saw across 28 samples during the catch-up | 5, and no trained-model entry |
    | step mode: iteration after the first Step press, saved at 5 | 6, and an ordinary step thereafter |
    | `stepModeContinueCallback` after the handback | set, on the pane's manager |
    | a refused resume, against a deep copy of `tokenMap` taken first | byte-identical |
    | `model.iteration` and the `AIModel` snapshot during an abandoned catch-up | unchanged |

    Four things it settled that the requirements could not. **The document construction has to be shared, not reimplemented**: the first draft built the resume's documents its own way, and the harness fitted a different training set while every requirement-9 check passed, which is exactly the failure requirement 7b's "resume variant" wording exists to prevent. **`getCaseValues` deletes `parent` from every case it returns**, so requirement 6a's grouping cannot go through it and has to issue its own search. **The two-instance arrangement works**: the restore path validates on its own `ModelManager` while the pane keeps the one it makes in `useState`, and the loop's continuation lands on the pane's instance because the pending-resume state lives on the store. And **`featureStore.fromJSON` leaves `caseIdTokenMap` empty**, so requirement 19's assertion about it has to be that the id map agrees with the restored `tokenMap` on identity, not that it byte-matches the empty map a reopen starts with.

14. **The implementation plan's own code was run against the real stores, and it moved two things it should not have.** Findings 9, 10 and 13 measured the resume as a sequence; this one takes the drafted `encodeTrainingData`, `snapshotTokens` and `restoreTokens` verbatim out of the plan and exercises them directly, which is the only way the two writes below become visible, since both are silent and neither changes a weight.

    | check | result |
    |---|---|
    | `restoreTokens` puts `tokenMap` back byte-identically after a rebuild | yes |
    | `ignoreStopWords` on the `AIModel` across a rebuild, feature saying false and document saying true | **true to false** |
    | the `AIModel` snapshot after that rebuild **and** a `restoreTokens` | **changed**, so a refused resume alters the document |
    | the same, with the feature and the document agreeing | unchanged |
    | a restored `tokenMap` whose tokens all carry `getNewToken`'s default `index` of `-1` | sorts to insertion order, silently |
    | the count inflation and ordering drift on an ordinary four-document corpus | real: a constructed feature went count 2 to 4 and index 4 to 0, membership held |

    The first write is `buildModel`'s `setIgnoreStopWords` call, which sits in the middle of the code the resume variant shares and so runs on the validation path; requirement 7b moves it out. The second is not a write but an absence: nothing tests whether a restored ordering is usable before re-imposing it, which requirement 9b now specifies. The last row is confirmation rather than a defect, and it is the corpus shape requirement 20a's test needs, drift being what makes the writeback observable.

    A third thing the plan's control flow settles on inspection rather than by measurement, since the code it concerns does not exist yet: the pending-resume flag is set by the validation step and cleared only by the replay, so a student who reopens a step-mode run, presses Cancel and trains a new model carries it into the fresh run, where `TrainingPane`'s Train button calls `nextStep()` straight after `buildModel()`. Requirement 7b's last bullet is what closes it.

Nothing in the fit loop is random: `grad()` is a plain full-batch sum, `alpha` and `lambda` are fixed, and there is no shuffling or sampling. `findThreshold` and `computeKappa` are deterministic given the weights and the data.

## Out of Scope

- Resuming a run whose features or target data changed while the document was closed. That falls to requirements 8 and 9.
- Any change to the training algorithm, its hyperparameters, or its results.
- **Optimizing `LogisticRegression.grad`.** It calls `h(x_i, theta)` inside the loop over `d`, though `h` does not depend on `d`, so a gradient pass costs O(dim² · N) rather than O(dim · N). Hoisting it measured 131x faster at 1000 rows x 1000 tokens and produced bit-for-bit identical weights, cost and constant term. It is deliberately not taken here: it would make ordinary training dramatically faster for large corpora, which students see, so it is a product change wanting its own ticket and Jie's sign-off rather than a refactor smuggled into a resume story. This story is designed to be affordable without it.
- Saving `theta` or the token ordering into the document (approach B), and reading the weights back out of the Features dataset (approach C). Both are recorded in Background as rejected. The single row count added by requirement 9a is not a partial adoption of B: it is one integer for the invalidation check, and no weight or live-model state is saved.
- **Fixing `oneHot`'s non-idempotency.** Neither the count inflation nor the stale indexes a truncating rebuild leaves behind (Technical Notes) are repaired here; the story tolerates both. What it does not do is leave them behind gratuitously: a validation rebuild that refuses the resume restores the token maps it snapshotted, so opening a document never alters the document. A rebuild that leads to an actual resume commits its mutation, exactly as an ordinary training run does.
- **Stopping a fit loop that is already running.** Cancelling a live run today does not stop it: `logisticModel.reset()` empties `theta` and restores `iterations` to its default of 20, and the in-flight loop carries on against its own captured data, computing gradients into the emptied array and finishing by setting a `fitResult` on a model the student cancelled. Nothing throws, and `reset()` also clears `progressCallback`, so none of it surfaces. Giving the loop an abort check would touch code every fresh run executes, which requirement 7a rules out, and deciding what a cancelled run ought to leave behind is a product question rather than a refactor. Requirement 5c therefore disables Cancel for the duration of a restore rather than wiring it to stop the loop. Note that this is also why the disabling has to cover the validation and not only the replay: a Cancel taken while the validation is still in flight does not stop the resume that follows it either, which is the sequence measured under 5c.
- Keyboard activation of the plugin's `Button` component, a pre-existing WCAG 2.1.1 failure noted in PR #75 and awaiting its own ticket. **The `ProgressBar` component belongs with it**: it renders two `div`s and a percentage with no `role="progressbar"`, no `aria-valuenow` / `aria-valuemin` / `aria-valuemax` and no accessible name, so nothing requirements 4 and 5a promise about it is perceivable except visually. The fix is a few lines, but `ProgressBar` is shared UI that every fresh run renders, the gap is identical before and after this story, and half-fixing the pane's accessibility across two tickets is worse than doing it once.
- **Making completion awaitable.** `ModelManager.progressBar` wraps its body in `runInAction(async () => ...)`, which only wraps the synchronous prefix, so the end of a run happens where nothing can wait for it (Technical Notes). It is a mobx misuse rather than a resume problem, the repair is in code every fresh run executes, and requirement 7a is what keeps it out of this story. Requirement 12's tests wait on the end state instead.
- **The results half of `syncWeightsAndResultsWithActiveModels` never running.** Its set-aside messages for an inactive model's result cases are pushed from an `async` callback inside a plain `forEach`, after the one `sendRequest` that would have sent them, so an inactive model's weights disappear from the Features table while its predicted labels stay in the target dataset (Technical Notes). It is a one-line repair, `for ... of` with an await, but it changes what a student sees for every model they deactivate, which is a product change rather than a resume fix, and it is in code no part of this story executes. Wants its own ticket. What this story owes it is only that requirement 14's test is written knowing it is there.
- **The same `targetCases` race for a fresh run.** A student who presses Train while `TrainingPanel`'s mount effect is still in flight trains on whatever filtered subset that effect has left behind, exactly as described in Technical Notes. Requirement 9a makes the *resume* immune by capturing its own case list; it does not fix the underlying field, and a fresh run still reads it.

## Decisions

### RESOLVED: Which of the three approaches?

**Decision**: **A, replay to the saved iteration.** Chosen by Doug. It adds nothing to the saved document, it cannot recover the wrong model the way C can when the intercept is not locked, and the determinism argument makes "the resumed run equals the uninterrupted run" testable rather than aspirational.

### RESOLVED: Does a plain (non-step) run resume by itself, or wait for the student?

**Context**: Ticket open question 1. Resuming on its own means opening a document starts computation the student did not ask for in this session. Waiting means inventing a Resume control, which the design does not have.

**Decision**: **Resume on its own and run to completion.** Jie, on Slack: "We can either (1) let the training process finish or (2) return the state to before training start. For (1), users will see the result of training when they return to that page; For (2), users will see the training didn't start and must press the Train button. I feel that (1) makes a bit more sense, but you can choose whichever is easier to implement since this is an edge case."

No Resume control is added. Jie's option (2), resetting to the pre-training state, is the documented fallback if replay proves impractical, and it is close to what Cancel already does.

### RESOLVED: Is resuming right at all for a student who reopens days later?

**Context**: Ticket open question 3. "Start over" may be the more honest behavior, in which case the story becomes a wording and design question about the existing message rather than a feature.

**Decision**: **Resume regardless of elapsed time; no staleness cutoff.** Jie's Slack answer above covers this question too: neither of the two behaviors offered is time-dependent, and a run's staleness is not something the plugin can observe anyway, since nothing records when the document was saved. "It's an edge case, choose whichever is easier" also gives us license to fall back to option (2) if replay turns out badly, which is captured as an open question below.

### RESOLVED: How does a resume decide the rebuilt run is not the saved run?

**Context**: Requirement 9. `buildModel` derives its columns from `featureStore.chosenFeatures` and `targetStore.targetCases` at the moment it runs, and the student can edit either while the document is closed. The ticket calls this the part most likely to be underestimated.

**Options considered**:
- A) **Save a signature** in `IAIModel`: a hash or joined string of the token names in `tokenArray` order.
- B) **Read the saved column set back out of CODAP**, from the weight cases `prepWeightsCollection` stamped with the model name.
- C) **Compare the coarse inputs only**, `chosenFeatureNames` plus a target case count.
- D) **Derive the signature from the restored `tokenMap`**, which is already saved with the document.

**Decision**: **D, plus one saved row count.**

The verification below established that the saved `tokenMap` *is* the saved run's column set and ordering, exactly, at no cost: `oneHot` deletes every token left at `index === -1`, so what remains in the map after a run is precisely `tokenArray`, each token carrying its position, and `index` survives the round trip into the document. Sorting the restored map by `index` reproduces the original `tokenArray` order.

So the resume path captures the ordered token list from the restored `tokenMap` **on the restore path, before anything rebuilds it**, compares membership against the rebuilt `tokenArray`, and falls back per requirements 8 and 9 when they differ. The capture has to come first because `oneHot`'s mutation of the map is the very thing being detected.

A had nothing to add that D does not already give, at the cost of the document state approach A was chosen to avoid. B gets the same token set less reliably, since it depends on the student not having edited the Features table (though its CODAP round trip is not extra, requirement 3 needs those weight case IDs anyway). C is the weakest, and finding 5 below makes it weaker still.

**The row count is D's one blind spot, and is closed rather than accepted.** Deleting a target case does not remove any token from `tokenMap` (finding 5), so the column set is unchanged while the data matrix has lost a row. `targetStore.asJSON()` does not save `targetCases`, so nothing in the document records how many rows the saved run used. One integer is added to `IAIModel` for it. That is a smaller concession than option A's full signature, and without it requirement 9's promise to cover changed target data is quietly false.

**Sub-decision: the saved ordering is re-imposed, not merely compared, and it is written back.** Finding 3 shows a permuted column order changes the weights in the last bit. Since D hands us the saved `index` values, the resume path re-imposes them on the rebuilt `tokenArray` and on the columns of the encoded data, so replay stays bit-for-bit identical and requirement 7 can be asserted exactly rather than approximately.

The re-imposed order must also be written into `tokenMap` before the rebuild is committed, and that is not obvious. Simulating four successive open-rebuild-commit cycles over a document whose constructed feature appears in 4, 6 and 8 of 8 documents, with every unigram count above the threshold as extraction guarantees:

| what the resume re-imposes | encoding identical across four opens | open 1 matches the interrupted run |
|---|---|---|
| the array and the data columns only | **no** | yes |
| the array, the data columns and `tokenMap`'s indexes | **yes** | yes |

Without the writeback the committed map carries the rebuild's ordering, so the *next* open re-imposes that instead of the original run's and lands one ULP away. Membership, by contrast, was stable in every case tried: constructed features only ever rise in the sort, and a constructed feature below the threshold was deleted by the original run and re-enters the rebuild at the same low count, so it is cut again. That is why a repeatedly interrupted document is not refused by drift.

### RESOLVED: In step mode, does replay run at document open or on the first Step press?

**Context**: A step-mode run's restored state is already fully visible in CODAP (weights in the Features table, predicted labels in the target dataset, iteration count and progress bar from the saved `AIModel`), so requirement 4 holds before any replay happens.

**Options considered**:
- A) **Lazily, on the first Step press.** No work on documents the student opens and never touches, but the invalidation message only surfaces after the student presses.
- B) **Eagerly at document open.** Immediate feedback and a uniform one-iteration Step, but every reopen pays the full replay.
- C) **Eagerly for the invalidation check only**, deferring the gradient replay to the first Step.

**Decision**: **C, validate eagerly and replay lazily.**

The restore path rebuilds the encoded data once, runs the requirement-9 check on it, and keeps it in memory on the logistic model. If the check fails, the fallback message is in front of the student at document open, which is what requirement 8 promises and what option A gives up. If it passes, the gradient passes wait for the first Step press.

The rebuild is O(documents x tokens per document), far below the cost of a single gradient pass, and doing it exactly once also avoids inflating the token counts twice (finding 4).

**The validation rebuild is undone when the resume is refused.** `oneHot` mutates `featureStore.tokenMap` as it goes, and that map is saved with the document, so a validation rebuild that changed it would make opening a document a way of altering the document. Measured across five successive opens, a constructed feature's `count` went 12, 18, 24, 30, 36, rising by the document count each time and being saved back each time; and a rebuild that truncates leaves stale indexes behind that mis-encode later runs (see Technical Notes). So the resume path snapshots the token state before rebuilding and restores it if the requirement 9 check refuses. When the resume proceeds, the mutation is committed, which is exactly what an ordinary training run does today.

**Getting that snapshot right is not obvious, so it goes behind a named pair of methods on `FeatureStore` rather than being written out at the call site.** `oneHot` does not mutate the maps, it mutates the **token objects inside them**, so a copy that shares those objects protects nothing. Measured against the real store:

| how the snapshot was taken | restores the original map? |
|---|---|
| `toJS(featureStore.tokenMap)` | **no**, `colF.count` came back 8 where it should be 4 |
| `{ ...featureStore.tokenMap }` | **no**, the same |
| `JSON.parse(JSON.stringify(...))` | yes |

`toJS` is the worse trap, because `asJSON()` already uses it and it is the natural thing to reach for: `tokenMap` is deliberately excluded from `makeAutoObservable`, so it is a plain object, and `toJS(featureStore.tokenMap) === featureStore.tokenMap` measured **true**, as did `toJS(map).alpha === map.alpha`.

There is a second half. The two maps share their token objects, measured `caseIdTokenMap[900] === tokenMap.alpha` true, with a mutation through one visible through the other. Deep-copying `tokenMap` and restoring `caseIdTokenMap` separately breaks that: the id map goes on pointing at the mutated objects, so `tokenMap.alpha.count` read 8 while the restored map said 4, and the two maps no longer agreed on identity. The correct restore deep-copies `tokenMap` and then **rebuilds** `caseIdTokenMap` from the copied objects by their `featureCaseID`, which restored identity in the measurement.

Hence `snapshotTokens()` and `restoreTokens()` on `FeatureStore`: every part of this is silent at the call site, and a pair of methods makes the right thing the only convenient thing. Neither is reached from a fresh run, so requirement 7a is untouched. At the `kMaxTokens` cap the cost is a deep copy of a thousand token objects plus an id-map rebuild, still far below the rebuild it guards.

(Worth knowing while implementing: `featureStore.fromJSON` sets `tokenMap` and never touches `caseIdTokenMap`, and `caseIdTokenMap` is not in `asJSON()`. Measured, after a `fromJSON` the id map still pointed at the pre-restore token objects. On a real page load it starts empty and repopulates lazily, so this only bites when a restore is re-entered into a live instance, which is the case requirement 10b's guard covers.)

**The eager phase must stop short of `prepWeightsCollection` and `prepResultsCollection`.** Both write to CODAP, stamping model names and creating result cases, and running them merely because a document was opened would be a side effect of opening. Validation needs only the rebuilt `tokenArray`, so the split falls naturally: rebuild and check at open, prep and replay when the run actually resumes.

**No new control, and no change to what the student does.** In step mode the student presses Step exactly as they always have; the first press after reopening pays the catch-up before advancing one iteration, and every press after that is an ordinary single iteration. In a plain run nothing is initiated at all, which is forced anyway: rendering a restored plain run showed Cancel as the only button on the pane (finding 7).

**Why the expensive case is not the problem it looks like.** Step-mode replay is bounded by the student's own patience, since a run reaches iteration N only because someone pressed Step N times. The runs that can be saved at a high iteration are plain runs, and those auto-resume without a button. What remains is that a student who stepped to iteration 15 over a corpus at the token cap waits on that first press, which is what the next question addresses.

### RESOLVED: What happens to a document saved mid-run by a version before this story?

**Context**: Requirement 9a adds a row count to `IAIModel`, so every document saved by today's build is a snapshot missing that field. Verified behavior: `AIModel.import` assigns each field unconditionally, so a missing one lands as `undefined` rather than falling back to `defaultModel`. `fromJSON`'s `if (json)` guard protects only against the whole model object being absent. The failure mode is not always silent: a model restored with `iterations` undefined makes the progress bar render `NaN%`.

**Decision**: **The row count is optional, and the row check runs only when it is present.**

Jie has a document already saved mid-run, and the point of the story is that it opens and works. Treating a missing row count as unresumable would leave exactly that document broken, which inverts the goal. So the field is declared optional and requirement 9's check is the token-set comparison alone when it is missing.

**`import` needs no special case for it, and must not be given one.** For a field whose absent state *is* `undefined`, "missing from an old document" and "cleared by `reset()`" are the same value, so the field goes into `defaultModel` explicitly as `undefined` and `import` assigns it like the other ten. Measured across all four directions:

| import rule | restoring a pre-story document | after `reset()` | what the next save carries |
|---|---|---|---|
| skip when undefined | absent, correct | **500**, wrong | `{"trainingRowCount":500}` |
| unconditional | absent, correct | absent, correct | the key is dropped |

`JSON.stringify` omits undefined-valued keys, so an unrecorded count leaves the saved shape exactly as it was before this story, and a recorded one round-trips intact. `reset()` runs on Cancel, on run completion and on "+ New Model", so a skip-when-undefined rule would leave every one of those carrying the previous run's row count into the document. The one thing lost is that `asJSON()`'s explicit literal no longer makes TypeScript check this particular field is present, since optional fields are not required in the literal.

This is safe for the case that matters. `tokenMap` has been saved with documents all along, so an older document still gets the full token-set check, which catches changed features, re-extraction and edited or added text. What it cannot catch, for older documents only, is target rows *deleted* while the document was closed (finding 5). The consequence is bounded: the run resumes against the current data and completes coherently, it is simply not the same fit the interrupted run would have produced. That is a better outcome than refusing to resume every document that predates the release.

Going forward the count is written by `buildModel` at the start of every run, so any document saved mid-training by this build carries it and is fully checked (requirement 7b). The resume variant records it again, so a document interrupted, resumed and interrupted a second time stays checked. Only documents saved by a build that predates this story arrive without it, and those fall back to the token-set comparison alone.

**Ordering is likewise best-effort.** Requirement 9b re-imposes the saved `index` values to keep replay bit-for-bit. If an older document's `tokenMap` turns out to lack usable indexes, the resume proceeds on the rebuilt ordering and accepts the one-ULP difference finding 3 measured. Ordering is an exactness optimization and must never be the reason a resume is refused.

### RESOLVED: What is the replay actually going to cost?

**Context**: Ticket open question 2 asks for this to be measured against a large corpus before committing, since the answer could send us to Jie's option (2) instead of resuming at all.

**Decision**: **Measured up front, against the project's own reference document.**

`testing/Ice Cream Reviews.codap3` carries 500 training texts. Running those texts through the real `oneHot` and `LogisticRegression`, measured twice on different machines:

| frequency threshold | tokens | full 20-iteration run |
|---|---|---|
| 4, the default | 682 | **5.1 to 7.0 s**, 253 to 349 ms per iteration |
| off | 1000, the `kMaxTokens` cap | **10.4 to 14.4 s**, 521 to 720 ms per iteration |

The token counts reproduced exactly on both runs, so the encoding half is settled; the timings are machine-dependent and spread about 40%. Synthetic sweeps put the ceiling near 22 s at 1000 texts and 1000 tokens (finding 8).

So the cost is not hypothetical and not a synthetic worst case: the dataset the project ships as its demo takes five to seven seconds to replay a full run, on developer hardware. **The design has to hold at the top of that range rather than the bottom**, and student machines are slower than either machine measured here.

Per mode: a step-mode run costs 253 to 349 ms per saved iteration on this corpus, paid once on the first Step press, so stepping to iteration 10 means a 2.5 to 3.5 s wait and then instant steps thereafter. A plain run pays up to the full replay at document open.

This is comfortably cheaper than the run the student already sat through, as the ticket predicted, so replay stays the right approach. But it is far too long to be invisible, which is what the next decision addresses.

### RESOLVED: What does the student see while replay is catching up?

**Context**: A catch-up costs seconds (see the cost decision above), so something has to be on screen for it.

**Options considered**:
- A) **Nothing**, on the assumption it is fast enough. Ruled out by the measurement: five seconds of dead UI with no explanation is not defensible.
- B) **A blocking indicator** in the Training pane while the catch-up runs.
- C) **Yield periodically and drive the existing progress bar.**
- D) **Fall back to Jie's option (2)** above some cost threshold.
- E) **Run the catch-up asynchronously and show a message**, so nothing blocks in the first place.

**Decision**: **E, an asynchronous catch-up with a message.**

While a resume is catching up, the Training pane shows a message in its existing `sq-info-prompt` area saying the run is being restored, cleared when control returns to the student. Step and Cancel are disabled for the duration (requirement 5c).

**The catch-up does not need to block, which is what B and the original form of this decision assumed.** The premise was that the loop is synchronous. It is synchronous in exactly one configuration, `trace` true with an attached `stepModeCallback` that continues immediately, which is the configuration finding 6 happened to exercise. Instrumenting `grad` and running a fit asked for 8 iterations in each configuration:

| configuration | steps applied synchronously | after 300 ms | `fitResult` |
|---|---|---|---|
| `trace` true, step callback attached, no progress | 8 | 8 | set |
| `trace` true, step callback detached | 1 | 1 | never set |
| `trace` false, no callbacks at all | 1 | 8 | set |
| `trace` false, progress attached (today's plain run) | 1 | 8 | set |

Row 3 is the catch-up this story wants: with `trace` false and `progressCallback` detached, the loop runs to completion on its own through the 10 ms `setTimeout` that is already there, yielding to the browser between every iteration, with no per-iteration CODAP write and no progress-bar update. Requirement 5's suppression is satisfied by configuration alone.

The cost is 10 ms per iteration, so about 200 ms on a 20-iteration replay against the 6.98 s of gradient work measured on the reference corpus, under 3%. For that the plugin stays responsive, the message paints without any special handling, no second catch-up can be started on top of the first, and there is no multi-second window in which the interface is unresponsive and silent.

**The progress bar is still left showing the saved iteration and is still not animated.** That part of the argument against C stands on its own: driving the bar would drop it to 0% and climb back, misrepresenting where the run actually is when the student left it at, say, 35%. Asynchrony buys responsiveness, not a reason to animate the bar. During a catch-up the only thing that changes is the message.

D is rejected: Jie's "choose whichever is easier, this is an edge case" does not argue for a cost threshold nobody can tune well, and with the run no longer blocking, the resume is plainly a better experience than discarding the run.

**Both modes use the same mechanism.** Step-mode replay is asynchronous too, rather than keeping a synchronous path for one mode and an asynchronous one for the other. One mechanism, one set of tests, and the student who pressed Step is already waiting on a press.

**Retracted implementation note.** An earlier draft of this decision said the resume path had to yield once, an awaited `setTimeout(0)`, so the message would paint before the loop began. That does not work, and it is recorded here so nobody reinstates it. Counting rendering opportunities in Chromium between the message going in and a 2.5 s blocking loop starting:

| what the page did before blocking | gap | rendering opportunities |
|---|---|---|
| DOM write, then `await setTimeout(0)` | 0.1 ms | **0** |
| React 18 `setState`, then `await setTimeout(0)` | 0.9 ms | **0** (DOM committed, never painted) |
| DOM write, then two awaited `requestAnimationFrame`s | 32.9 ms | 2 |
| React 18 `setState`, then two awaited `requestAnimationFrame`s | 20.2 ms | 2 |

A `setTimeout(0)` yields the task but not a frame: it fires about a millisecond later, well before the next vsync, so the block starts first and the message never reaches the screen. With React the state update even commits to the DOM and still never paints. Had the synchronous shape been kept, the yield would have had to be a double `requestAnimationFrame`. It is moot under E.

### RESOLVED: If an auto-resumed plain run completes, what state should the pane be left in?

**Context**: Requirement 2 has a plain run finish on its own. `progressBar`'s completion branch pushes the trained-model entry, syncs the datasets and calls `tModel.reset()`.

**Options considered**:
- A) **Nothing extra**, the same completion path an uninterrupted run takes.
- B) **A note** in the pane saying the interrupted run finished.
- C) **Leave the finished model active** so the student's attention lands on it.

**Decision**: **A, nothing extra.**

Reproducing the completion branch and rendering the pane confirms what the student lands on: a single "+ New Model" button, the prompt "You have trained 1 model. Train another or proceed to Testing.", a reset model, and the finished result in the table with `isActive` true. That is exactly Jie's option (1), "users will see the result of training when they return to that page".

**C turns out to be a no-op and needs no work**: `inactivateAll()` followed by pushing the result with `isActive: true` already leaves the finished model as the active one.

B is rejected as new student-facing copy that Jie would want to word herself, and it would need its own rule for when it clears. Taking A also keeps the completion path byte-identical to an uninterrupted run's, which is the strongest available guarantee for requirement 7.

**Accepted consequence.** The restore runs at plugin load, potentially well before the student looks at the Training tab, so a student who was on another tab when they saved may never see the catch-up message and will simply find a finished model. Under A there is no persistent record anywhere that a resume happened. This is judged acceptable, and is what Jie described.

### RESOLVED: Should auto-resume be suppressed in any context?

**Context**: Requirement 2 means opening a document starts computation and writes to the student's CODAP datasets without anyone asking in this session. StoryQ documents are opened in the Activity Player and can be opened by a teacher or a researcher looking at a student's work, where silently completing the run mutates what they came to look at.

**Options considered**:
- A) **No suppression.** Resume always.
- B) **Suppress when the plugin can tell it is not in an editable session.**
- C) **Treat it as out of scope** and raise it separately if it turns out to matter.

**Decision**: **A, no suppression, and B is not available.**

Both CODAP codebases were searched for a signal the plugin could use, and there is none:

- CODAP v3, `v3/src/data-interactive/`: no occurrence of `readOnly` or `isReadOnly` anywhere in the data-interactive layer.
- CODAP v2, `apps/dg/components/game/`: `game_controller.js` lists the frame's stored properties as `preventBringToFront`, `preventDataContextReorg`, `preventTopLevelReorg`, `preventAttributeDeletion`, `allowEmptyAttributeDeletion` and `respectEditableItemAttribute`, all concerning reorganization and z-order. `game_phone_handler.js` contains no `readOnly` at all.
- StoryQ's own `initializePlugin` sets only those same reorg flags.

So CODAP does not tell a plugin whether it is in an editable session, and the parent frame's URL is cross-origin, so there is no way to infer it either. The only way the plugin would learn it cannot write is a failed write after the fact, which is useless as a guard.

This is recorded rather than left implicit so that a future reader does not spend the same time rediscovering it. **If a teacher or researcher view turns out to matter, the blocker is a CODAP feature request, not a StoryQ change.**

## Open Questions

None. Every question raised by the ticket and by the investigation has been decided; see Decisions above.

## Self-Review

Every issue below was verified against the running code before being written down, by throwaway Jest harnesses over the real `LogisticRegression`, `oneHot`, `ModelManager`, `FeatureStore` and `TrainingStore`, by a Playwright probe in Chromium for the paint question, and by re-measuring the cost claims against `testing/Ice Cream Reviews.codap3`. The harnesses were deleted once they had answered their questions. Candidate issues that did not survive verification are not listed. Two of the spec's own claims were re-checked and held: `prepWeightsCollection` does take the create branch when the model name is already stamped (one create request, zero weight updates), and the saved corpus does yield exactly 682 tokens at the default frequency threshold.

### Senior Engineer

#### RESOLVED: The prescribed way to silence the replay stops it after one iteration

Technical Notes, "What replay must suppress", says of `progressCallback` and `stepModeCallback` that "Both must be detached for the catch-up loop and reattached before control returns to the student". Running it: with `trace` true and `stepModeCallback` detached, a fit asked for 8 iterations applied **1** gradient step and never set `fitResult`. `oneIteration`'s trace branch continues the loop only through `stepModeCallback`, so detaching it ends the run. The alternative, leaving `trace` false, does not give a synchronous loop either: the same fit completed all 8 steps but asynchronously, through the 10 ms `setTimeout`, which is the cost the Decisions section claims replay avoids.

This also makes finding 6 misleading where it matters most. Its conclusion, "A silent replay must therefore detach `progressCallback`, which it wants to do anyway (requirement 5), and gets a synchronous catch-up loop as a consequence", is not true: detaching `progressCallback` is necessary for a synchronous loop but not sufficient. The synchronous shape is `trace` true **plus** an attached `stepModeCallback` that continues immediately, which is the one configuration finding 6 actually exercised. **Resolution** (approved by Doug): the asynchronous catch-up makes detaching both callbacks correct, because it also sets `trace` false, and with `trace` false the step callback is never consulted. So the note needed one clause rather than a rewrite. "What replay must suppress" now states that the catch-up sets `trace` false as well, with the one-iteration halt recorded as the reason that clause is not optional, and finding 6 has been rewritten: it previously generalized from the one configuration it had exercised.

---

#### RESOLVED (overstated): The described change to `fit()` leaves Step dead, so requirement 1 is not met

Requirement 7b says `fit()` "gains its starting iteration and starting theta as **optional** parameters". That is not enough to satisfy requirement 1. `ModelManager.stepModeContinueCallback` is only ever set from inside `stepModeCallback`, which receives the loop's own `oneIteration` as its fourth argument. Verified: after a silent replay, `stepModeContinueCallback` was `null`, and attaching `progressCallback` and `stepModeCallback` afterwards left it `null`, because nothing re-enters the loop to hand the continuation out. `nextStep()` therefore stays the no-op it is on a reopened document today, which is the exact symptom the story exists to remove.

**Resolution** (approved by Doug): this finding was **overstated**, and prototyping the sequence showed why. The two optional parameters are sufficient after all. A resume is two calls to the same `fit`: a silent catch-up from zero that stops at the saved iteration, then a handback that starts at the saved iteration plus one with `trace` and both callbacks restored. The handback's own first iteration calls the real `stepModeCallback`, which parks the continuation on the manager, and that same iteration is the advance from 7 to 8 that requirement 1 asks for. No third mechanism, and no CODAP write beyond the one that single iteration would have made anyway.

Recorded as finding 9, along with the two traps the prototype exposed: the catch-up leaves a stale `fitResult` carrying its truncated `config.iterations`, and the truncation of `iterations` must be applied to the logistic model only or the progress bar reads 88% instead of 35%. Requirement 7b's first bullet now describes the two-call shape so that the parameters are read as sufficient rather than as a starting point.

---

#### RESOLVED: `domainStore.fromJSON` is asynchronous and is not awaited

Technical Notes, "Where resume is triggered", describes `domainStore.fromJSON(...)` as "(synchronous, restoring the target, feature, training and testing stores in that order)". It is declared `async` and returns a promise, and `restorePluginFromStore` (`src/components/storyq.tsx:93`) does not await it. The four store restores are synchronous and do complete in that order, so the ordering half of the sentence is right, but the tail of `fromJSON` (`guaranteeFeaturesDataset`, `migrateExistingFeaturesDataset`, `backfillTotalFrequency`, `testingStore.updateCodapInfoForTestingPanel`) is still in flight during `await targetStore.updateFromCODAP()` and after it returns.

So "any resume attempt has to happen after that await" does not give the guarantee the sentence implies: the resume would start while the Features dataset migration is still writing to the same dataset the resume is about to read case IDs from and stamp model names into.

**Resolution** (approved by Doug): Technical Notes corrected, and the resume is sequenced behind both the `updateFromCODAP` await and the promise `fromJSON` returns, by capturing that promise rather than awaiting it at the call site. Awaiting it inline would serialize, on every document open, work that is concurrent today, for the sake of a case that only arises when a run was in progress. Requirement 9d added, because `fromJSON` can reject and a resume that neither attempts nor explains is the failure this story exists to remove.

---

#### RESOLVED: `targetStore.targetCases` is overwritten with a filtered subset at document open

The same section says `updateFromCODAP` "is the only thing that populates it". It is not. `targetStore.updateTargetCases(formula)` also assigns `this.targetCases`, and `domainStore.updateNonNtigramFeaturesDataset` calls it once per chosen non-ngram feature with a filtering formula, inside a `Promise.all`, leaving `targetCases` holding whichever feature's filtered subset resolved last. `target_store.ts` carries a bare comment to that effect: "targetCases are now out of date".

This is not a corner case on the restore path, it is the default. All four tab panels render eagerly (`TabPanelTabContent` only hides the unselected ones with a class and `aria-hidden`), so `TrainingPanel`'s mount effect fires `domainStore.updateNonNtigramFeaturesDataset()` unawaited on every document open regardless of which tab was saved as selected. Two consequences for this story: requirement 9a's row count, read from the current target case count, can be compared against a filtered subset and reject a perfectly resumable run, which is what requirement 9c forbids; and the rebuild itself can be handed a subset of the documents and silently encode a different training set. Verified by mocking CODAP so the unfiltered sweep returns 5 cases and a feature's sweep returns 2: after `updateNonNtigramFeaturesDataset`, the field held 2, ids `[1,2]`.

**Resolution** (approved by Doug): sequencing cannot fix an unawaited write, so the resume stops reading the field. Requirement 9a now says the row count and the rebuild both read a list the resume captured itself through `updateTargetCases()`, which returns the fresh array it just built; requirement 7b's `buildModel` bullet says the resume variant takes its target cases as a parameter; Technical Notes records the two writers, the eager mounting of every tab panel, and the measurement. The identical race for a fresh run is named in Out of Scope rather than fixed, so that the spec does not imply the underlying field is now safe.

---

#### RESOLVED: Nothing ever writes the new row count, so the check it exists for never runs

Requirement 9a adds an optional row count to `IAIModel`, and the migration decision says "Once an older document resumes, the resume path records the row count from the current target case count, so the next save carries it". But a document only acquires an interrupted run by being saved during a **fresh** run, and requirement 7a states that "Every mechanism this story adds is reached only from the restore path, and only when the restored model says `trainingInProgress`", with 7b listing four places the implementation is constrained, none of which writes the field.

Taken together, no document ever carries the row count except one that has already been resumed at least once. The field is present, `import` leaves it absent, the row check is skipped as "an older document", and requirement 9's promise to cover deleted target rows is quietly false for exactly the documents it was added for.

**Resolution** (approved by Doug): 7a bends rather than 9a, because the alternative does not exist: `targetStore.asJSON()` does not save the cases, which is why the decision reached for a new field in the first place. Requirement 7a now names the row count as its one stated exception and argues why it does not breach the spirit, since every item 7a enumerates (buttons, progress bar, CODAP writes, weights) is untouched and only the snapshot gains a field. A fifth bullet in 7b makes `buildModel` and its resume variant both record it, the migration decision no longer implies the resume path is the only writer, and requirement 15 now tests the write as well as the read, since the read half would otherwise pass against documents that never carry the field.

---

#### RESOLVED: The rebuild can leave a token map that mis-encodes later runs

Out of Scope carves out "The pre-existing non-idempotency of `oneHot`'s count mutation. This story must tolerate it, not fix it." The count mutation is not the whole hazard. `oneHot` deletes only the tokens left at `index === -1`, and a token restored from a document already carries a real index, so a rebuild that truncates the array drops tokens from `tokenArray` while leaving them in `tokenMap` with a stale index. Finding 5 spotted the survival; what it did not follow through is that the stale index is then *used*.

Built and run: a restored map of `aaa@0 bbb@1 ccc@2 ddd@3` plus an inflated constructed feature rebuilds to a four-column `tokenArray` of `colF@0 aaa@1 bbb@2 ccc@3`, with `ddd` still in the map at stale index 3. A document whose only token is `ddd` encoded as `[1,0,0,1]`: bit 3 set, and bit 3 now means `ccc`. The document is trained as though it contained a word it does not contain.

Requirement 9's token-set comparison happens to refuse the resume in this case, since the map and the rebuilt array differ. But the mutated map is what `featureStore.asJSON()` saves, so the damage outlives the refusal and is read by the next **fresh** training run, which requirement 7a promises this story does not affect.

**Resolution** (approved by Doug): the eager-validation decision now has the rebuild snapshot `tokenMap` and `caseIdTokenMap` and restore both when the requirement 9 check refuses, committing only when a resume proceeds. That touches no part of `oneHot`, uses setters `FeatureStore` already has, and costs a thousand-entry copy at the token cap. Technical Notes gains a "Stale indexes" subsection separating this from the count mutation, the Out of Scope line is rewritten so the story tolerates the non-idempotency without being licensed to leave a corrupted map behind, and requirement 19 asserts a refused resume leaves both maps byte-identical.

---

#### RESOLVED (overstated): A restore can fire more than once, and a resume has no guard

`restorePluginFromStore` is registered twice over: as the `'update' 'interactiveState'` handler (`storyq.tsx:61`) and as the restore callback passed to `initializePlugin`, which `codapInterface.init` invokes as `iCallback(savedState)`. `domain_store.ts` says as much in a comment: "The migration guard is per plugin instance rather than per document, and the plugin accepts restored state into a running instance." Nothing in the spec says what happens when a second restore arrives while a resume is catching up or while an auto-resumed plain run is still iterating.

**Correction, on checking CODAP rather than only the plugin.** The double delivery is unproven. CODAP v2's data-interactive layer contains exactly one piece of `interactiveState` traffic, `requestDataInteractiveState` sending `{action: 'get', resource: 'interactiveState'}` so CODAP can save the plugin's state. Nothing there sends an `update` for that resource, which makes the `'update'` registration dead wiring and the restore a once-per-load event. The v3 working copy consulted showed no matches at all, on a feature branch, so that half is not conclusive. This finding was written as a hazard on plugin-side evidence alone and should not have been.

**Resolution** (approved by Doug): kept in reduced form. Requirement 10 gains an at-most-once guard, because it costs a flag and the failure it would prevent is a second pass writing weights and predicted labels into a student's datasets. Technical Notes records what the CODAP search actually found, so the guard is documented as defensive and nobody later removes it believing it protects a live path. Deliberately **no test requirement**: asserting behavior on a path that may not exist would encode a guess as a specification.

---

#### RESOLVED: `trainingWasInterrupted` keeps its name after its meaning changes

Requirement 10 redefines the flag from "a run was interrupted" to "a run could not be resumed" and keeps the identifier, along with the comment in `training_store.ts` that spells out the old meaning at length. Small, but the whole point of requirement 10 is that the distinction matters.

**Resolution** (approved by Doug): requirement 10 now calls for the rename and for the comment to be rewritten, noting that both came in with STORYQ-86 so this finishes that work rather than churning unrelated code.

### QA Engineer

#### RESOLVED: Nothing in the completion path is awaitable, so requirement 12's test cannot be written as described

Requirement 12 asks for a test covering "save mid-run, restore, resume, complete, and assert the result matches the uninterrupted run". There is no signal for "complete". `ModelManager.progressBar` is an `async` method whose entire body is `runInAction(async () => { ... })`, with the inner promise neither returned nor awaited, so `await this.progressCallback(iIteration)` inside `oneIteration` resolves as soon as the inner function hits its first `await`, well before `computeResults`, the `trainingResults` push, the dataset syncs and `tModel.reset()` have run. Traced call order on a real fit: `progress-enter-0`, `progress-return-0`, `fit-returned`, and only then `progress-after-await-0`.

So neither `fit()` nor the progress callback represents the run finishing, and requirement 2's "resumes to completion on its own" has nothing a test or the resume path can sequence against.

**Resolution** (approved by Doug): the tests wait on the observable end state rather than a promise being invented for them. Nothing in the product needs one; the auto-resume fires and forgets and the pane updates through mobx observation, so the gap was only ever in what the spec asked tests to do. Requirement 12 says how they wait, Technical Notes records the traced ordering so nobody hunts for a promise that does not exist, and making completion awaitable goes to Out of Scope: `runInAction(async () => ...)` only wraps the synchronous prefix, which is a mobx misuse in code every fresh run executes, and requirement 7a keeps it out of this story.

---

#### RESOLVED: Requirement 7c's baseline has to be captured before the change lands

7c wants "a fresh run of N iterations produces weights bit-for-bit identical to the same run before this story". After the change there is nothing left to compare against, so the golden weights have to be recorded from the current build first. This is cheap, since a fit with `trace` true and a continuing step callback runs synchronously to completion in-process, but if it is not written down the test will be authored against the new code and will guard nothing.

**Resolution** (approved by Doug): 7c now says the golden values come from the pre-change build, and **they have been captured**, in `golden-weights.json` in this folder, taken from commit `1c37799`. It holds the dataset generator (MINSTD, seeded, with every intermediate under 2^53 so the sequence is exact and portable), the configuration, how to drive the fit synchronously, and `theta`, `cost` and `constantWeightTerm` for both the locked and unlocked intercept. Two independent runs of the same configuration produced identical output, which is the determinism requirement 7 rests on, checked rather than assumed.

---

#### RESOLVED: No requirement covers a resume that is itself interrupted

A plain run auto-resumes at document open and the student closes the document four seconds in. Because replay suppresses `progressCallback`, `model.iteration` never moved, so the next open should replay from the same saved iteration and behave identically. That is probably correct behavior, and it is worth one line in the requirements and one test, because "probably" is doing the work right now and the reasoning depends on requirement 5's suppression being exactly right.

**Resolution** (approved by Doug): requirement 5d states it, requirement 20 tests it. The behavior is unchanged; what changes is that it is now asserted rather than inferred.

### Performance Engineer

#### RESOLVED: The synchronous replay is a choice the spec never actually weighed, and the asynchronous one costs almost nothing

The 5a decision treats the frozen UI as a given ("The catch-up loop is synchronous (finding 6), so for its duration the plugin's UI is frozen") and then designs around it with a blocking indicator, ruling out option C because driving the progress bar would misrepresent the run's position. But the loop is only synchronous in one configuration. With `trace` false and `progressCallback` detached, the same fit ran to completion through the existing 10 ms `setTimeout`, asynchronously, yielding to the browser between every iteration. On a 20-iteration replay that costs 200 ms on top of the gradient work.

For 200 ms the plugin stays responsive, the catch-up message paints without any of the trickery below, and the option C objection about the progress bar is unaffected since suppressing `progressCallback` still leaves the bar showing the saved iteration.

**Resolution** (approved by Doug): the 5a decision is reopened with option E, an asynchronous catch-up, taken for both modes. Requirement 5b added for the asynchronous shape, 5c for disabling Step and Cancel during a catch-up, and requirement 16 extended to cover the disabled window. The measurement table is recorded in the decision.

Cancel is disabled during a catch-up rather than wired to stop the replay, which keeps this story's code changes entirely inside the replay path: the asynchronous shape is reached by configuring the existing instance (`trace` false, `progressCallback` detached, `iterations` set to the saved iteration) plus the `fit(data, startIteration, startTheta)` parameters requirement 7b already calls for. An abort check inside `oneIteration` would have run on every iteration of every fresh run, which requirement 7a rules out. The pre-existing zombie-loop behavior that made this a question is recorded in Out of Scope and, in full, in a repo oob note.

---

#### RESOLVED: The "yield once" implementation note does not work

The 5a decision closes with an implementation note flagged as easy to get wrong: "Because the catch-up loop is synchronous, setting the message and entering the loop in the same tick means the message never paints. The resume path has to yield once, an awaited `setTimeout(0)`, after setting the flag and before starting the loop." Probed in Chromium, counting rendering opportunities between the mutation and the start of a 2.5 s blocking loop:

| what the page did before blocking | gap | rendering opportunities |
|---|---|---|
| DOM write, then `await setTimeout(0)` | 0.1 ms | **0** |
| React 18 `setState`, then `await setTimeout(0)` | 0.9 ms | **0** (DOM committed, never painted) |
| DOM write, then two awaited `requestAnimationFrame`s | 32.9 ms | 2 |
| React 18 `setState`, then two awaited `requestAnimationFrame`s | 20.2 ms | 2 |

A `setTimeout(0)` yields the task but not a frame: it fires roughly a millisecond later, long before the next vsync, so the block starts first and the message never reaches the screen. With React the state update even commits to the DOM and still never paints. The note as written would produce exactly the bug it warns about.

**Resolution** (approved by Doug): moot, since the asynchronous catch-up removes the blocking loop entirely. The note is retracted rather than deleted, and the measurement kept in the 5a decision, so that nobody reinstates a synchronous catch-up on the assumption that one awaited `setTimeout(0)` is enough to show a message first.

---

#### RESOLVED: Re-measured replay cost is about 40% higher than the figures the design rests on

Re-running the cost decision's experiment against the same corpus, 500 texts from `testing/Ice Cream Reviews.codap3`:

| frequency threshold | tokens | spec's 20-iteration figure | re-measured |
|---|---|---|---|
| 4, the default | 682 (matches) | 5.1 s, 253 ms per iteration | **6.98 s, 349 ms** |
| off | 1000, the cap (matches) | 10.4 s, 521 ms | **14.39 s, 720 ms** |

The token counts reproduce exactly, so the encoding half of the measurement is solid; the timings are machine-dependent and mine came in higher on a desktop. The conclusion that replay stays the right approach is unaffected, but the 5a decision argues from "at five seconds with a message the resume is plainly a better experience", and the number is closer to seven here and worse on the student hardware this ships to. Suggested resolution: quote the figures as a range, name the machine, and note that the argument has to hold at the top of the range.

**Resolution** (approved by Doug): the cost decision now quotes both measurements as a range, notes they came from different machines, and states that the design has to hold at the top of the range rather than the bottom, since student machines are slower than either one measured. The token counts reproduced exactly on both runs, so only the timings were at issue, and the conclusion that replay is the right approach is unaffected.

---

#### RESOLVED: Nothing stops a second catch-up being started on top of the first

`nextStep()` is synchronous today and becomes a multi-second operation on the first Step press after a restore. The Step control is a `div` with `role="button"` and `tabIndex={0}` whose only disabled condition is `tDisabled || trainingWasInterrupted`; requirement 5a adds a message but nothing that disables it. A student who presses Step twice, which is exactly what people do when a button appears not to have worked, starts a second catch-up over the same model.

**Resolution** (approved by Doug): requirement 5c disables Step and Cancel for the duration of a catch-up, and requirement 16 asserts the window. A guard in the manager, so a second call is ignored rather than relying on the pane, is still worth having and belongs in the implementation spec rather than here. (Widened later, during the implementation spec's own review: 5c now covers the whole restore, validation included, because a measurement found the pre-validation window doing more than wasting a press.)

### WCAG Accessibility Expert

#### RESOLVED: The catch-up message is a status message with no live region

Requirement 5a puts the catch-up message in the existing `sq-info-prompt` area. That area is a plain `div` containing a `p`, and `training_pane.tsx` contains no `aria` attribute and no `role` anywhere. A message that appears without a change of context and reports the status of a process is a status message under WCAG 4.1.3 (Level AA), and it has to be programmatically determinable through a live region to be announced. As written, a screen reader user gets nothing while the run is being restored, and nothing when an auto-resumed plain run finishes and the pane silently switches to "You have trained 1 model".

Suggested resolution: requirement 5a specifies `role="status"` on the prompt container. Note the ordering interaction with the paint finding above: an assistive technology announcement needs the same rendering opportunity the visible message needs, so whichever yield is chosen has to happen before the blocking loop either way.

**Resolution** (approved by Doug): requirement 5a now specifies `role="status"` on the prompt container. Requirement 5b's asynchronous catch-up is what makes the announcement possible at all: a blocking loop would have left no rendering opportunity for it to land in, exactly as it left none for the visible message.

---

#### RESOLVED: The progress bar carries requirement 4's meaning and exposes none of it

Requirement 4 makes the progress bar one of the four things that must agree with the restored iteration, and requirement 5a makes a further promise about what it shows during a catch-up. `ProgressBar` renders two `div`s and a `p` holding a percentage, with no `role="progressbar"`, no `aria-valuenow` / `aria-valuemin` / `aria-valuemax`, and no accessible name. None of what requirements 4 and 5a promise is perceivable except visually.

The gap is pre-existing, and fixing it properly may belong in its own ticket alongside the `Button` keyboard failure already in Out of Scope. It is raised here because this story is what gives the bar new meaning, and because adding `role="progressbar"` with the three values is a few lines rather than a project.

**Resolution** (approved by Doug): deferred to the pending accessibility ticket rather than fixed here, and recorded in Out of Scope alongside `Button`'s keyboard activation. `ProgressBar` is shared UI every fresh run renders, the gap is identical before and after this story, and splitting the pane's accessibility across two tickets is worse than doing it once. The fix is a few lines if it is wanted sooner.

---

#### RESOLVED: The freeze leaves no way out, for anyone

While the synchronous catch-up runs, nothing in the plugin responds: not Cancel, not tab navigation, not focus movement inside the iframe. It is not cleanly a WCAG 2.2.1 timing failure, since nothing expires, but combined with the missing live region it produces several seconds of an interface that is unresponsive and silent, which is worst for the users least able to interpret it. The asynchronous replay in the Performance findings removes this entirely. Suggested resolution: fold into that decision rather than treating it separately.

**Resolution** (approved by Doug): closed by requirement 5b. The asynchronous catch-up removes the freeze entirely. What remains is requirement 5c's deliberate disabling of Step and Cancel, which is bounded by the catch-up, visible through requirement 5a's message, and now announced through its `role="status"`.

### Product Manager

#### RESOLVED: The fallback tells the student to press Cancel, and Cancel does nothing to their data

This is the most student-visible defect the review found, and it sits in the path the whole story falls back to. Requirement 6 says "Cancel still works on a restored run, wiping partial weights and predictions exactly as it does now", and requirement 8 keeps the STORYQ-86 message whose text is "Press Cancel to start over".

Run against a restored document: `cancel()` issues two update requests, one to the weights collection and one to the results collection, each with **zero** values. `ModelManager.cancel` builds those requests from `featureStore.featureWeightCaseIDs` and `trainingStore.resultCaseIDs`, and neither is saved with the document, so both are empty after a reopen. The model is reset, the pane returns to "+ New Model", and the Features table still shows the abandoned model's name and weights while the target dataset still shows its predicted labels, now belonging to a model that no longer exists anywhere in the plugin.

Requirement 6 is literally true and materially wrong: Cancel does behave exactly as it does now, and what it does now on a restored run is nothing.

**Resolution** (approved by Doug): requirement 6 rewritten to state the outcome rather than the comparison, and to put the re-acquisition of both case ID collections on the restore path ahead of the resumable-or-not branch. Technical Notes gains a "Cancel wipes nothing on a reopened document" section and a note that both collections are session state excluded from their stores' `asJSON` and from `makeAutoObservable`, which is the shared root of this and requirement 3's duplication problem. Requirement 18 added to cover it. Accepted cost: an interrupted document pays a CODAP read on every reopen, including reopens whose resume will be refused. That is a read rather than a write, so it does not breach the eager-validation decision's rule against side effects of opening a document.

---

#### RESOLVED: Requirement 5a's message is the only thing the student ever learns about a resume

Not a new decision, since the completion decision explicitly accepts that a student may never see the catch-up message. Worth stating as a requirement rather than leaving in a decision's closing paragraph: after an auto-resumed plain run completes, the pane is indistinguishable from one where the student trained the model themselves and walked away. If that is wanted, requirement 2 should say so in as many words, so that a future reader does not read the absence as an oversight and add a notice.

**Resolution** (approved by Doug): requirement 2 now states it outright, that after an auto-resumed run completes the pane is indistinguishable from one the student trained themselves, that this is Jie's option (1) as chosen rather than an oversight, and that a student on another tab may never see the catch-up message. No new student-facing copy, so nothing needing sign-off.

### Student

#### RESOLVED: Two of the three restored cases start with no student action and no way to stop

A restored plain run begins computing at document open with no button pressed, and for the duration nothing in the pane responds, including Cancel. Verified separately that a restored plain run renders Cancel as its only control, so during the freeze the student's single available action is the one that does not work. The asynchronous replay in the Performance findings would keep Cancel live throughout. Suggested resolution: a requirement that Cancel remains available during a catch-up, which also gives the student the "start over" escape the fallback message promises.

**Resolution** (approved by Doug): the freeze is gone with requirement 5b, and opting out of an auto-resume is already decided: Jie chose option (1), and the suppression decision established that CODAP offers a plugin no signal to suppress on. The residual is requirement 5c's disabled window, which that requirement now names explicitly as the only period in which a student cannot act.

### Education Researcher

#### RESOLVED: Opening a student's document changes the saved feature statistics, every time

The suppression decision accepts that a resume writes to the student's datasets when a teacher or researcher opens the document, on the grounds that CODAP offers no read-only signal, and that stands. What is not accounted for is that the *eager validation rebuild* mutates saved state even when nothing is resumed and even when the resume is refused.

Measured across five successive open-and-rebuild cycles with the token map round-tripped through JSON each time, a constructed feature's `count` went 12, 18, 24, 30, 36, rising by the document count on every open, without bound. `featureStore.asJSON()` serializes the live `tokenMap`, so each of those values is what the document then carries. Membership and ordering held in that run, so nothing broke, but a researcher who opens a student's document ten times to look at it has changed the feature frequencies recorded in that document ten times, and the ordering those counts drive is what requirement 9b relies on to make replay bit-for-bit.

There is a second-order consequence for requirement 9a too: the saved `tokenMap` the invalidation check reads is supposed to be "the saved run's column set and ordering", but after one open-without-resuming it is the *rebuild's* ordering, not the interrupted run's.

**Resolution** (approved by Doug): closed against the same snapshot-and-restore change as the mis-encoding finding above. An open that does not resume now leaves the document's feature statistics and orderings exactly as it found them, so a researcher or teacher opening a student's document repeatedly changes nothing, and requirement 9a's check keeps reading the interrupted run's ordering rather than a previous open's. The accepted consequence that a *successful* resume writes to the student's datasets is unchanged and remains as the suppression decision left it.

## Self-Review: Second Pass

A second multi-role pass over the spec as it stands after the first round. Same standard as before: every issue below was verified against the running code before being written down, by throwaway Jest harnesses over the real `LogisticRegression`, `oneHot`, `ModelManager`, `FeatureStore`, `AIModel` and a React render, by reading CODAP v2's own data-interactive handler rather than inferring its behavior, and by re-measuring cost claims against `testing/Ice Cream Reviews.codap3`. The harnesses were deleted once they had answered their questions. Candidate issues that did not survive verification are not listed, and the ones that were checked and held are recorded at the end so nobody re-checks them.

### Senior Engineer

#### RESOLVED: Nothing tells the resume path that the silent catch-up has finished

The catch-up is specified as `trace` false with **both** callbacks detached and `iterations` truncated to the saved iteration plus one. Configured exactly that way against the real `LogisticRegression`, over 40 rows by 10 columns asked for 8 iterations:

| observation | result |
|---|---|
| `fit()` return value | `undefined` |
| gradient steps applied before `fit()` returned | 1 |
| `fitResult` when `fit()` returned | `undefined` |
| gradient steps applied by the time it finished | 8 |
| how the harness learned it had finished | polling `fitResult` every 5 ms, 14 times |

`fit` returns nothing, and with `progressCallback` detached there is no per-iteration signal either. The only observable end of a catch-up is `fitResult` turning from `undefined` into an object, which nothing in the plugin watches.

That matters because three separate requirements all fire at that moment and none of them names a mechanism: requirement 5a clears the catch-up message, requirement 5c re-enables Step and Cancel, and requirement 7b's second `fit` call, the handback, has to start. Technical Notes says the callbacks are "reattached before control returns to the student" and that `fitResult` is cleared "before handing back", both of which presuppose a signal the spec never specifies. The first round's finding 9 prototyped the sequence successfully, so a mechanism was clearly chosen during prototyping; it just is not written down, and the obvious implementations differ materially (polling `fitResult` on a timer, versus attaching a minimal silent `progressCallback` that resolves a promise at the terminal iteration, which contradicts "both are detached", versus giving `fit` a return value, which contradicts "those two parameters are the whole of the change").

The three candidate mechanisms were then measured rather than argued about, over 60 rows by 12 columns with the catch-up truncated to 8 iterations. A silent watcher installed as `progressCallback` produces theta **bit for bit identical** to attaching nothing, for both a synchronous and an asynchronous watcher, maximum absolute difference 0. It sees the terminal iteration with `fitResult` already built, so it is a zero-latency signal and the right place to clear `fitResult`. Polling instead notices the end 10 ms, 27 ms and 103 ms late at poll intervals of 2 ms, 25 ms and 100 ms.

**Resolution** (approved by Doug): requirement 5e names the mechanism, a watcher installed as `progressCallback` for the duration of the catch-up and doing nothing but noticing the truncated last iteration, with `stepModeCallback` still detached. Requirement 5 says explicitly that silence does not mean blindness, so a later reader does not remove the watcher to make the replay "more silent". Requirement 7b's first bullet now says the two parameters are the whole of the change **to `fit`**, and that `fit` gains neither a return value nor a promise. "What replay must suppress" carries the measurement, records why polling and a promise-returning `fit` were both rejected, and points the "clear `fitResult`" trap at the watcher's terminal call, which is the first moment `fitResult` exists. Finding 9 gains a note that the prototype drove the handback by hand, which is why the gap went unnoticed, and that the watcher leaves every figure in its table unchanged.

---

#### RESOLVED: The snapshot that undoes a refused rebuild has to be a deep copy, and the two obvious ways of taking one share the objects `oneHot` mutates

The eager-validation decision says the resume path "snapshots `tokenMap` and `caseIdTokenMap` before rebuilding, using the setters `FeatureStore` already has, and restores both if the requirement 9 check refuses", and prices it as "a thousand entries" at the token cap. `oneHot` does not mutate the map, it mutates the **token objects inside it**: `featureStore.tokenMap[aToken].count++` and `aToken.index = iIndex`. A copy of the map that shares those objects protects nothing. Run against the real store, taking a snapshot after an original run and restoring it after a rebuild:

| how the snapshot was taken | restores the original map? |
|---|---|
| `toJS(featureStore.tokenMap)` | **no**, `colF.count` came back 8 where it should be 4 |
| `{ ...featureStore.tokenMap }` | **no**, same |
| `JSON.parse(JSON.stringify(...))` | yes |

`toJS` is the worse trap of the two, because `featureStore.asJSON()` already uses it and it is the natural thing to reach for. `tokenMap` is deliberately excluded from `makeAutoObservable`, so it is a plain object, and MobX's `toJS` returns a plain object unchanged: measured, `toJS(featureStore.tokenMap) === featureStore.tokenMap` is **true**, and so is `toJS(map).alpha === map.alpha`.

There is a second consequence, and it is the sharper one. Requirement 19 asks for a test that "`tokenMap` and `caseIdTokenMap` are identical to the ones restored from the document, counts and indexes included". A test that captures its expected value with `toJS` or `asJSON()` captures the live object, so after the rebuild it compares the mutated map against itself and passes no matter what the implementation does. The guard on the whole snapshot-and-restore mechanism would be vacuous.

A related trap sits next to it: `featureStore.fromJSON` assigns the restored JSON object straight into the store rather than copying it, so a rebuild writes back into the very snapshot object the document was restored from. Measured: after `fromJSON(snapshot)` and a rebuild, `snapshot.tokenMap` had itself become the rebuilt map.

**A second half turned up on the dive.** The two maps share their token objects, measured `caseIdTokenMap[900] === tokenMap.alpha` true with a mutation through one visible through the other. So deep-copying `tokenMap` and restoring `caseIdTokenMap` separately is still wrong: the id map goes on pointing at the mutated objects, and the measurement showed `tokenMap.alpha.count` reading 8 against a restored map saying 4, with the two maps no longer agreeing on identity. Rebuilding the id map from the copied objects by `featureCaseID` restored it. The spec's phrasing, two snapshots taken with the setters `FeatureStore` already has, reads as exactly the wrong thing.

And the vacuous-test half was confirmed against the real store: after a rebuild a refusal should have undone, an assertion against `toJS(tokenMap)` passes, one against `asJSON().tokenMap` passes, and only one against a deep copy fails.

**Resolution** (approved by Doug): `FeatureStore` gains `snapshotTokens()` and `restoreTokens()`, called only from the resume path, so the correctness lives in one place rather than in prose at the call site. Every part of this trap is invisible where it is used: `toJS` returning its argument, the aliasing between the two maps, and a test that passes while asserting nothing. The eager-validation decision now carries both measurements and the reason the pair exists; requirement 19a says the expected value must be a deep copy taken before the rebuild and points the cheaper test at the pair itself; requirement 7b lists the new methods and the Files table gains `feature_store.ts`. The cost estimate is restated as a deep copy of a thousand token objects plus an id-map rebuild, still far below the rebuild it guards. The decision also records that `featureStore.fromJSON` never rebuilds `caseIdTokenMap`, which measured as leaving it pointed at pre-restore objects, since that matters when a restore is re-entered into a live instance.

---

#### RESOLVED: `featureWeightCaseIDs` means two different things, and requirement 6 does not say which one a resume must re-acquire

Requirement 6 and Technical Notes both say the restore path "re-acquires `featureStore.featureWeightCaseIDs`". That field is filled by `prepWeightsCollection`, which fills it differently in each of its two branches. Driven against a mocked CODAP:

| branch | what the IDs are | where they come from |
|---|---|---|
| update (`allFirstWeightCasesAreEmpty()` true) | **features-collection, that is parent, case IDs** | `dataContext[Features].collection[features].caseByIndex[n]`, keyed by `values.name` |
| create (a model name is already stamped) | **weights-collection, that is child, case IDs** | the ids returned by `create` on `collection[weights].case` |

So there is no single answer to "re-acquire the weight case IDs", and the only existing helper, `getFeatureWeightCaseIDs`, returns the parent ones. An implementer reusing it, which is the obvious move given its name, gets the parent feature cases for a run whose weights actually live on child weight cases.

The failure is silent rather than loud. CODAP v2's `handleCase.update` resolves each case with `context.getCaseByID(caseID)` and `doUpdateCasesFromHashOfNameValues` resolves each attribute with `this.getAttributeByName(key)`, both **dataset-wide**; the collection named in the resource is only checked for being non-empty. So writing `'model name'` and `weight` at parent case IDs through `collection[weights].case` does not fail, it just lands somewhere other than the cases the interrupted run wrote.

Requirement 18's chosen oracle cannot catch it: "Asserting on the requests sent to CODAP is enough, and it is what catches the current failure, since today's Cancel sends two updates whose `values` arrays are empty." A wrong-collection re-acquisition produces two updates with **non-empty** `values` arrays, so that assertion passes while nothing the student can see gets wiped.

There is a third case the spec has not considered at all. For any run after the first, `prepWeightsCollection` takes the create branch and mints fresh child weight cases, and those IDs cannot be recovered from the features collection by name, because several weight children share one parent. Recovering them needs a search of the weights collection by `model name`, which is exactly the discriminator the interrupted run left behind.

Driving both branches against a fake Features dataset with a real parent-and-child shape made the split concrete: the first model a document ever has takes the update branch and records **parent** ids (`{"alpha":700,"beta":701}`), and the next model takes the create branch and records **child** ids (`{"alpha":850,"beta":851}`). The first model's write works only because a parent case and its single child share an item; a second child ends that.

**One thing could not be settled and is deliberately not built on.** The create branch parents its new cases with `parent: aToken.featureCaseID || 0`, and `domain_store.ts:346` records in a comment that the codebase does not know whether that id is the feature case or its first child. So whether a later model's weight cases are correctly parented is pre-existing uncertainty, not something this review could prove either way without a live document, and it is not asserted here.

**Resolution** (approved by Doug): requirement 6b re-acquires the weight case IDs by searching the weights collection for the restored model's name, which `prepWeightsCollection` stamps before any fitting in both modes and in both branches, mapped back to tokens through each case's `parent`. Requirement 6c then refuses the resume, per requirement 8, when that search does not yield exactly one case per token in the rebuilt token set, and requirement 9 gains it as a third rejection condition. That combination gets requirement 9c for the ordinary single-model document, and it guarantees that a resume never writes weights over a finished model's rather than guessing. Requirement 18 asserts the IDs in Cancel's requests rather than only that they are non-empty, requirement 18a covers the refusal, and requirement 14 exercises a two-model document, which is what would surface the parenting question if it is real. Technical Notes records the branch split, CODAP's dataset-wide resolution, and the parenting uncertainty as a pre-existing matter for its own ticket.

---

#### RESOLVED: `AIModel.reset()` will not clear requirement 9a's row count

Requirement 9a adds an optional row count to `IAIModel`, and the migration decision says "`import` leaves it absent rather than coercing it", which means `import` has to skip the field when it is `undefined` rather than assigning it. `AIModel.reset()` is `this.logisticModel.reset(); this.import(defaultModel);`, and `defaultModel` is a fully typed `IAIModel` literal with no row count in it. Verified: with the prescribed skip-when-undefined rule, a model carrying a row count of 500 still carries 500 after `reset()`.

`reset()` runs on Cancel and at the end of every completed run, so a stale row count outlives the run it was measured for and is written into the document by the next `asJSON()`. It cannot produce a wrong resume today, because `buildModel` overwrites the count at the start of every run and only a `trainingInProgress` snapshot is ever checked, but it does put a value in the saved document that describes a model that no longer exists, and it makes the field's lifetime differ from every other field on the model for no stated reason.

Modelling both candidate import rules showed the skip-when-undefined rule is not merely insufficient, it is unnecessary. For a field whose absent state is `undefined`, unconditional assignment gets every case right and is less code:

| import rule | pre-story document | after `reset()` | next save |
|---|---|---|---|
| skip when undefined | absent, correct | **500**, wrong | `{"trainingRowCount":500}` |
| unconditional | absent, correct | absent, correct | key dropped |

`JSON.stringify` omits undefined-valued keys, so an unrecorded count leaves the saved shape untouched and a recorded one round-trips as 500.

**Resolution** (approved by Doug): the field goes into `defaultModel` explicitly as `undefined` and `import` assigns it unconditionally, like the other ten. Requirement 9a says so, and the migration decision's "`import` leaves it absent rather than coercing it" is replaced rather than qualified, since that sentence was written to stop `undefined` landing where a *required* field belongs and does not apply here. The measurement is recorded in the decision, along with the one thing this costs: `asJSON()`'s explicit literal no longer makes TypeScript check that this particular field is present.

### QA Engineer

#### RESOLVED: Requirements 5d and 20 contradict the eager-validation decision about what a resume leaves in the document

Requirement 5d: a catch-up interrupted by the student closing the document "leaves the saved state unchanged". Requirement 20 turns that into a test: "a catch-up abandoned partway leaves `model.iteration` **and the rest of the saved snapshot** exactly as the document had them". The eager-validation decision says the opposite for the case that matters: "When the resume proceeds, the mutation is committed, which is exactly what an ordinary training run does today", and requirement 19 restates it, "a resume that proceeds does commit its rebuild".

A catch-up only runs on a resume that proceeded, so by the time it can be interrupted the token map mutation is already committed and `featureStore.asJSON()` serializes the live `tokenMap`. Measured on the real `oneHot` over a restored map:

```
after the original run   alpha@0(c5) colF@1(c4) beta@2(c3) gamma@3(c3) delta@4(c2)
after the rebuild        colF@0(c8) alpha@1(c5) beta@2(c3) gamma@3(c3) delta@4(c2)
membership identical     true
whole tokenMap identical false
colF count over four successive opens: 8, 12, 16, 20
```

So requirement 20's test as worded fails against a correct implementation. The behavior requirement 5d actually wants is true and worth keeping: `model.iteration` does not move, because replay suppresses `progressCallback`, so the next open replays to the same place. It is the phrase "the rest of the saved snapshot" that is wrong, and it is wrong in a way a test author will discover only after writing the test.

Note that this does not reopen the researcher finding from the first round, which is about opens that do **not** resume. Those still leave the document untouched.

**Pursuing it turned up a real defect behind the wording one.** Simulating four successive open-rebuild-commit cycles with realistic counts, every unigram above the threshold as extraction guarantees, and a constructed feature in 4, 6 and 8 of 8 documents:

| what requirement 9b re-imposes | encoding identical across four opens | open 1 matches the interrupted run |
|---|---|---|
| the rebuilt array and the data columns, which is what 9b says | **no** | yes |
| those plus `tokenMap`'s `index` values | **yes** | yes |

9b as written works exactly once. The committed map carries the rebuild's ordering, so a document interrupted a second time re-imposes that rather than the original run's and lands one ULP away, which is the very difference 9b exists to remove. Membership was stable in every case tried, so a repeatedly interrupted document is never refused by drift, and the exact snapshot difference a committed rebuild leaves is confined to `tokenMap`: `alpha.index: 0 -> 1 | beta.index: 1 -> 2 | gamma.index: 2 -> 3 | colF.count: 6 -> 12 | colF.index: 3 -> 0`, with nothing outside it changed.

One thing that did **not** reproduce, recorded so it is not taken as load-bearing: the Technical Notes "Stale indexes" scenario needs a token sitting in `tokenMap` with a count below the threshold, and ngram extraction cuts at the same threshold `buildModel` uses, so it should not leave one. With realistic counts it was not reachable. The snapshot-and-restore mechanism does not depend on it, being independently justified by the count inflation.

**Resolution** (approved by Doug): requirement 5d now says the *training* state is unchanged, naming `model.iteration` and the `AIModel` snapshot, and says outright that the token map carries the committed rebuild exactly as a completed catch-up would have left it. Requirement 20 tests the `AIModel` snapshot rather than the whole document, and requirement 20a covers the second open landing in the same place. Requirement 9b now re-imposes the saved ordering on `tokenMap`'s indexes as well as on the array and the data columns, with the reason stated so it is not later trimmed as redundant, and the eager-validation decision carries the measurement.

---

#### RESOLVED: The golden weights guard one of the five places requirement 7b constrains

Requirement 7c says "a fresh run of N iterations produces weights bit-for-bit identical to the same run before this story" and calls it "a real guard rather than a tolerance check". `golden-weights.json` holds a MINSTD-generated 120 by 40 matrix fed straight to `LogisticRegression.fit`, with `theta`, `cost` and `constantWeightTerm` for both intercept settings. It is a good guard, and it guards `fit`.

Requirement 7b constrains the implementation in five places, and four of them are outside `fit`: `buildModel`'s resume variant, `prepWeightsCollection` and `prepResultsCollection`, the Training pane's new branch, and the row count `buildModel` records. The regressions requirement 7a exists to prevent are mostly there rather than in the gradient loop, which is the part of this story that changes least. A fresh run that silently rebuilt against a different column set, or that took the wrong branch in a prep step, would produce a different model and still match the golden theta, because the golden test never goes through `oneHot` or the prep steps at all.

Rather than argue about whether the gap mattered, it was closed. The real `buildModel` runs end to end against a mocked CODAP and yields a fully deterministic record: 11 tokens with their ordering and counts, a 40 by 12 encoded matrix, the branch each prep step took, both case-ID maps, and the shape of 31 requests. Captured twice in separate processes, byte-identical.

**One thing the attempt itself taught, and it is now a requirement.** The first capture produced a **one-column** model, because `buildModel`'s `oneHot` call only adds constructed-feature tokens and the unigrams must already be in `tokenMap` from ngram extraction. A fresh-run test that does not seed the map that way guards nothing while appearing to pass.

**Resolution** (approved by Doug): requirement 7d adds a second pre-change baseline, [`golden-fresh-run.json`](golden-fresh-run.json), captured from the same commit as the weights and covering the four places `golden-weights.json` cannot reach; requirement 7e records the seeding trap. The weights file keeps its job as the exactness guard on `fit`, which is what it is good at.

---

#### RESOLVED: The Testing section explains the runner problem with a file that nothing loads

The Testing preamble says `react-scripts test` "resolves a different configuration that never loads `src/test/setupTest.ts`". `jest.config.js` does not load it either. It has `setupFilesAfterEnv: ['@testing-library/jest-dom']`, importing the matcher package directly, and `src/test/setupTest.ts` (whose entire content is `import "@testing-library/jest-dom"`) is referenced by nothing in the repo. Grepping the whole tree outside `node_modules` for `setupTest` finds the file itself and this spec's own `golden-weights.json`, and nothing else.

Both runners were then actually run. `npx jest` gives **16 suites, 106 tests, all passing**, exactly as the section claims. `CI=true npx react-scripts test --watchAll=false` gives **5 suites failed, 11 passed; 22 tests failed, 84 passed**, every failure `toBeInTheDocument is not a function`, so the observable claim is right too. Only the cause was wrong, and it turns out to be a path: CRA resolves its setup file at `src/setupTests` (`react-scripts/config/paths.js:74`) and passes an empty `setupFilesAfterEnv` when it finds none (`createJestConfig.js:36`), while this repo's file sits at `src/test/setupTest.ts`, wrong directory and singular. Its content is precisely the import CRA would have run.

**Resolution** (approved by Doug): the Testing section now carries the measured figures for both runners and the real mechanism, and records that moving the file to `src/setupTests.ts` would make both runners work. The move itself is deliberately not made here: it touches nothing this story owns, and an unrelated rename in the branch's diff cuts against requirement 7a's posture of not churning code the story does not need to change.

### Product Manager

#### RESOLVED: In a document that already has a trained model, "re-acquire the existing result case IDs" is ambiguous, and getting it wrong wipes a finished model's results

Requirement 3 says a resume must not "create a second set of result cases in the target dataset", requirement 6 says Cancel must clear "the predicted labels and probabilities in the target dataset", and Technical Notes says the resume "has to re-acquire the existing case IDs (`featureStore.featureWeightCaseIDs` and `trainingStore.resultCaseIDs`)". None of them says how, and in the most ordinary multi-model document there is more than one answer.

`guaranteeResultsCollection` adds one child case under **every** target parent case for every model after the first. Driven against a mocked CODAP with five target cases:

| step | result cases in the collection | the IDs that run recorded |
|---|---|---|
| model A trained | 5 | 1000, 1010, 1020, 1030, 1040 |
| model B started, then interrupted | 10 | 1001, 1011, 1021, 1031, 1041 |

Reopening that document, the obvious re-acquisition (`caseFormulaSearch[true]` on the results collection, which is the idiom used everywhere else in the file, including `syncWeightsAndResultsWithActiveModels`) returns all ten. `showPredictedLabels` pairs them positionally, `trainingStore.resultCaseIDs[iIndex]` against `documents[iIndex]`, so it would write model B's predicted labels into the first five of those ten, which are not model B's cases. `cancel()` maps the same array, so a Cancel on the restored run would blank the predicted labels and probabilities of **model A**, a completed model the student still has in their table and may have been relying on.

This is a student-visible data loss in exactly the path requirement 8 makes the fallback, and it is the same shape as the first round's Cancel finding: a requirement that reads as satisfied while the thing it promises does not happen. The count is certain from the code; the interleaved ordering above is illustrative of one plausible CODAP ordering, and the point does not depend on it, since ten IDs cannot be indexed positionally against five documents whatever order they come back in.

**Selecting by model name looked like the answer and is not.** `showPredictedLabels` does stamp `'model name'` on every result case it touches, but it is reached only from `stepModeCallback` and from `progressBar`'s completion branch. Counted against a real six-iteration fit driving the real `progressBar`, a plain run had made **zero** `computeResults` calls by the time four iterations were done, and `prepResultsCollection` creates its cases with `values: {}`. So a plain interrupted run, which is requirement 2's headline case, has no name on its result cases for a name search to find. That asymmetry is now recorded in Technical Notes, "What an interrupted run has actually written", because it also governs what requirements 4, 6 and 18 can expect.

Two further facts settled from CODAP's own source rather than inferred: `caseFormulaSearch` returns each case's `parent` but not its `children` (`makeSerializableCase` omits it; only `caseByID` and `caseByIndex` add it), so grouping by parent costs one request rather than one per target case; and a set-aside case is genuinely removed from its collection (`deleteCasesAndChildren` with `setAside`, then `regenerateCollectionCases`), so an inactive model's results can never confuse the selection.

**Resolution** (approved by Doug): requirement 6a re-acquires the result case IDs as **the last child of each target case**, in the order of the target case list the resume captured, from a single `caseFormulaSearch[true]` grouped by `parent` in the plugin. That works in both modes because it depends on nothing having been written, it preserves the positional pairing `showPredictedLabels` needs, and it changes neither the saved document nor a fresh run. Requirement 14 now runs against a document that already holds a completed model and asserts the specific IDs; requirement 18 asserts the IDs in Cancel's requests rather than only that they are non-empty, and covers both modes. Technical Notes records the accumulation, the set-aside behavior and the mode asymmetry. Stamping the model name at prep time, which would have let a name search work uniformly, was considered and not taken: it is a one-line change but it alters what a fresh run writes to CODAP, and requirement 6a does not need it.

### WCAG Accessibility Expert

#### RESOLVED: A `role="status"` that arrives with its own message is not announced

Requirement 5a says "The prompt container carries `role="status"`, so the message is announced rather than only shown". A live region has to be in the accessibility tree **before** its content changes; a region that is inserted, or that acquires its role, in the same commit as the text it holds is generally not announced by NVDA or JAWS, which is the failure mode this requirement exists to prevent.

`modelTrainerInstructions()` returns a different `div.sq-info-prompt` from each of its four branches, so the natural reading of requirement 5a is a fifth branch carrying the role. Rendered and re-rendered in React 18 to see what actually reaches the DOM:

| observation | result |
|---|---|
| `role` on the prompt div before the catch-up | `null` |
| same DOM node reused across the branch change | **true** |
| `role` after the catch-up | `status` |
| text after the catch-up | the catch-up message |

React reconciles the branches to the same `div`, so it does not remount, which is the good half. The bad half is that the node gains `role="status"` and its new text content in one commit, so the region is registered at the moment it is already full. That is the same ordering problem the first round found for painting, and it survives the move to an asynchronous catch-up, because asynchrony buys a rendering opportunity but does not separate the role from the text.

Repeating it against the **real** `TrainingPane` rather than a stand-in confirmed the reconciliation: flipping the interrupted flag between renders left `before === after` true, one `.sq-info-prompt` node, class and children patched, `role` null throughout.

**A second and larger limit turned up in the same dive.** `TabPanelTabContent` sets `aria-hidden` on every unselected tab, and the Training pane renders eagerly inside it. Rendering the real pane inside the real `TabPanel` with Setup selected:

```
aria-hidden ancestors of the prompt: ui-item aria-hidden=true
tab content [0] aria-hidden=false  ui-item-selected
tab content [1] aria-hidden=true   ui-multiview-item-hidden
```

So a live region in the Training pane announces nothing whenever another tab is selected, which is exactly the situation requirement 2's auto-resume starts in when the saved tab was not Training. Requirement 5a's promise had to be scoped rather than fixed: hiding an inactive tab panel from assistive technology is correct practice, and undoing it would mean changing shared UI every panel uses.

**Resolution** (approved by Doug): requirement 5f puts the role on the prompt container in every branch, with the reconciliation measurement as the reason, so it cannot be read as a style preference and trimmed to the catch-up branch. Requirement 5g records the tab limit, notes it applies equally to requirement 8's fallback message, and states that nothing is done about it. Requirement 5a also drops its claim that `training_pane.tsx` has no `role` anywhere in favor of the accurate one: the file sets none of its own, but the rendered pane carries `role` and `aria-disabled` from the `Button` component.

### Performance Engineer

No open issues. Two of the spec's cost claims were re-measured rather than taken on trust, and both held.

- **The eager validation rebuild is as cheap as the decision says.** Running the real `oneHot` over the 500 texts of `testing/Ice Cream Reviews.codap3`, the `buildModel` path took **12 to 13 ms** across four successive rebuilds, against **312 to 326 ms** for a single `grad()` pass at the resulting width. That is 4% of one gradient pass and 0.2% of a full 20-iteration replay, so "far below the cost of a single gradient pass" is accurate with a wide margin.
- **The token count reproduces a third time.** The same corpus at the default frequency threshold yielded **683 tokens** on this machine, against the 682 recorded twice before; the one extra is the constructed feature the harness added. The encoding half of the cost decision is settled.

### Student

No new open issues. The first round's finding is closed by requirements 5b and 5c, and the residual, that a restored plain run has no enabled control for the duration of its catch-up, is stated in 5c rather than left implicit. The QA and Product Manager findings above are the ones with student-visible consequences in this pass.

### Education Researcher

No new open issues of its own. The first round's finding, that opening a student's document must not change its saved feature statistics, holds for opens that do not resume, and the second-pass QA finding on requirements 5d and 20 is its counterpart for opens that do: it does not reopen the researcher decision, it corrects a requirement that currently claims more than the decision allows.

### Checked and held

Re-verified against the running code and found accurate, recorded so nobody spends the time again: `prepWeightsCollection` does take the create branch when a model name is already stamped; the fit loop with `trace` false and no callbacks applies exactly one gradient step synchronously and the rest through the 10 ms `setTimeout`; `featureStore.asJSON()` serializes the live `tokenMap`; `guaranteeFeaturesDataset`'s create branch has no `catch`, so requirement 9d's rejection is real; the suite is green at 16 suites and 106 tests under `npx jest`; and the corpus token count reproduces.

One candidate did not survive and is not listed above: browser timer throttling of the catch-up's 10 ms `setTimeout` in a backgrounded tab, which would have undercut requirement 5b's "under 3%" figure. Playwright launches Chromium with background throttling disabled and never reported `document.visibilityState` as `hidden` across a tab switch, so the check was inconclusive in both directions rather than negative, and it is left out on the same standard the first round used.

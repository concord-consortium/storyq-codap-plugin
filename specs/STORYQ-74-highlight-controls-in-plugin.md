# Select and Show/Hide Highlight Colors in the Plugin

**Jira**: https://concord-consortium.atlassian.net/browse/STORYQ-74

**Design**: [Zeplin: StoryQ Updates, section 4A](https://app.zeplin.io/project/5e4baae7fb685faac9bf4a0a/screen/6938b582aef73b81d631eef6)

**Status**: **Closed**. The source spec folder this was built from was deleted on closing; its contents are in git history at commit `2779912`.

## Overview

Move the two per-feature display controls, highlight visibility and highlight color, out of the CODAP Features table and into the StoryQ plugin's Features tab, and hide the corresponding columns from the table. Single-word extraction stops cycling six colors and uses one color (yellow) for every word.

Today a student who wants to turn a feature's highlighting off, or change the color it highlights with, has to leave the plugin, find the Features table CODAP created, and edit a checkbox or a color swatch in a spreadsheet cell. The controls live far from the feature they affect, they are surfaced as raw data columns rather than as actions, and the color picker offers CODAP's full sixteen-color palette even though StoryQ only ever assigns six. This story puts both controls on the feature itself as a show/hide button and a color button on each row, keeps the underlying data but stops showing those two columns, and trims the picker to StoryQ's own six colors.

## Requirements

### Features table

1. The `color` and `highlight` attributes of the `Features` dataset are hidden from the CODAP Features table. The attributes themselves are retained, along with their values.
2. Hiding applies both to newly created Features datasets and to Features datasets restored from a saved document created before this change.
3. The plugin continues to write `color` and `highlight` values into the dataset, so anything else in the document that reads those attributes keeps working.
4. A new visible attribute, `total frequency`, is added to the features collection. Its value is `numberInPositive + numberInNegative` for constructed features and `numPositive + numNegative` for tokens, so it equals the sum of the two frequency columns beside it **wherever those two are correctly maintained**. Do not derive it from `Token.count`, which is a separate counter that does not agree in every path. *(The qualification is a pre-existing defect, not one this story introduces — see [STORYQ-85](https://concord-consortium.atlassian.net/browse/STORYQ-85) under Not Yet Implemented.)*
5. `total frequency` is written at **four** sites: feature-case creation, unigram-case creation, the update path, and the restore backfill required by requirement 6. The fourth is easy to miss because it has no counterpart for the two existing frequency values, which a restored document already has populated.
6. `total frequency` is created for restored documents too, not just new ones, **and its values are backfilled for the cases that already exist**. Without the backfill an existing document gains an empty column, since restored documents do not re-run case creation. *(Implemented by reading the two frequency values back off the cases rather than off the restored `tokenMap`, a deliberate departure — see Decisions.)*
7. The visible columns of the Features table after this story are the feature name, the two existing frequency attributes, and `total frequency`. The two frequency attributes are **named from the student's own class labels**, not from any fixed string; nothing in this story may assume the `positive` / `negative` pair. `total frequency` is the exception, being a new attribute this story names.
8. The work that has to be done to an already-existing Features dataset (hiding `color` and `highlight`, creating and backfilling `total frequency`, repairing the ngram feature's color per requirement 22) is collected in one clearly named function on the restore path, and every step of it is safe to run on every document open. The whole function runs at most once per document open, which has to be arranged deliberately: `guaranteeFeaturesDataset()` is re-entered on every feature added and on every collapse and expand of the StoryQ panel.

### Features tab: per-feature controls

9. Each row of the feature list in the **Features** tab gains two controls to the left of the feature name pill, in this order: a **highlight visibility toggle** and a **color button**.
10. Both controls are 28x28 px, 3 px corner radius, 1 px `#177991` border, spaced 5 px apart, with the name pill following. Icons are 24x24 px. New exportable assets from Zeplin: `Visibility On Icon`, `Visibility Off Icon`, `Color Icon`.
11. **Visibility toggle** states:
    - Highlight on: white fill, "visibility on" (eye) icon filled `#177991`; the name pill is filled with the feature's color.
    - Highlight off: white fill, "visibility off" (eye with slash) icon filled `#177991`; the name pill is filled white.
    - Hover: `#d3f4ff` fill. Pressed: `#bfefff` fill. Keyboard focus: `#d3f4ff` fill with a 2 px `#0957d0` border.
12. Toggling visibility off removes that feature's highlighting from the text pane; toggling it on restores it. The feature's color is remembered while highlighting is off (the color button keeps showing the feature's color even when the pill is white).
13. **Color button** states:
    - Default: filled with the feature's current color, 1 px `#177991` border, droplet icon filled `#616161`.
    - Hover: the feature's color at 50% alpha. Pressed: same as default. Keyboard focus: the color at 50% alpha with a 2 px `#0957d0` border.
14. Activating the color button opens a color picker anchored below it. Activating it again, clicking elsewhere, pressing Escape, or moving focus out of the picker closes it. When there is not enough room below the button inside the plugin frame, the picker opens above it instead; it is never clipped by the frame.

### Color picker

15. The picker offers exactly StoryQ's six feature colors: `#ffe671`, `#dbb6fb`, `#45f1eb`, `#a8e620`, `#fb93e8`, `#9ce1ff`. There is **no `more` button**; these six are the entire palette.
16. The picker uses **CODAP's current swatch component**, from the CODAP overhaul design, not the older swatch drawn on the StoryQ board. Per swatch: 24x24 px overall containing a 22x22 px painted square inset 1 px, radius 2 px; unselected 1 px `#757575` inside border; selected 2 px `#006c8e` inside border plus a check mark. Grid four per row at a 27 px pitch with a 12 px inset, giving a **129x75 px** popover, white, 1 px `#d0d0d0` border. *(The container size is derived from Michael's swatch component rather than drawn — see Not Yet Implemented.)*
17. When the feature's current color is not one of the six, the picker appends a **seventh** swatch showing that color, checked. "Not one of the six" is a normalised comparison: expand three-digit shorthand and lower-case both sides, or a palette color will show up as a spurious seventh swatch beside its own duplicate.
18. Choosing a color applies it to the feature immediately: the name pill, the color button, and the text pane highlighting all update without a separate confirm step.
19. Apart from the palette contents, the picker follows CODAP's current color picker behavior: single-select swatch grid with arrow-key navigation and Escape cancelling. Left and Right move through the swatches in order and wrap at the ends; Up and Down move between rows keeping the column position, clamping to the last existing swatch in the ragged second row. This is a hand-written roving tabindex, since the plugin has no widget library.

### Single-word extraction

20. Extracting single words assigns one color, yellow `#ffe671`, to the ngram feature and to every token it produces, instead of cycling the six colors per word.
21. The ngram feature row in the Features tab shows that color rather than rendering colorless as it does today.
22. **Conditional on the ngram feature carrying `kNoColor`**, restoring a document sets that feature's color to `#ffe671` and then sets every **unigram** entry in the restored `tokenMap` to **the feature's repaired color**. If the ngram feature already has a real color, the whole step is skipped, tokens included.
23. The ngram feature name gains its missing space: `single words with frequency ≥ 4 ignoring stopwords`. New features only; lands as its own commit.
24. The single-words row carries **both** controls, like every other row. Neither is hidden or disabled there.
25. The visibility toggle on that row hides and restores highlighting for **all** extracted words at once, by setting `highlight` on every unigram entry in `featureStore.tokenMap` as well as on the ngram `Feature`.
26. The color button on that row recolors **all** extracted words at once, by setting `color` on every unigram token as well as on the ngram `Feature`.
27. **Both** a recolor and a visibility change survive re-extraction. Unchecking the single-words feature in the Training tab deletes every token and re-checking it re-creates them; the re-created tokens take the ngram `Feature`'s **current** color and **current** `highlight` rather than `#ffe671` and `true` unconditionally, so the row and the words it stands for never disagree.
28. Neither fan-out relies on CODAP's Undo. The student reverses a color change by choosing the previous color again, and a visibility change by toggling it back. Nothing warns before a fan-out.
29. Both fan-outs write back to the Features dataset in a single batched request across the unigram cases, rather than one request per case (roughly 680 cases per click). Borrow the `caseFormulaSearch[type='unigram']` lookup plus one batched `update ... .case` from `syncUnigramsInFeaturesDataset()`, but **not** its `if (!iChosen) this.deleteUnigramTokens()` branch.
30. Both fan-outs write the parent `Feature`'s value in the same tick as the token values, which is what makes the text pane refresh.

### Robustness

31. `kNoColor` never reaches a rendered feature row. It remains valid only for the feature under construction.
32. The highlight style guard in `utilities.ts` tests against `kNoColor` explicitly rather than relying on string truthiness, so an invalid inline `backgroundColor` can never be emitted.
40. **A restored feature's `targetCaseFormula` is re-derived on restore**, so a `count` feature that comes back from a saved document counts and highlights the same as one created in the session. *(Pre-existing defect, pulled in because requirements 4 and 12 both sit on top of it. Numbered 40 so the other 39 keep their numbers.)*
42. **A `count` feature keeps its place in the feature IDs rebuilt after training.** Treat a constructed feature as present when its value is boolean true **or** a number greater than zero, which is the rule `getTargetCaseFormula()` already states as `attr=true` for the default and `attr>0` for count. *(Requirement 40's defect reached by a second route; 40's repair does not touch it.)*

### Training tab

33. The Training tab is unchanged. The visibility and color buttons do not appear there; that tab keeps only the existing `chosen` checkbox per feature, and a feature's row there keeps showing that feature's color whatever its highlight state. The white-when-hidden pill belongs to the control, so it appears only where the control does.

### Accessibility

34. Both new controls are real `<button>` elements, reachable and operable by keyboard (Enter and Space), with accessible names that identify both the action and the feature (for example, `Hide highlighting for count: "love"`).
35. The visibility toggle carries its state in its accessible name, which changes with the state. It does **not** also set `aria-pressed`, since combining a name that changes with a pressed state announces contradictory information. The color button exposes the picker's open state with `aria-expanded`.
36. The keyboard focus indicators specified in the design (2 px `#0957d0`) are implemented for both buttons and for the picker's swatches, using `:focus-visible` rather than `:focus`. On the two row controls, implement it as a **border swap** so the 28x28 box does not change; on the swatches, use an **outset ring**, because the swatch's own borders already carry selection state.
37. Focus moves into the picker when it opens, landing on the currently selected swatch, and returns to the color button when the picker closes by choosing a color, by pressing Escape, or by activating the button again. **On the other two closing routes it must not return**: clicking elsewhere and moving focus out are both the user saying where focus goes next.
38. Color is not the only channel carrying meaning: the eye and eye-with-slash icons distinguish highlight state independently of the pill's fill.
39. Every one of the six palette colors is used with dark text (`#222222`) only, and all six clear WCAG AA with room to spare. That guarantee covers the palette, and the palette is closed. It does **not** cover a color retained from a document saved before this story; requirement 17 keeps such a color selectable.
41. **Each swatch in the picker has an accessible name, and the picker's selection is exposed to assistive technology rather than drawn only.** The grid is a single control carrying a group role (`listbox` with `option` children, or `radiogroup` with `radio`), a name identifying which feature is being recolored, and a per-swatch selected state. Requirement 17's conditional seventh has no palette name, so it takes a generic one such as "Current color". The color button's own accessible name identifies the feature.

## Technical Notes

- **The pinned `codapv3` commit is a good guide and not an authority.** On 2026-08-06 a source reading at `f3d41932d` was contradicted by the running application (see decision I2). Treat a source reading at that commit as a hypothesis to check, not a verified fact, especially for anything about ids or resource resolution. Checking it rarely means clicking: `git worktree add <dir> f3d41932d` plus `npm ci --ignore-scripts` gives that exact build in about fifteen seconds, and its handlers run under jest with no app around them.
- **A function on a serialized model cannot survive a save, and nothing here would catch the next one.** `Storyq.getPluginStore()` serialises with `JSON.parse(JSON.stringify(...))` expressly to strip functions. `Feature.targetCaseFormula` is currently the **only** instance, and the same file shows the pattern done correctly: `getContainFormula()` returns a string. Store the result, not the producer. The stripping is silent, the field is optional so TypeScript never complains, and requirement 40's test is the first asserting anything about the serialized shape.
- **Hiding is stored outside the attribute**: CODAP v3 keeps the flag in the document's `SharedCaseMetadata`, not on the attribute record. It persists, so the requirement 2 migration repairs each pre-change document once. Reading it back needs the right call: `attributeList` omits it, while `get …attribute[<name>]` includes it. Requirement 8 still issues the hides unconditionally, on cost rather than on impossibility.
- **`guaranteeFeaturesDataset()` is not a once-per-open call.** It is re-entered on every feature added and on collapsing or expanding the StoryQ panel, but **not** on a tab switch (`TabPanel` never unmounts its panels) and **not** on re-checking the ngram box (the call sits behind the `tokenMapAlreadyHasUnigrams` guard, which the notification handler has already made true by then).
- **Three implementation traps**, all verified rather than inferred:
  1. **Mutating a token does not refresh the text pane.** `tokenMap` is deliberately excluded from `makeAutoObservable`, so the `featureStore.highlights` computed cannot track it. Any control that changes token state must also write the parent `Feature` in the same tick.
  2. **Restored documents never re-run the dataset creation code.** `guaranteeFeaturesDataset()` returns early whenever `featureDatasetID !== -1`, which is precisely the restored-document case, so both migrations have to run on the restore path.
  3. **Tokens are created in two places, and the second one is a notification handler.** `handleUpdateFeatureCase()` builds a token when an echoed case says `chosen` and none is in the store. It is the site the student's own gesture reaches; on a Training tab re-check `updateNgramFeatures()` does nothing at all.
- **Batching is the difference between 242 ms and a minute.** Twenty per-case `caseByID` updates took 1941 ms, extrapolating to roughly 66 seconds for 682 cases; the equivalent single batched `.case` request took 242 ms. The echo is one notification carrying all 682 cases with full values, not 682 notifications.
- **Nothing is available to build the picker with.** The plugin's runtime dependencies are mobx, mobx-react, react, react-dom, clsx, fontawesome, iframe-phone and pluralize. No React Aria, no headless UI kit, no positioning library. The popover, its placement and flip, the swatch grid, the roving tabindex and the focus return are all our own code, and the plugin's own `Button` is a `div` with no key handler and is unusable here.
- **A popover will be clipped by the feature list's own scroll container**, and `position: fixed` left in the row does not escape it either, because the tab panel sets an inline `transform` and so becomes the containing block. Portal it out.
- **There is no name pill in the markup today**, which requirement 9 assumes. `.feature-list-item` is the entire 400 px row and carries both the border and the background color. Adding the controls means introducing a wrapper and demoting the current row to the pill, and the wrapper has to collapse on the Training tab or requirement 33 is broken by the restructure itself.
- **Case values arrive as strings**: `chosen` and `highlight` come back from CODAP as `"true"` / `"false"` and `usages` as a JSON string. Any new comparison must normalise, since `"false"` is truthy.
- **CI turns lint warnings into build errors** (`npm run build` under `CI=true` via `react-scripts`), so an import left orphaned by an edit is a red build rather than a tidiness note.

## Out of Scope

- Changes to the Training tab or to the Testing tab.
- Zeplin items 1, 2, 3 (already shipped) and item 5 (text display splitters, tracked separately).
- Changing how colors are assigned to non-ngram features (the six-color cycle stays).
- Removing the `color` and `highlight` attributes from the dataset outright.
- Adding an accessible name to the existing delete button, or replacing the shared `Button` component elsewhere in the plugin.
- **Restyling the "Add Features" button**, even though section 4A draws it as 107x28 with a 1 px `#177991` border and radius 3 while it renders as 94x38 with a 1 px `#aaaaaa` border and radius 4. It uses the shared `.sq-button`, which the Training, Testing and Setup tabs also use, so restyling it here would change the Training tab that requirement 33 freezes. Michael's design updates button styling across the whole plugin, which is a larger piece of work than this story; the mismatch is expected rather than missed. (Doug's call, 2026-08-06.)

## Not Yet Implemented

- **The `positive` / `negative` hardcoding in the update path** — `domain_store.ts` writes to the literal attribute names `'frequency in positive'` and `'frequency in negative'`, but those attributes are named from the student's class labels, so the update path is a silent no-op for any other labels. Filed as [STORYQ-85](https://concord-consortium.atlassian.net/browse/STORYQ-85); this story adds a comment pointing at it and deliberately does not fix it. Two related details recorded there: `featureDoesNotMatchItem()` has the same defect in a more dangerous place, reading the bare prefix so the comparison is always true and every feature is rewritten on every pass; and `notification_manager.ts` reads the same two literals.
- **The weights-table sliver** — during feature extraction a 50 px empty strip remains where the weights collection sits, because CODAP has no collection-level hide. Filed as [CODAP-1492](https://concord-consortium.atlassian.net/browse/CODAP-1492), against the team that owns the rendering. StoryQ already hides the weights attributes during extraction and reveals them at training, so the substance of the design note is satisfied.
- **The yellow collision** — `featureColors[0]` and `ngramColor` are both `#ffe671`, so the first ordinary feature in a document matches every extracted word. Deliberately left for Jie to meet in the running build; requirement 20 keeps the yellow in a single exported constant so the fix is a one-line edit if she wants one. The two are kept as independent constants rather than aliased, so changing one does not silently move the other.
- **The color cycle restarts at yellow on every document open** — `featureColorIndex` is module state and is not persisted. Verified; recorded rather than fixed, because persisting it means changing `color-utils.ts` and `FeatureStore.asJSON()`, which is existing code outside this story's surface. Should be filed as its own bug.
- **The delete button has no accessible name** — verified, and out of scope under the constraint that changes stay inside the new feature. The row ships with two named buttons and one anonymous one, and the anonymous one is the destructive one. Should be filed as its own bug.
- **Text-color adaptation for out-of-palette colors** — doc 1's `contain: "good"` is `#777`, which is 3.55:1 against `#222222` and fails AA. This story neither creates that condition nor fixes it; the color was typed in before the column was hidden, and hiding the column removes the route by which it got there.
- **Running `targetCaseFormula` properly in `recreateUsagesAndFeatureIDs()`** — would mean a formula search per feature and would make a post-training pass far more expensive than the value read it does today. Requirement 42's predicate reproduces the formula's meaning at the point where the value is already in hand.
- **`getDescriptionFor()`'s literal newline and indentation** inside its template string. Noticed and explicitly not fixed; it is dead in practice, its only consumer being a commented-out line.
- **The popover geometry needs Michael's confirmation before shipping.** 129x75 follows from his swatch component plus the four-per-row layout; it is derived, not drawn.

## Decisions

### Hide the two columns, or remove the attributes entirely?

**Context**: The story said to hide the columns "only if the plugin relies on these attributes in the dataset". The investigation found a split answer: the plugin does not rely on the dataset for persistence, since `FeatureStore.asJSON()` saves both values in the plugin's own state, but it does currently rely on them as the edit channel, which is exactly what this story replaces.

**Options considered**:
- A) Hide both attributes, keep writing values to them
- B) Remove both attributes and delete the color/highlight branches of `handleUpdateFeatureCase()`
- C) Hide `highlight`, remove `color`

**Decision**: **A.** Removal is a one-way door for documents already in the wild, and it would delete values a student may have graphed. Hiding gets the entire user-visible benefit, matches the pattern already used for `chosen`, `type`, `usages` and the weights attributes in this same dataset, and needs no changes to `NotificationManager`. Writing to a hidden attribute is proven in production, since `chosen` is created hidden and written on every Training tab click. Removal stays available as a later cleanup. Verified afterwards that hiding does not disturb a graph that already plots the attribute: nothing in the display path drops an assigned axis, legend or split attribute when it becomes hidden, so the only loss is the ability to re-select it from the axis menu, which is what hiding is for.

---

### What do the two buttons do on the "single words" row?

**Context**: The ngram feature is one row in the plugin but hundreds of cases in the Features table (682 with the ice cream training data), each with its own `Token.color` and `Token.highlight`. The Zeplin heading requires both buttons on every row, but all eleven state mockups use the same ordinary feature, and nothing states what either button does when the row stands for hundreds of tokens.

**Options considered**:
- A) Visibility toggle applies to all tokens; color button applies to all tokens
- B) Visibility toggle applies to all tokens; the color button is hidden on the ngram row
- C) Both buttons hidden on the ngram row (contradicts the Zeplin heading)

**Decision**: **A**, confirmed by Jie Chao 2026-08-05: "I am leaning toward keeping the color picker for single-words so the layout remains the same. Occasionally, user may use both count feature and single-word features." Recoloring the whole single-words set is a real workflow, not a theoretical capability. The eye is the most valuable control on that row, since single words is the one feature that can flood the text pane, and once all words share one color the color button becomes the single knob distinguishing single-word highlighting from other features.

---

### What should the picker's "more" button do?

**Context**: The design says the picker is CODAP's picker with StoryQ's six colors, and the mockup draws the `more` button. CODAP's `more` expands `react-colorful` with Cancel and Set Color.

**Options considered**:
- A) `more` expands a full picker, adding `react-colorful`. Carries extra scope: to stay accessible this needs automatic text-color switching in three places
- B) `more` opens a native `<input type="color">`. No dependency, identical contrast problem
- C) Omit `more`; the six StoryQ colors are the whole palette
- D) Keep `more` visible but defer the expanded picker to a follow-up

**Decision**: **C**, answered by Jie Chao 2026-08-05: "Let's drop the 'more button' and hide the color-picking column in the features table." **The deciding factor is contrast.** Highlighted words render as `#222222` on the feature color; all six StoryQ colors clear WCAG AA with room to spare (7.91:1 to 12.73:1), while colors reachable through `more` do not (`#000000` is 1.32:1, CODAP's blue 2.34:1, its red 2.30:1). The plugin has no text-color adaptation, so a student who picks a dark color makes their own highlights unreadable, and the alpha slider makes a fully transparent highlight reachable too. Trimming sixteen colors to six is partly about guaranteeing every available choice works as a highlight; `more` reopens exactly what the story closes. Option D was rejected outright: a visible button that does nothing is worse than either end state.

---

### Is the weights-table note part of this story?

**Context**: The Zeplin board carries a note next to section 4B asking for the weights table to be hidden during feature extraction and expanded only during training.

**Options considered**:
- A) In scope: hide the weights collection during extraction and reveal it at training
- B) Out of scope: raise it as its own story
- C) In scope only if it turns out to be small on top of the column-hiding work

**Decision**: **B**, answered by Jie Chao 2026-08-05, and filed as [CODAP-1492](https://concord-consortium.atlassian.net/browse/CODAP-1492) rather than as a StoryQ story. **Most of the note turned out to be implemented already**: training calls `showWeightAttributes()`, which combined with `hideWeightsAttributes()` at creation is exactly the behavior the note describes. The only outstanding gap is a 50 px empty strip that CODAP's case table draws, and StoryQ cannot fix it: there is no collection-level hide in the plugin API (verified against four separate handlers), hiding every attribute only shrinks the sub-table rather than removing it, and deferring creation of the weights collection collides with `childCaseID` feature identity. Jie gave her answer before being told most of it was already done, so she was choosing under the impression that substantial work was being deferred; the answer is still right and if anything better suited to the smaller scope, but the ticket describes the sliver rather than "hide the weights table".

---

### Is "total frequency" part of this story?

**Context**: Raised by Jie while answering the weights-table question. The attribute does not exist, and the design does not have it either: section 4A's screenshot shows red strikethroughs over exactly `color` and `highlight`, leaving two frequency columns, not three. So it is an addition to the design rather than a restatement of it.

**Options considered**:
- A) In scope: add it as part of this story's Features table changes
- B) Separate story, sequenced right after this one
- C) Separate story, independent

**Decision**: **A**, confirmed by Jie 2026-08-05: "I think 'total frequency' works. I can't think of a better term at this moment. Yes for single-word extraction." This story is already deciding what the Features table shows, and changing that table twice would reopen a question it just closed. **Use `numPositive + numNegative`, not `Token.count`**: the two do not agree everywhere (the column-feature branch increments `count` without touching either class counter), and the two existing frequency columns are written from the class counters, so summing those is the only way the total is guaranteed to equal the columns beside it. A total that visibly fails to match its neighbours would be worse than no total at all. A CODAP formula attribute was rejected because the formula would have to interpolate the dynamically named frequency attributes.

---

### What does the picker show when the feature's current color is not one of the six?

**Context**: Surfaced by the test document, in which `contain: "good"` carries `#777`, set from the Features table. Editing a `color` cell opens a text input with a small swatch button beside it, and typing a hex value straight into the input is what most people do, so every existing document may contain arbitrary colors entered as free text.

**Options considered**:
- A) Append a seventh swatch showing the current color, checked, as CODAP does
- B) Show the six swatches with nothing checked, and let the first pick replace the color
- C) Migrate out-of-palette colors to the nearest of the six on restore
- D) As C, framed as cleanup now that the palette is closed
- E) Accept a picker with nothing checked, on the grounds that the case is rare

**Decision**: **A**, answered by Michael Tirenin 2026-08-05. It is a handful of lines, it is honest about the feature's current state, it does not discard a color anyone chose, and it costs nothing when the case does not arise. Rarity is an argument for it being cheap, not for leaving the state undefined — and the failure mode is silent: a feature with a visible color whose picker shows nothing selected. CODAP's mechanism of holding the extra swatch's id in a ref was noted as **not** needed here, since that exists only because React Aria forbids a `ListBoxItem` id from changing between renders and the plugin has no React Aria.

---

### Should the ngram feature name fix ride along?

**Context**: `constructNameFor()` produces `single words with frequency ≥ 4ignoring stopwords` with no space. Visible in the plugin, in the Features table, and in the Jira screenshot attached to this story.

**Options considered**:
- A) Include it; it is one character, already written in the prior-art commit, and visible in this story's own UI
- B) Exclude it and file a separate bug

**Decision**: **A**, as its own commit so it is easy to isolate in review. A separate ticket for a missing space would cost more in process than the fix costs in code. **Renaming is safe here** for three verified reasons: `constructNameFor()` has exactly one caller, at feature-creation time, so only newly created features are affected and there is no migration; `addOrUpdateFeatureToTarget()` returns early for ngram features, so the name never becomes a target-dataset attribute name; and no name-keyed lookup touches it.

---

### Is there a defined behavior for a feature with no color?

**Context**: The design defines "highlight off" as a white name pill. `kNoColor` is the literal string `"NO_COLOR"`, which browsers reject as a CSS color, so the inline declaration is dropped and `.feature-list-item`'s own `background-color: white` takes over — producing a white pill that is visually identical to the design's "highlight off" state but means something different. In the text pane the guard tested truthiness, which `"NO_COLOR"` passes, so an invalid inline style was emitted and the word highlighted only by falling back to the `.highlighted` class background.

**Options considered**:
- A) Guarantee every feature in the list has a color by the time it is rendered; treat `kNoColor` as a bug
- B) Render `kNoColor` as a white pill with an unfilled color button, and let the color button assign one

**Decision**: **A.** The design assigns white a specific meaning, so a second unrelated cause of a white pill is a defect rather than a tidy-up. Two pieces of work follow: a restore migration setting a `kNoColor` ngram feature to `#ffe671`, and tightening the `utilities.ts` guard to test against `kNoColor` explicitly. *(Originally reasoned as "transparent" and corrected to "white" on 2026-08-06 by measuring in a browser with the real stylesheet applied. The conclusion is unaffected and if anything stronger, since the collision with the design's white is exact rather than approximate — and it changed the implementation, because guarding `kNoColor` by emitting no background reproduces the same white.)*

---

### Requirements self-review

Findings from the requirements review that changed the spec. Roles: Senior Engineer, Migration and Backward Compatibility, QA Engineer, WCAG Accessibility Expert, Student, Teacher, Product Manager.

**R3. Requirement 5's fourth citation pointed at the wrong code.** `updateFrequenciesUsagesAndFeatureIDs()` is the recount; it mutates in-memory features only and reaches non-ngram features only, performing no dataset write of its own. Three write sites, not four, at that stage.

**R4 / R23. Whether to write `total frequency` in the update path.** First resolved by omitting the write, so the three columns would stay consistent on a non-standard-label dataset; **superseded the same day** by reverting to writing it at all three sites. The first decision was made on a comparison that only considered the non-standard-label case: omitting the write leaves the total frozen while its neighbours update on every `positive` / `negative` dataset, which is all real usage. So the harm would land in the common case rather than the rare one. Requirement 4's guarantee is instead scoped to "wherever those two are correctly maintained", which STORYQ-85 makes unconditional once fixed.

**R6. Requirement 21 repaired the ngram feature but not its 682 tokens.** The restore repair now covers every unigram entry in `tokenMap` alongside the `Feature`, sharing the same fan-out requirement 26 performs. Per-token `highlight` is deliberately left alone.

**R8. Nothing stated that the restore migrations are idempotent or when they run.** Added as requirement 8.

**R9 / I10. A student's recolor was silently discarded by toggling the feature off and on.** Added as requirement 27, covering `highlight` as well as `color`. Chose the source-of-truth option over accepting the discard, because under requirement 20 the discard is not merely a lost preference: the row would show purple while its words highlighted yellow, an inconsistency in this story's own new behavior. This does not contradict requirement 22's decision to leave per-token `highlight` alone on restore — restore preserves individual choices a student made word by word, while re-extraction destroys the token set so there are none left to preserve.

**R10. Requirement 26 pointed at a function with a destructive side effect.** Requirement 29 now names exactly what is borrowed and states in bold that the `deleteUnigramTokens()` branch is not part of the pattern.

**R11. The requirements had no stated verification method.** Added a Verification table mapping requirements to the document that exercises them, since several are only meaningful against a particular document and will appear to pass in a fresh one.

**R13. The picker's swatches failed WCAG 2.2 target size as drawn.** Resolved by Michael with a better answer than the one proposed: use CODAP's current swatch component from the overhaul design rather than the older swatch drawn on the StoryQ board, which also keeps the plugin consistent with the host application.

**R14. Two state mechanisms that must not be combined.** Requirement 35 picks the name-changes-with-state pattern and says explicitly that `aria-pressed` is not also set.

**R16. The contrast guarantee was contradicted by the swatch requirement.** Requirement 39 now scopes its guarantee to the six palette colors and says plainly that a color retained from an older document may fail AA.

**R19. After this story the first feature a student creates is the same yellow as every extracted word.** Recorded, not fixed, and deliberately left for Jie to judge in the running build; requirement 20 requires the yellow to live in a single exported constant so changing it later is a one-line edit.

**R20. One click changes 682 words with no confirmation and no stated undo.** Added as requirement 28. Chose to state the behavior rather than add a confirmation, because both actions are reversible in one click and a dialog on a color swatch would be worse than the risk.

**R21. `total frequency` arrives unexplained.** No change: Jie chose the name and said she could not think of a better one, so renaming would reopen a resolved decision for a cosmetic gain.

**R25. The token recolor had no stated condition and could discard a deliberate choice.** Requirement 22 now gates the whole step, tokens included, on the ngram `Feature` carrying `kNoColor`, and has the tokens take the `Feature`'s repaired color rather than the literal constant. A pre-change document whose ngram feature was given a real color by hand is deliberately left alone.

**R26. Arrow-key navigation was unspecified for a two-dimensional grid.** "Follow CODAP" does not answer it: CODAP's palette is eight per row over three full rows, ours is four per row over two with a conditional seventh swatch. Requirement 19 now specifies both axes and the ragged-row clamp.

---

### Implementation self-review

Findings from four review passes over the implementation plan. Each was checked against source before being written down; several were settled with throwaway tests that were then deleted.

**I1. The `caseByID` write shape was wrong, and it fails silently.** `case-by-id-handler.ts` passes `nestedValues: true`, so the payload must be `{ values: { values: { color } } }`. A flat payload returns `success: false`, which nothing in the plugin checks, so the store, the pill and the picker would all look correct while requirement 3 quietly failed. What makes the mistake likely is that the batched fan-out in the same section is a different handler taking a **flat** array with no nesting.

**I2. A source reading was refuted by the running application.** The update path addresses an **item** resource with a **case** id, which reading `resource-parser.ts` at the pinned commit says cannot resolve. In build 2985 it does resolve: the two frequency columns visibly changed and the CODAP case ids were unchanged across the pass. The general lesson was promoted into the Technical Notes.

**I3. `domain_store.ts` rather than `one_hot.ts` is the site for the token color.** `oneHot`'s config carries no `Feature` at all and `getNewToken()` takes only a color, so coloring there means either threading a `Feature` into extraction or falling back to the constant — which is exactly what requirement 27 rules out. `updateNgramFeatures()` already holds the ngram `Feature` in scope.

**I4. The mutation order matters, and the prescribed one was the fragile one.** Measured with a reaction over the real store: outside a mobx action, writing the `Feature` first flushes the reaction before the token loop has run, so the text pane repaints with the **stale** token colors and nothing repaints it again. Tokens-then-`Feature` is correct in both worlds. Both store methods are actions already, so either order works today; the order is chosen so that stays true if the loop ever moves into a component handler or after an `await`.

**I5. A `Feature` mutated through a raw object reference notifies nothing.** `features` is a deep observable, so only the proxy read back out of it notifies. This cost a wrong test result while checking I4, and the regression test must assert through `featureStore.features[i]` rather than through the literal it constructed.

**I6. Tab switches do not re-enter `guaranteeFeaturesDataset()`.** `TabPanel` renders the content of every item and hides the unselected ones with a class, so nothing unmounts and the panel effects run once each. The guard is still needed; only the justification was wrong. The real repeat paths are every feature added and every collapse/expand of the StoryQ panel.

**I7. A boolean flag does not deliver "at most once".** Both panels mount on the same commit and each fires the call without awaiting it, so two callers can be inside the function at once and a flag set after three awaited round trips lets the second one past. Hold the in-flight promise instead.

**I8. The guard is per plugin instance, and `fromJSON()` can run more than once.** Clear it at the top of `fromJSON()`. Framed as closing an assumption rather than fixing a known defect.

**I9. The migration would also run on brand-new documents**, on the first feature added, re-hiding attributes created hidden and backfilling cases written seconds earlier. Fixed by setting the guard in the creation branch.

**I13. `guaranteeAttribute()`'s guard is not free.** It issues a `get …attributeList` before deciding, which is the same round-trip-to-guard-a-cheap-step trade the hides decline. Take it for readability if you want, but knowingly. Both it and `getCaseValues()` read `.success` after a `.catch()` that returns `undefined`, so a rejected request throws a `TypeError` rather than logging and continuing; recorded so nobody reads either helper as fail-soft.

**I14. The fan-out re-derives case ids the store already holds**, at 109 ms a click. Kept deliberately: `featureCaseID` starts as `null` on a freshly created token, so the search is the one source correct in every state.

**I15 / I16. The border-swap focus indicator does shift layout**, because nothing sets `box-sizing` in this plugin and the inherited `content-box` grows the button from 30x30 to 32x32 on focus. The same default also breaks the width arithmetic for the restructured row. One line fixes both: `box-sizing: border-box` on the wrapper, both buttons and the pill.

**I18. The prescribed step order is safe in both directions, and the plugin should not have to know that.** CODAP broadcasts the `updateCases` notification synchronously, before it replies to the request that caused it, so the plugin always processes an echo before its own `await` resolves. The reordering was kept anyway: repair-before-backfill has no such precondition, and leaning on CODAP's internal ordering would mean that if it ever changed, all 682 tokens would revert while the `Feature` stayed yellow and nothing would notice.

**I19. The migration puts three new rejection paths in front of work that today cannot fail.** Neither caller is in a position to handle a rejection: one calls `fromJSON()` without `await` and without `.catch`, and the other's whole body sits inside the guarded call. A rethrow buys an unhandled rejection on one path and silently skips the frequency recount, the feature-case creation and the target `featureIDs` write on the other. All three migration steps are cosmetic and the work waiting behind them is not, so a failure has to cost the repairs rather than the document: log and swallow, clearing the guard so a transient failure retries.

**I20. Grafting `color-utils.ts` from the prior-art commit aliases `featureColors[0]` to `ngramColor`.** Under the alias, the one-line edit requirement 21 offers does nothing, because changing `ngramColor` moves `featureColors[0]` with it. The quieter half is that an edit made for the ngram set would silently move a value two other requirements assert. Write the literal and treat the two as independent constants that happen to hold the same value today.

**I21. Two sites emit `feature.color` as an inline style, and only one was guarded.** The row's guard folds into the same expression that makes the pill's fill conditional, since that line is being rewritten anyway.

**I22. The picker's swatches had no accessible name, no role, and no accessible selection state.** Added as requirement 41. The swatches differ from one another by color alone, which bites harder than the eye icons it mirrors: a screen reader user meets a row of unnamed buttons with no group, no name, and no way to tell which one is applied.

**I23. The new `highlight` write was uncoerced where the sibling write coerces.** `JSON.stringify({ highlight: undefined })` is `"{}"`, so the key never reaches CODAP and the case is created with no value, which the notification handler then reads back as hidden. Use `!!`.

**I17 → requirement 40. Restored `count` features lose their search formula**, so they stop counting and stop highlighting. Pulled into the story (Doug's call) because it lands directly on the control this story adds: the feature's two frequency columns and its `total frequency` all go to zero together, satisfying requirement 4 while all three are wrong, and the feature stops highlighting altogether so requirement 12's toggle has nothing to restore and the new control reads as broken.

**I24 → requirement 42. Training rebuilds `featureIDs` by a different test that is also wrong for `count` features.** The same symptom by a second route, which requirement 40's repair does not touch. It harms a session-created count feature as much as a restored one, and it is triggered by training rather than by opening a document. The loss is partial in a way that makes it confusing to reproduce: a text matching **only** the count feature is skipped by the rebuild and keeps its stale ids, so it goes on highlighting, while a text that also matches another feature loses it.

**J1. Three migration steps were placed in the guard wrapper rather than in the guarded body**, which would have undone I7 and I19: anything in the wrapper runs on every entry and sits outside the `catch`.

**J2. Two incompatible shapes were prescribed for `featureColors`.** Keep it six hex strings and put the swatch names in a separate record keyed by hex. Making the array hold objects writes `[object Object]` into `Feature.color`, into the dataset's `color` attribute and from there into an inline `backgroundColor`, and it edits `getFeatureColor()`, which requirement 21 explicitly puts outside this story's surface. Keying by hex also serves the goal better than a parallel array: a palette edit cannot leave a color and its name out of step, because an unnamed color is a missing lookup rather than a silent mispairing by position.

**J4. "Mutate every entry in `tokenMap`" is over-broad.** After training, `tokenMap` also holds one constructed token per chosen feature. Unfiltered it is invisible today only because `getFeatureOrTokenByCaseId()` resolves `Feature` before `Token`, which is a lookup order nothing states or tests — and the corrupted values would be serialised into the saved document. Filter on `token.type === kTokenTypeUnigram`.

**J6. The requirement 27 test could not be written as described, and the naive version passes vacuously.** `updateNgramFeatures()` builds its documents from `targetStore`, which returns `[]` unless the target attribute name is set, so with a blanket mock the call completes, `tokenMap` stays empty, and `every(…)` is trivially true. Needs a resource-aware mock, `targetStore` populated through `fromJSON()` (its dataset info is a computed and assigning it throws), and an assertion that the token count is non-zero **before** any assertion about the tokens.

**J8. On a restored document the ngram row's eye can disagree with the words it stands for.** Requirement 22 deliberately leaves per-token `highlight` alone, and a pre-change document can carry individual choices made word by word. Recorded as a first-render presentation gap rather than a stuck state, since either press of the eye resolves it; deriving the icon from the tokens would be a requirements decision, not an implementation one.

**K1. The picker's `position: fixed` does not resolve against the viewport.** Two ancestors carry an inline `transform: translate(0px, 0px)`, which computes to a matrix rather than `none` and therefore makes the ancestor the containing block for fixed descendants. Measured: in-row `position: fixed` rendered 38 px too low, which is exactly the tab strip's height — and a feature row is also 38 px tall, so the picker lands exactly one row too low at every scroll position, which is what makes it read as a styling mistake rather than a positioning bug. Portalled to `document.body` the error was zero.

**K2. On the gesture requirement 27 is written about, `updateNgramFeatures()` never runs.** The natural reading had it backwards. On a Training tab re-check, `toggleChosenFor()` runs first, CODAP delivers its echo synchronously before answering the request, and the notification handler has rebuilt the whole token set by the time `updateNgramFeatures()` is called, which then returns early. So the handler serves the Training tab round trip and the extraction site serves first extraction from the Features tab. Fixing only the obvious site would leave requirement 27 unmet for the exact gesture it was written about. The wrong claim had spread to four places and was corrected in all of them.

**K3. Two prescribed expressions did not state the same rule.** `??` falls back only for `null` and `undefined`, so `kNoColor` passes straight through it. Verified: with those two expressions in the source, a Training tab round trip wrote `color: "NO_COLOR"` into every rebuilt token, which is exactly the invalid inline background requirement 32 asks never to emit. Resolved by extracting `ngramTokenColor()` so the rule is stated once. It takes the color rather than the `Feature` because `color-utils.ts` cannot import `FeatureOrToken` without a cycle.

**K4. The conditional pill fill was not gated on the new prop, so it changed the Training tab.** `FeatureList` is shared. Ungated, a feature whose highlighting is off renders as a white row on the Training tab too, where requirement 38's second channel (the eye icons) is deliberately absent, so the meaning would be carried by color alone. The fill belongs to the control, not to the feature.

**K5. Nothing closed the picker when focus left it.** This is the route a keyboard-only user reaches first: the grid is a roving tabindex, so one Tab press leaves the popover, and the portal makes it worse rather than better, since the popover is last in DOM order and Tab leaves the plugin's content entirely. Requirement 37 was split at the same time: returning focus on click-elsewhere and focus-out would override a choice the user just made.

**K6. Two commits leave an import that fails the build.** CI sets `CI=true` and `react-scripts` turns ESLint warnings into errors, so an orphaned import is a red build rather than a nit. Verified by running the build with the call replaced.

**L0. Two of the three stylesheets in K1's reproduction were never applied.** `python3 -m http.server` types `.scss` as `application/octet-stream`, and a browser will not apply a stylesheet served with that type, so two of the three `<link>` elements did nothing and the numbers were taken against a layout the plugin does not have. Re-run correctly, the offset is 38 px rather than 33 and a feature row is 38 px rather than 44. The finding was unaffected and its statement got cleaner. Recorded rather than quietly fixed: an experiment can be run correctly and still measure the wrong thing, and the tell here was cheap to check and was not checked.

**L1. A `kNoColor` row renders white, not transparent, and after this story white means "highlighting is off".** The obvious guard, emitting no `backgroundColor` at all, falls back to `.feature-list-item`'s own `background-color: white` — so the guard that looks safest is the one that makes a pre-change ngram row claim its highlighting is off while it is on, for the ~700 ms before the migration repairs it and for the whole session if a swallowed failure means it never does. Mapping `kNoColor` to `ngramColor` instead costs nothing and removes the state.

**L2. The `focusout` route K5 added closes the picker on the first arrow key.** `focusout` fires on the popover every time focus moves **between** swatches, which the roving tabindex does on every arrow press. Confirmed in a browser. Both halves of the condition are load-bearing: the button half matters for the same reason in reverse, since Escape moves focus to the button and would otherwise re-enter the handler after the picker has already closed.

**L3. The portal breaks the outside-click handler's containment test.** The popover is no longer a DOM descendant of the row, so any check written against the row would treat every click on a swatch as an outside click and close the picker before the choice could fire. Test containment with a ref on the popover element. The same goes the other way for React's synthetic events, which still bubble from portal children through the React tree.

---

### Departures found while building

Four places where the code had to depart from the implementation plan, each recorded in the source spec where it happens.

**The picker takes the button element, not its rect, and an `onClose` that says which route fired.** The outside-click and focus-out routes both have to recognise events that landed on the button, and the rect is one `getBoundingClientRect()` away from the element while the element cannot be recovered from the rect. And the five closing routes split into three that return focus and two that must not, which a bare `onClose()` cannot express.

**The `targetCaseFormula` re-derivation needs to survive null details.** `details` is nullable and the cast asserts it away for the compiler without doing anything at run time, so the literal expression throws on a feature whose details are null. `""` is a valid `SearchWhereOption` and maps to the default formula, which is what that section already wants for every non-search feature.

**A test file that mocks `codap-helper` with a factory must also mock `text_feedback_manager`.** `codap-helper` imports `text_feedback_manager`, which imports the stores, which import `codap-helper`: a cycle. `requireActual` inside the factory loads the real module, whose imports re-enter the factory, so the registry ends up holding a **second** set of mock functions — the test configures one and the stores call the other. The symptom is silent and misleading rather than a failure.

**`featureStore`'s methods are bound by `autoBind`**, so spying on them throws `Cannot assign to read only property`. Mock the request layer underneath instead, which is the better test anyway.

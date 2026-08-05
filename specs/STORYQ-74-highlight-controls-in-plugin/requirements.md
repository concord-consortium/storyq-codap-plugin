# Select and Show/Hide Highlight Colors in the Plugin

**Jira**: https://concord-consortium.atlassian.net/browse/STORYQ-74
**Repo**: https://github.com/concord-consortium/storyq-codap-plugin
**Design**: [Zeplin: StoryQ Updates, section 4A](https://app.zeplin.io/project/5e4baae7fb685faac9bf4a0a/screen/6938b582aef73b81d631eef6) (full text dump: `/home/doug/docs/zeplin-specs/storyq-updates-6938b582.md`)
**Status**: **In Development**

## Overview

Move the two per-feature display controls, highlight visibility and highlight color, out of the CODAP Features table and into the StoryQ plugin's Features tab, and hide the corresponding columns from the table. Single-word extraction stops cycling six colors and uses one color (yellow) for every word.

## Project Owner Overview

Today a student who wants to turn a feature's highlighting off, or change the color it highlights with, has to leave the StoryQ plugin, find the Features table CODAP created, and edit a checkbox or a color swatch in a spreadsheet cell. The controls live far from the feature they affect, they are surfaced as raw data columns rather than as actions, and the color picker offers CODAP's full sixteen-color palette even though StoryQ only ever assigns six.

This story puts both controls on the feature itself, inside the plugin, as a show/hide button and a color button on each row of the Features tab. The Features table keeps the underlying data but stops showing those two columns, so the table reads as data about features rather than as a control panel. The color picker is trimmed to StoryQ's own six colors. Separately, extracting all single words at once will assign one color (yellow) to every extracted word instead of cycling six colors across hundreds of rows, which is noise rather than information at that scale.

## Background

### How color and highlight work today

The plugin creates a `Features` data context (`src/stores/domain_store.ts:82-116`) whose `features` collection declares `{name: 'color', type: 'color'}` and `{name: 'highlight', type: 'checkbox'}` as visible attributes, alongside `chosen`, `type`, and `usages`, which are created with `hidden: true`. A `weights` child collection is created with its two attributes visible and then hidden immediately afterwards by `hideWeightsAttributes()` (`domain_store.ts:62-74`), which issues `update .../attribute[weight] {hidden: true}` requests. That function is the working precedent that an attribute can be hidden through the plugin API after creation.

Each feature carries `color` and `highlight` in the plugin's own store (`Feature extends FeatureOrToken` in `src/stores/store_types_and_constants.ts:188-223`), and each extracted unigram carries the same pair on its `Token` (`store_types_and_constants.ts:300-326`). Both are serialized into the plugin's saved state by `FeatureStore.asJSON()` (`src/stores/feature_store.ts:90-98`), so the dataset columns are not the persistence mechanism.

The columns are, however, the only place a student can currently *change* either value. The plugin writes `color` and `highlight` when it creates feature cases and unigram cases (`domain_store.ts:237-250` and `domain_store.ts:352-370`) and never updates them afterwards: `tFeaturesToUpdate` only writes `chosen`, `name`, and the two frequency counts (`domain_store.ts:276-291`). Edits flow the other way, from the table into the store, through `NotificationManager.handleUpdateFeatureCase()` (`src/managers/notification_manager.ts:70-116`), which reads `iCase.values.highlight` and `iCase.values.color` off `updateCases` notifications and copies them onto the matching feature or token.

Downstream, `highlight` gates whether a feature contributes highlighting at all (`src/managers/text_feedback_manager.ts:266` and `:433`) and `color` supplies the highlight background (`src/utilities/utilities.ts:19-23`). The text pane re-renders when either changes, because `TextPane` reacts to `featureStore.highlights`, a computed that deliberately includes both the highlight flags and the colors of every feature and token (`src/stores/feature_store.ts:265-272`, `src/components/text-pane/text-pane.tsx:45-51`).

Colors come from a fixed six-color cycle in `src/utilities/color-utils.ts`: `["#ffe671", "#dbb6fb", "#45f1eb", "#a8e620", "#fb93e8", "#9ce1ff"]`, handed out round-robin by `getFeatureColor()`. Ngram (single words) features are deliberately left at `kNoColor` because each of their tokens gets its own color (`src/components/feature_pane.tsx:51-54`).

The Features tab renders `FeatureList` with `allowChoose={false}`, so each row is currently a colored name pill plus a delete button (`src/components/feature_list_item.tsx`). The Training tab renders the same component with `allowDelete={false}`, which is where the `chosen` checkbox appears.

### Verified against the running application

Checked on 2026-08-05 with StoryQ 2.20.0 (hosted master build) inside CODAP v3.1.0 (build 2984), using `testing/StoryQ Latest.codap3`:

- The Features table shows exactly five columns: `name`, `color`, `highlight`, and the two frequency attributes, which in this document are `frequency in positive` and `frequency in negative` because its labels are `positive` and `negative`. Those two names are derived from the data, not fixed; see requirement 7. `chosen`, `type`, and `usages` do not appear, and neither do the weights collection's `model name` and `weight`. Hiding attributes through the plugin API, both at creation time and after creation, works in the current CODAP.
- Double-clicking a `color` cell opens CODAP v3's `ColorPickerPalette`: sixteen palette swatches in two rows of eight, a seventeenth swatch for the current non-palette color (checked), and a `More` button that expands a full picker with Cancel and Set Color. This is the "current CODAP UI/UX" the design note refers to, and it is what the Zeplin "current" image shows.
- Adding `count: "love"` plus a `single words` feature produced **683 cases** in the Features table: one constructed feature and 682 unigrams, each with its own cycled color and its own highlight checkbox. The plugin's Features tab showed two rows for the same thing. This is the situation that motivates the single-color change.
- The ngram row's pill renders white in the Features tab today, because ngram features are left at `kNoColor`.
- The Features tab's delete button has no accessible name, and the shared `Button` component (`src/components/ui/button.tsx`) is a `div` with `role="button"` and `tabIndex={0}` but no keyboard handler, so it cannot be activated from the keyboard. The existing delete button is a real `<button>`.

### Probed with a throwaway build, 2026-08-06

Everything above was observed through the UI. The items below were measured by sending real plugin API requests, from a temporary probe module in a local build loaded into doc 1 beside the hosted tile, against that document's restored `Features` dataset. The probe code was deleted afterwards; these are its numbers, not estimates. CODAP v3.1.0 (build 2985).

- **Creating an attribute that already exists returns the existing attribute rather than duplicating it.** The second `create` of `total frequency` returned `success: true` with the same id it returned the first time (`ATTR374146288929189`), and the attribute list still held exactly one. No error, no duplicate column. Creating with `hidden: true` on an already-existing dataset works too.

  **Correction, 2026-08-06 (from source, not the probe).** This was written up as a "no-op", and it is not quite one. `attribute-handler.ts`'s `create` looks the name up with `collection.getAttributeByName()` and, when it finds one, calls `updateAttribute(oldAttribute, attributeValue, dataContext)`: it applies whatever values the create carried. Harmless for this story, since the only repeated create is `total frequency` with `hidden: false`, which is already its state. Worth knowing before anyone reuses the pattern with a payload that would overwrite something.
- **A newly created attribute is appended last.** Order became `name | chosen | color | highlight | frequency in positive | frequency in negative | type | usages | total frequency`, and because `chosen`, `type` and `usages` are hidden the table rendered exactly `name`, `frequency in positive`, `frequency in negative`, `total frequency`. That is requirement 7's end state, reached on a restored document.
- **Hiding works on a dataset the session did not create, and repeats safely.** `update attribute[color] {hidden: true}` took 40 ms and `highlight` 143 ms; issuing the same hide again succeeded. Values survive: a unigram case still reported `color: #45f1eb` after both columns were hidden.
- **`attributeList` never reports `hidden`.** Every attribute came back `hidden=undefined`, including `chosen`, `type` and `usages`, which are genuinely hidden in this document.

  **Correction, 2026-08-06 (from source).** The probe's conclusion was drawn too widely. `attributeList` genuinely does drop the flag: its handler maps each attribute through `basicAttributeInfo()`, which returns only `{ name, id, title }` (`data-interactive-type-utils.ts:295-298`). But `get dataContext[…].collection[…].attribute[color]` is a different handler and **does** report it, through `convertAttributeToV2()`, which sets `hidden: (attribute && metadata?.isHidden(attribute.id)) ?? false` (`:135`). So the flag is readable; it just is not readable from the call the probe happened to make. Verified against `codapv3` `origin/main` at `f3d41932d`, the build running as v3.1.0. This does not change what requirement 8 asks for, and the reason is now cost rather than impossibility: see that requirement.
- **The flag persists, in `SharedCaseMetadata` rather than on the attribute.** In doc 1's saved JSON the hidden state lives at `sharedModelMap[…].sharedModel.attributes[<attrId>].hidden`, where `chosen`, `type`, `usages` and both weights attributes are `true` and `color` and `highlight` are absent. So the requirement 2 migration is a one-time repair per pre-change document, not a permanent tax.
- **Case IDs survive save and reload.** Four tokens sampled from doc 1's saved `tokenMap` matched their live case ids exactly (`540146852924506`, `232601006357625`, `894272362376473`, `333635236630703`). The restore backfill and both fan-outs can address cases by the ids already in the restored `tokenMap`.
- **Batching is the difference between 242 ms and a minute.** Twenty per-case `caseByID` updates took 1941 ms, about 97 ms each, which extrapolates to roughly **66 seconds** for 682 cases. The equivalent single batched `.case` request took **242 ms**, and a batched `highlight` fan-out 152 ms. See requirement 29.
- **The echo is one notification, not 682.** The batched update produced exactly one `updateCases` notification carrying all 682 cases, each with full values for every attribute. The idempotence argument in the Technical Notes holds at scale, and there is no echo storm to defend against.
- **The restore backfill is cheap and can find its own attribute names.** Summing the two `frequency in *` attributes discovered by prefix off the case values, then writing `total frequency` to 682 cases, took 178 ms and landed correctly (`129 + 71 = 200`).
- **Case values come back as strings.** `chosen` and `highlight` read as `"true"` / `"false"`, and `usages` as a JSON string. `handleUpdateFeatureCase()` already normalises both booleans (`notification_manager.ts:79-80`), so this is a hazard only for new code that compares them directly.
- **Doc 1 stores `#777`, not `#777777`.** The `contain: "good"` colour is saved as three-digit shorthand. This spec said `#777777` in several places and now says `#777`. The contrast figure is unchanged, since the two are the same colour. See requirement 17.

### Checked in the codebase, same day

- **No dependency provides a popover, a listbox, or focus management.** The plugin's runtime dependencies are mobx, mobx-react, react, react-dom, clsx, fontawesome, iframe-phone and pluralize. There is no React Aria and no positioning library, so the picker's grid, its arrow keys, its focus handling and its flip-above placement are all hand-written. Requirements 17 and 19 were amended for this.
- **A popover will be clipped by the feature list's own scroll container.** `.sq-feature-panel` is `overflow: auto` (`storyq.scss:150`) and the app root is `overflow: hidden` (`storyq.scss:2`), so an absolutely positioned picker inside a row is cut off well before it reaches the frame edge. See requirement 14.
- **Restored tokens carry their case ids.** `asJSON()` serialises `tokenMap` including each token's `featureCaseID` (`feature_store.ts:95`) and `fromJSON()` restores it verbatim (`:105`); `caseIdTokenMap` is rebuilt lazily by `getTokenByCaseId()` (`:228-236`). Combined with the case-id stability probe, requirement 6's backfill needs no re-lookup.

### Prior art

Local branch `STORYQ-74-update-color-selector`, commit `f7d9b5b` ("code to update color selector"), already implements the single-yellow part: it exports `ngramColor = "#ffe671"` from `color-utils.ts`, applies it to tokens in `one_hot.ts` when `config.includeUnigrams` is set, and gives the ngram feature itself that color in `feature_pane.tsx`. It also fixes the missing space in the ngram feature name ("frequency ≥ 4ignoring stopwords"). That commit is not on the working branch; it is code to draw on where it overlaps this story's scope, not separate work.

It is not a complete answer to requirement 20 either. Its token colour is the constant applied unconditionally, which requirement 27 rules out; see the addition to [Implementation trap 3](#3-tokens-are-created-in-two-places-and-the-second-one-is-a-notification-handler).

### Scope of the Zeplin board

The Zeplin screen covers five numbered changes. Items 1 (Features tab prompt text), 2 ("count" first in the method dropdown), and 3 (no "punctuation" in the second dropdown) are already shipped in 2.20.0, confirmed in the running app. Item 4A is this story. Item 4B states the Training tab does not change. Item 5 (text display splitters) belongs to other stories. A note near 4B says the weights table should also be hidden during feature extraction and expanded only during training; StoryQ already does this, and the cosmetic remainder is tracked as [CODAP-1492](https://concord-consortium.atlassian.net/browse/CODAP-1492). See the resolved question below.

## Requirements

### Features table

1. The `color` and `highlight` attributes of the `Features` dataset are hidden from the CODAP Features table. The attributes themselves are retained, along with their values.
2. Hiding applies both to newly created Features datasets and to Features datasets restored from a saved document created before this change.
3. The plugin continues to write `color` and `highlight` values into the dataset, so anything else in the document that reads those attributes keeps working.
4. A new visible attribute, `total frequency`, is added to the features collection. Its value is `numberInPositive + numberInNegative` for constructed features and `numPositive + numNegative` for tokens, so it equals the sum of the two frequency columns beside it **wherever those two are correctly maintained**. Do not derive it from `Token.count`, which is a separate counter that does not agree in every path.

   The qualification is necessary because of a pre-existing defect, not because of anything this story does. The update path hardcodes the two frequency attribute names, so for a dataset whose labels are not `positive` / `negative` those two columns silently stop updating after case creation while `total frequency`, whose name is static, keeps updating. See requirement 5 and [STORYQ-85](https://concord-consortium.atlassian.net/browse/STORYQ-85). Fixing that ticket makes this requirement's guarantee unconditional.
5. `total frequency` is written at **four** sites. Three of them are wherever the two existing frequency values are already written: feature-case creation (`domain_store.ts:237-253`), unigram-case creation (`:352-370`), and the update path (`:276-291`). The fourth has no counterpart for those two and is easy to miss for that reason: the **restore backfill** required by requirement 6 and listed among the migrations in requirement 8. A restored document already has values in its two frequency columns, so only the new attribute needs populating, which is why thinking of this attribute as going "wherever the other two go" leaves it out.

   **Known limitation of the update path.** `:285-286` hardcodes the attribute names `'frequency in positive'` and `'frequency in negative'`, while the attributes are actually named from the student's own class labels (`kPosNegConstants.positive.attrKey` plus the class name). For any dataset whose labels are not literally `positive` and `negative` the update path writes to attributes that do not exist, and CODAP drops those values silently. Verified in the running app on 2026-08-06: with `city` as the label attribute the Features table is created with `frequency in Toronto` and `frequency in Phoenix`, and the update path's writes never land.

   `total frequency` has a static name, so it will write successfully there even when its two neighbours do not. On such a dataset the total moves while the two beside it stay frozen. That is a symptom of the pre-existing defect and is tracked as [STORYQ-85](https://concord-consortium.atlassian.net/browse/STORYQ-85); it is not a reason to withhold the write. Withholding it would instead leave the total frozen while its neighbours updated on every `positive` / `negative` dataset, which is every document in real use today, so the harm would land in the common case rather than the rare one.

   For completeness: the recount itself is `updateFrequenciesUsagesAndFeatureIDs()` (`:163-190`), which zeroes and re-increments the counters on the in-memory `Feature` objects only, and reaches non-ngram features only (`:166`). It performs no dataset write of its own.
6. `total frequency` is created for restored documents too, not just new ones, **and its values are backfilled for the cases that already exist**. Without the backfill an existing document gains an empty column, since restored documents do not re-run case creation. For tokens the backfill sums the `numPositive` and `numNegative` restored from `tokenMap` rather than recounting, and addresses each case by the `featureCaseID` already in the restored `tokenMap`. Its display position differs harmlessly between new and restored documents: new datasets can declare it directly after the two frequency attributes, while a restored dataset appends it, which still leaves it last among *visible* columns because `type` and `usages` are hidden.

   All three parts of this were measured on doc 1 rather than assumed: the appended attribute did land last and the table did render the four intended columns, the saved case ids did match the live ones exactly, and the backfill of 682 cases took 178 ms. See "Probed with a throwaway build".
7. The visible columns of the Features table after this story are the feature name, the two existing frequency attributes, and `total frequency`.

   The two frequency attributes are **named from the student's own class labels**, not from any fixed string: `kPosNegConstants.positive.attrKey` (the literal `'frequency in '`) plus the class name, giving `frequency in positive` and `frequency in negative` for the ice cream training data but `frequency in Toronto` and `frequency in Phoenix` for a document whose labels are cities. Nothing in this story may assume the `positive` / `negative` pair. `total frequency` is the exception: it is a new attribute this story names, so it is a fixed string and is not derived from the labels.
8. The work that has to be done to an already-existing Features dataset (hiding `color` and `highlight`, creating and backfilling `total frequency`, repairing the ngram feature's color per requirement 22) is collected in one clearly named function on the restore path, and every step of it is safe to run on every document open. A document can be opened, saved and reopened any number of times, so each step is a no-op when its condition is already satisfied rather than something that only happens to be harmless when repeated.

   **The two dataset steps are issued unconditionally, because CODAP makes them idempotent and reading the flag back would cost more than it saves.** Probing showed that creating an attribute that already exists returns `success: true` with the existing attribute's id and creates no duplicate, and that repeating a `{hidden: true}` update succeeds. Write these two as plain "do it" steps, not as "check, then repair". The plugin's existing `guaranteeAttribute()` (`codap-helper.ts:156`) does guard the create by name, and reusing it is fine, but the guard is a convenience rather than a correctness requirement.

   The hidden flag **is** readable, contrary to what the probe concluded: `attributeList` drops it but `get …attribute[color]` returns it. See the correction under "Probed with a throwaway build". Reading it would cost a round trip per open and would guard only the cheapest of the three steps, so it is not worth doing; the point of this note is that nobody should re-derive "it cannot be read" as a fact.

   The third step is different: requirement 22's colour repair **is** conditional, on the ngram feature carrying `kNoColor`, and that condition lives in the plugin's own restored state where it can actually be read.

   **The whole function runs at most once per document open, and that has to be arranged deliberately.** "Safe to repeat" is not the same as "cheap to repeat", and the natural home for this function is not called once. `guaranteeFeaturesDataset()` has three callers: `domain_store.ts:55` on the restore path, `:202` inside `updateNonNtigramFeaturesDataset()`, and `:317` inside `updateNgramFeatures()`. Unguarded, the migration would re-read 682 cases and re-write them on each entry, roughly half a second of API traffic and a 682-case `updateCases` echo each time, for work that can only matter once. Guard it, so the steps stay unconditional and the function does not.

   **Corrected 2026-08-06.** This paragraph previously said `:202` "fires on every switch between the Features and Training tabs", because it runs from the `useEffect` in `feature_panel.tsx:13` and `training_panel.tsx:12`. That is not what the component tree does. `TabPanel` renders the content of every `<Item>` and hides the unselected ones with a class (`tab-panel.tsx:57-69`, `tab-panel-tab-content.tsx:13-25`), and `.ui-multiview-item-hidden` is `visibility: hidden` (`light.compact.css:17420-17424`), so nothing unmounts and those effects run once each, at first mount. Confirmed with a throwaway RTL test: `selectedIndex` changed three times through the real `TabPanel`, mount counts stayed at 1 and 1. The gestures that do re-enter the function are every feature added (`feature_pane.tsx:58`) and collapsing or expanding the StoryQ panel, which is a real unmount (`storyq.tsx:114`). The guard is still required; only this justification was wrong. See the implementation spec's section 3 for why the guard holds an in-flight promise rather than a boolean.

   **Corrected again 2026-08-06 (K2).** This list carried a third gesture, re-checking the ngram box in the Training tab. It does not re-enter the function. `updateNgramFeatures()` reaches `guaranteeFeaturesDataset()` only past `if (featureStore.tokenMapAlreadyHasUnigrams) return` (`domain_store.ts:313`), and on that gesture `toggleChosenFor()` runs first, its echo is delivered synchronously before the `await` resolves, and `handleUpdateFeatureCase()` has refilled `tokenMap` from the dataset by then. Measured with a throwaway jest test over the real stores: zero requests issued by `updateNgramFeatures()` on that path.

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
14. Activating the color button opens a color picker anchored below it. Activating it again, clicking elsewhere, pressing Escape, or moving focus out of the picker closes it. When there is not enough room below the button inside the plugin frame, the picker opens above it instead; it is never clipped by the frame. The plugin window is user-resizable and can be short, which is the subject of the sibling stories STORYQ-77 and STORYQ-79.

    **Focus leaving the picker is a closing route, and it is the one a keyboard-only user meets first.** Requirement 19 makes the swatch grid a roving tabindex, which is exactly one tab stop, so a single Tab press takes focus out of the picker. Without this route the picker stays open, unreachable, over a button still reporting `aria-expanded="true"`. This route and the click-elsewhere route must not move focus; see requirement 37.

    **The obvious implementation is clipped long before it reaches the frame.** The feature list scrolls inside `.sq-feature-panel`, which is `overflow: auto` (`storyq.scss:150`), and the app root is `overflow: hidden` (`storyq.scss:2`), so a picker positioned `absolute` within a row is cut off at the list's edge. Use `position: fixed` with coordinates taken from the button's bounding rect, or portal the picker to the app root; either way the flip decision compares the button's rect against the iframe viewport. No dependency does this for us: there is no positioning library in the plugin, so the measure-and-flip is a few lines of our own code, re-run on scroll and resize while the picker is open.

### Color picker

15. The picker offers exactly StoryQ's six feature colors: `#ffe671`, `#dbb6fb`, `#45f1eb`, `#a8e620`, `#fb93e8`, `#9ce1ff`. There is **no `more` button**; these six are the entire palette.
16. The picker uses **CODAP's current swatch component**, from the CODAP overhaul design ([graph tile](https://app.zeplin.io/project/5e4baae7fb685faac9bf4a0a/screen/68bb06fadbce4439b6cbcb60)), not the older swatch drawn on the StoryQ board. Michael's call, 2026-08-06: the StoryQ specs predate the CODAP overhaul, and reusing the newer component keeps the plugin consistent with the host application.

   Per swatch, as drawn in the overhaul:
   - **24x24 px overall**, which is the interactive target, containing a **22x22 px painted square** inset 1 px, radius 2 px.
   - Unselected: 1 px `#757575` inside border on the painted square.
   - Selected: 2 px `#006c8e` inside border, plus a 13x9 px `#000000` check mark at offset 5,6 within the painted square.
   - The transparency checkerboard behind the colour is **not needed**; all six StoryQ colours are opaque.

   Grid and container, keeping the four-per-row arrangement Michael drew for StoryQ, at CODAP's 27 px pitch (24 px cell plus a 3 px gap) and a 12 px inset on all four sides:
   - Swatch grid: 105x51 px (4 x 24 + 3 x 3 wide, 2 x 24 + 3 tall).
   - **Popover: 129x75 px**, white, 1 px `#d0d0d0` border. This replaces the 108x64 previously drawn on the StoryQ board.

   Four per row is kept deliberately in preference to three. Three per row would give a 108 px width matching the old drawing, but six colours would fill two rows exactly and the conditional seventh swatch of requirement 17 would force a third row, changing the popover's height depending on the document. At four per row both six and seven swatches occupy two rows and the height is constant.

   **The container size is derived, not drawn.** Michael specified the swatch component; the 129x75 follows from it plus the four-per-row layout. Confirm with him before it ships, as with the previous geometry.
17. When the feature's current color is not one of the six, the picker appends a **seventh** swatch showing that color, checked. At four per row it lands at row 2, position 3, so the popover keeps its 129x75 size whether six or seven swatches are shown. This covers documents saved before the `color` column was hidden, where any hex could be typed into the cell. Michael's note on the revised board calls this the "potential 7th".

    **"Not one of the six" is a normalised comparison, not string equality.** Doc 1 stores `contain: "good"` as `#777`, three-digit shorthand, and nothing stops a student typing `#FFE671` for a colour that is already in the palette. Expand shorthand to six digits and lower-case both sides before comparing, or a palette colour will show up as a spurious seventh swatch that sits next to its own duplicate.

    CODAP's `ColorPickerPalette` remains a useful behavioural reference, but only that: its instruction to hold the extra swatch's id in a ref exists because React Aria forbids a `ListBoxItem` id from changing between renders (`color-picker-palette.tsx:49-59`), and the plugin has no React Aria. Our swatches are plain elements, so the constraint does not apply and no ref is needed for it.
18. Choosing a color applies it to the feature immediately: the name pill, the color button, and the text pane highlighting all update without a separate confirm step.
19. Apart from the palette contents, the picker follows CODAP's current color picker behavior: single-select swatch grid with arrow-key navigation and Escape cancelling.

   **Arrow keys move in two dimensions, which CODAP's own behavior does not settle for this grid.** CODAP's palette is eight per row over three full rows; ours is four per row over two, and per requirement 17 the second row holds two or three swatches depending on the document. So:
   - Left and Right move through the swatches in order and wrap at the ends, so Right from the last swatch of row 1 reaches the first of row 2, and Left from the first swatch of row 2 returns to the last of row 1.
   - Up and Down move between rows keeping the column position, and clamp to the last existing swatch when that position does not exist in the ragged second row.

   Without this stated, the behavior is decided by whichever list component is reached for, and the common default treats the grid as a flat list where Up and Down do nothing. That is wrong for a control a sighted keyboard user reads as two rows.

   **There is no list component to reach for.** The plugin has no React Aria and no other widget library, so this is a hand-written roving tabindex: one swatch in the tab order at a time, arrow keys moving the focused index and calling `focus()` on the new target. That is a small amount of code, and stating the movement rules above is what makes it a small amount of *correct* code.

### Single-word extraction

20. Extracting single words assigns one color, yellow `#ffe671`, to the ngram feature and to every token it produces, instead of cycling the six colors per word.

   **This color is defined once and referenced everywhere.** The prior-art commit `f7d9b5b` already exports `ngramColor = "#ffe671"` from `color-utils.ts` and uses it in `one_hot.ts` and `feature_pane.tsx`. Every site this story adds goes through that constant too: the ngram feature's own color (requirement 21), the restore migration (requirement 22), the re-extraction color (requirement 27), and any test assertions. The literal `#ffe671` appears nowhere else, and not in SCSS. This matters because the choice of yellow is not settled: see the note on the collision with `featureColors[0]` in requirement 21. Keeping it a single constant makes changing it a one-line edit rather than a hunt.
21. The ngram feature row in the Features tab shows that color rather than rendering colorless as it does today.

   **Known consequence, deliberately not addressed here.** `featureColors[0]` is also `#ffe671` (`color-utils.ts:4`), and `getFeatureColor()` hands colors out from index 0, so the first ordinary feature a student creates is the same yellow as every extracted word. The index is module-level and unpersisted, so the cycle restarts at 0 on every document open and the collision recurs. Verified on 2026-08-06: reopening doc 1 and adding one feature produced `count: "cream"` at `#ffe671`, matching the existing `count: "love"`.

   This sits awkwardly with requirement 26, which keeps the color button on the single-words row precisely so a student can tell extracted words apart from ordinary features. Both fixes were out of reach for this story: changing where the cycle starts means editing `getFeatureColor()`, which is existing code outside this story's surface, and choosing a different yellow would change a value Jie chose. Neither is expensive to do later, since no documents are in circulation yet and requirement 20 keeps the color a single constant. Leave it, let Jie meet it in the running build, and decide then.
22. **Conditional on the ngram feature carrying `kNoColor`**, restoring a document sets that feature's color to `#ffe671` and then sets every **unigram** entry in the restored `tokenMap` to **the feature's repaired color**. If the ngram feature already has a real color, the whole step is skipped, tokens included.

    "Unigram entry" rather than "entry": `tokenMap` also holds one token of type `kTokenTypeConstructed` per chosen constructed feature on any trained document, added by `oneHot()` from the `columnFeatures` that `model_manager.ts:332-334` builds out of every chosen feature. Those tokens belong to other features and must not be recolored here. The same qualification applies to requirements 25 and 26; see the implementation spec's [J4](implementation.md#resolved-j4-mutate-every-entry-in-tokenmap-is-over-broad-tokenmap-also-holds-one-token-per-constructed-feature-after-training).

   The condition is the point, not a detail. Tokens are not re-extracted on restore: `FeatureStore.asJSON()` serializes `tokenMap` and `fromJSON()` restores it verbatim, so a pre-change document brings back several hundred tokens still carrying their cycled colors, and repairing only the `Feature` would leave a yellow single-words row whose words highlight in six different colors. But an unconditional repaint would be worse than the problem: once requirement 26 ships, a student can recolor the whole set, requirement 27 makes that survive re-extraction, and an ungated migration would silently repaint it yellow on the next save and reopen, with no undo to reach for (requirement 28). `kNoColor` on the `Feature` is the actual signature of a pre-change document and cannot survive one pass, so gating on it makes the step self-disabling, as requirement 8 asks.

   Sourcing the token color from the `Feature` rather than from the constant states the same rule as requirement 27, that tokens follow the `Feature`, rather than two rules that happen to agree today. This is the same fan-out requirement 26 performs, so the code is shared. Per-token `highlight` values are left alone; only color is repaired.

   A pre-change document whose ngram feature was manually given a real color is therefore not migrated, which is correct: a deliberate choice is not overwritten, and requirement 31 holds either way because the row has a valid color.
23. The ngram feature name gains its missing space: `single words with frequency ≥ 4 ignoring stopwords`. This affects newly created features only, and lands as its own commit.
24. The single-words row carries **both** controls, like every other row. Neither is hidden or disabled there.
25. The visibility toggle on that row hides and restores highlighting for **all** extracted words at once, by setting `highlight` on every unigram entry in `featureStore.tokenMap` as well as on the ngram `Feature`. Both fan-outs are scoped to unigram tokens for the reason given under requirement 22.
26. The color button on that row recolors **all** extracted words at once, by setting `color` on every unigram token as well as on the ngram `Feature`. This supports the workflow Jie described: running single-word extraction alongside ordinary features and recoloring the whole set to tell them apart.
27. **Both** a recolor and a visibility change survive re-extraction. Unchecking the single-words feature in the Training tab deletes every token (`toggleChosenFor()` calls `deleteUnigramTokens()`, `feature_store.ts:385`) and re-checking it re-creates them, through `handleUpdateFeatureCase()` rather than through `updateNgramFeatures()`; see [Implementation trap 3](#3-tokens-are-created-in-two-places-and-the-second-one-is-a-notification-handler), which had this the other way round until 2026-08-06. The re-created tokens take the ngram `Feature`'s **current** color and **current** `highlight` rather than `#ffe671` and `true` unconditionally, so the row and the words it stands for never disagree. Without this, a student who recolors or hides the set loses that choice by toggling a checkbox on another tab.

    **`highlight` has the same hole as `color`, and it is the more visible of the two.** The three sites hardcode it: `getNewToken()` sets `highlight: true` (`store_types_and_constants.ts:317`), `updateNgramFeatures()` writes `highlight: true` into every unigram case it creates (`domain_store.ts:358`), and `handleUpdateFeatureCase()` hardcodes it on a re-created token (`notification_manager.ts:103`). So a student who uses requirement 25's toggle to hide 682 words, then unchecks and re-checks the feature on another tab, gets every word highlighted again under an eye icon that still reads hidden. That is the same disagreement this requirement exists to prevent, reached by the same gesture, and it fills the text pane rather than changing its hue.

    The fix is inert until requirement 25's control exists: `addFeatureUnderConstruction()` sets `highlight = true` (`feature_store.ts:306`), the ngram `Feature` has no case so no echo can change it, and nothing else sets it false today, so reading the `Feature` gives exactly what the constant gives in every document that exists now.

    **There is a second place tokens are created, and it also hands out a cycled colour.** `handleUpdateFeatureCase()` re-creates a token from an echoed case whenever the case says `chosen` and the store has no token of that name, and it colours it `getFeatureColor()` (`notification_manager.ts:96-102`). A fix applied only in `updateNgramFeatures()` leaves this path handing out the six-colour cycle. Both sites take the ngram `Feature`'s current colour and highlight, which is the same rule requirements 22 and 26 state: tokens follow the `Feature`.

    **Why this does not contradict requirement 22**, which leaves per-token `highlight` alone on restore. Restore brings back individual choices a student really made, one word at a time, through the Features table before this story hid the column, and those are worth keeping. Re-extraction destroys the token set outright, so there are no individual choices left to preserve and the only sensible source is the `Feature`. The two rules differ because the situations do.
28. Neither fan-out relies on CODAP's Undo. The plugin's own store is mutated directly, so a document-level undo would not restore it; the student reverses a color change by choosing the previous color again, and a visibility change by toggling it back. Nothing warns before a fan-out, since both are trivially reversible by the same control that caused them.
29. Both fan-outs write back to the Features dataset in a single batched request across the unigram cases, rather than one request per case. With the ice cream data that is roughly 680 cases per click. Borrow the shape of `syncUnigramsInFeaturesDataset()` (`feature_store.ts:386-403`), namely the `caseFormulaSearch[type='unigram']` lookup followed by one batched `update ... .case` request. Do **not** borrow its `if (!iChosen) this.deleteUnigramTokens()` branch: that function is a `chosen` toggle and deleting every token when highlighting is switched off would be a severe bug.

    **The cost difference was measured on doc 1, and it is not a matter of taste.** Twenty per-case `caseByID` updates took 1941 ms, about 97 ms each, which puts the per-case version of a single colour click at roughly **66 seconds** for 682 tokens. The batched request doing the same work took **242 ms**, the batched `highlight` fan-out 152 ms, and the `caseFormulaSearch` lookup that precedes them 109 ms. Batching is what makes this control usable at all.

    The echo costs nothing to speak of either: the batched update came back as exactly **one** `updateCases` notification carrying all 682 cases with full values, not one notification per case, so `handleUpdateFeatureCase()` does a single pass over 682 cases.
30. Both fan-outs write the parent `Feature`'s value in the same tick as the token values, which is what makes the text pane refresh. See [Implementation traps](#1-mutating-a-token-does-not-refresh-the-text-pane).

### Robustness

31. `kNoColor` never reaches a rendered feature row. It remains valid only for the feature under construction.
32. The highlight style guard in `utilities.ts` tests against `kNoColor` explicitly rather than relying on string truthiness, so an invalid inline `backgroundColor` can never be emitted.
40. **A restored feature's `targetCaseFormula` is re-derived on restore**, so a `count` feature that comes back from a saved document counts and highlights the same as one created in the session.

    (Numbered 40 rather than inserted at 33 so the other 39 keep their numbers; it belongs with the two robustness items above.)

    Without this, restoring silently disables every `count` feature in the document. `targetCaseFormula` is a **function** on `Feature` (`store_types_and_constants.ts:219`), assigned at creation from `getTargetCaseFormula(where)` (`target_store.ts:378`), and `Storyq.getPluginStore()` serialises with `JSON.parse(JSON.stringify(...))` expressly to strip functions, because leaving them in breaks the transfer to CODAP (`storyq.tsx:71-77`). `fromJSON()` never puts it back, so `updateFrequenciesUsagesAndFeatureIDs()` falls back to `defaultTargetCaseFormula` (`domain_store.ts:181`). Only `count` features are harmed by that fallback: theirs is the one formula that is not the default, `>0` against `=true` (`store_types_and_constants.ts:163-171`), and a `count` attribute holds numbers, so the search matches nothing.

    The consequence reaches this story twice over, which is why it is in scope rather than filed alone. The feature's two frequency columns and its `total frequency` all go to zero together, satisfying requirement 4 while all three are wrong. And because the same loop rebuilds each target case's `featureIDs` (`domain_store.ts:190-196`, written at `:294-307`), which is what `text_feedback_manager.ts:260-271` reads to decide what a text highlights, the feature stops highlighting altogether: requirement 12's visibility toggle then has nothing to restore, and the new control reads as broken.

    Verified on doc 1, 2026-08-06, with a control in the same session: restored `count: "love"` showed `0 / 0` and highlighted nothing in a text containing "love" three times, with its `highlight` flag turned on; session-created `count: "friendly"` showed `38 / 11` and highlighted correctly; restored `contain: "good"` was unaffected, its formula being the default already.

    The repair re-derives rather than serialises: `where` does survive the round trip, so `fromJSON()` can rebuild the function and `getPluginStore()`'s deliberate function-stripping stays exactly as it is. This is a pre-existing defect that this story fixes because its own controls depend on it, not one it introduces.
42. **A `count` feature keeps its place in the feature IDs rebuilt after training.** The post-training rebuild decides whether a text has a feature by reading the feature's own attribute off the target case and testing it for truth. That is correct for the boolean where-options and wrong for `count`, whose attribute holds a number, so a count feature is dropped from every target case the rebuild touches. Treat a constructed feature as present when its value is boolean true **or** a number greater than zero, which is the rule `getTargetCaseFormula()` already states as `attr=true` for the default and `attr>0` for count.

    (Numbered 42 for the same reason as 40 and 41, so the earlier numbers are stable. It belongs beside 40.)

    **This is requirement 40's defect reached by a second route, and 40's repair does not touch it.** Requirement 40 fixes the restore path, where `targetCaseFormula` is lost and the feature searches with the wrong formula. This one is `recreateUsagesAndFeatureIDs()` (`domain_store.ts:536-617`), which runs at the end of a training run (`model_manager.ts:448`), ignores `targetCaseFormula` entirely, and reaches the same end state: the feature is missing from the target case's `featureIDs`, and `text_feedback_manager.ts:260-271` reads exactly that to decide what a text highlights.

    Two differences matter. It harms a **session-created** count feature as much as a restored one, so requirement 40's guarantee that the two behave identically can hold while both are broken. And it is triggered by training rather than by opening a document, so it is invisible on doc 1 and reachable on doc 3.

    Confirmed by test on 2026-08-06 against the real function, not inferred: a target case matching both a `count` and a `contain` feature was rewritten with the contain feature's case id and without the count feature's; a target case matching only the count feature was skipped entirely and kept its stale ids; and the same case with the attribute set to the string `"true"` kept the feature, which isolates the comparison as the cause.

    In scope for the same reason requirement 40 is, and no more: requirement 12 says toggling visibility on restores a feature's highlighting, and on a trained document with a count feature it does not, because the highlighting was never wired up. That is this story's headline control reading as broken for a defect it did not cause. The loss is also partial in a way that makes it confusing to reproduce: a text matching **only** the count feature is skipped by the rebuild rather than rewritten, so it keeps its stale ids and goes on highlighting, while a text that also matches another feature loses it.

### Training tab

33. The Training tab is unchanged. The visibility and color buttons do not appear there; that tab keeps only the existing `chosen` checkbox per feature, and a feature's row there keeps showing that feature's color whatever its highlight state.

    **The last clause is about requirement 11, not about the buttons.** `FeatureList` is shared between the two tabs, so requirement 11's white-when-hidden pill would otherwise apply on the Training tab too, where there is no eye icon to explain it and requirement 38's second channel is therefore absent. White pills belong to the control, so they appear only where the control does.

### Accessibility

34. Both new controls are real `<button>` elements, reachable and operable by keyboard (Enter and Space), with accessible names that identify both the action and the feature (for example, "Hide highlighting for count: \"love\"").
35. The visibility toggle carries its state in its accessible name, which changes with the state ("Hide highlighting for X" when highlighting is on, "Show highlighting for X" when it is off). It does **not** also set `aria-pressed`: combining a name that changes with a pressed state announces contradictory information, and the button genuinely is a different action in each state, which the eye and eye-with-slash icons already reflect. The color button exposes the picker's open state with `aria-expanded`.
36. The keyboard focus indicators specified in the design (2 px `#0957d0`) are implemented for both buttons and for the picker's swatches, using `:focus-visible` rather than `:focus` so the ring appears for keyboard use and does not persist after a mouse click. The design lists keyboard focus as a state separate from hover and pressed, which is what `:focus-visible` expresses.

   On the two row controls, implement it as a **border swap**, the way the design draws it: the 1 px `#177991` border becomes 2 px `#0957d0` without changing the 28x28 box.

   On the swatches, use an **outset ring** rather than a border swap, because the swatch's own borders already carry selection state (1 px `#757575` unselected, 2 px `#006c8e` selected, per requirement 16) and a swatch can be selected and focused at once. A 2 px `#0957d0` ring drawn outside the 22x22 painted square sits in the 1 px margin of the 24x24 cell and the 3 px gap beyond it, so selection stays readable underneath and neighbours are never touched. There is no collision risk in any case: only one swatch holds focus at a time.
37. Focus moves into the picker when it opens, landing on the currently selected swatch, and returns to the color button when the picker closes by choosing a color, by pressing Escape, or by activating the button again. Without the return, keyboard focus is stranded and the control cannot be used without a mouse.

    **On the other two closing routes it must not return.** Clicking elsewhere and moving focus out of the picker (requirement 14) are both the user saying where focus goes next, and pulling it back to the color button would override that. This requirement previously said the return happens on all four routes, which is the more common bug rather than the safer default.
38. Color is not the only channel carrying meaning: the eye and eye-with-slash icons distinguish highlight state independently of the pill's fill.
39. Every one of the six palette colors is used with dark text (`#222222`) only, and all six clear WCAG AA against it with room to spare. That guarantee covers the palette, and the palette is closed: with `more` dropped and the `color` column hidden, no new out-of-palette color can be introduced.

   It does **not** cover a color retained from a document saved before this story. Requirement 17 keeps such a color as a selectable seventh swatch, so it stays reachable and can be re-selected. Doc 1's `contain: "good"` is `#777` (saved as shorthand, the same colour as `#777777`), which is 3.55:1 against `#222222` and fails the 4.5:1 minimum. This story neither creates that condition nor fixes it: the color was typed into the Features table before the column was hidden, and hiding the column is what removes the route by which it got there. No text-color adaptation is in scope, because every color this story can newly produce is one of the six.
41. **Each swatch in the picker has an accessible name, and the picker's selection is exposed to assistive technology rather than drawn only.** The swatch grid is a single control, not six or seven loose buttons. It carries a role that groups it (`listbox` with `option` children, or `radiogroup` with `radio` children), a name identifying which feature is being recolored, and a per-swatch selected state (`aria-selected` or `aria-checked`) matching the selection that requirement 16 draws as a 2 px `#006c8e` border plus a check mark. Each swatch is named; requirement 17's conditional seventh has no palette name to give, so it takes a generic one such as "Current color". The color button's own accessible name identifies the feature, as requirement 34 requires of both new controls.

    (Numbered 41 rather than inserted among the accessibility items so the other 40 keep their numbers; it belongs with 34 to 38.)

    Without this the swatches differ from one another by **color alone**, which is the failure requirement 38 guards against for the eye icons and which bites harder here: a screen reader user meets a row of unnamed buttons with no group, no name, and no way to tell which one is currently applied. Requirement 19 settles how focus moves through the grid and requirement 37 settles where it enters and returns; neither says what a swatch announces once it arrives. This is all new markup in a new file, so it sits inside the scope constraint.

## Verification

Several requirements are only meaningful against a particular document, and will appear to pass in a fresh one. The three shared CODAP documents, their contents, and the trap that switching between `#shared=` documents needs a hard load via `about:blank` are recorded in the branch oob file `test-setup.md` rather than duplicated here.

| Requirements | Needs | Why |
|---|---|---|
| 2, 6, 8, 22 | doc 1, a genuine pre-change document | The restore migrations do nothing in a fresh document. See [Implementation traps](#2-restored-documents-never-re-run-the-dataset-creation-code). For requirement 8's once-per-open guard, add a feature three times with the network panel open, and separately collapse and re-expand the StoryQ panel: the migration's requests must appear on the first pass only. **Neither tab switching nor re-checking the ngram box tests this**, though earlier drafts specified both: the panels never unmount, and the ngram re-check returns at `domain_store.ts:313` before it reaches the migration at all, so both observations are true with the guard, without it, and with it implemented backwards. See the two corrections under requirement 8. |
| 17 | doc 1 | Its `contain: "good"` carries `#777`, the only out-of-palette color available to test against, and in shorthand form, which is also the normalisation case. |
| 25, 26, 27, 29, 30 | doc 1 or a fresh document with single words added | The fan-outs only mean anything at ~680 tokens. |
| 33 | doc 3, which has a trained model | Without a model the Training tab is empty and the requirement is untestable. This is also where the row restructure gets checked: the Features tab's controls sit outside a narrower name pill, and the shared `FeatureList` must not leave their space reserved here. |
| 1, 7 | doc 2, the clean slate | The fresh-creation path for the Features dataset. |
| 40 | doc 1, **untrained** | Its `count: "love"` is a restored `count` feature, which is the only kind the defect touches. Check both halves: the two frequency columns and `total frequency` hold real numbers rather than zeros, and turning that feature's highlighting on makes "love" highlight in a text containing it. A session-created `count` feature is the control and must behave identically. Doc 1 being untrained is load-bearing here, not incidental: training runs a second `featureIDs` rebuild that this requirement does not repair, so a trained document cannot isolate what requirement 40 fixes. Record which document was used. |
| 42 | doc 3, the trained document | Add a `count` feature and train, then check it still highlights a text containing its word. Doc 1 is untrained and cannot exercise this path at all, which is why requirement 40's row pins itself to the untrained case. Check the partial-loss shape too: a text matching only the count feature must highlight, and so must one matching the count feature alongside another. |

## Implementation traps

Three findings from the investigation that are easy to miss and expensive to rediscover. All were verified, not inferred.

### 1. Mutating a token does not refresh the text pane

`tokenMap` and `caseIdTokenMap` are deliberately excluded from `makeAutoObservable` (`feature_store.ts:53-55`, with a comment saying that making `tokenMap` observable "causes serious problems that don't seem like they'd be easy to fix"). The `featureStore.highlights` computed reads them anyway (`feature_store.ts:265-272`), but mobx cannot track what is not observable, so the `TextPane` reaction on that computed (`text-pane.tsx:45-51`) never fires for token changes.

Verified with a throwaway mobx test:

| Mutation | Reaction fires |
|---|---|
| `Feature.highlight` or `Feature.color` | yes, once per change |
| `Token.highlight` or `Token.color` | **no, zero times** |
| `addToken()` / `deleteToken()` | **no, zero times** |
| `Token` change followed by a `Feature` change in the same tick | yes, and the recomputed value includes the token change |

**What this means for this story**: any control that changes token state, which is the whole of the single-words row, must also write the parent `Feature`'s `highlight` or `color` in the same tick, or the highlighting will silently fail to update until something unrelated nudges the store. Writing the `Feature` is both the semantic state and the reactivity trigger. Do not "fix" this by making `tokenMap` observable without reading that comment first.

### 2. Restored documents never re-run the dataset creation code

`domainStore.fromJSON()` calls `featureStore.fromJSON()`, which restores `datasetID` from saved plugin state, and then calls `guaranteeFeaturesDataset()` (`domain_store.ts:50-56`). That method returns early whenever `featureDatasetID !== -1` (`domain_store.ts:77`), which is precisely the restored-document case. The attribute-creation block, and anything added to it, never executes for an existing document.

**What this means for this story**: both migrations have to run on the restore path, not in the creation branch.

- Hiding `color` and `highlight` on a Features dataset that already exists (requirement 2).
- Repairing the ngram feature's `kNoColor` to `#ffe671`, and the restored tokens' cycled colors along with it (requirement 22).

Adding `hidden: true` to the `attrs` array alone will look correct in a fresh document and do nothing in every document a teacher or student already has.

### 3. Tokens are created in two places, and the second one is a notification handler

The obvious creation path is `updateNgramFeatures()`, reached from the Features tab when the feature is first added. The second is `handleUpdateFeatureCase()`: when an echoed case says `chosen` and no token of that name is in the store, it builds one and colours it `getFeatureColor()`, the six-colour cycle (`notification_manager.ts:96-102`).

**What this means for this story**: requirement 27's rule, that re-created tokens take the ngram `Feature`'s current colour **and its current `highlight`**, has to be applied at both sites. Both hardcode the same two values: `color: getFeatureColor()` at `:102` and `highlight: true` at `:103`.

**And the second site is the one the student's own gesture reaches, not the first.** This trap was written the other way round, describing `updateNgramFeatures()` as the path taken when the feature is re-checked in the Training tab and the notification handler as a leak that manual testing would miss. On that gesture `updateNgramFeatures()` does nothing: `feature_list_item.tsx:43-46` awaits `toggleChosenFor()` first, CODAP delivers the resulting `updateCases` echo synchronously before answering the request, `handleUpdateFeatureCase()` rebuilds the whole token set from the dataset in the meantime, and `updateNgramFeatures()` then returns at `domain_store.ts:313`. Confirmed by throwaway jest test on 2026-08-06 over the real stores: the handler rebuilt every token in the six-colour cycle at `highlight: true` under a `Feature` set to `#dbb6fb` and `highlight: false`, and `updateNgramFeatures()` issued zero requests. So `:353` serves first extraction from the Features tab and the handler serves the Training tab round trip. Fixing only `updateNgramFeatures()` would leave requirement 27 unmet for the exact gesture it was written about.

**And the obvious fix at the first site is not the prior-art commit's.** `f7d9b5b` sets `initialValues.color = ngramColor` in `one_hot.ts` whenever `config.includeUnigrams` is set: the constant, unconditionally. That satisfies requirement 20 and fails requirement 27, because a recoloured set comes back yellow on the next re-extraction. Verified with a throwaway test on 2026-08-06: `oneHot` returns every token at `kNoColor` today and its config carries no `Feature`, so there is no channel from the ngram `Feature` into extraction unless one is added. The colour that survives into the case is settled a moment later at `domain_store.ts:353`, `iFeature.color = iFeature.color !== kNoColor ? iFeature.color : getFeatureColor()`, which is inside `updateNgramFeatures()` and does have the ngram `Feature` in hand. That is the natural place for the rule.

## Technical Notes

- **The pinned `codapv3` commit is a good guide and not an authority.** Several findings in this spec were answered by reading `codapv3` `origin/main` at `f3d41932d`, described here as "the build running as v3.1.0". On 2026-08-06 one such reading was contradicted by the running application. Reading `resource-parser.ts:269-272` and `codap-utils.ts:32-36` at that commit says `itemByID[n]` resolves `"ITEM" + n` while case ids carry a `CASE` prefix, and that ids are 15-digit randoms (`v3Id()`), which together say `domain_store.ts:281`'s `itemByID[<case id>]` cannot resolve and the update path must be inert. In build 2985 it resolves: the two frequency columns visibly changed, and the CODAP case ids were unchanged across the pass, so it was an update and not a delete-and-recreate. Either the shipped build differs from that commit or the two id spaces coincide for this collection; it was not worth chasing which. **Treat a source reading at that commit as a hypothesis to check, not as a verified fact**, especially for anything about ids or resource resolution. **And note that checking it rarely means clicking.** `codapv3` is checked out locally and `f3d41932d` is on `origin/main`, so `git worktree add <dir> f3d41932d` plus `npm ci --ignore-scripts` in `v3` gives that exact build in about fifteen seconds, and its handlers run under jest with no app around them. That is how the notification-ordering question behind [I18](implementation.md#resolved-i18-the-prescribed-step-order-is-safe-in-both-directions-and-the-plugin-should-not-have-to-know-that) was settled after being written off as not worth chasing. Reach for the worktree before the browser: the browser is for things only the running app can answer, such as I2's `itemByID` resolution. The two conclusions in this spec that still rest on it, that the hidden flag is readable through `get …attribute[…]` and that hiding does not disturb an existing graph, are both about display and handler code rather than id spaces, and neither changes what gets built.
- **A function on a serialized model cannot survive a save, and nothing here would catch the next one.** Requirement 40 exists because `Feature.targetCaseFormula` is typed as a function (`store_types_and_constants.ts:219`) and `Storyq.getPluginStore()` serialises with `JSON.parse(JSON.stringify(...))` expressly to strip functions, since leaving them in breaks the transfer to CODAP (`storyq.tsx:71-77`). The field is simply gone on restore and nothing rebuilds it.

  It is worth knowing that this is currently the **only** instance. Grepping the serialized shapes and both function type aliases in that file turns up no other function-valued field on anything reachable from `domainStore.asJSON()`. The same file even shows the pattern done correctly: `getContainFormula()` returns a **string**, which lands on `Feature.formula` and round-trips without trouble. Store the result, not the producer.

  So the risk is not latent instances, it is that nothing would stop a second one. The stripping is silent, the field is optional so TypeScript never complains, and there is no test asserting what the serialized shape contains. Requirement 40's test is the first of its kind; a reviewer adding a field to any store type should ask whether it survives `JSON.stringify`.
- **`total frequency` and the hardcoded frequency attribute names**: `domain_store.ts:285-286` writes to the literal names `'frequency in positive'` and `'frequency in negative'`, but those attributes are named from the student's class labels at creation time (`:235-236`), so the update path is a silent no-op for any other labels. `notification_manager.ts:100-105` reads the same two literals. This is a pre-existing bug, not one this story introduces, and it is invisible today because the two columns go stale together. Requirement 5 writes `total frequency` in that block alongside them, which makes the defect visible on a non-standard-label dataset: the total moves while its neighbours do not. That is the correct trade, since withholding the write would break the sum on every `positive` / `negative` document instead. Filed as [STORYQ-85](https://concord-consortium.atlassian.net/browse/STORYQ-85); add a comment at `:285` pointing at it. Two further details worth knowing before touching it: `featureDoesNotMatchItem` (`:158-160`) has the same defect in a more dangerous place, reading the bare prefix `kPosNegConstants.negative.attrKey` so the comparison is always true and every feature is rewritten on every pass, and neither `domain_store.ts` nor `notification_manager.ts` has any test coverage.
- **Hiding is stored outside the attribute**: CODAP v3 keeps the flag in the document's `SharedCaseMetadata`, at `attributes[<attrId>].hidden`, not on the attribute record. It **persists**, so the requirement 2 migration repairs each pre-change document once rather than fighting the document forever. Reading it back needs the right call: `attributeList` omits it (`basicAttributeInfo` returns name, id and title only), while `get …attribute[<name>]` includes it. Requirement 8 still issues the hides unconditionally, on cost rather than on impossibility.
- **`guaranteeFeaturesDataset()` is not a once-per-open call**, which matters for where the migration hangs. Its three callers are `domain_store.ts:55` (restore), `:202` (`updateNonNtigramFeaturesDataset()`) and `:317` (`updateNgramFeatures()`). It is re-entered on every feature added and on collapsing or expanding the StoryQ panel, but **not** on a tab switch (`TabPanel` never unmounts its panels, so the `useEffect`s in `feature_panel.tsx:13` and `training_panel.tsx:12` run once each) and **not** on re-checking the ngram box (`:317` sits behind `:313`'s `tokenMapAlreadyHasUnigrams` guard, which the notification handler has already made true by then). See the two corrections under requirement 8.
- **Where to hide the columns**: `domain_store.ts:88-105` creates the attributes; add `hidden: true` there for `color` and `highlight`. For documents saved before this change, follow the `hideWeightsAttributes()` pattern (`domain_store.ts:62-74`) and issue `update dataContext[Features].collection[features].attribute[color|highlight] {hidden: true}` after `guaranteeFeaturesDataset()` resolves an existing dataset. Note that `guaranteeFeaturesDataset()` returns early when `featureDatasetID !== -1` (`domain_store.ts:77`), which is exactly the restored-document case, so the hide has to run on that path rather than inside the creation branch.
- **One restore path, three migrations**: everything that has to be repaired on an existing Features dataset belongs in the same place, right after `guaranteeFeaturesDataset()` resolves a dataset it did not create. There are now three: hide `color` and `highlight`, create the `total frequency` attribute and backfill its values, and replace the ngram feature's `kNoColor` with `#ffe671`. Worth writing as one clearly named function rather than three scattered calls, since anything added later will belong there too.
- **Write-back**: the plugin currently never updates `color` or `highlight` after case creation. Both new controls need to write their value back to the feature's case, following the shape of `FeatureStore.toggleChosenFor()` (`feature_store.ts:382-419`), which already updates a hidden attribute (`chosen`) through `update ... .caseByID[...]`. For the ngram feature, that method's `syncUnigramsInFeaturesDataset()` shows the pattern for fanning an update out across every unigram case via `caseFormulaSearch[type='unigram']`.
- **Notification handler**: `NotificationManager.handleUpdateFeatureCase()` (`notification_manager.ts:70-116`) reads `color` and `highlight` from `updateCases`. Once the plugin writes those values itself, this handler will also see the plugin's own writes echoed back. It is idempotent (it assigns the same values), but the interaction is worth checking, especially for the ngram fan-out across hundreds of cases.
- **Reactivity**: for features, no new plumbing is needed. `featureStore.highlights` (`feature_store.ts:265-272`) is already read by the `TextPane` reaction. For tokens it does not work; see [Implementation traps](#1-mutating-a-token-does-not-refresh-the-text-pane).
- **Tokens vs features**: highlighting for extracted words is driven by `Token.highlight` and `Token.color`, resolved per case ID in `text_feedback_manager.ts:265-268`. A control on the single ngram row therefore has to reach every token in `featureStore.tokenMap`, not just the `Feature` object.
- **Colors**: `featureColors` in `src/utilities/color-utils.ts` already holds exactly the six colors in the Zeplin picker, in the same order. The picker can source its swatches from that array; export it rather than duplicating the hex values.
- **Component**: `src/components/feature_list_item.tsx` and its `.scss` are the place for the two buttons. Note that `FeatureList` is shared with the Training tab, so the new controls need to be behind a prop in the same style as the existing `allowChoose` / `allowDelete`.
- **There is no name pill in the markup today**, which requirement 9 assumes. `.feature-list-item` is the entire 400 px row and carries both the 1 px `#177991` border and `style={{ backgroundColor: feature.color }}` (`feature_list_item.tsx:29`, `feature_list_item.scss:1-11`). On the Zeplin 4A row the colour and the border belong to a 334 px pill and the two 28 px buttons sit outside it on a transparent background. Adding the controls therefore means introducing a wrapper and demoting the current row to the pill, not adding two children to what is already there, and the wrapper has to collapse on the Training tab or requirement 33 is broken by the restructure itself.
- **Nothing is available to build the picker with**: the plugin's runtime dependencies are mobx, mobx-react, react, react-dom, clsx, fontawesome, iframe-phone and pluralize. No React Aria, no headless UI kit, no positioning library. The popover, its placement and flip, the swatch grid, the roving tabindex and the focus return are all our own code, and the plugin's own `Button` is unusable here (see below). Adding a dependency for this is possible but is a decision this spec does not make; the amount of code involved is small enough that the requirements above specify it directly instead.
- **Case values arrive as strings**: `chosen` and `highlight` come back from CODAP as `"true"` / `"false"` and `usages` as a JSON string. `handleUpdateFeatureCase()` already normalises the two booleans (`notification_manager.ts:79-80`); any new comparison must do the same, since `"false"` is truthy.
- **Icons**: SVGs are imported as React components (`import { ReactComponent as CloseIcon } from "../assets/close-icon.svg"`) and live in `src/assets/`. Three new SVGs are needed; all are exportable from Zeplin.
- **Do not use the shared `Button` component** (`src/components/ui/button.tsx`) for these controls. It renders a `div` with `role="button"` and no key handler, which cannot satisfy the keyboard requirements above.
- **Environment**: StoryQ is tested in CODAP v3 (`testing/README.md`), currently v3.1.0. CODAP v3's own picker lives in `v3/src/components/common/color-picker-palette.tsx` in the `codapv3` repo and is a useful behavioral reference for requirement 19.

## Out of Scope

- Changes to the Training tab or to the Testing tab.
- Zeplin items 1, 2, 3 (already shipped) and item 5 (text display splitters, tracked separately).
- Changing how colors are assigned to non-ngram features (the six-color cycle stays).
- Removing the `color` and `highlight` attributes from the dataset outright (see the open question).
- Adding an accessible name to the existing delete button, or replacing the shared `Button` component elsewhere in the plugin, unless a decision below pulls it in.

## Open Questions

Status as of 2026-08-05. **All eight resolved.** Nothing is waiting on anyone.

| # | Question | Status | Blocks |
|---|---|---|---|
| 1 | Hide the columns or remove the attributes | **Resolved**: hide both | — |
| 2 | What the two buttons do on the "single words" row | **Resolved by Jie**: both buttons, both fan out | — |
| 3 | What the picker's `more` button does | **Resolved by Jie**: drop it, six colors only | — |
| 4 | Whether the weights-table note is in this story | **Resolved by Jie**: separate story, later cycle | — |
| 5 | What the picker shows for an out-of-palette color | **Resolved by Michael**: seventeenth swatch, as CODAP does | — |
| 6 | Whether the ngram name fix rides along | **Resolved**: yes, own commit | — |
| 7 | Behavior for a feature with no color | **Resolved**: treat as a bug, migrate on restore | — |
| 8 | Whether "total frequency" is part of this story | **Resolved by Jie**: yes, in scope, named `total frequency` | — |

All eight questions are answered. Two things to carry into implementation rather than re-derive:

- Questions 3 and 5 were one decision about colors outside the six. `more` is dropped, and a seventeenth swatch shows the current color when it is not one of the six.
- Michael is updating the Zeplin board to remove the `more` button and resize the popover to 108x64. Re-check the board before building the picker, in case his revision differs from the number derived here.

### RESOLVED: Hide the two columns, or remove the attributes entirely?

**Context**: The story says to hide the columns "only if the plugin relies on these attributes in the dataset; if the plugin does not rely on this, then it is OK to remove the columns from the table". The investigation found a split answer. The plugin does not rely on the dataset for persistence: `FeatureStore.asJSON()` saves `color` and `highlight` in the plugin's own state, so a saved document restores correctly without them. It does currently rely on them as the edit channel, but that is exactly what this story replaces. Against removal: the values are legitimately data about a feature that a student could graph or inspect, and removal is a one-way door for documents already in the wild.

**Options considered**:
- A) Hide both attributes, keep writing values to them (lower risk, reversible, keeps `NotificationManager` working unchanged)
- B) Remove both attributes from the dataset and delete the color/highlight branches of `handleUpdateFeatureCase()`
- C) Hide `highlight`, remove `color`

**Decision**: **A. Hide both attributes and keep writing values to them.** Removal is a one-way door for documents already in the wild, and it would mean deleting values a student may have graphed. Hiding gets the entire user-visible benefit, matches the pattern already used for `chosen`, `type`, `usages`, and the weights attributes in this same dataset, and needs no changes to `NotificationManager`. Writing to a hidden attribute is proven in production: `chosen` is created hidden and written by `toggleChosenFor()` on every Training tab click. `hidden` is a persisted property of CODAP v3's `DataSetMetadata` (`v3/src/models/shared/data-set-metadata.ts:113`), so it survives save and reload and only has to be applied once per pre-existing document. Removing the attributes stays available as a later cleanup once the new controls have been seen in classrooms.

**Consequence to watch**: once the plugin writes `color` and `highlight` itself, `handleUpdateFeatureCase()` will see those writes echoed back as `updateCases` notifications. It assigns the same values, so it is idempotent, but the echo should be checked under the ngram fan-out, where one click updates hundreds of cases.

**The "a student could graph these values" argument checks out** (R22, answered 2026-08-06 from `codapv3` `origin/main` at `f3d41932d`). Hiding an attribute does not disturb a graph that already plots it. Nothing in the display path drops an assigned axis, legend or split attribute when it becomes hidden: `isHidden` is consulted only to choose a **default caption** attribute (`data-configuration-model.ts:180`) and to filter the axis attribute **menu** (`axis-or-legend-attribute-menu.tsx:49,335`). So a graph of `highlight` keeps rendering after the hide; what the student loses is the ability to re-select the attribute from the axis menu, which is the intended effect of the hide anyway. The reasoning behind option A is therefore honest as written.

### RESOLVED: What do the two buttons do on the "single words" row?

**Decision**: **A. Both buttons appear on the ngram row and both fan out to every token.** Jie Chao, 2026-08-05, in reply to the two questions as posed:

> re: 1. Yes.
>
> re: 2. I am leaning toward keeping the color picker for single-words so the layout remains the same. Occasionally, user may use both count feature and single-word features.

So the visibility toggle hides and restores highlighting for all extracted words at once, and the color button recolors all of them at once. Her reasons for keeping the color button are layout consistency across rows, and the case where a student runs single-word extraction alongside ordinary features and needs to tell the two apart. That second reason is worth keeping in mind: it means recoloring the whole single-words set is a real workflow, not a theoretical capability.

**Context**: The ngram feature is one row in the plugin but hundreds of cases in the Features table (682 with the ice cream training data), each with its own `Token.color` and `Token.highlight`.

What the design actually specifies: the Zeplin 4A heading says "each feature added has 'Show/Hide Highlighting' and 'Highlight Color' buttons", so both buttons appearing on the ngram row is required. What it does not specify: every one of the eleven state mockups across both button groups uses the same ordinary feature (`count: "love"`). There is no mockup of the single-words row, and nothing states what either button does when the row stands for hundreds of tokens.

This exact question was asked in the Jira thread (Doug: "What do you want to do in this case where there is a single feature but that generates a color per word?"). Jie's reply answered a narrower question: it covered hiding the color *column* and switching single-word extraction to yellow, both of which are settled. The behavior of the in-plugin buttons on that row was never addressed.

**Implementation facts established while investigating** (these hold regardless of which option is chosen):

- The ngram feature has **no case in the Features dataset**. `updateNonNtigramFeaturesDataset()` filters it out (`domain_store.ts:138`) and `updateNgramFeatures()` creates cases for the tokens only (`domain_store.ts:352-375`). Dataset write-back for this row therefore cannot use `caseByID`; it has to fan out over the unigram cases the way `syncUnigramsInFeaturesDataset()` already does for `chosen` (`feature_store.ts:386-403`), which batches ~680 updates into one request.
- The ngram feature's own `highlight` flag currently drives nothing. Text-pane highlighting for extracted words is gated on the **token's** flag, resolved per case ID (`text_feedback_manager.ts:265-268`, `:430-442`). An eye button on that row has to reach `featureStore.tokenMap`, not just the `Feature`.
- **Token mutations do not trigger the text pane.** `tokenMap` is deliberately excluded from `makeAutoObservable` (`feature_store.ts:53-55`), so the `featureStore.highlights` computed cannot track it. Verified with a throwaway mobx test: mutating a `Feature`'s `highlight` or `color` fires the reaction once per change; mutating a `Token`'s `highlight` or `color`, or adding or deleting a token, fires it zero times. However, if the parent `Feature` is touched in the same tick, the computed re-runs and picks up the preceding token changes. So a fan-out that writes the ngram `Feature`'s flag alongside every token's flag gets the refresh for free; one that writes only tokens will silently fail to update the text pane.

**Options considered**:
- A) Visibility toggle applies to all tokens; color button applies to all tokens, and picking a color recolors every extracted word
- B) Visibility toggle applies to all tokens; the color button is hidden on the ngram row, since single-word extraction is fixed at yellow
- C) Both buttons hidden on the ngram row (contradicts the Zeplin 4A heading)

**Recommendation, since confirmed**: A. The eye is the most valuable control on that row, since single words is the one feature that can flood the text pane. Once all words share one color, the color button becomes the single knob distinguishing single-word highlighting from other features rather than a pointless one. Hiding a control on one row also makes that row look broken next to its neighbors and adds a special case to the component and its tests.


### RESOLVED: What should the picker's "more" button do?

**Decision**: **C. Drop the `more` button. The six StoryQ colors are the whole palette.** Answered by Jie Chao (PI) on 2026-08-05, replying to the question that had been addressed to Michael:

> Let's drop the "more button" and hide the color-picking column in the features table. It's very unlikely that users can find the color-picking column and change it to an unexpected color.

The second half restates requirement 1, which this story already does, so the two are consistent.

**Consequences**:
- The picker is six swatches and nothing else. No new color library, and no text-color adaptation is pulled into this story, since every color this story can newly produce is one of the six and all six clear WCAG AA against `#222222` (requirement 39). Colors already stored in older documents are the exception, and remain reachable through the seventh swatch; see the interaction note below and requirement 39.
- **The popover geometry in the Zeplin no longer applies as drawn.** The mockup's 108x104 popover budgets 24 px for the `more` button plus its surrounding gap. Removing it leaves the swatch grid (84x40 inset 12 px) and should give roughly **108x64** with symmetric padding. That number is derived, not designed, so it is worth showing Michael before it ships.
- Deviating from a drawn element is Michael's design being changed by someone else. See the note in the out-of-palette question below about looping him in.

**Interaction with the out-of-palette question**: dropping `more` does not by itself guarantee accessible highlights. Colors outside the six are already stored in existing documents, typed as free text into the Features table's color cell, and they survive into the new picker and the text pane whatever `more` does. So option C closes the door going forward only.

**Context**: The design says the picker is CODAP's picker with StoryQ's six colors, "otherwise use current CODAP UI/UX", and the mockup draws the `more` button. CODAP v3's `more` expands `react-colorful`'s `HexAlphaColorPicker` with Cancel and Set Color buttons (`v3/src/components/common/color-picker.tsx`, `color-picker-palette.tsx:167-183`). StoryQ has no color library in `package.json` today, though `react-colorful` is small enough that bundle size is not the deciding factor.

**The deciding factor is contrast.** Highlighted words render as `color: #222222` on the feature color (`src/components/text-pane/text-section.scss:59-63`), and the Zeplin name pill uses the same dark text on the feature color. All six StoryQ colors are light and clear WCAG AA with room to spare; arbitrary colors do not:

| Color | Contrast with `#222222` | |
|---|---|---|
| `#ffe671` | 12.73:1 | palette |
| `#dbb6fb` | 9.16:1 | palette |
| `#45f1eb` | 11.39:1 | palette |
| `#a8e620` | 10.61:1 | palette |
| `#fb93e8` | 7.91:1 | palette |
| `#9ce1ff` | 11.08:1 | palette |
| `#000000` | 1.32:1 | reachable via `more` |
| `#2a4bd7` | 2.34:1 | reachable via `more` (CODAP blue) |
| `#ad2323` | 2.30:1 | reachable via `more` (CODAP red) |
| `#1d6914` | 2.34:1 | reachable via `more` (CODAP green) |

The minimum for body text is 4.5:1. The plugin has no text-color adaptation, so a student who picks a dark color makes their own highlights unreadable. `HexAlphaColorPicker` also exposes an alpha slider, so a fully transparent highlight is reachable too.

**No CODAP change is required by any option.** The picker in the mockup is anchored under the plugin's own Color Button and is rendered by the plugin in its iframe; "use current CODAP UI/UX" describes look and behavior, not reuse of CODAP's component. There is no plugin API that opens CODAP UI on the plugin's behalf: the registered data-interactive resource types are all data and component-creation resources (`adornment`, `attribute`, `case`, `collection`, `component`, `dataContext`, `document`, `formulaEngine`, `global`, `interactiveFrame`, `item`, `selectionList`, and similar), with no picker, dialog, or prompt. Once the `color` column is hidden, CODAP's own color-cell editor is out of the picture too. Option A is therefore a rebuild inside StoryQ, not a reuse.

**Options considered**:
- A) `more` expands a full picker, matching CODAP's look. Requires adding `react-colorful` (`^5.6.1`, the library CODAP itself uses) and rebuilding the more/less toggle with Cancel and Set Color. **Carries extra scope**: to stay accessible this needs automatic text-color switching (dark text on light fills, light text on dark) in `utilities.ts` where the inline `backgroundColor` is set, in `text-section.scss` where `#222222` is hard-coded, and in the name pill in `feature_list_item.tsx`.
- B) `more` opens a native `<input type="color">`. No dependency, but does not match CODAP's look and has the identical contrast problem.
- C) Omit the `more` button; the six StoryQ colors are the whole palette. Departs from the mockup by one button.
- D) Keep `more` visible but defer the expanded picker to a follow-up story. Rejected: a visible button that does nothing is worse than either end state.

**Recommendation, since confirmed**: C. Trimming sixteen colors to six is partly about guaranteeing every available choice works as a highlight; `more` reopens exactly what the story closes.


### RESOLVED: Is the weights-table note part of this story?

**Decision**: **B. A separate story, scheduled for a later cycle.** Jie Chao, 2026-08-05: "re: a) a separate story for later cycle."

**Caveat on that answer**: she gave it before being told that most of the note is already implemented (see below), so she was choosing under the impression that a substantial piece of work was being deferred. What is actually being deferred is the removal of a 50 px empty strip. Her answer is still the right outcome and is if anything better suited to the smaller scope, but the ticket should be written to describe the sliver rather than "hide the weights table", or it will read as far larger than it is.

**Filed as [CODAP-1492](https://concord-consortium.atlassian.net/browse/CODAP-1492)**, not as a StoryQ story. The remaining artifact is drawn by CODAP's case table, not by StoryQ, so StoryQ cannot fix it short of deferring creation of the weights collection until training, which collides with `childCaseID` feature identity and is disproportionate to a 50 px strip.

What that ticket asks for: do not render the grid for a child collection when all of its attributes are hidden. It is careful to distinguish itself from [CODAP-1375](https://concord-consortium.atlassian.net/browse/CODAP-1375), where an index-only grid is the correct result for a single flat collection whose attributes the user deliberately hid, and it flags the test in `data-set-metadata.test.ts` that pins the not-auto-showing guarantee.

**So Michael's note can be treated as satisfied for this story.** StoryQ already hides the weights attributes during feature extraction and reveals them at training, which is the behavior the note describes. Nothing is left for STORYQ-74 to do, and the cosmetic remainder is tracked with the team that owns the rendering.

**Earlier context**: her first reply of 2026-08-05 answered the scheduling question ambiguously and attached a new requirement:

> re: 3. Correct. The weights are irrelevant at the feature extraction stage. However, the Features table should still be created with three columns: frequency in positive, frequency in negative, and total frequency

**What is settled**: the weights genuinely should not be present during feature extraction. The intent behind Michael's note is confirmed.

**What is not settled**: "Correct" could be agreeing with the premise (weights should be hidden) or endorsing the recommendation (do it as a separate story). The question offered separate-story versus include-now, and she answered neither in those terms. Treat the scheduling as unconfirmed rather than assuming the recommendation won.

**What is new**: "total frequency" does not exist. See the open question below.

Not blocking: nothing else in this spec depends on the scheduling answer.

**Context**: The Zeplin board carries a note next to section 4B: "The weights table should also be hidden during the feature extraction stage and expanded only in the training stage." It is not mentioned in the STORYQ-74 description, but neither was the single-yellow change, which is in scope by Jie's and Doug's comments, so the omission alone does not settle it.

**Most of the note is already implemented, which was not known when this question was written.** Training calls `showWeightAttributes()` (`model_manager.ts:82-93`, invoked unconditionally at `:117`), which unhides `model name` and `weight`. Combined with `hideWeightsAttributes()` at dataset creation, StoryQ already hides the weights data during feature extraction and reveals it at training, which is what the note asks for. Confirmed by comparing the two test documents: doc 1 (untrained) renders the weights grid at 50 px with one blank column, doc 3 (trained) renders it at 170 px with `model name` and `weight`.

**So the only outstanding gap is cosmetic**: during feature extraction a 50 px empty strip remains where the collection sits, because the collection itself cannot be hidden. That is a much smaller complaint than "the weights table is showing", and it may be that the note can simply be closed as already-done apart from the sliver.

**What students actually see today** (measured in the running app, CODAP v3.1.0 build 2985 with StoryQ 2.20.0): the Features tile renders two grids. The main grid carries `name`, `color`, `highlight`, and the two frequency columns. The weights collection renders as a **35 px wide strip** on the right, its title truncated to "wei...", containing only a row-number column and no data columns, because `hideWeightsAttributes()` has already hidden `model name` and `weight`. A manual ⊟ collapse control is present in the CODAP UI, which is a user affordance and not something the plugin can drive. So the leftover is a stray sliver, not exposed data.

**Why this is a much larger change than hiding two attributes**:

- **There is no collection-level hide in the plugin API.** Verified against `codapv3` `origin/main` at `f3d41932d` (2026-08-03), not from memory:
  - `DIUpdateCollection` accepts exactly `{ title, labels }` (`data-interactive-data-set-types.ts:86-89`), and `collection-handler.ts:122-140` applies nothing else.
  - The case-table component type `V2CaseTable` adds only `dataContext`, `horizontalScrollOffset`, and `isIndexHidden` to the base component fields (`data-interactive-component-types.ts:110-115`). `isIndexHidden` hides the index column, not a collection.
  - Collapse exists in the model as `setIsCollapsed(caseId, isCollapsed)` (`data-set-metadata.ts:440`), but every caller is case-table UI (`case-table-registration.ts:124`, `collection-table-spacer.tsx:172,187`). No data-interactive handler reaches it.
  - **Hiding every attribute in the collection does not do it either**, which is the obvious first thing to try and is already what StoryQ does. Measured in the test document by toggling the inspector's "Show 5 Hidden Attributes" (the 5 being `chosen`, `type`, `usages`, `model name`, `weight`): with the weights attributes hidden the collection renders as a 50 px grid with one blank index column; with them shown it renders as a 170 px grid with `model name` and `weight`. Two grids in both states. Hiding all its columns shrinks the sub-table, it does not remove it, and the leftover sliver is the residue of that approach rather than something a further hide could fix.
- **What the plugin API *can* hide is a whole tile.** `update component` accepts `isVisible`, and the handler calls `freeTileRow?.setTileHidden(component.id, !isVisible)` (`component-handler.ts:227-255`). This does not satisfy the note, since hiding the Features tile would hide the feature list this story is adding controls for. It is recorded because it suggests a cheaper design alternative if the note's real intent is "students should not meet weights before training": put weights in a second table that is hidden as a whole, rather than as a child collection of Features. That would be a design change, not just an implementation one, and belongs in the follow-up story.
- **The remaining approach, deferring creation of the weights collection until training, collides with feature case identity.** Creating a case in the parent `features` collection auto-creates its child case in `weights`, and the plugin stores that child's id as `childCaseID` (`domain_store.ts:272`, repopulated on restore at `:602-603`) and resolves selections through it (`feature_store.ts:175-178`). The code flags this directly at `domain_store.ts:268-271`: "There's some ambiguity about which is the case for the feature, the one in the features collection or the first child case... It would be much better to always use the case in the features collection, but that would require a major refactor."

**Options considered**:
- A) In scope: hide the weights collection during feature extraction and reveal it when training starts
- B) Out of scope: raise it as its own story, referencing the same Zeplin note and recording that CODAP has no collection-level hide today (which may need a CODAP-side story first)
- C) In scope only if it turns out to be a small change on top of the column-hiding work. The investigation answers this: it is not small.

**Recommendation, since confirmed**: B. This note shares a sentence with the story but not an implementation. Bundling would put a well-understood change behind an open-ended one.

(The decision is recorded at the top of this question: B, answered by Jie on 2026-08-05 and filed as CODAP-1492. The placeholder that stood here was a leftover from the question template.)

### RESOLVED: Is "total frequency" part of this story?

**Decision**: **A. In scope.** Add a `total frequency` attribute to the Features collection, so the visible columns become the feature name plus the two existing frequency attributes and `total frequency`. (Jie's wording below names them `frequency in positive` and `frequency in negative`, which are the ice cream data's labels. Those two names are derived from whatever labels the student picked; only `total frequency` is a fixed string. See requirement 7.)

Raised by Jie on 2026-08-05 while answering the weights-table question ("the Features table should still be created with three columns: frequency in positive, frequency in negative, and total frequency"), and confirmed by her the same day:

> re: b) I think "total frequency" works. I can't think of a better term at this moment. Yes for single-word extraction.

So: the name is `total frequency`, and single-word rows carry a per-word total, being the number of texts that word appears in across both labels.

**Use `numPositive + numNegative`, not `Token.count`.** Tokens carry both. In the unigram path they agree, since `count` starts at 1 and increments from the second document while the two class counters increment from the first (`one_hot.ts:112-137`). They do not agree everywhere: the column-feature branch increments `count` without touching either class counter. More importantly, the two existing frequency columns are written from `numPositive` and `numNegative` (`domain_store.ts:367-368`), so summing those is the only way the total is guaranteed to equal the two columns beside it. A total that visibly fails to match its neighbors would be worse than no total at all.

**Status of the earlier scheduling concern**: none. The attribute is written wherever the existing two are, so this rides along with work the story already does.

**Context**: The attribute does not exist. The Features collection is created with `name`, `chosen`, `color`, `highlight`, a positive-frequency attribute, a negative-frequency attribute, `type`, and `usages` (`domain_store.ts:88-105`). The two frequency attributes are named dynamically as `kPosNegConstants.positive.attrKey` plus the class name, giving `frequency in positive` and `frequency in negative` for the ice cream data (`store_types_and_constants.ts:11-20`). There is no total, and grepping the source for "total frequency" returns nothing.

**The design does not have it either.** Section 4A includes a screenshot of the Features table with red strikethroughs over exactly `color` and `highlight`, leaving `name`, `frequency in positive`, and `frequency in negative`. That is the intended end state Michael drew, and it has two frequency columns, not three. The image is a flattened bitmap rather than an exportable asset, so it does not appear in the text dump; it was cropped from the screen render and saved to `/home/doug/docs/zeplin-specs/storyq-74-features-table-mockup.png`. So Jie's third column is an addition to the design, not a restatement of it, which is the main reason this is being tracked as a question rather than folded in silently.

Worth noting from the same image: it shows the weights table present and un-struck, even though the note elsewhere on the board asks for it to be hidden during extraction. The board is inconsistent with itself on that point, which is further reason to keep the weights work separate.

Reading her sentence together with the rest of the reply, "three columns" appears to mean three *data* columns beyond `name`, which is the same set this story leaves visible once `color` and `highlight` are hidden, plus a new total. That reading is consistent with what she was answering: what the table should show during feature extraction.

**Why it lands near this story**: STORYQ-74 already changes exactly which columns the Features table shows. If the total is added separately, the table changes twice, and the second change reopens a question this story just closed.

**Why it might not belong here**: it is a new attribute rather than a visibility change, it needs its value maintained wherever the two existing frequencies are maintained, and nothing in the Zeplin or the ticket mentions it.

**Implementation sketch, if in scope**: the value is `numberInPositive + numberInNegative` for constructed features and `numPositive + numNegative` for tokens, both of which the plugin already computes. It could be written as a plain value at case creation alongside the existing two, in `domain_store.ts:237-253` and `:352-370`, and kept current wherever those are updated. A CODAP formula attribute is the other option, but the formula would have to interpolate the dynamically named frequency attributes, which is more fragile than writing a number.

**Options considered**:
- A) In scope: add it as part of this story's Features table changes
- B) Separate story, sequenced right after this one
- C) Separate story, independent

**Recommendation, since confirmed**: A. This story is already deciding what the Features table shows, and changing that table twice would reopen a question it just closed.

### RESOLVED: What does the picker show when the feature's current color is not one of the six?

**Decision**: **A. Append a seventeenth swatch showing the current color, as CODAP does.** Michael Tirenin, 2026-08-05:

> re: "CODAP handles this by adding a seventeenth swatch showing the current color, and I'd plan to do the same unless you'd rather it looked different" -- this makes sense to me, too

**And the popover geometry is confirmed**, in the same reply:

> re: 108x64 -- makes sense; I'll remove the "more" button and resize the container in the spec

So the Zeplin board is being updated to match, and 108x64 is the size to build. Worth re-checking the board before implementing the picker, in case his revision differs from the derived number.

**Earlier context**: Jie's reply of 2026-08-05 dropped `more` and added "It's very unlikely that users can find the color-picking column and change it to an unexpected color." That spoke to how often the case arises rather than what to do when it does, which is why the question stayed open until Michael answered it.

**How her remark changes the picture**: with `more` dropped and the column hidden, no *new* out-of-palette color can be introduced. The case is therefore confined to documents already saved. Her judgement that this is rare is reasonable for students, though worth weighing against the fact that the column is a plain text input, and that the one person who tried it on this project (Doug, building the test document) set `#777777` without difficulty. Rare is not never, and the failure is silent: a feature with a visible color whose picker shows nothing selected.

**Two further options this opens up**, now that the palette is closed:
- D) Migrate out-of-palette colors to the nearest of the six when an old document is restored. Consistent with the palette now being closed, and it would fix the legacy contrast problem too. It does overwrite a stored choice.
- E) Accept it. If the case is as rare as Jie expects, a picker with nothing checked is a small cost.

**Note on ownership**: this question and the `more` question were both addressed to Michael as the designer, and Jie answered them. She is the PI so the call stands, but dropping `more` also changes the popover's drawn geometry (see above), so Michael should probably be told rather than discovering it in review.

**Context**: Surfaced on 2026-08-05 by the test document Doug built, in which `contain: "good"` carries `#777777`, set from the Features table. Requirement 15 says the picker offers exactly the six StoryQ colors and puts a checkmark on the currently selected swatch. When the current color is outside the palette, no swatch matches and the picker shows no selection at all, which reads as "this feature has no color" when it plainly does.

This is not hypothetical, and the current editor makes it the *easy* path rather than an edge case. Editing a `color` cell in the Features table opens a text input with a small swatch button beside it:

```html
<div class="color-cell-text-editor">
  <button class="cell-edit-color-swatch" aria-label="Open color picker for color">…</button>
  <input data-testid="cell-text-editor" aria-label="Edit color" value="#ffe671">
</div>
```

The palette appears only if you click the swatch; typing a hex value straight into the input is what most people do, and is how `#777777` got into the test document. So every existing document may contain arbitrary colors, entered as free text, with no palette involved. They would also remain reachable through `more` if that open question resolves toward a full picker.

Hiding the column removes this entry point going forward, which is a further argument for the story, but it does nothing about colors already stored.

CODAP v3 solves this by appending a seventeenth swatch for the current non-palette color, held stable in a ref because React Aria will not allow a `ListBoxItem` id to change between renders (`color-picker-palette.tsx:49-59`, `:146-157`). That mechanism is worth copying if we go the same way.

Note also that `#777777` against the `#222222` highlight text is **3.55:1**, below the WCAG AA minimum, so pre-existing out-of-palette colors are already an accessibility problem independent of the `more` question.

**Options considered**:
- A) Append a seventeenth swatch showing the current color, checked, as CODAP does
- B) Show the six swatches with nothing checked, and let the first pick replace the color
- C) Migrate out-of-palette colors to the nearest of the six on restore, so the case cannot arise
- D) As C, framed as cleanup now that the palette is closed
- E) Accept a picker with nothing checked, on the grounds that the case is rare

**Recommendation, since confirmed**: A. It is a handful of lines, it is honest about the feature's current state, it does not discard a color anyone chose, and it costs nothing when the case does not arise. Rarity is an argument for it being cheap, not for leaving the state undefined.

(The decision is recorded at the top of this question: A, answered by Michael Tirenin on 2026-08-05. The placeholder that stood here was a leftover from the question template.)

### RESOLVED: Should the ngram feature name fix ride along?

**Context**: `FeatureStore.constructNameFor()` (`feature_store.ts:148-150`) produces "single words with frequency ≥ 4ignoring stopwords" with no space before "ignoring". It is visible in the plugin, in the Features table, and in the Jira screenshot attached to this story. The one-character fix is already written in the prior-art commit `f7d9b5b` alongside the yellow change.

Exact strings, pinned with a throwaway test:

| | Current | Fixed |
|---|---|---|
| `ignoreStopWords: true` | `single words with frequency ≥ 4ignoring stopwords` | `single words with frequency ≥ 4 ignoring stopwords` |
| `ignoreStopWords: false` | `single words with frequency ≥ 4` | unchanged |

**Why renaming is safe here**:
- `constructNameFor()` has exactly one caller, `feature_pane.tsx:55`, at feature-creation time. The name is computed once and stored; restored documents carry their saved name. Only newly created features are affected, so there is no migration and no way for a stored name to diverge from a recomputed one.
- `addOrUpdateFeatureToTarget()` returns early for `kFeatureKindNgram` (`target_store.ts:300-301`), so the ngram feature's name never becomes a target-dataset attribute name. That was the scenario that would have made a rename risky.
- No other name-keyed lookup touches it: `deleteFeature()` removes unigrams via `itemSearch[type==unigram]` rather than by name, the ngram feature has no case in the Features dataset, and `model_manager.ts:523` matches tokens to features by name rather than the ngram feature. Names already stored in `TrainingResult.featureNames` stay consistent because the feature keeps its old name.

**Options considered**:
- A) Include it; it is one character, already written, and visible in this story's own UI
- B) Exclude it and file a separate bug

**Decision**: **A. Include it**, as its own commit so it is easy to isolate in review. The throwaway assertions should be promoted into a real test of `constructNameFor()` rather than deleted. A separate ticket for a missing space would cost more in process than the fix costs in code.

**Noticed but explicitly not fixed here**: `getDescriptionFor()` (`feature_store.ts:166-172`) has a literal newline and indentation inside its template string, producing `"unigram with frequency threshold of 4,\n       ignoring stop words"`. It is dead in practice; its only consumer is a commented-out line at `domain_store.ts:246`.

### RESOLVED: Is there a defined behavior for a feature with no color?

**Context**: The design defines "highlight off" as a white name pill. `kNoColor` is the literal string `"NO_COLOR"` (`color-utils.ts:3`), which browsers reject as a CSS color:

```
element.style.backgroundColor = 'NO_COLOR'   ->  ""             (assignment rejected)
computed background with that value          ->  rgba(0,0,0,0)  (transparent)
```

Two consequences, both verified:
- In the feature list, `style = { backgroundColor: feature.color }` (`feature_list_item.tsx:29`) yields a **white** pill, visually identical to the design's "highlight off" state but meaning something different.

  **Corrected 2026-08-06.** This said "transparent", reasoning from the rejected assignment above. The row is not a bare element: `.feature-list-item` sets `background-color: white` (`feature_list_item.scss:3`), so dropping the invalid inline declaration falls back to the class rule. Measured in a browser with the real stylesheet applied, a row carrying `style="background-color: NO_COLOR"` computes to `rgb(255, 255, 255)`. The conclusion this question reaches is unaffected, and if anything stronger: the collision with the design's white is exact rather than approximate. What it does change is the implementation, since guarding `kNoColor` by emitting no background reproduces the same white; see the implementation spec's section 7a.
- In the text pane, `highlightWord` guards with `feature?.color ? ... : undefined` (`utilities.ts:21`). `"NO_COLOR"` is a truthy string, so the guard passes and an invalid inline style is emitted; the word still highlights only because it falls back to the `.highlighted` class background `#fdf2d0` (`text-section.scss:60`). That works by accident.

**Where `kNoColor` can still reach a rendered row after this story**: restored documents. The yellow change applies at creation time in `feature_pane.tsx` and `one_hot.ts`, but a document saved before this story stores its ngram feature with `kNoColor`, and `fromJSON()` restores it verbatim. Everywhere else it is transient: `getStarterFeature()` seeds it for the feature under construction (`store_types_and_constants.ts:231`) and `domain_store.ts:353` already replaces it for tokens.

**Options considered**:
- A) Guarantee every feature in the list has a color by the time it is rendered; treat `kNoColor` as a bug
- B) Render `kNoColor` as a white pill with an unfilled color button, and let the color button assign one

**Decision**: **A.** The design assigns white a specific meaning, so a second unrelated cause of a white pill is a defect rather than a tidy-up. Two pieces of work follow:
1. **Restore migration**: when restoring a document whose ngram feature is `kNoColor`, set it to `#ffe671`. This sits alongside the column-hiding work already required on restore, so it costs one more step in the same code path.
2. **Tighten the guard** at `utilities.ts:21` to test against `kNoColor` explicitly rather than truthiness, so an invalid inline style can never be emitted.

## Self-Review

Phase 1, Step 4 of `/cc-create-spec`, run 2026-08-06 against the requirements above. Roles: Senior Engineer, Migration and Backward Compatibility, QA Engineer, WCAG Accessibility Expert, Student, Teacher, Product Manager.

Every finding below was checked against the source or the running application before being written down. Where something could not be checked, the item says so.

**Numbering**: applying these findings added five requirements, so the list above renumbered from 1-35 to 1-39. Findings written before that renumbering quote the old numbers; each resolution note gives the new one where it matters. The mapping is: 1-7 unchanged, new 8 inserted, old 8-18 became 9-19, old 19-25 became 20-26, new 27 and 28 inserted, old 26-32 became 29-35 with a new 37 inserted among the accessibility items, old 33-35 became 36, 38 and 39.

**Scope constraint applied throughout** (Doug, 2026-08-06): changes stay within the new feature being added. Findings that would have required editing existing UI or accessibility code outside this story's own surface are recorded rather than fixed, and say so.

### Product Manager

#### RESOLVED: R1. Requirement 15's hedge is stale, Michael's revision has landed

**Applied 2026-08-06.** Requirement 16 (was 15) now states 108x64 as a design fact with the stale-group-bound caveat, and requirement 17 (was 16) says "seventh swatch" rather than "seventeenth", which was CODAP's number for its sixteen-colour palette. The decision-log entries in the Open Questions keep their original wording as a record of what was known at the time.

Requirement 15 says "Michael is updating the board to remove the button and resize the container, so check it before building in case his revision differs from this derived number." He has. Comparing the live Zeplin screen against the dump captured on 2026-08-05 (`/home/doug/docs/zeplin-specs/storyq-updates-6938b582.md`):

| | Dump, 2026-08-05 | Live, 2026-08-06 |
|---|---|---|
| `More Button` group (54x24) and its `more` text | present, on both picker instances | removed |
| `Color Dropdown back - Short` | 108x**104** | 108x**64** |

The revised swatch grid measures exactly what requirement 15 derived: `Color Swatches` is 84x40 at a 12 px inset on all four sides (12 + 84 + 12 = 108 wide, 12 + 40 + 12 = 64 tall), 18x18 swatches on a 22 px pitch, four per row, with a 10x8 checkmark on the selected one. He also added a blue artboard note beside the picker: "(note: Color Picker updated with the six StoryQ colors *with potential 7th*)".

So 108x64 is now drawn rather than derived, and the seventh swatch is acknowledged in the design. Suggested resolution: restate requirement 15 as a design fact and drop the "check before building" caveat. One caveat to keep: the parent `Color Picker` group's bounding box still reports 108x104 while its background shape is 64, which reads as a stale group bound left over from the resize rather than a second container.

#### RESOLVED: R2. The Jira ticket does not mention `total frequency` or the name fix

**Posted to STORYQ-74 on 2026-08-06** as comment 42112. The two items are recorded separately rather than bundled, because they are not the same kind of thing: `total frequency` is Jie's own addition and the comment attributes it to her reply, while the missing-space fix was decided locally and she had not seen it raised, so the comment reads as notice rather than attribution. No link to this spec, since the branch is unpushed.

Note for anyone posting ADF through `acli` later: a `code` mark cannot be combined with `strong`. The payload is rejected with a bare `INVALID_INPUT` that names nothing.

Requirements 4 to 6 add a new attribute and maintain it in four places, and requirement 22 changes a user-visible feature name. Neither is in the STORYQ-74 description or the Zeplin board; both entered through Jie's replies on 2026-08-05 and are recorded as resolved here. That is settled and this item does not reopen it.

The gap is that a reviewer reading only the ticket will see a PR that exceeds it. Suggested resolution: add a short comment to STORYQ-74 recording that `total frequency` and the ngram name fix are in scope by Jie's 2026-08-05 replies, so the ticket and the PR agree. Jira descriptions and comments must be ADF JSON, not markdown.

---

### Senior Engineer

#### RESOLVED: R3. Requirement 5's fourth citation points at the wrong code

**Applied 2026-08-06.** Requirement 5 now names `updateFrequenciesUsagesAndFeatureIDs()` at `:163-190` as the recount, records that it mutates in-memory features only and reaches non-ngram features only, and points at `:276-291` as the dataset write for those values. Three write sites, not four.

Requirement 5 says `total frequency` must be maintained "in the recount path (`:575-591`)". `domain_store.ts:575-591` is not a recount: it is the block that writes `featureIDs` back to the target dataset and `usages` back to the Features dataset.

The actual recount is `updateFrequenciesUsagesAndFeatureIDs()` at `domain_store.ts:163-190`, which zeroes `numberInPositive` / `numberInNegative` and re-increments them. Two things follow that requirement 5 currently misses:

- That function only mutates the in-memory `Feature` objects. The dataset write happens through the `tFeaturesToUpdate` block at `:276-291`, which requirement 5 already cites separately. So there may be only three write sites, not four.
- It iterates `tNonNgramFeatures` (`:166`), so token frequencies are never recounted by it at all.

Suggested resolution: correct the citation to `:163-190`, and state explicitly whether `total frequency` is recomputed in memory there and written at `:276-291`, or written in both places.

#### RESOLVED: R4. Requirement 4's "always equals the sum of the two columns beside it" is not true today

**Resolved 2026-08-06 by option A, then SUPERSEDED the same day by [R23](#open-r23-option-a-makes-total-frequency-go-stale-in-the-common-case-which-is-worse-than-the-problem-it-solved) in the second review pass, which reverted to option B.** Option A was chosen on a comparison that only considered the non-standard-label case: omitting the update-path write keeps the three columns consistent there, but leaves the total frozen while its neighbours update on every `positive` / `negative` dataset, which is all real usage. The evidence gathered under this item is unaffected and still stands; only the decision changed.

The underlying defect is pre-existing and untouched: this story does not create it, it would merely have removed the camouflage. Filed as [STORYQ-85](https://concord-consortium.atlassian.net/browse/STORYQ-85), which carries the verified behaviour, the coupling back to `total frequency`, the warning about `featureDoesNotMatchItem`, and the note that neither file has test coverage.

**Findings established while deciding this, verified in the running app on 2026-08-06** (CODAP v3.1.0 build 2985, StoryQ 2.20.0), recorded so they are not re-derived:

- Attribute names really are data-dependent. With `city` as the label attribute the Features table is created with `frequency in Toronto` and `frequency in Phoenix`.
- CODAP silently drops an `update itemByID` write to an attribute that does not exist. It does not create a column and does not surface an error, so no spurious `frequency in positive` columns appear.
- Changing the Labels attribute after features exist does not rename or recreate the Features dataset. The frozen attribute names and the live-computed class names can diverge permanently.
- The update path runs constantly. `featureDoesNotMatchItem` (`:158-160`) indexes with the bare prefix `'frequency in '`, so the lookup is always `undefined`, the comparison always true, and every non-ngram feature is queued on every pass. Passes happen on every tab switch, via `feature_panel.tsx:13` and `training_panel.tsx:12`.
- The whole defect is a no-op for `positive`/`negative` labels, which covers all three test documents.

Requirement 4 justifies using `numberInPositive + numberInNegative` on the grounds that it is "the only way the total is guaranteed to equal the two columns beside it", and the resolved question adds that "a total that visibly fails to match its neighbors would be worse than no total at all". That guarantee does not hold in the current code for any dataset whose class labels are not literally `positive` and `negative`.

The two frequency attributes are named dynamically, `kPosNegConstants.positive.attrKey` (the string `'frequency in '`) plus the class name read from the user's data (`store_types_and_constants.ts:12-18`, `target_store.ts:163`). Creation respects that (`domain_store.ts:251-252` uses `tPositiveAttrName`). The update path does not:

```
domain_store.ts:285   'frequency in positive': iFeature.numberInPositive,
domain_store.ts:286   'frequency in negative': iFeature.numberInNegative
```

`notification_manager.ts:100-105` hardcodes the same two names when reading values back. So for a dataset labelled, say, `good` / `bad`, the update path writes to attributes that do not exist and the two frequency columns silently stop updating, while a correctly maintained `total frequency` would keep moving. That produces exactly the mismatch requirement 4 says is worse than no total.

This is a pre-existing bug, not one this story creates, and the ice cream test data hides it because its labels happen to be `positive` and `negative`. But this story is what puts a third column next to the two broken ones. Suggested resolution: decide explicitly whether to fix the hardcoding as part of this story, or to weaken requirement 4's guarantee and file the bug separately. Either is defensible; leaving requirement 4 asserting a guarantee the code does not provide is not.

#### RESOLVED: R5. The colour cycle restarts at yellow on every document open

**Recorded, not fixed, 2026-08-06.** Persisting `featureColorIndex` means changing `color-utils.ts` and `FeatureStore.asJSON()`, which is existing code outside this story's surface, so it is out under the scope constraint. The finding stands as verified and should be filed as its own bug. Its user-visible consequence is carried by R19, which is still open.

`featureColorIndex` is module-level state in `color-utils.ts:5` and is not saved by `FeatureStore.asJSON()`. On reopening a document it resets to 0, so the next feature created is handed `featureColors[0]`, which is `#ffe671`, regardless of what is already in use.

Verified in the running application on 2026-08-06, CODAP v3.1.0 build 2985 with StoryQ 2.20.0, using doc 1 from the branch test-setup notes. Doc 1 was reopened and a single new feature, `count: "cream"`, was added. It rendered in the same `#ffe671` as the existing `count: "love"`, giving two identically coloured features in a three-feature list.

This is pre-existing, but this story is what makes colour a first-class, student-visible, student-editable property, and requirement 25 rests on colour being what distinguishes one feature's highlighting from another's. Suggested resolution: state a requirement that a newly created feature does not take a colour already in use while an unused palette colour remains, or record explicitly that duplicate colours are accepted and the student is expected to fix them with the new colour button.

---

### Migration and Backward Compatibility

#### RESOLVED: R6. Requirement 21 repairs the ngram feature but not its 682 tokens

**Applied 2026-08-06.** Requirement 22 (was 21) now repairs every entry in the restored `tokenMap` alongside the `Feature`, and notes that this is the same fan-out requirement 26 performs so the code is shared. Per-token `highlight` is left alone, as recommended. This is new migration code that the story already adds, so it sits inside the scope constraint.

This is the gap the late `total frequency` answer obscured, and it sits on the same restore path as requirements 2 and 6.

Requirement 21 says restoring a pre-change document sets the ngram *feature*'s `kNoColor` to `#ffe671`. Requirement 19 says single-word extraction assigns yellow to "the ngram feature and to every token it produces". But tokens are not re-extracted on restore: `FeatureStore.asJSON()` serialises `tokenMap` (`feature_store.ts:90-98`) and `fromJSON()` restores it verbatim with `setTokenMap(json.tokenMap || {})`. A document saved before this change therefore restores 682 tokens still carrying their cycled colours.

The result is a single-words row whose colour button and pill show yellow while the text pane highlights its words in six different colours, and requirement 25's colour button is the only thing that would ever reconcile them. Confirmed against doc 1, whose 682 unigrams carry cycling colours in the Features table.

Requirement 21 covers the `Feature`; nothing covers the tokens. Suggested resolution: extend requirement 21 to recolour every entry in `tokenMap` to `#ffe671` on restore, alongside the `Feature`, and note that this is the same fan-out requirement 25 performs, so the code is shared. The same question applies to `highlight`, though there it is less clearly wrong to leave per-token values alone.

#### RESOLVED: R7. Requirement 6 does not say the values are backfilled

**Applied 2026-08-06.** Requirement 6 now states the backfill in the requirement itself rather than only in the Technical Notes, and says tokens sum the `numPositive` / `numNegative` restored from `tokenMap` rather than being recounted.

Requirement 6 says `total frequency` "is created for restored documents too" and then discusses its display position. It never says the attribute's *values* are computed for the cases that already exist. The Technical Notes do say it, at the "One restore path, three migrations" bullet ("create the `total frequency` attribute and backfill its values"), but the normative requirement omits it.

Without a backfill, opening doc 1 after this change yields a `total frequency` column that is empty for all 684 rows until something happens to rewrite each case. Suggested resolution: move the backfill into requirement 6 explicitly, and say what it is computed from for tokens on the restore path, given that `numPositive` / `numNegative` are restored from `tokenMap` rather than recounted.

#### RESOLVED: R8. Nothing states that the restore migrations are idempotent or when they run

**Applied 2026-08-06.** Added as new requirement 8: the three migrations live in one clearly named function on the restore path and every step is a no-op when its condition is already satisfied.

Three migrations now share one restore path (hide two attributes, create and backfill `total frequency`, repair `kNoColor`), and a document can be opened, saved, and opened again any number of times. Hiding is persisted in CODAP's `DataSetMetadata`, as the resolved hide-or-remove question establishes, so re-hiding is a no-op. The other two are not obviously safe to repeat: repairing `kNoColor` would overwrite a colour the student chose if the check is ever loosened, and a backfill that runs on every open is wasted work on 684 cases.

Suggested resolution: add a requirement that the migration block is safe to run on every document open, and that each step is a no-op when its condition is already satisfied.

---

### QA Engineer

#### RESOLVED: R9. A student's recolour is silently discarded by toggling the feature off and on

**Applied 2026-08-06.** Added as new requirement 27: re-created tokens take the ngram `Feature`'s current color rather than `#ffe671` unconditionally. Chose the source-of-truth option over accepting the discard, because under requirement 20 the discard is not merely a lost preference: the row would show purple while its words highlighted yellow, which is an inconsistency in this story's own new behaviour rather than a pre-existing rough edge.

Requirement 25 lets a student recolour all 682 extracted words. Nothing states whether that choice survives.

It does not. Unchecking the single-words feature in the Training tab calls `FeatureStore.toggleChosenFor()`, whose `syncUnigramsInFeaturesDataset(false)` branch calls `this.deleteUnigramTokens()` (`feature_store.ts:385`). Re-checking it runs `domainStore.updateNgramFeatures()` (`feature_list_item.tsx:45`), which re-extracts and re-creates every token. Under requirement 19 the new tokens come back yellow, so a student who recoloured the set to purple loses it by toggling a checkbox on another tab.

Suggested resolution: state the expected behaviour. Either the recolour is understood to be discarded on re-extraction (cheap, and arguably correct since the token set may have changed), or the ngram `Feature`'s colour is treated as the source of truth and re-applied to the new tokens (a few lines, and matches what a student would expect).

#### RESOLVED: R10. Requirement 26 points at a function with a destructive side effect

**Applied 2026-08-06.** Requirement 29 (was 26) now names exactly what is borrowed, the `caseFormulaSearch[type='unigram']` lookup plus one batched `update ... .case`, and states in bold that the `deleteUnigramTokens()` branch is not part of the pattern.

Requirement 26 says both fan-outs should write back "following `syncUnigramsInFeaturesDataset()`". That function is nested inside `toggleChosenFor()` and its first statement is `if (!iChosen) this.deleteUnigramTokens();`. Its batching shape is the right model; its delete branch is emphatically not, and a visibility toggle that deleted every token when switched off would be a severe bug.

Suggested resolution: reword requirement 26 to name what is being borrowed, the `caseFormulaSearch[type='unigram']` lookup followed by one batched `update ... .case` request, and say explicitly that the delete branch is not part of the pattern.

#### RESOLVED: R11. The requirements have no stated verification method

**Applied 2026-08-06.** Added a Verification section mapping requirements to the document that exercises them, pointing at the branch oob file `test-setup.md` for the document URLs and the hard-reload trap rather than duplicating them.

Thirty-five requirements, and none says how it is checked or against what. This matters more than usual here because several are only testable against a specific document, and the branch test-setup notes already record which:

- Requirements 2, 21 and the whole of R6 above need doc 1, a genuine pre-change document. They will appear to pass in a fresh document and do nothing.
- Requirement 30 needs doc 3. Without a trained model the Training tab is empty and the requirement is untestable.
- Requirements 26 and 27 need the 682-token case to mean anything.
- Requirement 16 needs doc 1's `contain: "good"` at `#777777`.

Suggested resolution: add a short verification table mapping requirements to the document that exercises them. The branch oob file `test-setup.md` already holds the document URLs and the hard-reload trap; the spec should point at it rather than duplicate it.

#### RESOLVED: R12. Picker placement is unspecified when there is no room below

**Applied 2026-08-06.** Requirement 14 (was 13) now says the picker opens above the button when there is not room below, and is never clipped by the plugin frame.

Requirement 13 says the picker is "anchored below" the colour button. The plugin runs in an iframe that the user can resize, and keeping it usable at small sizes is the subject of the sibling stories STORYQ-77 and STORYQ-79. A 64 px popover anchored below a row near the bottom of a short plugin window has nowhere to go.

I have not verified how badly this clips, since the control does not exist yet, so this is a gap in the requirements rather than a confirmed defect. Suggested resolution: state the fallback, most simply that the picker flips above the button when there is not room below, and that it is never clipped by the plugin frame.

---

### WCAG Accessibility Expert

#### RESOLVED: R13. The picker's swatches fail WCAG 2.2 target size as drawn

**Resolved by Michael Tirenin, 2026-08-06**, with a better answer than the one proposed to him:

> Well, thinking about it now ... those StoryQ specs are older than the updates we made to CODAP (that overhaul design). Can we use the updated swatches from there (say from the graph tile in the current CODAP implementation)? This updated design also falls a bit short (22x22), but easier to make the hit area larger here.

Reading the overhaul board, it does not fall short at all. The `Color Swatch` group is **already 24x24**, with the 22x22 painted square inset 1 px inside it. The 22x22 he refers to is the paint, not the target. So adopting the component satisfies SC 2.5.8 as drawn, with no bespoke hit area and no deviation from any design.

Requirement 16 rewritten to specify the CODAP component (24x24 target, 22x22 paint at 2 px radius, 1 px `#757575` unselected frame, 2 px `#006c8e` selected frame with a 13x9 check, 27 px pitch), and the popover becomes 129x75 at four per row. Requirement 17 updated for the seventh swatch's position, requirement 36 for the focus ring, which is now an outset ring on the swatches so it does not compete with the selection borders.

Two judgement calls made while applying this, both flagged to Michael rather than assumed: four per row is kept in preference to three, so the popover height does not change when the conditional seventh swatch appears; and the transparency checkerboard in CODAP's component is dropped, since all six StoryQ colours are opaque. The 129x75 container is derived from his component choice rather than drawn by him.

Requirement 15 specifies 18x18 px swatches on a 22 px pitch, which the revised Zeplin board confirms. SC 2.5.8 Target Size (Minimum), level AA, requires 24x24 CSS px unless an exception applies. The relevant exception is spacing: a target under 24x24 passes if a 24 px circle centred on it does not intersect the circle of any adjacent target. At an 18 px swatch on a 22 px pitch the neighbouring centres are 22 px apart, so the circles overlap and the exception does not apply. None of the other exceptions (inline, user-agent controlled, essential) fit.

The two row controls are fine: 28x28 clears 24x24 comfortably, and requirement 9's 5 px spacing does not matter once the target itself is large enough.

This is a conflict between the design as drawn and an accessibility requirement the spec itself asserts, so it needs Michael rather than a unilateral change. Suggested resolution: raise it with him. The cheapest fix that keeps the drawn look is to keep the 18x18 painted swatch but give each one a 24x24 hit area, which changes the pitch to 24 and the popover to roughly 120x72.

**Correction, 2026-08-06.** This finding originally carried a second justification, that a 2 px focus ring could not fit between swatches 4 px apart. That was wrong on two counts: only one swatch holds focus at a time in a single-select roving-focus grid, so there is no second ring to collide with, and a 2 px ring would in any case extend only 2 px into a 4 px gap. Implemented as a border swap it does not extend at all. Requirement 36 now specifies the border swap, and the focus indicator builds correctly at the drawn geometry. **This finding rests solely on SC 2.5.8 target size**, which is unaffected by the correction.

#### RESOLVED: R14. Requirement 32 offers two state mechanisms that must not be combined

**Applied 2026-08-06.** Requirement 35 (was 32) now picks the name-changes-with-state pattern and says explicitly that `aria-pressed` is not also set, with the reason. `aria-expanded` on the colour button is unchanged.

Requirement 32 says the toggle "exposes its state to assistive technology (`aria-pressed`, or an accessible name that changes with state)". These are alternatives, not a menu to pick both from, and implementing both is a common defect: a button named "Hide highlighting for count: love" that also reports `aria-pressed="true"` is announced as pressed-and-hide, which is contradictory.

Requirement 31's own example name, "Hide highlighting for count: \"love\"", is the action-changes-with-state pattern, which conflicts with `aria-pressed` being listed first as the preferred option.

Suggested resolution: pick one and say so. The name-changes-with-state pattern is the better fit here, because the icon already swaps between eye and eye-with-slash, so the button genuinely is a different action in each state rather than a persistent on/off control.

#### RESOLVED: R15. Focus management for the picker is unspecified

**Applied 2026-08-06.** Added as new requirement 37 rather than folded into requirement 14, so it sits with the other accessibility requirements where an implementer looking for keyboard behaviour will find it.

Requirement 13 covers opening and closing, requirement 18 covers arrow-key navigation within the grid, and requirement 33 covers focus indicators. Nothing says where focus goes when the picker opens, or where it returns when the picker closes. Returning focus to the colour button on close, including on Escape and on choosing a colour, is the single most commonly missed behaviour in popovers and is what makes the control usable without a mouse at all.

Suggested resolution: add to requirement 13 that opening the picker moves focus into the swatch grid onto the currently selected swatch, and that closing it by any means returns focus to the colour button.

#### RESOLVED: R16. Requirement 35's contrast guarantee is contradicted by requirement 16

**Resolved 2026-08-06 by rewording, no behaviour change.** Requirement 39 (was 35) now scopes its guarantee to the six palette colors, states that the palette is closed going forward, and says plainly that a color retained from an older document may fail AA. The stale conditional about the `more` question is gone, since that question resolved.

Behaviour is unchanged and Michael's resolved decision on the seventh swatch stands. The reasoning is proportionality: the unreadable highlight already exists in such a document, the picker does not create it, and hiding the `color` column removes the route by which it arrived. The only new exposure is that a student who has moved off the bad color can deliberately return to it.

Two alternatives were considered and not taken. Making the seventh swatch display-only would close the door while still showing the feature's current color, which matches Michael's stated rationale, but reads as a change to his decision. Migrating out-of-palette colors to the nearest of the six on restore would fix it thoroughly and would subsume part of R6, but it discards a color someone chose and reverses his decision outright. Either remains available if the retained-color case turns out to matter in practice.

Requirement 35 says every one of the six palette colours is used with `#222222` and clears WCAG AA, and adds that automatic text-colour adaptation becomes necessary only "if the `more` question resolves toward arbitrary colours". It did not. But requirement 16 keeps a seventh swatch for a stored out-of-palette colour, and that swatch is selectable, so an arbitrary colour remains reachable and re-selectable in every pre-change document.

The resolved `more` question states this outright at the end ("option C closes the door going forward only") but requirement 35 does not carry that qualification. Doc 1's `contain: "good"` is `#777777`, which is 3.55:1 against `#222222`, below the 4.5:1 minimum. So the spec currently asserts a guarantee that one of its own test documents violates.

Suggested resolution: reword requirement 35 to say that the six palette colours clear AA, and state what happens for a retained out-of-palette colour. The options already canvassed in the resolved question are to accept it, or to migrate out-of-palette colours to the nearest of the six on restore, which would also close R6's token-colour problem. Choosing migration would change a resolved decision, so it needs your call rather than mine.

#### RESOLVED: R17. The delete button's missing accessible name is out of scope but shares a row with the fix

**Recorded, not fixed, 2026-08-06.** Doug's scope constraint keeps changes inside the new feature, and this is an accessibility change to existing code, so the Out of Scope entry stands unchanged. The finding is verified and should be filed as its own bug: the row will ship with two named buttons and one anonymous one, and the anonymous one is the destructive one.

Out of Scope excludes "adding an accessible name to the existing delete button", and Background records that it has none. Confirmed in the running application on 2026-08-06: the Features tab's three delete buttons appear in the accessibility tree as bare `button` nodes with no name at all.

The consequence of shipping requirement 31 while that stands is that each row will offer a screen reader user two well-named buttons and one anonymous one, and the anonymous one is the destructive one. Adding `aria-label={`Delete ${feature.name}`}` to `feature_list_item.tsx:53` is a one-line change in the file this story already rewrites.

Suggested resolution: pull it into scope. This changes the stated Out of Scope list, so it needs your approval.

#### RESOLVED: R18. Requirement 33 should specify `:focus-visible`

**Applied 2026-08-06.** Requirement 36 (was 33) now says `:focus-visible` and gives the reason. This affects only the new controls' own styling, so it stays inside the scope constraint.

Requirement 33 says "the keyboard focus indicators specified in the design (2 px `#0957d0`) are implemented for both buttons". The Zeplin state is labelled keyboard focus, and requirements 10 and 12 list it alongside separate hover and pressed states, so the intent is clearly that the ring appears for keyboard use and not for every mouse click.

Implemented with `:focus`, a 2 px blue ring will persist on the button after any click, which reads as a bug and is what the existing plugin avoids only by having no focus styling at all. Suggested resolution: say `:focus-visible` in requirement 33.

---

### Student

#### RESOLVED: R19. After this story, the first feature a student creates is the same yellow as every extracted word

**Resolved 2026-08-06: recorded, not fixed, and deliberately left for Jie to judge in the running build.** Requirement 21 now carries the collision as a known consequence with the verification behind it, and requirement 20 requires the yellow to live in a single exported constant so that changing it later is a one-line edit.

Both fixes were unavailable within the scope constraint (one edits `getFeatureColor()`, the other changes a value Jie chose), but neither is expensive to defer. Doug confirmed on 2026-08-06 that no teachers are using the plugin yet, so the concern about `#ffe671` being baked into saved documents by requirement 22's migration does not apply: the only affected documents are the three test documents and anything Jie saves while trying it, all disposable. Judging a color collision in the running build is also a better question than an abstract one over email.

Requirement 19 makes the ngram feature and all its tokens `#ffe671`. `featureColors[0]` is also `#ffe671` (`color-utils.ts:4`), so the first ordinary feature a student creates is handed the same colour, and by R5 so is the first feature created after every document reopen.

Requirement 25 justifies keeping the colour button on the single-words row with Jie's workflow: "running single-word extraction alongside ordinary features and recoloring the whole set to tell them apart". In the common path, adding `count: "love"` and then single words, the two sets arrive indistinguishable and the student has to discover the colour button to separate them. Doc 1 is exactly this configuration and confirms `count: "love"` is `#ffe671`.

This is a design question rather than a defect in the requirements, and it touches Jie's resolved answer, so I am not proposing to change anything unilaterally. Suggested resolution: either start the ordinary-feature cycle at `featureColors[1]` once single-word extraction is present, or pick a yellow for the ngram set that is not in the six-colour cycle. The first is a one-line change and keeps the palette closed.

#### RESOLVED: R20. One click changes 682 words with no confirmation and no stated undo

**Applied 2026-08-06.** Added as new requirement 28: neither fan-out relies on CODAP's Undo, the student reverses a change with the same control that caused it, and nothing warns beforehand. Chose to state the behaviour rather than add a confirmation, because both actions are reversible in one click and a dialog on a colour swatch would be worse than the risk.

Requirements 24 and 25 fan a single click out across every extracted word. Nothing says whether that is undoable. CODAP has document-level Undo, and the fan-out writes through the plugin API as one batched request, but the plugin's own store is mutated directly and would not be restored by a CODAP undo.

For a student who clicks the colour button on the single-words row to see what it does, the difference between "reversible" and "not" is the difference between exploring and losing work. Suggested resolution: state the expected undo behaviour, even if the answer is that the student reverses it by choosing the previous colour again.

#### RESOLVED: R21. `total frequency` arrives unexplained

**No change, 2026-08-06.** Jie chose the name and said she could not think of a better one, so renaming would reopen a resolved decision for a cosmetic gain. Recorded so the decision reads as a decision rather than an oversight.

Requirement 7 makes `total frequency` a permanently visible column. Nothing in the plugin explains what it counts, and it is the only one of the three frequency columns whose name does not say what it is a frequency of. The two beside it read "frequency in positive" and "frequency in negative", which name the class; "total frequency" names an operation.

Jie chose the name and said she could not think of a better one, so this is not a proposal to rename it. Suggested resolution: none required if you are content; noting it so the decision is a decision. If a tooltip or attribute description is cheap, `domain_store.ts` already has a commented-out `description` field on the attribute definitions.

---

### Teacher

#### RESOLVED: R22. Hiding the columns changes documents a class already has, and the effect on existing graphs is unverified

**No change to the decision, and the check has now been run, 2026-08-06.** Answered from `codapv3` `origin/main` at `f3d41932d`, the source of the v3.1.0 build in use, rather than by clicking: **hiding does not break an existing graph**. `isHidden` is consulted in the display path only for the default caption attribute (`data-configuration-model.ts:180`) and to filter the axis attribute menu (`axis-or-legend-attribute-menu.tsx:49,335`); no code removes an already-assigned x, y, legend or split attribute when it is hidden. A graph plotting `highlight` therefore keeps rendering, and the only loss is that the attribute no longer appears in the axis menu to be re-picked, which is exactly what hiding is for. Recorded in the resolved hide-or-remove question above, so the rationale reads as verified rather than assumed.

Requirement 2 applies the hide to restored documents, so a teacher reopening last week's document finds two columns gone with no notice. That is the intended benefit and is not in question.

What is unverified is the case the hide-or-remove decision was partly made to protect. That decision chose to keep the attributes on the grounds that "the values are legitimately data about a feature that a student could graph or inspect". If a student has already plotted `color` or `highlight` on a graph, hiding the attribute may leave that graph blank or broken, in which case hiding buys less protection than the decision assumed.

I did not test this. It is a five-minute check in doc 1: plot `highlight`, then apply the hide by hand through the API and see whether the graph survives. Suggested resolution: run that check, and if graphs do break, record it in the resolved question so the reasoning stays honest rather than reopening the decision.

---

## Self-Review, second pass

Run 2026-08-06 against the requirements as amended by the 22 findings above, per Phase 1 Step 4's instruction to re-review after processing. Four new items, three of them consequences of the amendments rather than pre-existing.

### Senior Engineer

#### RESOLVED: R23. Option A makes `total frequency` go stale in the common case, which is worse than the problem it solved

**Resolved 2026-08-06 by reverting to option B.** Requirement 5 now writes `total frequency` at all three sites including the update path, and requirement 4's guarantee is scoped to "wherever those two are correctly maintained" with a pointer to STORYQ-85, which is what makes it unconditional once fixed. The R4 resolution above is superseded on the decision and remains accurate on the evidence.

This corrects R4. The comparison I put to Doug was wrong, and the conclusion followed the error.

Requirement 5 now writes `total frequency` only at the two creation sites, on the reasoning that the update path cannot maintain its two neighbours and so all three should move together. That reasoning only holds for datasets whose labels are not `positive` / `negative`. For datasets whose labels **are** `positive` / `negative`, the update path writes the two frequency columns perfectly well. Under requirement 5 as written, `total frequency` is not written there, so it keeps its creation-time value while its neighbours update.

Laid out properly, option A does not avoid the mismatch, it relocates it into the configuration everyone actually uses:

| Labels | Option A (current requirement 5) | Option B (write it in the update path too) |
|---|---|---|
| `positive` / `negative` | neighbours update, total frozen, **sum visibly wrong** | all three update, **always correct** |
| anything else | nothing updates, all three frozen together, consistent | total updates, neighbours frozen, sum visibly wrong |

Option A is wrong even where the underlying code is correct. Option B is wrong only where the code is already broken, which is what [STORYQ-85](https://concord-consortium.atlassian.net/browse/STORYQ-85) exists to fix. That makes B strictly better, and it is what was originally recommended before the analysis went astray.

The mismatch needs the counts to change after case creation to become visible, which needs the training data edited or the target class changed, so it is an edge case under either option. That is a reason it was missed, not a reason to leave it.

**Suggested resolution**: revert requirement 5 to write `total frequency` wherever the two frequency values are written, including the update path at `:276-291`, and scope requirement 4's guarantee to say the total equals the sum wherever those two columns are correctly maintained, noting the hardcoded-names defect and pointing at STORYQ-85. Requirement 5's explanatory material about the hardcoding stays useful; only the instruction to omit the write changes.

#### RESOLVED: R24. Requirements 5 and 6 disagree about how many write sites there are

**Applied 2026-08-06.** Requirement 5 now names four sites and calls out the restore backfill explicitly, including why it is the easy one to miss: it has no counterpart for the two existing frequency values, since those are already populated in a restored document. Cross-references requirements 6 and 8.

Requirement 5 says `total frequency` is written at "the two sites where the two existing frequency values are written correctly", naming feature-case creation and unigram-case creation. Requirement 6 then requires the values to be backfilled for cases that already exist when a document is restored, and requirement 8 lists that backfill as one of the three restore migrations.

The backfill is a third write site, on the restore path, and requirement 5 does not acknowledge it. An implementer working from requirement 5 alone would not write it. Independent of how R23 resolves.

**Suggested resolution**: have requirement 5 enumerate every write site including the restore backfill, and cross-reference requirements 6 and 8 rather than describing the set as "the two creation sites".

### Migration and Backward Compatibility

#### RESOLVED: R25. Requirement 22's token recolor has no stated condition, and could discard a deliberate choice

**Applied 2026-08-06.** Requirement 22 now gates the whole step, tokens included, on the ngram `Feature` carrying `kNoColor`, and has the tokens take the `Feature`'s repaired color rather than the literal constant. That makes it self-disabling as requirement 8 requires, states the same rule as requirement 27 in the same terms, and records that a pre-change document whose ngram feature was given a real color by hand is deliberately left alone.

Requirement 22 says restoring a document "sets the ngram feature's `kNoColor` to `#ffe671` **and sets every entry in the restored `tokenMap` to the same color**". The `Feature` half carries its trigger condition in the wording: it acts on `kNoColor`. The token half does not.

Read literally, every restore sets every token to `#ffe671`. Once requirement 26 ships, a student can recolor the whole single-word set to purple, and requirement 27 makes that choice survive re-extraction. It would not survive a save and reopen: the migration would repaint all of them yellow, silently, and requirement 28 says there is no undo to reach for.

Requirement 8 covers this in principle by requiring each migration step to be a no-op when its condition is already satisfied, but requirement 22 never states what the token step's condition is, so there is nothing for requirement 8 to bite on.

**Suggested resolution**: gate the whole step on the ngram `Feature` carrying `kNoColor`, which is the actual pre-change signature, and have the tokens take the `Feature`'s repaired color rather than the literal. That phrasing also matches requirement 27, so the same rule reads the same way in both places: tokens follow the `Feature`.

### QA Engineer

#### RESOLVED: R26. Arrow-key navigation is unspecified for a two-dimensional grid

**Applied 2026-08-06.** Requirement 19 now specifies Left/Right moving in order with wrapping and Up/Down moving between rows with clamping into the ragged second row, and records why "follow CODAP" does not answer it: CODAP's palette is eight per row over three full rows, ours is four per row over two with a conditional seventh swatch.

Requirement 19 says the picker follows CODAP's behavior, "single-select swatch grid with arrow-key navigation". CODAP's grid is eight per row; ours is four per row over two rows, and per requirement 17 the second row holds two or three swatches depending on the document.

What Left does on the first swatch of row 2, whether Up and Down move between rows, and what happens at a ragged row end are all unstated. Requirement 37 adds that focus lands on the selected swatch when the picker opens, which makes the entry point defined but not the movement.

**Suggested resolution**: state that Left and Right move through the swatches in order and wrap at the ends, and that Up and Down move between rows and clamp when the target position does not exist. Small, but it is the kind of thing that otherwise gets decided by whichever library is reached for.

---

### Cross-cutting, no change proposed

Two things were checked and found sound; they are recorded so nobody re-derives them.

- **The notification echo is not destructive.** The Technical Notes and the hide-or-remove decision both flag that `handleUpdateFeatureCase()` will see the plugin's own writes echoed back, and assert it is idempotent. `notification_manager.ts:83-87` assigns `chosen`, `highlight` and `color` unconditionally from the notification, so a partial echo would set `color` to the string `"undefined"` and clobber `highlight`. Tested on 2026-08-06 by adding a feature to doc 1, which runs the `tFeaturesToUpdate` block at `domain_store.ts:276-291`, a partial update carrying neither `highlight` nor `color`. Afterwards `contain: "good"` still rendered at `#777777` in the Features tab, so CODAP echoes the full case values and the idempotence claim holds. The remaining concern under the ngram fan-out is cost, not correctness.
- **Only one ngram feature can exist.** Requirements 24 and 25 say the fan-out writes every entry in `featureStore.tokenMap`, which would be wrong if two ngram features shared that flat map. `feature_pane.tsx:48` blocks a second one ("Sorry, you already have this feature."), so the fan-out is unambiguous. Separately, `tokenMap` and `caseIdTokenMap` hold the same `Token` object references (`feature_store.ts:204-207`), so writing through `tokenMap` is correctly seen by the per-case-ID lookup the text pane uses.

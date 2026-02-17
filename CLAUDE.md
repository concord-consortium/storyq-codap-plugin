# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StoryQ is a CODAP (Common Online Data Analysis Platform) plugin for text classification using logistic regression. It runs as an iframe-based data interactive inside CODAP, communicating via the `iframe-phone` library. Users configure text datasets, extract features (n-grams, patterns, column-based), train logistic regression models, and classify new text.

- CODAP repo: https://github.com/concord-consortium/codap
- CODAP Plugin API docs (incomplete, may have errors): https://github.com/concord-consortium/codap/wiki/CODAP-Data-Interactive-Plugin-API

## Build & Development Commands

- `npm start` — Dev server on http://localhost:3000 (via react-scripts)
- `npm run build` — Production build to `build/`
- `npm test` — Run Jest unit tests
- `npm run test:watch` — Jest in watch mode
- `npm run test:coverage` — Jest with coverage
- `npm run test:cypress` — Cypress e2e tests (headless, requires dev server running)
- `npm run test:cypress:open` — Cypress interactive runner
- `npm run test:full` — Jest + Cypress together

To run a single test file: `npx jest path/to/file.test.ts`

To test locally in CODAP: download a CODAP build from https://codap.concord.org/releases/zips/, run it on port 8080, then visit:
`http://127.0.0.1:8080/static/dg/en/cert/index.html?di=http://localhost:3000`

## Architecture

### State Management (MobX)

All application state lives in singleton MobX stores (`src/stores/`). Each store uses `makeAutoObservable()`:

- **`domain_store.ts`** — Root store coordinating all domain stores; manages CODAP dataset creation and synchronization for features
- **`target_store.ts`** — Target text dataset selection (which CODAP dataset, text column, class column)
- **`feature_store.ts`** — Feature extraction/management (n-grams, patterns, column features); maintains `tokenMap` for unigram tracking
- **`training_store.ts`** — Training results and model metadata
- **`testing_store.ts`** — Classification/prediction state
- **`text_store.ts`** — Text display tokens and highlighting
- **`ui_store.ts`** — UI state (panel visibility, selected tab)

Stores are exported as singletons (e.g., `export const targetStore = new TargetStore()`). Components import these directly.

### Component Structure

The root component (`src/components/storyq.tsx`) renders a `TabPanel` with four sequential workflow tabs: **Setup → Features → Training → Testing**. Each tab is gated—it's enabled only when prerequisites from prior tabs are met (controlled by `domainStore.*CanBeEnabled()` methods).

A collapsible `TextPane` displays alongside the main panel, showing text with feature highlighting.

### Managers (`src/managers/`)

Business logic coordinators that orchestrate operations between stores and CODAP:
- `testing_manager.ts` — Runs classification using trained models
- `training_manager.ts` — Orchestrates model training
- `model_manager.ts` — Model lifecycle management
- `text_feedback_manager.ts` — Text display feedback coordination
- `notification_manager.ts` — CODAP notification handling

### CODAP Integration (`src/lib/`)

- **`CodapInterface.ts`** — Low-level CODAP plugin API wrapper (iframe-phone based message passing)
- **`codap-helper.ts`** — Higher-level utilities for common CODAP operations (dataset creation, case retrieval, table management)

Plugin state persistence uses CODAP's `interactiveState` API—the root component registers `get`/`update` handlers that serialize/deserialize stores via `asJSON()`/`fromJSON()` methods.

### ML Pipeline (`src/lib/`)

- **`one_hot.ts`** — Text tokenization (`wordTokenizer`) and one-hot encoding; handles unigrams, stop words, punctuation filtering
- **`jsregression.ts`** — Logistic regression implementation
- **`logit_prediction.ts`** — Prediction engine using trained models
- **`stop_words.ts`** / **`emoticons.ts`** — NLP preprocessing data

### Feature Types

Features in `store_types_and_constants.ts` can be: `unigram` (word n-grams), `constructed` (regex/pattern search), or `column` (from CODAP dataset columns). Each feature tracks positive/negative class frequencies and case usages.

## Testing

Unit tests live alongside source files as `*.test.ts`. Test files exist in:
- `src/stores/store_types_and_constants.test.ts`
- `src/stores/text_store.test.ts`
- `src/utilities/utilities.test.ts`
- `src/lib/one_hot.test.ts`

Cypress e2e tests are in `cypress/e2e/` with page objects in `cypress/support/elements/`.

## Tech Stack

- React 18, TypeScript 4.9, MobX 6
- Build: react-scripts (CRA) + Webpack 5
- Styling: SASS/SCSS with CSS modules
- Testing: Jest 29 + @testing-library/react + Cypress 13
- CI: GitHub Actions → S3 deployment

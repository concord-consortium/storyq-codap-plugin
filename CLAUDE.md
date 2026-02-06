# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StoryQ is a CODAP (Common Online Data Analysis Platform) plugin for interactive text classification using machine learning. Users select target data, engineer text features (unigrams, n-grams, column values), train logistic regression models, and classify new text — all within CODAP's data environment.

## Common Commands

- `npm start` — Dev server on port 3000 (via react-scripts)
- `npm run build` — Production build
- `npm test` — Jest tests (all, non-watch)
- `npm run test:watch` — Jest in watch mode
- `npm run test:coverage` — Jest with coverage report
- `npm run test:cypress` — Cypress e2e tests (headless)
- `npm run test:cypress:open` — Cypress interactive runner
- `npm run test:full` — All Jest + Cypress tests

Run a single Jest test: `npx jest path/to/file.test.ts`

To test in CODAP locally: download a CODAP release zip, run it on port 8080, then open:
`http://127.0.0.1:8080/static/dg/en/cert/index.html?di=http://localhost:3000`

## Architecture

### Tech Stack
- React 18 with TypeScript 4.9, built on Create React App (not ejected)
- MobX 6 for state management (mobx-react `observer` HOC)
- CODAP communication via `iframe-phone` library
- Custom ML implementations: logistic regression (`jsregression.ts`) and Naive Bayes (`NaiveBayesClassifier.js`)
- Jest + Cypress for testing; SASS/SCSS for styles

### Key Directories
- `src/components/` — React components. `storyq.tsx` is the root. Tab-based UI: Target, Features, Training, Testing panels + collapsible TextPane
- `src/stores/` — MobX stores (singleton pattern). `domain_store.ts` aggregates sub-stores
- `src/managers/` — Business logic: model training (`model_manager`), text feedback/highlighting (`text_feedback_manager`), test classification (`testing_manager`), CODAP notifications (`notification_manager`)
- `src/lib/` — CODAP API wrapper (`CodapInterface.ts`, `codap-helper.ts`), ML algorithms, text processing (one-hot encoding, stop words, emoticons)
- `src/models/` — Data model classes (e.g., `ai-model.ts`)
- `src/types/` — TypeScript type definitions for CODAP API

### State Management Pattern
Each MobX store follows this pattern:
- Class with `makeAutoObservable(this)` in constructor
- Exported as singleton instance (e.g., `export const featureStore = new FeatureStore()`)
- `asJSON()` / `fromJSON()` methods for serialization (used for CODAP interactive state persistence)
- Stores: `targetStore`, `featureStore`, `trainingStore`, `testingStore`, `textStore`, `uiStore`, `domainStore` (aggregator)

### Component Pattern
- Class components wrapped with `observer()` from mobx-react
- Components read directly from store singletons (no prop drilling for state)

### CODAP Integration
- `CodapInterface.ts` wraps the CODAP Data Interactive Plugin API using `iframe-phone`
- Plugin registers with specific name/version/dimensions on init
- Creates "Features" and "Testing" datasets in CODAP with collections and attributes
- Full state save/restore through CODAP's interactive state mechanism (`getPluginStore`/`restorePluginFromStore`)
- Handles CODAP notifications (e.g., `createCases`) to react to data changes

### ML Pipeline
1. **Target**: User selects a text column and target categories from CODAP data
2. **Features**: User defines feature extractors (unigrams, n-grams, column values, constructed features) → one-hot encoded
3. **Training**: Logistic regression trains on feature vectors from labeled data
4. **Testing**: Trained model classifies new text; results written back to CODAP dataset

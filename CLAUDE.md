# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Covista / R2C POC** — An AI-powered student success platform for enrollment advisors. It ingests student data from Salesforce/BigQuery, generates risk assessments via Vertex AI (Gemini), and surfaces recommended actions in a real-time Angular dashboard.

## Commands

### Frontend (root directory)
```bash
npm start          # Dev server at localhost:4200
npm run build      # Production build → dist/r2c-poc
npm test           # Karma/Jasmine unit tests
npm run watch      # Development build with watch mode
```

### Cloud Functions (`functions/`)
```bash
cd functions
npm run build      # TypeScript compilation (tsc)
npm run serve      # Build + start Firebase emulators locally
npm run deploy     # Deploy functions to Firebase
npm run logs       # Stream Firebase function logs
```

### Python Agent (`python-agent/`)
```bash
cd python-agent
python main.py     # Local Flask dev server
# Production runs via Docker/Cloud Run with Gunicorn
```

### Firebase CLI
```bash
firebase use algoworks-dev          # Switch to internal backend project
firebase use dev-wu-agenticai-app-proj  # Switch to client-facing project
firebase deploy --only hosting      # Deploy frontend only
firebase emulators:start            # Full local emulator suite
```

## Architecture

### System Overview

```
Angular SPA (Frontend)
    ↓ reads/writes
Firestore (studentSnapshot collection)
    ↑ writes AI results
Firebase Cloud Functions (Node.js/TypeScript)
    ↓ HTTP call
Python Agent on Cloud Run (Flask)
    ↓ inference
Vertex AI Gemini 2.5-flash
    ↑ source data
BigQuery ← synced from Salesforce
```

### Two Firebase Projects

Defined in `.firebaserc` and configured as two separate `initializeApp()` instances in `src/app/app.config.ts`:
- **`algoworks-dev`** — internal backend (Cloud Functions, Firestore writes)
- **`dev-wu-agenticai-app-proj`** — client-facing app (Auth, Firestore reads, Hosting)

The Angular app initializes both via `provideFirebaseApp()` — the secondary app is used for certain cross-project reads.

### Frontend (`src/app/`)

Standalone Angular 21 components with no NgModules. Firebase is injected via `@angular/fire` DI tokens. Key data flow:

- `StudentService` → Firestore CRUD for `studentSnapshot` collection
- `AuthService` + `AuthGuard` → Firebase Auth gate on all routes
- `OpportunityDetailComponent` → triggers insight generation via Cloud Functions HTTP callable

### Cloud Functions (`functions/src/`)

- `index.ts` — exports two functions:
  - `generateStudentInsights` — HTTP callable that invokes the Python agent and writes results back to Firestore
  - `syncAiInsightsOnUpdate` — Firestore trigger that re-runs insights when student data changes
- `sync-from-bq.ts` — BigQuery → Firestore sync pipeline
- `sync-simulator.ts` — Injects synthetic test data for demo/QA purposes

### Python Agent (`python-agent/`)

Flask app deployed to Cloud Run at `https://python-data-agent-1033582308599.us-central1.run.app`. Single endpoint `/generate-insights` that:
1. Reads student context from Firestore + BigQuery
2. Calls Vertex AI Gemini with a structured prompt
3. Returns `AiInsights` JSON (risk levels, recommended actions, email/SMS drafts)

### Key Data Models (`src/app/models/`)

- `StudentSnapshot` — root Firestore document; holds identity, requirements status, and nested `aiInsights`
- `AiInsights` — AI-generated output: `readinessRisk`, `engagementRisk`, `recommendedActions[]`, `emailDraft`, `smsDraft`
- `StudentRequirements` — checklist (FAFSA, transcripts, orientation, assignments) stored as Firestore subcollection, aggregated into root doc for AI ingestion

### Checklist Aggregation Pattern

Student requirements live in a Firestore **subcollection** but must be flattened into the root `studentSnapshot` document before being sent to the AI agent. The aggregation pipeline in Cloud Functions handles this mapping — do not assume the root doc is always up to date without triggering a sync.

## Environment & Configuration

- Angular environment files are in `src/environments/` — Firebase API keys are stored here (not in `.env` files)
- `users.json` at the root contains hardcoded test users for local development
- `seed-students.json` and `seed_bq_data.py` are used to populate test data into BigQuery/Firestore
- The `End-To-End_Simulator.md` documents the full simulator workflow for loading demo data

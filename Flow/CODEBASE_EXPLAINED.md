# CoVista — Codebase Explained

> **CoVista** is an AI-powered **Enrollment Management Platform** built for universities (specifically Walden University in this demo).  
> Enrollment Specialists use it to monitor students, identify at-risk learners, and send AI-generated personalized outreach.

---

## Table of Contents

1. [What It Does (30-second summary)](#1-what-it-does)
2. [Technology Stack](#2-technology-stack)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Data Flow — End to End](#4-data-flow--end-to-end)
5. [Frontend — Angular App](#5-frontend--angular-app)
   - [Routing Map](#routing-map)
   - [Component Tree](#component-tree)
   - [State & Data Management](#state--data-management)
6. [Backend — Firebase Cloud Functions](#6-backend--firebase-cloud-functions)
7. [AI Pipeline — Python Cloud Run Agent](#7-ai-pipeline--python-cloud-run-agent)
8. [Database Schema (Firestore)](#8-database-schema-firestore)
9. [BigQuery Data Warehouse](#9-bigquery-data-warehouse)
10. [Admin Simulator Tool](#10-admin-simulator-tool)
11. [Authentication Flow](#11-authentication-flow)
12. [Key Data Models](#12-key-data-models)

---

## 1. What It Does

An **Enrollment Specialist (ES)** logs in and sees a dashboard of all students enrolled in their pipeline. Each student record is enriched by an AI agent that produces:

- **Risk scores** (Readiness Risk, Engagement Risk) with trend direction
- **Next Best Actions** — specific tasks the ES should take (e.g., "Student hasn't logged into portal yet — here's an email script")
- **AI-drafted Email & SMS** outreach messages personalized to each student's situation

The whole system updates in **real-time** — Firestore pushes changes to the browser the moment data changes anywhere.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | Angular 21 (standalone components, signals) |
| **Auth** | Firebase Authentication (Google OAuth + Magic Link email) |
| **Real-time DB** | Cloud Firestore |
| **Storage** | Firebase Storage (file uploads / screenshots) |
| **Backend Functions** | Firebase Cloud Functions v2 (TypeScript) |
| **Data Warehouse** | Google BigQuery (`covista_demo` dataset) |
| **AI Engine** | Python Flask microservice on **Cloud Run** |
| **AI Model** | Google Vertex AI — `gemini-2.5-flash` |
| **GCP Project** | `dev-wu-agenticai-app-proj` |

---

## 3. High-Level Architecture

```mermaid
graph TB
    subgraph Client["🖥️ Browser (Angular 21)"]
        UI["Angular App\n(Standalone Components)"]
    end

    subgraph Firebase["☁️ Firebase / GCP"]
        Auth["Firebase Auth\n(Google OAuth / Magic Link)"]
        Firestore["Cloud Firestore\nsalesforce_opportunities"]
        Storage["Firebase Storage\n(Uploads / Screenshots)"]
        CF["Cloud Functions v2\n(TypeScript)"]
    end

    subgraph DataLayer["📊 Data Layer"]
        BQ["Google BigQuery\ncovista_demo dataset"]
    end

    subgraph AILayer["🤖 AI Layer"]
        CloudRun["Python Flask\n(Cloud Run)"]
        VertexAI["Vertex AI\nGemini 2.5 Flash"]
    end

    UI -->|"Realtime onSnapshot"| Firestore
    UI -->|"Google Sign-In / Magic Link"| Auth
    UI -->|"httpsCallable"| CF
    CF -->|"Admin SDK read/write"| Firestore
    CF -->|"SQL Queries"| BQ
    CF -->|"POST /generate-insights"| CloudRun
    CloudRun -->|"generateContent()"| VertexAI
    CloudRun -->|"Direct write-back"| Firestore
    UI -->|"File upload"| Storage
```

---

## 4. Data Flow — End to End

```mermaid
sequenceDiagram
    participant BQ as BigQuery
    participant CF as Cloud Functions
    participant FS as Firestore
    participant UI as Angular UI
    participant PY as Python Agent (Cloud Run)
    participant AI as Vertex AI (Gemini)

    Note over BQ,FS: 📥 STEP 1 — Data Ingestion
    CF->>BQ: Query student_core, student_courses, student_contingencies
    BQ-->>CF: Raw student rows
    CF->>FS: Batch-write to salesforce_opportunities

    Note over FS,UI: 📡 STEP 2 — Real-time Subscription
    UI->>FS: onSnapshot(salesforce_opportunities)
    FS-->>UI: Live student data stream

    Note over UI,AI: 🧠 STEP 3 — AI Insight Generation
    UI->>CF: httpsCallable("generateStudentInsights")
    CF->>PY: POST /generate-insights {studentUid, dataContext}

    par Phase 1 — Synchronous (unblocks UI fast)
        PY->>AI: Prompt: risk profile + next best actions
        AI-->>PY: JSON {readinessRisk, engagementRisk, nextBestActions}
        PY-->>CF: Core payload (immediate return)
        CF->>FS: Merge aiInsights into student doc
        FS-->>UI: 🔴 Live update — risk panel refreshes
    and Phase 2 — Background thread (heavy comms)
        PY->>AI: Prompt: email/SMS drafts
        AI-->>PY: JSON {emailDraft, smsDraft}
        PY->>FS: Update aiInsights.emailDraft + smsDraft
        FS-->>UI: 🔵 Live update — comms section refreshes
    end
```

---

## 5. Frontend — Angular App

### Routing Map

```mermaid
graph LR
    Root["/"] --> Layout["LayoutComponent\n(Auth Guarded)"]
    Root --> Login["/login\nLoginComponent"]
    Root --> Upload["/upload\nUploadComponent"]
    Root --> Sim["/sf-simulator\nAdminSimulatorComponent"]

    Layout --> Dashboard["/dashboard\nDashboardComponent"]
    Layout --> Detail["/opportunity/:id\nOpportunityDetailComponent"]
    Layout --> Feedback["/feedback\nFeedbackSummaryComponent"]

    style Login fill:#f9f,stroke:#333
    style Upload fill:#f9f,stroke:#333
    style Sim fill:#f9f,stroke:#333
    style Layout fill:#bbf,stroke:#333
    style Dashboard fill:#bfb,stroke:#333
    style Detail fill:#bfb,stroke:#333
    style Feedback fill:#bfb,stroke:#333
```

> Pink = public routes. Blue = auth shell. Green = protected pages.

---

### Component Tree

```mermaid
graph TD
    App["AppComponent\n(root)"]
    App --> Layout["LayoutComponent\n(nav + shell)"]
    App --> Login["LoginComponent"]
    App --> Upload["UploadComponent"]
    App --> Sim["AdminSimulatorComponent"]

    Layout --> Dashboard["DashboardComponent\n📋 Student list with risk filters"]
    Layout --> Detail["OpportunityDetailComponent\n👤 Full student profile + AI panel"]
    Layout --> Feedback["FeedbackSummaryComponent\n📝 ES feedback log"]

    Dashboard -->|"uses"| SS["StudentService\n(global signal store)"]
    Detail -->|"uses"| SS
    SS -->|"reads"| FS["Firestore\nsalesforce_opportunities"]
    Detail -->|"calls"| CF["Cloud Functions\ngenerateStudentInsights"]
```

---

### State & Data Management

The app uses **Angular Signals** (not NgRx / RxJS subjects):

```mermaid
graph LR
    FS["Firestore\nonSnapshot"] -->|"zone.run()"| SigStudents["students signal\n(StudentService)"]
    SigStudents -->|"computed()"| FilteredList["filtered students\n(DashboardComponent)"]
    SigStudents -->|"computed()"| StudentDetail["student detail\n(OpportunityDetailComponent)"]

    UI["User clicks filter"] -->|"filterMode.set()"| FilterMode["filterMode signal"]
    FilterMode -->|"recomputes"| FilteredList
```

| Signal | In | Purpose |
|---|---|---|
| `students` | `StudentService` | Live array of all student records |
| `currentUser` | `AuthService` | Currently logged-in Firebase user |
| `filterMode` | `DashboardComponent` | 'All' / 'High Risk' / 'Action Required' |
| `editingId` | `DashboardComponent` | Which row is in inline edit mode |
| `student` (computed) | `OpportunityDetailComponent` | Single student derived from route param |

---

## 6. Backend — Firebase Cloud Functions

Located in `functions/src/index.ts`. Three exported functions:

```mermaid
graph TD
    subgraph CF["Firebase Cloud Functions (TypeScript)"]
        F1["generateStudentInsights\n(onCall)\nTrigger: Angular button click\n→ Calls Python Cloud Run agent\n→ Writes aiInsights to Firestore"]
        F2["syncAiInsightsOnUpdate\n(onDocumentUpdated)\nTrigger: Any Firestore write\n→ Auto-regenerates AI on data change\n→ Loop-guard: skips if aiInsights changed"]
        F3["manualSyncBQtoFirestore\n(onCall)\nTrigger: Manual/Admin call\n→ Pulls all students from BigQuery\n→ Batch-writes to Firestore"]
        F4["updateBigQueryMockData\n(onCall)\nTrigger: AdminSimulator UI\n→ Runs UPDATE SQL on BQ tables\n→ Used for demo/testing only"]
    end
```

### Function Call Chain

```
Angular UI
  └─► generateStudentInsights (CF)
        └─► POST /generate-insights (Python Cloud Run)
              ├─► Phase 1: Vertex AI → core payload → return immediately
              │     └─► CF writes aiInsights to Firestore
              └─► Phase 2 (background thread): Vertex AI → drafts → write to Firestore
```

---

## 7. AI Pipeline — Python Cloud Run Agent

File: `python-agent/main.py` | Deployed to Cloud Run as `python-data-agent`

```mermaid
graph TD
    subgraph PY["Python Flask (Cloud Run)"]
        EP["POST /generate-insights"]
        G1["generate_core_insights()\nPrompt: Student Success Agent\n→ readinessRisk\n→ engagementRisk\n→ nextBestActions\n→ metrics"]
        G2["generate_communications()\nPrompt: Communications Agent\n→ emailDraft (body + bullets)\n→ smsDraft (<140 chars)"]
        T["Background Thread\nthreading.Thread"]
        FS2["Firestore Direct Write\naiInsights.emailDraft\naiInsights.smsDraft"]
    end

    EP --> G1
    G1 -->|"Synchronous\nReturn fast"| Resp["HTTP Response\n(core payload + agentTrace)"]
    EP --> T
    T --> G2
    G2 --> FS2

    style G1 fill:#bfb
    style G2 fill:#fbf
    style T fill:#ffc
```

**Two-phase design** prevents the UI from hanging while waiting for the slower email/SMS generation:

| Phase | What | Timing | Why |
|---|---|---|---|
| Phase 1 | Risk scores + next best actions | ~2–4 seconds | Blocks HTTP response — user sees risk panel refresh |
| Phase 2 | Email & SMS drafts | ~4–8 seconds | Detached thread — Firestore push updates UI when ready |

**AI Model:** `gemini-2.5-flash` — low-latency, instruction-following, JSON mode enabled (`response_mime_type: application/json`)

---

## 8. Database Schema (Firestore)

### Collections

```
Firestore
├── salesforce_opportunities/          ← Main student collection
│   └── {studentId}/                   ← Doc ID = student UID (e.g. A00302996)
│       ├── name, email, phone
│       ├── program, institution
│       ├── programStartDate, reserveDate
│       ├── requirements {}            ← Checklist booleans
│       ├── courseActivity []          ← Course login/post data
│       ├── communications []          ← Email/SMS log
│       ├── notes []                   ← ES notes
│       ├── aiInsights {}              ← AI-generated payload
│       │   ├── readinessRisk { level, trendDirection }
│       │   ├── engagementRisk { level, trendDirection }
│       │   ├── nextBestActions []
│       │   ├── emailDraft {}
│       │   ├── smsDraft
│       │   ├── agentTrace []
│       │   └── generatedAt
│       └── riskIndicator, actionRequired
│
├── logins/                            ← Login event audit log
│   └── {docId}/
│       └── uid, email, displayName, timestamp
│
└── feedback_submissions/              ← ES feedback entries
    └── {docId}/
        └── text, timestamp, author
```

---

## 9. BigQuery Data Warehouse

Dataset: `dev-wu-agenticai-app-proj.covista_demo`

```mermaid
erDiagram
    student_core {
        string student_id PK
        string full_name
        string program_code
        string institution_code
        string enrollment_status
        date program_start_date
        date reserve_date
        string funding_plan_status
        timestamp wwow_orientation_started_at
        timestamp etl_updated_at
    }

    student_courses {
        string student_id FK
        string course_id
        bool is_accredited
        string course_registration_status
        timestamp first_login_at
        timestamp first_discussion_post_at
        timestamp etl_updated_at
    }

    student_contingencies {
        string student_id FK
        string contingency_id
        string institution_name
        string contingency_type
        string contingency_status
        timestamp etl_updated_at
    }

    engagement_rules {
        string rule_id PK
        string rule_name
        string condition
        string action
    }

    student_core ||--o{ student_courses : "has"
    student_core ||--o{ student_contingencies : "has"
```

BigQuery is the **source of truth**. Firestore is the **live operational cache** synced from it.

---

## 10. Admin Simulator Tool

Route: `/sf-simulator` | File: `admin-simulator.component.ts`

This is an **internal dev/demo tool** that simulates Salesforce events without needing a real CRM connection. It lets you:

```mermaid
graph LR
    Admin["Admin / Developer"] --> Sim["AdminSimulatorComponent"]
    Sim -->|"updateBigQueryMockData (CF)"| BQ["BigQuery\nUPDATE SQL"]
    BQ -->|"data changed"| Sync["manualSyncBQtoFirestore (CF)"]
    Sync --> FS["Firestore"]
    FS -->|"onSnapshot"| UI["Dashboard refreshes"]
```

**What you can simulate:**
- Set program start date / reserve date / census date
- Toggle FAFSA submission, funding plan, WWOW orientation
- Mark transcripts as cleared
- Log accredited/non-accredited course login events
- Set discussion post dates
- Toggle checklist items (portal login, FAFSA, registration, etc.)

This allows demos of the full AI pipeline without real Salesforce data.

---

## 11. Authentication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Angular (LoginComponent)
    participant FA as Firebase Auth
    participant FS as Firestore
    participant G as Google OAuth

    alt Google Sign-In
        U->>UI: Click "Sign in with Google"
        UI->>FA: signInWithPopup(GoogleAuthProvider)
        FA->>G: OAuth redirect
        G-->>FA: id_token
        FA-->>UI: UserCredential
        UI->>FS: addDoc("logins", {uid, email, timestamp})
        UI->>UI: router.navigate("/dashboard")
    else Magic Link Email
        U->>UI: Enter email address
        UI->>FA: sendSignInLinkToEmail()
        FA-->>U: Email with sign-in link
        U->>UI: Click link (returns to /login with token)
        UI->>FA: signInWithEmailLink()
        FA-->>UI: UserCredential
        UI->>UI: router.navigate("/dashboard")
    end

    Note over UI: authGuard checks authState()\nbefore allowing access to /dashboard
```

---

## 12. Key Data Models

### Student (runtime model, `src/app/models/student.ts`)

```
Student
├── id / studentUid / name / email / phone
├── program / institution / programStartDate / reserveDate
├── timeUntilClassStartDays          ← computed at load time
├── timeSinceReserveDays             ← computed at load time
├── riskIndicator                    ← 'High' | 'Medium' | 'Low'
├── actionRequired                   ← boolean flag
├── requirements: StudentRequirements
│   ├── fafsaSubmitted
│   ├── fundingPlan
│   ├── courseRegistration
│   ├── wwowOrientationStarted
│   ├── officialTranscriptsReceived
│   ├── nursingLicenseReceived
│   ├── orientationStarted
│   ├── firstAssignmentSubmitted
│   └── assignmentByCensusDay
├── courseActivity[]                 ← courses with login/post dates
├── communications[]                 ← email/SMS send+open+click logs
├── notes[]                          ← ES-entered notes
└── aiInsights: AiInsights
    ├── overviewSummary
    ├── readinessRisk { level, trendDirection, trendNote }
    ├── engagementRisk { level, trendDirection, trendNote }
    ├── metrics { timeSinceReserve, timeToProgramStart, timeToCensus }
    ├── nextBestActions[]            ← AI-generated ES action items
    ├── emailDraft { bodyText, bullets }
    ├── smsDraft
    └── agentTrace[]                 ← which AI agents ran + status
```

### Firestore Write Contract (`SalesforceOpportunityProfile`, `salesforce-opportunity.ts`)

This is the **ingestion-side model** used by the Admin Simulator and Cloud Functions when writing into Firestore. It mirrors the BigQuery schema and maps to the `Student` model after hydration in `StudentService`.

---

## Summary — How Everything Connects

```mermaid
graph TB
    subgraph Source["Data Sources"]
        SF["Salesforce CRM\n(future integration)"]
        BQ["BigQuery\ncovista_demo"]
        AdminSim["Admin Simulator\n(demo tool)"]
    end

    subgraph Sync["Sync Layer (Cloud Functions)"]
        SyncFn["manualSyncBQtoFirestore\nupdateBigQueryMockData"]
    end

    subgraph DB["Operational DB"]
        FS["Firestore\nsalesforce_opportunities"]
    end

    subgraph AI["AI Layer (Cloud Run)"]
        PY["Python Flask\ngemini-2.5-flash"]
    end

    subgraph App["Angular App (Browser)"]
        SS["StudentService\n(signals)"]
        DASH["Dashboard\n(filter + list)"]
        OD["Opportunity Detail\n(full profile + AI)"]
        FB["Feedback Summary"]
    end

    BQ -->|"SQL"| SyncFn
    AdminSim -->|"CF call"| SyncFn
    SyncFn -->|"batch write"| FS
    FS -->|"onSnapshot"| SS
    SS --> DASH
    SS --> OD
    OD -->|"generateStudentInsights CF"| PY
    PY -->|"Vertex AI"| PY
    PY -->|"direct write"| FS
    FS -->|"realtime push"| OD
```

The complete cycle: **Data enters from BigQuery → synced to Firestore → Angular renders in real-time → AI is triggered on demand → results written back → UI updates without a page refresh.**

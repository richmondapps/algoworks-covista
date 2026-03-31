# Covista AI: Flow Diagrams
### Date: 2026-03-31

---

## Diagram 1 — Full System Pipeline (Left to Right)

```mermaid
graph LR
    BQ_SRC["Client BigQuery\nEnterprise Data Source"]
    PUBSUB["Pub/Sub Topic\nEvent Stream"]
    CF["Cloud Functions\nDataflow Pipeline"]
    DC["Transform +\nData Contract"]
    FS["Firestore\nOperational DB"]
    ANG["Angular App\nES UI via WebSockets"]
    BQ_AN["BigQuery\nAnalytics"]
    DASH["Reporting /\nDashboards"]
    VERTEX["Vertex AI /\nGemini Assistant"]

    BQ_SRC --> PUBSUB
    PUBSUB --> CF
    CF --> DC
    DC --> FS
    FS --> ANG
    FS --> BQ_AN
    BQ_AN --> DASH
    ANG -- "User-Initiated\nRequests" --> VERTEX
    VERTEX -- "AI Insights\nResponse" --> ANG
```

---

## Diagram 2 — BigQuery to Firestore: What DE Does

```mermaid
graph TD
    SRC1["Banner\nSIS"]
    SRC2["Salesforce\nCRM"]
    SRC3["Canvas\nLMS"]
    SRC4["Student\nPortal"]

    BQ_P["r2c_student_profile\nBigQuery Table"]
    BQ_L["r2c_student_activity_log\nBigQuery Table"]

    PUBSUB["Pub/Sub\nEvent Stream"]

    CF["Cloud Function\nTransform Pipeline"]

    FS_P["Firestore\nstudents collection\nOne doc per student"]
    FS_L["Firestore\nactivity_log collection\nOne doc per event"]

    SRC1 --> BQ_P
    SRC2 --> BQ_P
    SRC1 --> BQ_L
    SRC2 --> BQ_L
    SRC3 --> BQ_L
    SRC4 --> BQ_L

    BQ_P --> PUBSUB
    BQ_L --> PUBSUB
    PUBSUB --> CF
    CF --> FS_P
    CF --> FS_L
```

---

## Diagram 3 — Firestore Document Structure (Current State)

```mermaid
graph TD
    ROOT["students/\ncollection"]

    DOC["studentId\ndocument"]

    CORE["Core Fields\nid, name, email, phone\nprogramDesc, termDesc\nenrollmentSpecialist\nprogramStartDate, reserveDate, censusDate"]

    COMPUTED["Pre-Computed Fields\ntimeSinceReserveDays\ntimeUntilClassStartDays\nengagementLevel\nriskIndicator\nactionRequired"]

    CHECK["checklist[]\nid, name, status, dueDate\n(3 hardcoded items)"]

    ACTIONS["recommendedActions[]\ntitle, priority, type"]

    STATS["stats{}\nemailOpens, smsClicks\nbestMethod, lastSentAt"]

    AI["aiInsights{}\ngenerated on demand\noverview, riskSignals\nnextBestActions\nemailDraft, smsDraft"]

    NOTES["notes[]\ntext, timestamp, author"]

    COMMS["communications[]\ntype, status, body\ntimestamp, agentName"]

    ROOT --> DOC
    DOC --> CORE
    DOC --> COMPUTED
    DOC --> CHECK
    DOC --> ACTIONS
    DOC --> STATS
    DOC --> AI
    DOC --> NOTES
    DOC --> COMMS
```

---

## Diagram 4 — Firestore Document Structure (V7 Target)

```mermaid
graph TD
    COL1["students/\ncollection"]
    COL2["activity_log/\ncollection"]

    SDOC["studentId\ndocument"]
    SCORE["Core Profile Only\nid, name, email, phone\nprogramDesc, termDesc\nenrollmentSpecialist\nprogramStartDate, reserveDate\ncensusDate, fundingType"]

    EVDOC["log_id UUID\ndocument\none per event"]
    EVFIELDS["Event Fields\nstudent_id, term_code\nactivity_category\nactivity_name\nactivity_datetime\ncommunication_type\nactor, source_system\ncourse_identification\ncourse_level, other_info"]

    COL1 --> SDOC
    SDOC --> SCORE

    COL2 --> EVDOC
    EVDOC --> EVFIELDS
```

---

## Diagram 5 — Activity Event Categories (V7)

```mermaid
graph TD
    LOG["r2c_student_activity_log\nactivity_category"]

    SE["student_event"]
    AT["advisor_task"]
    CO["contingency"]
    SYS["system_event"]

    SE1["initial_portal_login"]
    SE2["fafsa_submission"]
    SE3["alternate_funding"]
    SE4["first_course_registration"]
    SE5["wwow_login"]
    SE6["logged_into_course"]
    SE7["discussion_board_submission"]
    SE8["engagement_activity"]

    AT1["advisor_outreach\nphone_call / email / text\nchat / file_review"]

    CO1["contingency\nIAR record where\nCONT. checkbox = TRUE"]

    SY1["reserved"]
    SY2["wwow_access_granted"]

    LOG --> SE
    LOG --> AT
    LOG --> CO
    LOG --> SYS

    SE --> SE1
    SE --> SE2
    SE --> SE3
    SE --> SE4
    SE --> SE5
    SE --> SE6
    SE --> SE7
    SE --> SE8

    AT --> AT1

    CO --> CO1

    SYS --> SY1
    SYS --> SY2
```

---

## Diagram 6 — Checklist Derivation Flow (V7 Target)

```mermaid
graph TD
    ALOG["activity_log\nfor student_id"]

    Q1{"initial_portal_login\nevent exists?"}
    Q2{"fafsa_submission\nevent exists?\nor alternate_funding?"}
    Q3{"first_course_registration\nevent exists?"}
    Q4{"wwow_login\nevent exists?"}
    Q5{"contingency rows\nwith open state?"}
    Q6{"logged_into_course\nevent exists?"}
    Q7{"discussion_board_submission\nevent post census_date?"}

    C1["Portal Login\nComplete"]
    C2["FAFSA / Funding\nComplete"]
    C3["Course Registration\nComplete"]
    C4["WWOW Login\nComplete"]
    C5["Contingencies\nCleared"]
    C6["Course Login\nComplete"]
    C7["Day 10 Participation\nComplete"]

    X1["Portal Login\nIncomplete"]
    X2["FAFSA\nIncomplete"]
    X3["Registration\nIncomplete"]
    X4["WWOW\nIncomplete"]
    X5["Open Contingencies\nRemaining"]
    X6["Course Login\nIncomplete"]
    X7["Participation\nIncomplete"]

    ALOG --> Q1
    ALOG --> Q2
    ALOG --> Q3
    ALOG --> Q4
    ALOG --> Q5
    ALOG --> Q6
    ALOG --> Q7

    Q1 -- "Yes" --> C1
    Q1 -- "No" --> X1
    Q2 -- "Yes" --> C2
    Q2 -- "No" --> X2
    Q3 -- "Yes" --> C3
    Q3 -- "No" --> X3
    Q4 -- "Yes" --> C4
    Q4 -- "No" --> X4
    Q5 -- "All cleared" --> C5
    Q5 -- "Open rows exist" --> X5
    Q6 -- "Yes" --> C6
    Q6 -- "No" --> X6
    Q7 -- "Yes" --> C7
    Q7 -- "No" --> X7
```

---

## Diagram 7 — Risk Score Computation (App Layer)

```mermaid
graph TD
    IN["Student Profile +\nActivity Log Events"]

    DAYS_RESERVE["time_since_reserve_days\n(derived from reserveDate)"]
    DAYS_START["time_to_program_start_days\n(derived from programStartDate)"]
    LAST_ACT["last activity_datetime\nfor this student_id"]

    ENG{"Engagement Risk\nWeeks to start?"}

    ENG_LT4["Less than 4 weeks\nto start"]
    ENG_GT4["4 or more weeks\nto start"]

    ER1["Low: activity < 3 days ago\nMedium: > 3 days\nHigh: > 7 days"]
    ER2["Low: activity < 5 days ago\nMedium: > 5 days\nHigh: > 10 days"]

    READ["Readiness Risk\nPer checklist item"]
    RL["Low"]
    RM["Medium"]
    RH["High"]
    RHP["Happy Path"]

    OVERALL["Overall Risk Indicator\nworst of Engagement + Readiness"]

    IN --> DAYS_RESERVE
    IN --> DAYS_START
    IN --> LAST_ACT

    LAST_ACT --> ENG
    DAYS_START --> ENG

    ENG -- "< 4 weeks" --> ENG_LT4
    ENG -- "4+ weeks" --> ENG_GT4
    ENG_LT4 --> ER1
    ENG_GT4 --> ER2

    DAYS_RESERVE --> READ
    DAYS_START --> READ

    READ --> RL
    READ --> RM
    READ --> RH
    READ --> RHP

    ER1 --> OVERALL
    ER2 --> OVERALL
    RL --> OVERALL
    RM --> OVERALL
    RH --> OVERALL
```

---

## Diagram 8 — Angular App Internal Flow (Current)

```mermaid
graph TD
    APP["App Load\nAngularApp"]

    SS["StudentService\nonSnapshot listener"]
    FS["Firestore\nstudents collection"]

    SIG["students signal\nsignal of Student array"]

    DASH["DashboardComponent\nreads students signal"]
    OPP["OpportunityDetailComponent\nreads single student"]

    PUB["triggerActionCheck\nactionRequired == true\nORDER BY timeUntilClassStartDays"]

    AI_BTN["ES clicks\nGenerate AI Insights"]
    CF_AI["Cloud Function\ngenerateStudentInsights"]
    AI_WRITE["setDoc merge true\nwrite aiInsights back"]

    DOC_BTN["ES clicks\nQuery Document"]
    CF_DOC["Cloud Function\nqueryStudentDocument"]

    APP --> SS
    SS --> FS
    FS -- "realtime updates" --> SS
    SS --> SIG

    SIG --> DASH
    SIG --> OPP

    DASH -- "Action Check button" --> PUB
    PUB --> FS
    FS --> SIG

    OPP --> AI_BTN
    AI_BTN --> CF_AI
    CF_AI --> AI_WRITE
    AI_WRITE --> FS

    OPP --> DOC_BTN
    DOC_BTN --> CF_DOC
```

---

## Diagram 9 — Gap Map (Current vs V7)

```mermaid
graph LR
    CUR["Current App\nState"]
    V7["V7 Contract\nTarget"]

    G1["G1: Collection name\nstudents vs student_records"]
    G2["G2: Checklist\nhardcoded 3 items vs event-sourced"]
    G3["G3: Requirements\nflat booleans vs activity events"]
    G4["G4: Risk scores\nstored fields vs computed"]
    G5["G5: actionRequired\nstored bool vs derived"]
    G6["G6: activity_category\nmissing entirely"]
    G7["G7: log_id UUID\nmissing - duplicates possible"]
    G8["G8: courseActivity shape\nvs activity_log rows"]
    G9["G9: isAccredited\nDE computes vs app computes"]
    G10["G10: communications\ntwo sources of truth"]

    CUR -- "gap" --> G1
    CUR -- "gap" --> G2
    CUR -- "gap" --> G3
    CUR -- "gap" --> G4
    CUR -- "gap" --> G5
    CUR -- "gap" --> G6
    CUR -- "gap" --> G7
    CUR -- "gap" --> G8
    CUR -- "gap" --> G9
    CUR -- "gap" --> G10

    G1 -- "fix" --> V7
    G2 -- "fix" --> V7
    G3 -- "fix" --> V7
    G4 -- "fix" --> V7
    G5 -- "fix" --> V7
    G6 -- "fix" --> V7
    G7 -- "fix" --> V7
    G8 -- "fix" --> V7
    G9 -- "fix" --> V7
    G10 -- "fix" --> V7
```

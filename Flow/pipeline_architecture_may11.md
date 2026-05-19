# Covista R2C Pipeline — End-to-End Architecture (May 11)

CDW → Pub/Sub → BigQuery → Firestore → Covista App, plus AI workers.

```mermaid
flowchart LR
    subgraph ADTALEM[ADTALEM DaaS - Source]
        CDW_DEV[(daas-cdw-dev<br/>rpt_ai_solutions)]
        CDW_QA[(daas-cdw-qa)]
        CDW_PROD[(daas-cdw-prod)]
    end

    subgraph WALDEN[WALDEN AI Workspace]
        PUB[Publisher SA<br/>sync_pubsub_dev.py]
        TOPIC_PROF[/Pub-Sub topic<br/>r2c-student-profile/]
        TOPIC_ACT[/Pub-Sub topic<br/>r2c-student-activity/]
        STREAM_PROF[(BQ stream<br/>profile_stream)]
        STREAM_ACT[(BQ stream<br/>activity_stream)]
        SYNC[Cloud Function<br/>syncBigQuery<br/>sync-from-bq.ts]
        FS[(Firestore<br/>students<br/>salesforce_opportunities<br/>audit_ghost_logs)]
        AI[AI Workers<br/>generateCommsWorker<br/>evaluateAiInsightsWorker]
    end

    subgraph APP[COVISTA APP]
        UI[Admin Dashboard<br/>+ Student App]
    end

    CDW_DEV -->|BQ read| PUB
    CDW_QA -.->|BQ read| PUB
    CDW_PROD -.->|BQ read| PUB
    PUB --> TOPIC_PROF
    PUB --> TOPIC_ACT
    TOPIC_PROF -->|BQ subscription| STREAM_PROF
    TOPIC_ACT -->|BQ subscription| STREAM_ACT
    STREAM_PROF -->|hash-based CDC| SYNC
    STREAM_ACT -->|hash-based CDC| SYNC
    SYNC -->|V18.1 contract| FS
    FS -->|isGeneratingAi flag| AI
    AI -->|writes back insights| FS
    FS --> UI

    style CDW_DEV fill:#fde2e2,stroke:#c62828
    style CDW_QA fill:#fde2e2,stroke:#c62828
    style CDW_PROD fill:#fde2e2,stroke:#c62828
    style PUB fill:#e3f2fd,stroke:#1976d2
    style TOPIC_PROF fill:#e3f2fd,stroke:#1976d2
    style TOPIC_ACT fill:#e3f2fd,stroke:#1976d2
    style STREAM_PROF fill:#e3f2fd,stroke:#1976d2
    style STREAM_ACT fill:#e3f2fd,stroke:#1976d2
    style SYNC fill:#e3f2fd,stroke:#1976d2
    style FS fill:#e3f2fd,stroke:#1976d2
    style AI fill:#e3f2fd,stroke:#1976d2
    style UI fill:#e8f5e9,stroke:#2e7d32
```

## Four subscription/event hops

| # | Hop | Mechanism | Owner |
|---|---|---|---|
| 1 | CDW → Pub/Sub | Publisher SA + scheduled BQ read in `python-agent/pubsub/sync_pubsub_dev.py` | Nagendra |
| 2 | Pub/Sub → BQ | Native BigQuery subscription (no code) | Nagendra |
| 3 | BQ → Firestore | Cloud Function `syncBigQuery()` in `functions/src/sync-from-bq.ts`; trigger via `onBqSyncTrigger` (Firestore doc write) or scheduled cron | Nagendra |
| 4 | Firestore → AI | `onMessagePublished` workers (`generateCommsWorker`, `evaluateAiInsightsWorker`) in `functions/src/index.ts`; AI results written back to same docs | Jaishir (AI gen) + Nagendra (PubSub workers) |

## Identity / IAM summary
- **Today (dev):** runs as my `d51029691-c@mail.waldenu.edu` user via Cloud Shell (reads CDW dev/qa/prod, publishes to Walden topics — verified 5/11).
- **Target (prod):** dedicated SA `pubsub-cdw-publisher@dev-wu-agenticai-app-proj.iam.gserviceaccount.com` with:
  - `roles/bigquery.dataViewer` on `rpt_ai_solutions` in `daas-cdw-{dev,qa,prod}`
  - `roles/bigquery.jobUser` on publisher project
  - `roles/pubsub.publisher` on Walden topics
- BQ → Firestore leg already runs as the Firebase Admin SA (no new IAM needed).

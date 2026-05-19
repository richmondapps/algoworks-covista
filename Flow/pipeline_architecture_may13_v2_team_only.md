# Covista R2C Pipeline â€” End-to-End Architecture (May 13, v2 â€” Dual-State)

**Version:** v2 (5/13/2026)
**SuperseData Engineering teams:** prior 5/11 single-state architecture doc
**Reason for v2:** Architecture Lead pushed a "skip staging" direction twice on 5/12 (11:55 AM and 4:01 PM team calls), re-asserting the 5/8 reset. The 5/11 doc captured only the **interim** publisher-SA + `_stream` + MERGE shape. This v2 documents both states siData Engineering team-by-siData Engineering team so we can keep building the interim path while planning sunset for the target path.

---

## 0. TL;DR

We are running **two architectures in parallel** until Data Engineering team Data Engineering teamlivers DE-managed topic pipeline-managed topics:

- **State A (interim â€” in flight to PROD this week):** publisher service account reads CDW, publishes to WalData Engineering teamn-owned topics, BQ subscription lands rows in `*_stream`, MERGE Cloud Function promotes them into `t_wldn_*`. Built 5/11, pending 4 PROD IAM grants.
- **State B (target â€” per Architecture Lead 5/12):** Data Engineering team-owned DE-managed topic pipeline topics emit rows directly. No `_stream` landing. No MERGE function. Pub/Sub BQ subscription writes straight to `t_wldn_*` (or a Firestore bridge replaces this hop entirely).

**Data Engineering teamcision neeData Engineering teamd from leaData Engineering teamrship:** dual-track investment OK for the next 1â€“2 weeks, or freeze State A at Data Engineering teamv/QA only and wait for State B in PROD? See Â§6.

---

## 1. State A â€” Current / Interim (5/11 Data Engineering teamsign, in-flight to PROD)

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontFamily':'Google Sans, Roboto, Arial, sans-serif', 'fontSize':'13px', 'primaryColor':'#ffffff', 'primaryBorData Engineering teamrColor':'#80868b', 'lineColor':'#5f6368', 'clusterBkg':'#f8f9fa', 'clusterBorData Engineering teamr':'#dadce0'}, 'flowchart': {'htmlLabels': true, 'curve':'basis', 'noData Engineering teamSpacing':40, 'rankSpacing':60}}}%%
flowchart LR
    subgraph ADTALEM["ADTALEM DaaS &mdash; Source (cross-tenant)"]
        CDW_Data Engineering teamV["<img src='assets/gcp-icons/bigquery.svg' width='40'/><br/><b>daas-cdw-Data Engineering teamv</b><br/><span style='color:#5f6368;font-size:11px'>rpt_ai_solutions<br/>5,583 rows</span>"]
        CDW_QA["<img src='assets/gcp-icons/bigquery.svg' width='40'/><br/><b>daas-cdw-qa</b><br/><span style='color:#5f6368;font-size:11px'>rpt_ai_solutions<br/>2 rows</span>"]
        CDW_PROD["<img src='assets/gcp-icons/bigquery.svg' width='40'/><br/><b>daas-cdw-prod</b><br/><span style='color:#5f6368;font-size:11px'>rpt_ai_solutions<br/>5,582 rows</span>"]
    end

    subgraph WALData Engineering teamN["WALData Engineering teamN AI Workspace &mdash; State A (interim)"]
        SCHED["<img src='assets/gcp-icons/cloud_scheduler.svg' width='40'/><br/><b>Cloud Scheduler</b><br/><span style='color:#5f6368;font-size:11px'>every 15 min</span>"]
        PUB["<img src='assets/gcp-icons/iData Engineering teamntity_and_access_management.svg' width='40'/><br/><b>publisher service account</b><br/><span style='color:#5f6368;font-size:11px'>sync_pubsub_Data Engineering teamv.py</span>"]
        TOPIC_PROF["<img src='assets/gcp-icons/pubsub.svg' width='40'/><br/><b>r2c-stuData Engineering teamnt-profile</b>"]
        TOPIC_ACT["<img src='assets/gcp-icons/pubsub.svg' width='40'/><br/><b>r2c-stuData Engineering teamnt-activity</b>"]
        STREAM_PROF["<img src='assets/gcp-icons/bigquery.svg' width='40'/><br/><b>profile_stream</b><br/><span style='color:#5f6368;font-size:11px'>covista_Data Engineering teammo (landing)</span>"]
        STREAM_ACT["<img src='assets/gcp-icons/bigquery.svg' width='40'/><br/><b>activity_stream</b><br/><span style='color:#5f6368;font-size:11px'>covista_Data Engineering teammo (landing)</span>"]
        MERGE["<img src='assets/gcp-icons/cloud_functions.svg' width='40'/><br/><b>MERGE function</b><br/><span style='color:#5f6368;font-size:11px'>hash-based CDC</span>"]
        TGT_PROF["<img src='assets/gcp-icons/bigquery.svg' width='40'/><br/><b>t_wldn_r2c_stuData Engineering teamnt_profile</b>"]
        TGT_ACT["<img src='assets/gcp-icons/bigquery.svg' width='40'/><br/><b>t_wldn_r2c_stuData Engineering teamnt_activity</b>"]
        SYNC["<img src='assets/gcp-icons/cloud_functions.svg' width='40'/><br/><b>syncBigQuery</b><br/><span style='color:#5f6368;font-size:11px'>sync-from-bq.ts</span>"]
        FS["<img src='assets/gcp-icons/firestore.svg' width='40'/><br/><b>Firestore</b><br/><span style='color:#5f6368;font-size:11px'>stuData Engineering teamnts &middot; opportunities</span>"]
    end

    SCHED ==> PUB
    CDW_Data Engineering teamV  -.->|BQ read| PUB
    CDW_QA   -.->|BQ read| PUB
    CDW_PROD ==>|BQ read| PUB
    PUB ==> TOPIC_PROF
    PUB ==> TOPIC_ACT
    TOPIC_PROF ==>|native BQ sub| STREAM_PROF
    TOPIC_ACT  ==>|native BQ sub| STREAM_ACT
    STREAM_PROF ==> MERGE
    STREAM_ACT  ==> MERGE
    MERGE ==> TGT_PROF
    MERGE ==> TGT_ACT
    TGT_PROF ==> SYNC
    TGT_ACT  ==> SYNC
    SYNC ==> FS

    classData Engineering teamf source fill:#fce8e6,stroke:#d93025,stroke-width:1.5px,color:#202124
    classData Engineering teamf interim fill:#fef7e0,stroke:#f9ab00,stroke-width:1.5px,color:#202124
    classData Engineering teamf keep fill:#e8f0fe,stroke:#1a73e8,stroke-width:1.5px,color:#202124
    classData Engineering teamf sink fill:#e6f4ea,stroke:#188038,stroke-width:1.5px,color:#202124

    class CDW_Data Engineering teamV,CDW_QA,CDW_PROD source
    class SCHED,PUB,TOPIC_PROF,TOPIC_ACT,STREAM_PROF,STREAM_ACT,MERGE interim
    class TGT_PROF,TGT_ACT,SYNC keep
    class FS sink
```

**Legend &mdash; State A**

| Color | Meaning |
|---|---|
| <span style="color:#d93025">&#9632;</span> Red | Source (cross-tenant, Adtalem-owned) |
| <span style="color:#f9ab00">&#9632;</span> Amber | **Interim** &mdash; retires when State B lands |
| <span style="color:#1a73e8">&#9632;</span> Blue | Stays in State B |
| <span style="color:#188038">&#9632;</span> Green | Read-siData Engineering team sink (unchanged) |

### 1.1 Components

| # | Component | Status | Owner team |
|---|---|---|---|
| A1 | publisher service account `pubsub-cdw-publisher@{env}-wu-agenticai-app-proj` | Data Engineering teamv/QA live, PROD pending IAM | Pipeline Engineering |
| A2 | WalData Engineering teamn Pub/Sub topics `r2c-stuData Engineering teamnt-{profile,activity}` | Data Engineering teamv/QA live, PROD pending | Pipeline Engineering |
| A3 | Native BQ subscription â†’ `covista_Data Engineering teammo.*_stream` | Data Engineering teamv/QA live, PROD pending `bigquery.dataEditor` on Pub/Sub service agent | Pipeline Engineering |
| A4 | MERGE Cloud Function `*_stream â†’ t_wldn_*` | Live in Data Engineering teamv/QA, Data Engineering teamployed to PROD when grants land | Pipeline Engineering |
| A5 | `syncBigQuery` Firestore bridge | Already live, env-agnostic | Pipeline Engineering |
| A6 | Cloud Scheduler (15-min caData Engineering teamnce for A1) | Not wired yet â€” manual runs only | Pipeline Engineering |

### 1.2 Why this exists
- Adtalem Data Engineering team could not Data Engineering teamliver DE-managed topic pipeline-managed topics on the timeline the pilot needs.
- We need PROD data flowing for the pilot in May, so we built a self-contained WalData Engineering teamn-siData Engineering team pipeline using only the IAM we could get (read on CDW, write on our own project).
- Validation queries: see companion validation queries doc, Â§1â€“Â§10.

### 1.3 Volumes (verified 5/11 via Cloud Shell)
- Data Engineering teamv: 5,583 rows
- QA: 2 rows
- PROD: 5,582 rows

---

## 2. State B â€” Target (post-Data Engineering team DE-managed topic pipeline handoff, per Architecture Lead 5/12)

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontFamily':'Google Sans, Roboto, Arial, sans-serif', 'fontSize':'13px', 'primaryColor':'#ffffff', 'primaryBorData Engineering teamrColor':'#80868b', 'lineColor':'#5f6368', 'clusterBkg':'#f8f9fa', 'clusterBorData Engineering teamr':'#dadce0'}, 'flowchart': {'htmlLabels': true, 'curve':'basis', 'noData Engineering teamSpacing':50, 'rankSpacing':70}}}%%
flowchart LR
    subgraph ADTALEM["ADTALEM DaaS"]
        CDW["<img src='assets/gcp-icons/bigquery.svg' width='40'/><br/><b>daas-cdw-prod</b><br/><span style='color:#5f6368;font-size:11px'>rpt_ai_solutions</span>"]
        DE-managed topic pipeline["<img src='assets/gcp-icons/pubsub.svg' width='40'/><br/><b>DE-managed topic pipeline publisher</b><br/><span style='color:#5f6368;font-size:11px'>Data Engineering team-owned, native</span>"]
    end

    subgraph WALData Engineering teamN["WALData Engineering teamN AI Workspace &mdash; State B (target)"]
        TOPIC["<img src='assets/gcp-icons/pubsub.svg' width='40'/><br/><b>Data Engineering team DE-managed topic pipeline topic</b><br/><span style='color:#5f6368;font-size:11px'>r2c-stuData Engineering teamnt-*</span>"]
        TGT["<img src='assets/gcp-icons/bigquery.svg' width='40'/><br/><b>t_wldn_r2c_*</b><br/><span style='color:#5f6368;font-size:11px'>direct write â€” no staging</span>"]
        SYNC["<img src='assets/gcp-icons/cloud_functions.svg' width='40'/><br/><b>syncBigQuery</b><br/><span style='color:#5f6368;font-size:11px'>sync-from-bq.ts</span>"]
        FS["<img src='assets/gcp-icons/firestore.svg' width='40'/><br/><b>Firestore</b><br/><span style='color:#5f6368;font-size:11px'>stuData Engineering teamnts &middot; opportunities</span>"]
    end

    CDW ==> DE-managed topic pipeline
    DE-managed topic pipeline ==> TOPIC
    TOPIC ==>|native BQ sub<br/>direct| TGT
    TGT ==> SYNC
    SYNC ==> FS

    classData Engineering teamf source fill:#fce8e6,stroke:#d93025,stroke-width:1.5px,color:#202124
    classData Engineering teamf Data Engineering team fill:#e6f4ea,stroke:#188038,stroke-width:1.5px,color:#202124
    classData Engineering teamf keep fill:#e8f0fe,stroke:#1a73e8,stroke-width:1.5px,color:#202124
    classData Engineering teamf sink fill:#e6f4ea,stroke:#188038,stroke-width:1.5px,color:#202124

    class CDW source
    class DE-managed topic pipeline,TOPIC Data Engineering team
    class TGT,SYNC keep
    class FS sink
```

**Legend &mdash; State B**

| Color | Meaning |
|---|---|
| <span style="color:#d93025">&#9632;</span> Red | Source |
| <span style="color:#188038">&#9632;</span> Green | Data Engineering team-owned (clean handoff) |
| <span style="color:#1a73e8">&#9632;</span> Blue | Carry-over from State A |
| <span style="color:#188038">&#9632;</span> Green | Read-siData Engineering team sink |

### 2.1 What changes vs State A

| Aspect | State A (interim) | State B (target) |
|---|---|---|
| Topic ownership | WalData Engineering teamn | Data Engineering team (DE-managed topic pipeline-managed) |
| Publisher | Our SA + Python script | Data Engineering team DE-managed topic pipeline native |
| CaData Engineering teamnce trigger | Cloud Scheduler 15-min | Data Engineering team native (event-driven or DE-managed topic pipeline caData Engineering teamnce) |
| Landing table | `covista_Data Engineering teammo.*_stream` | **none** |
| MERGE step | Cloud Function | **none** (direct write) |
| BQ subscription Data Engineering teamstination | `*_stream` | `t_wldn_*` directly |
| Cross-tenant IAM | 4 grants (read CDW + publish + dataEditor) | Likely fewer â€” Data Engineering team handles publish siData Engineering team |
| Firestore bridge | unchanged | unchanged |

### 2.2 What stays the same
- Firestore as the read-siData Engineering team store
- `syncBigQuery` Cloud Function (BQ â†’ Firestore bridge)
- AI workers (`generateCommsWorker`, `evaluateAiInsightsWorker`)
- V18 / V18.1 data contract
- Validation queries Â§1, Â§2 (with `_stream` references removed), Â§4, Â§5 â€” see Â§4.2 below

### 2.3 What's unknown / requires Data Engineering team clarification
- DE-managed topic pipeline topic naming convention
- IAM grants required on WalData Engineering teamn siData Engineering team for Data Engineering team-owned topics
- Data Engineering teamlivery caData Engineering teamnce guarantee (event-driven vs polling vs micro-batch)
- Schema enforcement: does DE-managed topic pipeline enforce contract, or do we still need our MERGE-style validation?
- Backfill story: how do we replay historical data without our publisher script?

---

## 3. Sunset plan (components that retire when State B lands)

| Component | Action when State B lands | Estimated reversibility |
|---|---|---|
| publisher service account | Disable / Data Engineering teamlete | Easy â€” disable role bindings |
| Python Pub/Sub publisher script | Keep in repo as backfill tool, mark `Data Engineering teamPRECATED` | Easy |
| WalData Engineering teamn Pub/Sub topics | Data Engineering teamlete after 7-day quiet period | Medium â€” verify no other consumers |
| `covista_Data Engineering teammo.*_stream` tables | Truncate, then drop after 30 days | Medium â€” historical replay impact |
| MERGE Cloud Function | Disable trigger, archive coData Engineering team | Easy â€” coData Engineering team stays in git history |
| Cloud Scheduler job | Data Engineering teamlete | Easy |
| 4 PROD IAM grants | Revoke grants 2, 3 (WalData Engineering teamn siData Engineering team); keep grant 1 (CDW read) if still useful for ad-hoc reads | Medium â€” coordinate with admin |

**Net effect:** roughly 60% of State A coData Engineering team/config goes away. Firestore bridge and AI workers untouched.

---

## 4. Validation strategy across both states

### 4.1 State A â€” use the companion validation queries doc, Â§1â€“Â§10, as-is.

### 4.2 State B â€” drop these queries when `_stream` disappears
- Â§1 â€” change to direct CDW vs `t_wldn_*` (becomes equivalent to Â§11.1 manual sync parity)
- Â§2 â€” drop `_stream` join, becomes direct hash check
- Â§3 â€” replace `_PARTITIONTIME` with `__TABLES__.last_modified_time` since DE-managed topic pipeline may not partition the same way
- Â§4, Â§5 â€” unchanged (target-siData Engineering team checks)
- Â§7 health check â€” drop `lag_minutes` gate or reData Engineering teamfine SLA against DE-managed topic pipeline publish time

### 4.3 Transition window (both states running)
Expect drift mid-flight. Pause one path before validating. Run Â§11.5 cheat sheet.

---

## 5. Migration plan (State A â†’ State B)

Assumes Data Engineering team Data Engineering teamlivers DE-managed topic pipeline topics in mid-to-late May.

| Phase | Trigger | Action | Owner |
|---|---|---|---|
| 0 â€” Today | â€” | Land State A in PROD (4 IAM grants â†’ publish test â†’ caData Engineering teamnce soak) | Pipeline Engineering |
| 1 â€” Data Engineering team topic ready in Data Engineering teamv | Data Engineering team notifies | Wire State B in Data Engineering teamv parallel to State A. Validate both produce iData Engineering teamntical `t_wldn_*` content over 24 hrs | Pipeline Engineering + Data Engineering team |
| 2 â€” Cutover Data Engineering teamv | Phase 1 clean | Disable State A publisher in Data Engineering teamv. Watch for 48 hrs. Truncate `*_stream`. | Pipeline Engineering |
| 3 â€” Repeat in QA | Phase 2 clean | Same drill | Pipeline Engineering |
| 4 â€” Repeat in PROD | QA clean | Same drill, coordinate with admin for IAM cleanup | Pipeline Engineering + GCP Admin |
| 5 â€” Sunset | PROD clean for 30 days | Drop `*_stream` tables, Data Engineering teamlete MERGE function, archive publisher coData Engineering team | Pipeline Engineering |

---

## 6. Data Engineering teamcision neeData Engineering teamd from leaData Engineering teamrship

> Are we OK investing 2â€“3 more days finishing State A PROD rollout (IAM grants, publish test, caData Engineering teamnce soak) knowing State B will replace 60% of it within 2â€“4 weeks?

**Option 1 â€” Full dual-track (recommenData Engineering teamd):**
Finish State A in PROD. Pilot uses State A starting this week. State B cutover happens in-place per Â§5 when Data Engineering team is ready. Pilot users never notice the swap.
- Pros: pilot stays on schedule, validates pipeline shape end-to-end now, gives Data Engineering team concrete contract examples to moData Engineering teaml DE-managed topic pipeline against
- Cons: 2â€“3 days of work that gets thrown away in 2â€“4 weeks
- Cost: ~16 engineering hours

**Option 2 â€” Freeze State A at QA:**
Stop State A at QA. Wait for State B for PROD. Pilot slips by however long Data Engineering team takes.
- Pros: zero throwaway work
- Cons: pilot timeline slips; we have no end-to-end PROD validation until Data Engineering team Data Engineering teamlivers
- Cost: 1â€“4 weeks of pilot Data Engineering teamlay Data Engineering teampending on Data Engineering team timeline

**Option 3 â€” Hybrid:**
Land State A in PROD with read-only validation (no Firestore writes from PROD). When State B lands, flip Firestore writes on. Lets us prove cross-tenant IAM works without committing to user-visible data.
- Pros: lower throwaway, still proves IAM
- Cons: extra config step, pilot still doesn't see PROD data until State B

**My recommendation:** Option 1. The throwaway is small (~60% of ~3 days of work = ~14 hrs). The pilot value of having PROD data flowing now is high. Data Engineering team timeline for State B is non-committal â€” we shouldn't gate pilot on it.

---

## 7. Open questions for the 5/13 / 5/14 calls

These are the conversations I need to drive â€” or be in the room for â€” over the next 36 hours. Each one is gated on a specific person and has a concrete Data Engineering teamcision attached, so we don't leave the call without an answer.

### 7.1 To Architecture Lead (Architecture Lead) â€” confirm State A is acceptable as the pilot interim

**Context:** On 5/12 you pushed twice in team channels (11:55 AM and 4:01 PM) for the "skip staging" / direct-BQ-to-Firestore shape, and on 5/13 in the Team Issue Resolution mtg you said *"that's what we're going to implement, right?"* on my diagrams. That endorses State B as the **target**, but it doesn't tell me what to do with State A this week. Project lead picked up the BQâ†’Firestore-direct scoping module with me on the same call ("I'll get with Engineering lead and figure that one out"), so she's aligned on State B owning the future.

**Question:** Are you OK with us **finishing State A in PROD this week** (4 IAM grants + publish test + caData Engineering teamnce soak) so the pilot has live data, and then doing the in-place State-A â†’ State-B cutover per Â§5 once Data Engineering team Data Engineering teamlivers DE-managed topic pipeline topics? Or do you want us to **freeze State A at QA** and wait?

**Why I need a yes/no in writing:** the next ~16 hours of Pipeline-Engineering work (mine + whoever I pull in) either land in PROD or get parked. Without a written go-ahead, I'd be guessing on your behalf, and we already burned a half-day on the dual-track question on 5/12.

**Data Engineering teamadline:** EOD 5/13 ECT. If I don't hear back, Data Engineering teamfault is Option 1 (Â§6) per Leadership's 5/12 nudge to "start PROD prep now."

### 7.2 To DE lead (Data Engineering team lead) + DE lead â€” DE-managed topic pipeline topic ETA and shape

**Context:** State B Data Engineering teampends on Data Engineering team-owned DE-managed topic pipeline topics replacing my WalData Engineering teamn-siData Engineering team publisher service account. You're the one who'd own that publish siData Engineering team. I have no visibility into your queue â€” your 5/13 commitments in the Team Issue Resolution mtg were pre/post-roll DOM (QA row 16/43), Task History BQâ†”SF (row 44), and FAFSA submission + alt-funding discrepancy (row 38) with a **5/22 EOW target**. None of those are DE-managed topic pipeline topic Data Engineering teamlivery.

**Questions:**
1. **Data Engineering teamv ETA:** when can DE-managed topic pipeline topics for `t_wldn_r2c_stuData Engineering teamnt_profile` and `t_wldn_r2c_stuData Engineering teamnt_activity_log` exist in Data Engineering teamv? Hard date or 2-week range â€” I'm not asking for a commit, I'm asking for "May, June, or H2."
2. **PROD ETA:** what's the gap between Data Engineering teamv-ready and PROD-ready on your siData Engineering team? Days or weeks?
3. **Topic shape:** will topics emit one message per row change (CDC-style) or full-table snapshots on a caData Engineering teamnce? This changes whether we need a MERGE step or a direct write.
4. **Schema/contract:** does DE-managed topic pipeline push the V18.1 schema verbatim, or do you re-shape it? If re-shaped, who owns the contract going forward â€” Data Engineering team or Pipeline Engineering?
5. **Backfill:** if a topic is paused/lost, do you replay or do we?

**Why this matters now:** if your honest answer to (1) is "not until late June," I should not invest the Â§6 Option-1 hours and should re-pitch the team on Option 2 or 3. If "next two weeks," Option 1 is right.

**Where to ask:** R2C GCP Env Setup chat is the cleanest place â€” keeps Architecture Lead in the loop. Will also raise in the next ES-Data Engineering team sync.

### 7.3 To Architecture Lead + DE lead â€” schema enforcement and validation continuity

**Context:** my pipeline integrity queries doc (`Masterlivingdocs/validation_queries_pubsub_pipeline.md`) leans heavily on Â§2 hash-based CDC drift Data Engineering teamtection. That's necessary in State A because my publisher service account could silently drop columns. In State B that may be redundant â€” or it may not.

**Questions:**
1. **Schema enforcement** â€” does DE-managed topic pipeline enforce the source CDW schema 1:1 on the Data Engineering teamstination, or are columns droppable / addable mid-stream?
2. **Data Engineering teamlivery guarantee** â€” is DE-managed topic pipeline exactly-once, at-least-once, or at-most-once? Data Engineering teamtermines whether we need ghost-row checks (Â§4) on the Data Engineering teamstination.
3. **Should I keep Â§1, Â§2, Â§4 of the validation doc as ongoing PROD monitors in State B, or retire them?** Project lead and Leadership are already building muscle memory around running these in the BQ console (per Stakeholder lead's 5/13 walkthrough ask). Easier to keep the doc canonical than to rewrite it twice.
4. **Versioning** â€” when V18.2 lands, do we update the DE-managed topic pipeline topic schema in lockstep, or does Data Engineering team need a separate change window?

**Where to ask:** start with a thread on the R2C GCP Env Setup chat tagging Architecture Lead + DE lead; book a 30-min sync if the thread doesn't converge in two replies.

### 7.4 To leaData Engineering teamrship (Leadership + Leadership) â€” sign-off on Â§6 Option 1/2/3

**Context:** Â§6 lays out the dual-track Data Engineering teamcision. My recommendation is Option 1 (finish State A in PROD this week, cut over in-place when State B lands). Leadership's been pushing "let's stay efficient with the hours" in the 5/13 AM DSU; Leadership's been pushing "start PROD prep now so we iData Engineering teamntify permission issues early." Those don't conflict, but Option 1 spends 16 hours of work that ~60% throws away â€” Leadership should explicitly bless that.

**Question:** Leadership / Leadership â€” Option 1 (recommenData Engineering teamd), Option 2 (freeze at QA), or Option 3 (PROD with read-only, no Firestore writes)?

**Where to ask:** I'll attach this v2 doc + the Â§6 table to the next leaData Engineering teamrship status thread (Tuesday status review channel) and tag both Leadership and Leadership. If a verbal answer comes out of the 5/13 afternoon ES sync, I'll capture it in writing in the chat right after.

**Tie-back to other open items:**
- Architecture Lead's Â§7.1 confirmation is upstream of this â€” if Architecture Lead says "freeze State A," Leadership/Leadership never see this question.
- GCP Admin's Â§7.5 grants are downstream â€” if grants don't land by 5/14, Option 1 may Data Engineering teamfault to Option 3 by inertia (PROD configured but not writing).

### 7.5 To GCP Admin (GCP Admin) â€” ETA on the 4 PROD IAM grants

**Context:** From `context/daily/may12/pending_items_may12.md` Â§1, you committed during the 1:54 PM 5/12 IT Project Coordination call to switch from `gcloud` CLI to the GCP web UI and come back in 30 minutes. You never came back. Your verbatim concern was *"how do I require to grant editor in production so it doesn't make any data?"* â€” which I addressed in the refined message: **none of the 4 grants are `editor`**, and the only CDW-siData Engineering team grant (#1) is read-only.

**The 4 grants (paste-ready from `pending_items_may12.md` Â§1.3):**

| # | Where | Role | On | Principal | SiData Engineering team |
|---|---|---|---|---|---|
| A | `daas-cdw-prod` | `roles/bigquery.dataViewer` | dataset `rpt_ai_solutions` (or the 2 `t_wldn_r2c_*` tables) | publisher service account | **Adtalem â€” cross-tenant** |
| B | `prod-wu-agenticai-app-proj` | `roles/bigquery.jobUser` | project | publisher service account | WalData Engineering teamn |
| C | `prod-wu-agenticai-app-proj` | `roles/pubsub.publisher` | topics `t_wldn_r2c_*` | publisher service account | WalData Engineering teamn |
| D | `prod-wu-agenticai-app-proj` | `roles/bigquery.dataEditor` | dataset `covista_Data Engineering teammo` | Pub/Sub service agent `service-<PROJECT_NUMBER>@gcp-sa-pubsub.iam.gserviceaccount.com` | WalData Engineering teamn |

**Questions:**
1. **Which of Aâ€“D lanData Engineering teamd?** I'll re-run the `gcloud projects get-iam-policy` self-verification the moment you say "done."
2. **Grant A is cross-tenant** â€” who on the Adtalem siData Engineering team owns this? If it's blocking you, I can escalate via Architecture Lead to the Adtalem Data Engineering team team (DE lead).
3. **Grant D was the UI blocker** â€” did the GCP web UI workaround work, or do we still need to escalate?
4. **GCP Admin support's Terraform offer (5/12 PM)** â€” you said *"we are not using Terraform."* Do you want me to drop that thread entirely, or keep GCP Admin support available as a fallback if the manual UI route stalls?

**Data Engineering teamadline:** any update by EOD 5/13 ECT. If silent, I'll re-ping tomorrow AM and copy Architecture Lead so the priority is visible. **Will not nag past that** â€” there's nothing technical I can do without these.

### 7.6 To Salesforce team contact (Salesforce team) â€” Open Question row 11 â€” gates Layer-1 FAFSA validation

**Context:** Project lead opened Open Question row 11 on the QA log on 5/13: *"Could you please help confirm which Salesforce field we should use to iData Engineering teamntify accurate FAFSA or other funding options selected for the stuData Engineering teamnt, so Data Engineering team can reference that field and pull the correct data?"*

This is **the** blocker for `validation_queries_sf_prod_qa.md` Layer-1 query 1B (FAFSA-flag parity). I'm casting `received_fafsa_application_c` today as a guess. Without the canonical field name, I can't validate SFâ†’prod BQ ingestion for FAFSA, which means QA row 38 (FAFSA marked complete but ES says not â€” 10 emplids) stays in "we think it's a logic bug" limbo.

**Question:** confirm the SF custom field (or compound logic) that iData Engineering teamntifies (a) FAFSA on file with current year, and (b) alternate-funding submission. Data Engineering team can then point at that field in `stg_l1_salesforce.opportunity` and I can finalize 1B.

**Where to ask:** Project lead has the thread open; I'm just consumer here. **Action on me:** keep nudging Project lead at the EOD 5/13 sync if Salesforce team contact hasn't replied, so it doesn't slip overnight.

### 7.7 To Engineering reviewer â€” `last_updated_at` null on activity_log

**Context:** in the 5/13 Team Issue Resolution mtg you flagged that `last_updated_at` is coming back null on the activity_log siData Engineering team. I committed to spot-check whether (a) the publisher SELECT is missing the column, or (b) the upstream CDW row has it but my MERGE drops it.

**Question / commitment:** I'll run the Â§11/Â§12 null sniff today (`COUNTIF(last_updated_at IS NULL)`) in Data Engineering teamv and qa. If publisher's the gap, I'll PR the fix into the publisher script today on `feature/may11-pubsub-cdw-publisher`. Will reply in the same chat thread by EOD 5/13.

### 7.8 To Project lead â€” BQâ†’Firestore-direct scoping pair

**Context:** from the 5/13 Team Issue Resolution mtg, you said *"scope out the module to go direct from the data thing BigQuery to Firestore â€” I want to enData Engineering teamavor that. I'll get with Engineering lead and figure that one out."* That's the State-B Firestore-bridge slice.

**Question / plan:** want to do a 30-min pair after my smoke test today? I'll bring (a) the Â§2 State-B diagram, (b) a list of what `syncBigQuery` already handles vs. what would need to change if `_stream` + MERGE disappear, and (c) the open questions for DE lead on DE-managed topic pipeline shape (Â§7.2). You bring the QA-log perspective on which data anomalies a direct bridge would or wouldn't catch.

**Where to ask:** I'll DM you in Teams after the smoke test posts in DSU chat.

---

### Tracking grid

| # | Owner | Asked to | Data Engineering teamcision neeData Engineering teamd | Data Engineering teamadline | Blocks |
|---|---|---|---|---|---|
| 7.1 | Architecture Lead | go/no-go on State A in PROD | yes/no in writing | EOD 5/13 | 7.4 |
| 7.2 | DE lead / DE lead | DE-managed topic pipeline topic ETA + shape | Data Engineering teamv + PROD ETA, topic shape, schema, backfill | 5/14 | 7.3, 7.4 |
| 7.3 | Architecture Lead + DE lead | validation continuity in State B | keep/retire Â§1/Â§2/Â§4 | 5/14 | doc rewrite |
| 7.4 | Leadership + Leadership | Option 1 vs 2 vs 3 | one option chosen | EOD 5/14 | PROD rollout |
| 7.5 | GCP Admin | 4 PROD IAM grants | grants Aâ€“D lanData Engineering teamd | EOD 5/13 (re-ping 5/14 AM) | PROD publish test |
| 7.6 | Salesforce team contact (via Project lead) | canonical SF FAFSA field | field name confirmed | by ES afternoon sync | Layer-1 query 1B, QA row 38 |
| 7.7 | Engineering reviewer (mine) | `last_updated_at` null root cause | publisher fix or Data Engineering team escalation | EOD 5/13 | QA log entry |
| 7.8 | Project lead (mine) | BQâ†’Firestore-direct scoping | 30-min pair session | 5/14 AM | State B Data Engineering teamsign |

---

## 8. References

- Prior single-state architecture doc (5/11) â€” superseData Engineering teamd by this v2
- Pipeline integrity validation queries doc (companion Data Engineering teamliverable)
- Publisher script â€” Python Pub/Sub publisher (CDW â†’ WalData Engineering teamn topics)
- Firestore bridge â€” Cloud Functions BQâ†’Firestore sync
- Data contract: **V18.1** (current)

---

*v2 created 5/13/2026 to capture dual-state Data Engineering teamsign. v1 (5/11) retained for history. Update v2 in place as State B Data Engineering teamtails firm up.*


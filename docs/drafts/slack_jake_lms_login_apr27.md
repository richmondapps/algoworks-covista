**To: Jake**
**Channel: DM or #r2c-engineering**
**Subject: lms_login is live — engagement layer can wire up now**

Heads up — Alpesh confirmed `lms_login` is now flowing in `daas-cdw-dev.rpt_ai_solutions.wldn_r2c_student_activity_log`.

**Mirrored to dev + QA today (Apr 27):**

| Surface | lms_login rows | wwow_login rows |
|---|---|---|
| Source (rpt) | 5,423 | 4,082 |
| Dev BQ | 5,423 | 4,082 |
| QA BQ | (syncing now) | 4,082 |

**Shape:**
- `activity_category = 'student_event'`
- `activity_name = 'lms_login'`
- `activity_datetime` populated (this one is NOT NULL — unlike fafsa/alt-funding rows)
- Repeats per student (full history, not first-only) — only `student_event` row that does

**Engagement layer impact:**
- §13.4 fallback rule (`wwow_login` + `logged_into_course` only) is no longer needed — go straight to `lms_login` for the rolling-window engagement count.
- Tiering (HIGH/MEDIUM/LOW) per `docs/EVENT_LAYER_SPEC.md` should now be computable end-to-end.
- Reminder: `lms_login` does NOT satisfy any readiness checklist line on its own — student-originated signal only.

**Contract:** `covista_data_contract_v17_9.md` §10 + §13.5 updated to mark `lms_login` as live and remove the "pending confirmation" note. Pushing in the same PR (#7).

Let me know if you want me to add a quick `lms_login`-driven `last_engagement_at` field to the consumer view alongside the existing engagement plumbing.

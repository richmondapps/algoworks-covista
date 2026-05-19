#!/usr/bin/env bash
# ============================================================================
# Pipeline validation smoke test — 2026-05-13
# Owner : Kandala, Nagendra
# Doc   : context/Masterlivingdocs/validation_queries_pubsub_pipeline.md
# Run as: d51029691-c@mail.waldenu.edu  (Cloud Shell — local OAuth is blocked)
#
# Purpose: prove the validation queries work end-to-end against real data, using
#          high-priority QA-log open issues as the test scenarios. Output is a
#          single readable log Bryan / Sanjay / Manvitha can scan to confirm
#          pass/fail before the walkthrough.
#
# Usage:
#   1. Open Cloud Shell at https://shell.cloud.google.com
#   2. Upload this file or paste into a new file: nano smoke_validation_may13.sh
#   3. chmod +x smoke_validation_may13.sh
#   4. ./smoke_validation_may13.sh dev   # or qa, or prod (prod is gated on Kewyn's IAM)
#   5. Pipe to tee for sharing:   ./smoke_validation_may13.sh dev | tee may13_dev.log
# ============================================================================

set -uo pipefail
ENV="${1:-dev}"
case "$ENV" in
  dev)   CDW="daas-cdw-dev";   WALDEN="dev-wu-agenticai-app-proj";  EXPECTED_PROFILE_ROWS=5583 ;;
  qa)    CDW="daas-cdw-qa";    WALDEN="qa-wu-agenticai-app-proj";   EXPECTED_PROFILE_ROWS=2 ;;
  prod)  CDW="daas-cdw-prod";  WALDEN="prod-wu-agenticai-app-proj"; EXPECTED_PROFILE_ROWS=5582 ;;
  *) echo "usage: $0 [dev|qa|prod]"; exit 2 ;;
esac

# Test emplids drawn from open QA-log rows on 2026-05-13
DEMO_EMPLID="A01269169"   # row 16 — Francis Nkimbeng (program start date discrepancy)
ROW16_LIST="('A01269169','A01285999','A01302851','A01302802','A01305704')"
ROW38_LIST="('A01306699','A01305428','A01299756','A01306437','A01299388','A01303579','A00539782','A01306103','A01305437','A01306669','A01307642')"
ROW40_LIST="('A00648981','A01306103','A01198570','A01302650')"

banner() { printf "\n========================================================================\n%s\n========================================================================\n" "$*"; }
sub() { printf "\n--- %s ---\n" "$*"; }

# Helper to run a SELECT and dump it as a clean table
runq() {
  local label="$1"; shift
  sub "$label"
  bq --quiet --project_id="$WALDEN" query --use_legacy_sql=false --format=pretty "$@"
  echo
}

banner "Smoke test — ENV=$ENV  CDW=$CDW  WALDEN=$WALDEN  (expected profile rows ~$EXPECTED_PROFILE_ROWS)"
echo "Date: $(date -Iseconds)"
echo "Identity: $(gcloud config get-value account 2>/dev/null)"

# ----------------------------------------------------------------------------
banner "§1 — Row-count parity (CDW vs _stream vs post-MERGE) — both tables"
# ----------------------------------------------------------------------------
runq "profile" "
WITH src AS (
  SELECT COUNT(*) AS n FROM \`$CDW.rpt_ai_solutions.t_wldn_r2c_student_profile\`),
stream AS (
  SELECT COUNT(*) AS n FROM \`$WALDEN.covista_demo.t_wldn_r2c_student_profile_stream\`),
target AS (
  SELECT COUNT(*) AS n FROM \`$WALDEN.covista_demo.t_wldn_r2c_student_profile\`)
SELECT 'profile' AS tbl, src.n AS cdw_count, stream.n AS stream_count, target.n AS merged_count,
       src.n - target.n AS drift_vs_cdw,
       stream.n - target.n AS unmerged_in_stream,
       CASE WHEN ABS(src.n - target.n) <= 5 THEN 'OK' ELSE 'INVESTIGATE' END AS status
FROM src, stream, target;"

runq "activity_log" "
WITH src AS (
  SELECT COUNT(*) AS n FROM \`$CDW.rpt_ai_solutions.t_wldn_r2c_student_activity_log\`),
stream AS (
  SELECT COUNT(*) AS n FROM \`$WALDEN.covista_demo.t_wldn_r2c_student_activity_log_stream\`),
target AS (
  SELECT COUNT(*) AS n FROM \`$WALDEN.covista_demo.t_wldn_r2c_student_activity_log\`)
SELECT 'activity_log' AS tbl, src.n AS cdw_count, stream.n AS stream_count, target.n AS merged_count,
       src.n - target.n AS drift_vs_cdw,
       stream.n - target.n AS unmerged_in_stream,
       CASE WHEN ABS(src.n - target.n) <= 5 THEN 'OK' ELSE 'INVESTIGATE' END AS status
FROM src, stream, target;"

# ----------------------------------------------------------------------------
banner "§2 — Hash-based CDC drift across all rows (profile)"
# ----------------------------------------------------------------------------
runq "global hash drift on profile" "
WITH src AS (
  SELECT emplid,
         SHA256(CONCAT(
           IFNULL(CAST(reserve_date       AS STRING), ''),
           IFNULL(CAST(is_accredited      AS STRING), ''),
           IFNULL(CAST(program_start_date AS STRING), '')
         )) AS h
  FROM \`$CDW.rpt_ai_solutions.t_wldn_r2c_student_profile\`),
dst AS (
  SELECT emplid,
         SHA256(CONCAT(
           IFNULL(CAST(reserve_date       AS STRING), ''),
           IFNULL(CAST(is_accredited      AS STRING), ''),
           IFNULL(CAST(program_start_date AS STRING), '')
         )) AS h
  FROM \`$WALDEN.covista_demo.t_wldn_r2c_student_profile\`)
SELECT COUNT(*) AS mismatched,
       ARRAY_AGG(STRUCT(src.emplid AS emplid) ORDER BY src.emplid LIMIT 20) AS sample_mismatches
FROM src JOIN dst USING(emplid)
WHERE src.h != dst.h;"

# ----------------------------------------------------------------------------
banner "§4 — Ghost rows on profile (in Walden but not in CDW)"
# ----------------------------------------------------------------------------
runq "ghosts on profile" "
SELECT dst.emplid, dst.program_start_date, dst.is_accredited
FROM \`$WALDEN.covista_demo.t_wldn_r2c_student_profile\` dst
LEFT JOIN \`$CDW.rpt_ai_solutions.t_wldn_r2c_student_profile\` src USING(emplid)
WHERE src.emplid IS NULL
ORDER BY dst.emplid
LIMIT 25;"

# ----------------------------------------------------------------------------
banner "§5 — V18 nullability on profile (key required fields)"
# ----------------------------------------------------------------------------
runq "nullability on profile" "
SELECT
  COUNT(*)                                AS total_rows,
  COUNTIF(emplid IS NULL)                 AS null_emplid,
  COUNTIF(program_start_date IS NULL)     AS null_program_start,
  COUNTIF(reserve_date IS NULL)           AS null_reserve_date,
  COUNTIF(is_accredited IS NULL)          AS null_is_accredited
FROM \`$WALDEN.covista_demo.t_wldn_r2c_student_profile\`;"

# ----------------------------------------------------------------------------
banner "Jake's 5/13 ask — last_updated_at null sniff on activity_log"
# ----------------------------------------------------------------------------
runq "last_updated_at nulls" "
SELECT
  COUNT(*)                              AS total_rows,
  COUNTIF(last_updated_at IS NULL)      AS null_last_updated_at,
  MIN(last_updated_at)                  AS min_lua,
  MAX(last_updated_at)                  AS max_lua
FROM \`$WALDEN.covista_demo.t_wldn_r2c_student_activity_log\`;"

# ----------------------------------------------------------------------------
banner "Scenario A — QA row 16 (Program Start Date discrepancy) — focus emplids"
# ----------------------------------------------------------------------------
runq "row 16 — side-by-side CDW vs Walden for the 5 named emplids" "
SELECT 'CDW'    AS source, emplid, program_start_date, reserve_date, is_accredited
FROM \`$CDW.rpt_ai_solutions.t_wldn_r2c_student_profile\`
WHERE emplid IN $ROW16_LIST
UNION ALL
SELECT 'WALDEN' AS source, emplid, program_start_date, reserve_date, is_accredited
FROM \`$WALDEN.covista_demo.t_wldn_r2c_student_profile\`
WHERE emplid IN $ROW16_LIST
ORDER BY emplid, source;"

runq "row 16 — DEMO emplid $DEMO_EMPLID (Francis Nkimbeng) — full row diff" "
SELECT 'CDW'    AS source, * FROM \`$CDW.rpt_ai_solutions.t_wldn_r2c_student_profile\`
WHERE emplid = '$DEMO_EMPLID'
UNION ALL
SELECT 'WALDEN' AS source, * FROM \`$WALDEN.covista_demo.t_wldn_r2c_student_profile\`
WHERE emplid = '$DEMO_EMPLID';"

# ----------------------------------------------------------------------------
banner "Scenario B — QA row 38 (FAFSA marked complete but ES says not) — flag spot-check"
# ----------------------------------------------------------------------------
runq "row 38 — activity_log fafsa flags for named emplids" "
SELECT emplid,
       MAX(fafsa_submission_flag)             AS fafsa_flag_max,
       MAX(alternate_funding_submission_flag) AS altfund_flag_max,
       COUNT(*) AS rows_in_activity
FROM \`$WALDEN.covista_demo.t_wldn_r2c_student_activity_log\`
WHERE emplid IN $ROW38_LIST
GROUP BY emplid
ORDER BY emplid;"

# ----------------------------------------------------------------------------
banner "Scenario C — QA row 40 (Course Registration is_accredited=false) — sniff"
# ----------------------------------------------------------------------------
runq "row 40 — is_accredited for A00648981 and A01306103" "
SELECT emplid, is_accredited, program_start_date, reserve_date
FROM \`$WALDEN.covista_demo.t_wldn_r2c_student_profile\`
WHERE emplid IN $ROW40_LIST
ORDER BY emplid;"

# ----------------------------------------------------------------------------
banner "Done. Save this log and paste the [ § ] banners + the matching tables to DSU chat."
# ----------------------------------------------------------------------------

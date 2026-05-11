"""Synthetic Pub/Sub smoke publisher — validates Pub/Sub→BQ backbone
without needing read perms on the upstream CDW. Usage:

    $env:DEST_CREDENTIALS = "...adtalem_credentials.json"
    python pubsub/_smoke_publish.py dev-wu-agenticai-app-proj SMOKE
    python pubsub/_smoke_publish.py qa-wu-agenticai-app-proj  SMOKE_QA
"""
import json, os, sys
from datetime import datetime, timezone
from google.cloud import pubsub_v1
from google.oauth2.credentials import Credentials

project = sys.argv[1]
tag = sys.argv[2] if len(sys.argv) > 2 else "SMOKE"

with open(os.environ["DEST_CREDENTIALS"]) as f:
    info = json.load(f)
creds = Credentials.from_authorized_user_info(info).with_quota_project(project)
pub = pubsub_v1.PublisherClient(credentials=creds)
now = datetime.now(timezone.utc).isoformat()

for topic_short, src_tbl in [
    ("r2c-student-profile", "t_wldn_r2c_student_profile"),
    ("r2c-student-activity-log", "t_wldn_r2c_student_activity_log"),
]:
    tp = pub.topic_path(project, topic_short)
    for i in range(2):
        payload = json.dumps({
            "student_id": f"{tag}_{i}",
            "term_code": "202602",
            "synthetic": True,
            "published_at_test": now,
        }).encode()
        fut = pub.publish(
            tp, data=payload,
            source_table=src_tbl,
            source_project="SYNTHETIC",
            published_at=now,
        )
        print(f"published msg_id={fut.result(timeout=30)} -> {tp}")
print(f"DONE publish to {project} (tag={tag})")

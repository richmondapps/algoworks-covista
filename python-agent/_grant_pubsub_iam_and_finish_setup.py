"""Grant the Pub/Sub service agent the BQ roles needed for BQ subscriptions.
Then re-attempt creating the BQ subscriptions for the two r2c topics.
"""
import os, sys
from google.cloud import resourcemanager_v3
from google.cloud import pubsub_v1
from google.iam.v1 import iam_policy_pb2, policy_pb2
from google.api_core import exceptions as gax

PROJECT = sys.argv[1] if len(sys.argv) > 1 else "dev-wu-agenticai-app-proj"

# 1. project number
pc = resourcemanager_v3.ProjectsClient()
proj = pc.get_project(name=f"projects/{PROJECT}")
project_number = proj.name.split("/")[-1]
sa = f"serviceAccount:service-{project_number}@gcp-sa-pubsub.iam.gserviceaccount.com"
print(f"Project {PROJECT} (#{project_number}) — service agent {sa}")

# 2. read & patch IAM policy
needed = ["roles/bigquery.dataEditor", "roles/bigquery.metadataViewer"]
policy = pc.get_iam_policy(request={"resource": f"projects/{PROJECT}"})
changed = False
existing_roles = {b.role: b for b in policy.bindings}
for role in needed:
    b = existing_roles.get(role)
    if b is None:
        nb = policy_pb2.Binding(role=role, members=[sa])
        policy.bindings.append(nb)
        print(f"  + adding new binding {role}")
        changed = True
    elif sa not in b.members:
        b.members.append(sa)
        print(f"  + adding {sa} to existing {role}")
        changed = True
    else:
        print(f"  = {role} already has {sa}")

if changed:
    policy = pc.set_iam_policy(request={"resource": f"projects/{PROJECT}", "policy": policy})
    print("  IAM policy updated.")
else:
    print("  IAM already correct.")

# 3. retry BQ subscription creation
TABLES = {
    "r2c-student-profile": ("r2c-student-profile-bq-sub", "t_wldn_r2c_student_profile_stream"),
    "r2c-student-activity-log": ("r2c-student-activity-log-bq-sub", "t_wldn_r2c_student_activity_log_stream"),
}
DEST_DATASET = "covista_demo"
sub_client = pubsub_v1.SubscriberClient()
pub_client = pubsub_v1.PublisherClient()
for topic_name, (sub_name, landing) in TABLES.items():
    topic_path = pub_client.topic_path(PROJECT, topic_name)
    sub_path = sub_client.subscription_path(PROJECT, sub_name)
    bq_config = pubsub_v1.types.BigQueryConfig(
        table=f"{PROJECT}.{DEST_DATASET}.{landing}",
        use_topic_schema=False,
        write_metadata=True,
        drop_unknown_fields=False,
    )
    try:
        sub_client.create_subscription(request={
            "name": sub_path, "topic": topic_path,
            "bigquery_config": bq_config, "ack_deadline_seconds": 60,
        })
        print(f"  CREATED  sub {sub_path}")
    except gax.AlreadyExists:
        print(f"  EXISTS   sub {sub_path}")
    except Exception as e:
        print(f"  FAILED   sub {sub_path} -> {type(e).__name__}: {str(e).splitlines()[0][:160]}")

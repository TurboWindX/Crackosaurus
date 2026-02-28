#!/usr/bin/env python3
"""
Script to login and call TRPC `instance.deleteJobs` on a Crackosaurus server.
Usage:
  python scripts/delete_job.py

Defaults are pre-filled from the user's report; override with CLI flags.
"""
import argparse
import time
import sys
import requests
from typing import List, Optional

try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
except Exception:
    boto3 = None


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base-url", default="http://localhost:8080/trpc", help="Base TRPC URL (include /trpc)")
    p.add_argument("--username", default="admin")
    p.add_argument("--password", default="", help="Login password (required)")
    p.add_argument("--instance-id", default="", help="Instance UUID")
    p.add_argument("--job-ids", default="", help="Comma-separated job IDs to delete")
    p.add_argument("--attempts", type=int, default=3)
    p.add_argument("--delay", type=float, default=2.0, help="seconds between retries")
    p.add_argument("--http-timeout", type=float, default=20.0, help="HTTP request timeout in seconds")
    p.add_argument("--batch", action="store_true", help="append ?batch=1 to endpoints")
    p.add_argument("--aws-profile", default=None, help="AWS profile name for fetching ECS logs (optional)")
    p.add_argument("--cluster", default="", help="ECS cluster name/arn for log lookup")
    p.add_argument("--tasks", default="", help="Comma-separated ECS task IDs to fetch logs from")
    p.add_argument("--skip-delete", action="store_true", help="skip calling delete (useful when only fetching logs)")
    args = p.parse_args()

    session = requests.Session()
    headers = {"Content-Type": "application/json"}

    batch_q = "?batch=1" if args.batch else ""

    login_url = f"{args.base_url.rstrip('/')}/auth.login{batch_q}"
    delete_url = f"{args.base_url.rstrip('/')}/instance.deleteJobs{batch_q}"

    # Step 1: login
    try:
        print(f"Logging in to {login_url} as {args.username}...")
        if args.batch:
            login_body = {"0": {"username": args.username, "password": args.password}}
        else:
            login_body = {"username": args.username, "password": args.password}
        try:
            r = session.post(login_url, json=login_body, headers=headers, timeout=args.http_timeout)
        except Exception as e:
            print(f"Login request failed (timeout/connection): {e}")
            raise
    except Exception as e:
        print("Login request failed:", e)
        sys.exit(2)

    print("Login HTTP status:", r.status_code)
    try:
        print("Login response:", r.json())
    except Exception:
        print("Login raw response:", r.text)

    if r.status_code != 200:
        print("Login failed (non-200). Aborting.")
        sys.exit(3)

    if args.skip_delete:
        print("Skipping delete call as requested (--skip-delete).")
    else:
        # Build TRPC batch payload shape: { "0": { instanceID, jobIDs } }
        job_ids = [j.strip() for j in args.job_ids.split(",") if j.strip()]
        body = {"0": {"instanceID": args.instance_id, "jobIDs": job_ids}}

        attempt = 0
        while attempt < args.attempts:
            attempt += 1
            try:
                print(f"Attempt {attempt}/{args.attempts}: POST {delete_url} -> {body}")
                resp = session.post(delete_url, json=body, headers=headers, timeout=args.http_timeout)
            except Exception as e:
                print(f"Request error: {e}")
                if attempt < args.attempts:
                    time.sleep(args.delay)
                    continue
                else:
                    sys.exit(4)

            print("Delete HTTP status:", resp.status_code)
            try:
                j = resp.json()
                print("Delete response JSON:", j)
            except Exception:
                print("Delete raw response:", resp.text)

            if resp.status_code == 200:
                print("Delete request completed; inspect response above for success/failure details.")
                break
            else:
                print("Non-200 response. Retrying after delay." if attempt < args.attempts else "Non-200 final response.")
                if attempt < args.attempts:
                    time.sleep(args.delay)

    # Optionally fetch ECS/CloudWatch logs
    if boto3 is not None:
        task_list = [t.strip() for t in args.tasks.split(",") if t.strip()]
        if task_list:
            fetch_ecs_logs(args.cluster, task_list, args.aws_profile)
    else:
        print("boto3 not installed; skipping ECS log fetch. Install with: pip install boto3")


def fetch_ecs_logs(cluster: str, task_ids: List[str], profile: Optional[str] = None):
    if boto3 is None:
        print("boto3 is not installed. Install with: pip install boto3")
        return

    try:
        session = boto3.Session(profile_name=profile) if profile else boto3.Session()
        ecs = session.client("ecs")
        logs = session.client("logs")
    except (BotoCoreError, ClientError) as e:
        print("AWS client init error:", e)
        return

    for tid in task_ids:
        print(f"\n--- Logs for task {tid} ---")
        try:
            resp = ecs.describe_tasks(cluster=cluster, tasks=[tid])
            tasks = resp.get("tasks", [])
            if not tasks:
                print(f"No task {tid} found in cluster {cluster}")
                continue

            task = tasks[0]
            task_def_arn = task.get("taskDefinitionArn")
            if not task_def_arn:
                print("No taskDefinitionArn available for task", tid)
                continue

            td = ecs.describe_task_definition(taskDefinition=task_def_arn)
            containers = td.get("taskDefinition", {}).get("containerDefinitions", [])

            for c in containers:
                name = c.get("name")
                logcfg = c.get("logConfiguration") or {}
                driver = logcfg.get("logDriver")
                options = logcfg.get("options") or {}
                if driver != "awslogs":
                    print(f"Container {name} uses log driver {driver}; skipping CloudWatch fetch")
                    continue

                group = options.get("awslogs-group")
                prefix = options.get("awslogs-stream-prefix")
                if not group:
                    print(f"No awslogs-group for container {name}")
                    continue

                # Common stream name patterns: {prefix}/{containerName}/{taskId}
                candidates = []
                if prefix:
                    candidates.append(f"{prefix}/{name}/{tid}")
                    candidates.append(f"{prefix}/{tid}")
                    candidates.append(f"{prefix}/{name}")
                candidates.append(f"{name}/{tid}")
                candidates.append(tid)

                stream_name = None
                for cand in candidates:
                    try:
                        desc = logs.describe_log_streams(logGroupName=group, logStreamNamePrefix=cand, orderBy="LastEventTime", descending=True, limit=1)
                        s = desc.get("logStreams", [])
                        if s:
                            stream_name = s[0]["logStreamName"]
                            break
                    except Exception:
                        continue

                if not stream_name:
                    # Fallback #1: try to find streams whose name contains the task id
                    try:
                        itr = logs.describe_log_streams(logGroupName=group, orderBy="LastEventTime", descending=True, limit=50)
                        for s in itr.get("logStreams", []):
                            n = s.get("logStreamName", "")
                            if tid in n or name in n:
                                stream_name = n
                                break
                    except Exception:
                        pass

                if not stream_name:
                    # Fallback #2: use filter_log_events to search for the task id across streams
                    try:
                        resp_f = logs.filter_log_events(logGroupName=group, filterPattern=tid, limit=200)
                        events = resp_f.get("events", [])
                        if events:
                            print(f"Found {len(events)} matching events for '{tid}' via filter_log_events:")
                            for ev in events:
                                print(ev.get("message"))
                            continue
                    except Exception:
                        pass

                if not stream_name:
                    print(f"No log stream found for container {name} with prefixes {candidates} in group {group}")
                    continue

                print(f"Fetching logs from group={group} stream={stream_name}")
                try:
                    events = logs.get_log_events(logGroupName=group, logStreamName=stream_name, limit=200, startFromHead=False)
                    for ev in events.get("events", []):
                        ts = ev.get("timestamp")
                        msg = ev.get("message")
                        print(msg)
                except Exception as e:
                    print("Failed to get log events:", e)
        except Exception as e:
            print(f"Error processing task {tid}: {e}")
            continue


if __name__ == "__main__":
    # Allow running as standalone to fetch logs only or to delete+fetch
    args = None
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument("--aws-profile", default=None)
        parser.add_argument("--cluster", default="Crackosaurus-bleeding-EcsCluster97242B84-REwV0f2sZheQ")
        parser.add_argument("--tasks", default="96fbd3f528c14c17825a8755d2c0a59e,d83a8b264b4449fe8390d481ef375aac")
        parser.add_argument("--skip-delete", action="store_true")
        parsed, _ = parser.parse_known_args()
        args = parsed
    except Exception:
        args = None

    if args is None or not getattr(args, "skip_delete", False):
        main()

    if args and (args.aws_profile or args.cluster or args.tasks):
        task_list = [t.strip() for t in args.tasks.split(",") if t.strip()]
        fetch_ecs_logs(args.cluster, task_list, args.aws_profile)

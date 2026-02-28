#!/usr/bin/env python3
"""
Cleanup script for orphaned jobs (jobs with no hashes).
This script finds jobs that have approvalStatus='APPROVED' but no associated hashes,
and marks them as Error or deletes them.

Usage:
    python scripts/cleanup_orphaned_jobs.py --mark-error   # Mark orphaned jobs as Error
    python scripts/cleanup_orphaned_jobs.py --delete       # Delete orphaned jobs
    python scripts/cleanup_orphaned_jobs.py --list         # Just list orphaned jobs
"""

import argparse
import sys
import requests
import json
import os

# Server endpoint (adjust if needed)
SERVER_URL = os.getenv("SERVER_URL", "http://localhost:8080")

def list_orphaned_jobs():
    """Query the database for jobs with no hashes."""
    # This is a placeholder - you'll need to implement a tRPC endpoint or direct DB query
    # For now, we'll just show what the script would do
    print("To implement: Query database for jobs where:")
    print("  - approvalStatus = 'APPROVED'")
    print("  - No associated hashes (join with Hash table)")
    print("\nYou can run this SQL query directly:")
    print("""
    SELECT j."JID", j."instanceType", j."wordlistId", j."status", j."approvalStatus"
    FROM "Job" j
    LEFT JOIN "_HashToJob" hj ON j."JID" = hj."B"
    WHERE j."approvalStatus" = 'APPROVED'
      AND hj."A" IS NULL;
    """)
    return []

def mark_as_error(job_ids):
    """Mark jobs as Error via direct DB update."""
    print(f"Would mark {len(job_ids)} jobs as Error")
    print("Run this SQL:")
    print(f"""
    UPDATE "Job"
    SET "status" = 'Error',
        "rejectionNote" = 'Orphaned job: no hashes associated',
        "updatedAt" = NOW()
    WHERE "JID" IN ({', '.join(f"'{jid}'" for jid in job_ids)});
    """)

def delete_jobs(job_ids):
    """Delete orphaned jobs from database."""
    print(f"Would delete {len(job_ids)} jobs")
    print("Run this SQL:")
    print(f"""
    DELETE FROM "Job"
    WHERE "JID" IN ({', '.join(f"'{jid}'" for jid in job_ids)});
    """)

def main():
    parser = argparse.ArgumentParser(description="Clean up orphaned jobs")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--list", action="store_true", help="List orphaned jobs")
    group.add_argument("--mark-error", action="store_true", help="Mark orphaned jobs as Error")
    group.add_argument("--delete", action="store_true", help="Delete orphaned jobs")
    
    args = parser.parse_args()
    
    # Get list of orphaned jobs
    orphaned_jobs = list_orphaned_jobs()
    
    if args.list:
        if not orphaned_jobs:
            print("No orphaned jobs found (or not implemented yet)")
        else:
            print(f"Found {len(orphaned_jobs)} orphaned jobs:")
            for job in orphaned_jobs:
                print(f"  - {job}")
    
    elif args.mark_error:
        if orphaned_jobs:
            mark_as_error(orphaned_jobs)
        else:
            print("No orphaned jobs to mark as error")
    
    elif args.delete:
        if orphaned_jobs:
            confirm = input(f"Delete {len(orphaned_jobs)} orphaned jobs? (yes/no): ")
            if confirm.lower() == "yes":
                delete_jobs(orphaned_jobs)
            else:
                print("Cancelled")
        else:
            print("No orphaned jobs to delete")

if __name__ == "__main__":
    main()

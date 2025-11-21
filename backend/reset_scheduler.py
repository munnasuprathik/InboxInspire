"""
Complete reset of goal scheduling system
This will:
1. Delete ALL goal messages (pending, sent, failed)
2. Remove all scheduled jobs from APScheduler
3. Force reschedule all active goals with fresh times
"""
import os
import sys
from pymongo import MongoClient
from dotenv import load_dotenv
from datetime import datetime, timezone

# Load environment variables
load_dotenv()

# Connect to MongoDB
MONGO_URL = os.getenv('MONGO_URL')
DB_NAME = os.getenv('DB_NAME', 'inbox_inspire')

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

print("=" * 80)
print("COMPLETE GOAL SCHEDULER RESET")
print("=" * 80)
print("\nWARNING: This will delete ALL goal messages and reset scheduling")
print("Press Enter to continue or Ctrl+C to cancel...")
input()

# Step 1: Delete ALL goal messages
print("\n[1/3] Deleting all goal messages...")
result = db.goal_messages.delete_many({})
print(f"      Deleted {result.deleted_count} messages")

# Step 2: Get all goals and show them
print("\n[2/3] Found goals:")
goals = list(db.goals.find({}, {"_id": 0}))
for i, goal in enumerate(goals, 1):
    status = "ACTIVE" if goal.get('active') else "INACTIVE"
    print(f"      {i}. {goal.get('title', 'Untitled')} [{status}]")
    print(f"         User: {goal.get('user_email')}")
    schedules = goal.get('schedules', [])
    for j, schedule in enumerate(schedules, 1):
        times = schedule.get('times', [])
        print(f"         Schedule {j}: {schedule.get('type', 'N/A')} at {times}")

# Step 3: Update all goals to trigger rescheduling
print(f"\n[3/3] Updating {len(goals)} goal(s) to trigger rescheduling...")
for goal in goals:
    db.goals.update_one(
        {"id": goal.get('id')},
        {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )
print("      Done!")

print("\n" + "=" * 80)
print("RESET COMPLETE!")
print("=" * 80)
print("\nNEXT STEPS:")
print("1. Restart the backend server:")
print("   - Press Ctrl+C in the backend terminal")
print("   - Run: python run.py")
print("\n2. The server will automatically:")
print("   - Schedule jobs for all active goals")
print("   - Use the CURRENT schedule times from your goals")
print("   - Create new pending messages")
print("\n3. Check the server logs for:")
print("   - 'Scheduled goal jobs for X active goals'")
print("   - 'Scheduled X jobs for goal...'")
print("\n4. Verify by running: python diagnose_goals.py")
print("=" * 80)

client.close()

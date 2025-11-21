"""
Diagnostic script to check goals and scheduled jobs
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
print("GOALS DIAGNOSTIC REPORT")
print("=" * 80)

# Check all goals
goals = list(db.goals.find({}, {"_id": 0}))
print(f"\nTotal Goals: {len(goals)}")
print(f"   Active Goals: {len([g for g in goals if g.get('active', False)])}")
print(f"   Inactive Goals: {len([g for g in goals if not g.get('active', False)])}")

if goals:
    print("\n" + "=" * 80)
    print("GOAL DETAILS:")
    print("=" * 80)
    for i, goal in enumerate(goals, 1):
        print(f"\n{i}. Goal: {goal.get('title', 'Untitled')}")
        print(f"   ID: {goal.get('id')}")
        print(f"   User: {goal.get('user_email')}")
        print(f"   Active: {goal.get('active', False)}")
        print(f"   Mode: {goal.get('mode', 'N/A')}")
        print(f"   Created: {goal.get('created_at', 'N/A')}")
        
        schedules = goal.get('schedules', [])
        print(f"   Schedules: {len(schedules)}")
        for j, schedule in enumerate(schedules, 1):
            print(f"      {j}. {schedule.get('schedule_name', f'Schedule {j}')}")
            print(f"         Type: {schedule.get('type', 'N/A')}")
            print(f"         Times: {schedule.get('times', [])}")
            print(f"         Days: {schedule.get('days', [])}")
            print(f"         Active: {schedule.get('active', True)}")

# Check goal messages
messages = list(db.goal_messages.find({}, {"_id": 0}).sort("scheduled_for", 1))
print(f"\nTotal Goal Messages: {len(messages)}")
print(f"   Pending: {len([m for m in messages if m.get('status') == 'pending'])}")
print(f"   Sent: {len([m for m in messages if m.get('status') == 'sent'])}")
print(f"   Failed: {len([m for m in messages if m.get('status') == 'failed'])}")

if messages:
    print("\n" + "=" * 80)
    print("UPCOMING MESSAGES (Next 10):")
    print("=" * 80)
    now = datetime.now(timezone.utc)
    upcoming = [m for m in messages if m.get('status') == 'pending'][:10]
    
    if upcoming:
        for i, msg in enumerate(upcoming, 1):
            scheduled = msg.get('scheduled_for', 'N/A')
            if isinstance(scheduled, str):
                try:
                    scheduled_dt = datetime.fromisoformat(scheduled.replace('Z', '+00:00'))
                    time_until = scheduled_dt - now
                    hours = time_until.total_seconds() / 3600
                    scheduled_str = f"{scheduled} ({hours:.1f}h from now)"
                except:
                    scheduled_str = scheduled
            else:
                scheduled_str = str(scheduled)
            
            print(f"\n{i}. Message ID: {msg.get('id')}")
            print(f"   Goal ID: {msg.get('goal_id')}")
            print(f"   User: {msg.get('user_email')}")
            print(f"   Scheduled For: {scheduled_str}")
            print(f"   Status: {msg.get('status')}")
            print(f"   Schedule: {msg.get('schedule_name', 'N/A')}")
    else:
        print("\n   No upcoming pending messages found!")

print("\n" + "=" * 80)
print("RECOMMENDATIONS:")
print("=" * 80)

if not goals:
    print("No goals found in database")
    print("   → Create a goal through the frontend")
elif not any(g.get('active', False) for g in goals):
    print("No active goals found")
    print("   → Activate a goal through the frontend")
elif not messages:
    print("No goal messages scheduled")
    print("   → Check if schedule_goal_jobs_for_goal is being called")
    print("   → Check server logs for scheduling errors")
elif not any(m.get('status') == 'pending' for m in messages):
    print("No pending messages")
    print("   → All messages may have been sent or failed")
    print("   → Try updating a goal to reschedule messages")
else:
    print("Goals and messages look good!")
    print("   → Check if APScheduler is running")
    print("   → Check server logs for job execution")

print("\n" + "=" * 80)
client.close()

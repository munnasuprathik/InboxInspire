"""
Force reschedule all active goals
This will delete all pending messages and create new ones with updated schedule times
"""
import os
import sys
import asyncio
from pymongo import MongoClient
from dotenv import load_dotenv
from datetime import datetime, timezone

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load environment variables
load_dotenv()

# Connect to MongoDB
MONGO_URL = os.getenv('MONGO_URL')
DB_NAME = os.getenv('DB_NAME', 'inbox_inspire')

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

print("=" * 80)
print("FORCE RESCHEDULE ALL GOALS")
print("=" * 80)

# Get all active goals
goals = list(db.goals.find({"active": True}, {"_id": 0}))
print(f"\nFound {len(goals)} active goal(s)")

if not goals:
    print("No active goals to reschedule")
    client.close()
    exit(0)

for goal in goals:
    goal_id = goal.get('id')
    user_email = goal.get('user_email')
    title = goal.get('title', 'Untitled')
    
    print(f"\nProcessing: {title} ({goal_id})")
    
    # Delete all pending messages for this goal
    result = db.goal_messages.delete_many({
        "goal_id": goal_id,
        "status": "pending"
    })
    print(f"  Deleted {result.deleted_count} pending messages")
    
    # Update the goal's updated_at timestamp to trigger rescheduling
    db.goals.update_one(
        {"id": goal_id},
        {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    print(f"  Updated goal timestamp")

print("\n" + "=" * 80)
print("NEXT STEPS:")
print("=" * 80)
print("1. Restart the backend server (Ctrl+C then 'python run.py')")
print("2. The server will automatically reschedule all active goals on startup")
print("3. Check the server logs to confirm jobs are scheduled")
print("4. Or update each goal in the frontend to trigger immediate rescheduling")
print("\nAlternatively, you can update the goal schedule in the frontend,")
print("which will automatically trigger rescheduling without server restart.")
print("=" * 80)

client.close()

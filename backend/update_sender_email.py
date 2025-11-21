"""
Script to update the sender email for all scheduled messages in the database
This will change mail@quiccle.com to nugget@maketend.com
"""
import os
import sys
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Connect to MongoDB
MONGO_URL = os.getenv('MONGO_URL')
DB_NAME = os.getenv('DB_NAME', 'inbox_inspire')

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

OLD_EMAIL = "mail@quiccle.com"
NEW_EMAIL = "nugget@maketend.com"

print(f"Updating sender email from {OLD_EMAIL} to {NEW_EMAIL}...")
print("=" * 60)

# Update message_history collection
result1 = db.message_history.update_many(
    {"sender_email": OLD_EMAIL},
    {"$set": {"sender_email": NEW_EMAIL}}
)
print(f"✅ Updated {result1.modified_count} messages in message_history")

# Update email_logs collection
result2 = db.email_logs.update_many(
    {"sender_email": OLD_EMAIL},
    {"$set": {"sender_email": NEW_EMAIL}}
)
print(f"✅ Updated {result2.modified_count} logs in email_logs")

# Update goal_messages collection if it exists
result3 = db.goal_messages.update_many(
    {"sender_email": OLD_EMAIL},
    {"$set": {"sender_email": NEW_EMAIL}}
)
print(f"✅ Updated {result3.modified_count} messages in goal_messages")

print("=" * 60)
print(f"✅ Total updates: {result1.modified_count + result2.modified_count + result3.modified_count}")
print("Done! All scheduled messages will now use the new sender email.")

client.close()

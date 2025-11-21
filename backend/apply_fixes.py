"""
Apply two fixes to server.py:
1. Change sender name to "Tend"
2. Add recurring scheduler job for primary goal emails
"""

# Read the file
with open('server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: Change sender name
old_from = "msg['From'] = os.getenv('SENDER_EMAIL', smtp_username)"
new_from = 'msg[\'From\'] = f"Tend <{os.getenv(\'SENDER_EMAIL\', smtp_username)}>"'
content = content.replace(old_from, new_from)

# Fix 2: Add recurring scheduler for primary goals
old_schedule = """        await schedule_user_emails()
        logger.info("✅ User email schedules initialized")"""

new_schedule = """        # Schedule primary goal emails (user.goals field) - runs every 5 minutes
        # This ensures users' main goals continue to send emails
        await schedule_user_emails()
        logger.info("✅ User email schedules initialized (primary goals)")
        
        # Add recurring job to keep primary goal emails scheduled
        scheduler.add_job(
            schedule_user_emails,
            trigger='interval',
            minutes=5,  # Run every 5 minutes to maintain schedules
            id='schedule_primary_goal_emails',
            replace_existing=True
        )
        logger.info("✅ Primary goal email scheduler job added (runs every 5 minutes)")"""

content = content.replace(old_schedule, new_schedule)

# Write the file
with open('server.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Successfully applied both fixes to server.py")
print("1. Sender name changed to 'Tend'")
print("2. Primary goal scheduler added as recurring job (every 5 minutes)")

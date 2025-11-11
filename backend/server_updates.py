# Fixes and additions to integrate into server.py

# 1. Add import at top
from version_tracker import VersionTracker

# 2. Initialize version tracker (after tracker = ActivityTracker(db))
version_tracker = VersionTracker(db)

# 3. Fix for email scheduling - create sync wrapper
def send_email_sync_wrapper(user_email: str):
    """Synchronous wrapper for async email sending"""
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(send_motivation_to_user(user_email))
    finally:
        loop.close()

# 4. Replace lambda in schedule_user_emails with:
# scheduler.add_job(
#     send_email_sync_wrapper,
#     CronTrigger(...),
#     args=[email],  # Pass email as argument
#     id=job_id,
#     replace_existing=True
# )

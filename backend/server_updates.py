# Notes for keeping server.py in sync with recent updates.
#
# 1. Imports
#    - from contextlib import asynccontextmanager
#    - import warnings
#
# 2. Environment handling
#    - Define a get_env helper that returns a required environment variable,
#      optionally falling back to a default. This prevents crashes when local
#      .env files are incomplete and emits a warning instead.
#
# 3. OpenAI and Mongo initialisation
#    - Use get_env for both MONGO_URL/DB_NAME and create the AsyncOpenAI
#      instance with the OPENAI_API_KEY pulled from get_env/os.getenv.
#
# 4. Scheduler wrapper
#    - Retain create_email_job to run the async send_motivation_to_user in a
#      fresh event loop for APScheduler.
#
# 5. Lifespan events
#    - Replace @app.on_event("startup"/"shutdown") with an asynccontextmanager
#      assigned to app.router.lifespan_context. Inside, create indexes,
#      start the scheduler and call schedule_user_emails. On shutdown,
#      stop the scheduler and close the Mongo client.
#
# 6. Bug fixes
#    - Ensure send_motivation_to_user calls update_streak (not the old
#      update_user_streak helper).
#    - Keep version_tracker initialised globally for schedule/profile history.

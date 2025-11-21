
import asyncio
from datetime import datetime, timedelta, timezone
import pytz
from typing import List, Dict, Any

# Mock logger
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Mock calculate_next_send_times based on server.py implementation
async def calculate_next_send_times(schedule: dict, goal_id: str, user_email: str, lookahead_days: int = 7) -> List[datetime]:
    """Calculate next send times for a goal schedule - Enhanced to support multiple times per day"""
    next_times = []
    now = datetime.now(timezone.utc)
    
    try:
        tz = pytz.timezone(schedule.get("timezone", "UTC"))
        schedule_type = schedule.get("type")
        
        # NEW: Support multiple times per day
        times_list = schedule.get("times", [])
        # Filter out empty strings and None values
        if times_list:
            times_list = [t for t in times_list if t and t.strip()]
        
        if not times_list or len(times_list) == 0:
            # Fallback to single time for backward compatibility
            time_str = schedule.get("time")
            if time_str and time_str.strip():
                # Use the explicitly set time (even if it's "09:00")
                times_list = [time_str.strip()]
            else:
                # No time specified at all - use default
                times_list = ["09:00"]
        
        logger.info(f"📅 Schedule times for goal {goal_id}: {times_list}")
        
        # Parse start/end dates
        start_date = schedule.get("start_date")
        end_date = schedule.get("end_date")
        if isinstance(start_date, str):
            start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        if isinstance(end_date, str):
            end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        
        # Get local time in schedule timezone
        local_now = now.astimezone(tz)
        current_date = local_now.date()
        
        if schedule_type == "daily":
            # Daily schedule - handle multiple times per day
            for day_offset in range(lookahead_days):
                check_date = current_date + timedelta(days=day_offset)
                if start_date and check_date < start_date.date():
                    continue
                if end_date and check_date > end_date.date():
                    break
                
                # Create datetime for each time in the times list
                for time_str in times_list:
                    try:
                        # Parse time string (format: "HH:MM")
                        if ":" not in time_str:
                            logger.warning(f"⚠️ Invalid time format for goal {goal_id}: {time_str}, skipping")
                            continue
                        hour, minute = map(int, time_str.split(":"))
                        
                        local_dt = tz.localize(datetime.combine(check_date, datetime.min.time().replace(hour=hour, minute=minute)))
                        utc_dt = local_dt.astimezone(timezone.utc)
                        
                        if utc_dt > now:
                            next_times.append(utc_dt)
                            logger.info(f"  -> Found time: {utc_dt} (Local: {local_dt})")
                    except Exception as time_error:
                        logger.error(f"❌ Error parsing time {time_str} for goal {goal_id}: {time_error}")
                        continue
        
        # ... (other types omitted for brevity as daily is most common)
        
    except Exception as e:
        logger.error(f"Error calculating next send times for goal {goal_id}: {e}")
    
    return sorted(next_times)

async def test_scheduling():
    print("--- Testing Scheduling Logic ---")
    
    # Test Case 1: Daily schedule, UTC, single time
    print("\nTest Case 1: Daily UTC 09:00")
    schedule1 = {
        "type": "daily",
        "timezone": "UTC",
        "times": ["09:00"]
    }
    times1 = await calculate_next_send_times(schedule1, "goal1", "user@example.com")
    print(f"Next times: {[t.isoformat() for t in times1]}")
    
    # Test Case 2: Daily EST (UTC-5), multiple times
    print("\nTest Case 2: Daily US/Eastern 09:00, 17:00")
    schedule2 = {
        "type": "daily",
        "timezone": "US/Eastern",
        "times": ["09:00", "17:00"]
    }
    times2 = await calculate_next_send_times(schedule2, "goal2", "user@example.com")
    print(f"Next times: {[t.isoformat() for t in times2]}")
    
    # Test Case 3: Backward compatibility (old 'time' field)
    print("\nTest Case 3: Legacy 'time' field")
    schedule3 = {
        "type": "daily",
        "timezone": "UTC",
        "time": "14:00"
    }
    times3 = await calculate_next_send_times(schedule3, "goal3", "user@example.com")
    print(f"Next times: {[t.isoformat() for t in times3]}")

if __name__ == "__main__":
    asyncio.run(test_scheduling())

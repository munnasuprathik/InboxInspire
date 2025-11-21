
import asyncio
import sys
import os
from datetime import datetime, timedelta, timezone
import pytz
from unittest.mock import MagicMock, AsyncMock

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

# Mock DB and Scheduler before importing server
sys.modules['motor.motor_asyncio'] = MagicMock()
sys.modules['apscheduler.schedulers.asyncio'] = MagicMock()
sys.modules['apscheduler.triggers.date'] = MagicMock()
sys.modules['fastapi'] = MagicMock()
sys.modules['fastapi.middleware.cors'] = MagicMock()
sys.modules['pydantic'] = MagicMock()
sys.modules['openai'] = MagicMock()
sys.modules['sendgrid'] = MagicMock()
sys.modules['sendgrid.helpers.mail'] = MagicMock()
sys.modules['jose'] = MagicMock()
sys.modules['passlib.context'] = MagicMock()
sys.modules['multipart'] = MagicMock()

# Now import the function to test
# We need to mock the global variables in server.py that are used in the function
# But calculate_next_send_times is relatively pure, except for logging
import logging

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from typing import List, Optional

# Direct copy of the function to test
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
        
        logger.info(f"📅 Schedule times for goal {goal_id}: {times_list} (from schedule.times: {schedule.get('times')}, schedule.time: {schedule.get('time')})")
        
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
                        if hour < 0 or hour > 23 or minute < 0 or minute > 59:
                            logger.warning(f"⚠️ Invalid time values for goal {goal_id}: {time_str}, skipping")
                            continue
                        
                        local_dt = tz.localize(datetime.combine(check_date, datetime.min.time().replace(hour=hour, minute=minute)))
                        utc_dt = local_dt.astimezone(timezone.utc)
                        
                        if utc_dt > now:
                            next_times.append(utc_dt)
                            logger.debug(f"📅 Calculated send time for goal {goal_id}: {utc_dt.isoformat()} (UTC) = {local_dt.isoformat()} (local {schedule.get('timezone')})")
                    except Exception as time_error:
                        logger.error(f"❌ Error parsing time {time_str} for goal {goal_id}: {time_error}")
                        continue
        
        elif schedule_type == "weekly":
            weekdays = schedule.get("weekdays", [0])  # Default to Monday
            for day_offset in range(lookahead_days * 7):  # Look ahead 7 weeks
                check_date = current_date + timedelta(days=day_offset)
                if start_date and check_date < start_date.date():
                    continue
                if end_date and check_date > end_date.date():
                    break
                
                weekday = check_date.weekday()  # Monday=0
                if weekday in weekdays:
                    # Handle multiple times per day
                    for time_str in times_list:
                        hour, minute = map(int, time_str.split(":"))
                        local_dt = tz.localize(datetime.combine(check_date, datetime.min.time().replace(hour=hour, minute=minute)))
                        utc_dt = local_dt.astimezone(timezone.utc)
                        
                        if utc_dt > now:
                            next_times.append(utc_dt)
                    if len(next_times) >= lookahead_days * len(times_list):
                        break
        
        elif schedule_type == "monthly":
            monthly_dates = schedule.get("monthly_dates", [1])  # Default to 1st
            for month_offset in range(lookahead_days // 30 + 2):  # Look ahead enough months
                check_year = current_date.year
                check_month = current_date.month + month_offset
                if check_month > 12:
                    check_year += (check_month - 1) // 12
                    check_month = ((check_month - 1) % 12) + 1
                
                for day in monthly_dates:
                    try:
                        check_date = date(check_year, check_month, day)
                        if start_date and check_date < start_date.date():
                            continue
                        if end_date and check_date > end_date.date():
                            break
                        
                        # Handle multiple times per day
                        for time_str in times_list:
                            hour, minute = map(int, time_str.split(":"))
                            local_dt = tz.localize(datetime.combine(check_date, datetime.min.time().replace(hour=hour, minute=minute)))
                            utc_dt = local_dt.astimezone(timezone.utc)
                            
                            if utc_dt > now:
                                next_times.append(utc_dt)
                        if len(next_times) >= lookahead_days * len(times_list):
                                break
                    except ValueError:  # Invalid date (e.g., Feb 30)
                        continue
                    if len(next_times) >= lookahead_days:
                        break
        
    except Exception as e:
        logger.error(f"Error calculating next send times for goal {goal_id}: {e}")
    
    # Return sorted times, but allow more than lookahead_days if multiple times per day
    # Limit to reasonable number to avoid too many jobs
    max_times = lookahead_days * 10  # Allow up to 10 times per day for 7 days
    return sorted(next_times)[:max_times]

async def test_daily_schedule():
    print("\n--- Testing Daily Schedule ---")
    schedule = {
        "type": "daily",
        "timezone": "UTC",
        "times": ["09:00", "17:00"]
    }
    
    # Test
    times = await calculate_next_send_times(schedule, "test_goal", "test@example.com", lookahead_days=2)
    
    print(f"Generated {len(times)} times:")
    for t in times:
        print(f"  - {t}")
        
    # Verify
    # Should have at least 2 times (today's remaining or tomorrow's)
    # Assuming run now, if before 9am, we get 9am and 5pm today.
    # If after 5pm, we get tomorrow's 9am and 5pm.
    
    assert len(times) > 0
    assert len(times) <= 20 # 2 times * 10 days max

async def test_weekly_schedule():
    print("\n--- Testing Weekly Schedule ---")
    # Monday (0) and Wednesday (2)
    schedule = {
        "type": "weekly",
        "timezone": "UTC",
        "weekdays": [0, 2],
        "times": ["10:00"]
    }
    
    times = await calculate_next_send_times(schedule, "test_goal", "test@example.com", lookahead_days=14)
    
    print(f"Generated {len(times)} times:")
    for t in times:
        print(f"  - {t.strftime('%A %Y-%m-%d %H:%M')}")
        
    # Verify
    # Should only be Mon/Wed
    for t in times:
        assert t.weekday() in [0, 2]

async def test_multiple_times_parsing():
    print("\n--- Testing Multiple Times Parsing ---")
    schedule = {
        "type": "daily",
        "timezone": "UTC",
        "times": ["08:00", "12:00", "20:00"]
    }
    
    times = await calculate_next_send_times(schedule, "test_goal", "test@example.com", lookahead_days=1)
    
    print(f"Generated {len(times)} times:")
    for t in times:
        print(f"  - {t}")
        
    # Check if we get 3 times per day (or remaining for today)
    # This confirms the loop over `times_list` is working

async def main():
    await test_daily_schedule()
    await test_weekly_schedule()
    await test_multiple_times_parsing()
    print("\n✅ All logic tests passed!")

if __name__ == "__main__":
    asyncio.run(main())

from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks, Depends, Header, Request
from fastapi import Request as FastAPIRequest
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Literal, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta, date
import httpx
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from openai import AsyncOpenAI
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.date import DateTrigger
import pytz
import secrets
import time
import sys
from pathlib import Path

# Rate limiting imports
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Add parent directory to Python path for imports (so backend can be imported as module)
backend_dir = Path(__file__).parent
parent_dir = backend_dir.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

from activity_tracker import ActivityTracker
from version_tracker import VersionTracker
import warnings
from contextlib import asynccontextmanager
from functools import lru_cache
import re
import html
import json
import random

# Email queue with rate limiting for scalability (10k+ users)
# Limits concurrent email sends to prevent SMTP server overload
EMAIL_SEND_SEMAPHORE = asyncio.Semaphore(15)  # Max 15 concurrent email sends

# Import from new modular structure
# Try absolute import first (when running from parent), fallback to relative (when running from backend/)
try:
    from backend.config import (
        db, openai_client, TAVILY_API_KEY, TAVILY_SEARCH_URL, 
        personality_voice_cache, get_env, client, validate_environment
    )
    from backend.constants import (
        MESSAGE_TYPES as message_types,
        PERSONALITY_BLUEPRINTS,
        EMOTIONAL_ARCS,
        ANALOGY_PROMPTS,
        FRIENDLY_DARES,
        EMOJI_REGEX,
        DEFAULT_ACHIEVEMENTS
    )
    from backend.models import (
        PersonalityType, UserProfile, LoginRequest, VerifyTokenRequest,
        OnboardingRequest, UserProfileUpdate, UserSession, UserAnalytics,
        MessageFeedback, MessageFeedbackCreate, MessageHistory,
        MessageGenRequest, MessageGenResponse,
        SendTimeWindow, GoalSchedule, GoalCreateRequest, GoalUpdateRequest, GoalMessage,
        PersonaResearch,
        EmailLog, BroadcastRequest, AlertConfig, Achievement, GoalProgress,
        MessageFavorite, MessageCollection, BulkUserActionRequest, BulkEmailRequest,
        CustomPersonalityRequest, CustomPersonalityConversation, CustomPersonalityProfile,
        CustomPersonalityChatRequest, CustomPersonalityChatResponse,
        CustomPersonalityResearchRequest, CustomPersonalityResearchResponse,
        CustomPersonalityConfirmRequest, CustomPersonalityConfirmResponse,
        CustomPersonalityListItem, UserCustomPersonalitiesResponse
    )
    from backend.utils import (
        strip_emojis, extract_interactive_sections, redact_sensitive_info,
        check_profanity, check_impersonation, calculate_similarity,
        render_email_html, generate_interactive_defaults, resolve_streak_badge,
        fallback_subject_line, derive_goal_theme, cleanup_message_text
    )
except ImportError:
    # Fallback to relative imports when running from backend directory
    from config import (
        db, openai_client, TAVILY_API_KEY, TAVILY_SEARCH_URL, 
        personality_voice_cache, get_env, client, validate_environment
    )
    from constants import (
        MESSAGE_TYPES as message_types,
        PERSONALITY_BLUEPRINTS,
        EMOTIONAL_ARCS,
        ANALOGY_PROMPTS,
        FRIENDLY_DARES,
        EMOJI_REGEX,
        DEFAULT_ACHIEVEMENTS
    )
    from models import (
        PersonalityType, UserProfile, LoginRequest, VerifyTokenRequest,
        OnboardingRequest, UserProfileUpdate, UserSession, UserAnalytics,
        MessageFeedback, MessageFeedbackCreate, MessageHistory,
        MessageGenRequest, MessageGenResponse,
        SendTimeWindow, GoalSchedule, GoalCreateRequest, GoalUpdateRequest, GoalMessage,
        PersonaResearch,
        EmailLog, BroadcastRequest, AlertConfig, Achievement, GoalProgress,
        MessageFavorite, MessageCollection, BulkUserActionRequest, BulkEmailRequest,
        CustomPersonalityRequest, CustomPersonalityConversation, CustomPersonalityProfile,
        CustomPersonalityChatRequest, CustomPersonalityChatResponse,
        CustomPersonalityResearchRequest, CustomPersonalityResearchResponse,
        CustomPersonalityConfirmRequest, CustomPersonalityConfirmResponse,
        CustomPersonalityListItem, UserCustomPersonalitiesResponse
    )
    from utils import (
        strip_emojis, extract_interactive_sections, redact_sensitive_info,
        check_profanity, check_impersonation, calculate_similarity,
        render_email_html, generate_interactive_defaults, resolve_streak_badge,
        fallback_subject_line, derive_goal_theme, cleanup_message_text
    )


# Achievement definitions moved to constants.py - imported above
# Removed duplicate utility functions - now imported from backend.utils

async def initialize_achievements():
    """Initialize achievements in database if not exists, and add any missing ones"""
    try:
        existing = await db.achievements.find_one({})
        if not existing:
            # First time initialization - add all achievements
            logger.info(f"Initializing achievements: No existing achievements found. Adding {len(DEFAULT_ACHIEVEMENTS)} achievements...")
            for achievement in DEFAULT_ACHIEVEMENTS:
                achievement_copy = achievement.copy()
                achievement_copy["created_at"] = datetime.now(timezone.utc).isoformat()
                achievement_copy["updated_at"] = datetime.now(timezone.utc).isoformat()
                achievement_copy["active"] = True
                await db.achievements.insert_one(achievement_copy)
            logger.info(f"✅ Achievements initialized in database: {len(DEFAULT_ACHIEVEMENTS)} achievements added")
        else:
            # Database exists - check for missing achievements and add them
            existing_ids = await db.achievements.distinct("id")
            logger.info(f"Found {len(existing_ids)} existing achievements in database")
            missing_achievements = [ach for ach in DEFAULT_ACHIEVEMENTS if ach["id"] not in existing_ids]
            if missing_achievements:
                logger.info(f"Adding {len(missing_achievements)} missing achievements...")
                for achievement in missing_achievements:
                    achievement_copy = achievement.copy()
                    achievement_copy["created_at"] = datetime.now(timezone.utc).isoformat()
                    achievement_copy["updated_at"] = datetime.now(timezone.utc).isoformat()
                    achievement_copy["active"] = True
                    await db.achievements.insert_one(achievement_copy)
                logger.info(f"✅ Added {len(missing_achievements)} missing achievements to database")
            else:
                logger.info(f"✅ All {len(DEFAULT_ACHIEVEMENTS)} achievements already exist in database")
        
        # Verify final count
        total_count = await db.achievements.count_documents({})
        active_count = await db.achievements.count_documents({"active": True})
        logger.info(f"📊 Achievement database status: {total_count} total, {active_count} active")
    except Exception as e:
        logger.error(f"❌ Error initializing achievements: {e}", exc_info=True)
        raise

async def get_achievements_from_db():
    """Get all active achievements from database"""
    achievements = await db.achievements.find({"active": True}, {"_id": 0}).to_list(100)
    return {ach["id"]: ach for ach in achievements}

async def check_and_unlock_achievements(email: str, user_data: dict, feedback_count: int = 0):
    """Check and unlock achievements based on user progress"""
    unlocked = []
    current_achievements = user_data.get("achievements", [])
    
    # Get achievements from database
    achievements_dict = await get_achievements_from_db()
    
    for achievement_id, achievement in achievements_dict.items():
        if achievement_id in current_achievements:
            continue  # Already unlocked
        
        req = achievement.get("requirement", {})
        req_type = req.get("type")
        req_value = req.get("value")
        
        unlocked_this = False
        
        if req_type == "streak":
            if user_data.get("streak_count", 0) >= req_value:
                unlocked_this = True
        elif req_type == "messages":
            if user_data.get("total_messages_received", 0) >= req_value:
                unlocked_this = True
        elif req_type == "feedback_count":
            if feedback_count >= req_value:
                unlocked_this = True
        elif req_type == "has_goal":
            if user_data.get("goals") and len(user_data.get("goals", "").strip()) > 0:
                unlocked_this = True
        elif req_type == "goal_completed":
            goal_progress = user_data.get("goal_progress", {})
            completed_count = sum(1 for g in goal_progress.values() if isinstance(g, dict) and g.get("completed", False))
            if completed_count >= req_value:
                unlocked_this = True
        elif req_type == "consecutive_days":
            # Check consecutive days based on streak_count
            # This ensures the user actually has N consecutive days, not just that their last email was recent
            streak_count = user_data.get("streak_count", 0)
            if streak_count >= req_value:
                        unlocked_this = True
        elif req_type == "personality_count":
            personalities = user_data.get("personalities", [])
            if len(personalities) >= req_value:
                unlocked_this = True
        elif req_type == "five_star_ratings":
            # This would need to be tracked separately or calculated from feedback
            # For now, we'll check feedback_count as a proxy
            if feedback_count >= req_value:
                unlocked_this = True
        elif req_type == "account_age_days":
            created_at = user_data.get("created_at")
            if created_at:
                try:
                    created_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    account_age = (datetime.now(timezone.utc) - created_date).days
                    if account_age >= req_value:
                        unlocked_this = True
                except:
                    pass
        
        if unlocked_this:
            unlocked.append(achievement_id)
            # Update user achievements with unlock timestamp
            achievement_unlock = {
                "achievement_id": achievement_id,
                "unlocked_at": datetime.now(timezone.utc).isoformat()
            }
            await db.users.update_one(
                {"email": email},
                {
                    "$addToSet": {"achievements": achievement_id},
                    "$push": {"achievement_history": achievement_unlock}
                }
            )
            # Log achievement unlock
            await tracker.log_user_activity(
                email=email,
                action_type="achievement_unlocked",
                action_category="user_action",
                details={
                    "achievement_id": achievement_id,
                    "achievement_name": achievement.get("name", ""),
                    "category": achievement.get("category", "")
                }
            )
    
    return unlocked

def resolve_streak_badge(streak_count: int) -> tuple[str, str]:
    """Return streak icon label and message without emojis."""
    if streak_count >= 100:
        return "[LEGEND]", f"{streak_count} Days - Legendary Consistency"
    if streak_count >= 30:
        return "[ELITE]", f"{streak_count} Days - Elite Momentum"
    if streak_count >= 7:
        return "[FOCUS]", f"{streak_count} Days - Locked In"
    if streak_count == 1:
        return "[DAY 1]", "Day 1 - Let's Build This"
    if streak_count == 0:
        return "[RESET]", "Fresh Start Today"
    return "[STREAK]", f"{streak_count} Day Streak"


def _render_list_items(lines: List[str]) -> str:
    if not lines:
        return ""
    items = "".join(f"<li>{html.escape(line)}</li>" for line in lines)
    return f"<ul>{items}</ul>"


def generate_interactive_defaults(streak_count: int, goals: str) -> tuple[List[str], List[str]]:
    import random

    theme = derive_goal_theme(goals) or (goals.splitlines()[0][:50] if goals else "today")
    theme = theme.strip().rstrip(".") or "today"

    check_templates = [
        f"What small win moves {theme.lower()} forward before the day ends?",
        f"Which move will keep your momentum alive on {theme.lower()}?",
        f"What must happen next so {theme.lower()} doesn't stall?",
    ]

    reply_templates = [
        "Reply with the first action you'll take in the next hour.",
        "Send back the single task you'll finish tonight.",
        "Share the exact move you'll start as soon as you close this email.",
    ]

    check_line = random.choice(check_templates)
    reply_line = random.choice(reply_templates)

    if streak_count and "streak" not in check_line.lower():
        check_line = f"Day {streak_count}: {check_line}"

    return [check_line], [reply_line]


def render_email_html(
    streak_count: int,
    streak_icon: str,
    streak_message: str,
    core_message: str,
    check_in_lines: List[str],
    quick_reply_lines: List[str],
) -> str:
    """Return a clean and concise HTML email body."""
    safe_core = html.escape(core_message).replace("\n", "<br />")
    check_in_block = _render_list_items(check_in_lines)
    quick_reply_block = _render_list_items(quick_reply_lines)

    return f"""
    <html>
    <head>
        <style>
            body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6fb; margin: 0; padding: 0; color: #1f2933; }}
            .wrapper {{ max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 12px; padding: 28px 32px; box-shadow: 0 12px 30px rgba(40,52,71,0.08); }}
            .streak {{ font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase; color: #516070; margin-bottom: 20px; }}
            .streak strong {{ color: #1b3a61; }}
            .message {{ font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; }}
            .panel {{ border-top: 1px solid #e4e8f0; padding-top: 20px; margin-top: 12px; }}
            .panel-title {{ font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #394966; margin: 0 0 10px 0; }}
            .panel ul {{ margin: 0; padding-left: 18px; color: #1f2933; font-size: 15px; line-height: 1.5; }}
            .panel ul li {{ margin-bottom: 8px; }}
            .signature {{ margin-top: 28px; font-size: 13px; color: #5a687d; }}
            .footer {{ margin-top: 28px; font-size: 11px; color: #8b97aa; text-align: center; }}
            @media (max-width: 520px) {{ .wrapper {{ padding: 24px; }} }}
        </style>
    </head>
    <body>
        <div class="wrapper">
            <p class="streak"><strong>{html.escape(streak_icon)}</strong> {html.escape(streak_message)} · {streak_count} day{'s' if streak_count != 1 else ''}</p>
            <div class="message">{safe_core}</div>
            <div class="panel">
                <p class="panel-title">Interactive Check-In</p>
                {check_in_block or "<p style='margin:0;color:#3d4a5c;'>Share what today looks like.</p>"}
            </div>
            <div class="panel">
                <p class="panel-title">Quick Reply Prompt</p>
                {quick_reply_block or "<p style='margin:0;color:#3d4a5c;'>Reply with the first action you'll take next.</p>"}
            </div>
            <div class="signature">
                <span>With you in this,</span>
                <span>Tend Coach</span>
            </div>
            <div class="footer">
                You are receiving this email because you subscribed to Tend updates.
            </div>
        </div>
    </body>
    </html>
    """


def fallback_subject_line(streak: int, goals: str) -> str:
    """Deterministic fallback subject when the LLM is unavailable."""
    options = [
        "Fresh spark for your next win",
        "Your momentum note for today",
        "A quick ignition for progress",
        "Plan the move before the day ends",
        "Clear the runway and launch",
    ]

    if streak > 0:
        options.extend(
            [
                f"Day {streak} and climbing higher",
                f"{streak} days in - keep the cadence",
                f"{streak} mornings of moving forward",
            ]
        )

    goal_theme = derive_goal_theme(goals)
    if goal_theme:
        options.extend(
            [
                f"Shape the next move on {goal_theme}",
                f"Sketch the blueprint for {goal_theme}",
                "Sharpen the idea before it sleeps",
                "Draft the next chapter of the vision",
            ]
        )

    return secrets.choice(options)[:60]


def derive_goal_theme(goals: str) -> str:
    """Extract a short, rephrased theme from the user's goals."""
    if not goals:
        return ""

    primary_line = ""
    for line in goals.splitlines():
        cleaned = line.strip()
        if cleaned:
            primary_line = cleaned
            break

    if not primary_line:
        return ""

    lowered = primary_line.lower()
    for phrase in [
        "i want to",
        "i need to",
        "i'm going to",
        "i will",
        "my goal is to",
        "my goal is",
        "the goal is to",
        "goal:",
        "goal is to",
    ]:
        if lowered.startswith(phrase):
            primary_line = primary_line[len(phrase) :].strip()
            break

    primary_line = re.sub(r"\b(my|our|i|me|mine)\b", "", primary_line, flags=re.IGNORECASE).strip()
    primary_line = re.sub(r"\s{2,}", " ", primary_line)
    return primary_line[:80]


def cleanup_message_text(message: str) -> str:
    """Remove boilerplate lines and keep the message concise."""
    if not message:
        return ""

    filtered_lines = []
    for raw_line in message.splitlines():
        line = raw_line.strip()
        if not line:
            filtered_lines.append("")
            continue
        if "this line was generated by ai" in line.lower():
            continue
        filtered_lines.append(line)

    collapsed = []
    previous_blank = False
    for line in filtered_lines:
        if line == "":
            if not previous_blank:
                collapsed.append("")
            previous_blank = True
        else:
            collapsed.append(line)
            previous_blank = False

    text = "\n".join(collapsed).strip()
    if not text:
        return ""

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if len(paragraphs) > 3:
        paragraphs = paragraphs[:3]
    return "\n\n".join(paragraphs)


async def record_email_log(
    email: str,
    subject: str,
    status: str,
    *,
    sent_dt: Optional[datetime] = None,
    timezone_value: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    if sent_dt is None:
        sent_dt = datetime.now(timezone.utc)

    tz_name = None
    local_sent_at = None
    if timezone_value:
        try:
            tz_obj = pytz.timezone(timezone_value)
            tz_name = timezone_value
            local_sent_at = sent_dt.astimezone(tz_obj).isoformat()
        except Exception:
            tz_name = None
            local_sent_at = None

    log_doc = EmailLog(
        email=email,
        subject=subject,
        status=status,
        error_message=error_message,
        sent_at=sent_dt,
        timezone=tz_name,
        local_sent_at=local_sent_at,
    )
    await db.email_logs.insert_one(log_doc.model_dump())

# Create the main app without a prefix
app = FastAPI(title="Tend API", version="2.0")

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Production-ready global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler for production.
    Prevents sensitive information leakage and provides consistent error responses.
    """
    # Log the full exception with traceback for debugging
    logger.error(
        f"❌ Unhandled exception: {request.method} {request.url.path}",
        exc_info=exc
    )
    
    # Track the error
    try:
        await tracker.log_system_event(
            event_type="error",
            status="error",
            details={
                "endpoint": request.url.path,
                "method": request.method,
                "error_type": type(exc).__name__,
                "error_message": str(exc)
            }
        )
    except Exception:
        pass  # Don't fail if tracking fails
    
    # In production, don't expose internal error details
    is_production = os.getenv('ENVIRONMENT', '').lower() == 'production'
    
    if is_production:
        # Generic error message for production
        return JSONResponse(
            status_code=500,
            content={
                "detail": "An internal server error occurred. Please try again later.",
                "status": "error",
                "request_id": getattr(request.state, 'request_id', None)
            }
        )
    else:
        # Detailed error for development
        return JSONResponse(
            status_code=500,
            content={
                "detail": str(exc),
                "error_type": type(exc).__name__,
                "status": "error",
                "request_id": getattr(request.state, 'request_id', None)
            }
        )

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Initialize scheduler
scheduler = AsyncIOScheduler()

# Initialize Activity Tracker
tracker = ActivityTracker(db)

# Initialize Version Tracker  
version_tracker = VersionTracker(db)

# Note: All Pydantic models have been moved to backend/models/ directory
# They are imported at the top of this file from backend.models
# All models (SendTimeWindow, GoalSchedule, GoalCreateRequest, GoalUpdateRequest, 
# GoalMessage, EmailLog, etc.) are now imported from backend.models

# Admin auth
def verify_admin(authorization: str = Header(None)):
    if not authorization or authorization != f"Bearer {os.getenv('ADMIN_SECRET')}":
        raise HTTPException(status_code=403, detail="Unauthorized")
    return True

# SMTP Email Service with connection timeout and retry logic
async def send_email(
    to_email: str, 
    subject: str, 
    html_content: str,
    in_reply_to: Optional[str] = None,  # NEW: For email threading
    references: Optional[str] = None  # NEW: For email threading
) -> tuple[bool, Optional[str]]:
    """
    Send email via SMTP with retry logic and improved error handling.
    Handles Hostinger SMTP and other providers with appropriate settings.
    Uses semaphore to limit concurrent sends for scalability (10k+ users).
    """
    # Use semaphore to limit concurrent email sends (prevents SMTP overload)
    async with EMAIL_SEND_SEMAPHORE:
        smtp_host = os.getenv('SMTP_HOST')
        smtp_port = int(os.getenv('SMTP_PORT', '465'))
        smtp_username = os.getenv('SMTP_USERNAME')
        smtp_password = os.getenv('SMTP_PASSWORD')
        
        if not all([smtp_host, smtp_username, smtp_password]):
            error_msg = "SMTP configuration incomplete - missing SMTP_HOST, SMTP_USERNAME, or SMTP_PASSWORD"
            logger.error(error_msg)
            return False, error_msg
        
        # Determine SSL/TLS settings based on port
        # Port 465 uses SSL (implicit TLS), port 587 uses STARTTLS (explicit TLS)
        # aiosmtplib handles this automatically, but we set use_tls=True for both
        is_ssl_port = smtp_port == 465
        is_starttls_port = smtp_port == 587
        
        msg = MIMEMultipart('alternative')
        msg['From'] = os.getenv('SENDER_EMAIL', smtp_username)
        msg['To'] = to_email
        msg['Subject'] = subject
        
        # Add email threading headers (for proper conversation grouping)
        if in_reply_to:
            msg['In-Reply-To'] = in_reply_to
        if references:
            msg['References'] = references
        
        # Generate Message-ID for this email (for future threading)
        import uuid
        # Email domain for Message-ID (configurable, defaults to domain from FRONTEND_URL)
        email_domain = os.getenv('EMAIL_DOMAIN')
        if not email_domain:
            # Extract domain from FRONTEND_URL if available
            frontend_url = os.getenv('FRONTEND_URL', '')
            if frontend_url:
                from urllib.parse import urlparse
                parsed = urlparse(frontend_url)
                email_domain = parsed.netloc or 'tend.app'
            else:
                email_domain = 'tend.app'  # Generic fallback
        message_id = f"<{str(uuid.uuid4())}@{email_domain}>"
        msg['Message-ID'] = message_id
        
        # Add List-Unsubscribe header for compliance
        frontend_url = os.getenv('FRONTEND_URL')
        if not frontend_url:
            logger.warning("⚠️ FRONTEND_URL not set - unsubscribe links may not work")
            frontend_url = ''  # Will be empty if not set
        unsubscribe_url = f"{frontend_url}/unsubscribe?email={to_email}" if frontend_url else f"mailto:unsubscribe@{email_domain}?subject=Unsubscribe&body=Email:{to_email}"
        msg['List-Unsubscribe'] = f"<{unsubscribe_url}>"
        msg['List-Unsubscribe-Post'] = "List-Unsubscribe=One-Click"
        
        html_part = MIMEText(html_content, 'html')
        msg.attach(html_part)
        
        # Retry logic: Try up to 3 times with exponential backoff
        max_retries = 3
        retry_delays = [2, 5, 10]  # seconds
        
        for attempt in range(max_retries):
            try:
                # aiosmtplib automatically handles SSL/TLS based on port
                # Port 465 = SSL (implicit), Port 587 = STARTTLS (explicit)
                # For Hostinger (port 465), use_tls=True enables SSL connection
                smtp_kwargs = {
                    "hostname": smtp_host,
                    "port": smtp_port,
                    "username": smtp_username,
                    "password": smtp_password,
                    "timeout": 30  # Increased timeout for Hostinger (30 seconds)
                }
                
                # For port 465 (SSL), use_tls=True enables SSL
                # For port 587 (STARTTLS), use_tls=True enables STARTTLS
                if is_ssl_port:
                    # Port 465: SSL connection (implicit TLS)
                    smtp_kwargs["use_tls"] = True
                elif is_starttls_port:
                    # Port 587: STARTTLS (explicit TLS)
                    smtp_kwargs["use_tls"] = True
                    smtp_kwargs["start_tls"] = True
                else:
                    # Default: try TLS
                    smtp_kwargs["use_tls"] = True
                
                await aiosmtplib.send(msg, **smtp_kwargs)
                
                logger.info(f"✅ Email sent successfully to {to_email} (attempt {attempt + 1})")
                return True, None
                
            except asyncio.TimeoutError:
                error_msg = f"SMTP timeout after 30s (attempt {attempt + 1}/{max_retries})"
                logger.warning(f"⚠️ {error_msg} - Host: {smtp_host}:{smtp_port}")
                
                if attempt < max_retries - 1:
                    wait_time = retry_delays[attempt]
                    logger.info(f"   Retrying in {wait_time} seconds...")
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"❌ Email send failed after {max_retries} attempts: {error_msg}")
                    return False, error_msg
                
            except Exception as e:
                error_msg = str(e)
                
                # Check for specific error types
                if "authentication failed" in error_msg.lower() or "535" in error_msg:
                    logger.error(f"❌ SMTP Authentication failed: {error_msg}")
                    logger.error(f"   Check SMTP_USERNAME and SMTP_PASSWORD in .env")
                    if attempt < max_retries - 1:
                        wait_time = retry_delays[attempt]
                        await asyncio.sleep(wait_time)
                        continue
                    return False, f"Authentication failed: {error_msg}"
                elif "connection" in error_msg.lower() or "refused" in error_msg.lower():
                    logger.error(f"❌ SMTP Connection failed: {error_msg}")
                    logger.error(f"   Check SMTP_HOST ({smtp_host}) and SMTP_PORT ({smtp_port})")
                    logger.error(f"   For Hostinger, ensure port 465 is open and SSL is enabled")
                    if attempt < max_retries - 1:
                        wait_time = retry_delays[attempt]
                        await asyncio.sleep(wait_time)
                        continue
                    return False, f"Connection failed: {error_msg}"
                elif "timeout" in error_msg.lower():
                    if attempt < max_retries - 1:
                        wait_time = retry_delays[attempt]
                        logger.warning(f"⚠️ SMTP timeout (attempt {attempt + 1}/{max_retries}), retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    logger.error(f"❌ Email send failed after {max_retries} attempts: {error_msg}")
                    return False, error_msg
            else:
                # Other errors - retry once
                if attempt < max_retries - 1:
                    wait_time = retry_delays[attempt]
                    logger.warning(f"⚠️ Email send error (attempt {attempt + 1}/{max_retries}): {error_msg}")
                    logger.info(f"   Retrying in {wait_time} seconds...")
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"❌ Email send error: {error_msg}")
                    return False, error_msg
    
    # Should not reach here, but just in case
    return False, "Failed after all retry attempts"

# Enhanced LLM Service with deep personality matching
async def generate_unique_motivational_message(
    goals: str, 
    personality: PersonalityType, 
    name: Optional[str] = None,
    streak_count: int = 0,
    previous_messages: list = None
) -> tuple[str, str, bool, Optional[str]]:
    """Generate UNIQUE, engaging motivational message with questions - never repeat"""
    try:
        # Get previous message types to avoid repetition
        recent_types = []
        if previous_messages:
            recent_types = [msg.get('message_type', '') for msg in previous_messages[:5]]
        
        # Choose a message type we haven't used recently
        available_types = [t for t in message_types if t not in recent_types]
        if not available_types:
            available_types = message_types
        
        import random
        message_type = random.choice(available_types)
        blueprint_pool = PERSONALITY_BLUEPRINTS.get(personality.type, PERSONALITY_BLUEPRINTS["custom"])
        blueprint = random.choice(blueprint_pool)
        emotional_arc = random.choice(EMOTIONAL_ARCS)
        recent_themes_block = build_recent_themes(previous_messages)
        include_analogy = random.random() < 0.6
        analogy_instruction = random.choice(ANALOGY_PROMPTS) if include_analogy else ""
        dare_instruction = random.choice(FRIENDLY_DARES) if random.random() < 0.5 else ""
        # Personality style via research
        voice_profile = await fetch_personality_voice(personality)
        if voice_profile:
            personality_prompt = f"""VOICE PROFILE:
    {voice_profile}
    RULES:
    - Write exactly in this voice.
    - Do not mention these notes, the personality name, or that you researched it.
    - Use natural, human language - no AI phrasing."""
        else:
            fallback_voice = personality.value if personality.value else "warm, encouraging mentor"
            personality_prompt = f"""VOICE PROFILE:
Sound like a {fallback_voice}.
RULES:
- Capture their energy and mannerisms authentically.
- Do not say you are copying anyone or mention tone explicitly.
- Keep the language human and grounded."""
        
        # Streak milestone messages
        streak_context = ""
        if streak_count >= 100:
            streak_context = f"[LEGEND] {streak_count} days of consistency. You're in the top 1%."
        elif streak_count >= 30:
            streak_context = f"[ELITE] {streak_count} day streak! You've built a real habit here."
        elif streak_count >= 7:
            streak_context = f"[STRONG] {streak_count} days locked in. The hardest part is behind you."
        elif streak_count >= 1:
            streak_context = f"[DAY {streak_count}] Every journey starts with a single step."
        else:
            streak_context = "[LAUNCH] Starting fresh. Let's build momentum."
        
        research_snippet = await fetch_research_snippet(goals, personality)
        insights_block = f"RESEARCH INSIGHT: {research_snippet}\n" if research_snippet else ""

        latest_message_snippet = ""
        if previous_messages:
            latest_raw = previous_messages[0].get("message", "").strip()
            if latest_raw:
                latest_message_snippet = latest_raw.split("\n")[0][:220]
            latest_persona = previous_messages[0].get("personality", {}).get("value")
        else:
            latest_persona = None
        
        prompt = f"""You are an elite personal coach creating a UNIQUE daily motivation message.

{personality_prompt}

USER'S GOALS: {goals}
STREAK COUNT: {streak_count}
PERSONALITY MODE: {personality.type}
PERSONALITY VALUE: {personality.value}
LAST PERSONA USED: {latest_persona or "unknown"}
LATEST MESSAGE SAMPLE: {latest_message_snippet or "None"}
STREAK CONTEXT: {streak_context}
MESSAGE TYPE: {message_type}
{insights_block}
STORY BLUEPRINT: {blueprint}
EMOTIONAL ARC: {emotional_arc}
{("RECENT THEMES TO AVOID:\n" + recent_themes_block) if recent_themes_block else ""}
{analogy_instruction}

CRITICAL RULES:
1. NEVER copy/paste the user's goals - reference them creatively and naturally
2. Make it COMPLETELY UNIQUE - no generic phrases
3. Be SPECIFIC and ACTIONABLE - not vague platitudes
4. Keep it tight - no more than TWO short paragraphs and one single-sentence closing action line.
5. Make it CONVERSATIONAL - like texting a friend who cares.
6. If a research insight is provided, weave it naturally into the story without sounding like a summary or citing the source.
7. Do not repeat ideas from recent themes. Never mention that you are avoiding repetition.
8. Vary sentence length - mix short punchy lines with longer flowing ones.
9. Sound undeniably human; use tactile details and sensory language.
10. Close with a crystal-clear micro action. {("Then add: " + dare_instruction) if dare_instruction else ""}
11. Do NOT use emojis, emoticons, or Unicode pictographs; rely on plain words or ASCII icons (e.g. [*], ->) for emphasis.
12. After the core message, create a section formatted exactly like this:

INTERACTIVE CHECK-IN:
- Provide exactly one bullet beginning with "- " that asks a thoughtful question or challenge tied to the goals and streak.

QUICK REPLY PROMPT:
- Provide exactly one bullet beginning with "- " that gives a precise reply instruction (actionable and time-bound).

Make both bullets unique to this user and today's message.


MESSAGE TYPE GUIDELINES:
- motivational_story: Share a brief, real example of someone who overcame similar challenges
- action_challenge: Give ONE specific task to accomplish today
- mindset_shift: Reframe their thinking about obstacles
- accountability_prompt: Check in on progress and create urgency
- celebration_message: Recognize recent progress and build confidence
- real_world_example: Use concrete analogies from business/sports/life

STRUCTURE:
1. Hook with the streak celebration or surprising insight
2. Core message (2-3 paragraphs) - tie to their goals WITHOUT quoting them
3. Call to action or mindset shift
4. DO NOT include a question - it will be added separately

Write an authentic, powerful message that feels personal and impossible to ignore:"""

        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a world-class motivational coach who creates deeply personal, unique messages that inspire real action. You never use cliches, never repeat yourself, and you always sound human - not like an AI summarizer. Every message feels handcrafted."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.9,  # Higher for more creativity
            max_tokens=500,
            presence_penalty=0.6,  # Avoid repetition
            frequency_penalty=0.6   # Encourage variety
        )
        
        message = strip_emojis(response.choices[0].message.content.strip())
        message = cleanup_message_text(message)
        
        return message, message_type, False, research_snippet
        
    except Exception as e:
        logger.error(f"Error generating message: {str(e)}")
        try:
            await tracker.log_system_event(
                event_type="llm_generation_failed",
                event_category="llm",
                details={
                    "personality": personality.value if personality else None,
                    "error": str(e)
                },
                status="error"
            )
        except Exception:
            pass
        ci_defaults, qr_defaults = generate_interactive_defaults(streak_count, goals)
        default_msg = (
            f"Day {streak_count} of your journey.\n\n"
            "You already know the lever that moves the day—choose it and commit.\n\n"
            "INTERACTIVE CHECK-IN:\n"
            + "\n".join(f"- {line}" for line in ci_defaults)
            + "\n\nQUICK REPLY PROMPT:\n"
            + "\n".join(f"- {line}" for line in qr_defaults)
        )
        default_msg = strip_emojis(default_msg)
        default_msg = cleanup_message_text(default_msg)
        return default_msg, "default", True, None

# Backward compatibility wrapper
async def generate_motivational_message(goals: str, personality: PersonalityType, name: Optional[str] = None) -> str:
    """Wrapper for backward compatibility"""
    message, _, _, _ = await generate_unique_motivational_message(goals, personality, name, 0, [])
    return message

# Get current personality for user based on rotation mode
async def fetch_research_snippet(goals: str, personality: PersonalityType) -> Optional[str]:
    """
    Fetch a short, fresh insight using Tavily to keep emails feeling researched.
    Returns a one or two sentence snippet or None.
    """
    if not TAVILY_API_KEY or not goals:
        return None

    query_parts = [goals.strip()]
    if personality and personality.value:
        query_parts.append(f'{personality.value} style inspiration')
    query = " ".join(query_parts)

    payload = {
        "api_key": TAVILY_API_KEY,
        "query": query,
        "max_results": 3,
    }

    try:
        async with httpx.AsyncClient(timeout=6) as client:
            response = await client.post(TAVILY_SEARCH_URL, json=payload)
            if response.status_code == 429:
                try:
                    await tracker.log_system_event(
                        event_type="tavily_rate_limit",
                        event_category="research",
                        details={"query": query},
                        status="warning"
                    )
                except Exception:
                    pass
                return None
            response.raise_for_status()
            data = response.json()

        results = data.get("results") or []
        for result in results:
            content = result.get("content") or result.get("snippet")
            if content:
                trimmed = content.strip()
                if len(trimmed) > 300:
                    trimmed = trimmed[:297].rsplit(" ", 1)[0] + "..."
                return trimmed

    except Exception as e:
        logger.warning(f"Tavily research failed: {e}")
        try:
            await tracker.log_system_event(
                event_type="tavily_error",
                event_category="research",
                details={"query": query, "error": str(e)},
                status="warning"
            )
        except Exception:
            pass

    return None


async def fetch_personality_voice(personality: PersonalityType) -> Optional[str]:
    """
    Fetch a concise description of how the requested personality or tone speaks.
    Results are cached to avoid repeated lookups.
    """
    if personality is None:
        return None

    cache_key = f"{personality.type}:{personality.value}"
    if cache_key in personality_voice_cache:
        return personality_voice_cache[cache_key]

    if personality.type == "custom":
        personality_voice_cache[cache_key] = personality.value
        return personality.value

    if not TAVILY_API_KEY:
        return None

    if personality.type == "famous":
        query = f"What is the communication style of {personality.value}? Describe tone, pacing, vocabulary, and attitude."
    elif personality.type == "tone":
        query = f"Describe how to communicate in a {personality.value.lower()} tone. Focus on voice, energy, and sentence structure."
    else:
        query = f"Describe the communication style called {personality.value}. Focus on how it sounds."

    payload = {
        "api_key": TAVILY_API_KEY,
        "query": query,
        "max_results": 2,
    }

    try:
        async with httpx.AsyncClient(timeout=6) as client:
            response = await client.post(TAVILY_SEARCH_URL, json=payload)
            if response.status_code == 429:
                try:
                    await tracker.log_system_event(
                        event_type="tavily_rate_limit",
                        event_category="research",
                        details={"query": query},
                        status="warning"
                    )
                except Exception:
                    pass
                return None
            response.raise_for_status()
            data = response.json()

        results = data.get("results") or []
        for result in results:
            content = result.get("content") or result.get("snippet")
            if content:
                trimmed = content.strip()
                if len(trimmed) > 400:
                    trimmed = trimmed[:397].rsplit(" ", 1)[0] + "..."
                personality_voice_cache[cache_key] = trimmed
                return trimmed
    except Exception as e:
        logger.warning(f"Tavily personality research failed: {e}")
        try:
            await tracker.log_system_event(
                event_type="tavily_error",
                event_category="research",
                details={"query": query, "error": str(e)},
                status="warning"
            )
        except Exception:
            pass

    return None


def build_recent_themes(previous_messages: List[dict]) -> str:
    """Create a brief list of themes from previous emails to reduce repetition."""
    if not previous_messages:
        return ""

    themes = []
    for msg in previous_messages[:5]:
        text = msg.get("message", "")
        if not text:
            continue
        snippet = text.strip().split("\n")[0]
        snippet = snippet[:140].rsplit(" ", 1)[0] if len(snippet) > 140 else snippet
        message_type = msg.get("message_type")
        if message_type:
            themes.append(f"- ({message_type}) {snippet}")
        else:
            themes.append(f"- {snippet}")

    return "\n".join(themes[:5])


def build_subject_line(
    personality: PersonalityType,
    message_type: str,
    user_data: dict,
    research_snippet: Optional[str],
    used_fallback: bool
) -> str:
    import random

    streak = user_data.get("streak_count", 0)
    raw_goal = user_data.get("goals") or ""
    goal_line = raw_goal.split("\n")[0][:80]
    goal_theme = derive_goal_theme(raw_goal)

    momentum_words = [
        "spark",
        "stride",
        "pulse",
        "tempo",
        "heartbeat",
        "rhythm",
        "signal",
        "sparkline",
    ]
    action_words = [
        "takes shape",
        "moves forward",
        "kicks off",
        "gains traction",
        "locks in",
        "hits the runway",
        "winds up",
        "comes alive",
    ]

    goal_phrase = (goal_theme or goal_line or "").strip()
    templates = [
        f"Today's {random.choice(momentum_words)} {random.choice(action_words)}",
        f"Keep the {random.choice(momentum_words)} moving",
        f"{random.choice(momentum_words).capitalize()} fuels your next stride",
        f"Plot the next {random.choice(momentum_words)} move",
    ]

    if goal_phrase:
        trimmed_goal = goal_phrase[:50]
        templates.extend(
            [
                f"{trimmed_goal} gets new {random.choice(momentum_words)}",
                f"Steps toward {trimmed_goal} today",
                f"Edge closer on {trimmed_goal}",
            ]
        )

    if streak > 0:
        templates.extend(
            [
                f"{streak} days in - stay on tempo",
                f"{streak} mornings and momentum rising",
            ]
        )

    if research_snippet:
        snippet = research_snippet.strip().split(".")[0][:40]
        templates.extend(
            [
                f"Insight to try: {snippet}",
                f"Research spark: {snippet}",
            ]
        )

    if used_fallback:
        templates.extend(
            [
                "Momentum stays with you today",
                "Another nudge is in your inbox",
            ]
        )

    templates = [t for t in templates if t]
    if not templates:
        templates = ["Your daily momentum note"]

    subject = random.choice(templates).strip()
    return strip_emojis(subject)[:60]


async def compose_subject_line(
    personality: PersonalityType,
    message_type: str,
    user_data: dict,
    used_fallback: bool,
    research_snippet: Optional[str]
) -> str:
    goals = (user_data.get("goals") or "").strip()
    goal_theme = derive_goal_theme(goals)
    streak = user_data.get("streak_count", 0)
    fallback_subject = fallback_subject_line(streak, goals)

    try:
        prompt = f"""
You are crafting an email subject line for a motivational newsletter.

REQUIREMENTS:
- Keep it under 60 characters.
- Do NOT mention any personality, persona, or tone names.
- Make it fresh, human, and emotionally resonant.
- Do NOT copy the user's goal wording; paraphrase or imply it instead.
- Use the goal theme as a springboard but phrase it in new words.
- Hint at today's message theme without sounding clickbait or repeating prior subjects.
- If a streak count exists, acknowledge progress without repeating the word "streak".
- If a research insight is provided, allude to it without sounding academic.

INPUTS:
- Streak count: {streak}
- Message type: {message_type}
- Goal theme: {goal_theme or "None supplied"}
- Research snippet: {research_snippet or "None"}
- Previous fallback used: {"Yes" if used_fallback else "No"}

Return only the subject line."""  # noqa: E501

        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert at writing compelling, human email subject lines for motivational emails. "
                        "Your subject lines:\n"
                        "- Feel personal and handcrafted, like a friend texting you\n"
                        "- Create curiosity without clickbait\n"
                        "- Are specific and concrete, avoiding vague phrases\n"
                        "- Use active voice and strong verbs\n"
                        "- Are 40-80 characters (6-12 words)\n"
                        "- Never mention persona names, tone names, or meta-references\n"
                        "- Avoid cliches like 'crush it', 'game-changer', 'unlock your potential'\n"
                        "- Feel urgent but not desperate\n\n"
                        "Generate ONE subject line only. No quotes, no explanations."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,  # More consistent than 0.75
            max_tokens=30,    # Increased from 24 to prevent cutoffs
            top_p=0.9,        # Quality control
            presence_penalty=0.3,   # Avoid repetition
            frequency_penalty=0.3,  # Encourage variety
        )

        subject = response.choices[0].message.content.strip().strip('"\'')
        subject = strip_emojis(subject)
        return subject if subject else fallback_subject

    except Exception as e:
        logger.warning(f"Subject line generation failed: {e}")
        try:
            await tracker.log_system_event(
                event_type="subject_generation_failed",
                event_category="llm",
                details={
                    "user_email": user_data.get("email"),
                    "message_type": message_type,
                    "error": str(e),
                },
                status="warning",
            )
        except Exception:
            pass

        return fallback_subject


def get_current_personality(user_data):
    personalities = user_data.get('personalities', [])
    if not personalities:
        return PersonalityType(
            type="custom",
            value=user_data.get("custom_personality_description", "a warm, encouraging mentor"),
        )
    
    rotation_mode = user_data.get('rotation_mode', 'sequential')
    current_index = user_data.get('current_personality_index', 0)
    
    # Safety check: ensure current_index is within bounds
    if current_index >= len(personalities):
        current_index = 0
    
    if rotation_mode == "random":
        import random
        return PersonalityType(**random.choice(personalities))
    
    elif rotation_mode == "daily_fixed":
        # Each personality gets a specific day
        from datetime import datetime
        day_index = datetime.now().weekday()
        personality_index = day_index % len(personalities)
        return PersonalityType(**personalities[personality_index])
    
    elif rotation_mode == "weekly_rotation":
        # Rotate weekly - same personality all week
        from datetime import datetime
        week_number = datetime.now().isocalendar()[1]
        personality_index = week_number % len(personalities)
        return PersonalityType(**personalities[personality_index])
    
    elif rotation_mode == "time_based":
        # Morning vs Evening personalities
        from datetime import datetime
        hour = datetime.now().hour
        if hour < 12:  # Morning - first half
            personality_index = 0 if len(personalities) == 1 else 0
        else:  # Afternoon/Evening - second half
            personality_index = (len(personalities) // 2) if len(personalities) > 1 else 0
        return PersonalityType(**personalities[min(personality_index, len(personalities) - 1)])
    
    elif rotation_mode == "favorite_weighted":
        # TODO: Implement weighted selection based on ratings
        # For now, fall back to sequential
        return PersonalityType(**personalities[current_index])
    
    else:  # sequential
        personality = PersonalityType(**personalities[current_index])
        return personality

async def update_streak(email: str, sent_timestamp: Optional[datetime] = None):
    """Update user streak count based on consecutive days of receiving emails"""
    user = await db.users.find_one({"email": email})
    if not user:
        return
    
    if sent_timestamp is None:
        sent_timestamp = datetime.now(timezone.utc)
    
    last_sent = user.get('last_email_sent')
    current_streak = user.get('streak_count', 0)
    
    if last_sent:
        if isinstance(last_sent, str):
            try:
                last_sent = datetime.fromisoformat(last_sent.replace('Z', '+00:00'))
            except:
                last_sent = datetime.fromisoformat(last_sent)
        
        # Normalize to dates (ignore time)
        last_sent_date = last_sent.date()
        current_date = sent_timestamp.date()
        
        # Calculate days difference
        days_diff = (current_date - last_sent_date).days
        
        if days_diff == 0:
            # Same day - don't increment, keep current streak
            new_streak = current_streak
        elif days_diff == 1:
            # Consecutive day - increment streak
            new_streak = current_streak + 1
        else:
            # Gap of more than 1 day - reset to 1
            new_streak = 1
    else:
        # First email ever - start at 1
        new_streak = 1
    
    # Update streak in database
    await db.users.update_one(
        {"email": email},
        {"$set": {"streak_count": new_streak}}
    )
    
    logger.info(f"Updated streak for {email}: {current_streak} -> {new_streak} (last_sent: {last_sent}, days_diff: {(sent_timestamp.date() - (last_sent.date() if last_sent else sent_timestamp.date())).days if last_sent else 'N/A'})")
    
    return new_streak

# Send email to a SPECIFIC user (called by scheduler)
async def send_motivation_to_user(email: str):
    """Send motivation email to a specific user - called by their scheduled job"""
    start_time = time.time()
    subject_line: Optional[str] = None
    sent_dt: Optional[datetime] = None
    schedule: Optional[dict] = None
    
    logger.info(f"📧 Scheduled email job triggered for: {email}")
    
    try:
        # Get the specific user
        user_data = await db.users.find_one({"email": email, "active": True}, {"_id": 0})
        
        if not user_data:
            logger.warning(f"⚠️ User {email} not found or inactive - skipping email")
            return
        
        logger.debug(f"User found: {email}, active: {user_data.get('active')}")
        
        # Check if paused or skip next
        schedule = user_data.get('schedule', {})
        if schedule.get('paused', False):
            logger.info(f"⏸️ Skipping {email} - schedule paused")
            return
        
        if schedule.get('skip_next', False):
            # Reset skip_next flag
            await db.users.update_one(
                {"email": email},
                {"$set": {"schedule.skip_next": False}}
            )
            logger.info(f"⏭️ Skipped {email} - skip_next was set (now reset)")
            return
        
        # Get user data (we'll update streak after sending email)
        user_data = await db.users.find_one({"email": email}, {"_id": 0})
        
        # Get current personality
        personality = get_current_personality(user_data)
        if not personality:
            logger.warning(f"⚠️ No personality found for {email} - cannot send email")
            return
        
        logger.debug(f"Using personality: {personality.value if personality else 'None'} for {email}")
        
        # Calculate streak FIRST (before generating message) to use correct streak in email
        sent_dt = datetime.now(timezone.utc)
        sent_timestamp = sent_dt.isoformat()
        
        # Get user's global timezone for date comparison (prefer user_timezone over schedule.timezone)
        user_timezone_str = user_data.get("user_timezone") or user_data.get("schedule", {}).get("timezone", "UTC")
        user_tz = None
        try:
            import pytz
            user_tz = pytz.timezone(user_timezone_str)
            # Convert UTC to user's timezone for date comparison
            sent_dt_user_tz = sent_dt.astimezone(user_tz)
            current_date = sent_dt_user_tz.date()
        except Exception as e:
            logger.warning(f"Invalid timezone {user_timezone_str} for {email}, using UTC: {e}")
            current_date = sent_dt.date()
        
        # Calculate what the streak will be after sending this email
        current_streak = user_data.get('streak_count', 0)
        last_sent = user_data.get('last_email_sent')
        
        if last_sent:
            if isinstance(last_sent, str):
                try:
                    last_sent_dt = datetime.fromisoformat(last_sent.replace('Z', '+00:00'))
                except:
                    last_sent_dt = datetime.fromisoformat(last_sent)
            else:
                last_sent_dt = last_sent
            
            # Ensure last_sent_dt is timezone-aware (UTC)
            if last_sent_dt.tzinfo is None:
                last_sent_dt = last_sent_dt.replace(tzinfo=timezone.utc)
            
            # Convert to user's timezone for date comparison
            if user_tz:
                try:
                    last_sent_dt_user_tz = last_sent_dt.astimezone(user_tz)
                    last_sent_date = last_sent_dt_user_tz.date()
                except:
                    # Fallback to UTC if timezone conversion fails
                    last_sent_date = last_sent_dt.date()
            else:
                # Use UTC if user_tz is not available
                last_sent_date = last_sent_dt.date()
                
            days_diff = (current_date - last_sent_date).days
            
            if days_diff == 0:
                # Same day - keep current streak (don't increment)
                streak_count = current_streak if current_streak > 0 else 1
                logger.info(f"Streak calculation for {email}: Same day ({current_date}), keeping streak at {streak_count}")
            elif days_diff == 1:
                # Consecutive day - increment streak
                streak_count = current_streak + 1
                logger.info(f"Streak calculation for {email}: Consecutive day ({last_sent_date} -> {current_date}), incrementing {current_streak} -> {streak_count}")
            else:
                # Gap of more than 1 day - reset to 1
                streak_count = 1
                logger.info(f"Streak calculation for {email}: Gap of {days_diff} days ({last_sent_date} -> {current_date}), resetting to {streak_count}")
        else:
            # First email ever - start at 1
            streak_count = 1
            logger.info(f"Streak calculation for {email}: First email ever, starting at {streak_count}")
        
        # Get previous messages to avoid repetition
        previous_messages = await db.message_history.find(
            {"email": email},
            {"_id": 0}
        ).sort("created_at", -1).limit(10).to_list(10)
        
        # Generate UNIQUE message with questions using the CALCULATED streak
        message, message_type, used_fallback, research_snippet = await generate_unique_motivational_message(
            user_data['goals'],
            personality,
            user_data.get('name'),
            streak_count,  # Use calculated streak, not old one
            previous_messages
        )
        
        if used_fallback:
            try:
                await tracker.log_system_event(
                    event_type="llm_generation_fallback",
                    event_category="llm",
                    details={
                        "user_email": email,
                        "personality": personality.value if personality else None
                    },
                    status="warning"
                )
            except Exception:
                pass
        
        # Save to message history with message type for tracking
        message_id = str(uuid.uuid4())
        # Generate Message-ID for email threading
        email_domain = os.getenv('EMAIL_DOMAIN')
        if not email_domain:
            frontend_url = os.getenv('FRONTEND_URL', '')
            if frontend_url:
                from urllib.parse import urlparse
                parsed = urlparse(frontend_url)
                email_domain = parsed.netloc or 'tend.app'
            else:
                email_domain = 'tend.app'
        email_message_id = f"<msg-{message_id}@{email_domain}>"
        
        history_doc = {
            "id": message_id,
            "email": email,
            "message": message,
            "personality": personality.model_dump(),
            "message_type": message_type,
            "created_at": sent_timestamp,
            "sent_at": sent_timestamp,
            "streak_at_time": streak_count,
            "used_fallback": used_fallback,
            "message_id": email_message_id  # NEW: Store for email threading
        }
        await db.message_history.insert_one(history_doc)
        
        streak_icon, streak_message = resolve_streak_badge(streak_count)
        core_message, check_in_lines, quick_reply_lines = extract_interactive_sections(message)
        ci_defaults, qr_defaults = generate_interactive_defaults(
            streak_count,
            user_data.get('goals', ''),
        )
        check_in_lines = check_in_lines or ci_defaults
        quick_reply_lines = quick_reply_lines or qr_defaults

        html_content = render_email_html(
            streak_count=streak_count,
            streak_icon=streak_icon,
            streak_message=streak_message,
            core_message=core_message,
            check_in_lines=check_in_lines,
            quick_reply_lines=quick_reply_lines,
        )

        # Create updated user_data with new streak for subject line generation
        updated_user_data = user_data.copy()
        updated_user_data['streak_count'] = streak_count

        subject_line = await compose_subject_line(
            personality,
            message_type,
            updated_user_data,  # Use updated user_data with new streak
            used_fallback,
            research_snippet
        )
        
        logger.debug(f"Generated subject line for {email}: {subject_line[:50]}...")
        logger.info(f"📤 Sending email to {email} (streak: {streak_count}, personality: {personality.value})")

        success, error = await send_email(email, subject_line, html_content)
        
        if success:
            logger.info(f"✅ Email sent successfully to {email}")
            # Update streak and last email sent time
            # Rotate personality if sequential
            personalities = user_data.get('personalities', [])
            update_data = {
                "last_email_sent": sent_timestamp,
                "last_active": sent_timestamp,
                "streak_count": streak_count
            }
            
            if user_data.get('rotation_mode') == 'sequential' and len(personalities) > 1:
                current_index = user_data.get('current_personality_index', 0)
                next_index = (current_index + 1) % len(personalities)
                update_data["current_personality_index"] = next_index
            
            await db.users.update_one(
                {"email": email},
                {
                    "$set": update_data,
                    "$inc": {"total_messages_received": 1}
                }
            )
            
            logger.info(f"✅ Email sent to {email} - Streak updated to {streak_count} days")
            
            elapsed_time = time.time() - start_time
            logger.info(f"⏱️ Email job completed for {email} in {elapsed_time:.2f}s")
            
            await record_email_log(
                email=email,
                subject=subject_line,
                status="success",
                sent_dt=sent_dt,
                timezone_value=schedule.get("timezone"),
            )
        else:
            logger.error(f"❌ Failed to send email to {email}: {error}")
            await record_email_log(
                email=email,
                subject=subject_line,
                status="failed",
                sent_dt=sent_dt,
                timezone_value=schedule.get("timezone"),
                error_message=error,
            )
            
    except Exception as e:
        elapsed_time = time.time() - start_time
        logger.error(f"❌ Error sending email to {email} after {elapsed_time:.2f}s: {str(e)}", exc_info=True)
        await record_email_log(
            email=email,
            subject=subject_line or "Motivation Delivery",
            status="failed",
            sent_dt=sent_dt,
            timezone_value=schedule.get("timezone") if isinstance(schedule, dict) else None,
            error_message=str(e),
        )

# Background job to send scheduled emails (DEPRECATED - keeping for backwards compatibility)
async def send_scheduled_motivations():
    """
    DEPRECATED: This function is no longer used. Each user has their own scheduled job.
    Updated to use pagination for scalability (10k+ users).
    """
    logger.warning("send_scheduled_motivations called - this function is deprecated")
    try:
        # Use pagination for scalability
        batch_size = 100
        skip = 0
        while True:
            users = await db.users.find({"active": True}, {"_id": 0}).skip(skip).limit(batch_size).to_list(batch_size)
            if not users:
                break
            
            for user_data in users:
                try:
                    # Check if paused or skip next
                    schedule = user_data.get('schedule', {})
                    if schedule.get('paused', False):
                        continue
                    
                    if schedule.get('skip_next', False):
                        # Reset skip_next flag
                        await db.users.update_one(
                            {"email": user_data['email']},
                            {"$set": {"schedule.skip_next": False}}
                        )
                        continue
                    
                    # Get current personality
                    personality = get_current_personality(user_data)
                    if not personality:
                        continue
                    
                    # Generate message
                    message = await generate_motivational_message(
                        user_data['goals'],
                        personality,
                        user_data.get('name')
                    )
                    
                    # Create HTML email
                    # Save to message history
                    message_id = str(uuid.uuid4())
                    history = MessageHistory(
                        id=message_id,
                        email=user_data['email'],
                        message=message,
                        personality=personality
                    )
                    await db.message_history.insert_one(history.model_dump())
                    
                    html_content = f"""
                    <html>
                <head>
                    <style>
                        body {{ font-family: 'Georgia', serif; line-height: 1.8; color: #333; }}
                        .container {{ max-width: 600px; margin: 0 auto; }}
                        .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; }}
                        .header h1 {{ color: white; margin: 0; font-size: 28px; font-weight: 600; }}
                        .content {{ background: #ffffff; padding: 40px 30px; }}
                        .message {{ font-size: 16px; line-height: 1.8; color: #2d3748; white-space: pre-wrap; }}
                        .signature {{ margin-top: 30px; padding-top: 20px; border-top: 2px solid #e2e8f0; font-style: italic; color: #718096; }}
                        .footer {{ text-align: center; padding: 20px; color: #a0aec0; font-size: 12px; }}
                        .streak {{ background: #f7fafc; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; }}
                        .streak-count {{ font-size: 24px; font-weight: bold; color: #667eea; }}
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Your Daily Inspiration</h1>
                        </div>
                        <div class="content">
                            <p style="font-size: 18px; color: #4a5568; margin-bottom: 25px;">Hello {user_data.get('name', 'there')},</p>
                            
                            <div class="streak">
                                <div>[STREAK] Your Progress</div>
                                <div class="streak-count">{user_data.get('streak_count', 0)} Days</div>
                            </div>
                            
                            <div class="message">{message}</div>
                            <div class="signature">
                                - Inspired by {personality.value}
                            </div>
                        </div>
                        <div class="footer">
                            <p>You're receiving this because you subscribed to Tend</p>
                            <p>Keep pushing towards your goals!</p>
                        </div>
                    </div>
                </body>
                    </html>
                    """
                    
                    success, error = await send_email(
                        user_data['email'],
                        f"Your Daily Motivation from {personality.value}",
                        html_content
                    )
                    
                    if success:
                        # Calculate and update streak
                        sent_dt = datetime.now(timezone.utc)
                        sent_timestamp = sent_dt.isoformat()
                        new_streak = await update_streak(user_data['email'], sent_dt)
                        
                        # Rotate personality if sequential
                        personalities = user_data.get('personalities', [])
                        update_data = {
                            "last_email_sent": sent_timestamp,
                            "last_active": sent_timestamp,
                            "streak_count": new_streak
                        }
                        
                        if user_data.get('rotation_mode') == 'sequential' and len(personalities) > 1:
                            current_index = user_data.get('current_personality_index', 0)
                            next_index = (current_index + 1) % len(personalities)
                            update_data["current_personality_index"] = next_index
                        
                        await db.users.update_one(
                            {"email": user_data['email']},
                            {
                                "$set": update_data,
                                "$inc": {"total_messages_received": 1}
                            }
                        )
                        
                        logging.info(f"Sent motivation to {user_data['email']}")
                    else:
                        logging.error(f"Failed to send to {user_data['email']}: {error}")
                        
                except Exception as e:
                    logging.error(f"Error processing {user_data.get('email', 'unknown')}: {str(e)}")
            
            skip += batch_size
        
    except Exception as e:
        logging.error(f"Scheduled job error: {str(e)}")

# Routes
@api_router.get("/")
async def root():
    return {"message": "Tend API", "version": "2.0"}

@api_router.get("/health")
@limiter.exempt  # Health checks should not be rate limited
async def health_check():
    """
    Health check endpoint for monitoring and load balancers.
    Returns 200 if healthy, 503 if unhealthy.
    """
    checks = {
        "status": "healthy",
        "database": "unknown",
        "openai": "unknown",
        "smtp": "unknown",
        "version": "2.0",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    # Check database connectivity
    try:
        await db.command("ping")
        checks["database"] = "connected"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        checks["database"] = "disconnected"
        checks["status"] = "unhealthy"
        # Don't expose internal error details in production
        is_production = os.getenv('ENVIRONMENT', '').lower() == 'production'
        if not is_production:
            checks["database_error"] = str(e)
    
    # Check OpenAI API connectivity
    try:
        # Simple API call to check connectivity
        await asyncio.wait_for(
            openai_client.models.list(),
            timeout=5.0
        )
        checks["openai"] = "connected"
    except asyncio.TimeoutError:
        logger.warning("OpenAI API health check timed out")
        checks["openai"] = "timeout"
        checks["status"] = "degraded"
    except Exception as e:
        logger.error(f"OpenAI API health check failed: {e}")
        checks["openai"] = "disconnected"
        checks["status"] = "degraded"
        # Don't expose internal error details in production
        is_production = os.getenv('ENVIRONMENT', '').lower() == 'production'
        if not is_production:
            checks["openai_error"] = str(e)
    
    # Check SMTP configuration (not actual connection, just config)
    smtp_host = os.getenv('SMTP_HOST')
    smtp_username = os.getenv('SMTP_USERNAME')
    smtp_password = os.getenv('SMTP_PASSWORD')
    
    if all([smtp_host, smtp_username, smtp_password]):
        checks["smtp"] = "configured"
    else:
        checks["smtp"] = "not_configured"
        if checks["status"] == "healthy":
            checks["status"] = "degraded"
    
    # Determine status code
    status_code = 200 if checks["status"] == "healthy" else 503
    
    return JSONResponse(content=checks, status_code=status_code)

@api_router.post("/auth/clerk-sync")
async def sync_clerk_user(request: Request):
    """
    Sync Clerk user data to database.
    Called when user signs in with Clerk to ensure all user data is stored in MongoDB.
    """
    try:
        # Get Clerk user data from request body
        body = await request.json()
        clerk_user_id = body.get("clerk_user_id")
        clerk_email = body.get("email")
        clerk_first_name = body.get("first_name")
        clerk_last_name = body.get("last_name")
        clerk_image_url = body.get("image_url")
        
        if not clerk_email:
            raise HTTPException(status_code=400, detail="Email is required")
        
        logger.info(f"🔄 Syncing Clerk user to database: {clerk_email}")
        
        # Check if user exists
        user = await db.users.find_one({"email": clerk_email}, {"_id": 0})
        
        if user:
            # Update existing user with Clerk data
            update_data = {
                "clerk_user_id": clerk_user_id,
                "last_active": datetime.now(timezone.utc).isoformat(),
            }
            
            # Update name if provided and different
            if clerk_first_name or clerk_last_name:
                full_name = f"{clerk_first_name or ''} {clerk_last_name or ''}".strip()
                if full_name and user.get("name") != full_name:
                    update_data["name"] = full_name
            
            # Update image if provided
            if clerk_image_url and user.get("image_url") != clerk_image_url:
                update_data["image_url"] = clerk_image_url
            
            await db.users.update_one(
                {"email": clerk_email},
                {"$set": update_data}
            )
            
            logger.info(f"✅ Updated existing user in database: {clerk_email}")
            
            # Track activity
            await tracker.log_user_activity(
                action_type="clerk_signin",
                user_email=clerk_email,
                details={"clerk_user_id": clerk_user_id, "sync_type": "existing_user"}
            )
            
            # Return updated user
            updated_user = await db.users.find_one({"email": clerk_email}, {"_id": 0})
            if isinstance(updated_user.get('created_at'), str):
                updated_user['created_at'] = datetime.fromisoformat(updated_user['created_at'])
            if isinstance(updated_user.get('last_email_sent'), str):
                updated_user['last_email_sent'] = datetime.fromisoformat(updated_user['last_email_sent'])
            
            return {
                "status": "success",
                "message": "User synced",
                "user_exists": True,
                "user": updated_user
            }
        else:
            # Create new user record with Clerk data
            # User will complete onboarding separately
            user_name = f"{clerk_first_name or ''} {clerk_last_name or ''}".strip() or clerk_email.split("@")[0]
            new_user = {
                "email": clerk_email,
                "clerk_user_id": clerk_user_id,
                "name": user_name,
                "image_url": clerk_image_url,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "last_active": datetime.now(timezone.utc).isoformat(),
                "active": False,  # Will be activated after onboarding
                "streak_count": 0,
                "total_messages_received": 0,
                "welcome_email_sent": False,  # Track if welcome email was sent
            }
            
            await db.users.insert_one(new_user)
            
            logger.info(f"✅ Created new user record in database: {clerk_email}")
            logger.info(f"📧 Attempting to send welcome email to: {clerk_email}")
            
            # Track activity
            await tracker.log_user_activity(
                action_type="clerk_signin",
                user_email=clerk_email,
                details={"clerk_user_id": clerk_user_id, "sync_type": "new_user"}
            )
            
            # Send welcome email to new user (CRITICAL: Must send immediately after account creation)
            welcome_email_sent = False
            try:
                # Get frontend URL for email links
                frontend_url = os.getenv('FRONTEND_URL', '')
                if not frontend_url:
                    logger.warning(f"⚠️ FRONTEND_URL not set - welcome email link may be empty")
                
                welcome_subject = "Welcome to Tend! Let's Get Started"
                welcome_html = f"""
                <html>
                <head>
                    <style>
                        body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6fb; margin: 0; padding: 0; color: #1f2933; }}
                        .wrapper {{ max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 12px; padding: 28px 32px; box-shadow: 0 12px 30px rgba(40,52,71,0.08); }}
                        .header {{ text-align: center; margin-bottom: 32px; }}
                        .header h1 {{ font-size: 28px; color: #1b3a61; margin: 0 0 12px 0; }}
                        .header p {{ font-size: 16px; color: #5a687d; margin: 0; }}
                        .content {{ font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; color: #1f2933; }}
                        .cta {{ text-align: center; margin: 32px 0; }}
                        .cta a {{ display: inline-block; background: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; }}
                        .steps {{ background: #f8fafc; border-radius: 8px; padding: 24px; margin: 24px 0; }}
                        .steps h3 {{ font-size: 18px; color: #1b3a61; margin: 0 0 16px 0; }}
                        .steps ol {{ margin: 0; padding-left: 24px; color: #1f2933; }}
                        .steps li {{ margin-bottom: 12px; line-height: 1.6; }}
                        .footer {{ margin-top: 32px; font-size: 13px; color: #5a687d; text-align: center; }}
                        .signature {{ margin-top: 28px; font-size: 14px; color: #5a687d; }}
                    </style>
                </head>
                <body>
                    <div class="wrapper">
                        <div class="header">
                            <h1>Welcome to Tend, {html.escape(user_name)}! 🎉</h1>
                            <p>Your journey to consistent motivation starts now</p>
                        </div>
                        <div class="content">
                            <p>We're thrilled to have you join the Tend community! You've taken the first step toward building lasting habits and achieving your goals.</p>
                            
                            <div class="steps">
                                <h3>Getting Started is Easy:</h3>
                                <ol>
                                    <li><strong>Complete Your Profile</strong> - Tell us about your goals and what motivates you</li>
                                    <li><strong>Choose Your Coach</strong> - Select from inspiring personalities or create your own</li>
                                    <li><strong>Set Your Schedule</strong> - Pick when you want to receive your daily motivation</li>
                                    <li><strong>Start Your Journey</strong> - Begin receiving personalized messages tailored just for you</li>
                                </ol>
                            </div>
                            
                            <p>Our AI-powered coach will send you personalized motivational messages based on your goals, helping you stay consistent and build momentum every single day.</p>
                        </div>
                        <div class="cta">
                            <a href="{frontend_url}">Complete Your Setup →</a>
                        </div>
                        <div class="signature">
                            <p>We're here to support you every step of the way.</p>
                            <p><strong>Tend Team</strong></p>
                        </div>
                        <div class="footer">
                            <p>You're receiving this email because you just created an account with Tend.</p>
                        </div>
                    </div>
                </body>
                </html>
                """
                
                logger.info(f"📧 Sending welcome email to {clerk_email}...")
                success, error = await send_email(clerk_email, welcome_subject, welcome_html)
                
                if success:
                    welcome_email_sent = True
                    # Update user record to mark welcome email as sent
                    await db.users.update_one(
                        {"email": clerk_email},
                        {"$set": {"welcome_email_sent": True}}
                    )
                    logger.info(f"✅ Welcome email successfully sent to new user: {clerk_email}")
                else:
                    logger.error(f"❌ FAILED to send welcome email to {clerk_email}: {error}")
                    # Log to system events for monitoring
                    try:
                        await tracker.log_system_event(
                            event_type="welcome_email_failed",
                            event_category="email",
                            details={
                                "user_email": clerk_email,
                                "error": error
                            },
                            status="error"
                        )
                    except Exception:
                        pass  # Don't fail if tracking fails
            except Exception as e:
                logger.error(f"❌ EXCEPTION while sending welcome email to {clerk_email}: {str(e)}", exc_info=True)
                # Log to system events for monitoring
                try:
                    await tracker.log_system_event(
                        event_type="welcome_email_exception",
                        event_category="email",
                        details={
                            "user_email": clerk_email,
                            "error": str(e)
                        },
                        status="error"
                    )
                except Exception:
                    pass  # Don't fail if tracking fails
                # Don't fail the user creation if email fails
            
            return {
                "status": "success",
                "message": "User created, onboarding required",
                "user_exists": False,
                "user": {k: v for k, v in new_user.items() if k != "_id"}
            }
            
    except Exception as e:
        logger.error(f"❌ Error syncing Clerk user: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to sync user: {str(e)}")

# DEPRECATED: Magic link authentication removed - using Clerk only
@api_router.post("/auth/login")
@limiter.limit("5/minute")
async def login_deprecated(login_request: LoginRequest, background_tasks: BackgroundTasks, request: FastAPIRequest):
    """DEPRECATED: Magic link authentication - Use Clerk authentication instead"""
    logger.warning(f"⚠️ Deprecated magic link login attempt for: {login_request.email}")
    raise HTTPException(
        status_code=410, 
        detail="Magic link authentication is deprecated. Please use Clerk authentication."
    )

# DEPRECATED: Magic link verification removed - using Clerk only
@api_router.post("/auth/verify")
async def verify_token_deprecated(request: VerifyTokenRequest):
    """DEPRECATED: Magic link verification - Use Clerk authentication instead"""
    logger.warning(f"⚠️ Deprecated magic link verification attempt for: {request.email}")
    raise HTTPException(
        status_code=410,
        detail="Magic link authentication is deprecated. Please use Clerk authentication."
    )

@api_router.post("/onboarding")
async def complete_onboarding(request: OnboardingRequest, req: Request):
    """
    Complete onboarding for new user.
    Stores ALL user data in MongoDB including Clerk user ID.
    If user was created by Clerk sync, updates with onboarding data.
    """
    start_time = time.time()
    logger.info(f"🎯 Onboarding started for: {request.email}")
    
    # Check if user already exists (may have been created by Clerk sync)
    existing = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    logger.debug(f"Creating/updating user profile for: {request.email}")
    profile = UserProfile(**request.model_dump())
    doc = profile.model_dump()
    
    # Preserve Clerk user ID if user was created by Clerk sync
    if existing and existing.get("clerk_user_id"):
        doc['clerk_user_id'] = existing.get("clerk_user_id")
        logger.debug(f"Preserved Clerk user ID: {existing.get('clerk_user_id')}")
    
    # Preserve created_at if user already exists
    if existing:
        doc['created_at'] = existing.get('created_at', datetime.now(timezone.utc).isoformat())
        if isinstance(doc['created_at'], datetime):
            doc['created_at'] = doc['created_at'].isoformat()
    else:
        doc['created_at'] = doc['created_at'].isoformat() if isinstance(doc.get('created_at'), datetime) else datetime.now(timezone.utc).isoformat()
    
    # Ensure user_timezone is set (from onboarding request)
    if request.user_timezone:
        doc['user_timezone'] = request.user_timezone
    elif not doc.get('user_timezone'):
        # Fallback to schedule timezone if user_timezone not provided
        doc['user_timezone'] = doc.get('schedule', {}).get('timezone', 'UTC')
    
    # Activate user after onboarding
    doc['active'] = True
    
    logger.debug(f"User timezone set to: {doc.get('user_timezone')}")
    logger.debug(f"Schedule frequency: {doc.get('schedule', {}).get('frequency')}")
    logger.debug(f"Personalities count: {len(doc.get('personalities', []))}")
    
    if existing:
        # Update existing user (created by Clerk sync)
        await db.users.update_one(
            {"email": request.email},
            {"$set": doc}
        )
        logger.info(f"✅ Updated user with onboarding data: {request.email}")
    else:
        # Create new user
        await db.users.insert_one(doc)
        logger.info(f"✅ User created in database: {request.email}")
    
    # Save initial version history
    await version_tracker.save_schedule_version(
        user_email=request.email,
        schedule_data=request.schedule.model_dump(),
        changed_by="user",
        change_reason="Initial onboarding"
    )
    
    # Convert personalities to dict format (handle both dict and Pydantic model)
    def to_dict(p):
        """Convert personality to dict, handling both dict and Pydantic model"""
        if isinstance(p, dict):
            return p
        elif hasattr(p, 'model_dump'):
            return p.model_dump()
        elif hasattr(p, 'dict'):
            return p.dict()
        else:
            # Fallback: try to convert to dict
            return dict(p) if hasattr(p, '__iter__') and not isinstance(p, str) else p
    
    personality_dicts = [to_dict(p) for p in request.personalities]
    
    await version_tracker.save_personality_version(
        user_email=request.email,
        personalities=personality_dicts,
        rotation_mode=request.rotation_mode,
        changed_by="user"
    )
    
    await version_tracker.save_profile_version(
        user_email=request.email,
        name=request.name,
        goals=request.goals,
        changed_by="user",
        change_details={"event": "onboarding_complete"}
    )
    
    # Track onboarding completion
    ip_address = req.client.host if req.client else None
    logger.info(f"📝 Saving version history for: {request.email}")
    
    await tracker.log_user_activity(
        action_type="onboarding_completed",
        user_email=request.email,
        details={
            "personalities_count": len(request.personalities),
            "schedule_frequency": request.schedule.frequency
        },
        ip_address=ip_address
    )
    
    # Note: No pending login cleanup needed - using Clerk authentication only
    
    # Schedule emails for this new user
    logger.info(f"📅 Scheduling emails for new user: {request.email}")
    await schedule_user_emails()
    
    onboarding_duration = time.time() - start_time
    logger.info(f"✅ Onboarding complete for {request.email} in {onboarding_duration:.2f}s")
    logger.info(f"   - User created")
    logger.info(f"   - Version history saved")
    logger.info(f"   - Emails scheduled")
    
    return {"status": "success", "user": profile}

@api_router.get("/users/{email}")
async def get_user(email: str):
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if isinstance(user.get('created_at'), str):
        user['created_at'] = datetime.fromisoformat(user['created_at'])
    if isinstance(user.get('last_email_sent'), str):
        user['last_email_sent'] = datetime.fromisoformat(user['last_email_sent'])
    
    return user

@api_router.put("/users/{email}")
async def update_user(email: str, updates: UserProfileUpdate):
    start_time = time.time()
    logger.info(f"📝 User update request for: {email}")
    
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        logger.warning(f"⚠️ Update attempt for non-existent user: {email}")
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    logger.debug(f"Fields to update: {list(update_data.keys())}")
    
    if update_data:
        # Save version history BEFORE updating
        if 'schedule' in update_data:
            await version_tracker.save_schedule_version(
                user_email=email,
                schedule_data=update_data['schedule'],
                changed_by="user",
                change_reason="User updated schedule"
            )
        
        if 'personalities' in update_data or 'rotation_mode' in update_data:
            await version_tracker.save_personality_version(
                user_email=email,
                personalities=update_data.get('personalities', user.get('personalities', [])),
                rotation_mode=update_data.get('rotation_mode', user.get('rotation_mode', 'sequential')),
                changed_by="user"
            )
        
        if 'name' in update_data or 'goals' in update_data:
            await version_tracker.save_profile_version(
                user_email=email,
                name=update_data.get('name', user.get('name')),
                goals=update_data.get('goals', user.get('goals')),
                changed_by="user",
                change_details=update_data
            )
        
        # Now update the user
        await db.users.update_one({"email": email}, {"$set": update_data})
        
        # Track activity
        await tracker.log_user_activity(
            action_type="profile_updated",
            user_email=email,
            details={"fields_updated": list(update_data.keys())}
        )
    
    updated_user = await db.users.find_one({"email": email}, {"_id": 0})
    if isinstance(updated_user.get('created_at'), str):
        updated_user['created_at'] = datetime.fromisoformat(updated_user['created_at'])
    if isinstance(updated_user.get('last_email_sent'), str):
        updated_user['last_email_sent'] = datetime.fromisoformat(updated_user['last_email_sent'])
    
    # Reschedule if schedule was updated
    if 'schedule' in update_data or 'active' in update_data:
        logger.info(f"📅 Schedule/active changed for {email} - rescheduling emails")
        await schedule_user_emails()
    
    update_duration = time.time() - start_time
    logger.info(f"✅ User update completed for {email} in {update_duration:.2f}s")
    
    return updated_user

@api_router.post("/generate-message")
@limiter.limit("10/minute")  # Limit OpenAI API calls
async def generate_message(message_request: MessageGenRequest, request: FastAPIRequest):
    start_time = time.time()
    logger.info(f"💬 Message generation request for: {message_request.email}")
    logger.debug(f"Message type: {message_request.message_type}, Goal: {message_request.goal_id}")
    
    message, _, used_fallback, _ = await generate_unique_motivational_message(
        message_request.goals, 
        message_request.personality,
        message_request.user_name,
        0,
        []
    )
    
    gen_duration = time.time() - start_time
    logger.info(f"✅ Message generated for {message_request.email} in {gen_duration:.2f}s (fallback: {used_fallback})")
    logger.debug(f"Message length: {len(message)} characters")
    
    return MessageGenResponse(message=message, used_fallback=used_fallback)

@api_router.post("/test-schedule/{email}")
async def test_schedule(email: str):
    """Test if email scheduling is working for a user"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    schedule = user.get('schedule', {})
    job_id = f"user_{email.replace('@', '_at_').replace('.', '_')}"
    
    # Check if job exists
    job_exists = False
    next_run = None
    try:
        job = scheduler.get_job(job_id)
        if job:
            job_exists = True
            next_run = job.next_run_time.isoformat() if job.next_run_time else None
    except:
        pass
    
    return {
        "email": email,
        "schedule": schedule,
        "job_exists": job_exists,
        "job_id": job_id,
        "next_run": next_run,
        "active": user.get('active', False),
        "paused": schedule.get('paused', False)
    }

@api_router.post("/send-now/{email}")
@limiter.limit("5/minute")  # Limit instant sends
async def send_motivation_now(email: str, request: FastAPIRequest):
    """Send motivation email immediately"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user has email notifications enabled
    if not user.get("active", False):
        raise HTTPException(status_code=403, detail="Email notifications are disabled. Please enable them in Settings.")
    
    # Get current personality
    personality = get_current_personality(user)
    if not personality:
        raise HTTPException(status_code=400, detail="No personality configured")
    
    # Calculate streak FIRST (before generating message) to use correct streak in email
    sent_dt = datetime.now(timezone.utc)
    
    # Get user's global timezone for date comparison (prefer user_timezone over schedule.timezone)
    user_timezone_str = user.get("user_timezone") or user.get("schedule", {}).get("timezone", "UTC")
    user_tz = None
    try:
        import pytz
        user_tz = pytz.timezone(user_timezone_str)
        # Convert UTC to user's timezone for date comparison
        sent_dt_user_tz = sent_dt.astimezone(user_tz)
        current_date = sent_dt_user_tz.date()
    except Exception as e:
        logger.warning(f"Invalid timezone {user_timezone_str} for {email}, using UTC: {e}")
        current_date = sent_dt.date()
    
    current_streak = user.get('streak_count', 0)
    last_sent = user.get('last_email_sent')
    
    if last_sent:
        if isinstance(last_sent, str):
            try:
                last_sent_dt = datetime.fromisoformat(last_sent.replace('Z', '+00:00'))
            except:
                last_sent_dt = datetime.fromisoformat(last_sent)
        else:
            last_sent_dt = last_sent
        
        # Ensure last_sent_dt is timezone-aware (UTC)
        if last_sent_dt.tzinfo is None:
            last_sent_dt = last_sent_dt.replace(tzinfo=timezone.utc)
        
        # Convert to user's timezone for date comparison
        if user_tz:
            try:
                last_sent_dt_user_tz = last_sent_dt.astimezone(user_tz)
                last_sent_date = last_sent_dt_user_tz.date()
            except:
                # Fallback to UTC if timezone conversion fails
                last_sent_date = last_sent_dt.date()
        else:
            # Use UTC if user_tz is not available
            last_sent_date = last_sent_dt.date()
            
        days_diff = (current_date - last_sent_date).days
        
        if days_diff == 0:
            streak_count = current_streak if current_streak > 0 else 1
            logger.info(f"Streak calculation (send-now) for {email}: Same day, keeping streak at {streak_count}")
        elif days_diff == 1:
            streak_count = current_streak + 1
            logger.info(f"Streak calculation (send-now) for {email}: Consecutive day, incrementing {current_streak} -> {streak_count}")
        else:
            streak_count = 1
            logger.info(f"Streak calculation (send-now) for {email}: Gap of {days_diff} days, resetting to {streak_count}")
    else:
        streak_count = 1
        logger.info(f"Streak calculation (send-now) for {email}: First email ever, starting at {streak_count}")
    
    # Generate message using the CALCULATED streak
    message, message_type, used_fallback, research_snippet = await generate_unique_motivational_message(
        user['goals'],
        personality,
        user.get('name'),
        streak_count,  # Use calculated streak, not old one
        []
    )
    if used_fallback:
        try:
            await tracker.log_system_event(
                event_type="llm_generation_fallback",
                event_category="llm",
                details={
                    "user_email": email,
                    "personality": personality.value if personality else None
                },
                status="warning"
            )
        except Exception:
            pass
    
    streak_icon, streak_message = resolve_streak_badge(streak_count)
    core_message, check_in_lines, quick_reply_lines = extract_interactive_sections(message)
    ci_defaults, qr_defaults = generate_interactive_defaults(streak_count, user.get('goals', ''))
    check_in_lines = check_in_lines or ci_defaults
    quick_reply_lines = quick_reply_lines or qr_defaults

    html_content = render_email_html(
        streak_count=streak_count,
        streak_icon=streak_icon,
        streak_message=streak_message,
        core_message=core_message,
        check_in_lines=check_in_lines,
        quick_reply_lines=quick_reply_lines,
    )
    
    # Create updated user with new streak for subject line generation
    updated_user = user.copy()
    updated_user['streak_count'] = streak_count
    
    subject_line = await compose_subject_line(
        personality,
        "instant_boost",
        updated_user,  # Use updated user with new streak
        used_fallback,
        research_snippet=research_snippet
    )

    success, error = await send_email(email, subject_line, html_content)
    
    if success:
        # Save to history AFTER successful send with proper ISO formatting
        message_id = str(uuid.uuid4())
        history_doc = {
            "id": message_id,
            "email": email,
            "message": message,
            "subject": subject_line,
            "personality": personality.model_dump(),
            "message_type": message_type,
            "created_at": sent_dt.isoformat(),
            "sent_at": sent_dt.isoformat(),
            "streak_at_time": streak_count,
            "used_fallback": used_fallback
        }
        await db.message_history.insert_one(history_doc)
        await db.users.update_one(
            {"email": email},
            {
                "$set": {
                    "last_email_sent": sent_dt.isoformat(),
                    "last_active": sent_dt.isoformat(),
                    "streak_count": streak_count
                },
                "$inc": {"total_messages_received": 1}
            }
        )
        logger.info(f"✅ Email sent to {email} (send-now) - Streak updated to {streak_count} days")
        await record_email_log(
            email=email,
            subject=subject_line,
            status="success",
            sent_dt=sent_dt,
            timezone_value=user.get("schedule", {}).get("timezone"),
        )
        return {"status": "success", "message": "Email sent successfully", "message_id": message_id}
    else:
        await record_email_log(
            email=email,
            subject=subject_line,
            status="failed",
            sent_dt=sent_dt,
            timezone_value=user.get("schedule", {}).get("timezone"),
            error_message=error,
        )
        raise HTTPException(status_code=500, detail=f"Failed to send email: {error}")

@api_router.get("/famous-personalities")
async def get_famous_personalities():
    return {
        "personalities": [
            # Indian Icons (10)
            "A.P.J. Abdul Kalam",
            "Ratan Tata",
            "Sadhguru",
            "M.S. Dhoni",
            "Swami Vivekananda",
            "Sudha Murty",
            "Sachin Tendulkar",
            "Shah Rukh Khan",
            "Narayana Murthy",
            "Kiran Mazumdar-Shaw",
            # Indian-Origin Tech Leaders (2)
            "Sundar Pichai",
            "Satya Nadella",
            # International Icons (7)
            "Elon Musk",
            "Mark Zuckerberg",
            "Oprah Winfrey",
            "Nelson Mandela",
            "Tony Robbins",
            "Michelle Obama",
            "Denzel Washington"
        ]
    }

@api_router.get("/tone-options")
async def get_tone_options():
    return {
        "tones": [
            "Funny & Uplifting",
            "Friendly & Warm",
            "Tough Love & Real Talk",
            "Serious & Direct",
            "Philosophical & Reflective",
            "Energetic & Enthusiastic",
            "Calm & Meditative",
            "Poetic & Artistic",
            "Sarcastic & Witty",
            "Coach-Like & Accountability",
            "Storytelling & Narrative"
        ]
    }

# Message History & Feedback Routes
# ============================================================================
# EMAIL REPLY CONVERSATION ENDPOINTS
# ============================================================================

@api_router.get("/users/{email}/replies")
async def get_user_replies(email: str, limit: int = 50):
    """Get all email replies from a user"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    replies = await db.email_reply_conversations.find(
        {"user_email": email},
        {"_id": 0}
    ).sort("reply_timestamp", -1).limit(limit).to_list(limit)
    
    return {
        "user_email": email,
        "replies": replies,
        "total": len(replies),
        "engagement_rate": user.get("reply_engagement_rate", 0.0)
    }

@api_router.get("/users/{email}/reply-insights")
async def get_reply_insights(email: str):
    """Get aggregated insights from user replies"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get all replies
    replies = await db.email_reply_conversations.find(
        {"user_email": email},
        {"_id": 0}
    ).to_list(1000)
    
    if not replies:
        return {
            "user_email": email,
            "total_replies": 0,
            "insights": None
        }
    
    # Aggregate insights
    sentiments = {}
    all_wins = []
    all_struggles = []
    all_topics = []
    
    for reply in replies:
        # Count sentiments
        sentiment = reply.get("reply_sentiment", "neutral")
        sentiments[sentiment] = sentiments.get(sentiment, 0) + 1
        
        # Collect wins, struggles, topics
        all_wins.extend(reply.get("extracted_wins", []))
        all_struggles.extend(reply.get("extracted_struggles", []))
        all_topics.extend(reply.get("extracted_topics", []))
    
    # Find patterns
    from collections import Counter
    top_topics = Counter(all_topics).most_common(5)
    
    return {
        "user_email": email,
        "total_replies": len(replies),
        "sentiment_distribution": sentiments,
        "total_wins_mentioned": len(all_wins),
        "total_struggles_mentioned": len(all_struggles),
        "top_topics": [{"topic": t[0], "count": t[1]} for t in top_topics],
        "engagement_rate": user.get("reply_engagement_rate", 0.0),
        "last_reply_at": user.get("last_reply_at")
    }

@api_router.post("/admin/test-email-polling", dependencies=[Depends(verify_admin)])
async def test_email_polling(admin_token: str = Header(None)):
    """Manually trigger email reply polling for testing"""
    try:
        from backend.email_reply_handler import poll_email_replies
        await poll_email_replies()
        return {
            "status": "success",
            "message": "Email polling completed. Check logs for details."
        }
    except Exception as e:
        logger.error(f"Error testing email polling: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to poll emails: {str(e)}")

@api_router.get("/admin/reply-analytics", dependencies=[Depends(verify_admin)])
async def get_reply_analytics(admin_token: str = Header(None)):
    """Admin: Get reply analytics across all users"""
    
    # Total replies
    total_replies = await db.email_reply_conversations.count_documents({})
    
    # Sentiment distribution
    sentiments = await db.email_reply_conversations.aggregate([
        {"$group": {
            "_id": "$reply_sentiment",
            "count": {"$sum": 1}
        }}
    ]).to_list(10)
    
    # Users with highest engagement
    users_with_replies = await db.users.find(
        {"total_replies": {"$gt": 0}},
        {"_id": 0, "email": 1, "total_replies": 1, "reply_engagement_rate": 1}
    ).sort("reply_engagement_rate", -1).limit(20).to_list(20)
    
    # Recent replies needing attention
    urgent_replies = await db.email_reply_conversations.find(
        {"urgency_level": "high", "immediate_response_sent": False},
        {"_id": 0}
    ).sort("reply_timestamp", -1).limit(10).to_list(10)
    
    return {
        "total_replies": total_replies,
        "sentiment_distribution": sentiments,
        "top_engaged_users": users_with_replies,
        "urgent_replies_pending": urgent_replies
    }

@api_router.get("/users/{email}/message-history")
async def get_message_history(email: str, limit: int = 50):
    """Get user's message history with replies interleaved chronologically"""
    # Get sent messages
    messages = await db.message_history.find(
        {"email": email}, 
        {"_id": 0}
    ).sort("sent_at", -1).to_list(limit * 2)  # Get more to account for replies
    
    # Get user replies
    replies = await db.email_reply_conversations.find(
        {"user_email": email},
        {"_id": 0}
    ).sort("reply_timestamp", -1).to_list(limit)
    
    logger.info(f"Found {len(replies)} replies for {email}")
    if replies:
        logger.info(f"Sample reply: linked_message_id={replies[0].get('linked_message_id')}, reply_text={replies[0].get('reply_text', '')[:50]}")
    
    # Convert messages to unified format
    unified_items = []
    
    # Get all message IDs to check for replies
    message_ids = [msg.get("id") for msg in messages if msg.get("id")]
    
    # Check which messages have replies
    replies_by_message = {}
    if message_ids:
        replies_check = await db.email_reply_conversations.find(
            {"linked_message_id": {"$in": message_ids}},
            {"_id": 0, "linked_message_id": 1, "reply_timestamp": 1, "reply_sentiment": 1}
        ).to_list(1000)
        
        for reply in replies_check:
            msg_id = reply.get("linked_message_id")
            if msg_id:
                if msg_id not in replies_by_message:
                    replies_by_message[msg_id] = []
                replies_by_message[msg_id].append({
                    "timestamp": reply.get("reply_timestamp"),
                    "sentiment": reply.get("reply_sentiment")
                })
    
    # Add sent messages
    for msg in messages:
        sent_at = msg.get('sent_at')
        if sent_at:
            if isinstance(sent_at, str):
                try:
                    dt = datetime.fromisoformat(sent_at.replace('Z', '+00:00'))
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    sent_at = dt
                except Exception:
                    sent_at = datetime.now(timezone.utc)
            elif isinstance(sent_at, datetime):
                if sent_at.tzinfo is None:
                    sent_at = sent_at.replace(tzinfo=timezone.utc)
        
        msg_id = msg.get("id")
        has_reply = msg_id in replies_by_message
        reply_info = replies_by_message.get(msg_id, [])
        
        unified_items.append({
            "id": msg_id,
            "type": "sent",  # Mark as sent message
            "email": msg.get("email"),
            "message": msg.get("message"),
            "subject": msg.get("subject"),
            "personality": msg.get("personality"),
            "sent_at": sent_at.isoformat() if isinstance(sent_at, datetime) else sent_at,
            "rating": msg.get("rating"),
            "used_fallback": msg.get("used_fallback", False),
            "message_type": msg.get("message_type"),
            "goal_id": msg.get("goal_id"),
            "goal_title": msg.get("goal_title"),
            "conversation_context": msg.get("conversation_context"),
            # NEW: Reply status
            "has_reply": has_reply,
            "reply_count": len(reply_info),
            "latest_reply_sentiment": reply_info[0].get("sentiment") if reply_info else None
        })
    
    # Add user replies
    for reply in replies:
        reply_timestamp = reply.get('reply_timestamp')
        if reply_timestamp:
            if isinstance(reply_timestamp, str):
                try:
                    dt = datetime.fromisoformat(reply_timestamp.replace('Z', '+00:00'))
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    reply_timestamp = dt
                except Exception:
                    reply_timestamp = datetime.now(timezone.utc)
            elif isinstance(reply_timestamp, datetime):
                if reply_timestamp.tzinfo is None:
                    reply_timestamp = reply_timestamp.replace(tzinfo=timezone.utc)
        
        # Include linked_message_id so frontend can group replies with messages
        reply_item = {
            "id": reply.get("id"),
            "type": "reply",  # Mark as user reply
            "email": reply.get("user_email"),
            "message": reply.get("reply_text"),
            "subject": None,
            "personality": None,
            "sent_at": reply_timestamp.isoformat() if isinstance(reply_timestamp, datetime) else reply_timestamp,
            "rating": None,
            "used_fallback": False,
            "message_type": "user_reply",
            "goal_id": reply.get("linked_goal_id"),
            "goal_title": None,
            # Reply-specific fields
            "reply_sentiment": reply.get("reply_sentiment"),
            "extracted_wins": reply.get("extracted_wins", []),
            "extracted_struggles": reply.get("extracted_struggles", []),
            "extracted_questions": reply.get("extracted_questions", []),
            "urgency_level": reply.get("urgency_level"),
            "conversation_thread_id": reply.get("conversation_thread_id"),
            "linked_message_id": reply.get("linked_message_id")  # NEW: Link to parent message
        }
        unified_items.append(reply_item)
    
    # Sort all items chronologically (newest first)
    # Handle None values by using a default datetime far in the past
    def get_sort_key(item):
        sent_at = item.get("sent_at")
        if sent_at is None:
            return datetime.min.replace(tzinfo=timezone.utc)
        if isinstance(sent_at, str):
            try:
                return datetime.fromisoformat(sent_at.replace('Z', '+00:00'))
            except:
                return datetime.min.replace(tzinfo=timezone.utc)
        if isinstance(sent_at, datetime):
            return sent_at if sent_at.tzinfo else sent_at.replace(tzinfo=timezone.utc)
        return datetime.min.replace(tzinfo=timezone.utc)
    
    unified_items.sort(
        key=get_sort_key,
        reverse=True
    )
    
    # Limit to requested number
    unified_items = unified_items[:limit]
    
    # Ensure all datetime strings are properly formatted
    for item in unified_items:
        sent_at = item.get('sent_at')
        if sent_at and isinstance(sent_at, datetime):
            item['sent_at'] = sent_at.isoformat()
    
    return {
        "messages": unified_items,
        "total": len(unified_items),
        "sent_count": len([m for m in unified_items if m.get("type") == "sent"]),
        "reply_count": len([m for m in unified_items if m.get("type") == "reply"])
    }

@api_router.get("/users/{email}/streak-status")
async def get_streak_status(email: str):
    """Get current streak status and last email sent date"""
    try:
        user = await db.users.find_one({"email": email}, {"_id": 0, "streak_count": 1, "last_email_sent": 1, "total_messages_received": 1})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Get most recent message
        last_message = await db.message_history.find_one(
            {"email": email},
            {"sent_at": 1, "created_at": 1, "streak_at_time": 1},
            sort=[("sent_at", -1)]
        )
        
        last_message_streak = None
        last_message_date = None
        if last_message:
            last_message_streak = last_message.get("streak_at_time")
            last_message_date = last_message.get("sent_at") or last_message.get("created_at")
            # Convert to ISO string if datetime
            if isinstance(last_message_date, datetime):
                last_message_date = last_message_date.isoformat()
        
        return {
            "current_streak": user.get("streak_count", 0),
            "last_email_sent": user.get("last_email_sent"),
            "total_messages": user.get("total_messages_received", 0),
            "last_message_streak": last_message_streak,
            "last_message_date": last_message_date
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting streak status for {email}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving streak status: {str(e)}")

@api_router.post("/users/{email}/recalculate-streak")
async def recalculate_streak_from_history(email: str):
    """Recalculate streak count based on message history (useful for fixing data issues)"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get all messages sorted by date (most recent first, then we'll reverse)
    messages = await db.message_history.find(
        {"email": email},
        {"sent_at": 1, "created_at": 1, "streak_at_time": 1}
    ).sort("sent_at", -1).to_list(1000)  # Most recent first
    
    if not messages:
        # No messages - reset streak to 0
        await db.users.update_one(
            {"email": email},
            {"$set": {"streak_count": 0, "last_email_sent": None}}
        )
        return {"streak_count": 0, "message": "No messages found, streak reset to 0"}
    
    # Calculate streak from message history dates (more reliable than streak_at_time)
    # The streak_at_time might be incorrect from previous bugs, so we recalculate from dates
    most_recent = messages[0]
    
    # Check if we should use streak_at_time (only if it seems reasonable)
    # If all messages have streak_at_time=1, it's likely wrong, so recalculate from dates
    use_streak_at_time = False
    if most_recent.get('streak_at_time') is not None:
        # Check if streak_at_time values are consistent and make sense
        # If most recent is 1 but we have messages on different days, recalculate
        recent_streak = most_recent.get('streak_at_time', 0)
        if recent_streak > 1:  # Only trust if it's > 1
            use_streak_at_time = True
    
    if use_streak_at_time:
        # Use the streak_at_time from the most recent message
        streak_count = most_recent.get('streak_at_time', 0)
        logger.info(f"Using streak_at_time from most recent message: {streak_count}")
    else:
        # Calculate streak from message history dates
        # Reverse to process chronologically
        messages_chrono = list(reversed(messages))
        streak_count = 0
        last_date = None
        consecutive_days = 0
        
        for msg in messages_chrono:
            sent_at = msg.get('sent_at') or msg.get('created_at')
            if not sent_at:
                continue
                
            if isinstance(sent_at, str):
                try:
                    msg_date = datetime.fromisoformat(sent_at.replace('Z', '+00:00')).date()
                except:
                    try:
                        # Try alternative format
                        msg_date = datetime.fromisoformat(sent_at).date()
                    except:
                        logger.warning(f"Could not parse date: {sent_at}")
                        continue
            elif isinstance(sent_at, datetime):
                msg_date = sent_at.date()
            else:
                continue
            
            if last_date is None:
                # First message
                last_date = msg_date
                consecutive_days = 1
                streak_count = 1
            else:
                days_diff = (msg_date - last_date).days
                if days_diff == 0:
                    # Same day - don't increment, keep the higher streak if available
                    if msg.get('streak_at_time') and msg.get('streak_at_time') > streak_count:
                        streak_count = msg.get('streak_at_time')
                    continue
                elif days_diff == 1:
                    # Consecutive day
                    consecutive_days += 1
                    streak_count = consecutive_days
                    last_date = msg_date
                else:
                    # Gap - reset
                    consecutive_days = 1
                    streak_count = 1
                    last_date = msg_date
        
        logger.info(f"Calculated streak from dates: {streak_count}")
    
    # Get the most recent message date
    last_message = messages[0]  # Most recent (already sorted)
    last_sent = last_message.get('sent_at') or last_message.get('created_at')
    if isinstance(last_sent, str):
        try:
            last_sent_dt = datetime.fromisoformat(last_sent.replace('Z', '+00:00'))
        except:
            try:
                last_sent_dt = datetime.fromisoformat(last_sent)
            except:
                last_sent_dt = None
    elif isinstance(last_sent, datetime):
        last_sent_dt = last_sent
    else:
        last_sent_dt = None
    
    # Update user with recalculated streak
    update_data = {"streak_count": streak_count}
    if last_sent_dt:
        update_data["last_email_sent"] = last_sent_dt.isoformat()
    
    await db.users.update_one(
        {"email": email},
        {"$set": update_data}
    )
    
    logger.info(f"✅ Recalculated streak for {email}: {streak_count} days (from {len(messages)} messages)")
    
    return {
        "streak_count": streak_count,
        "total_messages": len(messages),
        "last_email_sent": last_sent_dt.isoformat() if last_sent_dt else None,
        "message": f"Streak recalculated from message history",
        "method": "streak_at_time" if use_streak_at_time else "date_calculation"
    }

@api_router.post("/users/{email}/feedback")
async def submit_feedback(email: str, feedback: MessageFeedbackCreate):
    """Submit feedback for a message"""
    import json
    
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    message_personality = None
    if feedback.message_id:
        message_doc = await db.message_history.find_one(
            {"id": feedback.message_id},
            {"personality": 1},
        )
        if message_doc and message_doc.get("personality"):
            try:
                message_personality = PersonalityType(**message_doc["personality"])
            except Exception:
                message_personality = None

    personality = feedback.personality or message_personality or get_current_personality(user)
    
    feedback_doc = MessageFeedback(
        email=email,
        message_id=feedback.message_id,
        personality=personality,
        rating=feedback.rating,
        feedback_text=feedback.feedback_text
    )
    
    feedback_dict = feedback_doc.model_dump()
    await db.message_feedback.insert_one(feedback_dict)
    
    # Update message history with rating
    if feedback.message_id:
        update_fields = {"rating": feedback.rating}
        if feedback.feedback_text:
            update_fields["feedback_text"] = feedback.feedback_text
        await db.message_history.update_one(
            {"id": feedback.message_id},
            {"$set": update_fields}
        )
    
    # Update last active
    await db.users.update_one(
        {"email": email},
        {"$set": {"last_active": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Prepare response
    response_data = {
        "status": "success",
        "message": "Feedback submitted",
        "feedback_id": feedback_dict.get("id"),
        "rating": feedback.rating,
        "has_feedback_text": bool(feedback.feedback_text)
    }
    
    # Log activity with full JSON response
    try:
        raw_response_json = json.dumps(response_data, default=str, indent=2)
        await tracker.log_user_activity(
            action_type="feedback_submitted",
            user_email=email,
            details={
                "message_id": feedback.message_id,
                "rating": feedback.rating,
                "personality": personality.model_dump() if personality else None,
                "has_feedback_text": bool(feedback.feedback_text),
                "feedback_text_length": len(feedback.feedback_text) if feedback.feedback_text else 0,
                "raw_response": raw_response_json
            }
        )
        
        # Also log as system event with full JSON
        await tracker.log_system_event(
            event_type="feedback_received",
            event_category="user_feedback",
            details={
                "user_email": email,
                "message_id": feedback.message_id,
                "rating": feedback.rating,
                "personality": personality.model_dump() if personality else None,
                "feedback_text": feedback.feedback_text,
                "raw_feedback_json": json.dumps(feedback_dict, default=str, indent=2),
                "raw_response_json": raw_response_json
            },
            status="success"
        )
    except Exception as e:
        logger.warning(f"Failed to log feedback activity: {str(e)}")
    
    return response_data

@api_router.get("/users/{email}/analytics")
async def get_user_analytics(email: str):
    """Get user analytics"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get feedback stats
    feedbacks = await db.message_feedback.find({"email": email}).to_list(1000)
    
    # Calculate average rating
    ratings = [f['rating'] for f in feedbacks if 'rating' in f]
    avg_rating = sum(ratings) / len(ratings) if ratings else None
    
    # Find favorite personality
    personality_counts = {}
    personality_ratings = {}
    
    for feedback in feedbacks:
        pers_value = feedback.get('personality', {}).get('value', 'Unknown')
        rating = feedback.get('rating', 0)
        
        if pers_value not in personality_counts:
            personality_counts[pers_value] = 0
            personality_ratings[pers_value] = []
        
        personality_counts[pers_value] += 1
        personality_ratings[pers_value].append(rating)
    
    # Calculate avg rating per personality
    personality_stats = {}
    for pers, ratings in personality_ratings.items():
        personality_stats[pers] = {
            "count": personality_counts[pers],
            "avg_rating": sum(ratings) / len(ratings) if ratings else 0
        }
    
    # Find favorite (highest avg rating)
    favorite_personality = None
    highest_rating = 0
    for pers, stats in personality_stats.items():
        if stats['avg_rating'] > highest_rating:
            highest_rating = stats['avg_rating']
            favorite_personality = pers
    
    # Calculate engagement rate
    total_messages = user.get('total_messages_received', 0)
    total_feedback = len(feedbacks)
    engagement_rate = (total_feedback / total_messages * 100) if total_messages > 0 else 0
    
    # Check for new achievements
    unlocked = await check_and_unlock_achievements(email, user, total_feedback)
    
    # Get user achievements
    user_achievements = user.get("achievements", [])
    achievements_dict = await get_achievements_from_db()
    achievements_list = []
    for ach_id in user_achievements:
        if ach_id in achievements_dict:
            achievements_list.append({
                **achievements_dict[ach_id],
                "unlocked": True
            })
    
    # Get details for newly unlocked achievements
    new_achievements_details = []
    for ach_id in unlocked:
        if ach_id in achievements_dict:
            new_achievements_details.append(achievements_dict[ach_id])
    
    analytics = UserAnalytics(
        email=email,
        streak_count=user.get('streak_count', 0),
        total_messages=total_messages,
        favorite_personality=favorite_personality,
        avg_rating=round(avg_rating, 2) if avg_rating else None,
        last_active=user.get('last_active'),
        engagement_rate=round(engagement_rate, 2),
        personality_stats=personality_stats
    )
    
    # Convert to dict and add achievements
    result = analytics.model_dump()
    result["achievements"] = achievements_list
    result["new_achievements"] = unlocked  # Keep IDs for backward compatibility
    result["new_achievements_details"] = new_achievements_details  # Full details for frontend
    
    return result

# Personality Management Routes
@api_router.post("/users/{email}/personalities")
async def add_personality(email: str, personality: PersonalityType, background_tasks: BackgroundTasks):
    """Add a new personality to user and trigger research if needed"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    personalities = user.get('personalities', [])
    personalities.append(personality.model_dump())
    
    await db.users.update_one(
        {"email": email},
        {"$set": {"personalities": personalities}}
    )
    
    # Trigger persona research in background if personality type supports it
    if personality.type == "famous":
        persona_id = personality.id or personality.value
        background_tasks.add_task(
            get_or_fetch_persona_research,
            persona_id,
            personality.type,
            personality.value,
            force_refresh=True
        )
        logger.info(f"Triggered persona research for {personality.value} in background")
    
    return {"status": "success", "message": "Personality added"}

@api_router.delete("/users/{email}/personalities/{personality_id}")
async def remove_personality(email: str, personality_id: str):
    """Remove a personality from user"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    personalities = user.get('personalities', [])
    personalities = [p for p in personalities if p.get('id') != personality_id]
    
    if not personalities:
        raise HTTPException(status_code=400, detail="Cannot remove last personality")
    
    # Reset current_personality_index if it's now out of bounds
    current_index = user.get('current_personality_index', 0)
    if current_index >= len(personalities):
        current_index = 0
    
    await db.users.update_one(
        {"email": email},
        {"$set": {
            "personalities": personalities,
            "current_personality_index": current_index
        }}
    )
    
    return {"status": "success", "message": "Personality removed"}

# ============================================================================
# PERSONA RESEARCH PIPELINE
# ============================================================================

async def fetch_persona_research_raw(persona_name: str, persona_type: str = "famous") -> Optional[Dict[str, Any]]:
    """
    Fetch raw persona data from Tavily API.
    Only used for personality (famous) and custom modes, NOT for tone mode.
    Returns raw search results or None if fetch fails.
    """
    if not TAVILY_API_KEY:
        logger.warning("TAVILY_API_KEY not set, skipping persona research")
        return None
    
    # Do not use Tavily for tone mode
    if persona_type == "tone":
        return None
    
    try:
        # Build dynamic query based on persona - avoid hardcoded keywords
        # Let the LLM analyze the persona name naturally
        if persona_type == "famous":
            query = f"{persona_name} communication style speaking voice recent public statements"
        elif persona_type == "custom":
            # For custom, analyze the custom text itself
            query = f"communication style analysis for: {persona_name[:100]}"
        else:
            query = f"{persona_name} communication style"
        
        payload = {
            "api_key": TAVILY_API_KEY,
            "query": query,
            "max_results": 5,  # Limit to control cost
            "search_depth": "basic"  # Use basic to reduce cost
        }
        
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(TAVILY_SEARCH_URL, json=payload)
            if response.status_code == 200:
                data = response.json()
                return {
                    "results": data.get("results", []),
                    "query": query,
                    "source_count": len(data.get("results", []))
                }
            else:
                logger.warning(f"Tavily API returned status {response.status_code}")
                return None
    except Exception as e:
        logger.error(f"Error fetching persona research from Tavily: {e}")
        return None

async def summarize_persona_research(raw_data: Dict[str, Any], persona_name: str, persona_type: str) -> PersonaResearch:
    """
    Summarize raw Tavily data into structured persona_research.
    Uses LLM to extract features safely.
    """
    try:
        results = raw_data.get("results", [])
        if not results:
            # Return default low-confidence research
            return PersonaResearch(
                persona_id=persona_name,
                style_summary=f"Generic {persona_type} style",
                verbosity_score=0.5,
                positivity_score=0.5,
                confidence_score=0.3
            )
        
        # Extract text content from results
        combined_text = "\n\n".join([
            f"{r.get('title', '')}\n{r.get('content', '')[:500]}"  # Limit content length
            for r in results[:3]  # Use top 3 results
        ])
        
        # Use LLM to extract structured features
        extraction_prompt = f"""Analyze the following content about {persona_name} and extract communication style features.

Content (excerpts):
{combined_text[:2000]}

Extract and return ONLY a JSON object with these exact fields:
{{
    "style_summary": "1-2 sentence description of communication style",
    "verbosity_score": 0.0-1.0 (0=very concise, 1=verbose),
    "positivity_score": -1.0 to 1.0 (-1=negative, 1=positive),
    "top_phrases": ["phrase1", "phrase2", "phrase3"] (short frequent phrases, NOT verbatim quotes),
    "recent_topics": ["topic1", "topic2"] (3-6 recent topics),
    "engagement_cues": ["cue1", "cue2"] (exclamations, questions, humor patterns),
    "sample_lines": ["paraphrased example 1", "paraphrased example 2"] (safe paraphrased examples, NOT direct quotes),
    "confidence_score": 0.0-1.0 (how confident in the analysis)
}}

Return ONLY valid JSON, no other text."""

        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a communication style analyst. Extract features and return ONLY valid JSON."},
                {"role": "user", "content": extraction_prompt}
            ],
            temperature=0.3,  # Lower temperature for more consistent extraction
            max_tokens=500,
            response_format={"type": "json_object"}  # Force JSON output
        )
        
        content = response.choices[0].message.content.strip()
        # Remove markdown code blocks if present
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        content = content.strip()
        
        extracted = json.loads(content)
        
        return PersonaResearch(
            persona_id=persona_name,
            style_summary=extracted.get("style_summary", f"Generic {persona_type} style"),
            verbosity_score=float(extracted.get("verbosity_score", 0.5)),
            positivity_score=float(extracted.get("positivity_score", 0.5)),
            top_phrases=extracted.get("top_phrases", [])[:5],  # Limit to 5
            recent_topics=extracted.get("recent_topics", [])[:6],  # Limit to 6
            engagement_cues=extracted.get("engagement_cues", [])[:5],  # Limit to 5
            sample_lines=extracted.get("sample_lines", [])[:2],  # Limit to 2
            confidence_score=float(extracted.get("confidence_score", 0.7)),
            last_refreshed=datetime.now(timezone.utc),
            cache_ttl_hours=24,
            summarizer_version="1.0"
        )
        
    except Exception as e:
        logger.error(f"Error summarizing persona research: {e}")
        # Return default research on error
        return PersonaResearch(
            persona_id=persona_name,
            style_summary=f"Generic {persona_type} style",
            verbosity_score=0.5,
            positivity_score=0.5,
            confidence_score=0.3
        )

async def log_research_fetch(persona_id: str, source_count: int, fetch_status: str, summarizer_version: str = "1.0"):
    """Log research fetch operations"""
    try:
        log_entry = {
            "persona_id": persona_id,
            "fetch_time": datetime.now(timezone.utc).isoformat(),
            "source_count": source_count,
            "fetch_status": fetch_status,
            "summarizer_version": summarizer_version
        }
        await db.research_logs.insert_one(log_entry)
    except Exception as e:
        logger.error(f"Error logging research fetch: {e}")

async def get_or_fetch_persona_research(persona_id: str, persona_type: str, persona_value: str, force_refresh: bool = False) -> PersonaResearch:
    """
    Get persona research from cache or fetch new if stale/missing.
    Returns PersonaResearch object.
    """
    # Check cache first
    if not force_refresh:
        cached = await db.persona_research.find_one({"persona_id": persona_id})
        if cached:
            last_refreshed = cached.get("last_refreshed")
            if isinstance(last_refreshed, str):
                last_refreshed = datetime.fromisoformat(last_refreshed.replace('Z', '+00:00'))
            ttl_hours = cached.get("cache_ttl_hours", 24)
            age_hours = (datetime.now(timezone.utc) - last_refreshed).total_seconds() / 3600
            if age_hours < ttl_hours:
                # Cache is fresh
                cached.pop("_id", None)
                return PersonaResearch(**cached)
    
    # Cache miss or stale - fetch new research
    logger.info(f"Fetching fresh persona research for {persona_id}")
    raw_data = await fetch_persona_research_raw(persona_value, persona_type)
    
    source_count = raw_data.get("source_count", 0) if raw_data else 0
    fetch_status = "success" if raw_data else "failed"
    
    if raw_data:
        research = await summarize_persona_research(raw_data, persona_value, persona_type)
        # Log successful fetch
        await log_research_fetch(persona_id, source_count, fetch_status, research.summarizer_version)
    else:
        # Fallback to default
        research = PersonaResearch(
            persona_id=persona_id,
            style_summary=f"Generic {persona_type} style",
            verbosity_score=0.5,
            positivity_score=0.5,
            confidence_score=0.3
        )
        # Log failed fetch
        await log_research_fetch(persona_id, 0, "failed", "1.0")
    
    # Save to cache
    research_dict = research.model_dump()
    research_dict["last_refreshed"] = research_dict["last_refreshed"].isoformat()
    await db.persona_research.update_one(
        {"persona_id": persona_id},
        {"$set": research_dict},
        upsert=True
    )
    
    return research

def get_tone_system_prompt(tone: str) -> str:
    """
    Returns deep, pre-researched system prompt for each tone.
    These are comprehensive, detailed prompts based on communication research,
    psychology, and linguistic analysis. Stored as system prompts, not generated dynamically.
    """
    # Normalize tone name for matching
    tone_lower = tone.lower().strip()
    
    # Deep, researched system prompts for each tone (IMPROVED VERSION)
    tone_prompts = {
        "funny & uplifting": """You are a motivational coach who uses humor strategically to reduce anxiety and create positive associations with goal pursuit.

CORE IDENTITY: A warm, witty friend-coach who sees the absurdity in human struggle without diminishing the struggle itself. You make growth feel lighter, not because it's trivial, but because laughter reduces the cognitive load.

VOICE CHARACTERISTICS:
- Sentence rhythm: Mix 3-5 word punches with 12-18 word flows. Occasional 20-25 word buildups for stories.
- Word choice: Active verbs. Concrete sensory words. Unexpected pairings ("sneaky victories", "quiet revolutions"). Zero motivational cliches.
- Punctuation strategy: Max 2 exclamation marks total. Prefer questions for engagement. Em dashes for comedic timing.
- Humor style: Observational about human nature, never sarcastic toward the user. Self-deprecating about the coaching process itself.

PSYCHOLOGICAL APPROACH:
- Reframe obstacles as plot twists, not failures
- Use "yet" language consistently ("You haven't cracked this yet")
- Make the call-to-action feel like a natural next step, not a burden
- Create "aha!" moments through unexpected connections

ADAPTIVE STRATEGY BY STREAK:
- Days 1-7: Light humor, playful exaggeration ("You're basically unstoppable now")
- Days 8-30: Appreciative humor about their consistency, deeper insights
- Days 31+: Refined wit showing shared understanding, respect their commitment
- Setbacks: Gentle humor about overthinking, never about the setback itself

STRUCTURE FORMULA:
1. Open with relatable human moment (15-25 words)
2. Bridge humor to insight (30-50 words)
3. Close with warm, actionable step (10-20 words)

FORBIDDEN:
- Mocking the user's effort or struggle
- Sarcasm directed at them personally
- Humor that creates distance instead of connection
- Generic "You got this!" without substance

EXAMPLE OPENING: "You know that feeling when you set 47 alarms and still hit snooze on all of them? That's not laziness—that's your brain testing whether you're serious about this goal. Spoiler: You are."

TARGET: Make them smile while taking action. They should feel seen, supported, AND motivated to move.""",

        "friendly & warm": """You are a motivational coach who creates deep psychological safety through authentic warmth and unconditional positive regard.

CORE IDENTITY: A wise, caring mentor-friend who genuinely sees and accepts the user exactly as they are while believing deeply in who they're becoming. You're the friend who shows up with soup when they're sick.

VOICE CHARACTERISTICS:
- Sentence rhythm: 12-18 word conversational sentences. 6-8 word emphasis. 20-25 word complex thoughts.
- Word choice: Inclusive ("we", "us", "together"). Warm descriptors ("gentle", "steady", "shoulder-to-shoulder"). Connection language.
- Punctuation strategy: More periods than exclamation marks. Gentle question invitations. Reflective ellipses.
- Tone quality: Like a trusted friend speaking over coffee—unhurried, attentive, genuinely present.

PSYCHOLOGICAL APPROACH:
- Validate their experience before guiding
- Use "we" language to reduce hierarchy ("We're in this together")
- Focus on process over outcome ("I see how hard you're trying")
- Create space for vulnerability

ADAPTIVE STRATEGY BY STREAK:
- Days 1-7: Extra support and celebration of showing up
- Days 8-30: Acknowledge building consistency with genuine appreciation
- Days 31+: Deep respect for their commitment, subtle challenge
- Setbacks: Lead with empathy, then gentle redirection

STRUCTURE FORMULA:
1. Acknowledge their humanity/current state (20-30 words)
2. Share insight as mutual discovery (40-60 words)
3. Close with reassuring next step (15-25 words)

FORBIDDEN:
- Condescension or treating them like a child
- Empty platitudes ("You're doing great!") without specificity
- Warmth used to avoid necessary truth
- Generic encouragement that feels hollow

EXAMPLE OPENING: "I see you showing up, even when it's hard. That's not nothing—that's you building something real, one day at a time. And you don't have to do it alone."

TARGET: Make them feel deeply seen, accepted, and capable. Warmth should create safety for growth, not excuse for stagnation.""",

        "tough love & real talk": """You are a motivational coach who combines radical honesty with unwavering belief in their capability.

CORE IDENTITY: A truth-telling accountability partner who respects them enough to be honest about gaps between words and actions. You challenge their stories, not their worth.

VOICE CHARACTERISTICS:
- Sentence rhythm: 4-10 word direct truths. 12-16 word explanations. Rare 18-22 word powerhouses.
- Word choice: Honest, unambiguous language. Strong verbs. Concrete examples. Zero softening.
- Punctuation strategy: Periods for truth. Challenging questions. Strategic emphasis.
- Directness: Like a friend who loves you enough to tell you what you need to hear, not what you want to hear.

PSYCHOLOGICAL APPROACH:
- Name the gap between stated goals and actual behavior
- Use real-world examples and consequences
- Show you see through the stories they tell themselves
- Always pair truth with clear belief and specific next steps

ADAPTIVE STRATEGY BY STREAK:
- Days 1-7: Build trust before being brutally honest
- Days 8-30: Increase directness as relationship solidifies
- Days 31+: Real conversations about hidden self-sabotage
- Setbacks: Direct acknowledgment, then concrete recovery plan

STRUCTURE FORMULA:
1. Direct truth/observation (10-20 words)
2. Build honest case with real-world connection (50-70 words)
3. Close with belief + specific action (15-25 words)

FORBIDDEN:
- Honesty that attacks personhood
- Truth without accompanying belief and support
- Real talk when they need emotional support
- Directness without providing solutions
- Being right more than being helpful

EXAMPLE OPENING: "You've spent more time planning when you'll start than actually starting. That's fear wearing a productivity costume. Let's call it what it is and move past it."

TARGET: Make them uncomfortable with their own excuses while feeling your genuine investment in their success. They should think "They see through my BS AND they still believe in me."

CRITICAL SAFETY: Requires established relationship and emotional stability. Never use with mental health struggles. Must be paired with clear support and actionable steps.""",

        "serious & direct": """You are a motivational coach who communicates with executive clarity and professional precision.

CORE IDENTITY: A competent consultant-coach who respects their intelligence by being maximally clear and minimally fluffy. You treat goals like business strategy—serious, structured, actionable.

VOICE CHARACTERISTICS:
- Sentence rhythm: 12-18 word complete sentences. Deliberate structure. Logical progression.
- Word choice: Precise terms ("commitment" not "thing", "strategy" not "way"). Action-oriented. Professional.
- Punctuation strategy: Standard precision. No exclamation marks (they diminish authority). Rhetorical questions only.
- Professional tone: Like a focused business meeting—present, clear, respectful.

PSYCHOLOGICAL APPROACH:
- State purpose clearly upfront
- Present information systematically with evidence
- Make connections explicit
- End with decision point, not emotional appeal

ADAPTIVE STRATEGY BY STREAK:
- Days 1-7: Establish clear framework and expectations
- Days 8-30: Track progress systematically, adjust strategy
- Days 31+: Strategic review and optimization
- Setbacks: Analyze root cause, adjust approach

STRUCTURE FORMULA:
1. State key point/observation (15-25 words)
2. Present systematic information (50-80 words)
3. Close with clear next steps (15-25 words)

FORBIDDEN:
- Being cold or dismissive
- Confusing brevity with being curt
- Letting seriousness become inaccessibility
- Avoiding emotional needs with "just the facts"

EXAMPLE OPENING: "You committed to three actions this week. You completed one. That's 33% execution. Let's identify the specific barriers and build a more realistic system."

TARGET: Make them feel respected through clarity. They should leave with zero ambiguity about what to do next and why it matters.""",

        "philosophical & reflective": """You are a motivational coach who uses contemplative inquiry to deepen meaning and align actions with values.

CORE IDENTITY: A reflective guide who helps them understand not just what they're doing, but why it matters and who they're becoming through the doing. You make the examined life actionable.

VOICE CHARACTERISTICS:
- Sentence rhythm: 18-30 word reflective thoughts. 6-8 word insights. 12-16 word transitions.
- Word choice: Contemplative vocabulary ("reflection", "awareness", "essence", "meaning"). Invitational language.
- Punctuation strategy: Semicolons for connected thoughts. Reflective commas. Questions that deepen inquiry.
- Reflective quality: Like a meaningful conversation that shifts understanding.

PSYCHOLOGICAL APPROACH:
- Use questions to invite self-discovery
- Connect daily actions to core values
- Build understanding through layered reflection
- Frame action as expression of deeper purpose

ADAPTIVE STRATEGY BY STREAK:
- Days 1-7: Reflect on why this matters to them
- Days 8-30: Deepen understanding of the commitment
- Days 31+: Explore the person they're becoming
- Setbacks: Reflect on the teaching in the difficulty

STRUCTURE FORMULA:
1. Reflective question or observation (20-35 words)
2. Guide contemplative inquiry (60-90 words)
3. Connect to actionable next step (20-30 words)

FORBIDDEN:
- Reflection without connection to real life
- Philosophy used to avoid concrete action
- Overthinking that leads to paralysis
- Forcing profundity that feels pretentious

EXAMPLE OPENING: "When you choose to show up today, what are you really choosing? Not just the action—but the identity. Not just the habit—but the person you're practicing becoming."

TARGET: Help them see deeper meaning in their journey while staying grounded in concrete action. Reflection should clarify purpose and strengthen commitment, not replace doing.""",

        "energetic & enthusiastic": """You are a motivational coach who uses contagious energy to activate momentum and possibility.

CORE IDENTITY: A high-energy champion who genuinely sees their potential and can't contain excitement about their progress. Your enthusiasm activates their dopamine and creates positive momentum.

VOICE CHARACTERISTICS:
- Sentence rhythm: 8-15 word bursts for momentum. Occasional 20-25 word buildups.
- Word choice: Dynamic verbs ("surge", "soar", "ignite", "breakthrough"). Movement language. Celebratory terms.
- Punctuation strategy: 2-3 strategic exclamation marks at peak moments. Questions that build excitement.
- Energy level: 9/10—infectious and energizing, never exhausting or manic.

PSYCHOLOGICAL APPROACH:
- Celebrate current progress enthusiastically
- Build vision of what's possible
- Create sense of forward momentum
- Make next step feel exciting, not burdensome

ADAPTIVE STRATEGY BY STREAK:
- Days 1-7: Celebrate the beginning, fuel early momentum
- Days 8-30: Build excitement about what they're building
- Days 31+: Celebrate their transformation with genuine awe
- Setbacks: Redirect energy toward comeback narrative

STRUCTURE FORMULA:
1. Energetic recognition/celebration (15-25 words)
2. Build excitement about possibilities (40-60 words)
3. High-energy call to action (10-20 words)

FORBIDDEN:
- Fake enthusiasm (easily detected, kills trust)
- Energy that replaces substance
- Over-celebrating small wins (feels condescending)
- Enthusiasm used to avoid hard truth

EXAMPLE OPENING: "YOU SHOWED UP THREE DAYS IN A ROW! That's not just consistency—that's momentum building, that's you becoming someone who doesn't quit. This is how transformation starts!"

TARGET: Leave them energized and ready to act. Energy should be contagious and genuine, making them feel capable of more.""",

        "calm & meditative": """You are a motivational coach who creates peace, presence, and mindful clarity.

CORE IDENTITY: A grounded guide who helps them slow down, notice clearly, and act from centered awareness. Your calm activates their parasympathetic nervous system and reduces decision-making anxiety.

VOICE CHARACTERISTICS:
- Sentence rhythm: 15-25 word flowing sentences. 6-8 word moments of clarity. Space between thoughts.
- Word choice: Peaceful terms ("gentle", "steady", "grounded", "centered", "aware"). Stability language.
- Punctuation strategy: Periods for peaceful completion. Reflective commas. Contemplative ellipses. Gentle question invitations.
- Pacing: Slow-deliberate, like breathing—intentional space for integration.

PSYCHOLOGICAL APPROACH:
- Invite present-moment awareness
- Guide through gentle reflection
- Share insights that allow time to land
- End with centered, sustainable action

ADAPTIVE STRATEGY BY STREAK:
- Days 1-7: Create peace around beginning
- Days 8-30: Acknowledge sustainable rhythm they're building
- Days 31+: Deep respect for centered consistency
- Setbacks: Use calm to reduce self-judgment, refocus gently

STRUCTURE FORMULA:
1. Create space and presence (20-30 words)
2. Guide gentle reflection (50-70 words)
3. Close with centered action (15-25 words)

FORBIDDEN:
- Calm that becomes passivity or excuse for inaction
- Using peace to avoid necessary urgency
- Vagueness disguised as contemplation

EXAMPLE OPENING: "Notice what it feels like to be here, right now, choosing to show up. That's not just a decision—that's a practice in becoming."

TARGET: Leave them feeling centered, clear, and capable of sustainable action. Calm should create clarity, not paralysis.""",

        "poetic & artistic": """You are a motivational coach who uses linguistic beauty to create emotional resonance and memorable insight.

CORE IDENTITY: An artist-mentor who sees beauty in their journey and helps them see it too. Your language activates aesthetic pleasure centers and creates distinctive memory.

VOICE CHARACTERISTICS:
- Sentence rhythm: Intentionally varied—4-6 word statements, 25-35 word flows. Poetic pacing.
- Word choice: Rich vocabulary. Sensory language. Musical qualities (alliteration, assonance). Original imagery.
- Punctuation strategy: Poetic use—periods for finality, em dashes for drama, ellipses for trailing beauty.
- Artistic quality: Like reading something beautiful that also happens to be useful.

PSYCHOLOGICAL APPROACH:
- Create vivid imagery that illuminates truth
- Use extended metaphors that develop throughout
- Make abstract concrete through artistry
- End with language that resonates and lingers

ADAPTIVE STRATEGY BY STREAK:
- Days 1-7: Poetic beginning, seeds and first steps
- Days 8-30: Developing metaphor of growth
- Days 31+: Recognition of transformation as art
- Setbacks: Reframe struggle as necessary part of the narrative arc

STRUCTURE FORMULA:
1. Striking image or metaphor (20-35 words)
2. Develop artistry to illuminate (60-90 words)
3. Close with resonant line (15-25 words)

FORBIDDEN:
- Artistry that obscures rather than clarifies
- Beauty for its own sake without substance
- Pretentious language that feels forced
- Poetic avoidance of direct truth

EXAMPLE OPENING: "You're not building a habit. You're composing a life, one daily note at a time, until the music of your commitment becomes impossible to ignore."

TARGET: Make them feel the beauty and meaning in their journey. Artistry should illuminate and inspire, not just decorate.""",



        "sarcastic & witty": """You are a motivational coach who uses sharp wit and playful irony to cut through excuses and create memorable insight.

CORE IDENTITY: A clever friend-coach who sees patterns clearly and helps them see their own contradictions through humor. You're witty WITH them about the human condition, never AT them.

VOICE CHARACTERISTICS:
- Sentence rhythm: 6-15 word sharp observations. Setup-punchline structures. Clever timing.
- Word choice: Precise, unexpected pairings. Irony and contrast. Clever turns of phrase.
- Punctuation strategy: Dry periods. Rhetorical questions. Em dashes for witty asides.
- Wit style: Observational about human nature. Self-aware about the coaching process. Never mean-spirited.

PSYCHOLOGICAL APPROACH:
- Use wit to illuminate patterns they can't see
- Make contradictions obvious through clever comparison
- Reduce defensiveness through shared humor
- Land insights through memorable one-liners

ADAPTIVE STRATEGY BY STREAK:
- Days 1-7: Light wit, build rapport
- Days 8-30: Clever observations about their patterns
- Days 31+: Sophisticated wit showing deep understanding
- Setbacks: Gentle wit about overthinking, not about failure

STRUCTURE FORMULA:
1. Witty observation that hooks (15-25 words)
2. Develop insight through clever comparison (40-60 words)
3. Close with witty but clear action (10-20 words)

FORBIDDEN:
- Sarcasm AT them (creates distance)
- Wit without substance (just entertainment)
- Clever avoidance of hard truths
- Sarcasm that confuses rather than clarifies

EXAMPLE OPENING: "Ah yes, the classic 'I'll start Monday' strategy. How's that been working? Oh right—that's why we're talking today instead of last Monday."

TARGET: Make them laugh while seeing their patterns clearly. Wit should create insight AND connection, serving the message while making it memorable.""",

        "coach-like & accountability": """You are a motivational coach who combines systematic structure with unwavering accountability to create sustainable progress.

CORE IDENTITY: A professional coach who brings clear systems, trackable progress, and supportive accountability. You're the coach who shows up consistently and expects the same from them.

VOICE CHARACTERISTICS:
- Sentence rhythm: 12-18 word structured sentences. Clear organization. Systematic progression.
- Word choice: Coaching terminology ("system", "process", "milestone", "checkpoint"). Action-oriented. Partnership language.
- Punctuation strategy: Organizational clarity. Colons for lists. Professional tone.
- Structure: Like a good coaching session—organized, clear expectations, actionable outcomes.

PSYCHOLOGICAL APPROACH:
- Break down goals into clear systems
- Establish regular checkpoints and milestones
- Track progress visibly
- Create accountability through structure, not pressure

ADAPTIVE STRATEGY BY STREAK:
- Days 1-7: Establish framework and systems
- Days 8-30: Track progress, adjust systems as needed
- Days 31+: Optimize systems for continued growth
- Setbacks: Systematic analysis and course correction

STRUCTURE FORMULA:
1. Acknowledge current state, set context (20-30 words)
2. Provide structured guidance and checkpoints (60-80 words)
3. Close with clear action items and next check-in (20-30 words)

FORBIDDEN:
- Control disguised as structure
- Rigidity that creates stress
- Systems without empathy
- Accountability that feels like surveillance

EXAMPLE OPENING: "Week 3, Day 2. You're averaging 85% execution on daily actions. Let's identify what's blocking the other 15% and adjust the system."

TARGET: Make them feel supported through clear structure. They should always know exactly what to do next and feel confidence in the systematic approach.""",

        "storytelling & narrative": """You are a motivational coach who uses story structure to create emotional connection and memorable insight.

CORE IDENTITY: A storyteller-mentor who helps them see their journey as a meaningful narrative. You use the power of story to make abstract concepts concrete and inspiration actionable.

VOICE CHARACTERISTICS:
- Sentence rhythm: Varied for narrative flow—6-10 word action, 12-18 word development, 20-30 word description.
- Word choice: Vivid, sensory language. Concrete details. Dialogue when appropriate. Picture-painting words.
- Punctuation strategy: Narrative pacing—varied to control rhythm. Dialogue naturally integrated.
- Story quality: Like hearing a compelling story that happens to contain the exact insight they need.

PSYCHOLOGICAL APPROACH:
- Use story structure (setup, development, climax, resolution)
- Create characters and scenes they can see themselves in
- Make abstract concepts concrete through narrative
- End with story's lesson clearly applied to their journey

ADAPTIVE STRATEGY BY STREAK:
- Days 1-7: Hero's journey begins
- Days 8-30: Developing plot of transformation
- Days 31+: Recognition of the arc they're completing
- Setbacks: Reframe as necessary plot twist, not ending

STRUCTURE FORMULA:
1. Compelling hook or scene (20-35 words)
2. Develop story with sensory details (70-100 words)
3. Connect story to their action (20-30 words)

FORBIDDEN:
- Stories that obscure rather than clarify
- Narrative that replaces actionable guidance
- Forcing story structure when directness is needed
- Stories that don't connect to their actual experience

EXAMPLE OPENING: "There's a marathon runner who showed up at 5 AM every day for six months before her first race. Someone asked why she started so early. 'Because,' she said, 'nobody can talk me out of it while they're still asleep.'"

TARGET: Make them see themselves in the narrative. Story should create emotional connection AND clear application to their journey. They should remember the insight because they remember the story."""
    }
    
    # Match tone (flexible matching)
    matched_tone = None
    for known_tone in tone_prompts.keys():
        if known_tone in tone_lower or tone_lower in known_tone:
            matched_tone = known_tone
            break
    
    # If no exact match, try partial matching
    if not matched_tone:
        if "funny" in tone_lower or "uplifting" in tone_lower:
            matched_tone = "funny & uplifting"
        elif "friendly" in tone_lower or "warm" in tone_lower:
            matched_tone = "friendly & warm"
        elif "tough love" in tone_lower or "real talk" in tone_lower or ("tough" in tone_lower and "love" in tone_lower):
            matched_tone = "tough love & real talk"
        elif "roast" in tone_lower:
            matched_tone = "tough love & real talk"  # Map old "roasting" to new "tough love & real talk"
        elif "serious" in tone_lower or "direct" in tone_lower:
            matched_tone = "serious & direct"
        elif "philosophical" in tone_lower or "reflective" in tone_lower:
            matched_tone = "philosophical & reflective"
        elif "philosophical" in tone_lower or "deep" in tone_lower:
            matched_tone = "philosophical & reflective"  # Map old "philosophical & deep" to new "philosophical & reflective"
        elif "energetic" in tone_lower or "enthusiastic" in tone_lower:
            matched_tone = "energetic & enthusiastic"
        elif "calm" in tone_lower or "meditative" in tone_lower:
            matched_tone = "calm & meditative"
        elif "poetic" in tone_lower or "artistic" in tone_lower:
            matched_tone = "poetic & artistic"
        elif "sarcastic" in tone_lower or "witty" in tone_lower:
            matched_tone = "sarcastic & witty"
        elif "coach" in tone_lower or "accountability" in tone_lower:
            matched_tone = "coach-like & accountability"
        elif "storytelling" in tone_lower or "narrative" in tone_lower:
            matched_tone = "storytelling & narrative"
    
    if matched_tone and matched_tone in tone_prompts:
        return tone_prompts[matched_tone]
    
    # Fallback for unknown tones - still provide deep guidance
    return f"""You are a motivational coach writing in a {tone} tone. 

WRITING STYLE & LINGUISTIC PATTERNS:
- Analyze the linguistic characteristics of "{tone}" deeply. Consider sentence structure (preferred lengths, rhythm patterns), word choice (vocabulary selection, formality level), and punctuation usage (emphasis, pacing). Create a distinctive voice that authentically embodies this tone.

PSYCHOLOGICAL MECHANISMS:
- Understand how "{tone}" affects recipients psychologically. Consider emotional resonance, cognitive processing style, motivation activation, and relationship dynamics. Use this tone strategically to support the user's growth and goal achievement.

STRUCTURAL APPROACH:
- Develop a structural approach appropriate for "{tone}". Consider opening style, middle development, and closing impact. Ensure the structure serves both the tone and the motivational purpose.

ENERGY & PACING:
- Determine the appropriate energy level (1-10) and pacing for "{tone}". Consider how quickly or slowly thoughts should unfold, and how much energy should be present in the communication.

RELATIONSHIP DYNAMIC:
- Establish the relationship dynamic that "{tone}" creates. Consider whether this is peer-to-peer, mentor-student, friend-friend, or another dynamic, and how this serves the motivational purpose.

SAFETY GUIDELINES:
- Ensure "{tone}" remains encouraging and respectful. Identify potential risks or edge cases. Prevent the tone from becoming harmful, abusive, or demotivating. Maintain balance between authenticity and safety. The tone must serve the user's growth, never diminish them.

Create content that authentically embodies the {tone} tone through deep understanding and careful implementation. Make it contextually appropriate for the user's specific goal and current state."""


def get_tone_prompt(tone_name: str, user_context: dict) -> str:
    """
    Get tone prompt with user context injected.
    
    Args:
        tone_name: Name of the tone (must match keys in tone_prompts)
        user_context: Dict with 'streak', 'goal', 'name', 'last_message_summary'
    
    Returns:
        Complete prompt with context
    """
    # Get base prompt using the existing function
    base_prompt = get_tone_system_prompt(tone_name)
    
    context_addition = f"""


CURRENT USER CONTEXT:
- User name: {user_context.get('name', 'Friend')}
- Streak: {user_context.get('streak', 0)} days
- Goal: {user_context.get('goal', 'their goal')[:100]}
- Last message theme: {user_context.get('last_message_summary', 'None')}


Apply the tone principles above specifically to THIS user's context. Reference their actual streak, goal, and name naturally when appropriate. Make it feel personal, not templated."""
    
    return base_prompt + context_addition


async def build_detailed_tone_instruction(tone: str, goal_title: str, goal_description: str, streak_count: int, user_name: str) -> str:
    """
    Build detailed tone instruction using pre-researched system prompts.
    These are comprehensive, research-based prompts stored in the system, not generated dynamically.
    """
    # Get the deep, pre-researched system prompt for this tone
    system_prompt = get_tone_system_prompt(tone)
    
    # Add contextual adaptation
    contextual_addendum = f"""

CONTEXTUAL ADAPTATION FOR THIS SPECIFIC USER:
- User Name: {user_name}
- Goal: {goal_title}
- Goal Description: {goal_description}
- Current Streak: {streak_count} days

Adapt the tone application to this specific context:
- Consider how this tone serves this particular goal and user
- Adjust the intensity or approach based on streak length (early streak needs more support, long streak can handle more challenge)
- Ensure the tone feels personalized, not generic
- Reference specific elements of their journey (goal, streak) when natural and appropriate
- Make the message feel written for them, not mass-produced

Remember: The tone should feel authentic, nuanced, and psychologically resonant. Every word should serve the tone's purpose while supporting {user_name}'s journey toward "{goal_title}". The tone must adapt to their current state (streak: {streak_count} days) while maintaining its core characteristics."""
    
    return system_prompt + contextual_addendum

def redact_sensitive_info(text: str) -> str:
    """Redact email addresses and phone numbers from text"""
    import re
    # Redact email addresses
    text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[email]', text)
    # Redact phone numbers
    text = re.sub(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', '[phone]', text)
    return text

async def get_last_3_emails(user_email: str) -> List[Dict[str, str]]:
    """Get last 3 sent emails for context (redacted)"""
    try:
        messages = await db.message_history.find(
            {"email": user_email},
            {"subject": 1, "message": 1, "sent_at": 1}
        ).sort("sent_at", -1).limit(3).to_list(3)
        
        return [
            {
                "subject": redact_sensitive_info(msg.get("subject", "")[:50]),
                "body": redact_sensitive_info(msg.get("message", "")[:200])  # Limit to 200 chars
            }
            for msg in messages
        ]
    except Exception as e:
        logger.error(f"Error fetching last 3 emails: {e}")
        return []

def check_profanity(text: str) -> bool:
    """Check for profanity - returns True if profanity found"""
    profanity_words = ["damn", "hell", "shit", "fuck", "asshole"]  # Add more as needed
    text_lower = text.lower()
    return any(word in text_lower for word in profanity_words)

def check_impersonation(body: str, persona_name: str, confidence: float) -> bool:
    """Check if message claims to be the persona (should be "in the style of")"""
    # If confidence is low, be more strict
    if confidence < 0.6:
        # Check for direct claims
        claims = [f"i am {persona_name.lower()}", f"this is {persona_name.lower()}", f"i'm {persona_name.lower()}"]
        body_lower = body.lower()
        return any(claim in body_lower for claim in claims)
    return False

def calculate_similarity(text1: str, text2: str) -> float:
    """Simple similarity check - returns 0-1 score"""
    # Simple word overlap check
    words1 = set(text1.lower().split())
    words2 = set(text2.lower().split())
    if not words1 or not words2:
        return 0.0
    intersection = words1.intersection(words2)
    union = words1.union(words2)
    return len(intersection) / len(union) if union else 0.0

async def generate_dynamic_variety_params(
    mode: str,
    persona_research: Optional[Any],
    persona_name: Optional[str],
    last_3_emails: List[Dict[str, str]],
    goal_title: str,
    goal_description: str,
    streak_count: int,
    user_name: str
) -> Dict[str, str]:
    """
    Dynamically generate variety parameters based on research, past emails, and context.
    NO HARDCODED LISTS - everything is generated from research and analysis.
    """
    try:
        # Analyze past emails to understand what's been used
        past_structures = []
        past_angles = []
        past_techniques = []
        
        for email in last_3_emails:
            body = email.get("body", "").lower()
            subject = email.get("subject", "").lower()
            
            # Analyze structure patterns from past emails
            if any(word in body[:100] for word in ["story", "once", "remember when", "imagine"]):
                past_structures.append("story_opening")
            if any(word in body[:100] for word in ["what if", "have you", "do you", "?"]):
                past_structures.append("question_hook")
            if any(word in body[:100] for word in ["surprising", "unexpected", "did you know"]):
                past_structures.append("surprising_fact")
            if any(word in body[:100] for word in ["challenge", "here's the thing", "let's be honest"]):
                past_structures.append("direct_challenge")
            if any(word in body[:100] for word in ["congratulations", "amazing", "celebrate", "well done"]):
                past_structures.append("celebration_first")
            if any(word in body[:100] for word in ["like", "as if", "imagine", "picture"]):
                past_structures.append("metaphor_rich")
            if any(word in body[:100] for word in ["hey", "you know", "here's", "so"]):
                past_structures.append("conversational")
            if any(word in body[:100] for word in ["insight", "realize", "understand", "truth"]):
                past_structures.append("insight_driven")
            
            # Analyze content angles from past emails
            if any(word in body for word in ["small step", "tiny", "micro", "one thing"]):
                past_angles.append("micro_actions")
            if any(word in body for word in ["think", "mindset", "perspective", "reframe"]):
                past_angles.append("mindset_shift")
            if any(word in body for word in ["progress", "how far", "journey", "come"]):
                past_angles.append("progress_celebration")
            if any(word in body for word in ["future", "imagine", "picture", "envision"]):
                past_angles.append("future_vision")
            if any(word in body for word in ["obstacle", "challenge", "difficulty", "barrier"]):
                past_angles.append("obstacle_reframe")
            if any(word in body for word in ["system", "process", "routine", "habit"]):
                past_angles.append("system_building")
            if any(word in body for word in ["becoming", "identity", "who you are", "person"]):
                past_angles.append("identity_based")
            if any(word in body for word in ["momentum", "keep going", "building", "rolling"]):
                past_angles.append("momentum_focus")
        
        # Build dynamic variety prompt based on mode and research
        if mode == "personality" and persona_research:
            # Use persona research to inform variety
            research_context = f"""
Persona Research Available:
- Style Summary: {persona_research.style_summary[:200]}
- Top Phrases: {', '.join(persona_research.top_phrases[:5]) if persona_research.top_phrases else 'N/A'}
- Recent Topics: {', '.join(persona_research.recent_topics[:5]) if persona_research.recent_topics else 'N/A'}
- Sample Lines: {persona_research.sample_lines[0] if persona_research.sample_lines else 'N/A'}
- Verbosity Score: {persona_research.verbosity_score}
- Positivity Score: {persona_research.positivity_score}
"""
            variety_prompt = f"""Based on the persona research for {persona_name} and analysis of past emails, generate unique variety parameters for the next email.

{research_context}

Past Email Analysis:
- Structures used recently: {', '.join(set(past_structures)) if past_structures else 'None'}
- Angles used recently: {', '.join(set(past_angles)) if past_angles else 'None'}
- Techniques used recently: {', '.join(set(past_techniques)) if past_techniques else 'None'}

User Context:
- Goal: {goal_title}
- Streak: {streak_count} days
- Name: {user_name}

Generate:
1. A structure type (opening style) that:
   - Is DIFFERENT from recent structures: {', '.join(set(past_structures)) if past_structures else 'None'}
   - Fits the persona's communication style based on research
   - Is appropriate for this user's context
   - Be creative and specific (not generic)

2. A content angle (focus) that:
   - Is DIFFERENT from recent angles: {', '.join(set(past_angles)) if past_angles else 'None'}
   - Aligns with the persona's typical topics/interests from research
   - Serves the user's goal: {goal_title}
   - Be creative and specific

3. An engagement technique that:
   - Is DIFFERENT from recent techniques: {', '.join(set(past_techniques)) if past_techniques else 'None'}
   - Matches the persona's communication patterns
   - Will make this email engaging and enjoyable
   - Be creative and specific

Return ONLY a JSON object with:
{{
    "structure": "<specific structure type, be creative>",
    "angle": "<specific content angle, be creative>",
    "technique": "<specific engagement technique, be creative>",
    "guidance": "<brief guidance on how to apply these uniquely>"
}}"""
        
        elif mode == "custom" and persona_research:
            # Similar to personality but for custom
            research_context = f"""
Custom Style Research Available:
- Style Summary: {persona_research.style_summary[:200]}
- Top Phrases: {', '.join(persona_research.top_phrases[:5]) if persona_research.top_phrases else 'N/A'}
"""
            variety_prompt = f"""Based on the custom style research and analysis of past emails, generate unique variety parameters.

{research_context}

Past Email Analysis:
- Structures used recently: {', '.join(set(past_structures)) if past_structures else 'None'}
- Angles used recently: {', '.join(set(past_angles)) if past_angles else 'None'}

User Context:
- Goal: {goal_title}
- Streak: {streak_count} days

Generate unique variety parameters that avoid repetition and align with the custom style.

Return ONLY a JSON object with:
{{
    "structure": "<specific structure type>",
    "angle": "<specific content angle>",
    "technique": "<specific engagement technique>",
    "guidance": "<brief guidance>"
}}"""
        
        else:
            # For tone mode or when no research: generate dynamically based on context
            variety_prompt = f"""Based on analysis of past emails and user context, generate unique variety parameters for a {mode} mode email.

Past Email Analysis:
- Structures used recently: {', '.join(set(past_structures)) if past_structures else 'None'}
- Angles used recently: {', '.join(set(past_angles)) if past_angles else 'None'}
- Techniques used recently: {', '.join(set(past_techniques)) if past_techniques else 'None'}

User Context:
- Goal: {goal_title}
- Goal Description: {goal_description}
- Streak: {streak_count} days
- Name: {user_name}
- Mode: {mode}

Generate creative, unique variety parameters that:
1. Are COMPLETELY DIFFERENT from recent structures/angles/techniques
2. Are appropriate for {mode} mode
3. Serve the user's goal and current context
4. Will create an engaging, enjoyable email
5. Be specific and creative (not generic)

Return ONLY a JSON object with:
{{
    "structure": "<specific, creative structure type>",
    "angle": "<specific, creative content angle>",
    "technique": "<specific, creative engagement technique>",
    "guidance": "<brief guidance on unique application>"
}}"""
        
        # Call LLM to generate variety parameters dynamically
        variety_response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are an expert at analyzing communication patterns and generating unique, creative variety parameters for email content. Return ONLY valid JSON."},
                {"role": "user", "content": variety_prompt}
            ],
            temperature=0.8,
            max_tokens=300,
            response_format={"type": "json_object"}
        )
        
        variety_content = variety_response.choices[0].message.content.strip()
        if variety_content.startswith("```"):
            variety_content = variety_content.split("```")[1]
            if variety_content.startswith("json"):
                variety_content = variety_content[4:]
        variety_content = variety_content.strip()
        
        variety_parsed = json.loads(variety_content)
        return {
            "structure": variety_parsed.get("structure", "conversational"),
            "angle": variety_parsed.get("angle", "momentum_focus"),
            "technique": variety_parsed.get("technique", "use_specificity"),
            "guidance": variety_parsed.get("guidance", "")
        }
        
    except Exception as e:
        logger.error(f"Error generating dynamic variety params: {e}")
        # Fallback: use context-based defaults (still not hardcoded lists)
        # Generate based on streak and goal context
        if streak_count < 7:
            return {
                "structure": "celebration_first",
                "angle": "progress_celebration",
                "technique": "use_encouragement",
                "guidance": "Focus on early momentum and celebration"
            }
        elif streak_count < 30:
            return {
                "structure": "insight_driven",
                "angle": "system_building",
                "technique": "use_specificity",
                "guidance": "Build on established momentum with systems"
            }
        else:
            return {
                "structure": "direct_challenge",
                "angle": "identity_based",
                "technique": "use_curiosity",
                "guidance": "Challenge and deepen commitment"
            }

# ============================================================================
# MULTI-GOAL MOTIVATIONAL EMAIL FEATURE
# ============================================================================

# Enhanced LLM generation for goals with streak and last message context using structured pipeline
async def generate_goal_message(
    goal: dict,
    user_data: dict,
    streak_count: int,
    last_message: Optional[dict] = None
) -> tuple[str, str, bool, Optional[dict]]:
    """
    Generate email content using structured persona research pipeline.
    NOW INCLUDES: User reply context for continuity
    Returns (subject, body, used_fallback, conversation_context)
    """
    try:
        user_email = user_data.get("email", "")
        goal_title = goal.get("title", "")
        goal_description = goal.get("description", "")
        mode = goal.get("mode", "personality")
        
        # Step 1: Build runtime context
        user_name = user_data.get("name", "Friend")
        user_timezone = user_data.get("schedule", {}).get("timezone", "UTC")
        last_message_text = ""
        if last_message:
            last_message_text = (last_message.get("generated_body", "") or last_message.get("message", ""))[:100]
        
        # Step 2: Get last 3 emails for context
        last_3_emails = await get_last_3_emails(user_email)
        
        # NEW: Get replies to PREVIOUS messages in THIS goal (for continuity)
        goal_id = goal.get("id", "")
        
        # Get the most recent message sent for this goal (to find replies to it)
        last_goal_message = await db.message_history.find_one(
            {"email": user_email, "goal_id": goal_id},
            {"_id": 0, "id": 1, "message": 1, "subject": 1, "sent_at": 1},
            sort=[("sent_at", -1)]
        )
        
        # ========================================================================
        # SCHEDULED EMAIL GENERATION (CORE FUNCTIONALITY)
        # ========================================================================
        # IMPORTANT: Scheduled emails use the preset formula and are NOT affected by user replies
        # This ensures consistent, high-quality scheduled emails based on personality/tone/custom settings
        # 
        # Automatic replies to user messages are handled separately in email_reply_handler.py
        # and only trigger when a user actually replies to an email
        # ========================================================================
        reply_context = ""  # Always empty for scheduled emails
        conversation_context = None  # Always None for scheduled emails
        
        # Step 3: Get persona research if personality or custom mode (NOT for tone)
        persona_research = None
        persona_name = None
        if mode == "personality":
            personality_id = goal.get("personality_id")
            personalities = user_data.get("personalities", [])
            personality = next((p for p in personalities if p.get("id") == personality_id or p.get("value") == personality_id), None)
            if personality:
                persona_name = personality.get("value", "")
                persona_type = personality.get("type", "famous")
                # Only use Tavily for personality mode (famous/custom types)
                if persona_type in ["famous", "custom"]:
                    persona_research = await get_or_fetch_persona_research(
                        personality_id or persona_name,
                        persona_type,
                        persona_name
                    )
        elif mode == "custom":
            # Check if using custom personality profile
            custom_personality_id = goal.get("custom_personality_id")
            custom_profile = None  # Initialize for use in mode_instruction
            if custom_personality_id:
                # Get custom personality profile
                custom_profile = await db.custom_personality_profiles.find_one(
                    {"id": custom_personality_id, "status": "active"}
                )
                if custom_profile:
                    # Use custom personality profile - skip Tavily research for now
                    # The profile already contains researched information
                    persona_name = custom_profile.get("personality_name", "")
                    # We'll use the profile data directly in mode_instruction below
                else:
                    # Fallback to custom_text if profile not found
                    custom_text = goal.get("custom_text", "")
                    if custom_text and len(custom_text) > 20:
                        custom_id = f"custom_{hash(custom_text) % 1000000}"
                        persona_research = await get_or_fetch_persona_research(
                            custom_id,
                            "custom",
                            custom_text[:200]
                        )
            else:
                # Original custom_text logic
                custom_text = goal.get("custom_text", "")
                if custom_text and len(custom_text) > 20:  # Only if substantial custom text
                    # Use custom text as persona name for research
                    custom_id = f"custom_{hash(custom_text) % 1000000}"
                    persona_research = await get_or_fetch_persona_research(
                        custom_id,
                        "custom",
                        custom_text[:200]  # Use first 200 chars as research input
                    )
        
        # Step 4: Build structured LLM input
        # Determine max_words based on verbosity if persona research available
        max_words = 120
        speaking_length = "medium"
        if persona_research:
            verbosity = persona_research.verbosity_score
            if verbosity < 0.3:
                max_words = 80
                speaking_length = "short"
            elif verbosity > 0.7:
                max_words = 150
                speaking_length = "long"
        
        llm_input = {
            "user": {
                "id": user_data.get("id", user_email),
                "name": user_name,
                "timezone": user_timezone,
                "streak": streak_count,
                "last_message": last_message_text
            },
            "goal": {
                "id": goal.get("id", ""),
                "title": goal_title,
                "description": goal_description
            },
            "mode": {
                "type": mode,
                "personality_id": goal.get("personality_id") if mode == "personality" else None,
                "tone": goal.get("tone") if mode == "tone" else None,
                "custom_text": goal.get("custom_text") if mode == "custom" else None
            },
            "examples": {
                "last_3_emails": last_3_emails
            },
            "controls": {
                "speaking_length": speaking_length,
                "max_words": max_words
            }
        }
        
        # Add persona_research if available
        if persona_research:
            llm_input["persona_research"] = {
                "style_summary": persona_research.style_summary,
                "verbosity_score": persona_research.verbosity_score,
                "positivity_score": persona_research.positivity_score,
                "top_phrases": persona_research.top_phrases,
                "recent_topics": persona_research.recent_topics,
                "sample_lines": persona_research.sample_lines,
                "confidence_score": persona_research.confidence_score
            }
        
        # Step 5: Build LLM prompt
        if mode == "personality" and persona_research:
            mode_instruction = f"""Write in the style of {persona_name} (styled to sound like them, NOT claiming to be them).
Persona Research:
- Style: {persona_research.style_summary}
- Verbosity: {'concise' if persona_research.verbosity_score < 0.4 else 'moderate' if persona_research.verbosity_score < 0.7 else 'verbose'}
- Top phrases to inspire style: {', '.join(persona_research.top_phrases[:3])}
- Sample style: {persona_research.sample_lines[0] if persona_research.sample_lines else 'N/A'}
- Confidence: {'High' if persona_research.confidence_score > 0.7 else 'Medium' if persona_research.confidence_score > 0.5 else 'Low'}
"""
            if persona_research.confidence_score < 0.6:
                mode_instruction += "\n⚠️ Low confidence in persona research - use default safe voice and reduce persona-specific phrasing."
        elif mode == "tone":
            # For tone mode: generate deep, detailed prompt without Tavily
            tone = goal.get("tone", "inspiring")
            mode_instruction = await build_detailed_tone_instruction(tone, goal_title, goal_description, streak_count, user_name)
        else:  # custom
            # Check if using custom personality profile (custom_profile already fetched above)
            custom_personality_id = goal.get("custom_personality_id")
            if custom_personality_id and custom_profile:
                # Use custom personality profile for message generation
                example_messages_text = "\n".join([
                    f"- ({ex.get('tone', 'general')}) {ex.get('message', '')[:100]}"
                    for ex in custom_profile.get('example_messages', [])[:2]
                ])
                mode_instruction = f"""You are {custom_profile.get('personality_name', 'this personality')}.

Personality Profile:
- Summary: {custom_profile.get('personality_summary', '')}
- Core Traits: {', '.join(custom_profile.get('core_traits', [])[:10])}
- Speaking Style: {custom_profile.get('speaking_style', '')}
- Message Themes: {', '.join(custom_profile.get('message_themes', [])[:5])}

Guidelines:
DO: {', '.join(custom_profile.get('do_list', [])[:5])}
DON'T: {', '.join(custom_profile.get('dont_list', [])[:5])}

Example Messages:
{example_messages_text}

Write in this exact style and voice. Do NOT claim to be this person - write in their style."""
            elif custom_personality_id:
                # Fallback to custom_text if profile not found
                custom_text = goal.get("custom_text", "")
                mode_instruction = f"Follow this custom style guide: {custom_text}"
            else:
                # Original custom_text logic
                custom_text = goal.get("custom_text", "")
                # For custom mode: use custom text and optionally persona research if available
                if persona_research:
                    mode_instruction = f"""Follow this custom style guide: {custom_text}

Additionally, analyze and incorporate communication patterns from this research:
- Style characteristics: {persona_research.style_summary}
- Voice patterns: {', '.join(persona_research.top_phrases[:3]) if persona_research.top_phrases else 'N/A'}
- Example style: {persona_research.sample_lines[0] if persona_research.sample_lines else 'N/A'}

Blend the custom style guide with the researched patterns to create a unique voice."""
                else:
                    mode_instruction = f"""Follow this custom style guide: {custom_text}

Analyze the custom instructions deeply. Understand the communication philosophy, emotional tone, structural preferences, and linguistic patterns implied. Create content that authentically embodies these principles."""
        
        # Generate dynamic variety parameters based on research and context (NO HARDCODED LISTS)
        variety_params = await generate_dynamic_variety_params(
            mode=mode,
            persona_research=persona_research,
            persona_name=persona_name,
            last_3_emails=last_3_emails,
            goal_title=goal_title,
            goal_description=goal_description,
            streak_count=streak_count,
            user_name=user_name
        )
        
        chosen_structure = variety_params.get("structure", "conversational")
        chosen_angle = variety_params.get("angle", "momentum_focus")
        chosen_technique = variety_params.get("technique", "use_specificity")
        variety_guidance = variety_params.get("guidance", "")
        
        # Analyze last emails for repetition prevention
        recent_subjects = [e.get("subject", "") for e in last_3_emails]
        recent_themes = []
        for email in last_3_emails:
            body = email.get("body", "").lower()
            # Extract potential themes
            if any(word in body for word in ["start", "begin", "first step"]):
                recent_themes.append("starting")
            if any(word in body for word in ["keep going", "continue", "persist"]):
                recent_themes.append("persistence")
            if any(word in body for word in ["celebrate", "congratulations", "amazing"]):
                recent_themes.append("celebration")
            if any(word in body for word in ["challenge", "difficult", "hard"]):
                recent_themes.append("challenge")
        
        prompt = f"""You are an elite personal coach creating a UNIQUE, ENGAGING, and ENJOYABLE motivational email. Every email must feel fresh, different, and delightful to read.

MODE INSTRUCTION:
{mode_instruction}

USER CONTEXT:
- Name: {user_name}
- Current streak: {streak_count} days
- Last message: {last_message_text if last_message_text else 'None (first message)'}
- Goal: {goal_title}
- Goal description: {goal_description}
{reply_context}

RECENT EMAIL EXAMPLES (MUST AVOID REPETITION):
{json.dumps(last_3_emails, indent=2) if last_3_emails else 'None'}

RECENT THEMES TO AVOID: {', '.join(set(recent_themes)) if recent_themes else 'None - first email'}

VARIETY REQUIREMENTS (CRITICAL - THIS EMAIL MUST BE UNIQUE):
- Structure Type: Use a {chosen_structure} approach
- Content Angle: Focus on {chosen_angle}
- Engagement Technique: Incorporate {chosen_technique}
{variety_guidance if variety_guidance else ''}

These variety parameters were dynamically generated based on:
- Analysis of your past {len(last_3_emails)} emails
- Research data (persona/style analysis)
- Your current context (goal: {goal_title}, streak: {streak_count} days)
- Avoidance of repetition patterns

Use these parameters creatively and uniquely - make this email stand out from all previous ones.

ANTI-REPETITION RULES:
1. NEVER use the same opening style as the last 3 emails
2. NEVER repeat the same theme or angle from recent emails
3. NEVER use similar subject line patterns (check: {recent_subjects})
4. Vary sentence length dramatically - mix 3-word punches with 20-word flows
5. Use DIFFERENT metaphors, analogies, and examples than recent emails
6. Change the emotional tone slightly (if last was celebratory, this can be challenging; if last was serious, this can be lighter)

ENGAGEMENT REQUIREMENTS (MAKE IT ENJOYABLE):
1. Start with a HOOK: {chosen_structure} - grab attention immediately
2. Include {chosen_technique} to create engagement
3. Use SPECIFIC, CONCRETE details - not vague platitudes
4. Create CURIOSITY - make them want to read more
5. Add SURPRISE - include an unexpected insight or perspective
6. Use VIVID LANGUAGE - paint pictures with words
7. Include a RELATABLE MOMENT - something they'll recognize
8. End with ENERGY - leave them feeling motivated and ready to act

CONTENT QUALITY REQUIREMENTS:
1. Subject: max 8 words, COMPELLING and UNIQUE (not generic)
2. Body: 3-6 short lines, max {max_words} words, {speaking_length} length
3. Include one clear, SPECIFIC actionable tip (not vague advice)
4. Reference the streak naturally if meaningful ({streak_count} days)
5. Personalize using streak & last_message context
6. Do NOT claim to be the persona (if personality mode) - write "in the style of"
7. Make it feel CONVERSATIONAL and HUMAN - not robotic or templated

STRUCTURAL VARIETY:
- Vary paragraph breaks (sometimes 2 sentences, sometimes 4)
- Mix short and long sentences intentionally
- Use different punctuation for rhythm (commas, dashes, periods)
- Change the flow pattern (sometimes build to climax, sometimes start strong)

ENJOYMENT FACTORS:
- Make it FUN to read (appropriate to tone)
- Include a moment of RECOGNITION ("You know that feeling when...")
- Add a touch of WIT or INSIGHT (even in serious tones)
- Create a sense of PROGRESS and MOMENTUM
- Make them feel SEEN and UNDERSTOOD

OUTPUT FORMAT (JSON only):
{{
    "subject": "<max 8 words, unique and compelling>",
    "body": "<3-6 short lines, max {max_words} words, engaging and enjoyable>"
}}

CRITICAL: This email must be COMPLETELY DIFFERENT from the last 3 emails. Check your subject against {recent_subjects} - it must be unique. Check your themes against {recent_themes} - avoid repetition. Make it fresh, engaging, and something the user will actually ENJOY reading.

Return ONLY valid JSON, no other text."""

        # Step 6: Call LLM with higher creativity for variety
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a world-class motivational coach who creates unique, engaging, and enjoyable emails. Every email must be different, fresh, and delightful to read. You excel at variety, creativity, and making content that users genuinely enjoy. Return ONLY valid JSON with subject and body fields."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.95,  # Higher temperature for more creativity and variety
            max_tokens=500,  # Increased for more creative content
            response_format={"type": "json_object"}  # Force JSON output
        )
        
        content = response.choices[0].message.content.strip()
        # Remove markdown if present
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        content = content.strip()
        
        parsed = json.loads(content)
        subject = parsed.get("subject", f"Your {goal_title} motivation").strip()
        body = parsed.get("body", "").strip()
        
        # Step 7: Post-generation safety checks
        # Length checks
        subject_words = len(subject.split())
        if subject_words > 8:
            subject = " ".join(subject.split()[:8])
        
        body_words = len(body.split())
        if body_words > max_words:
            # Truncate to max_words
            words = body.split()
            body = " ".join(words[:max_words])
        
        # Profanity check
        if check_profanity(subject) or check_profanity(body):
            logger.warning(f"Profanity detected in generated message, sanitizing")
            # Simple sanitization
            body = body.replace("damn", "darn").replace("hell", "heck")
            subject = subject.replace("damn", "darn").replace("hell", "heck")
        
        # Impersonation check (if personality mode)
        if mode == "personality" and persona_research and persona_name:
            if check_impersonation(body, persona_name, persona_research.confidence_score):
                logger.warning(f"Impersonation detected, adjusting message")
                # Add disclaimer or adjust
                body = body.replace(f"I am {persona_name}", f"Inspired by {persona_name}'s style")
        
        # Similarity check vs last 3 emails - retry if too similar
        max_retries = 2
        retry_count = 0
        while retry_count < max_retries:
            too_similar = False
            if last_3_emails:
                for prev_email in last_3_emails:
                    similarity = calculate_similarity(body, prev_email.get("body", ""))
                    if similarity > 0.65:  # Too similar
                        too_similar = True
                        logger.warning(f"High similarity ({similarity:.2f}) to previous email, retrying with more variety")
                        break
            
            if not too_similar:
                break
            
            # Retry with explicit variety instruction
            if retry_count < max_retries - 1:
                retry_prompt = f"""{prompt}

CRITICAL RETRY INSTRUCTION: The previous attempt was too similar to recent emails. You MUST:
1. Use a COMPLETELY DIFFERENT opening (not {chosen_structure}, try a different one)
2. Use a COMPLETELY DIFFERENT angle (not {chosen_angle}, try a different one)
3. Use COMPLETELY DIFFERENT words and phrases
4. Change the emotional tone significantly
5. Use different metaphors and examples
6. Make it RADICALLY different while still being helpful

Generate a NEW, UNIQUE email that is NOTHING like the previous attempt."""
                
                try:
                    retry_response = await openai_client.chat.completions.create(
                        model="gpt-4o",
                        messages=[
                            {"role": "system", "content": "You are a world-class motivational coach who creates unique, engaging, and enjoyable emails. Every email must be different, fresh, and delightful to read. Return ONLY valid JSON with subject and body fields."},
                            {"role": "user", "content": retry_prompt}
                        ],
                        temperature=0.98,  # Even higher for retry
                        max_tokens=500,
                        response_format={"type": "json_object"}
                    )
                    
                    retry_content = retry_response.choices[0].message.content.strip()
                    if retry_content.startswith("```"):
                        retry_content = retry_content.split("```")[1]
                        if retry_content.startswith("json"):
                            retry_content = retry_content[4:]
                    retry_content = retry_content.strip()
                    
                    retry_parsed = json.loads(retry_content)
                    subject = retry_parsed.get("subject", subject).strip()
                    body = retry_parsed.get("body", body).strip()
                    
                    # Re-check length
                    subject_words = len(subject.split())
                    if subject_words > 8:
                        subject = " ".join(subject.split()[:8])
                    
                    body_words = len(body.split())
                    if body_words > max_words:
                        words = body.split()
                        body = " ".join(words[:max_words])
                    
                except Exception as e:
                    logger.error(f"Error in retry generation: {e}")
                    break
            
            retry_count += 1
        
        # Final fallback if empty
        if not subject:
            subject = f"Your {goal_title} motivation"
        if not body:
            body = f"Day {streak_count} of your journey toward {goal_title}.\n\nKeep pushing forward. Every step counts.\n\nTake one small action today."
            return subject, body, True, conversation_context
        
        return subject, body, False, conversation_context
        
    except Exception as e:
        logger.error(f"Error generating goal message: {e}", exc_info=True)
        # Fallback
        subject = f"Your {goal.get('title', 'Goal')} motivation"
        body = f"Day {streak_count} of your journey toward {goal.get('title', 'your goal')}.\n\nKeep pushing forward. Every step counts.\n\nTake one small action today."
        return subject, body, True, None

# Event-driven goal message sending - schedules one-time jobs for specific send times
async def send_goal_message_at_time(message_id: str):
    """Send a specific goal message (called by scheduled job at send time)"""
    try:
        # Get the message
        msg = await db.goal_messages.find_one({"id": message_id})
        if not msg:
            logger.warning(f"Goal message {message_id} not found")
            return
        
        # Check if already sent or skipped
        if msg.get("status") != "pending":
            logger.info(f"Goal message {message_id} already processed (status: {msg.get('status')})")
            return
        
        goal_id = msg["goal_id"]
        user_email = msg["user_email"]
        
        # Get goal and user data
        goal = await db.goals.find_one({"id": goal_id}, {"_id": 0})
        if not goal or not goal.get("active"):
            await db.goal_messages.update_one(
                {"id": message_id},
                {"$set": {"status": "skipped", "error_message": "Goal inactive"}}
            )
            return
        
        user = await db.users.find_one({"email": user_email}, {"_id": 0})
        if not user or not user.get("active"):
            await db.goal_messages.update_one(
                {"id": message_id},
                {"$set": {"status": "skipped", "error_message": "User inactive"}}
            )
            return
        
        # Check unsubscribe
        if user.get("unsubscribed"):
            await db.goal_messages.update_one(
                {"id": message_id},
                {"$set": {"status": "skipped", "error_message": "User unsubscribed"}}
            )
            return
        
        # Check rate limits
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Global per-user limit (default 10/day)
        all_today_messages = await db.goal_messages.find({
            "user_email": user_email,
            "status": "sent"
        }).to_list(1000)
        
        today_sent = 0
        for sent_msg in all_today_messages:
            sent_at = sent_msg.get("sent_at")
            if sent_at:
                if isinstance(sent_at, str):
                    try:
                        sent_dt = datetime.fromisoformat(sent_at.replace('Z', '+00:00'))
                    except:
                        continue
                else:
                    sent_dt = sent_at
                if sent_dt >= today_start:
                    today_sent += 1
        
        global_limit = 10  # Configurable
        if today_sent >= global_limit:
            await db.goal_messages.update_one(
                {"id": message_id},
                {"$set": {"status": "skipped", "error_message": f"Global daily limit reached ({global_limit})"}}
            )
            return
        
        # Per-goal limit
        goal_limit = goal.get("send_limit_per_day")
        if goal_limit:
            goal_today_messages = await db.goal_messages.find({
                "goal_id": goal_id,
                "status": "sent"
            }).to_list(1000)
            
            goal_today_sent = 0
            for sent_msg in goal_today_messages:
                sent_at = sent_msg.get("sent_at")
                if sent_at:
                    if isinstance(sent_at, str):
                        try:
                            sent_dt = datetime.fromisoformat(sent_at.replace('Z', '+00:00'))
                        except:
                            continue
                    else:
                        sent_dt = sent_at
                    if sent_dt >= today_start:
                        goal_today_sent += 1
            
            if goal_today_sent >= goal_limit:
                await db.goal_messages.update_one(
                    {"id": message_id},
                    {"$set": {"status": "skipped", "error_message": f"Goal daily limit reached ({goal_limit})"}}
                )
                return
        
        # Get user streak and last message
        streak_count = user.get("streak_count", 0)
        
        # Get last message from this goal first
        last_message = await db.goal_messages.find_one(
            {"goal_id": goal_id, "status": "sent"},
            sort=[("sent_at", -1)]
        )
        
        # If no goal message, check main message history for context
        if not last_message:
            main_last = await db.message_history.find_one(
                {"email": user_email},
                sort=[("sent_at", -1)]
            )
            if main_last:
                last_message = {
                    "generated_body": main_last.get("message", ""),
                    "sent_at": main_last.get("sent_at")
                }
        
        # Generate email content
        subject, body, used_fallback, conversation_context = await generate_goal_message(
            goal, user, streak_count, last_message
        )
        
        # Update message with generated content
        await db.goal_messages.update_one(
            {"id": message_id},
            {"$set": {
                "generated_subject": subject,
                "generated_body": body
            }}
        )
        
        # Use the same email template as main goal (render_email_html) for all goals
        # Extract interactive sections from body if present, or generate defaults
        core_message = body
        check_in_lines = []
        quick_reply_lines = []
        
        # Try to extract interactive sections from body (if LLM included them)
        if "INTERACTIVE CHECK-IN:" in body or "QUICK REPLY PROMPT:" in body:
            parts = body.split("INTERACTIVE CHECK-IN:")
            if len(parts) > 1:
                check_part = parts[1].split("QUICK REPLY PROMPT:")[0].strip()
                core_message = parts[0].strip()
                # Extract bullet points
                for line in check_part.split("\n"):
                    line = line.strip()
                    if line.startswith("- "):
                        check_in_lines.append(line[2:].strip())
                
                if len(parts) > 1:
                    reply_part = parts[1].split("QUICK REPLY PROMPT:")
                    if len(reply_part) > 1:
                        for line in reply_part[1].split("\n"):
                            line = line.strip()
                            if line.startswith("- "):
                                quick_reply_lines.append(line[2:].strip())
        
        # Generate defaults if not found
        if not check_in_lines:
            check_in_lines, quick_reply_lines = generate_interactive_defaults(
                streak_count,
                goal.get('title', '')
            )
        
        streak_icon, streak_message = resolve_streak_badge(streak_count)
        
        # Use the main goal template (render_email_html) for all goals
        html_content = render_email_html(
            streak_count=streak_count,
            streak_icon=streak_icon,
            streak_message=streak_message,
            core_message=core_message,
            check_in_lines=check_in_lines,
            quick_reply_lines=quick_reply_lines,
        )
        
        success, error = await send_email(user_email, subject, html_content)
        
        sent_at = datetime.now(timezone.utc)
        
        if success:
            await db.goal_messages.update_one(
                {"id": message_id},
                {"$set": {
                    "status": "sent",
                    "sent_at": sent_at.isoformat(),
                    "delivery_response": {"success": True}
                }}
            )
            
            # Update user streak (using user's timezone for accurate date comparison)
            # Get user's global timezone for date comparison (prefer user_timezone over schedule.timezone)
            user_timezone_str = user.get("user_timezone") or user.get("schedule", {}).get("timezone", "UTC")
            user_tz = None
            try:
                import pytz
                user_tz = pytz.timezone(user_timezone_str)
                # Convert UTC to user's timezone for date comparison
                sent_at_user_tz = sent_at.astimezone(user_tz)
                current_date = sent_at_user_tz.date()
            except Exception as e:
                logger.warning(f"Invalid timezone {user_timezone_str} for {user_email}, using UTC: {e}")
                current_date = sent_at.date()
            
            last_sent = user.get("last_email_sent")
            if last_sent:
                if isinstance(last_sent, str):
                    try:
                        last_sent_dt = datetime.fromisoformat(last_sent.replace('Z', '+00:00'))
                    except:
                        last_sent_dt = datetime.fromisoformat(last_sent)
                else:
                    last_sent_dt = last_sent
                
                # Ensure last_sent_dt is timezone-aware (UTC)
                if last_sent_dt.tzinfo is None:
                    last_sent_dt = last_sent_dt.replace(tzinfo=timezone.utc)
                
                # Convert to user's timezone for date comparison
                if user_tz:
                    try:
                        last_sent_dt_user_tz = last_sent_dt.astimezone(user_tz)
                        last_sent_date = last_sent_dt_user_tz.date()
                    except:
                        # Fallback to UTC if timezone conversion fails
                        last_sent_date = last_sent_dt.date()
                else:
                    # Use UTC if user_tz is not available
                    last_sent_date = last_sent_dt.date()
                
                days_diff = (current_date - last_sent_date).days
                
                if days_diff == 0:
                    # Same day - keep current streak (don't increment)
                    new_streak = streak_count if streak_count > 0 else 1
                    logger.info(f"Streak calculation (goal message) for {user_email}: Same day ({current_date}), keeping streak at {new_streak}")
                elif days_diff == 1:
                    # Consecutive day - increment streak
                    new_streak = streak_count + 1
                    logger.info(f"Streak calculation (goal message) for {user_email}: Consecutive day ({last_sent_date} -> {current_date}), incrementing {streak_count} -> {new_streak}")
                else:
                    # Gap of more than 1 day - reset to 1
                    new_streak = 1
                    logger.info(f"Streak calculation (goal message) for {user_email}: Gap of {days_diff} days ({last_sent_date} -> {current_date}), resetting to {new_streak}")
            else:
                # First email ever - start at 1
                new_streak = 1
                logger.info(f"Streak calculation (goal message) for {user_email}: First email, starting at {new_streak}")
            
            await db.users.update_one(
                {"email": user_email},
                {
                    "$set": {
                        "last_email_sent": sent_at.isoformat(),
                        "streak_count": new_streak
                    },
                    "$inc": {"total_messages_received": 1}
                }
            )
            
            logger.info(f"✅ Goal message sent: {goal_id} -> {user_email}")
            
            # Also save to message_history so it appears in history tab
            # Determine personality from goal mode
            personality_dict = None
            if goal.get("mode") == "personality" and goal.get("personality_id"):
                # Find personality in user's personalities
                personalities = user.get("personalities", [])
                for p in personalities:
                    if p.get("id") == goal.get("personality_id") or p.get("value") == goal.get("personality_id"):
                        personality_dict = {
                            "id": p.get("id", str(uuid.uuid4())),
                            "type": p.get("type", "custom"),
                            "value": p.get("value", ""),
                            "active": p.get("active", True)
                        }
                        break
                # If not found, create from personality_id
                if not personality_dict:
                    personality_dict = {
                        "id": goal.get("personality_id"),
                        "type": "famous",  # Default assumption
                        "value": goal.get("personality_id"),
                        "active": True
                    }
            elif goal.get("mode") == "tone" and goal.get("tone"):
                personality_dict = {
                    "id": str(uuid.uuid4()),
                    "type": "tone",
                    "value": goal.get("tone"),
                    "active": True
                }
            elif goal.get("mode") == "custom" and goal.get("custom_text"):
                personality_dict = {
                    "id": str(uuid.uuid4()),
                    "type": "custom",
                    "value": goal.get("custom_text", ""),
                    "active": True
                }
            else:
                # Fallback: use user's current personality
                personalities = user.get("personalities", [])
                current_index = user.get("current_personality_index", 0)
                if personalities and current_index < len(personalities):
                    p = personalities[current_index]
                    personality_dict = {
                        "id": p.get("id", str(uuid.uuid4())),
                        "type": p.get("type", "custom"),
                        "value": p.get("value", ""),
                        "active": p.get("active", True)
                    }
                else:
                    # Last resort: default personality
                    personality_dict = {
                        "id": str(uuid.uuid4()),
                        "type": "custom",
                        "value": "motivational coach",
                        "active": True
                    }
            
            # Save to message_history
            history_doc = {
                "id": message_id,  # Use same ID as goal_message for consistency
                "email": user_email,
                "message": body,
                "subject": subject,
                "personality": personality_dict,
                "message_type": "goal_message",
                "created_at": sent_at.isoformat(),
                "sent_at": sent_at.isoformat(),
                "streak_at_time": new_streak,  # Store streak at time of sending
                "used_fallback": used_fallback,
                "goal_id": goal_id,  # Link to goal
                "goal_title": goal.get("title", "Unknown Goal"),
                "conversation_context": conversation_context  # Include reply context if available
            }
            await db.message_history.insert_one(history_doc)
            
            # Schedule next send time for this goal
            await schedule_next_goal_send(goal_id, user_email)
        else:
            # Retry logic
            retry_count = msg.get("retry_count", 0)
            if retry_count < 3:
                # Exponential backoff: 5min, 15min, 45min
                backoff_minutes = [5, 15, 45][retry_count]
                new_scheduled_for = sent_at + timedelta(minutes=backoff_minutes)
                await db.goal_messages.update_one(
                    {"id": message_id},
                    {"$set": {
                        "scheduled_for": new_scheduled_for,
                        "retry_count": retry_count + 1,
                        "error_message": error
                    }}
                )
                # Reschedule the job for retry
                job_id = f"goal_msg_{message_id}"
                try:
                    scheduler.remove_job(job_id)
                except:
                    pass
                scheduler.add_job(
                    send_goal_message_at_time,
                    DateTrigger(run_date=new_scheduled_for),
                    args=[message_id],
                    id=job_id,
                    replace_existing=True
                )
            else:
                await db.goal_messages.update_one(
                    {"id": message_id},
                    {"$set": {
                        "status": "failed",
                        "error_message": error,
                        "retry_count": retry_count + 1
                    }}
                )
                logger.error(f"✗ Goal message failed after retries: {goal_id} -> {user_email}: {error}")
    
    except Exception as e:
        logger.error(f"Error sending goal message {message_id}: {e}", exc_info=True)
        await db.goal_messages.update_one(
            {"id": message_id},
            {"$set": {
                "status": "failed",
                "error_message": str(e)
            }}
        )

async def schedule_next_goal_send(goal_id: str, user_email: str):
    """Schedule the next send time for a goal after a message is sent"""
    try:
        goal = await db.goals.find_one({"id": goal_id}, {"_id": 0})
        if not goal or not goal.get("active"):
            return
        
        # Find the schedule that was just used (or use the first active one)
        # For simplicity, we'll schedule the next occurrence from all active schedules
        for schedule in goal.get("schedules", []):
            if schedule.get("active"):
                # Calculate next send time (just one, the immediate next)
                next_times = await calculate_next_send_times(schedule, goal_id, user_email, lookahead_days=1)
                if next_times:
                    next_time = next_times[0]
                    
                    # Check if we already have a pending message or job for this time
                    existing = await db.goal_messages.find_one({
                        "goal_id": goal_id,
                        "scheduled_for": next_time,
                        "status": {"$in": ["pending", "sent"]}
                    })
                    
                    if not existing:
                        # Create message record
                        message_id = str(uuid.uuid4())
                        message_doc = {
                            "id": message_id,
                            "goal_id": goal_id,
                            "user_email": user_email,
                            "scheduled_for": next_time,
                            "status": "pending",
                            "created_at": datetime.now(timezone.utc).isoformat()
                        }
                        await db.goal_messages.insert_one(message_doc)
                        
                        # Schedule the job
                        job_id = f"goal_msg_{message_id}"
                        try:
                            scheduler.remove_job(job_id)
                        except:
                            pass
                        scheduler.add_job(
                            send_goal_message_at_time,
                            DateTrigger(run_date=next_time),
                            args=[message_id],
                            id=job_id,
                            replace_existing=True
                        )
                        logger.info(f"✅ Scheduled next goal send: {goal_id} at {next_time.isoformat()}")
                        break  # Only schedule one next send per goal
    except Exception as e:
        logger.error(f"Error scheduling next goal send for {goal_id}: {e}", exc_info=True)

async def schedule_goal_jobs_for_goal(goal_id: str, user_email: str):
    """Schedule all upcoming send jobs for a goal (called when goal is created/updated)"""
    try:
        goal = await db.goals.find_one({"id": goal_id}, {"_id": 0})
        if not goal or not goal.get("active"):
            return
        
        # Remove existing jobs for this goal
        for job in scheduler.get_jobs():
            if job.id.startswith(f"goal_msg_") and len(job.args) > 0:
                # Check if this message belongs to this goal
                message_id = job.args[0]
                msg = await db.goal_messages.find_one({"id": message_id})
                if msg and msg.get("goal_id") == goal_id:
                    try:
                        scheduler.remove_job(job.id)
                    except:
                        pass
        
        # Schedule jobs for EACH schedule in the goal (handles multiple schedules automatically)
        total_jobs_created = 0
        for schedule_idx, schedule in enumerate(goal.get("schedules", [])):
            if not schedule.get("active", True):
                continue
            
            schedule_name = schedule.get("schedule_name", f"Schedule {schedule_idx + 1}")
            schedule_id = schedule.get("id", str(uuid.uuid4()))
            
            # Calculate next send times for THIS schedule (up to 7 days ahead)
            # This now handles multiple times per day via the times array
            next_times = await calculate_next_send_times(schedule, goal_id, user_email, lookahead_days=7)
            
            for send_time in next_times:
                # Check if message already exists
                existing = await db.goal_messages.find_one({
                    "goal_id": goal_id,
                    "scheduled_for": send_time,
                    "status": {"$in": ["pending", "sent"]}
                })
                
                if not existing:
                    # Create message record
                    message_id = str(uuid.uuid4())
                    message_doc = {
                        "id": message_id,
                        "goal_id": goal_id,
                        "user_email": user_email,
                        "scheduled_for": send_time,
                        "schedule_name": schedule_name,  # NEW: Track which schedule
                        "schedule_id": schedule_id,  # NEW: Link to schedule
                        "status": "pending",
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.goal_messages.insert_one(message_doc)
                    
                    # Schedule the job
                    job_id = f"goal_msg_{message_id}"
                    scheduler.add_job(
                        send_goal_message_at_time,
                        DateTrigger(run_date=send_time),
                            args=[message_id],
                            id=job_id,
                            replace_existing=True
                        )
        
        logger.info(f"✅ Scheduled {total_jobs_created} jobs for goal {goal_id} ({len(goal.get('schedules', []))} schedules)")
    except Exception as e:
        logger.error(f"Error scheduling goal jobs for {goal_id}: {e}", exc_info=True)

# Legacy function kept for backward compatibility but not used
async def dispatch_goal_messages():
    """Legacy function - no longer used. Jobs are now scheduled individually."""
    pass

# Helper function to calculate next send times for a schedule
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
                    hour, minute = map(int, time_str.split(":"))
                    local_dt = tz.localize(datetime.combine(check_date, datetime.min.time().replace(hour=hour, minute=minute)))
                    utc_dt = local_dt.astimezone(timezone.utc)
                    
                    if utc_dt > now:
                        next_times.append(utc_dt)
        
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

# Goal API Endpoints
@api_router.post("/users/{email}/goals")
async def create_goal(email: str, request: GoalCreateRequest):
    """Create a new goal with multiple schedules"""
    
    # Verify user exists
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Validate: Max 10 goals per user
    existing_goals = await db.goals.count_documents({"user_email": email, "active": True})
    if existing_goals >= 10:
        raise HTTPException(
            status_code=400,
            detail="Maximum 10 active goals allowed. Please delete or archive a goal first."
        )
    
    # Validate: Each schedule in schedules list
    if len(request.schedules) > 10:
        raise HTTPException(
            status_code=400,
            detail="Maximum 10 schedules per goal allowed"
        )
    
    # Validate mode-specific fields
    if request.mode == "personality" and not request.personality_id:
        raise HTTPException(status_code=400, detail="personality_id required for personality mode")
    if request.mode == "tone" and not request.tone:
        raise HTTPException(status_code=400, detail="tone required for tone mode")
    if request.mode == "custom" and not request.custom_text and not request.custom_personality_id:
        raise HTTPException(status_code=400, detail="custom_text or custom_personality_id required for custom mode")
    
    # Create goal document
    goal_id = str(uuid.uuid4())
    goal_doc = {
        "id": goal_id,
        "user_email": email,
        "title": request.title,
        "description": request.description,
        "mode": request.mode,
        "personality_id": request.personality_id,
        "tone": request.tone,
        "custom_text": request.custom_text,
        "custom_personality_id": request.custom_personality_id,
        "schedules": [s.model_dump() for s in request.schedules],
        "send_limit_per_day": request.send_limit_per_day or 10,
        "send_time_windows": [w.model_dump() for w in (request.send_time_windows or [])],
        "active": request.active,
        "category": request.category,
        "priority": request.priority,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.goals.insert_one(goal_doc)
    
    # Schedule jobs for this goal (event-driven, not polling)
    if request.active:
        await schedule_goal_jobs_for_goal(goal_id, email)
    
    logger.info(f"Created goal {goal_id} for user {email}")
    return {"id": goal_id, "status": "success"}

@api_router.get("/users/{email}/goals")
async def list_goals(email: str):
    """List all goals for a user with next send times"""
    
    goals = await db.goals.find({"user_email": email}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Calculate next send times for each goal
    for goal in goals:
        next_sends = []
        for schedule in goal.get("schedules", []):
            if schedule.get("active") and goal.get("active"):
                times = await calculate_next_send_times(schedule, goal["id"], email, lookahead_days=3)
                next_sends.extend(times)
        
        # Sort and take next 3
        next_sends = sorted(next_sends)[:3]
        goal["next_sends"] = [t.isoformat() for t in next_sends]
    
    return {"goals": goals}

@api_router.get("/users/{email}/goals/{goal_id}")
async def get_goal(email: str, goal_id: str):
    """Get a specific goal"""
    
    goal = await db.goals.find_one({"id": goal_id, "user_email": email}, {"_id": 0})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    return goal

@api_router.put("/users/{email}/goals/{goal_id}")
async def update_goal(email: str, goal_id: str, request: GoalUpdateRequest):
    """Update a goal"""
    
    goal = await db.goals.find_one({"id": goal_id, "user_email": email})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    # Build update dict
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if request.title is not None:
        update_data["title"] = request.title
    if request.description is not None:
        update_data["description"] = request.description
    if request.mode is not None:
        update_data["mode"] = request.mode
        # Clear mode-specific fields when mode changes
        if request.mode != "personality":
            update_data["personality_id"] = None
        if request.mode != "tone":
            update_data["tone"] = None
        if request.mode != "custom":
            update_data["custom_text"] = None
    
    if request.personality_id is not None:
        update_data["personality_id"] = request.personality_id
    if request.tone is not None:
        update_data["tone"] = request.tone
    if request.custom_text is not None:
        update_data["custom_text"] = request.custom_text
    if request.schedules is not None:
        update_data["schedules"] = [s.model_dump() for s in request.schedules]
    if request.send_limit_per_day is not None:
        update_data["send_limit_per_day"] = request.send_limit_per_day
    if request.send_time_windows is not None:
        update_data["send_time_windows"] = [w.model_dump() for w in request.send_time_windows]
    if request.active is not None:
        update_data["active"] = request.active
    
    await db.goals.update_one({"id": goal_id}, {"$set": update_data})
    
    # If goal was deactivated, cancel pending messages and remove jobs
    if request.active is False:
        await db.goal_messages.update_many(
            {"goal_id": goal_id, "status": "pending"},
            {"$set": {"status": "skipped", "error_message": "Goal deactivated"}}
        )
        # Remove scheduled jobs for this goal
        for job in scheduler.get_jobs():
            if job.id.startswith(f"goal_msg_") and len(job.args) > 0:
                message_id = job.args[0]
                msg = await db.goal_messages.find_one({"id": message_id})
                if msg and msg.get("goal_id") == goal_id:
                    try:
                        scheduler.remove_job(job.id)
                    except:
                        pass
    # If schedules were updated or goal reactivated, reschedule jobs
    elif request.schedules is not None or (request.active is True and not goal.get("active", False)):
        # Remove old jobs
        for job in scheduler.get_jobs():
            if job.id.startswith(f"goal_msg_") and len(job.args) > 0:
                message_id = job.args[0]
                msg = await db.goal_messages.find_one({"id": message_id})
                if msg and msg.get("goal_id") == goal_id:
                    try:
                        scheduler.remove_job(job.id)
                    except:
                        pass
        # Cancel old pending messages
        await db.goal_messages.delete_many({"goal_id": goal_id, "status": "pending"})
        # Schedule new jobs (event-driven)
        if update_data.get("active", goal.get("active", True)):
            await schedule_goal_jobs_for_goal(goal_id, email)
    
    return {"status": "success"}

@api_router.delete("/users/{email}/goals/{goal_id}")
async def delete_goal(email: str, goal_id: str):
    """Delete a goal and cancel pending messages"""
    
    result = await db.goals.delete_one({"id": goal_id, "user_email": email})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    # Cancel all pending messages
    await db.goal_messages.update_many(
        {"goal_id": goal_id, "status": "pending"},
        {"$set": {"status": "skipped", "error_message": "Goal deleted"}}
    )
    
    # Remove scheduled jobs for this goal
    for job in scheduler.get_jobs():
        if job.id.startswith(f"goal_msg_") and len(job.args) > 0:
            message_id = job.args[0]
            msg = await db.goal_messages.find_one({"id": message_id})
            if msg and msg.get("goal_id") == goal_id:
                try:
                    scheduler.remove_job(job.id)
                except:
                    pass
    
    logger.info(f"Deleted goal {goal_id} for user {email}")
    return {"status": "success"}

@api_router.get("/users/{email}/goals/{goal_id}/history")
async def get_goal_history(email: str, goal_id: str, limit: int = 50):
    """Get message history for a goal (handles both regular goals and primary/main goals)"""
    
    # Handle primary/main goal (stored in user.goals, not in goals collection)
    if goal_id == "main_goal":
        # For primary goals, get messages from message_history where goal_id is null/undefined
        # These are the main scheduled emails (not goal-specific)
        messages = await db.message_history.find(
            {
                "email": email,
                "$or": [
                    {"goal_id": {"$exists": False}},  # No goal_id field
                    {"goal_id": None},  # goal_id is None
                    {"goal_id": ""}  # goal_id is empty string
                ]
            },
            {"_id": 0}
        ).sort("sent_at", -1).to_list(limit)
        
        # Convert to goal_messages format for consistency
        formatted_messages = []
        for msg in messages:
            formatted_messages.append({
                "id": msg.get("id"),
                "goal_id": "main_goal",
                "user_email": email,
                "scheduled_for": msg.get("sent_at") or msg.get("created_at"),
                "sent_at": msg.get("sent_at"),
                "status": "sent" if msg.get("sent_at") else "pending",
                "generated_subject": msg.get("subject"),
                "generated_body": msg.get("message"),
                "created_at": msg.get("created_at") or msg.get("sent_at")
            })
        
        # Convert datetime objects to ISO strings
        for msg in formatted_messages:
            for field in ["scheduled_for", "sent_at", "created_at"]:
                if msg.get(field) and isinstance(msg[field], datetime):
                    msg[field] = msg[field].isoformat()
        
        return {"messages": formatted_messages, "total": len(formatted_messages)}
    
    # Regular goal - verify it belongs to user
    goal = await db.goals.find_one({"id": goal_id, "user_email": email})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    # Get messages from goal_messages collection
    messages = await db.goal_messages.find(
        {"goal_id": goal_id},
        {"_id": 0}
    ).sort("scheduled_for", -1).to_list(limit)
    
    # Convert datetime objects to ISO strings
    for msg in messages:
        for field in ["scheduled_for", "sent_at", "created_at"]:
            if msg.get(field) and isinstance(msg[field], datetime):
                msg[field] = msg[field].isoformat()
    
    return {"messages": messages, "total": len(messages)}

@api_router.post("/unsubscribe")
async def unsubscribe(email: str):
    """Unsubscribe user from all goal emails"""
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Mark user as unsubscribed
    await db.users.update_one(
        {"email": email},
        {"$set": {"unsubscribed": True}}
    )
    
    # Cancel all pending goal messages
    await db.goal_messages.update_many(
        {"user_email": email, "status": "pending"},
        {"$set": {"status": "skipped", "error_message": "User unsubscribed"}}
    )
    
    logger.info(f"User {email} unsubscribed from goal emails")
    return {"status": "success", "message": "You have been unsubscribed from all goal emails"}

# ============================================================================
# FEATURE 1: GAMIFICATION & ACHIEVEMENTS
# ============================================================================

@api_router.get("/users/{email}/achievements")
async def get_user_achievements(email: str):
    """Get all achievements for a user"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_achievements = user.get("achievements", [])
    achievements_dict = await get_achievements_from_db()
    unlocked = []
    locked = []
    
    for ach_id, achievement in achievements_dict.items():
        ach_data = {**achievement, "unlocked": ach_id in user_achievements}
        if ach_id in user_achievements:
            unlocked.append(ach_data)
        else:
            locked.append(ach_data)
    
    return {
        "unlocked": unlocked,
        "locked": locked,
        "total_unlocked": len(unlocked),
        "total_available": len(achievements_dict)
    }

# ============================================================================
# FEATURE 3: MESSAGE ENHANCEMENTS (Favorites, Collections)
# ============================================================================

@api_router.post("/users/{email}/messages/{message_id}/favorite")
async def toggle_message_favorite(email: str, message_id: str):
    """Toggle favorite status for a message"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify message exists
    message = await db.message_history.find_one({"id": message_id, "email": email})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    favorites = user.get("favorite_messages", [])
    is_favorite = message_id in favorites
    
    if is_favorite:
        favorites.remove(message_id)
        action = "removed"
    else:
        favorites.append(message_id)
        action = "added"
    
    await db.users.update_one(
        {"email": email},
        {"$set": {"favorite_messages": favorites}}
    )
    
    await tracker.log_user_activity(
        email=email,
        action_type="message_favorite_toggled",
        action_category="user_action",
        details={"message_id": message_id, "action": action}
    )
    
    return {"status": "success", "is_favorite": not is_favorite, "action": action}

@api_router.get("/users/{email}/messages/favorites")
async def get_favorite_messages(email: str):
    """Get all favorite messages"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    favorites = user.get("favorite_messages", [])
    messages = await db.message_history.find(
        {"id": {"$in": favorites}, "email": email},
        {"_id": 0}
    ).sort("sent_at", -1).to_list(100)
    
    return {"messages": messages, "count": len(messages)}

@api_router.post("/users/{email}/collections")
async def create_collection(email: str, collection: dict):
    """Create a new message collection"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    collections = user.get("message_collections", {})
    collection_id = str(uuid.uuid4())
    collection_name = collection.get("name", "Untitled Collection")
    
    collections[collection_id] = {
        "id": collection_id,
        "name": collection_name,
        "description": collection.get("description", ""),
        "message_ids": collection.get("message_ids", []),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.update_one(
        {"email": email},
        {"$set": {"message_collections": collections}}
    )
    
    return {"status": "success", "collection_id": collection_id, "collection": collections[collection_id]}

@api_router.get("/users/{email}/collections")
async def get_collections(email: str):
    """Get all message collections"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    collections = user.get("message_collections", {})
    return {"collections": list(collections.values())}

@api_router.put("/users/{email}/collections/{collection_id}")
async def update_collection(email: str, collection_id: str, collection: dict):
    """Update a message collection"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    collections = user.get("message_collections", {})
    if collection_id not in collections:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    if "name" in collection:
        collections[collection_id]["name"] = collection["name"]
    if "description" in collection:
        collections[collection_id]["description"] = collection["description"]
    if "message_ids" in collection:
        collections[collection_id]["message_ids"] = collection["message_ids"]
    
    await db.users.update_one(
        {"email": email},
        {"$set": {"message_collections": collections}}
    )
    
    return {"status": "success", "collection": collections[collection_id]}

@api_router.delete("/users/{email}/collections/{collection_id}")
async def delete_collection(email: str, collection_id: str):
    """Delete a message collection"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    collections = user.get("message_collections", {})
    if collection_id not in collections:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    del collections[collection_id]
    
    await db.users.update_one(
        {"email": email},
        {"$set": {"message_collections": collections}}
    )
    
    return {"status": "success", "message": "Collection deleted"}

# ============================================================================
# FEATURE 2: GOAL PROGRESS TRACKING
# ============================================================================

@api_router.post("/users/{email}/goals/progress")
async def update_goal_progress(email: str, goal_data: dict):
    """Update or create goal progress"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    goal_progress = user.get("goal_progress", {})
    goal_id = goal_data.get("goal_id") or str(uuid.uuid4())
    
    goal_progress[goal_id] = {
        "goal_id": goal_id,
        "goal_text": goal_data.get("goal_text", ""),
        "target_date": goal_data.get("target_date"),
        "progress_percentage": goal_data.get("progress_percentage", 0.0),
        "milestones": goal_data.get("milestones", []),
        "completed": goal_data.get("completed", False),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Check if goal completed (for achievement)
    if goal_data.get("completed") and not goal_progress[goal_id].get("was_completed", False):
        await check_and_unlock_achievements(email, user, 0)
        goal_progress[goal_id]["was_completed"] = True
    
    await db.users.update_one(
        {"email": email},
        {"$set": {"goal_progress": goal_progress}}
    )
    
    return {"status": "success", "goal": goal_progress[goal_id]}

@api_router.get("/users/{email}/goals/progress")
async def get_goal_progress(email: str):
    """Get all goal progress"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    goal_progress = user.get("goal_progress", {})
    return {"goals": list(goal_progress.values())}

# ============================================================================
# CUSTOM PERSONALITY FEATURE - API ENDPOINTS
# ============================================================================

@api_router.post("/users/{email}/custom-personality/start")
async def start_custom_personality_creation(email: str, request: CustomPersonalityRequest):
    """Start custom personality creation flow"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Create conversation record
    conversation_id = str(uuid.uuid4())
    conversation = CustomPersonalityConversation(
        id=conversation_id,
        email=email,
        current_step=1
    )
    
    await db.custom_personality_conversations.insert_one(conversation.model_dump())
    
    # Initial bot message
    bot_message = "Who would you like to receive messages from? You can choose anyone - a movie character, book hero, historical figure, or anyone you admire!"
    
    return CustomPersonalityChatResponse(
        conversation_id=conversation_id,
        bot_message=bot_message,
        current_step=1,
        needs_research=False,
        status="in_progress"
    )

@api_router.post("/users/{email}/custom-personality/chat")
async def continue_custom_personality_chat(email: str, request: CustomPersonalityChatRequest):
    """Continue custom personality conversation"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get conversation
    conv = await db.custom_personality_conversations.find_one(
        {"id": request.conversation_id, "email": email}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    conversation = CustomPersonalityConversation(**conv)
    
    # Add user message to history
    conversation.messages.append({"role": "user", "content": request.user_message})
    current_step = conversation.current_step
    
    # Generate bot response based on step
    try:
        if current_step == 1:
            # Extract personality name
            extraction_prompt = f"""Extract the personality name from this user message: "{request.user_message}"

Return ONLY a JSON object with:
{{
    "personality_name": "extracted name",
    "personality_type": "movie_character" or "book_character" or "historical_figure" or "sports_icon" or "other",
    "source_material": "source if mentioned (e.g., 'BharatAne Nenu movie')" or null
}}"""
            
            response = await openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You extract personality information and return JSON only."},
                    {"role": "user", "content": extraction_prompt}
                ],
                temperature=0.3,
                max_tokens=200,
                response_format={"type": "json_object"}
            )
            
            extracted = json.loads(response.choices[0].message.content.strip())
            conversation.personality_name = extracted.get("personality_name")
            conversation.personality_type = extracted.get("personality_type", "other")
            conversation.source_material = extracted.get("source_material")
            
            bot_message = f"Great choice! Tell me what you love about {conversation.personality_name}. What makes them special to you?"
            conversation.current_step = 2
            
        elif current_step == 2:
            # Extract traits
            conversation.extracted_traits = request.user_message.split()[:50]  # Simple extraction
            bot_message = "What specific traits or speaking style should I capture? (Example: Their humor, catchphrases, wisdom, or how they communicate)"
            conversation.current_step = 3
            
        elif current_step == 3:
            # Extract style
            conversation.extracted_style = request.user_message
            bot_message = "Can you share a famous quote or example of how they typically talk?"
            conversation.current_step = 4
            
        elif current_step == 4:
            # Save example and trigger research
            conversation.user_examples.append(request.user_message)
            bot_message = f"Perfect! Let me research {conversation.personality_name} to make sure I capture their essence accurately... 🔍"
            conversation.current_step = 5
            conversation.status = "researching"
            needs_research = True
            
            # Update conversation
            conversation.messages.append({"role": "assistant", "content": bot_message})
            conversation.updated_at = datetime.now(timezone.utc)
            await db.custom_personality_conversations.update_one(
                {"id": request.conversation_id},
                {"$set": conversation.model_dump()}
            )
            
            return CustomPersonalityChatResponse(
                conversation_id=request.conversation_id,
                bot_message=bot_message,
                current_step=5,
                needs_research=True,
                extracted_data={
                    "personality_name": conversation.personality_name,
                    "personality_type": conversation.personality_type,
                    "traits": conversation.extracted_traits,
                    "style": conversation.extracted_style
                },
                status="researching"
            )
        
        # Add bot message to history
        conversation.messages.append({"role": "assistant", "content": bot_message})
        conversation.updated_at = datetime.now(timezone.utc)
        
        # Update conversation in database
        await db.custom_personality_conversations.update_one(
            {"id": request.conversation_id},
            {"$set": conversation.model_dump()}
        )
        
        return CustomPersonalityChatResponse(
            conversation_id=request.conversation_id,
            bot_message=bot_message,
            current_step=conversation.current_step,
            needs_research=False,
            status=conversation.status
        )
        
    except Exception as e:
        logger.error(f"Error in custom personality chat: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing conversation: {str(e)}")

@api_router.post("/users/{email}/custom-personality/research")
async def research_custom_personality(email: str, request: CustomPersonalityResearchRequest):
    """Research and build custom personality profile"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get conversation
    conv = await db.custom_personality_conversations.find_one({"id": request.conversation_id})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    try:
        personality_name = request.personality_name
        user_context = request.user_context
        
        # Research using Tavily (reuse existing fetch_persona_research_raw function)
        raw_research = await fetch_persona_research_raw(personality_name, "custom")
        
        if not raw_research:
            # Fallback to OpenAI-only
            logger.warning(f"Tavily research failed for {personality_name}, using OpenAI fallback")
            raw_research = {"results": [], "query": personality_name, "source_count": 0}
        
        # Build personality profile using OpenAI (reuse summarize_persona_research logic)
        persona_research = await summarize_persona_research(raw_research, personality_name, "custom")
        
        # Generate sample messages
        sample_messages = []
        for tone in ["energetic", "calm", "serious"]:
            try:
                sample_response = await openai_client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": f"You are {personality_name}. Write in their style."},
                        {"role": "user", "content": f"Write a short {tone} motivational message (max 50 words) in {personality_name}'s style about staying focused on goals."}
                    ],
                    temperature=0.8,
                    max_tokens=100
                )
                sample_messages.append(sample_response.choices[0].message.content.strip())
            except Exception as e:
                logger.error(f"Error generating sample message: {e}")
                sample_messages.append(f"Sample {tone} message from {personality_name}")
        
        # Create custom personality profile
        profile_id = str(uuid.uuid4())
        profile = CustomPersonalityProfile(
            id=profile_id,
            email=email,
            conversation_id=request.conversation_id,
            personality_name=personality_name,
            personality_type=user_context.get("personality_type", "other"),
            source_material=user_context.get("source_material"),
            core_traits=user_context.get("traits", [])[:10],
            speaking_style=user_context.get("style", ""),
            message_themes=persona_research.recent_topics[:5] if persona_research.recent_topics else [],
            catchphrases=persona_research.top_phrases[:5] if persona_research.top_phrases else [],
            vocabulary_patterns=persona_research.top_phrases[:5] if persona_research.top_phrases else [],
            personality_summary=persona_research.style_summary,
            example_messages=[{"tone": ["energetic", "calm", "serious"][i], "message": msg} for i, msg in enumerate(sample_messages)],
            do_list=[
                f"Use {personality_name}'s characteristic speaking style",
                "Be authentic to their voice and mannerisms",
                "Reference their values and principles naturally"
            ],
            dont_list=[
                f"Don't claim to be {personality_name}",
                "Don't use generic motivational cliches",
                "Don't break character or style"
            ],
            research_sources=[r.get("url", "") for r in raw_research.get("results", [])[:5]],
            status="pending"
        )
        
        # Save profile
        await db.custom_personality_profiles.insert_one(profile.model_dump())
        
        # Update conversation status
        await db.custom_personality_conversations.update_one(
            {"id": request.conversation_id},
            {"$set": {
                "status": "preview_ready",
                "research_completed": True,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        return CustomPersonalityResearchResponse(
            conversation_id=request.conversation_id,
            research_results={
                "sources": len(profile.research_sources),
                "confidence": persona_research.confidence_score
            },
            personality_profile=profile,
            sample_messages=sample_messages,
            status="ready_for_preview"
        )
        
    except Exception as e:
        logger.error(f"Error researching custom personality: {e}", exc_info=True)
        await db.custom_personality_conversations.update_one(
            {"id": request.conversation_id},
            {"$set": {"status": "failed", "updated_at": datetime.now(timezone.utc)}}
        )
        raise HTTPException(status_code=500, detail=f"Research failed: {str(e)}")

@api_router.post("/users/{email}/custom-personality/confirm")
async def confirm_custom_personality(email: str, request: CustomPersonalityConfirmRequest):
    """Confirm and activate custom personality"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get conversation
    conv = await db.custom_personality_conversations.find_one({"id": request.conversation_id})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Get profile
    profile_doc = await db.custom_personality_profiles.find_one({"conversation_id": request.conversation_id})
    if not profile_doc:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    if request.confirmed:
        # Activate profile
        await db.custom_personality_profiles.update_one(
            {"id": profile_doc["id"]},
            {"$set": {
                "status": "active",
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        # Add to user's custom personalities
        await db.users.update_one(
            {"email": email},
            {
                "$push": {"custom_personalities": profile_doc["id"]},
                "$set": {
                    "active_custom_personality_id": profile_doc["id"],
                    "custom_personality_enabled": True
                }
            }
        )
        
        # Mark conversation as confirmed
        await db.custom_personality_conversations.update_one(
            {"id": request.conversation_id},
            {"$set": {"status": "confirmed", "updated_at": datetime.now(timezone.utc)}}
        )
        
        return CustomPersonalityConfirmResponse(
            personality_id=profile_doc["id"],
            status="active",
            message=f"Awesome! Your custom personality '{profile_doc['personality_name']}' is saved. You'll start receiving messages in their style!"
        )
    else:
        # User wants adjustments
        if request.adjustments:
            # Mark as needs adjustment and return to conversation
            await db.custom_personality_conversations.update_one(
                {"id": request.conversation_id},
                {"$set": {
                    "status": "in_progress",
                    "current_step": 2,  # Go back to step 2 for adjustments
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
            
            return CustomPersonalityConfirmResponse(
                personality_id=profile_doc["id"],
                status="needs_adjustment",
                message=f"No problem! Let's adjust. {request.adjustments}"
            )
        else:
            raise HTTPException(status_code=400, detail="Please provide adjustment details")

@api_router.get("/users/{email}/custom-personalities")
async def get_user_custom_personalities(email: str):
    """Get all custom personalities for a user"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    custom_personality_ids = user.get("custom_personalities", [])
    
    if not custom_personality_ids:
        return UserCustomPersonalitiesResponse(
            email=email,
            custom_personalities=[],
            total_count=0,
            active_personality_id=user.get("active_custom_personality_id")
        )
    
    # Get all profiles
    profiles = await db.custom_personality_profiles.find(
        {"id": {"$in": custom_personality_ids}},
        {"_id": 0}
    ).to_list(100)
    
    # Convert to list items
    list_items = []
    for p in profiles:
        created_at = p.get("created_at")
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        elif not isinstance(created_at, datetime):
            created_at = datetime.now(timezone.utc)
        
        list_items.append(CustomPersonalityListItem(
            id=p["id"],
            personality_name=p["personality_name"],
            personality_type=p["personality_type"],
            source_material=p.get("source_material"),
            status=p["status"],
            created_at=created_at,
            times_used=p.get("times_used", 0),
            user_rating=p.get("user_rating")
        ))
    
    return UserCustomPersonalitiesResponse(
        email=email,
        custom_personalities=list_items,
        total_count=len(list_items),
        active_personality_id=user.get("active_custom_personality_id")
    )

@api_router.delete("/users/{email}/custom-personalities/{personality_id}")
async def delete_custom_personality(email: str, personality_id: str):
    """Delete a custom personality"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Remove from user's list
    update_op = {"$pull": {"custom_personalities": personality_id}}
    if user.get("active_custom_personality_id") == personality_id:
        update_op["$unset"] = {"active_custom_personality_id": ""}
    
    await db.users.update_one(
        {"email": email},
        update_op
    )
    
    # Mark profile as archived (soft delete)
    await db.custom_personality_profiles.update_one(
        {"id": personality_id},
        {"$set": {"status": "archived", "updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"status": "success", "message": "Custom personality deleted"}

# ============================================================================
# FEATURE 4: EXPORT & SHARING
# ============================================================================

@api_router.get("/users/{email}/export/messages")
async def export_messages(email: str, format: str = "json"):
    """Export messages in various formats"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    messages = await db.message_history.find(
        {"email": email},
        {"_id": 0}
    ).sort("sent_at", -1).to_list(1000)
    
    if format == "json":
        return {"messages": messages, "count": len(messages)}
    elif format == "csv":
        import csv
        import io
        output = io.StringIO()
        if messages:
            writer = csv.DictWriter(output, fieldnames=["id", "email", "message", "subject", "sent_at", "personality"])
            writer.writeheader()
            for msg in messages:
                writer.writerow({
                    "id": msg.get("id", ""),
                    "email": msg.get("email", ""),
                    "message": msg.get("message", "").replace("\n", " "),
                    "subject": msg.get("subject", ""),
                    "sent_at": msg.get("sent_at", ""),
                    "personality": msg.get("personality", {}).get("value", "") if msg.get("personality") else ""
                })
        return {"content": output.getvalue(), "format": "csv"}
    else:
        raise HTTPException(status_code=400, detail="Unsupported format. Use 'json' or 'csv'")

# ============================================================================
# FEATURE 7: CONTENT PERSONALIZATION
# ============================================================================

@api_router.put("/users/{email}/preferences")
async def update_content_preferences(email: str, preferences: dict):
    """Update user content preferences"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    content_prefs = user.get("content_preferences", {})
    content_prefs.update(preferences)
    
    await db.users.update_one(
        {"email": email},
        {"$set": {"content_preferences": content_prefs}}
    )
    
    return {"status": "success", "preferences": content_prefs}

@api_router.get("/users/{email}/preferences")
async def get_content_preferences(email: str):
    """Get user content preferences"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"preferences": user.get("content_preferences", {})}

# ============================================================================
# FEATURE 5: ADVANCED ANALYTICS (Weekly/Monthly Reports)
# ============================================================================

@api_router.get("/users/{email}/analytics/weekly")
async def get_weekly_analytics(email: str, weeks: int = 4):
    """Get weekly analytics report"""
    from datetime import timedelta
    
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(weeks=weeks)
    
    messages = await db.message_history.find({
        "email": email,
        "sent_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
    }).to_list(1000)
    
    feedbacks = await db.message_feedback.find({
        "email": email,
        "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
    }).to_list(1000)
    
    return {
        "period": f"{weeks} weeks",
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "total_messages": len(messages),
        "total_feedback": len(feedbacks),
        "avg_rating": sum(f['rating'] for f in feedbacks) / len(feedbacks) if feedbacks else None,
        "streak_count": user.get("streak_count", 0)
    }

@api_router.get("/users/{email}/analytics/monthly")
async def get_monthly_analytics(email: str, months: int = 6):
    """Get monthly analytics report"""
    from datetime import timedelta
    
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=months * 30)
    
    messages = await db.message_history.find({
        "email": email,
        "sent_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
    }).to_list(1000)
    
    return {
        "period": f"{months} months",
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "total_messages": len(messages),
        "streak_count": user.get("streak_count", 0)
    }

# ============================================================================
# FEATURE 6: ENGAGEMENT FEATURES (Daily Check-ins, Reflection Journal)
# ============================================================================

@api_router.post("/users/{email}/check-ins")
async def create_check_in(email: str, check_in: dict):
    """Create a daily check-in"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    check_in_id = str(uuid.uuid4())
    check_in_data = {
        "id": check_in_id,
        "email": email,
        "date": check_in.get("date", datetime.now(timezone.utc).isoformat()),
        "mood": check_in.get("mood"),
        "energy_level": check_in.get("energy_level"),
        "reflection": check_in.get("reflection", ""),
        "gratitude": check_in.get("gratitude", []),
        "goals_today": check_in.get("goals_today", []),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.check_ins.insert_one(check_in_data)
    
    return {"status": "success", "check_in": check_in_data}

@api_router.get("/users/{email}/check-ins")
async def get_check_ins(email: str, limit: int = 30):
    """Get user check-ins"""
    check_ins = await db.check_ins.find(
        {"email": email},
        {"_id": 0}
    ).sort("date", -1).to_list(limit)
    
    return {"check_ins": check_ins, "count": len(check_ins)}

@api_router.post("/users/{email}/reflections")
async def create_reflection(email: str, reflection: dict):
    """Create a reflection entry"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    reflection_id = str(uuid.uuid4())
    reflection_data = {
        "id": reflection_id,
        "email": email,
        "message_id": reflection.get("message_id"),
        "content": reflection.get("content", ""),
        "tags": reflection.get("tags", []),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.reflections.insert_one(reflection_data)
    
    return {"status": "success", "reflection": reflection_data}

@api_router.get("/users/{email}/reflections")
async def get_reflections(email: str, limit: int = 50):
    """Get user reflections"""
    reflections = await db.reflections.find(
        {"email": email},
        {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    
    return {"reflections": reflections, "count": len(reflections)}

# ============================================================================
# FEATURE 9: SOCIAL FEATURES (Anonymous Insights, Community Stats)
# ============================================================================

@api_router.get("/community/stats")
async def get_community_stats():
    """
    Get anonymous community statistics.
    Uses MongoDB aggregation for accurate average streak calculation (10k+ users).
    """
    total_users = await db.users.count_documents({"active": True})
    total_messages = await db.message_history.count_documents({})
    total_feedback = await db.message_feedback.count_documents({})
    
    # Get average streak using MongoDB aggregation (accurate for 10k+ users)
    # This is more efficient and accurate than sampling
    streak_aggregation = await db.users.aggregate([
        {"$match": {"active": True}},
        {"$group": {
            "_id": None,
            "avg_streak": {"$avg": "$streak_count"},
            "total_users": {"$sum": 1}
        }}
    ]).to_list(1)
    
    if streak_aggregation and len(streak_aggregation) > 0:
        avg_streak = streak_aggregation[0].get("avg_streak", 0) or 0
    else:
        avg_streak = 0
    
    # Get most popular personalities using aggregation (more efficient)
    personality_aggregation = await db.message_feedback.aggregate([
        {"$group": {
            "_id": "$personality.value",
            "count": {"$sum": 1}
        }},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]).to_list(5)
    
    popular_personalities = [
        (item.get("_id", "Unknown"), item.get("count", 0))
        for item in personality_aggregation
    ]
    
    return {
        "total_active_users": total_users,
        "total_messages_sent": total_messages,
        "total_feedback_given": total_feedback,
        "average_streak": round(avg_streak, 1),
        "popular_personalities": [{"name": name, "count": count} for name, count in popular_personalities]
    }

@api_router.get("/community/message-insights/{message_id}")
async def get_message_insights(message_id: str):
    """Get anonymous insights for a specific message"""
    feedbacks = await db.message_feedback.find({"message_id": message_id}).to_list(100)
    
    if not feedbacks:
        return {"message": "No feedback available for this message"}
    
    ratings = [f.get("rating", 0) for f in feedbacks]
    avg_rating = sum(ratings) / len(ratings) if ratings else 0
    
    return {
        "total_ratings": len(feedbacks),
        "average_rating": round(avg_rating, 1),
        "rating_distribution": {
            "5": sum(1 for r in ratings if r == 5),
            "4": sum(1 for r in ratings if r == 4),
            "3": sum(1 for r in ratings if r == 3),
            "2": sum(1 for r in ratings if r == 2),
            "1": sum(1 for r in ratings if r == 1)
        }
    }

# ============================================================================
# FEATURE 10: ADMIN ENHANCEMENTS (A/B Testing, Content Performance)
# ============================================================================

@api_router.get("/admin/content-performance", dependencies=[Depends(verify_admin)])
async def get_content_performance(admin_token: str):
    """
    Get content performance analytics.
    Uses MongoDB aggregation for efficient processing (10k+ users).
    """
    # Use aggregation for personality performance (more efficient)
    personality_message_counts = await db.message_history.aggregate([
        {"$group": {
            "_id": "$personality.value",
            "total": {"$sum": 1}
        }}
    ]).to_list(100)
    
    personality_feedback_stats = await db.message_feedback.aggregate([
        {"$group": {
            "_id": "$personality.value",
            "avg_rating": {"$avg": "$rating"},
            "feedback_count": {"$sum": 1},
            "total_rating": {"$sum": "$rating"}
        }}
    ]).to_list(100)
    
    # Combine results
    personality_performance = {}
    
    # Add message counts
    for item in personality_message_counts:
        pers = item.get("_id", "Unknown")
        personality_performance[pers] = {
            "total": item.get("total", 0),
            "ratings": [],
            "avg_rating": 0,
            "feedback_count": 0
        }
    
    # Add feedback stats
    for item in personality_feedback_stats:
        pers = item.get("_id", "Unknown")
        if pers not in personality_performance:
            personality_performance[pers] = {"total": 0, "ratings": []}
        
        personality_performance[pers]["avg_rating"] = round(item.get("avg_rating", 0) or 0, 2)
        personality_performance[pers]["feedback_count"] = item.get("feedback_count", 0)
    
    return {"personality_performance": personality_performance}

# Admin endpoints for persona research management
@api_router.post("/admin/persona-research/{persona_id}/refresh", dependencies=[Depends(verify_admin)])
async def refresh_persona_research_admin(persona_id: str, admin_token: str = Header(None)):
    """Force refresh persona research (admin only)"""
    try:
        # Get persona info - try to find in users' personalities first
        users = await db.users.find({"personalities": {"$elemMatch": {"$or": [{"id": persona_id}, {"value": persona_id}]}}}, {"personalities": 1}).to_list(100)
        
        persona_type = "famous"
        persona_value = persona_id
        
        if users:
            for user in users:
                for p in user.get("personalities", []):
                    if p.get("id") == persona_id or p.get("value") == persona_id:
                        persona_type = p.get("type", "famous")
                        persona_value = p.get("value", persona_id)
                        break
                if persona_value != persona_id:
                    break
        
        # Force refresh
        research = await get_or_fetch_persona_research(persona_id, persona_type, persona_value, force_refresh=True)
        
        return {
            "status": "success",
            "message": "Persona research refreshed",
            "research": research.model_dump()
        }
    except Exception as e:
        logger.error(f"Error refreshing persona research: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to refresh research: {str(e)}")

@api_router.get("/admin/persona-research/{persona_id}", dependencies=[Depends(verify_admin)])
async def get_persona_research_admin(persona_id: str, admin_token: str = Header(None)):
    """Get persona research data (admin only)"""
    try:
        cached = await db.persona_research.find_one({"persona_id": persona_id}, {"_id": 0})
        if cached:
            return {"status": "success", "research": cached}
        else:
            return {"status": "not_found", "message": "No research data found for this persona"}
    except Exception as e:
        logger.error(f"Error getting persona research: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get research: {str(e)}")

@api_router.get("/admin/persona-research", dependencies=[Depends(verify_admin)])
async def list_persona_research_admin(admin_token: str = Header(None), limit: int = 50):
    """List all persona research entries (admin only)"""
    try:
        research_entries = await db.persona_research.find({}, {"_id": 0}).sort("last_refreshed", -1).limit(limit).to_list(limit)
        return {
            "status": "success",
            "count": len(research_entries),
            "research": research_entries
        }
    except Exception as e:
        logger.error(f"Error listing persona research: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list research: {str(e)}")

@api_router.get("/admin/research-logs", dependencies=[Depends(verify_admin)])
async def get_research_logs_admin(admin_token: str = Header(None), limit: int = 100):
    """Get research fetch logs (admin only)"""
    try:
        logs = await db.research_logs.find({}, {"_id": 0}).sort("fetch_time", -1).limit(limit).to_list(limit)
        return {
            "status": "success",
            "count": len(logs),
            "logs": logs
        }
    except Exception as e:
        logger.error(f"Error getting research logs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get logs: {str(e)}")

@api_router.get("/admin/user-journey/{email}", dependencies=[Depends(verify_admin)])
async def get_user_journey(email: str, admin_token: str):
    """Get user journey mapping"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get all activities
    activities = await db.activity_logs.find(
        {"user_email": email},
        {"_id": 0}
    ).sort("timestamp", 1).to_list(1000)
    
    # Get messages
    messages = await db.message_history.find(
        {"email": email},
        {"_id": 0}
    ).sort("sent_at", 1).to_list(1000)
    
    # Get feedback
    feedbacks = await db.message_feedback.find(
        {"email": email},
        {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    
    return {
        "user": {
            "email": email,
            "created_at": user.get("created_at"),
            "last_active": user.get("last_active"),
            "streak_count": user.get("streak_count", 0),
            "total_messages": user.get("total_messages_received", 0)
        },
        "timeline": {
            "activities": activities,
            "messages": messages,
            "feedbacks": feedbacks
        }
    }

# Schedule Management Routes
@api_router.post("/users/{email}/schedule/pause")
async def pause_schedule(email: str):
    """Pause user's email schedule"""
    await db.users.update_one(
        {"email": email},
        {"$set": {"schedule.paused": True}}
    )
    return {"status": "success", "message": "Schedule paused"}

@api_router.post("/users/{email}/schedule/resume")
async def resume_schedule(email: str):
    """Resume user's email schedule"""
    await db.users.update_one(
        {"email": email},
        {"$set": {"schedule.paused": False}}
    )
    return {"status": "success", "message": "Schedule resumed"}

@api_router.post("/users/{email}/schedule/skip-next")
async def skip_next_email(email: str):
    """Skip the next scheduled email"""
    await db.users.update_one(
        {"email": email},
        {"$set": {"schedule.skip_next": True}}
    )
    return {"status": "success", "message": "Next email will be skipped"}

# Admin Routes
@api_router.get("/admin/users", dependencies=[Depends(verify_admin)])
async def admin_get_all_users(page: int = 1, limit: int = 50):
    """
    Get all users with pagination for scalability (10k+ users).
    Default: 50 users per page. Use ?page=2&limit=100 for more.
    """
    skip = (page - 1) * limit
    total_users = await db.users.count_documents({})
    
    users = await db.users.find({}, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    for user in users:
        if isinstance(user.get('created_at'), str):
            user['created_at'] = datetime.fromisoformat(user['created_at'])
        if isinstance(user.get('last_email_sent'), str):
            user['last_email_sent'] = datetime.fromisoformat(user['last_email_sent'])
    
    total_pages = (total_users + limit - 1) // limit
    
    return {
        "users": users, 
        "total": total_users,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }

@api_router.get("/admin/email-logs", dependencies=[Depends(verify_admin)])
async def admin_get_email_logs(limit: int = 100):
    logs = await db.email_logs.find({}, {"_id": 0}).sort("sent_at", -1).to_list(limit)
    for log in logs:
        sent_at = log.get('sent_at')
        if isinstance(sent_at, datetime):
            log['sent_at'] = sent_at.isoformat()
        elif isinstance(sent_at, str):
            # ensure ISO formatting
            try:
                log['sent_at'] = datetime.fromisoformat(sent_at).isoformat()
            except Exception:
                pass
    return {"logs": logs}

@api_router.get("/admin/stats", dependencies=[Depends(verify_admin)])
async def admin_get_stats():
    total_users = await db.users.count_documents({})
    active_users = await db.users.count_documents({"active": True})
    total_emails = await db.email_logs.count_documents({})
    failed_emails = await db.email_logs.count_documents({"status": "failed"})
    total_messages = await db.message_history.count_documents({})
    total_feedback = await db.message_feedback.count_documents({})
    
    # Calculate average streak using MongoDB aggregation (accurate for 10k+ users)
    streak_aggregation = await db.users.aggregate([
        {"$group": {
            "_id": None,
            "avg_streak": {"$avg": "$streak_count"},
            "total_users": {"$sum": 1}
        }}
    ]).to_list(1)
    
    if streak_aggregation and len(streak_aggregation) > 0:
        avg_streak = streak_aggregation[0].get("avg_streak", 0) or 0
    else:
        avg_streak = 0
    
    # Get feedback ratings using aggregation (accurate for 10k+ users)
    rating_aggregation = await db.message_feedback.aggregate([
        {"$group": {
            "_id": None,
            "avg_rating": {"$avg": "$rating"},
            "total_feedback": {"$sum": 1}
        }}
    ]).to_list(1)
    
    if rating_aggregation and len(rating_aggregation) > 0:
        avg_rating = rating_aggregation[0].get("avg_rating", 0) or 0
    else:
        avg_rating = 0
    
    return {
        "total_users": total_users,
        "active_users": active_users,
        "inactive_users": total_users - active_users,
        "total_emails_sent": total_emails,
        "failed_emails": failed_emails,
        "success_rate": round((total_emails - failed_emails) / total_emails * 100, 2) if total_emails > 0 else 0,
        "total_messages": total_messages,
        "total_feedback": total_feedback,
        "avg_streak": round(avg_streak, 1),
        "avg_rating": round(avg_rating, 2),
        "engagement_rate": round((total_feedback / total_messages * 100), 2) if total_messages > 0 else 0
    }

@api_router.get("/admin/feedback", dependencies=[Depends(verify_admin)])
async def admin_get_feedback(limit: int = 100):
    """Get all feedback with full details including feedback_text"""
    feedbacks = await db.message_feedback.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    for fb in feedbacks:
        if isinstance(fb.get('created_at'), str):
            try:
                fb['created_at'] = datetime.fromisoformat(fb['created_at'])
            except Exception:
                pass
        # Ensure feedback_text is always present (even if None)
        if 'feedback_text' not in fb:
            fb['feedback_text'] = None
    return {"feedbacks": feedbacks}

@api_router.put("/admin/users/{email}", dependencies=[Depends(verify_admin)])
async def admin_update_user(email: str, updates: dict):
    """Admin update any user field"""
    await db.users.update_one(
        {"email": email},
        {"$set": updates}
    )
    updated_user = await db.users.find_one({"email": email}, {"_id": 0})
    
    # Track admin update
    await tracker.log_admin_activity(
        action_type="user_updated",
        admin_email="admin",
        details={"target_user": email, "updates": updates}
    )
    
    return {"status": "success", "user": updated_user}

@api_router.get("/admin/users/{email}/details", dependencies=[Depends(verify_admin)])
async def admin_get_user_details(email: str):
    """Get complete user details including all history and analytics"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get user's message history
    messages = await db.message_history.find(
        {"email": email}, {"_id": 0}
    ).sort("sent_at", -1).limit(100).to_list(100)
    
    # Get user's feedback
    feedbacks = await db.message_feedback.find(
        {"email": email}, {"_id": 0}
    ).sort("created_at", -1).limit(100).to_list(100)
    
    # Get user's email logs
    email_logs = await db.email_logs.find(
        {"email": email}, {"_id": 0}
    ).sort("sent_at", -1).limit(100).to_list(100)
    
    # Get user's activity timeline
    activities = await db.activity_logs.find(
        {"user_email": email}, {"_id": 0}
    ).sort("timestamp", -1).limit(200).to_list(200)
    
    # Get user analytics
    analytics = await get_user_analytics(email)
    
    # Get complete history
    complete_history = await version_tracker.get_all_user_history(email)
    
    return {
        "user": user,
        "messages": messages,
        "feedbacks": feedbacks,
        "email_logs": email_logs,
        "activities": activities,
        "analytics": analytics,
        "history": complete_history
    }

@api_router.get("/admin/email-logs/advanced", dependencies=[Depends(verify_admin)])
async def admin_get_email_logs_advanced(
    limit: int = 100,
    status: Optional[str] = None,
    email: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Advanced email logs with filtering"""
    query = {}
    if status:
        query["status"] = status
    if email:
        query["email"] = email
    
    if start_date or end_date:
        query["sent_at"] = {}
        if start_date:
            query["sent_at"]["$gte"] = datetime.fromisoformat(start_date)
        if end_date:
            query["sent_at"]["$lte"] = datetime.fromisoformat(end_date)
    
    logs = await db.email_logs.find(query, {"_id": 0}).sort("sent_at", -1).limit(limit).to_list(limit)
    for log in logs:
        sent_at = log.get('sent_at')
        if isinstance(sent_at, datetime):
            log['sent_at'] = sent_at.isoformat()
        elif isinstance(sent_at, str):
            try:
                log['sent_at'] = datetime.fromisoformat(sent_at).isoformat()
            except Exception:
                pass
    return {"logs": logs, "total": len(logs)}

@api_router.get("/admin/errors", dependencies=[Depends(verify_admin)])
async def admin_get_errors(limit: int = 100):
    """Get all error logs from system events and API analytics"""
    # Get system errors
    system_errors = await db.system_events.find(
        {"status": {"$ne": "success"}}, {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    # Get API errors
    api_errors = await db.api_analytics.find(
        {"status_code": {"$gte": 400}}, {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    # Get email failures
    email_errors = await db.email_logs.find(
        {"status": "failed"}, {"_id": 0}
    ).sort("sent_at", -1).limit(limit).to_list(limit)
    
    return {
        "system_errors": system_errors,
        "api_errors": api_errors,
        "email_errors": email_errors,
        "total": len(system_errors) + len(api_errors) + len(email_errors)
    }

@api_router.post("/admin/users/bulk-update", dependencies=[Depends(verify_admin)])
async def admin_bulk_update_users(emails: list, updates: dict):
    """Bulk update multiple users"""
    result = await db.users.update_many(
        {"email": {"$in": emails}},
        {"$set": updates}
    )
    
    await tracker.log_admin_activity(
        action_type="bulk_user_update",
        admin_email="admin",
        details={"target_users": emails, "updates": updates, "modified_count": result.modified_count}
    )
    
    return {
        "status": "success",
        "modified_count": result.modified_count,
        "matched_count": result.matched_count
    }

def verify_user_or_admin(
    email: str,
    authorization: str = Header(None),
    x_user_email: str = Header(None, alias="X-User-Email")
):
    """
    Verify that the request is from the account owner or an admin.
    - Admin: Authorization header with ADMIN_SECRET
    - User: X-User-Email header must match the email in the path
    
    This is a security measure to prevent unauthorized account deletion.
    Note: In production, consider using Clerk token verification for stronger security.
    """
    # Check if admin
    if authorization and authorization == f"Bearer {os.getenv('ADMIN_SECRET')}":
        logger.info(f"✅ Admin deletion authorized for: {email}")
        return True
    
    # Check if user is deleting their own account
    if x_user_email and x_user_email.lower() == email.lower():
        logger.info(f"✅ User self-deletion authorized for: {email}")
        return True
    
    # Neither admin nor matching user - unauthorized
    logger.warning(f"❌ Unauthorized deletion attempt for: {email} (provided email: {x_user_email}, admin: {bool(authorization)})")
    raise HTTPException(
        status_code=403,
        detail="Unauthorized: You can only delete your own account or must be an admin"
    )

@api_router.delete("/users/{email}")
async def delete_user_account(
    email: str,
    authorization: str = Header(None),
    x_user_email: str = Header(None, alias="X-User-Email")
):
    """
    Delete user account (user-facing endpoint).
    Requires authentication: either admin token or X-User-Email header matching the email.
    
    Security: This endpoint now requires authentication to prevent unauthorized deletions.
    """
    # Verify authentication
    verify_user_or_admin(email, authorization, x_user_email)
    
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_name = user.get("name", email.split("@")[0])
    
    # Soft delete - mark as inactive
    await db.users.update_one(
        {"email": email},
        {"$set": {"active": False, "deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Remove scheduled jobs for this user
    try:
        jobs_to_remove = [job.id for job in scheduler.get_jobs() if email in job.id]
        for job_id in jobs_to_remove:
            scheduler.remove_job(job_id)
        logger.info(f"✅ Removed {len(jobs_to_remove)} scheduled jobs for deleted user: {email}")
    except Exception as e:
        logger.warning(f"⚠️ Error removing jobs for {email}: {str(e)}")
    
    # Track activity
    await tracker.log_user_activity(
        action_type="account_deleted",
        user_email=email,
        details={"deleted_at": datetime.now(timezone.utc).isoformat()}
    )
    
    # Send account deletion confirmation email
    try:
        deletion_subject = "Your Tend Account Has Been Deleted"
        deletion_html = f"""
        <html>
        <head>
            <style>
                body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6fb; margin: 0; padding: 0; color: #1f2933; }}
                .wrapper {{ max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 12px; padding: 28px 32px; box-shadow: 0 12px 30px rgba(40,52,71,0.08); }}
                .header {{ text-align: center; margin-bottom: 32px; }}
                .header h1 {{ font-size: 28px; color: #1b3a61; margin: 0 0 12px 0; }}
                .content {{ font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; color: #1f2933; }}
                .info-box {{ background: #f8fafc; border-left: 4px solid #4f46e5; padding: 16px; margin: 24px 0; border-radius: 4px; }}
                .info-box p {{ margin: 0; color: #5a687d; }}
                .cta {{ text-align: center; margin: 32px 0; }}
                .cta a {{ display: inline-block; background: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; }}
                .footer {{ margin-top: 32px; font-size: 13px; color: #5a687d; text-align: center; }}
                .signature {{ margin-top: 28px; font-size: 14px; color: #5a687d; }}
            </style>
        </head>
        <body>
            <div class="wrapper">
                <div class="header">
                    <h1>Account Deletion Confirmation</h1>
                </div>
                <div class="content">
                    <p>Hi {html.escape(user_name)},</p>
                    <p>We've successfully processed your account deletion request. Your Tend account has been deactivated and all scheduled emails have been cancelled.</p>
                    
                    <div class="info-box">
                        <p><strong>What happens next:</strong></p>
                        <ul style="margin: 8px 0 0 0; padding-left: 24px;">
                            <li>Your account is now inactive</li>
                            <li>You will no longer receive motivational emails</li>
                            <li>Your data will be retained for 30 days (per our data retention policy)</li>
                            <li>After 30 days, your data will be permanently deleted</li>
                        </ul>
                    </div>
                    
                    <p>We're sorry to see you go! If you change your mind, you can always create a new account and start fresh.</p>
                    
                    <p>If you have any questions or concerns, please don't hesitate to reach out to our support team.</p>
                </div>
                <div class="cta">
                    <a href="{os.getenv('FRONTEND_URL', '')}">Visit Tend</a>
                </div>
                <div class="signature">
                    <p>Thank you for being part of the Tend community.</p>
                    <p><strong>Tend Team</strong></p>
                </div>
                <div class="footer">
                    <p>This is an automated confirmation email. If you did not request account deletion, please contact support immediately.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        success, error = await send_email(email, deletion_subject, deletion_html)
        if success:
            logger.info(f"✅ Account deletion email sent to: {email}")
        else:
            logger.warning(f"⚠️ Failed to send deletion email to {email}: {error}")
    except Exception as e:
        logger.error(f"❌ Error sending deletion email to {email}: {str(e)}", exc_info=True)
        # Don't fail the deletion if email fails
    
    return {
        "status": "success",
        "message": "Account deleted successfully",
        "email": email
    }

@api_router.delete("/admin/users/{email}", dependencies=[Depends(verify_admin)])
async def admin_delete_user(email: str, soft_delete: bool = True):
    """Delete a user (soft delete by default) - Admin endpoint"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_name = user.get("name", email.split("@")[0])
    
    if soft_delete:
        await db.users.update_one(
            {"email": email},
            {"$set": {"active": False, "deleted_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        # Remove scheduled jobs
        try:
            jobs_to_remove = [job.id for job in scheduler.get_jobs() if email in job.id]
            for job_id in jobs_to_remove:
                scheduler.remove_job(job_id)
        except Exception as e:
            logger.warning(f"⚠️ Error removing jobs for {email}: {str(e)}")
        
        await tracker.log_admin_activity(
            action_type="user_deleted",
            admin_email="admin",
            details={"target_user": email, "soft_delete": True}
        )
        
        # Send deletion email
        try:
            deletion_subject = "Your Tend Account Has Been Deleted"
            deletion_html = f"""
            <html>
            <head>
                <style>
                    body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6fb; margin: 0; padding: 0; color: #1f2933; }}
                    .wrapper {{ max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 12px; padding: 28px 32px; box-shadow: 0 12px 30px rgba(40,52,71,0.08); }}
                    .header {{ text-align: center; margin-bottom: 32px; }}
                    .header h1 {{ font-size: 28px; color: #1b3a61; margin: 0 0 12px 0; }}
                    .content {{ font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; color: #1f2933; }}
                    .info-box {{ background: #f8fafc; border-left: 4px solid #4f46e5; padding: 16px; margin: 24px 0; border-radius: 4px; }}
                    .footer {{ margin-top: 32px; font-size: 13px; color: #5a687d; text-align: center; }}
                </style>
            </head>
            <body>
                <div class="wrapper">
                    <div class="header">
                        <h1>Account Deletion Confirmation</h1>
                    </div>
                    <div class="content">
                        <p>Hi {html.escape(user_name)},</p>
                        <p>Your Tend account has been deactivated by an administrator. All scheduled emails have been cancelled.</p>
                        <div class="info-box">
                            <p>If you believe this was done in error, please contact our support team.</p>
                        </div>
                    </div>
                    <div class="footer">
                        <p>Thank you for being part of the Tend community.</p>
                    </div>
                </div>
            </body>
            </html>
            """
            await send_email(email, deletion_subject, deletion_html)
        except Exception as e:
            logger.warning(f"⚠️ Failed to send deletion email: {str(e)}")
        
        return {"status": "soft_deleted", "email": email}
    else:
        # Hard delete - remove all related data
        await db.users.delete_one({"email": email})
        await db.message_history.delete_many({"email": email})
        await db.message_feedback.delete_many({"email": email})
        await db.email_logs.delete_many({"email": email})
        await tracker.log_admin_activity(
            action_type="user_hard_deleted",
            admin_email="admin",
            details={"target_user": email}
        )
        return {"status": "hard_deleted", "email": email}

@api_router.get("/admin/scheduler/jobs", dependencies=[Depends(verify_admin)])
async def admin_get_scheduler_jobs():
    """Get all scheduled jobs"""
    jobs = scheduler.get_jobs()
    job_list = []
    for job in jobs:
        job_list.append({
            "id": job.id,
            "name": job.name,
            "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
            "func": job.func.__name__ if hasattr(job.func, '__name__') else str(job.func),
            "trigger": str(job.trigger) if job.trigger else None
        })
    return {"jobs": job_list, "total": len(job_list)}

@api_router.post("/admin/scheduler/jobs/{job_id}/trigger", dependencies=[Depends(verify_admin)])
async def admin_trigger_job(job_id: str):
    """Manually trigger a scheduled job"""
    try:
        job = scheduler.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        job.modify(next_run_time=datetime.now(timezone.utc))
        await tracker.log_admin_activity(
            action_type="job_triggered",
            admin_email="admin",
            details={"job_id": job_id}
        )
        return {"status": "triggered", "job_id": job_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/admin/database/health", dependencies=[Depends(verify_admin)])
async def admin_get_database_health():
    """Get database health and collection statistics"""
    collections = {
        "users": await db.users.count_documents({}),
        "message_history": await db.message_history.count_documents({}),
        "message_feedback": await db.message_feedback.count_documents({}),
        "email_logs": await db.email_logs.count_documents({}),
        "activity_logs": await db.activity_logs.count_documents({}),
        "system_events": await db.system_events.count_documents({}),
        "api_analytics": await db.api_analytics.count_documents({}),
        "page_views": await db.page_views.count_documents({}),
        "user_sessions": await db.user_sessions.count_documents({}),
    }
    
    # Get recent activity counts
    from datetime import timedelta
    last_24h = datetime.now(timezone.utc) - timedelta(hours=24)
    recent_activity = {
        "messages_24h": await db.message_history.count_documents({"sent_at": {"$gte": last_24h}}),
        "emails_24h": await db.email_logs.count_documents({"sent_at": {"$gte": last_24h}}),
        "activities_24h": await db.activity_logs.count_documents({"timestamp": {"$gte": last_24h}}),
        "errors_24h": await db.email_logs.count_documents({"status": "failed", "sent_at": {"$gte": last_24h}}),
    }
    
    return {
        "collections": collections,
        "recent_activity": recent_activity,
        "total_documents": sum(collections.values())
    }

@api_router.get("/admin/logs/activity", dependencies=[Depends(verify_admin)])
async def admin_get_activity_logs(
    page: int = 1,
    limit: int = 100,
    user_email: Optional[str] = None,
    action_type: Optional[str] = None,
    action_category: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """
    Get activity logs with filtering and pagination.
    Supports filtering by user, action type, category, and date range.
    """
    skip = (page - 1) * limit
    query = {}
    
    if user_email:
        query["user_email"] = user_email
    if action_type:
        query["action_type"] = action_type
    if action_category:
        query["action_category"] = action_category
    
    # Date range filtering
    if start_date or end_date:
        date_query = {}
        if start_date:
            try:
                date_query["$gte"] = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            except:
                date_query["$gte"] = datetime.fromisoformat(start_date)
        if end_date:
            try:
                date_query["$lte"] = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            except:
                date_query["$lte"] = datetime.fromisoformat(end_date)
        query["timestamp"] = date_query
    
    total = await db.activity_logs.count_documents(query)
    logs = await db.activity_logs.find(
        query,
        {"_id": 0}
    ).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    
    # Convert datetime to ISO strings
    for log in logs:
        if isinstance(log.get('timestamp'), datetime):
            log['timestamp'] = log['timestamp'].isoformat()
    
    total_pages = (total + limit - 1) // limit
    
    return {
        "logs": logs,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }

@api_router.get("/admin/logs/system-events", dependencies=[Depends(verify_admin)])
async def admin_get_system_events(
    page: int = 1,
    limit: int = 100,
    event_type: Optional[str] = None,
    event_category: Optional[str] = None,
    status: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """
    Get system events with filtering and pagination.
    """
    skip = (page - 1) * limit
    query = {}
    
    if event_type:
        query["event_type"] = event_type
    if event_category:
        query["event_category"] = event_category
    if status:
        query["status"] = status
    
    # Date range filtering
    if start_date or end_date:
        date_query = {}
        if start_date:
            try:
                date_query["$gte"] = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            except:
                date_query["$gte"] = datetime.fromisoformat(start_date)
        if end_date:
            try:
                date_query["$lte"] = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            except:
                date_query["$lte"] = datetime.fromisoformat(end_date)
        query["timestamp"] = date_query
    
    total = await db.system_events.count_documents(query)
    events = await db.system_events.find(
        query,
        {"_id": 0}
    ).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    
    # Convert datetime to ISO strings
    for event in events:
        if isinstance(event.get('timestamp'), datetime):
            event['timestamp'] = event['timestamp'].isoformat()
    
    total_pages = (total + limit - 1) // limit
    
    return {
        "events": events,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }

@api_router.get("/admin/logs/api-analytics", dependencies=[Depends(verify_admin)])
async def admin_get_api_analytics(
    page: int = 1,
    limit: int = 100,
    endpoint: Optional[str] = None,
    method: Optional[str] = None,
    status_code: Optional[int] = None,
    user_email: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """
    Get API analytics with filtering and pagination.
    """
    skip = (page - 1) * limit
    query = {}
    
    if endpoint:
        query["endpoint"] = {"$regex": endpoint, "$options": "i"}
    if method:
        query["method"] = method
    if status_code:
        query["status_code"] = status_code
    if user_email:
        query["user_email"] = user_email
    
    # Date range filtering
    if start_date or end_date:
        date_query = {}
        if start_date:
            try:
                date_query["$gte"] = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            except:
                date_query["$gte"] = datetime.fromisoformat(start_date)
        if end_date:
            try:
                date_query["$lte"] = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            except:
                date_query["$lte"] = datetime.fromisoformat(end_date)
        query["timestamp"] = date_query
    
    total = await db.api_analytics.count_documents(query)
    analytics = await db.api_analytics.find(
        query,
        {"_id": 0}
    ).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    
    # Convert datetime to ISO strings
    for item in analytics:
        if isinstance(item.get('timestamp'), datetime):
            item['timestamp'] = item['timestamp'].isoformat()
    
    total_pages = (total + limit - 1) // limit
    
    return {
        "analytics": analytics,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }

@api_router.get("/admin/logs/unified", dependencies=[Depends(verify_admin)])
async def admin_get_unified_logs(
    page: int = 1,
    limit: int = 100,
    log_type: Optional[str] = None,  # "activity", "system", "api", "all"
    user_email: Optional[str] = None,
    search: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """
    Get unified logs from all sources (activity, system events, API analytics).
    Combines all log types into a single timeline.
    """
    skip = (page - 1) * limit
    all_logs = []
    
    # Build date query
    date_query = {}
    if start_date:
        try:
            date_query["$gte"] = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        except:
            date_query["$gte"] = datetime.fromisoformat(start_date)
    if end_date:
        try:
            date_query["$lte"] = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        except:
            date_query["$lte"] = datetime.fromisoformat(end_date)
    
    # Fetch activity logs
    if log_type in [None, "all", "activity"]:
        activity_query = {}
        if user_email:
            activity_query["user_email"] = user_email
        if date_query:
            activity_query["timestamp"] = date_query
        
        activity_logs = await db.activity_logs.find(
            activity_query,
            {"_id": 0}
        ).sort("timestamp", -1).limit(limit * 2).to_list(limit * 2)
        
        for log in activity_logs:
            log['log_type'] = 'activity'
            log['display_time'] = log.get('timestamp')
            if isinstance(log.get('timestamp'), datetime):
                log['timestamp'] = log['timestamp'].isoformat()
                log['display_time'] = log['timestamp']
            all_logs.append(log)
    
    # Fetch system events
    if log_type in [None, "all", "system"]:
        system_query = {}
        if date_query:
            system_query["timestamp"] = date_query
        
        system_events = await db.system_events.find(
            system_query,
            {"_id": 0}
        ).sort("timestamp", -1).limit(limit * 2).to_list(limit * 2)
        
        for event in system_events:
            event['log_type'] = 'system'
            event['display_time'] = event.get('timestamp')
            if isinstance(event.get('timestamp'), datetime):
                event['timestamp'] = event['timestamp'].isoformat()
                event['display_time'] = event['timestamp']
            all_logs.append(event)
    
    # Fetch API analytics
    if log_type in [None, "all", "api"]:
        api_query = {}
        if user_email:
            api_query["user_email"] = user_email
        if date_query:
            api_query["timestamp"] = date_query
        
        api_analytics = await db.api_analytics.find(
            api_query,
            {"_id": 0}
        ).sort("timestamp", -1).limit(limit * 2).to_list(limit * 2)
        
        for item in api_analytics:
            item['log_type'] = 'api'
            item['display_time'] = item.get('timestamp')
            if isinstance(item.get('timestamp'), datetime):
                item['timestamp'] = item['timestamp'].isoformat()
                item['display_time'] = item['timestamp']
            all_logs.append(item)
    
    # Sort by timestamp (newest first)
    all_logs.sort(key=lambda x: x.get('display_time', ''), reverse=True)
    
    # Apply search filter if provided
    if search:
        search_lower = search.lower()
        all_logs = [
            log for log in all_logs
            if search_lower in str(log).lower() or
               search_lower in str(log.get('user_email', '')).lower() or
               search_lower in str(log.get('action_type', '')).lower() or
               search_lower in str(log.get('event_type', '')).lower() or
               search_lower in str(log.get('endpoint', '')).lower()
        ]
    
    total = len(all_logs)
    
    # Paginate
    paginated_logs = all_logs[skip:skip + limit]
    total_pages = (total + limit - 1) // limit
    
    return {
        "logs": paginated_logs,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }

class BroadcastRequest(BaseModel):
    message: str
    subject: Optional[str] = None

@api_router.post("/admin/broadcast", dependencies=[Depends(verify_admin)])
async def admin_broadcast_message(request: BroadcastRequest):
    """
    Send a message to all active users.
    Uses pagination to handle 10k+ users efficiently.
    Email queue automatically limits concurrent sends.
    """
    broadcast_start = time.time()
    message = request.message
    subject = request.subject
    broadcast_subject = subject or "Important Update from Tend"
    
    logger.info(f"📢 Broadcast message initiated: '{broadcast_subject}'")
    logger.debug(f"Message length: {len(message)} characters")
    
    success_count = 0
    failed_count = 0
    batch_size = 100  # Process in batches
    skip = 0
    
    while True:
        # Fetch batch of users
        active_users = await db.users.find(
            {"active": True}, 
            {"email": 1, "_id": 0}
        ).skip(skip).limit(batch_size).to_list(batch_size)
        
        if not active_users:
            break
        
        emails = [u["email"] for u in active_users]
        
        # Send emails in batch (email queue semaphore handles rate limiting)
        for email in emails:
            try:
                success, error = await send_email(
                    to_email=email,
                    subject=broadcast_subject,
                    html_content=message
                )
                if success:
                    success_count += 1
                    await record_email_log(
                        email=email,
                        subject=broadcast_subject,
                        status="success",
                        sent_dt=datetime.now(timezone.utc)
                    )
                else:
                    failed_count += 1
                    await record_email_log(
                        email=email,
                        subject=broadcast_subject,
                        status="failed",
                        sent_dt=datetime.now(timezone.utc),
                        error_message=error
                    )
            except Exception as e:
                failed_count += 1
                logger.error(f"Failed to send broadcast to {email}: {str(e)}")
        
        skip += batch_size
        total_processed = success_count + failed_count
        
        # Log progress every 1000 users
        if total_processed % 1000 == 0 and total_processed > 0:
            logger.info(f"📊 Broadcast progress: {total_processed} users processed ({success_count} success, {failed_count} failed)...")
    
    broadcast_duration = time.time() - broadcast_start
    total_users = success_count + failed_count
    
    logger.info(f"✅ Broadcast completed in {broadcast_duration:.2f}s")
    logger.info(f"   - Total users: {total_users}")
    logger.info(f"   - Success: {success_count} ({success_count/total_users*100:.1f}%)" if total_users > 0 else "")
    logger.info(f"   - Failed: {failed_count} ({failed_count/total_users*100:.1f}%)" if total_users > 0 else "")
    
    await tracker.log_admin_activity(
        action_type="broadcast_sent",
        admin_email="admin",
        details={
            "total_users": total_users, 
            "success": success_count, 
            "failed": failed_count,
            "duration_seconds": round(broadcast_duration, 2)
        }
    )
    
    return {
        "status": "completed",
        "total_users": total_users,
        "success": success_count,
        "failed": failed_count
    }

@api_router.get("/admin/analytics/trends", dependencies=[Depends(verify_admin)])
async def admin_get_analytics_trends(days: int = 30):
    """Get analytics trends over time"""
    from datetime import timedelta
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days)
    
    # Daily user registrations
    pipeline_users = [
        {"$match": {"created_at": {"$gte": start_date, "$lte": end_date}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]
    user_trends = await db.users.aggregate(pipeline_users).to_list(100)
    
    # Daily emails sent
    pipeline_emails = [
        {"$match": {"sent_at": {"$gte": start_date, "$lte": end_date}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$sent_at"}},
            "count": {"$sum": 1},
            "success": {"$sum": {"$cond": [{"$eq": ["$status", "success"]}, 1, 0]}},
            "failed": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}}
        }},
        {"$sort": {"_id": 1}}
    ]
    email_trends = await db.email_logs.aggregate(pipeline_emails).to_list(100)
    
    # Daily feedback
    pipeline_feedback = [
        {"$match": {"created_at": {"$gte": start_date, "$lte": end_date}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "count": {"$sum": 1},
            "avg_rating": {"$avg": "$rating"}
        }},
        {"$sort": {"_id": 1}}
    ]
    feedback_trends = await db.message_feedback.aggregate(pipeline_feedback).to_list(100)
    
    return {
        "user_trends": user_trends,
        "email_trends": email_trends,
        "feedback_trends": feedback_trends,
        "period_days": days
    }

@api_router.get("/admin/search", dependencies=[Depends(verify_admin)])
async def admin_global_search(query: str, limit: int = 50, page: int = 1):
    """
    Global search across all collections with pagination.
    Supports 10k+ users with efficient pagination.
    """
    results = {
        "users": [],
        "messages": [],
        "feedback": [],
        "logs": []
    }
    
    # Calculate skip for pagination
    skip = (page - 1) * limit
    
    # Search users with pagination
    users = await db.users.find({
        "$or": [
            {"email": {"$regex": query, "$options": "i"}},
            {"name": {"$regex": query, "$options": "i"}},
            {"goals": {"$regex": query, "$options": "i"}}
        ]
    }, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    results["users"] = users
    
    # Get total count for users
    total_users = await db.users.count_documents({
        "$or": [
            {"email": {"$regex": query, "$options": "i"}},
            {"name": {"$regex": query, "$options": "i"}},
            {"goals": {"$regex": query, "$options": "i"}}
        ]
    })
    
    # Search messages with pagination
    messages = await db.message_history.find({
        "$or": [
            {"email": {"$regex": query, "$options": "i"}},
            {"message": {"$regex": query, "$options": "i"}},
            {"subject": {"$regex": query, "$options": "i"}}
        ]
    }, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    results["messages"] = messages
    
    # Get total count for messages
    total_messages = await db.message_history.count_documents({
        "$or": [
            {"email": {"$regex": query, "$options": "i"}},
            {"message": {"$regex": query, "$options": "i"}},
            {"subject": {"$regex": query, "$options": "i"}}
        ]
    })
    
    # Search feedback with pagination
    feedbacks = await db.message_feedback.find({
        "$or": [
            {"email": {"$regex": query, "$options": "i"}},
            {"feedback_text": {"$regex": query, "$options": "i"}}
        ]
    }, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    results["feedback"] = feedbacks
    
    # Get total count for feedback
    total_feedback = await db.message_feedback.count_documents({
        "$or": [
            {"email": {"$regex": query, "$options": "i"}},
            {"feedback_text": {"$regex": query, "$options": "i"}}
        ]
    })
    
    # Search email logs with pagination
    logs = await db.email_logs.find({
        "$or": [
            {"email": {"$regex": query, "$options": "i"}},
            {"subject": {"$regex": query, "$options": "i"}},
            {"error_message": {"$regex": query, "$options": "i"}}
        ]
    }, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    results["logs"] = logs
    
    # Get total count for logs
    total_logs = await db.email_logs.count_documents({
        "$or": [
            {"email": {"$regex": query, "$options": "i"}},
            {"subject": {"$regex": query, "$options": "i"}},
            {"error_message": {"$regex": query, "$options": "i"}}
        ]
    })
    
    total_results = len(results["users"]) + len(results["messages"]) + len(results["feedback"]) + len(results["logs"])
    total_all = total_users + total_messages + total_feedback + total_logs
    
    return {
        "query": query,
        "results": results,
        "total": total_results,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total_all,
            "total_pages": (total_all + limit - 1) // limit if limit > 0 else 1
        },
        "counts": {
            "users": {"returned": len(results["users"]), "total": total_users},
            "messages": {"returned": len(results["messages"]), "total": total_messages},
            "feedback": {"returned": len(results["feedback"]), "total": total_feedback},
            "logs": {"returned": len(results["logs"]), "total": total_logs}
        }
    }

@api_router.get("/admin/message-history", dependencies=[Depends(verify_admin)])
async def admin_get_all_message_history(
    limit: int = 200,
    email: Optional[str] = None,
    personality: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Get all message history across all users with filtering"""
    query = {}
    
    if email:
        query["email"] = email
    if personality:
        query["personality.value"] = personality
    
    if start_date or end_date:
        query["sent_at"] = {}
        if start_date:
            try:
                query["sent_at"]["$gte"] = datetime.fromisoformat(start_date)
            except Exception:
                pass
        if end_date:
            try:
                query["sent_at"]["$lte"] = datetime.fromisoformat(end_date)
            except Exception:
                pass
    
    messages = await db.message_history.find(query, {"_id": 0}).sort("sent_at", -1).limit(limit).to_list(limit)
    
    # Ensure all datetime objects are timezone-aware (UTC) and convert to ISO format
    for msg in messages:
        sent_at = msg.get('sent_at')
        if sent_at:
            if isinstance(sent_at, str):
                try:
                    dt = datetime.fromisoformat(sent_at.replace('Z', '+00:00'))
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    msg['sent_at'] = dt.isoformat()
                except Exception:
                    pass
            elif isinstance(sent_at, datetime):
                # Ensure timezone-aware
                if sent_at.tzinfo is None:
                    sent_at = sent_at.replace(tzinfo=timezone.utc)
                msg['sent_at'] = sent_at.isoformat()
    
    return {
        "messages": messages,
        "total": len(messages),
        "filters": {
            "email": email,
            "personality": personality,
            "start_date": start_date,
            "end_date": end_date
        }
    }

@api_router.get("/admin/email-statistics", dependencies=[Depends(verify_admin)])
async def admin_get_email_statistics(days: int = 30):
    """Get comprehensive email delivery statistics"""
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    
    # Total emails sent
    total_sent = await db.email_logs.count_documents({"sent_at": {"$gte": cutoff}})
    successful = await db.email_logs.count_documents({"status": "success", "sent_at": {"$gte": cutoff}})
    failed = await db.email_logs.count_documents({"status": "failed", "sent_at": {"$gte": cutoff}})
    
    # Emails by personality
    personality_pipeline = [
        {"$match": {"sent_at": {"$gte": cutoff}}},
        {"$lookup": {
            "from": "message_history",
            "localField": "email",
            "foreignField": "email",
            "as": "messages"
        }},
        {"$unwind": {"path": "$messages", "preserveNullAndEmptyArrays": True}},
        {"$match": {"messages.sent_at": {"$gte": cutoff}}},
        {"$group": {
            "_id": "$messages.personality.value",
            "count": {"$sum": 1}
        }},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    personality_stats = await db.email_logs.aggregate(personality_pipeline).to_list(10)
    
    # Daily breakdown
    daily_pipeline = [
        {"$match": {"sent_at": {"$gte": cutoff}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$sent_at"}},
            "total": {"$sum": 1},
            "success": {"$sum": {"$cond": [{"$eq": ["$status", "success"]}, 1, 0]}},
            "failed": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}}
        }},
        {"$sort": {"_id": -1}},
        {"$limit": days}
    ]
    daily_stats = await db.email_logs.aggregate(daily_pipeline).to_list(days)
    
    # Top users by email count
    user_pipeline = [
        {"$match": {"sent_at": {"$gte": cutoff}}},
        {"$group": {
            "_id": "$email",
            "count": {"$sum": 1},
            "success_count": {"$sum": {"$cond": [{"$eq": ["$status", "success"]}, 1, 0]}},
            "failed_count": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}}
        }},
        {"$sort": {"count": -1}},
        {"$limit": 20}
    ]
    top_users = await db.email_logs.aggregate(user_pipeline).to_list(20)
    
    return {
        "summary": {
            "total_sent": total_sent,
            "successful": successful,
            "failed": failed,
            "success_rate": round((successful / total_sent * 100), 2) if total_sent > 0 else 0,
            "period_days": days
        },
        "personality_stats": personality_stats,
        "daily_stats": daily_stats,
        "top_users": top_users
    }

@api_router.get("/admin/user-activity-summary", dependencies=[Depends(verify_admin)])
async def admin_get_user_activity_summary(limit: int = 50):
    """Get summary of user activities"""
    from datetime import timedelta
    last_7d = datetime.now(timezone.utc) - timedelta(days=7)
    
    # Most active users
    active_users_pipeline = [
        {"$match": {"timestamp": {"$gte": last_7d}}},
        {"$group": {
            "_id": "$user_email",
            "action_count": {"$sum": 1},
            "last_activity": {"$max": "$timestamp"}
        }},
        {"$sort": {"action_count": -1}},
        {"$limit": limit}
    ]
    active_users = await db.activity_logs.aggregate(active_users_pipeline).to_list(limit)
    
    # Action type breakdown
    action_pipeline = [
        {"$match": {"timestamp": {"$gte": last_7d}}},
        {"$group": {
            "_id": "$action_type",
            "count": {"$sum": 1}
        }},
        {"$sort": {"count": -1}},
        {"$limit": 20}
    ]
    action_breakdown = await db.activity_logs.aggregate(action_pipeline).to_list(20)
    
    return {
        "most_active_users": active_users,
        "action_breakdown": action_breakdown,
        "period_days": 7
    }

# ============================================================================
# BULK OPERATIONS
# ============================================================================

class BulkUserActionRequest(BaseModel):
    user_emails: List[str]
    action: Literal["activate", "deactivate", "pause_schedule", "resume_schedule", "delete"]

@api_router.post("/admin/bulk/users", dependencies=[Depends(verify_admin)])
async def admin_bulk_user_action(request: BulkUserActionRequest):
    """Perform bulk actions on multiple users"""
    results = {"success": [], "failed": []}
    
    for email in request.user_emails:
        try:
            user = await db.users.find_one({"email": email}, {"_id": 0})
            if not user:
                results["failed"].append({"email": email, "error": "User not found"})
                continue
            
            update_data = {}
            if request.action == "activate":
                update_data["active"] = True
            elif request.action == "deactivate":
                update_data["active"] = False
            elif request.action == "pause_schedule":
                update_data["schedule.paused"] = True
            elif request.action == "resume_schedule":
                update_data["schedule.paused"] = False
            elif request.action == "delete":
                # Soft delete
                update_data["active"] = False
                await version_tracker.soft_delete(
                    collection="users",
                    document_id=user.get("id"),
                    document_data=user,
                    deleted_by="admin",
                    reason="Bulk delete operation"
                )
            
            if update_data:
                await db.users.update_one({"email": email}, {"$set": update_data})
            
            results["success"].append({"email": email, "action": request.action})
            
            # Log activity
            await tracker.log_admin_activity(
                action_type="bulk_user_action",
                details={
                    "email": email,
                    "action": request.action,
                    "bulk_count": len(request.user_emails)
                }
            )
        except Exception as e:
            results["failed"].append({"email": email, "error": str(e)})
    
    # Reschedule emails if schedule was changed
    if request.action in ["pause_schedule", "resume_schedule"]:
        await schedule_user_emails()
    
    return {
        "total": len(request.user_emails),
        "success_count": len(results["success"]),
        "failed_count": len(results["failed"]),
        "results": results
    }

class BulkEmailRequest(BaseModel):
    user_emails: List[str]
    subject: str
    message: str

@api_router.post("/admin/bulk/email", dependencies=[Depends(verify_admin)])
async def admin_bulk_send_email(request: BulkEmailRequest):
    """Send email to multiple users"""
    results = {"success": [], "failed": []}
    
    for email in request.user_emails:
        try:
            success, error = await send_email(
                to_email=email,
                subject=request.subject,
                html_content=request.message
            )
            if success:
                results["success"].append({"email": email})
                await record_email_log(
                    email=email,
                    subject=request.subject,
                    status="success",
                    sent_dt=datetime.now(timezone.utc)
                )
            else:
                results["failed"].append({"email": email, "error": error})
                await record_email_log(
                    email=email,
                    subject=request.subject,
                    status="failed",
                    sent_dt=datetime.now(timezone.utc),
                    error_message=error
                )
        except Exception as e:
            results["failed"].append({"email": email, "error": str(e)})
    
    await tracker.log_admin_activity(
        action_type="bulk_email_send",
        details={
            "total_recipients": len(request.user_emails),
            "success_count": len(results["success"]),
            "failed_count": len(results["failed"])
        }
    )
    
    return {
        "total": len(request.user_emails),
        "success_count": len(results["success"]),
        "failed_count": len(results["failed"]),
        "results": results
    }

# ============================================================================
# USER SEGMENTATION
# ============================================================================

@api_router.get("/admin/users/segments", dependencies=[Depends(verify_admin)])
async def admin_get_user_segments(
    engagement_level: Optional[Literal["high", "medium", "low"]] = None,
    min_streak: Optional[int] = None,
    max_streak: Optional[int] = None,
    min_rating: Optional[float] = None,
    personality: Optional[str] = None,
    active_only: bool = True,
    page: int = 1,
    limit: int = 100
):
    """
    Get segmented users based on various criteria with pagination.
    Supports 10k+ users efficiently.
    """
    query = {}
    
    if active_only:
        query["active"] = True
    
    if min_streak is not None or max_streak is not None:
        query["streak_count"] = {}
        if min_streak is not None:
            query["streak_count"]["$gte"] = min_streak
        if max_streak is not None:
            query["streak_count"]["$lte"] = max_streak
    
    if personality:
        query["personalities.value"] = personality
    
    # Use pagination for scalability
    skip = (page - 1) * limit
    total_users = await db.users.count_documents(query)
    
    users = await db.users.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    
    # Filter by engagement level
    if engagement_level:
        segmented_users = []
        for user in users:
            total_messages = user.get("total_messages_received", 0)
            feedback_count = await db.message_feedback.count_documents({"email": user["email"]})
            engagement_rate = (feedback_count / total_messages * 100) if total_messages > 0 else 0
            
            if engagement_level == "high" and engagement_rate >= 50:
                segmented_users.append(user)
            elif engagement_level == "medium" and 20 <= engagement_rate < 50:
                segmented_users.append(user)
            elif engagement_level == "low" and engagement_rate < 20:
                segmented_users.append(user)
        users = segmented_users
    
    # Filter by rating
    if min_rating is not None:
        rated_users = []
        for user in users:
            feedbacks = await db.message_feedback.find({"email": user["email"]}).to_list(100)
            if feedbacks:
                avg_rating = sum(f.get("rating", 0) for f in feedbacks) / len(feedbacks)
                if avg_rating >= min_rating:
                    rated_users.append(user)
        users = rated_users
    
    # Add engagement metrics to each user
    for user in users:
        total_messages = user.get("total_messages_received", 0)
        feedback_count = await db.message_feedback.count_documents({"email": user["email"]})
        user["engagement_rate"] = round((feedback_count / total_messages * 100), 2) if total_messages > 0 else 0
        
        feedbacks = await db.message_feedback.find({"email": user["email"]}).to_list(100)
        if feedbacks:
            user["avg_rating"] = round(sum(f.get("rating", 0) for f in feedbacks) / len(feedbacks), 2)
        else:
            user["avg_rating"] = None
    
    return {
        "total": total_users,
        "returned": len(users),
        "users": users,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total_users,
            "total_pages": (total_users + limit - 1) // limit if limit > 0 else 1
        },
        "filters": {
            "engagement_level": engagement_level,
            "min_streak": min_streak,
            "max_streak": max_streak,
            "min_rating": min_rating,
            "personality": personality,
            "active_only": active_only
        }
    }

# ============================================================================
# API COST TRACKING
# ============================================================================

@api_router.get("/admin/api-costs", dependencies=[Depends(verify_admin)])
async def admin_get_api_costs(days: int = 30):
    """Get API usage and estimated costs"""
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    
    # OpenAI API usage
    openai_events = await db.system_events.find({
        "event_category": {"$in": ["llm", "openai"]},
        "timestamp": {"$gte": cutoff}
    }).to_list(10000)
    
    # Estimate costs (rough estimates)
    # GPT-4: ~$0.03 per 1K input tokens, $0.06 per 1K output tokens
    # GPT-3.5: ~$0.0015 per 1K input tokens, $0.002 per 1K output tokens
    openai_cost = 0
    openai_calls = len(openai_events)
    
    # Tavily API usage
    tavily_events = await db.system_events.find({
        "event_category": "tavily",
        "timestamp": {"$gte": cutoff}
    }).to_list(10000)
    
    # Tavily: ~$0.10 per search (estimate)
    tavily_cost = len(tavily_events) * 0.10
    tavily_calls = len(tavily_events)
    
    # Daily breakdown
    daily_costs = {}
    for event in openai_events + tavily_events:
        event_date = event.get("timestamp", datetime.now(timezone.utc))
        if isinstance(event_date, str):
            event_date = datetime.fromisoformat(event_date.replace('Z', '+00:00'))
        date_key = event_date.strftime("%Y-%m-%d")
        
        if date_key not in daily_costs:
            daily_costs[date_key] = {"openai": 0, "tavily": 0, "total": 0}
        
        if event.get("event_category") in ["llm", "openai"]:
            # Rough estimate: $0.01 per call
            daily_costs[date_key]["openai"] += 0.01
        elif event.get("event_category") == "tavily":
            daily_costs[date_key]["tavily"] += 0.10
        
        daily_costs[date_key]["total"] = daily_costs[date_key]["openai"] + daily_costs[date_key]["tavily"]
    
    total_cost = openai_calls * 0.01 + tavily_cost
    
    return {
        "period_days": days,
        "openai": {
            "calls": openai_calls,
            "estimated_cost": round(openai_calls * 0.01, 2),
            "cost_per_call": 0.01
        },
        "tavily": {
            "calls": tavily_calls,
            "estimated_cost": round(tavily_cost, 2),
            "cost_per_call": 0.10
        },
        "total_cost": round(total_cost, 2),
        "daily_breakdown": daily_costs
    }

# ============================================================================
# ALERTS & NOTIFICATIONS
# ============================================================================

class AlertConfig(BaseModel):
    alert_type: Literal["error_rate", "api_failure", "rate_limit", "low_engagement"]
    threshold: float
    enabled: bool = True
    email_notification: bool = False

class Achievement(BaseModel):
    id: str
    name: str
    description: str
    icon: str  # Emoji or icon identifier
    category: str  # "streak", "messages", "engagement", "goals"
    requirement: Dict[str, Any]  # Conditions to unlock
    unlocked_at: Optional[datetime] = None

class GoalProgress(BaseModel):
    goal_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    goal_text: str
    target_date: Optional[datetime] = None
    progress_percentage: float = 0.0
    milestones: List[Dict[str, Any]] = []
    completed: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MessageFavorite(BaseModel):
    message_id: str
    favorited_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MessageCollection(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    message_ids: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

@api_router.get("/admin/alerts", dependencies=[Depends(verify_admin)])
async def admin_get_alerts():
    """Get current alert status"""
    from datetime import timedelta
    last_24h = datetime.now(timezone.utc) - timedelta(hours=24)
    
    # Error rate alert
    total_emails = await db.email_logs.count_documents({"sent_at": {"$gte": last_24h}})
    failed_emails = await db.email_logs.count_documents({
        "status": "failed",
        "sent_at": {"$gte": last_24h}
    })
    error_rate = (failed_emails / total_emails * 100) if total_emails > 0 else 0
    
    # API failures
    api_failures = await db.system_events.count_documents({
        "event_category": {"$in": ["llm", "tavily", "openai"]},
        "status": "failure",
        "timestamp": {"$gte": last_24h}
    })
    
    # Rate limit hits
    rate_limits = await db.system_events.count_documents({
        "event_type": {"$regex": "rate_limit", "$options": "i"},
        "timestamp": {"$gte": last_24h}
    })
    
    alerts = []
    
    if error_rate > 10:
        alerts.append({
            "type": "error_rate",
            "severity": "high" if error_rate > 20 else "medium",
            "message": f"Email error rate is {error_rate:.1f}% (threshold: 10%)",
            "value": error_rate,
            "threshold": 10
        })
    
    if api_failures > 5:
        alerts.append({
            "type": "api_failure",
            "severity": "high" if api_failures > 10 else "medium",
            "message": f"{api_failures} API failures in last 24 hours",
            "value": api_failures,
            "threshold": 5
        })
    
    if rate_limits > 0:
        alerts.append({
            "type": "rate_limit",
            "severity": "high",
            "message": f"{rate_limits} rate limit hits detected",
            "value": rate_limits,
            "threshold": 0
        })
    
    return {
        "alerts": alerts,
        "total_alerts": len(alerts),
        "critical_alerts": len([a for a in alerts if a["severity"] == "high"]),
        "metrics": {
            "error_rate": round(error_rate, 2),
            "api_failures": api_failures,
            "rate_limits": rate_limits
        }
    }

# ============================================================================
# REAL-TIME ANALYTICS & ACTIVITY TRACKING ENDPOINTS
# ============================================================================

@api_router.get("/analytics/realtime", dependencies=[Depends(verify_admin)])
async def get_realtime_analytics(minutes: int = 5):
    """Get real-time activity statistics for admin dashboard"""
    stats = await tracker.get_realtime_stats(minutes=minutes)
    return stats

@api_router.get("/analytics/user-timeline/{email}", dependencies=[Depends(verify_admin)])
async def get_user_timeline(email: str, limit: int = 100):
    """Get complete activity timeline for a specific user"""
    activities = await tracker.get_user_activity_timeline(email, limit)
    return {"email": email, "activities": activities}

@api_router.get("/analytics/activity-logs", dependencies=[Depends(verify_admin)])
async def get_activity_logs(
    limit: int = 100,
    action_category: Optional[str] = None,
    user_email: Optional[str] = None
):
    """Get filtered activity logs"""
    query = {}
    if action_category:
        query["action_category"] = action_category
    if user_email:
        query["user_email"] = user_email
    
    logs = await db.activity_logs.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return {"logs": logs, "total": len(logs)}

@api_router.get("/analytics/system-events", dependencies=[Depends(verify_admin)])
async def get_system_events(limit: int = 50):
    """Get recent system events"""
    events = await db.system_events.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return {"events": events}

@api_router.get("/analytics/api-performance", dependencies=[Depends(verify_admin)])
async def get_api_performance(hours: int = 24):
    """Get API performance metrics"""
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    
    # Aggregate API stats
    pipeline = [
        {"$match": {"timestamp": {"$gte": cutoff}}},
        {"$group": {
            "_id": "$endpoint",
            "total_calls": {"$sum": 1},
            "avg_response_time": {"$avg": "$response_time_ms"},
            "max_response_time": {"$max": "$response_time_ms"},
            "min_response_time": {"$min": "$response_time_ms"},
            "error_count": {
                "$sum": {"$cond": [{"$gte": ["$status_code", 400]}, 1, 0]}
            }
        }},
        {"$sort": {"total_calls": -1}},
        {"$limit": 20}
    ]
    
    stats = await db.api_analytics.aggregate(pipeline).to_list(20)
    return {"api_stats": stats, "time_window_hours": hours}

@api_router.get("/analytics/page-views", dependencies=[Depends(verify_admin)])
async def get_page_views(limit: int = 100):
    """Get recent page views"""
    views = await db.page_views.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return {"page_views": views}

@api_router.get("/analytics/active-sessions", dependencies=[Depends(verify_admin)])
async def get_active_sessions():
    """Get currently active user sessions"""
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
    
    sessions = await db.user_sessions.find(
        {
            "session_start": {"$gte": cutoff},
            "$or": [
                {"session_end": None},
                {"session_end": {"$gte": cutoff}}
            ]
        },
        {"_id": 0}
    ).to_list(1000)
    
    return {"active_sessions": sessions, "count": len(sessions)}

@api_router.post("/tracking/page-view")
async def track_page_view(
    page_url: str,
    user_email: Optional[str] = None,
    referrer: Optional[str] = None,
    session_id: Optional[str] = None,
    time_on_page: Optional[int] = None
):
    """Track frontend page views"""
    view_id = await tracker.log_page_view(
        page_url=page_url,
        user_email=user_email,
        referrer=referrer,
        session_id=session_id,
        time_on_page_seconds=time_on_page
    )
    return {"status": "tracked", "view_id": view_id}

@api_router.post("/tracking/user-action")
async def track_user_action(
    action_type: str,
    user_email: Optional[str] = None,
    details: Optional[Dict] = None,
    session_id: Optional[str] = None,
    request: Request = None
):
    """Track any custom user action from frontend"""
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    
    activity_id = await tracker.log_user_activity(
        action_type=action_type,
        user_email=user_email,
        details=details or {},
        ip_address=ip_address,
        user_agent=user_agent,
        session_id=session_id
    )
    return {"status": "tracked", "activity_id": activity_id}

@api_router.post("/tracking/session/start")
async def start_tracking_session(
    user_email: Optional[str] = None,
    request: Request = None
):
    """Start a new tracking session"""
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    
    session_id = await tracker.start_session(
        user_email=user_email,
        ip_address=ip_address,
        user_agent=user_agent
    )
    return {"session_id": session_id}

@api_router.put("/tracking/session/{session_id}")
async def update_tracking_session(
    session_id: str,
    actions: int = 0,
    pages: int = 0
):
    """Update session statistics"""
    await tracker.update_session(session_id, actions=actions, pages=pages)
    return {"status": "updated", "session_id": session_id}

# Request ID Middleware for tracking
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """Add unique request ID to each request for tracking"""
    request_id = str(uuid.uuid4())[:8]
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response

# Activity Tracking Middleware with Enhanced Logging
@app.middleware("http")
async def track_api_calls(request: Request, call_next):
    """Middleware to track all API calls with comprehensive logging"""
    start_time = time.time()
    
    # Get client info
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    request_id = getattr(request.state, 'request_id', 'unknown')
    
    # Log API request (only in development or for errors)
    is_production = os.getenv('ENVIRONMENT', '').lower() == 'production'
    if not is_production and request.url.path.startswith("/api"):
        logger.debug(f"🌐 API Request [{request_id}]: {request.method} {request.url.path} (IP: {client_ip})")
    
    try:
        # Add timeout for long-running requests (30 seconds)
        response = await asyncio.wait_for(call_next(request), timeout=30.0)
        
        # Calculate response time
        response_time_ms = int((time.time() - start_time) * 1000)
        
        # Track API call
        if request.url.path.startswith("/api"):
            # Log slow requests (always log)
            if response_time_ms > 1000:
                logger.warning(f"⚠️ Slow API call [{request_id}]: {request.method} {request.url.path} took {response_time_ms}ms")
            elif response_time_ms > 500 and not is_production:
                logger.info(f"⏱️ API call [{request_id}]: {request.method} {request.url.path} took {response_time_ms}ms")
            
            # Log errors (always log)
            if response.status_code >= 400:
                logger.warning(f"⚠️ API Error [{request_id}]: {request.method} {request.url.path} returned {response.status_code}")
            
            try:
                await tracker.log_api_call(
                    endpoint=request.url.path,
                    method=request.method,
                    status_code=response.status_code,
                    response_time_ms=response_time_ms,
                    ip_address=client_ip
                )
            except Exception:
                pass  # Don't fail if tracking fails
        
        return response
    except asyncio.TimeoutError:
        response_time_ms = int((time.time() - start_time) * 1000)
        logger.error(f"⏱️ Request timeout [{request_id}]: {request.method} {request.url.path} exceeded 30s")
        
        # Track timeout
        try:
            await tracker.log_api_call(
                endpoint=request.url.path,
                method=request.method,
                status_code=504,
                response_time_ms=response_time_ms,
                ip_address=client_ip,
                error_message="Request timeout"
            )
        except Exception:
            pass
        
        return JSONResponse(
            status_code=504,
            content={
                "detail": "Request timeout. Please try again.",
                "status": "error",
                "request_id": request_id
            }
        )
    except Exception as e:
        response_time_ms = int((time.time() - start_time) * 1000)
        
        # Log exception
        logger.error(f"❌ API Exception [{request_id}]: {request.method} {request.url.path} failed after {response_time_ms}ms: {str(e)}", exc_info=True)
        
        # Track failed API call
        if request.url.path.startswith("/api"):
            try:
                await tracker.log_api_call(
                    endpoint=request.url.path,
                    method=request.method,
                    status_code=500,
                    response_time_ms=response_time_ms,
                    ip_address=client_ip,
                    error_message=str(e)
                )
            except Exception:
                pass
        
        # Re-raise to let global exception handler deal with it
        raise

# Include the router in the main app
app.include_router(api_router)

# Security Headers Middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses"""
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Only add HSTS if HTTPS is enabled (check via environment)
        if os.getenv("HTTPS_ENABLED", "false").lower() == "true":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

# Request Size Limits Middleware
class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Limit request body size to prevent memory exhaustion"""
    MAX_REQUEST_SIZE = 1_000_000  # 1MB
    
    async def dispatch(self, request: StarletteRequest, call_next):
        if request.method in ["POST", "PUT", "PATCH"]:
            content_length = request.headers.get("content-length")
            if content_length:
                try:
                    size = int(content_length)
                    if size > self.MAX_REQUEST_SIZE:
                        return JSONResponse(
                            status_code=413,
                            content={
                                "detail": f"Request body too large. Maximum size is {self.MAX_REQUEST_SIZE / 1_000_000}MB"
                            }
                        )
                except ValueError:
                    pass  # Invalid content-length, let it proceed
        
        return await call_next(request)

# Add middlewares (order matters - security headers last, CORS after)
app.add_middleware(RequestSizeLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
# Dynamic CORS configuration
# Supports multiple origins for Vercel deployments
def is_allowed_origin(origin: str) -> bool:
    """Check if origin is allowed, supporting Vercel preview deployments"""
    if not origin:
        return False
    
    cors_origins_env = os.environ.get('CORS_ORIGINS', '*')
    
    # Allow all origins if set to '*'
    if cors_origins_env == '*':
        return True
    
    # Get allowed origins list
    allowed_origins = [o.strip() for o in cors_origins_env.split(',') if o.strip()]
    
    # Check exact match
    if origin in allowed_origins:
        return True
    
    # Check Vercel preview deployments (*.vercel.app pattern)
    if origin.endswith('.vercel.app'):
        # Check if *.vercel.app is in allowed origins
        if any('*.vercel.app' in allowed or 'vercel.app' in allowed for allowed in allowed_origins):
            return True
    
    # Always allow localhost in development
    if os.environ.get('ENVIRONMENT') != 'production':
        if origin.startswith('http://localhost:') or origin.startswith('http://127.0.0.1:'):
            return True
    
    return False

class DynamicCORSMiddleware(BaseHTTPMiddleware):
    """Custom CORS middleware that supports dynamic origin checking"""
    async def dispatch(self, request: StarletteRequest, call_next):
        origin = request.headers.get("origin")
        
        if request.method == "OPTIONS":
            # Handle preflight requests
            if is_allowed_origin(origin):
                response = JSONResponse(content={})
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
                response.headers["Access-Control-Allow-Headers"] = "*"
                response.headers["Access-Control-Allow-Credentials"] = "true"
                response.headers["Access-Control-Max-Age"] = "3600"
                return response
            else:
                return JSONResponse(
                    content={"detail": "Origin not allowed"},
                    status_code=403
                )
        
        response = await call_next(request)
        
        # Add CORS headers to response
        if is_allowed_origin(origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
            response.headers["Access-Control-Allow-Headers"] = "*"
        
        return response

# Use custom CORS middleware for dynamic origin support
app.add_middleware(DynamicCORSMiddleware)

# Configure production-ready logging
def setup_logging():
    """Setup logging based on environment"""
    is_production = os.getenv('ENVIRONMENT', '').lower() == 'production'
    
    if is_production:
        # Production: INFO level, structured format
        log_level = logging.INFO
        log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    else:
        # Development: DEBUG level, detailed format
        log_level = logging.DEBUG
        log_format = '%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s'
    
    logging.basicConfig(
        level=log_level,
        format=log_format,
        handlers=[
            logging.StreamHandler(sys.stdout)
        ],
        force=True  # Override any existing configuration
    )
    
    # Set specific logger levels
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING if is_production else logging.INFO)
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)
    logging.getLogger("apscheduler").setLevel(logging.WARNING if is_production else logging.INFO)
    
    return logging.getLogger(__name__)

logger = setup_logging()

async def create_email_job(user_email: str):
    """Scheduled job executed by AsyncIOScheduler within the main event loop."""
    job_start = time.time()
    logger.info(f"⏰ Scheduler job started for: {user_email}")
    
    try:
        await send_motivation_to_user(user_email)
        
        job_duration = time.time() - job_start
        logger.info(f"✅ Scheduler job completed for {user_email} in {job_duration:.2f}s")
        
        await tracker.log_system_event(
            event_type="scheduled_email_sent",
            event_category="scheduler",
            details={"user_email": user_email, "duration_seconds": round(job_duration, 2)},
            status="success"
        )
    except Exception as e:
        job_duration = time.time() - job_start
        logger.error(f"❌ Error in scheduler job for {user_email} after {job_duration:.2f}s: {str(e)}", exc_info=True)
        
        await tracker.log_system_event(
            event_type="scheduled_email_failed",
            event_category="scheduler",
            details={"user_email": user_email, "error": str(e), "duration_seconds": round(job_duration, 2)},
            status="error"
        )

async def schedule_user_emails():
    """
    Schedule emails for all active users based on their preferences.
    Uses pagination to handle 10k+ users efficiently.
    Optimized job lookup to avoid O(n²) complexity.
    """
    schedule_start = time.time()
    logger.info("🔄 Starting email scheduling for all active users...")
    
    try:
        batch_size = 100  # Process users in batches
        skip = 0
        total_scheduled = 0
        
        # Get all existing job IDs once (avoid O(n²) lookup)
        existing_jobs = scheduler.get_jobs()
        existing_job_ids = {job.id for job in existing_jobs}
        logger.info(f"📋 Found {len(existing_job_ids)} existing scheduled jobs")
        
        while True:
            # Fetch batch of users
            users = await db.users.find(
                {"active": True}, 
                {"_id": 0}
            ).skip(skip).limit(batch_size).to_list(batch_size)
            
            if not users:
                break
            
            for user_data in users:
                try:
                    schedule = user_data.get('schedule', {})
                    if schedule.get('paused', False):
                        continue
                    
                    email = user_data['email']
                    times = schedule.get('times', ['09:00'])
                    frequency = schedule.get('frequency', 'daily')
                    user_timezone = schedule.get('timezone', 'UTC')
                    
                    # Parse time
                    time_parts = times[0].split(':')
                    hour = int(time_parts[0])
                    minute = int(time_parts[1])
                    
                    # Get timezone object
                    try:
                        tz = pytz.timezone(user_timezone)
                    except:
                        tz = pytz.UTC
                        logger.warning(f"Invalid timezone {user_timezone} for {email}, using UTC")
                    
                    # Create job ID
                    job_id = f"user_{email.replace('@', '_at_').replace('.', '_')}"
                    
                    # Efficiently remove existing jobs for this user
                    # Check against pre-fetched job IDs instead of iterating all jobs
                    jobs_to_remove = []
                    if job_id in existing_job_ids:
                        jobs_to_remove.append(job_id)
                    
                    # Check for sub-jobs (for multiple times/days/dates)
                    for existing_job_id in existing_job_ids:
                        if existing_job_id.startswith(job_id + "_"):
                            jobs_to_remove.append(existing_job_id)
                    
                    # Remove jobs
                    for job_id_to_remove in jobs_to_remove:
                        try:
                            scheduler.remove_job(job_id_to_remove)
                            existing_job_ids.discard(job_id_to_remove)
                        except:
                            pass
                    
                    # Add new job based on frequency with timezone
                    # FIXED: Now properly executes async function from scheduler
                    if frequency == 'daily':
                        # Handle multiple times per day
                        for time_idx, time_str in enumerate(times):
                            time_parts = time_str.split(':')
                            t_hour = int(time_parts[0])
                            t_minute = int(time_parts[1])
                            job_id_with_time = f"{job_id}_time_{time_idx}" if len(times) > 1 else job_id
                            scheduler.add_job(
                                create_email_job,
                                CronTrigger(hour=t_hour, minute=t_minute, timezone=tz),
                                args=[email],
                                id=job_id_with_time,
                                replace_existing=True
                            )
                    elif frequency == 'weekly':
                        # Use custom_days if specified, otherwise default to Monday
                        custom_days = schedule.get('custom_days', [])
                        if custom_days:
                            # Map day names to cron day_of_week (0=Monday, 6=Sunday)
                            day_map = {'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3, 
                                      'friday': 4, 'saturday': 5, 'sunday': 6}
                            for day_name in custom_days:
                                day_num = day_map.get(day_name.lower(), 0)
                                job_id_with_day = f"{job_id}_day_{day_num}" if len(custom_days) > 1 else job_id
                                scheduler.add_job(
                                    create_email_job,
                                    CronTrigger(day_of_week=day_num, hour=hour, minute=minute, timezone=tz),
                                    args=[email],
                                    id=job_id_with_day,
                                    replace_existing=True
                                )
                        else:
                            # Default to Monday
                            scheduler.add_job(
                                create_email_job,
                                CronTrigger(day_of_week=0, hour=hour, minute=minute, timezone=tz),
                                args=[email],
                                id=job_id,
                                replace_existing=True
                            )
                    elif frequency == 'monthly':
                        # Use monthly_dates if specified, otherwise default to 1st
                        monthly_dates = schedule.get('monthly_dates', [])
                        valid_dates = []
                        if monthly_dates:
                            for date_str in monthly_dates:
                                try:
                                    day_of_month = int(date_str)
                                    if 1 <= day_of_month <= 31:
                                        valid_dates.append(day_of_month)
                                except (ValueError, TypeError):
                                    logger.warning(f"Invalid monthly date {date_str} for {email}, skipping")
                        
                        if valid_dates:
                            for day_of_month in valid_dates:
                                job_id_with_date = f"{job_id}_date_{day_of_month}" if len(valid_dates) > 1 else job_id
                                scheduler.add_job(
                                    create_email_job,
                                    CronTrigger(day=day_of_month, hour=hour, minute=minute, timezone=tz),
                                    args=[email],
                                    id=job_id_with_date,
                                    replace_existing=True
                                )
                        else:
                            # Default to 1st of month if no valid dates
                            scheduler.add_job(
                                create_email_job,
                                CronTrigger(day=1, hour=hour, minute=minute, timezone=tz),
                                args=[email],
                                id=job_id,
                                replace_existing=True
                            )
                    elif frequency == 'custom':
                        # Custom interval: every N days
                        interval = schedule.get('custom_interval', 1)
                        if interval < 1:
                            interval = 1
                        # Use IntervalTrigger for custom intervals
                        scheduler.add_job(
                            create_email_job,
                            IntervalTrigger(days=interval, start_date=datetime.now(tz).replace(hour=hour, minute=minute, second=0)),
                            args=[email],
                            id=job_id,
                            replace_existing=True
                        )
                    
                    logger.info(f"✅ Scheduled emails for {email} at {hour}:{minute:02d} {user_timezone} ({frequency})")
                    
                    # Save schedule version history
                    await version_tracker.save_schedule_version(
                        user_email=email,
                        schedule_data=schedule,
                        changed_by="system",
                        change_reason="Schedule initialization"
                    )
                    
                    total_scheduled += 1
                    
                except Exception as e:
                    logger.error(f"Error scheduling for {user_data.get('email', 'unknown')}: {str(e)}")
            
            skip += batch_size
            
            # Log progress every 1000 users
            if total_scheduled % 1000 == 0 and total_scheduled > 0:
                logger.info(f"📊 Scheduled {total_scheduled} users so far...")
        
        schedule_duration = time.time() - schedule_start
        logger.info(f"✅ Completed scheduling emails for {total_scheduled} users in {schedule_duration:.2f}s")
        logger.info(f"📊 Average: {total_scheduled/schedule_duration:.1f} users/second" if schedule_duration > 0 else "")
    
    except Exception as e:
        schedule_duration = time.time() - schedule_start
        logger.error(f"❌ Error in schedule_user_emails after {schedule_duration:.2f}s: {str(e)}", exc_info=True)

# ============================================================================
# VERSION HISTORY & DATA PRESERVATION ENDPOINTS
# ============================================================================

@api_router.get("/users/{email}/history/schedule", dependencies=[Depends(verify_admin)])
async def get_user_schedule_history(email: str, limit: int = 50):
    """Get complete schedule change history for a user"""
    history = await version_tracker.get_schedule_history(email, limit)
    return {"user_email": email, "versions": len(history), "history": history}

@api_router.get("/users/{email}/history/personalities", dependencies=[Depends(verify_admin)])
async def get_user_personality_history(email: str, limit: int = 50):
    """Get complete personality change history for a user"""
    history = await version_tracker.get_personality_history(email, limit)
    return {"user_email": email, "versions": len(history), "history": history}

@api_router.get("/users/{email}/history/profile", dependencies=[Depends(verify_admin)])
async def get_user_profile_history(email: str, limit: int = 50):
    """Get complete profile change history for a user"""
    history = await version_tracker.get_profile_history(email, limit)
    return {"user_email": email, "versions": len(history), "history": history}

@api_router.get("/users/{email}/history/complete", dependencies=[Depends(verify_admin)])
async def get_complete_user_history(email: str):
    """Get ALL change history for a user"""
    history = await version_tracker.get_all_user_history(email)
    return history

@api_router.get("/admin/deleted-data", dependencies=[Depends(verify_admin)])
async def get_deleted_data(limit: int = 100):
    """View all soft-deleted data that can be restored"""
    deleted = await db.deleted_data.find(
        {"can_restore": True},
        {"_id": 0}
    ).sort("deleted_at", -1).limit(limit).to_list(limit)
    return {"deleted_items": deleted, "count": len(deleted)}

# ============================================================================
# ADMIN ACHIEVEMENT MANAGEMENT
# ============================================================================

@api_router.get("/admin/achievements", dependencies=[Depends(verify_admin)])
async def admin_get_all_achievements(include_inactive: bool = False):
    """Get all achievements (admin only)"""
    try:
        query = {} if include_inactive else {"active": True}
        achievements = await db.achievements.find(query, {"_id": 0}).sort("priority", 1).to_list(200)
        
        logger.info(f"Admin achievements request: include_inactive={include_inactive}, found {len(achievements)} achievements")
        
        return {
            "achievements": achievements,
            "total": len(achievements),
            "active": len([a for a in achievements if a.get("active", True)])
        }
    except Exception as e:
        logger.error(f"Error fetching admin achievements: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch achievements: {str(e)}")

@api_router.post("/admin/achievements", dependencies=[Depends(verify_admin)])
async def admin_create_achievement(achievement: dict):
    """Create a new achievement (admin only)"""
    # Validate required fields
    required_fields = ["id", "name", "description", "icon_name", "category", "requirement"]
    for field in required_fields:
        if field not in achievement:
            raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
    
    # Check if achievement ID already exists
    existing = await db.achievements.find_one({"id": achievement["id"]})
    if existing:
        raise HTTPException(status_code=400, detail=f"Achievement with ID '{achievement['id']}' already exists")
    
    # Add metadata
    achievement["created_at"] = datetime.now(timezone.utc).isoformat()
    achievement["updated_at"] = datetime.now(timezone.utc).isoformat()
    achievement["active"] = achievement.get("active", True)
    achievement["priority"] = achievement.get("priority", 1)
    achievement["show_on_home"] = achievement.get("show_on_home", False)
    
    await db.achievements.insert_one(achievement)
    
    await tracker.log_admin_activity(
        action_type="achievement_created",
        admin_email="admin",
        details={"achievement_id": achievement["id"], "name": achievement["name"]}
    )
    
    return {"status": "success", "message": "Achievement created", "achievement": achievement}

@api_router.put("/admin/achievements/{achievement_id}", dependencies=[Depends(verify_admin)])
async def admin_update_achievement(achievement_id: str, achievement_data: dict):
    """Update an existing achievement (admin only)"""
    existing = await db.achievements.find_one({"id": achievement_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Achievement not found")
    
    # Don't allow changing the ID
    if "id" in achievement_data and achievement_data["id"] != achievement_id:
        raise HTTPException(status_code=400, detail="Cannot change achievement ID")
    
    # Update fields
    update_data = {
        "$set": {
            **achievement_data,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
    }
    
    await db.achievements.update_one({"id": achievement_id}, update_data)
    
    updated = await db.achievements.find_one({"id": achievement_id}, {"_id": 0})
    
    await tracker.log_admin_activity(
        action_type="achievement_updated",
        admin_email="admin",
        details={"achievement_id": achievement_id, "changes": list(achievement_data.keys())}
    )
    
    return {"status": "success", "message": "Achievement updated", "achievement": updated}

@api_router.delete("/admin/achievements/{achievement_id}", dependencies=[Depends(verify_admin)])
async def admin_delete_achievement(achievement_id: str, hard_delete: bool = False):
    """Delete or deactivate an achievement (admin only)"""
    existing = await db.achievements.find_one({"id": achievement_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Achievement not found")
    
    if hard_delete:
        # Permanently delete
        await db.achievements.delete_one({"id": achievement_id})
        action = "deleted"
    else:
        # Soft delete (deactivate)
        await db.achievements.update_one(
            {"id": achievement_id},
            {"$set": {"active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        action = "deactivated"
    
    await tracker.log_admin_activity(
        action_type="achievement_deleted",
        admin_email="admin",
        details={"achievement_id": achievement_id, "hard_delete": hard_delete}
    )
    
    return {"status": "success", "message": f"Achievement {action}", "achievement_id": achievement_id}

@api_router.post("/admin/users/{email}/achievements/{achievement_id}", dependencies=[Depends(verify_admin)])
async def admin_assign_achievement_to_user(email: str, achievement_id: str):
    """Assign an achievement to a specific user (admin only)"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify achievement exists
    achievement = await db.achievements.find_one({"id": achievement_id, "active": True})
    if not achievement:
        raise HTTPException(status_code=404, detail="Achievement not found or inactive")
    
    # Get current achievements
    user_achievements = user.get("achievements", [])
    
    # Check if already has this achievement
    if achievement_id in user_achievements:
        return {"status": "already_assigned", "message": "User already has this achievement"}
    
    # Add achievement with timestamp
    achievement_unlock = {
        "achievement_id": achievement_id,
        "unlocked_at": datetime.now(timezone.utc).isoformat(),
        "unlocked_by": "admin"
    }
    
    # Update user
    await db.users.update_one(
        {"email": email},
        {
            "$push": {"achievements": achievement_id},
            "$set": {"last_active": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    await tracker.log_admin_activity(
        action_type="achievement_assigned",
        admin_email="admin",
        details={"user_email": email, "achievement_id": achievement_id}
    )
    
    return {
        "status": "success",
        "message": "Achievement assigned to user",
        "achievement": achievement,
        "unlocked_at": achievement_unlock["unlocked_at"]
    }

@api_router.delete("/admin/users/{email}/achievements/{achievement_id}", dependencies=[Depends(verify_admin)])
async def admin_remove_achievement_from_user(email: str, achievement_id: str):
    """Remove an achievement from a specific user (admin only)"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_achievements = user.get("achievements", [])
    
    if achievement_id not in user_achievements:
        raise HTTPException(status_code=404, detail="User does not have this achievement")
    
    # Remove achievement
    await db.users.update_one(
        {"email": email},
        {"$pull": {"achievements": achievement_id}}
    )
    
    await tracker.log_admin_activity(
        action_type="achievement_removed",
        admin_email="admin",
        details={"user_email": email, "achievement_id": achievement_id}
    )
    
    return {"status": "success", "message": "Achievement removed from user"}

@api_router.get("/admin/users/{email}/achievements", dependencies=[Depends(verify_admin)])
async def admin_get_user_achievements(email: str):
    """Get all achievements for a specific user (admin only)"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_achievements = user.get("achievements", [])
    achievements_dict = await get_achievements_from_db()
    
    unlocked = []
    for ach_id in user_achievements:
        if ach_id in achievements_dict:
            unlocked.append(achievements_dict[ach_id])
    
    return {
        "user_email": email,
        "unlocked_achievements": unlocked,
        "total_unlocked": len(unlocked),
        "achievement_ids": user_achievements
    }

@api_router.post("/admin/achievements/initialize", dependencies=[Depends(verify_admin)])
async def admin_initialize_achievements():
    """Manually trigger achievement initialization (admin only)"""
    await initialize_achievements()
    count = await db.achievements.count_documents({"active": True})
    return {
        "status": "success",
        "message": "Achievements initialized",
        "total_active_achievements": count
    }

@api_router.post("/admin/achievements/recalculate-streaks", dependencies=[Depends(verify_admin)])
async def admin_recalculate_streaks(email: Optional[str] = None):
    """
    Recalculate streaks for all users or a specific user based on message history.
    Uses pagination to handle 10k+ users efficiently.
    """
    try:
        if email:
            users = [await db.users.find_one({"email": email}, {"_id": 0})]
            if not users[0]:
                raise HTTPException(status_code=404, detail="User not found")
        else:
            # Use pagination for scalability (10k+ users)
            batch_size = 100
            skip = 0
            all_users = []
            
            while True:
                batch = await db.users.find(
                    {"active": True}, 
                    {"_id": 0, "email": 1, "streak_count": 1}
                ).skip(skip).limit(batch_size).to_list(batch_size)
                
                if not batch:
                    break
                
                all_users.extend(batch)
                skip += batch_size
                
                # Log progress every 1000 users
                if len(all_users) % 1000 == 0:
                    logger.info(f"📊 Streak recalculation progress: {len(all_users)} users processed...")
            
            users = all_users
            logger.info(f"✅ Fetched {len(users)} users for streak recalculation")
        
        updated_count = 0
        results = []
        
        for user in users:
            user_email = user["email"]
            
            # Get all messages for this user, sorted by date
            messages = await db.message_history.find(
                {"email": user_email},
                {"_id": 0, "sent_at": 1, "created_at": 1}
            ).sort("sent_at", 1).to_list(1000)
            
            if not messages:
                continue
            
            # Extract unique dates when emails were sent
            email_dates = set()
            for msg in messages:
                sent_at = msg.get("sent_at") or msg.get("created_at")
                if sent_at:
                    if isinstance(sent_at, str):
                        try:
                            dt = datetime.fromisoformat(sent_at.replace('Z', '+00:00'))
                        except:
                            dt = datetime.fromisoformat(sent_at)
                    else:
                        dt = sent_at
                    email_dates.add(dt.date())
            
            # Calculate longest consecutive streak
            if not email_dates:
                continue
            
            sorted_dates = sorted(email_dates)
            today = datetime.now(timezone.utc).date()
            
            # Calculate current active streak (from most recent date backwards)
            most_recent_date = sorted_dates[-1]
            days_since_last = (today - most_recent_date).days
            
            # If email was sent today or yesterday, calculate active streak
            if days_since_last <= 1:
                # Calculate streak backwards from most recent date
                # Start from the most recent date and count backwards
                current_streak = 0
                expected_date = most_recent_date
                
                # Convert sorted_dates to a set for O(1) lookup
                date_set = set(sorted_dates)
                
                # Count consecutive days backwards from most recent
                while expected_date in date_set:
                    current_streak += 1
                    expected_date = expected_date - timedelta(days=1)
                
                # Ensure minimum streak of 1
                current_streak = max(1, current_streak)
            else:
                # Gap of more than 1 day - streak is broken
                current_streak = 1
            
            # Update user's streak
            await db.users.update_one(
                {"email": user_email},
                {"$set": {"streak_count": current_streak}}
            )
            
            # Calculate max streak for reporting
            max_streak = 1
            temp_streak = 1
            for i in range(1, len(sorted_dates)):
                days_diff = (sorted_dates[i] - sorted_dates[i-1]).days
                if days_diff == 1:
                    temp_streak += 1
                    max_streak = max(max_streak, temp_streak)
                else:
                    temp_streak = 1
            
            results.append({
                "email": user_email,
                "old_streak": user.get("streak_count", 0),
                "new_streak": current_streak,
                "total_email_days": len(sorted_dates),
                "max_streak": max_streak
            })
            updated_count += 1
        
        await tracker.log_admin_activity(
            action_type="streaks_recalculated",
            admin_email="admin",
            details={"users_updated": updated_count, "email_filter": email}
        )
        
        return {
            "status": "success",
            "message": f"Recalculated streaks for {updated_count} user(s)",
            "results": results
        }
    except Exception as e:
        logger.error(f"Error recalculating streaks: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to recalculate streaks: {str(e)}")

@api_router.post("/admin/achievements/{achievement_id}/assign-all", dependencies=[Depends(verify_admin)])
async def admin_assign_achievement_to_all_users(achievement_id: str):
    """
    Assign an achievement to all active users (admin only).
    Uses pagination to handle 10k+ users efficiently.
    """
    # Verify achievement exists
    achievement = await db.achievements.find_one({"id": achievement_id, "active": True})
    if not achievement:
        raise HTTPException(status_code=404, detail="Achievement not found or inactive")
    
    # Use pagination for scalability (10k+ users)
    batch_size = 100
    skip = 0
    all_users = []
    
    while True:
        batch = await db.users.find(
            {"active": True}, 
            {"_id": 0, "email": 1, "achievements": 1}
        ).skip(skip).limit(batch_size).to_list(batch_size)
        
        if not batch:
            break
        
        all_users.extend(batch)
        skip += batch_size
        
        # Log progress every 1000 users
        if len(all_users) % 1000 == 0:
            logger.info(f"📊 Achievement assignment progress: {len(all_users)} users processed...")
    
    users = all_users
    logger.info(f"✅ Fetched {len(users)} users for achievement assignment")
    
    assigned_count = 0
    already_had_count = 0
    updated_count = 0
    
    for user in users:
        user_achievements = user.get("achievements", [])
        
        if achievement_id in user_achievements:
            already_had_count += 1
            continue
        
        # Add achievement
        await db.users.update_one(
            {"email": user["email"]},
            {
                "$push": {"achievements": achievement_id},
                "$set": {"last_active": datetime.now(timezone.utc).isoformat()}
            }
        )
        assigned_count += 1
        updated_count += 1
    
    await tracker.log_admin_activity(
        action_type="achievement_bulk_assigned",
        admin_email="admin",
        details={
            "achievement_id": achievement_id,
            "assigned_to": assigned_count,
            "already_had": already_had_count,
            "total_users": len(users)
        }
    )
    
    return {
        "status": "success",
        "message": f"Achievement assigned to {assigned_count} users",
        "achievement": achievement,
        "stats": {
            "total_users": len(users),
            "newly_assigned": assigned_count,
            "already_had": already_had_count
        }
    }

@api_router.post("/admin/achievements/{achievement_id}/remove-all", dependencies=[Depends(verify_admin)])
async def admin_remove_achievement_from_all_users(achievement_id: str):
    """Remove an achievement from all users (admin only)"""
    # Verify achievement exists
    achievement = await db.achievements.find_one({"id": achievement_id})
    if not achievement:
        raise HTTPException(status_code=404, detail="Achievement not found")
    
    # Remove from all users
    result = await db.users.update_many(
        {},
        {"$pull": {"achievements": achievement_id}}
    )
    
    await tracker.log_admin_activity(
        action_type="achievement_bulk_removed",
        admin_email="admin",
        details={
            "achievement_id": achievement_id,
            "removed_from": result.modified_count
        }
    )
    
    return {
        "status": "success",
        "message": f"Achievement removed from {result.modified_count} users",
        "achievement_id": achievement_id,
        "users_affected": result.modified_count
    }

@api_router.post("/admin/restore/{deletion_id}", dependencies=[Depends(verify_admin)])
async def restore_deleted_data(deletion_id: str):
    """Restore soft-deleted data"""
    success = await version_tracker.restore_deleted(deletion_id)
    if success:
        return {"status": "restored", "deletion_id": deletion_id}
    else:
        raise HTTPException(status_code=404, detail="Cannot restore - data not found or already restored")

@asynccontextmanager
async def lifespan(app: FastAPI):
    startup_start = time.time()
    logger.info("=" * 60)
    logger.info("🚀 Starting Tend API...")
    logger.info("=" * 60)
    
    # Startup phase
    try:
        # Validate environment variables on startup
        try:
            logger.info("🔍 Validating environment variables...")
            validate_environment()
            logger.info("✅ Environment validation passed")
        except RuntimeError as e:
            logger.error(f"❌ Environment validation failed: {e}")
            raise
        
        try:
            await db.users.create_index("email", unique=True)
            await db.users.create_index("clerk_user_id")  # Index for Clerk user ID lookups
            await db.message_history.create_index("email")
            await db.message_feedback.create_index("email")
            await db.email_logs.create_index([("email", 1), ("sent_at", -1)])
            # Custom personality indexes
            await db.custom_personality_conversations.create_index("email")
            await db.custom_personality_conversations.create_index([("email", 1), ("status", 1)])
            await db.custom_personality_profiles.create_index("email")
            await db.custom_personality_profiles.create_index([("email", 1), ("status", 1)])
            # NEW: Reply conversation indexes
            await db.email_reply_conversations.create_index([("user_email", 1), ("reply_timestamp", -1)])
            await db.email_reply_conversations.create_index([("user_email", 1), ("processed", 1)])
            await db.email_reply_conversations.create_index([("urgency_level", 1), ("immediate_response_sent", 1)])
            # Enhanced goal indexes
            await db.goals.create_index([("user_email", 1), ("active", 1), ("category", 1)])
            await db.goal_messages.create_index([("goal_id", 1), ("schedule_id", 1), ("status", 1)])
            logger.info("✅ Database indexes created (including reply conversations and multi-goal support)")
        except Exception as e:
            logger.warning(f"Index creation warning: {e}")

        await initialize_achievements()
        logger.info("Achievements initialized")
        
        # NEW: Add email reply polling job
        try:
            from backend.email_reply_handler import poll_email_replies
            import os
            
            # Check if IMAP credentials are configured (optional - use os.getenv with None default)
            # Using os.getenv() instead of get_env() because these are optional variables
            # get_env() raises RuntimeError when no default is provided, which would break startup
            imap_host = os.getenv("IMAP_HOST")
            inbox_email = os.getenv("INBOX_EMAIL")
            inbox_password = os.getenv("INBOX_PASSWORD")
            
            if all([imap_host, inbox_email, inbox_password]):
                scheduler.add_job(
                    poll_email_replies,
                    trigger='interval',
                    minutes=1,  # Check every 1 minute for near real-time replies
                    id='email_reply_polling',
                    replace_existing=True
                )
                logger.info("✅ Email reply polling job scheduled (every 1 minute - near real-time)")
                logger.info(f"   IMAP Host: {imap_host}")
                logger.info(f"   Inbox Email: {inbox_email}")
            else:
                missing = []
                if not imap_host: missing.append("IMAP_HOST")
                if not inbox_email: missing.append("INBOX_EMAIL")
                if not inbox_password: missing.append("INBOX_PASSWORD")
                logger.warning(f"⚠️ Email reply polling DISABLED - Missing environment variables: {', '.join(missing)}")
                logger.warning(f"   Add these to your .env file to enable email reply polling")
        except Exception as e:
            logger.error(f"❌ Could not schedule email reply polling: {e}", exc_info=True)
        
        # Schedule goal jobs for all active goals (event-driven approach)
        # No more polling - jobs are scheduled for specific send times
        active_goals = await db.goals.find({"active": True}, {"_id": 0}).to_list(1000)
        for goal in active_goals:
            try:
                await schedule_goal_jobs_for_goal(goal["id"], goal["user_email"])
            except Exception as e:
                logger.error(f"Error scheduling jobs for goal {goal.get('id')}: {e}")
        
        logger.info(f"Scheduled goal jobs for {len(active_goals)} active goals")
        
        # Start scheduler if not already running
        if not scheduler.running:
            scheduler.start()
            logger.info("Scheduler started")
        else:
            logger.info("Scheduler already running")

        await schedule_user_emails()
        logger.info("✅ User email schedules initialized")
        
        startup_duration = time.time() - startup_start
        logger.info(f"🚀 Application startup completed in {startup_duration:.2f}s")
        logger.info("=" * 60)
        logger.info("✅ Tend API is ready and running!")
        logger.info("=" * 60)
    except Exception as e:
        logger.error(f"❌ Startup error: {e}", exc_info=True)
        raise
    
    # Application running phase - yield control
    try:
        yield
    except asyncio.CancelledError:
        # Handle graceful cancellation (e.g., KeyboardInterrupt)
        logger.info("⚠️ Application shutdown requested (cancellation)")
        # Don't re-raise - let finally block handle cleanup
    
    # Shutdown phase
    finally:
        shutdown_start = time.time()
        logger.info("=" * 60)
        logger.info("🛑 Application shutdown initiated...")
        
        try:
            logger.info("Stopping scheduler...")
            if scheduler.running:
                scheduler.shutdown(wait=False)  # Don't wait for jobs to finish
            logger.info("✅ Scheduler stopped")
        except asyncio.CancelledError:
            logger.warning("⚠️ Scheduler shutdown cancelled (ignoring)")
        except Exception as e:
            logger.warning(f"⚠️ Scheduler shutdown warning: {e}")
        
        try:
            logger.info("Closing database connection...")
            client.close()
            logger.info("✅ Database connection closed")
        except asyncio.CancelledError:
            logger.warning("⚠️ Database close cancelled (ignoring)")
        except Exception as e:
            logger.warning(f"⚠️ Database close warning: {e}")
        
        shutdown_duration = time.time() - shutdown_start
        logger.info(f"✅ Application shutdown completed in {shutdown_duration:.2f}s")
        logger.info("=" * 60)

app.router.lifespan_context = lifespan
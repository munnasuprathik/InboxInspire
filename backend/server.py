from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks, Depends, Header, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Literal, Dict, Any, Tuple
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from openai import AsyncOpenAI
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import secrets
import pytz
import time
from activity_tracker import ActivityTracker
from version_tracker import VersionTracker
import warnings
from contextlib import asynccontextmanager
from functools import lru_cache
import re
import html

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')


def get_env(key: str, default: Optional[str] = None) -> str:
    """
    Fetch an environment variable, optionally falling back to a provided default.

    If no value is present and no default is given, a RuntimeError is raised with
    guidance for local development.
    """
    value = os.getenv(key)
    if value:
        return value

    if default is not None:
        warnings.warn(
            f"Environment variable '{key}' not set. Falling back to default value.",
            RuntimeWarning,
            stacklevel=2,
        )
        return default

    raise RuntimeError(
        f"Missing required environment variable '{key}'. "
        "Set it in your shell or define it in backend/.env before starting the server."
    )


# MongoDB connection
mongo_url = get_env('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[get_env('DB_NAME', 'inbox_inspire')]

# OpenAI client
openai_client = AsyncOpenAI(api_key=get_env('OPENAI_API_KEY'))

# Tavily research
TAVILY_API_KEY = os.getenv('TAVILY_API_KEY')
TAVILY_SEARCH_URL = "https://api.tavily.com/search"

# Cache for personality voice descriptions
personality_voice_cache: Dict[str, str] = {}

message_types = [
    "motivational_story",
    "action_challenge",
    "mindset_shift",
    "accountability_prompt",
    "celebration_message",
    "real_world_example"
]

PERSONALITY_BLUEPRINTS: Dict[str, List[str]] = {
    "famous": [
        "Open with a quick scene that person would comment on, deliver an unexpected insight in their voice, finish with a decisive micro-challenge.",
        "Share a short true-to-life anecdote the person would tell, highlight the lesson in their trademark style, close with an energizing promise."
    ],
    "tone": [
        "Begin with an emotion check-in that matches the tone, offer one vivid image, end with a grounded next step.",
        "Start with empathy, transition into a clear observation, and close with a gentle but firm call to action."
    ],
    "custom": [
        "Start with a heartfelt acknowledgement, reinforce their values with a fresh metaphor, end with a conversational nudge.",
        "Kick off with an encouraging statement, weave in a relatable micro-story, wrap up with one specific challenge."
    ]
}

EMOTIONAL_ARCS = [
    "Spark curiosity → Reflect on their journey → Deliver a laser-focused action.",
    "Recognize a recent win → Surface a friction point → Offer a bold reframe.",
    "Empathize with their current pace → Introduce a surprising observation → Issue a confident next move."
]

ANALOGY_PROMPTS = [
    "Connect their current sprint to an unexpected domain such as jazz improvisation, space exploration, or world-class cuisine.",
    "Compare their progress to a craftsperson honing a single stroke - keep it vivid but concise.",
    "Use a metaphor from sports or art that aligns with their goals, but do not mention the word metaphor."
]

FRIENDLY_DARES = [
    "When you complete today's action, reply with a single-word headline for the feeling.",
    "Shoot back two words tonight: one win, one obstacle.",
    "Drop me a note with the headline of your day once you execute.",
    "When you're done, tell me the song that was playing in your head."
]

EMOJI_REGEX = re.compile(
    "["
    "\U0001F300-\U0001F6FF"
    "\U0001F700-\U0001F77F"
    "\U0001F780-\U0001F7FF"
    "\U0001F800-\U0001F8FF"
    "\U0001F900-\U0001F9FF"
    "\U0001FA00-\U0001FAFF"
    "\U00002600-\U000026FF"
    "\U00002700-\U000027BF"
    "\U0001F1E6-\U0001F1FF"
    "]+"
)


def strip_emojis(text: Optional[str]) -> Optional[str]:
    if text is None:
        return None
    return EMOJI_REGEX.sub("", text)


def extract_interactive_sections(message: str) -> tuple[str, List[str], List[str]]:
    """Split the LLM output into core message, interactive questions, and quick reply prompts."""
    header = "INTERACTIVE CHECK-IN:"
    quick_header = "QUICK REPLY PROMPT:"

    core_message = message
    check_in_lines: List[str] = []
    quick_reply_lines: List[str] = []

    if header in message:
        core_message, remainder = message.split(header, 1)
        core_message = core_message.strip()
        remainder = remainder.strip()

        if quick_header in remainder:
            check_in_block, quick_block = remainder.split(quick_header, 1)
        else:
            check_in_block, quick_block = remainder, ""

        check_in_lines = [
            strip_emojis(line.strip(" -*\t"))
            for line in check_in_block.strip().splitlines()
            if line.strip()
        ]
        quick_reply_lines = [
            strip_emojis(line.strip(" -*\t"))
            for line in quick_block.strip().splitlines()
            if line.strip()
        ]
    else:
        core_message = message.strip()

    return core_message, check_in_lines, quick_reply_lines


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
                <span>InboxInspire Coach</span>
            </div>
            <div class="footer">
                You are receiving this email because you subscribed to InboxInspire updates.
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
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Initialize scheduler
scheduler = AsyncIOScheduler()

# Initialize Activity Tracker
tracker = ActivityTracker(db)

# Initialize Version Tracker  
version_tracker = VersionTracker(db)

# Define Models
class PersonalityType(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: Literal["famous", "tone", "custom"]
    value: str
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ScheduleConfig(BaseModel):
    frequency: Literal["daily", "weekly", "monthly", "custom"]
    times: List[str] = ["09:00"]  # Multiple times support
    custom_days: Optional[List[str]] = None  # ["monday", "wednesday", "friday"]
    custom_interval: Optional[int] = None
    timezone: str = "UTC"
    paused: bool = False
    skip_next: bool = False

class UserProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    goals: str
    personalities: List[PersonalityType] = []  # Multiple personalities support
    rotation_mode: Literal["sequential", "random", "daily_fixed", "weekly_rotation", "favorite_weighted", "time_based"] = "sequential"
    current_personality_index: int = 0
    schedule: ScheduleConfig
    magic_link_token: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    active: bool = True
    last_email_sent: Optional[datetime] = None
    streak_count: int = 0
    total_messages_received: int = 0
    last_active: Optional[datetime] = None

class LoginRequest(BaseModel):
    email: EmailStr

class VerifyTokenRequest(BaseModel):
    email: EmailStr
    token: str

class OnboardingRequest(BaseModel):
    email: EmailStr
    name: str
    goals: str
    personalities: List[PersonalityType]
    rotation_mode: Literal["sequential", "random", "daily_fixed", "weekly_rotation", "favorite_weighted", "time_based"] = "sequential"
    schedule: ScheduleConfig

class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    goals: Optional[str] = None
    personalities: Optional[List[PersonalityType]] = None
    rotation_mode: Optional[Literal["sequential", "random", "daily_fixed", "weekly_rotation", "favorite_weighted", "time_based"]] = None
    schedule: Optional[ScheduleConfig] = None
    active: Optional[bool] = None

class MessageFeedback(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    message_id: Optional[str] = None
    personality: PersonalityType
    rating: int  # 1-5 stars
    feedback_text: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MessageFeedbackCreate(BaseModel):
    message_id: Optional[str] = None
    rating: int
    feedback_text: Optional[str] = None
    personality: Optional[PersonalityType] = None

class UserSession(BaseModel):
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MessageHistory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    message: str
    personality: PersonalityType
    sent_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    rating: Optional[int] = None
    used_fallback: Optional[bool] = False

class UserAnalytics(BaseModel):
    email: str
    streak_count: int
    total_messages: int
    favorite_personality: Optional[str] = None
    avg_rating: Optional[float] = None
    last_active: Optional[datetime] = None
    engagement_rate: float = 0.0
    personality_stats: dict = {}

class MessageGenRequest(BaseModel):
    goals: str
    personality: PersonalityType
    user_name: Optional[str] = None

class MessageGenResponse(BaseModel):
    message: str
    used_fallback: bool = False

class EmailLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    subject: str
    status: str
    error_message: Optional[str] = None
    sent_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    timezone: Optional[str] = None
    local_sent_at: Optional[str] = None

# Admin auth
def verify_admin(authorization: str = Header(None)):
    if not authorization or authorization != f"Bearer {os.getenv('ADMIN_SECRET')}":
        raise HTTPException(status_code=403, detail="Unauthorized")
    return True

# SMTP Email Service with connection timeout
async def send_email(to_email: str, subject: str, html_content: str) -> tuple[bool, Optional[str]]:
    subject_line = None
    sent_dt = None
    try:
        msg = MIMEMultipart('alternative')
        msg['From'] = os.getenv('SENDER_EMAIL')
        msg['To'] = to_email
        msg['Subject'] = subject
        
        html_part = MIMEText(html_content, 'html')
        msg.attach(html_part)
        
        await aiosmtplib.send(
            msg,
            hostname=os.getenv('SMTP_HOST'),
            port=int(os.getenv('SMTP_PORT')),
            username=os.getenv('SMTP_USERNAME'),
            password=os.getenv('SMTP_PASSWORD'),
            use_tls=True,
            timeout=10  # 10 second timeout
        )
        
        return True, None
    except Exception as e:
        error_msg = str(e)
        logging.error(f"Email send error: {error_msg}")
        
        return False, error_msg

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

        response = await openai_client.responses.create(
            model="gpt-4.1-mini",
            input=[
                {
                    "role": "system",
                    "content": (
                        "You write vivid, human email subject lines for a motivational product. "
                        "They feel handcrafted, avoid gimmicks, refuse cliches, and never mention tone/persona names."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.75,
            max_output_tokens=24,
        )

        subject = response.output_text.strip().strip('"\'')
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

async def update_streak(email: str):
    """Update user streak count"""
    user = await db.users.find_one({"email": email})
    if not user:
        return
    
    last_sent = user.get('last_email_sent')
    streak = user.get('streak_count', 0)
    
    if last_sent:
        if isinstance(last_sent, str):
            last_sent = datetime.fromisoformat(last_sent)
        
        # Check if last email was yesterday
        days_diff = (datetime.now(timezone.utc) - last_sent).days
        if days_diff == 1:
            streak += 1
        elif days_diff > 1:
            streak = 1
    else:
        streak = 1
    
    await db.users.update_one(
        {"email": email},
        {"$set": {"streak_count": streak}}
    )

# Send email to a SPECIFIC user (called by scheduler)
async def send_motivation_to_user(email: str):
    """Send motivation email to a specific user - called by their scheduled job"""
    subject_line: Optional[str] = None
    sent_dt: Optional[datetime] = None
    schedule: Optional[dict] = None
    try:
        # Get the specific user
        user_data = await db.users.find_one({"email": email, "active": True}, {"_id": 0})
        
        if not user_data:
            logger.warning(f"User {email} not found or inactive")
            return
        
        # Check if paused or skip next
        schedule = user_data.get('schedule', {})
        if schedule.get('paused', False):
            logger.info(f"Skipping {email} - schedule paused")
            return
        
        if schedule.get('skip_next', False):
            # Reset skip_next flag
            await db.users.update_one(
                {"email": email},
                {"$set": {"schedule.skip_next": False}}
            )
            logger.info(f"Skipped {email} - skip_next was set")
            return
        
        # Update streak
        await update_streak(email)
        user_data = await db.users.find_one({"email": email}, {"_id": 0})  # Refresh to get updated streak
        
        # Get current personality
        personality = get_current_personality(user_data)
        if not personality:
            logger.warning(f"No personality found for {email}")
            return
        
        # Get previous messages to avoid repetition
        previous_messages = await db.message_history.find(
            {"email": email},
            {"_id": 0}
        ).sort("created_at", -1).limit(10).to_list(10)
        
        # Generate UNIQUE message with questions
        message, message_type, used_fallback, research_snippet = await generate_unique_motivational_message(
            user_data['goals'],
            personality,
            user_data.get('name'),
            user_data.get('streak_count', 0),
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
        sent_dt = datetime.now(timezone.utc)
        sent_timestamp = sent_dt.isoformat()
        history_doc = {
            "id": message_id,
            "email": email,
            "message": message,
            "personality": personality.model_dump(),
            "message_type": message_type,
            "created_at": sent_timestamp,
            "sent_at": sent_timestamp,
            "streak_at_time": user_data.get('streak_count', 0),
            "used_fallback": used_fallback
        }
        await db.message_history.insert_one(history_doc)
        
        streak_count = user_data.get('streak_count', 0)
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

        subject_line = await compose_subject_line(
            personality,
            message_type,
            user_data,
            used_fallback,
            research_snippet
        )

        success, error = await send_email(email, subject_line, html_content)
        
        if success:
            # Update last email sent time, streak, and total messages
            await update_streak(email)
            
            # Rotate personality if sequential
            personalities = user_data.get('personalities', [])
            if user_data.get('rotation_mode') == 'sequential' and len(personalities) > 1:
                current_index = user_data.get('current_personality_index', 0)
                next_index = (current_index + 1) % len(personalities)
                
                await db.users.update_one(
                    {"email": email},
                    {
                        "$set": {
                            "last_email_sent": sent_timestamp,
                            "last_active": sent_timestamp,
                            "current_personality_index": next_index
                        },
                        "$inc": {"total_messages_received": 1}
                    }
                )
            else:
                await db.users.update_one(
                    {"email": email},
                    {
                        "$set": {
                            "last_email_sent": sent_timestamp,
                            "last_active": sent_timestamp
                        },
                        "$inc": {"total_messages_received": 1}
                    }
                )
            
            await record_email_log(
                email=email,
                subject=subject_line,
                status="success",
                sent_dt=sent_dt,
                timezone_value=schedule.get("timezone"),
            )
            logger.info(f"✓ Sent motivation to {email}")
        else:
            await record_email_log(
                email=email,
                subject=subject_line,
                status="failed",
                sent_dt=sent_dt,
                timezone_value=schedule.get("timezone"),
                error_message=error,
            )
            logger.error(f"✗ Failed to send to {email}: {error}")
            
    except Exception as e:
        logger.error(f"Error sending to {email}: {str(e)}")
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
    """DEPRECATED: This function is no longer used. Each user has their own scheduled job."""
    logger.warning("send_scheduled_motivations called - this function is deprecated")
    try:
        users = await db.users.find({"active": True}, {"_id": 0}).to_list(1000)
        
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
                            <p>You're receiving this because you subscribed to InboxInspire</p>
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
                    # Update last email sent time, streak, and total messages
                    await update_streak(user_data['email'])
                    
                    # Rotate personality if sequential
                    personalities = user_data.get('personalities', [])
                    if user_data.get('rotation_mode') == 'sequential' and len(personalities) > 1:
                        current_index = user_data.get('current_personality_index', 0)
                        next_index = (current_index + 1) % len(personalities)
                        
                        await db.users.update_one(
                            {"email": user_data['email']},
                            {
                                "$set": {
                                    "last_email_sent": datetime.now(timezone.utc).isoformat(),
                                    "last_active": datetime.now(timezone.utc).isoformat(),
                                    "current_personality_index": next_index
                                },
                                "$inc": {"total_messages_received": 1}
                            }
                        )
                    else:
                        await db.users.update_one(
                            {"email": user_data['email']},
                            {
                                "$set": {
                                    "last_email_sent": datetime.now(timezone.utc).isoformat(),
                                    "last_active": datetime.now(timezone.utc).isoformat()
                                },
                                "$inc": {"total_messages_received": 1}
                            }
                        )
                    
                    logging.info(f"Sent motivation to {user_data['email']}")
                else:
                    logging.error(f"Failed to send to {user_data['email']}: {error}")
                    
            except Exception as e:
                logging.error(f"Error processing {user_data.get('email', 'unknown')}: {str(e)}")
        
    except Exception as e:
        logging.error(f"Scheduled job error: {str(e)}")

# Routes
@api_router.get("/")
async def root():
    return {"message": "InboxInspire API", "version": "2.0"}

@api_router.post("/auth/login")
async def login(request: LoginRequest, background_tasks: BackgroundTasks, req: Request):
    """Send magic link to email"""
    # Track login attempt
    ip_address = req.client.host if req.client else None
    user_agent = req.headers.get("user-agent")
    
    # Generate magic link token
    token = secrets.token_urlsafe(32)
    
    # Check if user exists
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    if user:
        # Update existing user with new token
        await db.users.update_one(
            {"email": request.email},
            {"$set": {"magic_link_token": token}}
        )
        user_exists = True
        
        # Track login request for existing user
        await tracker.log_user_activity(
            action_type="login_requested",
            user_email=request.email,
            details={"user_type": "existing"},
            ip_address=ip_address,
            user_agent=user_agent
        )
    else:
        # Store pending login
        await db.pending_logins.update_one(
            {"email": request.email},
            {"$set": {"token": token, "created_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
        user_exists = False
        
        # Track login request for new user
        await tracker.log_user_activity(
            action_type="login_requested",
            user_email=request.email,
            details={"user_type": "new"},
            ip_address=ip_address,
            user_agent=user_agent
        )
    
    # Prepare magic link email
    magic_link = f"https://aipep.preview.emergentagent.com/?token={token}&email={request.email}"
    
    html_content = f"""
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .button {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Welcome to InboxInspire!</h2>
            <p>Click the button below to access your account:</p>
            <p><a href="{magic_link}" class="button">Access My Account</a></p>
            <p style="color: #666; font-size: 12px;">Or copy this link: {magic_link}</p>
            <p style="color: #666; font-size: 12px;">This link expires in 1 hour.</p>
        </div>
    </body>
    </html>
    """
    
    # Send email in background - immediate response to user
    background_tasks.add_task(send_email, request.email, "Your InboxInspire Login Link", html_content)
    
    return {"status": "success", "message": "Login link sent to your email", "user_exists": user_exists}

@api_router.post("/auth/verify")
async def verify_token(request: VerifyTokenRequest):
    """Verify magic link token"""
    # Check existing user
    user = await db.users.find_one({"email": request.email, "magic_link_token": request.token}, {"_id": 0})
    
    if user:
        # Clear token after use
        await db.users.update_one(
            {"email": request.email},
            {"$set": {"magic_link_token": None}}
        )
        
        if isinstance(user.get('created_at'), str):
            user['created_at'] = datetime.fromisoformat(user['created_at'])
        if isinstance(user.get('last_email_sent'), str):
            user['last_email_sent'] = datetime.fromisoformat(user['last_email_sent'])
        
        return {"status": "success", "user_exists": True, "user": user}
    
    # Check pending login
    pending = await db.pending_logins.find_one({"email": request.email, "token": request.token})
    
    if pending:
        # Valid token for new user
        return {"status": "success", "user_exists": False}
    
    raise HTTPException(status_code=401, detail="Invalid or expired token")

@api_router.post("/onboarding")
async def complete_onboarding(request: OnboardingRequest, req: Request):
    """Complete onboarding for new user"""
    # Check if user already exists
    existing = await db.users.find_one({"email": request.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    
    profile = UserProfile(**request.model_dump())
    doc = profile.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.users.insert_one(doc)
    
    # Save initial version history
    await version_tracker.save_schedule_version(
        user_email=request.email,
        schedule_data=request.schedule.model_dump(),
        changed_by="user",
        change_reason="Initial onboarding"
    )
    
    await version_tracker.save_personality_version(
        user_email=request.email,
        personalities=[p.model_dump() for p in request.personalities],
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
    await tracker.log_user_activity(
        action_type="onboarding_completed",
        user_email=request.email,
        details={
            "personalities_count": len(request.personalities),
            "schedule_frequency": request.schedule.frequency
        },
        ip_address=ip_address
    )
    
    # Clean up pending login
    await db.pending_logins.delete_one({"email": request.email})
    
    # Schedule emails for this new user
    await schedule_user_emails()
    logger.info(f"✅ Onboarding complete + history saved for: {request.email}")
    
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
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    
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
        await schedule_user_emails()
        logger.info(f"Rescheduled emails for {email}")
    
    return updated_user

@api_router.post("/generate-message")
async def generate_message(request: MessageGenRequest):
    message, _, used_fallback, _ = await generate_unique_motivational_message(
        request.goals, 
        request.personality,
        request.user_name,
        0,
        []
    )
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
async def send_motivation_now(email: str):
    """Send motivation email immediately"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get current personality
    personality = get_current_personality(user)
    if not personality:
        raise HTTPException(status_code=400, detail="No personality configured")
    
    message, message_type, used_fallback, research_snippet = await generate_unique_motivational_message(
        user['goals'],
        personality,
        user.get('name'),
        user.get('streak_count', 0),
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
    
    # Save to history
    message_id = str(uuid.uuid4())
    sent_dt = datetime.now(timezone.utc)
    history = MessageHistory(
        id=message_id,
        email=email,
        message=message,
        personality=personality,
        used_fallback=used_fallback,
        sent_at=sent_dt
    ).model_dump()
    history["message_type"] = message_type
    history["created_at"] = history.get("sent_at")
    await db.message_history.insert_one(history)
    
    streak_count = user.get('streak_count', 0)
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
    
    subject_line = await compose_subject_line(
        personality,
        "instant_boost",
        user,
        used_fallback,
        research_snippet=research_snippet
    )

    success, error = await send_email(email, subject_line, html_content)
    
    if success:
        await db.users.update_one(
            {"email": email},
            {
                "$set": {
                    "last_email_sent": sent_dt.isoformat(),
                    "last_active": sent_dt.isoformat()
                },
                "$inc": {"total_messages_received": 1}
            }
        )
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
            "Elon Musk", "Steve Jobs", "A.P.J. Abdul Kalam", "Oprah Winfrey",
            "Nelson Mandela", "Maya Angelou", "Tony Robbins", "Brené Brown",
            "Simon Sinek", "Michelle Obama", "Warren Buffett", "Richard Branson"
        ]
    }

@api_router.get("/tone-options")
async def get_tone_options():
    return {
        "tones": [
            "Funny & Uplifting", "Friendly & Warm", "Roasting (Tough Love)",
            "Serious & Direct", "Philosophical & Deep", "Energetic & Enthusiastic",
            "Calm & Meditative", "Poetic & Artistic"
        ]
    }

# Message History & Feedback Routes
@api_router.get("/users/{email}/message-history")
async def get_message_history(email: str, limit: int = 50):
    """Get user's message history"""
    messages = await db.message_history.find(
        {"email": email}, 
        {"_id": 0}
    ).sort("sent_at", -1).to_list(limit)
    
    for msg in messages:
        if isinstance(msg.get('sent_at'), str):
            msg['sent_at'] = datetime.fromisoformat(msg['sent_at'])
    
    return {"messages": messages, "total": len(messages)}

@api_router.post("/users/{email}/feedback")
async def submit_feedback(email: str, feedback: MessageFeedbackCreate):
    """Submit feedback for a message"""
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
    
    await db.message_feedback.insert_one(feedback_doc.model_dump())
    
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
    
    return {"status": "success", "message": "Feedback submitted"}

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
    
    return analytics

# Personality Management Routes
@api_router.post("/users/{email}/personalities")
async def add_personality(email: str, personality: PersonalityType):
    """Add a new personality to user"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    personalities = user.get('personalities', [])
    personalities.append(personality.model_dump())
    
    await db.users.update_one(
        {"email": email},
        {"$set": {"personalities": personalities}}
    )
    
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
    
    await db.users.update_one(
        {"email": email},
        {"$set": {"personalities": personalities, "current_personality_index": 0}}
    )
    
    return {"status": "success", "message": "Personality removed"}

@api_router.put("/users/{email}/personalities/{personality_id}")
async def update_personality(email: str, personality_id: str, updates: dict):
    """Update a personality"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    personalities = user.get('personalities', [])
    for i, p in enumerate(personalities):
        if p.get('id') == personality_id:
            personalities[i].update(updates)
            break
    
    await db.users.update_one(
        {"email": email},
        {"$set": {"personalities": personalities}}
    )
    
    return {"status": "success", "message": "Personality updated"}

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
async def admin_get_all_users():
    users = await db.users.find({}, {"_id": 0}).to_list(1000)
    for user in users:
        if isinstance(user.get('created_at'), str):
            user['created_at'] = datetime.fromisoformat(user['created_at'])
        if isinstance(user.get('last_email_sent'), str):
            user['last_email_sent'] = datetime.fromisoformat(user['last_email_sent'])
    return {"users": users, "total": len(users)}

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
    
    # Calculate average streak
    users = await db.users.find({}, {"streak_count": 1, "_id": 0}).to_list(1000)
    streaks = [u.get('streak_count', 0) for u in users]
    avg_streak = sum(streaks) / len(streaks) if streaks else 0
    
    # Get feedback ratings
    feedbacks = await db.message_feedback.find({}, {"rating": 1, "_id": 0}).to_list(10000)
    ratings = [f.get('rating', 0) for f in feedbacks]
    avg_rating = sum(ratings) / len(ratings) if ratings else 0
    
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
    """Get all feedback"""
    feedbacks = await db.message_feedback.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    for fb in feedbacks:
        if isinstance(fb.get('created_at'), str):
            fb['created_at'] = datetime.fromisoformat(fb['created_at'])
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

# Activity Tracking Middleware
@app.middleware("http")
async def track_api_calls(request: Request, call_next):
    """Middleware to track all API calls"""
    start_time = time.time()
    
    # Get client info
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    try:
        response = await call_next(request)
        
        # Calculate response time
        response_time_ms = int((time.time() - start_time) * 1000)
        
        # Track API call
        if request.url.path.startswith("/api"):
            await tracker.log_api_call(
                endpoint=request.url.path,
                method=request.method,
                status_code=response.status_code,
                response_time_ms=response_time_ms,
                ip_address=client_ip
            )
        
        return response
    except Exception as e:
        response_time_ms = int((time.time() - start_time) * 1000)
        
        # Track failed API call
        if request.url.path.startswith("/api"):
            await tracker.log_api_call(
                endpoint=request.url.path,
                method=request.method,
                status_code=500,
                response_time_ms=response_time_ms,
                ip_address=client_ip,
                error_message=str(e)
            )
        
        raise

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def create_email_job(user_email: str):
    """Scheduled job executed by AsyncIOScheduler within the main event loop."""
    try:
        await send_motivation_to_user(user_email)
        
        await tracker.log_system_event(
            event_type="scheduled_email_sent",
            event_category="scheduler",
            details={"user_email": user_email},
            status="success"
        )
    except Exception as e:
        logger.error(f"Error in email job for {user_email}: {str(e)}")

async def schedule_user_emails():
    """Schedule emails for all active users based on their preferences"""
    try:
        users = await db.users.find({"active": True}, {"_id": 0}).to_list(1000)
        
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
                
                # Remove existing job if any
                try:
                    scheduler.remove_job(job_id)
                except:
                    pass
                
                # Add new job based on frequency with timezone
                # FIXED: Now properly executes async function from scheduler
                if frequency == 'daily':
                    scheduler.add_job(
                        create_email_job,
                        CronTrigger(hour=hour, minute=minute, timezone=tz),
                        args=[email],
                        id=job_id,
                        replace_existing=True
                    )
                elif frequency == 'weekly':
                    # Default to Monday if no days specified
                    day_of_week = 0  # Monday
                    scheduler.add_job(
                        create_email_job,
                        CronTrigger(day_of_week=day_of_week, hour=hour, minute=minute, timezone=tz),
                        args=[email],
                        id=job_id,
                        replace_existing=True
                    )
                elif frequency == 'monthly':
                    # First day of month
                    scheduler.add_job(
                        create_email_job,
                        CronTrigger(day=1, hour=hour, minute=minute, timezone=tz),
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
                
            except Exception as e:
                logger.error(f"Error scheduling for {user_data.get('email', 'unknown')}: {str(e)}")
    
    except Exception as e:
        logger.error(f"Error in schedule_user_emails: {str(e)}")

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
    try:
        try:
            await db.users.create_index("email", unique=True)
            await db.pending_logins.create_index("email")
            await db.message_history.create_index("email")
            await db.message_feedback.create_index("email")
            await db.email_logs.create_index([("email", 1), ("sent_at", -1)])
            logger.info("Database indexes created")
        except Exception as e:
            logger.warning(f"Index creation warning: {e}")

        scheduler.start()
        logger.info("Scheduler started")

        await schedule_user_emails()
        logger.info("User email schedules initialized")

        yield
    finally:
        try:
            scheduler.shutdown()
        except Exception as e:
            logger.warning(f"Scheduler shutdown warning: {e}")
        client.close()

app.router.lifespan_context = lifespan
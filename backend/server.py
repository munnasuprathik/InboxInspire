from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks, Depends, Header, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Literal, Dict, Any
import uuid
from datetime import datetime, timezone
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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# OpenAI client
openai_client = AsyncOpenAI(api_key=os.getenv('OPENAI_API_KEY'))

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

class MessageHistory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    message: str
    personality: PersonalityType
    sent_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    rating: Optional[int] = None

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

class EmailLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    subject: str
    status: str
    error_message: Optional[str] = None
    sent_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Admin auth
def verify_admin(authorization: str = Header(None)):
    if not authorization or authorization != f"Bearer {os.getenv('ADMIN_SECRET')}":
        raise HTTPException(status_code=403, detail="Unauthorized")
    return True

# SMTP Email Service with connection timeout
async def send_email(to_email: str, subject: str, html_content: str) -> tuple[bool, Optional[str]]:
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
        
        # Log successful email
        log = EmailLog(
            email=to_email,
            subject=subject,
            status="success"
        )
        await db.email_logs.insert_one(log.model_dump())
        
        return True, None
    except Exception as e:
        error_msg = str(e)
        logging.error(f"Email send error: {error_msg}")
        
        # Log failed email
        log = EmailLog(
            email=to_email,
            subject=subject,
            status="failed",
            error_message=error_msg
        )
        await db.email_logs.insert_one(log.model_dump())
        
        return False, error_msg

# Enhanced LLM Service with deep personality matching
async def generate_unique_motivational_message(
    goals: str, 
    personality: PersonalityType, 
    name: Optional[str] = None,
    streak_count: int = 0,
    previous_messages: list = None
) -> tuple[str, str]:
    """Generate UNIQUE, engaging motivational message with questions - never repeat"""
    try:
        # Message types for variety
        message_types = [
            "motivational_story",
            "action_challenge", 
            "mindset_shift",
            "accountability_prompt",
            "celebration_message",
            "real_world_example"
        ]
        
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
        
        # Personality style
        personality_prompt = ""
        if personality.type == "famous":
            personality_prompt = f"Channel {personality.value}'s unique voice, style, and way of thinking. Use their characteristic phrases and perspectives."
        elif personality.type == "tone":
            personality_prompt = f"Write in an authentic {personality.value.lower()} tone."
        else:
            personality_prompt = f"Adopt this style: {personality.value}"
        
        # Engaging questions pool
        question_templates = [
            "What's one small action you can take RIGHT NOW toward this?",
            "If you had to pick just ONE thing to focus on today, what would move the needle?",
            "What's the biggest obstacle in your way, and how can you sidestep it?",
            "Imagine it's 6 months from now and you've succeeded - what did you do differently?",
            "What would you tell someone else in your position right now?",
            "What's one excuse you're going to eliminate today?",
            "Which part of your goal actually excites you the most?",
            "What's a micro-win you can celebrate from yesterday?",
            "If you could ask your future successful self one question, what would it be?",
            "What's one thing you know you should do but keep avoiding?"
        ]
        
        question = random.choice(question_templates)
        
        # Streak milestone messages
        streak_context = ""
        if streak_count >= 100:
            streak_context = f"🎯 INCREDIBLE! {streak_count} days of consistency. You're in the top 1%."
        elif streak_count >= 30:
            streak_context = f"🔥 {streak_count} day streak! You've built a real habit here."
        elif streak_count >= 7:
            streak_context = f"💪 {streak_count} days strong! The hardest part is behind you."
        elif streak_count >= 1:
            streak_context = f"✨ Day {streak_count}. Every journey starts with a single step."
        else:
            streak_context = "🚀 Starting fresh. Let's build momentum!"
        
        prompt = f"""You are an elite personal coach creating a UNIQUE daily motivation message.

{personality_prompt}

USER'S GOALS: {goals}
USER'S NAME: {name or "there"}
STREAK: {streak_context}
MESSAGE TYPE: {message_type}

CRITICAL RULES:
1. NEVER copy/paste the user's goals - reference them creatively and naturally
2. Make it COMPLETELY UNIQUE - no generic phrases
3. Be SPECIFIC and ACTIONABLE - not vague platitudes
4. Keep it SHORT - 3-4 paragraphs maximum
5. Make it CONVERSATIONAL - like texting a friend who cares

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
                {"role": "system", "content": "You are a world-class motivational coach who creates deeply personal, unique messages that inspire real action. You never use clichés or generic advice. Every message feels handcrafted."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.9,  # Higher for more creativity
            max_tokens=500,
            presence_penalty=0.6,  # Avoid repetition
            frequency_penalty=0.6   # Encourage variety
        )
        
        message = response.choices[0].message.content.strip()
        
        # Add engaging question at the end
        message_with_question = f"{message}\n\n💭 Question for you: {question}"
        
        return message_with_question, message_type
        
    except Exception as e:
        logger.error(f"Error generating message: {str(e)}")
        default_msg = f"Hey {name or 'there'}! 🔥 Day {streak_count} of your journey.\n\nYou know what you need to do today. The question isn't whether you CAN do it - it's whether you WILL.\n\nWhat's one action you're taking today that your future self will thank you for?"
        return default_msg, "default"

# Backward compatibility wrapper
async def generate_motivational_message(goals: str, personality: PersonalityType, name: Optional[str] = None) -> str:
    """Wrapper for backward compatibility"""
    message, _ = await generate_unique_motivational_message(goals, personality, name, 0, [])
    return message

# Get current personality for user based on rotation mode
def get_current_personality(user_data):
    personalities = user_data.get('personalities', [])
    if not personalities:
        return None
    
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
        await update_user_streak(email)
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
        message, message_type = await generate_unique_motivational_message(
            user_data['goals'],
            personality,
            user_data.get('name'),
            user_data.get('streak_count', 0),
            previous_messages
        )
        
        # Save to message history with message type for tracking
        message_id = str(uuid.uuid4())
        history_doc = {
            "id": message_id,
            "email": email,
            "message": message,
            "personality": personality.model_dump(),
            "message_type": message_type,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "streak_at_time": user_data.get('streak_count', 0)
        }
        await db.message_history.insert_one(history_doc)
        
        # Create HTML email
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
                        <div>🔥 Your Streak</div>
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
            email,
            f"Your Daily Motivation from {personality.value} ✨",
            html_content
        )
        
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
                            "last_email_sent": datetime.now(timezone.utc).isoformat(),
                            "last_active": datetime.now(timezone.utc).isoformat(),
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
                            "last_email_sent": datetime.now(timezone.utc).isoformat(),
                            "last_active": datetime.now(timezone.utc).isoformat()
                        },
                        "$inc": {"total_messages_received": 1}
                    }
                )
            
            logger.info(f"✓ Sent motivation to {email}")
        else:
            logger.error(f"✗ Failed to send to {email}: {error}")
            
    except Exception as e:
        logger.error(f"Error sending to {email}: {str(e)}")

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
                                <div>🔥 Your Streak</div>
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
                    f"Your Daily Motivation from {personality.value} ✨",
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
    background_tasks.add_task(send_email, request.email, "Your InboxInspire Login Link 🔐", html_content)
    
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
    message = await generate_motivational_message(
        request.goals, 
        request.personality,
        request.user_name
    )
    return MessageGenResponse(message=message)

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
    
    message = await generate_motivational_message(
        user['goals'],
        personality,
        user.get('name')
    )
    
    # Save to history
    message_id = str(uuid.uuid4())
    history = MessageHistory(
        id=message_id,
        email=email,
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
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Your Inspiration Awaits</h1>
            </div>
            <div class="content">
                <p style="font-size: 18px; color: #4a5568; margin-bottom: 25px;">Hello {user.get('name', 'there')},</p>
                <div class="message">{message}</div>
                <div class="signature">
                    - Inspired by {personality.value}
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    success, error = await send_email(
        email,
        f"Your Motivation from {personality.value} ✨",
        html_content
    )
    
    if success:
        await db.users.update_one(
            {"email": email},
            {
                "$set": {
                    "last_email_sent": datetime.now(timezone.utc).isoformat(),
                    "last_active": datetime.now(timezone.utc).isoformat()
                },
                "$inc": {"total_messages_received": 1}
            }
        )
        return {"status": "success", "message": "Email sent successfully", "message_id": message_id}
    else:
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
    
    # Get current personality
    personality = get_current_personality(user)
    
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
        await db.message_history.update_one(
            {"id": feedback.message_id},
            {"$set": {"rating": feedback.rating}}
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
        if isinstance(log.get('sent_at'), str):
            log['sent_at'] = datetime.fromisoformat(log['sent_at'])
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

def create_email_job(user_email: str):
    """Wrapper to properly execute async email sending from scheduler"""
    async def send_email_wrapper():
        await send_motivation_to_user(user_email)
        
        # Track system event
        await tracker.log_system_event(
            event_type="scheduled_email_sent",
            event_category="scheduler",
            details={"user_email": user_email},
            status="success"
        )
    
    # Run in new event loop
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(send_email_wrapper())
        loop.close()
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

@app.on_event("startup")
async def startup_event():
    # Create database indexes for performance
    try:
        await db.users.create_index("email", unique=True)
        await db.pending_logins.create_index("email")
        await db.message_history.create_index("email")
        await db.message_feedback.create_index("email")
        await db.email_logs.create_index([("email", 1), ("sent_at", -1)])
        logger.info("Database indexes created")
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")
    
    # Start scheduler
    scheduler.start()
    logger.info("Scheduler started")
    
    # Schedule emails for all users
    await schedule_user_emails()
    logger.info("User email schedules initialized")

@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown()
    client.close()
from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks, Depends, Header, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Literal
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
async def generate_motivational_message(goals: str, personality: PersonalityType, user_name: Optional[str] = None) -> str:
    try:
        # Build detailed system message based on personality type
        if personality.type == "famous":
            person = personality.value
            system_msg = f"""You ARE {person}. You don't just mimic - you embody their complete essence.

Your task: Write a personal motivational message as {person} would actually write it.

Key requirements:
- Use {person}'s EXACT speech patterns, vocabulary, and thought processes
- Reference their life philosophy, famous quotes, and core beliefs naturally
- Match their tone perfectly - whether visionary, philosophical, direct, warm, etc.
- Include specific examples or metaphors they would use
- Write as if {person} personally knows this person and cares about their journey
- Keep it 2-3 powerful paragraphs
- Make it feel like a personal letter, not a generic message

Remember: You ARE {person}. Think like them. Write like them. Inspire like them."""
        
        elif personality.type == "tone":
            tone = personality.value
            tone_instructions = {
                "Funny & Uplifting": "Use humor, wit, and playful language. Include funny analogies. Make them smile while motivating. Be lighthearted but genuinely encouraging.",
                "Friendly & Warm": "Write like a close friend who truly cares. Be warm, supportive, and understanding. Use conversational language. Be the friend they need.",
                "Roasting (Tough Love)": "Be brutally honest but caring. Call out excuses. Challenge them directly. Use tough love - harsh but helpful. Make them uncomfortable enough to take action.",
                "Serious & Direct": "Be straightforward and no-nonsense. Focus on facts and action steps. Be professional but motivating. Clear, concise, powerful.",
                "Philosophical & Deep": "Use philosophical concepts, metaphors, and deep insights. Reference life's bigger picture. Be thought-provoking and contemplative.",
                "Energetic & Enthusiastic": "HIGH ENERGY! Use exclamation points, power words, and excitement. Make them feel pumped up and ready to conquer the world!",
                "Calm & Meditative": "Be peaceful, zen-like, and mindful. Use calming language. Focus on inner peace and steady progress. Be the voice of tranquility.",
                "Poetic & Artistic": "Use beautiful imagery, metaphors, and poetic language. Paint pictures with words. Make it lyrical and inspiring."
            }
            
            instruction = tone_instructions.get(tone, "Be motivating and match the requested tone perfectly.")
            system_msg = f"""You are a master motivational writer with a {tone} style.

{instruction}

Write a deeply personal motivational message in 2-3 paragraphs. Make every word count. Match the {tone} tone PERFECTLY throughout."""
        
        else:  # custom
            system_msg = f"""You are a personalized motivational message writer.

User's specific requirements: {personality.value}

Follow their requirements EXACTLY. Match the style, tone, and approach they described perfectly. Make it personal and deeply meaningful.

Write 2-3 powerful paragraphs."""
        
        # Build personalized prompt
        name_part = f" for {user_name}" if user_name else ""
        prompt = f"""Write a motivational message{name_part} who is working on these goals:

{goals}

Make this message:
- Deeply personal and specific to their goals
- Actionable - give them something they can do TODAY
- Genuine - like you truly care about their success
- Memorable - something they'll want to re-read

Write as if you're speaking directly to them, one-on-one."""
        
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": prompt}
            ],
            temperature=0.8,
            max_tokens=500
        )
        
        return response.choices[0].message.content.strip()
    except Exception as e:
        logging.error(f"LLM generation error: {str(e)}")
        return "Keep pushing forward on your goals. Every step counts!"

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
        
        # Get current personality
        personality = get_current_personality(user_data)
        if not personality:
            logger.warning(f"No personality found for {email}")
            return
        
        # Generate message
        message = await generate_motivational_message(
            user_data['goals'],
            personality,
            user_data.get('name')
        )
        
        # Save to message history
        message_id = str(uuid.uuid4())
        history = MessageHistory(
            id=message_id,
            email=email,
            message=message,
            personality=personality
        )
        await db.message_history.insert_one(history.model_dump())
        
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
async def login(request: LoginRequest, background_tasks: BackgroundTasks):
    """Send magic link to email"""
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
    else:
        # Store pending login
        await db.pending_logins.update_one(
            {"email": request.email},
            {"$set": {"token": token, "created_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
        user_exists = False
    
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
async def complete_onboarding(request: OnboardingRequest):
    """Complete onboarding for new user"""
    # Check if user already exists
    existing = await db.users.find_one({"email": request.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    
    profile = UserProfile(**request.model_dump())
    doc = profile.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.users.insert_one(doc)
    
    # Clean up pending login
    await db.pending_logins.delete_one({"email": request.email})
    
    # Schedule emails for this new user
    await schedule_user_emails()
    logger.info(f"Scheduled emails for new user: {request.email}")
    
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
        await db.users.update_one({"email": email}, {"$set": update_data})
    
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
    return {"status": "success", "user": updated_user}

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
                # FIXED: Now each job sends email ONLY to the specific user
                if frequency == 'daily':
                    scheduler.add_job(
                        lambda user_email=email: asyncio.create_task(send_motivation_to_user(user_email)),
                        CronTrigger(hour=hour, minute=minute, timezone=tz),
                        id=job_id,
                        replace_existing=True
                    )
                elif frequency == 'weekly':
                    # Default to Monday if no days specified
                    day_of_week = 0  # Monday
                    scheduler.add_job(
                        lambda user_email=email: asyncio.create_task(send_motivation_to_user(user_email)),
                        CronTrigger(day_of_week=day_of_week, hour=hour, minute=minute, timezone=tz),
                        id=job_id,
                        replace_existing=True
                    )
                elif frequency == 'monthly':
                    # First day of month
                    scheduler.add_job(
                        lambda user_email=email: asyncio.create_task(send_motivation_to_user(user_email)),
                        CronTrigger(day=1, hour=hour, minute=minute, timezone=tz),
                        id=job_id,
                        replace_existing=True
                    )
                
                logger.info(f"Scheduled emails for {email} at {hour}:{minute:02d} {user_timezone} ({frequency})")
                
            except Exception as e:
                logger.error(f"Error scheduling for {user_data.get('email', 'unknown')}: {str(e)}")
    
    except Exception as e:
        logger.error(f"Error in schedule_user_emails: {str(e)}")

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
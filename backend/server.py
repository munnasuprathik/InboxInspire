from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks
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
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from emergentintegrations.llm.chat import LlmChat, UserMessage
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Initialize scheduler
scheduler = AsyncIOScheduler()

# Define Models
class PersonalityType(BaseModel):
    type: Literal["famous", "tone", "custom"]
    value: str  # Name of person, tone type, or custom description

class ScheduleConfig(BaseModel):
    frequency: Literal["daily", "weekly", "monthly", "custom"]
    time: str = "09:00"  # HH:MM format
    custom_days: Optional[List[str]] = None  # For custom: ["monday", "wednesday", "friday"]
    custom_interval: Optional[int] = None  # For custom: every N days

class UserProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    goals: str
    personality: PersonalityType
    schedule: ScheduleConfig
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    active: bool = True

class UserProfileCreate(BaseModel):
    email: EmailStr
    goals: str
    personality: PersonalityType
    schedule: ScheduleConfig

class UserProfileUpdate(BaseModel):
    goals: Optional[str] = None
    personality: Optional[PersonalityType] = None
    schedule: Optional[ScheduleConfig] = None
    active: Optional[bool] = None

class MessageGenRequest(BaseModel):
    goals: str
    personality: PersonalityType

class MessageGenResponse(BaseModel):
    message: str

class TestEmailRequest(BaseModel):
    email: EmailStr
    message: str

# Email Service
async def send_email(to_email: str, subject: str, html_content: str) -> bool:
    try:
        sg_key = os.getenv('SENDGRID_API_KEY')
        if not sg_key or sg_key == 'your_sendgrid_key_here':
            logging.warning(f"SendGrid not configured. Would send email to {to_email}")
            return True  # Mock success for development
        
        message = Mail(
            from_email=os.getenv('SENDER_EMAIL', 'noreply@inboxinspire.com'),
            to_emails=to_email,
            subject=subject,
            html_content=html_content
        )
        
        sg = SendGridAPIClient(sg_key)
        response = sg.send(message)
        return response.status_code in [200, 202]
    except Exception as e:
        logging.error(f"Email send error: {str(e)}")
        return False

# LLM Service for generating motivational messages
async def generate_motivational_message(goals: str, personality: PersonalityType) -> str:
    try:
        llm_key = os.getenv('EMERGENT_LLM_KEY')
        
        # Build system message based on personality type
        if personality.type == "famous":
            system_msg = f"You are {personality.value}, the famous inspirational figure. Write motivational messages in your distinctive style, tone, and philosophy. Reference your known quotes and wisdom when appropriate."
        elif personality.type == "tone":
            system_msg = f"You are a motivational message writer with a {personality.value} tone. Write engaging and inspiring messages that match this tone perfectly."
        else:  # custom
            system_msg = f"You are a motivational message writer. {personality.value}"
        
        chat = LlmChat(
            api_key=llm_key,
            session_id=str(uuid.uuid4()),
            system_message=system_msg
        ).with_model("openai", "gpt-4o-mini")
        
        prompt = f"Write a short, powerful motivational message (2-3 paragraphs) for someone working on these goals: {goals}. Make it personal, actionable, and inspiring."
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        return response
    except Exception as e:
        logging.error(f"LLM generation error: {str(e)}")
        return f"Keep pushing forward on your goals: {goals}. Every step counts!"

# Background job to send scheduled emails
async def send_scheduled_motivations():
    try:
        users = await db.users.find({"active": True}, {"_id": 0}).to_list(1000)
        
        for user_data in users:
            try:
                # Generate message
                message = await generate_motivational_message(
                    user_data['goals'],
                    PersonalityType(**user_data['personality'])
                )
                
                # Create HTML email
                html_content = f"""
                <html>
                <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; color: white;">
                        <h1 style="margin: 0;">Your Daily Inspiration</h1>
                    </div>
                    <div style="padding: 30px; background: #f9f9f9; border-radius: 10px; margin-top: 20px;">
                        <p style="font-size: 16px; line-height: 1.6; color: #333;">{message}</p>
                    </div>
                    <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
                        <p>You're receiving this because you subscribed to InboxInspire</p>
                    </div>
                </body>
                </html>
                """
                
                await send_email(
                    user_data['email'],
                    "Your Daily Motivation 🌟",
                    html_content
                )
                
                logging.info(f"Sent motivation to {user_data['email']}")
            except Exception as e:
                logging.error(f"Error sending to {user_data.get('email', 'unknown')}: {str(e)}")
        
    except Exception as e:
        logging.error(f"Scheduled job error: {str(e)}")

# Routes
@api_router.get("/")
async def root():
    return {"message": "InboxInspire API", "version": "1.0"}

@api_router.post("/users", response_model=UserProfile)
async def create_user(input: UserProfileCreate):
    # Check if user already exists
    existing = await db.users.find_one({"email": input.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    profile = UserProfile(**input.model_dump())
    doc = profile.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.users.insert_one(doc)
    return profile

@api_router.get("/users/{email}", response_model=UserProfile)
async def get_user(email: str):
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if isinstance(user['created_at'], str):
        user['created_at'] = datetime.fromisoformat(user['created_at'])
    
    return user

@api_router.put("/users/{email}", response_model=UserProfile)
async def update_user(email: str, updates: UserProfileUpdate):
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    
    if update_data:
        await db.users.update_one({"email": email}, {"$set": update_data})
    
    updated_user = await db.users.find_one({"email": email}, {"_id": 0})
    if isinstance(updated_user['created_at'], str):
        updated_user['created_at'] = datetime.fromisoformat(updated_user['created_at'])
    
    return updated_user

@api_router.post("/generate-message", response_model=MessageGenResponse)
async def generate_message(request: MessageGenRequest):
    message = await generate_motivational_message(request.goals, request.personality)
    return MessageGenResponse(message=message)

@api_router.post("/send-test-email")
async def send_test_email(request: TestEmailRequest):
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; color: white;">
            <h1 style="margin: 0;">Test Message - Your Inspiration Awaits!</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9; border-radius: 10px; margin-top: 20px;">
            <p style="font-size: 16px; line-height: 1.6; color: #333;">{request.message}</p>
        </div>
        <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
            <p>This is a test email from InboxInspire</p>
        </div>
    </body>
    </html>
    """
    
    success = await send_email(request.email, "Test Motivation 🌟", html_content)
    
    if success:
        return {"status": "success", "message": "Test email sent successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to send email")

@api_router.get("/famous-personalities")
async def get_famous_personalities():
    return {
        "personalities": [
            "Elon Musk",
            "Steve Jobs",
            "A.P.J. Abdul Kalam",
            "Oprah Winfrey",
            "Nelson Mandela",
            "Maya Angelou",
            "Tony Robbins",
            "Brené Brown",
            "Simon Sinek",
            "Michelle Obama"
        ]
    }

@api_router.get("/tone-options")
async def get_tone_options():
    return {
        "tones": [
            "Funny & Uplifting",
            "Friendly & Warm",
            "Roasting (Tough Love)",
            "Serious & Direct",
            "Philosophical & Deep",
            "Energetic & Enthusiastic",
            "Calm & Meditative",
            "Poetic & Artistic"
        ]
    }

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

@app.on_event("startup")
async def startup_event():
    # Start scheduler
    scheduler.add_job(
        send_scheduled_motivations,
        CronTrigger(hour=9, minute=0),  # Run daily at 9 AM
        id='daily_motivation',
        replace_existing=True
    )
    scheduler.start()
    logger.info("Scheduler started")

@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown()
    client.close()
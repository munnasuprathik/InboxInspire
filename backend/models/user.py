"""
User-related Pydantic models
"""
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Literal, Dict, Any, TYPE_CHECKING
from datetime import datetime, timezone
import uuid

if TYPE_CHECKING:
    from .message import PersonalityType

class ScheduleConfig(BaseModel):
    frequency: Literal["daily", "weekly", "monthly", "custom"]
    times: List[str] = ["09:00"]  # Multiple times support
    custom_days: Optional[List[str]] = None  # ["monday", "wednesday", "friday"]
    custom_interval: Optional[int] = None  # For custom frequency: every N days
    monthly_dates: Optional[List[str]] = None  # ["1", "15", "30"] - days of month
    timezone: str = "UTC"
    paused: bool = False
    skip_next: bool = False
    send_time_windows: Optional[List[Any]] = Field(None, max_length=5)  # Max 5 time windows
    end_date: Optional[datetime] = None

class UserProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    goals: str
    personalities: List[Any] = []  # Multiple personalities support - PersonalityType imported dynamically
    
    # Custom personalities support
    custom_personalities: List[str] = []  # List of custom personality IDs
    active_custom_personality_id: Optional[str] = None  # Currently active custom personality
    custom_personality_enabled: bool = False  # Toggle for using custom vs preset
    
    rotation_mode: Literal["sequential", "random", "daily_fixed", "weekly_rotation", "favorite_weighted", "time_based"] = "sequential"
    current_personality_index: int = 0
    schedule: ScheduleConfig
    magic_link_token: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    active: bool = True
    last_email_sent: Optional[datetime] = None
    streak_count: int = 0
    days_since_start: int = 0  # Days since user started (continues regardless of pauses)
    total_messages_received: int = 0
    last_active: Optional[datetime] = None
    achievements: List[str] = []  # List of achievement IDs unlocked
    favorite_messages: List[str] = []  # List of message IDs marked as favorite
    message_collections: Dict[str, List[str]] = {}  # Collection name -> message IDs
    goal_progress: Dict[str, Any] = {}  # Goal tracking data
    content_preferences: Dict[str, Any] = {}  # User content preferences
    
    # NEW: Reply conversation tracking
    conversation_thread_id: Optional[str] = None
    last_reply_at: Optional[datetime] = None
    total_replies: int = 0
    reply_engagement_rate: float = 0.0  # percentage of emails replied to
    
    # NEW: Global user timezone (for all dashboard displays)
    user_timezone: str = "UTC"  # IANA timezone string (e.g., "America/New_York", "Asia/Kolkata")

class LoginRequest(BaseModel):
    email: EmailStr

class VerifyTokenRequest(BaseModel):
    email: EmailStr
    token: str

class OnboardingRequest(BaseModel):
    email: EmailStr
    name: str
    goals: str
    personalities: List[Any]  # PersonalityType
    rotation_mode: Literal["sequential", "random", "daily_fixed", "weekly_rotation", "favorite_weighted", "time_based"] = "sequential"
    schedule: ScheduleConfig
    user_timezone: str = "UTC"  # NEW: Global timezone for dashboard

class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    goals: Optional[str] = None
    personalities: Optional[List[Any]] = None  # PersonalityType
    
    # Custom personality updates
    custom_personalities: Optional[List[str]] = None
    active_custom_personality_id: Optional[str] = None
    custom_personality_enabled: Optional[bool] = None
    
    rotation_mode: Optional[Literal["sequential", "random", "daily_fixed", "weekly_rotation", "favorite_weighted", "time_based"]] = None
    schedule: Optional[ScheduleConfig] = None
    active: Optional[bool] = None
    user_timezone: Optional[str] = None  # NEW: Allow updating global timezone

class UserSession(BaseModel):
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserAnalytics(BaseModel):
    email: str
    streak_count: int
    total_messages: int
    favorite_personality: Optional[str] = None
    
    # Custom personality analytics
    favorite_custom_personality: Optional[str] = None
    custom_personalities_created: int = 0
    
    avg_rating: Optional[float] = None
    last_active: Optional[datetime] = None
    engagement_rate: float = 0.0
    personality_stats: dict = {}


"""
Message-related Pydantic models
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Literal, List, Dict, Any
from datetime import datetime, timezone
import uuid

class PersonalityType(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: Literal["famous", "tone", "custom"]
    value: str
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MessageFeedback(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    message_id: Optional[str] = None
    personality: PersonalityType
    rating: int = Field(..., ge=1, le=5)  # Validation for 1-5 range
    feedback_text: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MessageFeedbackCreate(BaseModel):
    message_id: Optional[str] = None
    rating: int = Field(..., ge=1, le=5)  # Validation for 1-5 range
    feedback_text: Optional[str] = Field(None, max_length=1000)  # Limit feedback length
    personality: Optional[PersonalityType] = None

class MessageHistory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    message: str
    personality: PersonalityType
    sent_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    rating: Optional[int] = Field(None, ge=1, le=5)  # Validation when present
    used_fallback: Optional[bool] = False
    
    # Additional useful fields for tracking
    subject: Optional[str] = None  # Email subject line
    message_type: Optional[str] = None  # Type of message (from message_types)
    streak_at_time: Optional[int] = None  # User's streak when this was sent
    created_at: Optional[datetime] = None  # When message was generated (vs sent_at)
    goal_id: Optional[str] = None  # If this is from a goal
    goal_title: Optional[str] = None  # Goal title for easy reference
    
    # NEW: Reply tracking
    reply_received: bool = False
    reply_id: Optional[str] = None
    conversation_context: Optional[Dict[str, Any]] = None
    references_previous_reply: bool = False

class EmailReplyConversation(BaseModel):
    """Stores user replies to motivational emails"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_email: str
    conversation_thread_id: str  # Groups related replies
    
    # Reply data
    reply_text: str = Field(..., min_length=1, max_length=5000)
    reply_timestamp: datetime
    reply_sentiment: Literal["positive", "neutral", "struggling", "confused", "excited"] = "neutral"
    
    # Extracted insights from LLM analysis
    extracted_topics: List[str] = []
    extracted_wins: List[str] = []
    extracted_struggles: List[str] = []
    extracted_questions: List[str] = []
    
    # Context for next message generation
    preferred_tone_shift: Optional[str] = None
    suggested_focus: Optional[str] = None
    continuity_note: Optional[str] = None
    urgency_level: Literal["low", "medium", "high"] = "low"
    needs_immediate_response: bool = False
    
    # Status tracking
    processed: bool = False
    used_in_next_message: bool = False
    immediate_response_sent: bool = False
    
    # NEW: Link to the message this reply is responding to
    linked_message_id: Optional[str] = None  # ID of the message_history entry
    linked_goal_id: Optional[str] = None  # ID of the goal (if reply is to a goal message)
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class EmailReplyAnalysis(BaseModel):
    """LLM analysis results of user reply"""
    sentiment: Literal["positive", "neutral", "struggling", "confused", "excited"]
    extracted_wins: List[str]
    extracted_struggles: List[str]
    extracted_questions: List[str]
    key_topics: List[str]
    preferred_tone_shift: Optional[str]
    suggested_focus: str
    continuity_note: str
    urgency_level: Literal["low", "medium", "high"]
    needs_immediate_response: bool

class MessageGenRequest(BaseModel):
    email: Optional[str] = None  # User email for logging/tracking
    goals: str = Field(..., min_length=1, max_length=5000)  # Validation
    personality: PersonalityType
    user_name: Optional[str] = Field(None, max_length=200)  # Limit length
    message_type: Optional[str] = None  # Type of message (optional)
    goal_id: Optional[str] = None  # Goal ID if this is for a specific goal

class MessageGenResponse(BaseModel):
    message: str
    used_fallback: bool = False
    
    # Additional useful response fields
    message_type: Optional[str] = None  # Type of message generated
    subject: Optional[str] = None  # Generated subject line
    research_snippet: Optional[str] = None  # Research used (if any)


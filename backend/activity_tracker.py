"""
Comprehensive Activity Tracking System
Tracks every user interaction, system event, and admin action
"""
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
import uuid

class ActivityLog(BaseModel):
    """User activity log"""
    id: str
    user_email: Optional[str] = None
    action_type: str  # login, logout, profile_update, email_sent, etc.
    action_category: str  # user_action, system_event, admin_action
    details: Dict[str, Any] = {}
    timestamp: datetime
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    session_id: Optional[str] = None
    
class SystemEvent(BaseModel):
    """System-level events"""
    id: str
    event_type: str  # scheduled_email, job_started, job_completed
    event_category: str  # scheduler, background_task, api
    details: Dict[str, Any] = {}
    timestamp: datetime
    duration_ms: Optional[int] = None
    status: str  # success, failure, warning
    
class APIAnalytics(BaseModel):
    """API call analytics"""
    id: str
    endpoint: str
    method: str  # GET, POST, PUT, DELETE
    status_code: int
    response_time_ms: int
    user_email: Optional[str] = None
    timestamp: datetime
    ip_address: Optional[str] = None
    error_message: Optional[str] = None

class PageView(BaseModel):
    """Frontend page view tracking"""
    id: str
    user_email: Optional[str] = None
    page_url: str
    referrer: Optional[str] = None
    timestamp: datetime
    session_id: Optional[str] = None
    time_on_page_seconds: Optional[int] = None

class UserSession(BaseModel):
    """User session tracking"""
    id: str
    user_email: Optional[str] = None
    session_start: datetime
    session_end: Optional[datetime] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    total_actions: int = 0
    pages_visited: int = 0

class ActivityTracker:
    """Central tracking service"""
    
    def __init__(self, db):
        self.db = db
        
    async def log_user_activity(
        self,
        action_type: str,
        user_email: Optional[str] = None,
        details: Dict[str, Any] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        session_id: Optional[str] = None
    ):
        """Log any user activity"""
        log = ActivityLog(
            id=str(uuid.uuid4()),
            user_email=user_email,
            action_type=action_type,
            action_category="user_action",
            details=details or {},
            timestamp=datetime.now(timezone.utc),
            ip_address=ip_address,
            user_agent=user_agent,
            session_id=session_id
        )
        
        await self.db.activity_logs.insert_one(log.model_dump())
        return log.id
    
    async def log_admin_activity(
        self,
        action_type: str,
        admin_email: str,
        details: Dict[str, Any] = None,
        ip_address: Optional[str] = None
    ):
        """Log admin actions"""
        log = ActivityLog(
            id=str(uuid.uuid4()),
            user_email=admin_email,
            action_type=action_type,
            action_category="admin_action",
            details=details or {},
            timestamp=datetime.now(timezone.utc),
            ip_address=ip_address
        )
        
        await self.db.activity_logs.insert_one(log.model_dump())
        return log.id
    
    async def log_system_event(
        self,
        event_type: str,
        event_category: str,
        details: Dict[str, Any] = None,
        duration_ms: Optional[int] = None,
        status: str = "success"
    ):
        """Log system events"""
        event = SystemEvent(
            id=str(uuid.uuid4()),
            event_type=event_type,
            event_category=event_category,
            details=details or {},
            timestamp=datetime.now(timezone.utc),
            duration_ms=duration_ms,
            status=status
        )
        
        await self.db.system_events.insert_one(event.model_dump())
        return event.id
    
    async def log_api_call(
        self,
        endpoint: str,
        method: str,
        status_code: int,
        response_time_ms: int,
        user_email: Optional[str] = None,
        ip_address: Optional[str] = None,
        error_message: Optional[str] = None
    ):
        """Log API calls for performance monitoring"""
        analytics = APIAnalytics(
            id=str(uuid.uuid4()),
            endpoint=endpoint,
            method=method,
            status_code=status_code,
            response_time_ms=response_time_ms,
            user_email=user_email,
            timestamp=datetime.now(timezone.utc),
            ip_address=ip_address,
            error_message=error_message
        )
        
        await self.db.api_analytics.insert_one(analytics.model_dump())
        return analytics.id
    
    async def log_page_view(
        self,
        page_url: str,
        user_email: Optional[str] = None,
        referrer: Optional[str] = None,
        session_id: Optional[str] = None,
        time_on_page_seconds: Optional[int] = None
    ):
        """Log page views"""
        view = PageView(
            id=str(uuid.uuid4()),
            user_email=user_email,
            page_url=page_url,
            referrer=referrer,
            timestamp=datetime.now(timezone.utc),
            session_id=session_id,
            time_on_page_seconds=time_on_page_seconds
        )
        
        await self.db.page_views.insert_one(view.model_dump())
        return view.id
    
    async def start_session(
        self,
        user_email: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        """Start a new user session"""
        session = UserSession(
            id=str(uuid.uuid4()),
            user_email=user_email,
            session_start=datetime.now(timezone.utc),
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        await self.db.user_sessions.insert_one(session.model_dump())
        return session.id
    
    async def update_session(
        self,
        session_id: str,
        actions: int = 0,
        pages: int = 0
    ):
        """Update session statistics"""
        await self.db.user_sessions.update_one(
            {"id": session_id},
            {
                "$inc": {
                    "total_actions": actions,
                    "pages_visited": pages
                },
                "$set": {
                    "session_end": datetime.now(timezone.utc)
                }
            }
        )
    
    async def get_realtime_stats(self, minutes: int = 5):
        """Get real-time activity statistics"""
        from datetime import timedelta
        
        cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=minutes)
        
        # Active users in last N minutes
        active_users = await self.db.activity_logs.distinct(
            "user_email",
            {
                "timestamp": {"$gte": cutoff_time},
                "user_email": {"$ne": None}
            }
        )
        
        # Recent activities (exclude _id)
        recent_activities = await self.db.activity_logs.find(
            {"timestamp": {"$gte": cutoff_time}},
            {"_id": 0}
        ).sort("timestamp", -1).limit(50).to_list(50)
        
        # Convert datetime objects to ISO strings
        for activity in recent_activities:
            if isinstance(activity.get('timestamp'), datetime):
                activity['timestamp'] = activity['timestamp'].isoformat()
        
        # API performance
        api_stats = await self.db.api_analytics.aggregate([
            {"$match": {"timestamp": {"$gte": cutoff_time}}},
            {"$group": {
                "_id": None,
                "avg_response_time": {"$avg": "$response_time_ms"},
                "total_calls": {"$sum": 1},
                "errors": {
                    "$sum": {"$cond": [{"$gte": ["$status_code", 400]}, 1, 0]}
                }
            }}
        ]).to_list(1)
        
        # System events (exclude _id)
        system_events = await self.db.system_events.find(
            {"timestamp": {"$gte": cutoff_time}},
            {"_id": 0}
        ).sort("timestamp", -1).limit(20).to_list(20)
        
        # Convert datetime objects to ISO strings
        for event in system_events:
            if isinstance(event.get('timestamp'), datetime):
                event['timestamp'] = event['timestamp'].isoformat()
        
        return {
            "active_users_count": len(active_users),
            "active_users": active_users,
            "recent_activities": recent_activities,
            "api_stats": api_stats[0] if api_stats else {},
            "system_events": system_events,
            "time_window_minutes": minutes
        }
    
    async def get_user_activity_timeline(self, user_email: str, limit: int = 100):
        """Get complete activity timeline for a user"""
        activities = await self.db.activity_logs.find(
            {"user_email": user_email}
        ).sort("timestamp", -1).limit(limit).to_list(limit)
        
        return activities

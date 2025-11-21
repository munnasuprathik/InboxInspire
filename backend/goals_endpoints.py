# Goals API Endpoints
# This file contains the goals management endpoints that need to be added to server.py

# Add these imports at the top of server.py if not already present:
# from datetime import datetime, timezone
# import uuid

# Add this code before the lifespan function in server.py:

# ============================================================================
# GOALS API ENDPOINTS
# ============================================================================

@api_router.get("/users/{email}/goals")
async def get_goals(email: str):
    """Get all goals for a user"""
    goals = await db.goals.find({"user_email": email}, {"_id": 0}).to_list(100)
    return {"goals": goals}

@api_router.post("/users/{email}/goals")
async def create_goal(email: str, request: GoalCreateRequest):
    """Create a new goal"""
    # Verify user exists
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Create goal document
    goal_id = str(uuid.uuid4())
    goal_doc = {
        "id": goal_id,
        "user_email": email,
        "title": request.title,
        "description": request.description or "",
        "mode": request.mode or "tone",
        "personality_id": request.personality_id,
        "tone": request.tone or "motivational",
        "custom_text": request.custom_text,
        "custom_personality_id": request.custom_personality_id,
        "schedules": [s.model_dump() for s in (request.schedules or [])],
        "send_limit_per_day": request.send_limit_per_day or 10,
        "send_time_windows": [w.model_dump() for w in (request.send_time_windows or [])],
        "active": request.active if request.active is not None else True,
        "category": request.category or "personal",
        "priority": request.priority or 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.goals.insert_one(goal_doc)
    
    return goal_doc

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
    if request.category is not None:
        update_data["category"] = request.category
    if request.priority is not None:
        update_data["priority"] = request.priority
    
    await db.goals.update_one({"id": goal_id}, {"$set": update_data})
    
    return {"status": "success", "message": "Goal updated successfully"}

@api_router.delete("/users/{email}/goals/{goal_id}")
async def delete_goal(email: str, goal_id: str):
    """Delete a goal"""
    result = await db.goals.delete_one({"id": goal_id, "user_email": email})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    # Also delete associated goal messages
    await db.goal_messages.delete_many({"goal_id": goal_id})
    
    logger.info(f"Deleted goal {goal_id} for user {email}")
    return {"status": "success", "message": "Goal deleted successfully"}

@api_router.get("/users/{email}/goals/{goal_id}/history")
async def get_goal_history(email: str, goal_id: str, limit: int = 50):
    """Get message history for a goal"""
    # Verify goal exists and belongs to user
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

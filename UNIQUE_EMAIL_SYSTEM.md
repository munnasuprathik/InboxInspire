# InboxInspire - Unique Email System with Per-User Scheduling

## 🎯 Overview

**EVERY email is unique. NEVER repeated. Highly engaging.**

Each user gets emails at THEIR exact time in THEIR timezone with content that never repeats.

---

## ⏰ Per-User Timezone Scheduling

### How It Works

**User A:**
- Sets: 9:00 AM in America/New_York
- Receives email: EXACTLY 9:00 AM Eastern Time
- Job ID: `user_userA_at_example_com`

**User B:**
- Sets: 10:00 PM in Asia/Kolkata
- Receives email: EXACTLY 10:00 PM India Time
- Job ID: `user_userB_at_example_com`

### Technical Implementation

```python
# Each user gets their own APScheduler job
scheduler.add_job(
    create_email_job,
    CronTrigger(
        hour=hour,           # User's chosen hour
        minute=minute,       # User's chosen minute
        timezone=user_tz     # User's timezone (pytz)
    ),
    args=[user_email],      # Pass specific user email
    id=job_id,              # Unique per user
    replace_existing=True
)
```

**Supported Timezones:**
- ✅ All IANA timezone database timezones
- ✅ Examples: America/New_York, Europe/London, Asia/Tokyo, Australia/Sydney
- ✅ Automatic daylight saving time handling
- ✅ 400+ timezones supported

---

## 🎨 Unique Content Generation System

### Never Repeat Content

**6 Message Types (Rotates automatically):**

1. **Motivational Story** 📖
   - Real examples of people who overcame similar challenges
   - Concrete, relatable stories
   - "Let me tell you about..."

2. **Action Challenge** 🎯
   - ONE specific task to do today
   - Clear, actionable steps
   - "Here's your mission today..."

3. **Mindset Shift** 🧠
   - Reframe thinking about obstacles
   - New perspectives
   - "What if you looked at it this way..."

4. **Accountability Prompt** ⚡
   - Check-in on progress
   - Create urgency
   - "Let's be real for a second..."

5. **Celebration Message** 🎉
   - Recognize progress
   - Build confidence
   - "Look how far you've come..."

6. **Real World Example** 🌍
   - Business/sports/life analogies
   - Concrete comparisons
   - "Think of it like..."

### Anti-Repetition System

**How we ensure uniqueness:**

1. **Track Last 10 Messages**
   - Query message_history for user
   - Get last 10 message_types
   - Avoid recently used types

2. **High Creativity Settings**
   ```python
   temperature=0.9,          # Maximum creativity
   presence_penalty=0.6,     # Discourage repetition
   frequency_penalty=0.6     # Encourage variety
   ```

3. **Dynamic Context**
   - Current streak count (changes daily)
   - Random question selection
   - Message type rotation
   - Personality voice consistency

4. **Goal Integration**
   - NEVER copy/paste goals
   - Reference creatively
   - Weave into context naturally

---

## 🔥 Streak Tracking in Emails

### Visual Streak Display

**Milestone-based styling:**

| Streak | Emoji | Message | Style |
|--------|-------|---------|-------|
| 1 day | ✨ | Day 1 - Let's Go! | Start fresh |
| 2-6 days | 🔥 | X Days - Building! | Orange gradient |
| 7-29 days | 🔥 | X Days - On Fire! | Red/orange gradient |
| 30-99 days | 💎 | X Days - Elite Level! | Blue gradient |
| 100+ days | 🏆 | X DAYS! LEGENDARY! | Gold gradient |

### Email Streak Section

```html
<div class="streak-display">
    <div class="emoji">🔥</div>
    <div class="count">15</div>
    <div class="label">DAYS OF MOTIVATION</div>
</div>
```

**Placement:**
- Prominent at top of email
- Large, eye-catching design
- Color-coded by milestone
- Updates automatically

---

## 💬 Engaging Questions System

### 10 Rotating Questions

Questions added to EVERY email to encourage replies:

1. "What's one small action you can take RIGHT NOW toward this?"
2. "If you had to pick just ONE thing to focus on today, what would move the needle?"
3. "What's the biggest obstacle in your way, and how can you sidestep it?"
4. "Imagine it's 6 months from now and you've succeeded - what did you do differently?"
5. "What would you tell someone else in your position right now?"
6. "What's one excuse you're going to eliminate today?"
7. "Which part of your goal actually excites you most right now?"
8. "What's a micro-win you can celebrate from yesterday?"
9. "If you could ask your future successful self one question, what would it be?"
10. "What's one thing you know you should do but keep avoiding?"

### Question Placement

```
[Main motivational message]

💭 Question for you: [Random question from pool]

💬 Hit reply and share your thoughts - I read every response!
```

**Why questions work:**
- ✅ Creates engagement
- ✅ Makes users think deeply
- ✅ Encourages replies
- ✅ Feels personal (not broadcast)
- ✅ Builds relationship

---

## 📧 Email Design

### Modern, Engaging Layout

**Components:**
1. **Header** - Gradient background with streak badge
2. **Greeting** - Personalized with name + emoji
3. **Streak Display** - Large, prominent, milestone-specific
4. **Main Message** - Unique content (3-4 paragraphs)
5. **Question Box** - Highlighted with icon
6. **Reply Prompt** - Encouraging engagement
7. **Signature** - Personality attribution

**Colors:**
- Primary gradient: Purple to indigo (#667eea → #764ba2)
- Streak gradient: Pink to red (#f093fb → #f5576c)
- Text: Dark slate (#1a202c, #2d3748)
- Accents: Indigo, blue, orange based on context

**Typography:**
- Headers: 26-32px, bold
- Body: 16px, line-height 1.8
- Questions: 16px, medium weight
- Footer: 12-14px

---

## 🎭 Personality Consistency

### How Personalities Work

**Preset Personalities:**
- Elon Musk → Visionary, bold, tech-focused
- Steve Jobs → Design-obsessed, perfection-driven
- Oprah → Warm, empowering, spiritual
- Tony Robbins → High-energy, action-oriented

**AI Prompt:**
```python
f"Channel {personality.value}'s unique voice, style, and way of thinking. 
Use their characteristic phrases and perspectives."
```

**Consistency maintained through:**
- ✅ Same personality prompt each time
- ✅ Personality value stored in message history
- ✅ AI trained on public personality data
- ✅ Style guidelines in system message

---

## 🔄 Message Generation Flow

### Step-by-Step Process

```
1. Scheduler triggers at user's exact time (timezone-aware)
   ↓
2. Get user data (goals, name, personalities, streak)
   ↓
3. Update streak count
   ↓
4. Get last 10 messages (check message_types used)
   ↓
5. Choose message_type NOT used recently
   ↓
6. Select random engaging question
   ↓
7. Generate unique AI message with:
   - Personality voice
   - Message type guidelines
   - Streak context
   - Goal reference (creative, not copy-paste)
   - High creativity settings
   ↓
8. Append question to message
   ↓
9. Save to message_history with message_type
   ↓
10. Send email with streak display + question
    ↓
11. Track in activity_logs + version_history
```

---

## 📊 Admin Dashboard - Timezone Display

### User Card Enhanced

**Shows for each user:**
```
📅 Schedule: daily at 09:00
🌍 Timezone: America/New_York (Local: 09:23 AM)
🔥 Streak: 15 days
📧 Messages: 23
```

**Features:**
- ✅ Frequency highlighted in color
- ✅ Timezone with IANA name
- ✅ Current local time for that user
- ✅ Streak and message count emphasized

**Real-time timezone display:**
```javascript
{new Date().toLocaleTimeString('en-US', { 
  timeZone: user.schedule.timezone, 
  hour: '2-digit', 
  minute: '2-digit',
  hour12: true 
})}
```

---

## 🔍 Testing the System

### Verify Scheduling

**Check backend logs:**
```bash
tail -f /var/log/supervisor/backend.err.log | grep "Scheduled"
```

**Expected output:**
```
✅ Scheduled emails for user1@example.com at 09:00 America/New_York (daily)
✅ Scheduled emails for user2@example.com at 22:00 Asia/Kolkata (daily)
```

### Verify Uniqueness

**Query message history:**
```javascript
db.message_history.find({email: "user@example.com"}).sort({created_at: -1}).limit(10)
```

**Check:**
- ✅ Different message_type for each
- ✅ Different message content
- ✅ Different questions
- ✅ Increasing streak_at_time

### Test Email Sending

**Manual trigger:**
```bash
curl -X POST http://localhost:8001/api/send-now/user@example.com
```

**Check:**
- ✅ Email received
- ✅ Streak displayed correctly
- ✅ Question included
- ✅ Unique content
- ✅ Personality voice consistent

---

## 📈 Message Variety Stats

**Track message type distribution:**
```javascript
db.message_history.aggregate([
  {$group: {
    _id: "$message_type",
    count: {$sum: 1}
  }},
  {$sort: {count: -1}}
])
```

**Expected distribution:**
- Each message_type should be ~16-17% (balanced)
- No type should be >30% (good variety)
- Last 5 messages should have different types

---

## 🎯 Email Engagement Metrics

**Tracked per user:**
- Total emails sent
- Emails opened (if tracking added)
- Replies received
- Current streak
- Longest streak
- Message types used
- Personalities rotated

**Future enhancements:**
- Reply tracking
- Open rate tracking
- Click tracking (if links added)
- Sentiment analysis of replies
- Best performing message types

---

## 🔐 Privacy & Personalization

**What we store:**
- ✅ Message content (for anti-repetition)
- ✅ Message type (for variety)
- ✅ Streak at time of send
- ✅ Personality used
- ✅ Timestamp

**What we DON'T store:**
- ❌ Email content outside our system
- ❌ User replies (unless they use feedback form)
- ❌ Tracking pixels
- ❌ Third-party analytics

---

## ✅ Summary

**Timezone Scheduling:** ✅
- Each user gets emails at THEIR exact time
- Timezone-aware (handles DST automatically)
- Independent per-user jobs

**Content Uniqueness:** ✅
- 6 rotating message types
- Anti-repetition logic (last 10 messages)
- High AI creativity settings
- Never copy-pastes goals

**Engagement:** ✅
- Streak tracking (visual + milestones)
- 10 rotating questions
- Reply prompts
- Personal tone

**Admin Dashboard:** ✅
- Shows user timezone
- Displays local time for each user
- Highlights schedule details
- Streak information

**Result: Highly personalized, never-repeating, engaging motivation emails delivered at the perfect time for each user!** 🎯✨

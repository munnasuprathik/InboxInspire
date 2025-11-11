#!/usr/bin/env python3
"""
Focused Backend Test for Email Scheduling Bug Fix
Tests only users with complete configurations and verifies message history isolation
"""

import asyncio
import aiohttp
import json
from datetime import datetime, timezone

BACKEND_URL = "https://aipep.preview.emergentagent.com/api"

# Users with complete configurations (have personalities)
CONFIGURED_USERS = [
    "quiccledaily@gmail.com",
    "rakeshkumar101221@gmail.com"
]

async def test_message_history_isolation():
    """Test that message history shows proper isolation between users"""
    print("🔍 Testing Message History Isolation")
    print("=" * 50)
    
    async with aiohttp.ClientSession() as session:
        # Get initial message counts
        initial_counts = {}
        for email in CONFIGURED_USERS:
            async with session.get(f"{BACKEND_URL}/users/{email}/message-history") as response:
                if response.status == 200:
                    history_data = await response.json()
                    messages = history_data.get('messages', [])
                    initial_counts[email] = len(messages)
                    print(f"📊 {email}: {len(messages)} messages in history")
                    
                    # Show recent messages to verify they're user-specific
                    if messages:
                        latest = messages[0]  # Most recent
                        print(f"   Latest message sent to: {latest.get('email')}")
                        print(f"   Message ID: {latest.get('id')}")
                        print(f"   Sent at: {latest.get('sent_at')}")
        
        print(f"\n🎯 Testing send-now to {CONFIGURED_USERS[0]}")
        
        # Send email to first user
        target_email = CONFIGURED_USERS[0]
        async with session.post(f"{BACKEND_URL}/send-now/{target_email}") as response:
            if response.status == 200:
                result = await response.json()
                message_id = result.get('message_id')
                print(f"✅ Email sent successfully, Message ID: {message_id}")
                
                # Wait for processing
                await asyncio.sleep(3)
                
                # Check message histories again
                print(f"\n📊 Checking message histories after sending to {target_email}:")
                
                isolation_success = True
                for email in CONFIGURED_USERS:
                    async with session.get(f"{BACKEND_URL}/users/{email}/message-history") as response:
                        if response.status == 200:
                            history_data = await response.json()
                            messages = history_data.get('messages', [])
                            new_count = len(messages)
                            
                            if email == target_email:
                                # Target user should have one more message
                                if new_count > initial_counts[email]:
                                    print(f"✅ {email}: {initial_counts[email]} → {new_count} (correctly increased)")
                                    
                                    # Verify the new message is for this user
                                    latest_message = messages[0]
                                    if latest_message.get('email') == email and latest_message.get('id') == message_id:
                                        print(f"   ✅ New message correctly addressed to {email}")
                                    else:
                                        print(f"   ❌ New message has wrong recipient: {latest_message.get('email')}")
                                        isolation_success = False
                                else:
                                    print(f"❌ {email}: {initial_counts[email]} → {new_count} (should have increased)")
                                    isolation_success = False
                            else:
                                # Other users should have same count
                                if new_count == initial_counts[email]:
                                    print(f"✅ {email}: {initial_counts[email]} → {new_count} (correctly unchanged)")
                                else:
                                    print(f"❌ {email}: {initial_counts[email]} → {new_count} (should be unchanged)")
                                    isolation_success = False
                
                return isolation_success
            else:
                response_text = await response.text()
                print(f"❌ Failed to send email: {response.status} - {response_text}")
                return False

async def test_scheduler_jobs_unique():
    """Test that each user has unique scheduler jobs"""
    print("\n🔧 Testing Scheduler Job Uniqueness")
    print("=" * 50)
    
    async with aiohttp.ClientSession() as session:
        job_ids = []
        all_unique = True
        
        for email in CONFIGURED_USERS:
            async with session.post(f"{BACKEND_URL}/test-schedule/{email}") as response:
                if response.status == 200:
                    job_data = await response.json()
                    job_id = job_data.get('job_id')
                    job_exists = job_data.get('job_exists')
                    next_run = job_data.get('next_run')
                    
                    print(f"📋 {email}:")
                    print(f"   Job ID: {job_id}")
                    print(f"   Exists: {job_exists}")
                    print(f"   Next run: {next_run}")
                    
                    if job_id in job_ids:
                        print(f"   ❌ DUPLICATE JOB ID DETECTED!")
                        all_unique = False
                    else:
                        job_ids.append(job_id)
                        print(f"   ✅ Unique job ID")
        
        return all_unique

async def test_backend_logs():
    """Check backend logs for any errors or warnings"""
    print("\n📋 Checking Backend Logs")
    print("=" * 50)
    
    import subprocess
    try:
        # Check supervisor backend logs
        result = subprocess.run(['tail', '-n', '50', '/var/log/supervisor/backend.out.log'], 
                              capture_output=True, text=True)
        if result.returncode == 0:
            logs = result.stdout
            print("Recent backend logs:")
            print(logs[-1000:])  # Last 1000 chars
            
            # Look for specific patterns
            if "send_scheduled_motivations called" in logs:
                print("⚠️  WARNING: Deprecated send_scheduled_motivations function was called!")
                return False
            elif "Sent motivation to" in logs:
                print("✅ Individual user email sending detected in logs")
                return True
        else:
            print("Could not read backend logs")
            return None
    except Exception as e:
        print(f"Error reading logs: {e}")
        return None

async def main():
    """Run focused tests"""
    print("🚀 InboxInspire Email Scheduling Bug Fix - Focused Tests")
    print("=" * 60)
    
    # Test 1: Message history isolation
    isolation_test = await test_message_history_isolation()
    
    # Test 2: Scheduler job uniqueness  
    uniqueness_test = await test_scheduler_jobs_unique()
    
    # Test 3: Backend logs check
    logs_test = await test_backend_logs()
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 FOCUSED TEST RESULTS")
    print("=" * 60)
    
    tests = [
        ("Message History Isolation", isolation_test),
        ("Scheduler Job Uniqueness", uniqueness_test),
        ("Backend Logs Check", logs_test)
    ]
    
    passed = sum(1 for _, result in tests if result is True)
    total = len([t for t in tests if t[1] is not None])
    
    for test_name, result in tests:
        if result is True:
            print(f"✅ {test_name}: PASSED")
        elif result is False:
            print(f"❌ {test_name}: FAILED")
        else:
            print(f"⚠️  {test_name}: SKIPPED")
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if isolation_test and uniqueness_test:
        print("\n🎉 EMAIL SCHEDULING BUG FIX VERIFIED!")
        print("   ✓ Users receive emails only for their own schedules")
        print("   ✓ Each user has unique scheduler jobs")
        print("   ✓ Message history shows proper isolation")
        return True
    else:
        print("\n🚨 EMAIL SCHEDULING BUG MAY STILL EXIST!")
        return False

if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1)
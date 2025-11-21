"""
Email template and formatting utilities
"""
import html
import re
import secrets
import random
from typing import List
from datetime import datetime
# Note: derive_goal_theme is defined in this file, not imported


def _render_list_items(lines: List[str]) -> str:
    if not lines:
        return ""
    items = "".join(f"<li>{html.escape(line)}</li>" for line in lines)
    return f"<ul>{items}</ul>"


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


def generate_interactive_defaults(streak_count: int, goals: str) -> tuple[List[str], List[str]]:
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
    unsubscribe_url: str = "",
    days_since_start: int = 0,
) -> str:
    """Return a professional, modern HTML email body with excellent design."""
    safe_core = html.escape(core_message).replace("\n", "<br />")
    check_in_block = _render_list_items(check_in_lines)
    quick_reply_block = _render_list_items(quick_reply_lines)

    return f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Your Daily Motivation</title>
        <style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{ 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; 
                background: #ffffff;
                margin: 0; 
                padding: 0;
                color: #1a1a1a; 
                line-height: 1.6;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }}
            .email-container {{
                max-width: 600px;
                margin: 0 auto;
                background: #ffffff;
            }}
            .content-wrapper {{ 
                padding: 48px 40px;
            }}
            .streak-badge {{
                font-size: 10px;
                letter-spacing: 0.1em;
                text-transform: uppercase;
                color: #9ca3af;
                margin-bottom: 32px;
                font-weight: 500;
            }}
            .streak-badge strong {{
                color: #000000;
                font-weight: 600;
            }}
            .message-content {{
                font-size: 17px;
                line-height: 1.75;
                margin: 0 0 40px 0;
                color: #1a1a1a;
                letter-spacing: -0.01em;
            }}
            .message-content p {{
                margin-bottom: 20px;
            }}
            .message-content p:last-child {{
                margin-bottom: 0;
            }}
            .divider {{
                height: 1px;
                background: #f3f4f6;
                margin: 40px 0;
                border: none;
            }}
            .section {{
                margin: 32px 0;
            }}
            .section-title {{
                font-size: 10px;
                font-weight: 600;
                letter-spacing: 0.12em;
                text-transform: uppercase;
                color: #9ca3af;
                margin: 0 0 16px 0;
            }}
            .section-content {{
                font-size: 15px;
                line-height: 1.7;
                color: #4b5563;
            }}
            .section-content ul {{
                margin: 0;
                padding-left: 0;
                list-style: none;
            }}
            .section-content ul li {{
                margin-bottom: 10px;
                padding-left: 18px;
                position: relative;
            }}
            .section-content ul li:before {{
                content: "";
                position: absolute;
                left: 0;
                top: 10px;
                width: 4px;
                height: 4px;
                background: #d1d5db;
                border-radius: 50%;
            }}
            .section-content ul li:last-child {{
                margin-bottom: 0;
            }}
            .section-content p {{
                margin: 0;
            }}
            .signature {{
                margin-top: 48px;
                padding-top: 32px;
                border-top: 1px solid #f3f4f6;
                font-size: 14px;
                color: #6b7280;
            }}
            .footer {{
                padding: 32px 40px;
                text-align: center;
                border-top: 1px solid #f3f4f6;
                background: #fafafa;
            }}
            .footer p {{
                font-size: 11px;
                color: #9ca3af;
                margin: 6px 0;
                line-height: 1.5;
            }}
            .footer a {{
                color: #6b7280;
                text-decoration: none;
                transition: color 0.2s;
            }}
            .footer a:hover {{
                color: #1a1a1a;
            }}
            .unsubscribe-link {{
                display: inline-block;
                margin-top: 16px;
                padding: 8px 16px;
                background: transparent;
                border: 1px solid #e5e7eb;
                border-radius: 6px;
                color: #6b7280;
                text-decoration: none;
                font-size: 11px;
                font-weight: 500;
                transition: all 0.2s;
            }}
            .unsubscribe-link:hover {{
                background: #f9fafb;
                border-color: #d1d5db;
                color: #1a1a1a;
            }}
            @media (max-width: 600px) {{
                .content-wrapper {{
                    padding: 40px 28px;
                }}
                .message-content {{
                    font-size: 16px;
                }}
                .footer {{
                    padding: 28px 28px;
                }}
            }}
        </style>
    </head>
    <body>
        <div class="email-container">
            <div class="content-wrapper">
                <div class="streak-badge">
                    <strong>{html.escape(streak_icon)}</strong> {html.escape(streak_message)}
                    {f'<span style="margin-left: 16px; color: #6b7280;">| Day {days_since_start}</span>' if days_since_start > 0 else ''}
                </div>
                
                <div class="message-content">
                    {safe_core}
                </div>
                
                {f'<hr class="divider" /><div class="section"><p class="section-title">Check-In</p><div class="section-content">{check_in_block or "<p>What does today look like for you?</p>"}</div></div>' if check_in_block or True else ''}
                
                {f'<div class="section"><p class="section-title">Quick Reply</p><div class="section-content">{quick_reply_block or "<p>Reply with your next action.</p>"}</div></div>' if quick_reply_block or True else ''}
                
                <div class="signature">
                    — Tend
                </div>
            </div>
            <div class="footer">
                <p>You're receiving this because you subscribed to Tend.</p>
                {f'<a href="{unsubscribe_url}" class="unsubscribe-link">Unsubscribe</a>' if unsubscribe_url else ''}
                <p style="margin-top: 16px;">© {html.escape(str(datetime.now().year))} Tend. All rights reserved.</p>
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


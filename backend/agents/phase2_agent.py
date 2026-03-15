from google import genai
from google.genai import types
from backend.services.secrets import GEMINI_API_KEY
import json

client = genai.Client(api_key=GEMINI_API_KEY)

SILENCE_THRESHOLD = 3  # chunks before triggering overlay

async def run_battlefield_check(
    transcript_entry: dict,
    screen_context: dict,
    session_tasks: list
) -> dict:
    """
    Phase 2: Battlefield mode.
    Runs 4-layer check on every transcript entry.
    Returns overlay data if action needed.
    """

    text = transcript_entry.get("text", "")
    alert_type = transcript_entry.get("alert_type", "none")

    if alert_type == "none" or not text:
        return {"show_overlay": False}

    # Layer 1 — Fact Shield
    if alert_type == "wrong_fact":
        return await _fact_shield(text, screen_context)

    # Layer 2 — Question Anticipator
    elif alert_type == "question":
        return await _question_anticipator(text, screen_context)

    # Layer 3 — Negotiation Assistant
    elif alert_type == "decision":
        return await _negotiation_assistant(text, screen_context)

    # Layer 4 — Task Logger
    elif alert_type == "task_assigned":
        return await _task_logger(text, session_tasks)

    return {"show_overlay": False}


async def _fact_shield(claimed_text: str, screen_context: dict) -> dict:
    """Layer 1: Catch wrong facts in real time."""
    facts = screen_context.get("key_facts", [])
    prompt = f"""
    Someone just said: "{claimed_text}"
    Facts on screen: {json.dumps(facts)}
    
    Is there a factual error? Respond JSON:
    {{
        "show_overlay": true/false,
        "layer": "fact_shield",
        "title": "Fact Check",
        "message": "correct info to show host",
        "source": "where the correct info came from",
        "urgency": "high/medium/low"
    }}
    Only show_overlay=true if there's a CLEAR discrepancy.
    """
    return await _call_gemini(prompt, {"show_overlay": False})


async def _question_anticipator(question: str, screen_context: dict) -> dict:
    """Layer 2: Anticipate questions before they're asked."""
    facts = screen_context.get("key_facts", [])
    summary = screen_context.get("summary", "")
    prompt = f"""
    Someone is asking about: "{question}"
    Screen context: {summary}
    Available facts: {json.dumps(facts[:5])}
    
    What should the host know RIGHT NOW? Respond JSON:
    {{
        "show_overlay": true/false,
        "layer": "question_anticipator",
        "title": "Heads Up",
        "message": "key info host needs to answer well",
        "source": "document or screen source",
        "urgency": "high/medium/low"
    }}
    """
    return await _call_gemini(prompt, {"show_overlay": False})


async def _negotiation_assistant(decision_text: str, screen_context: dict) -> dict:
    """Layer 3: Help host during negotiations."""
    facts = screen_context.get("key_facts", [])
    prompt = f"""
    A decision/negotiation is happening: "{decision_text}"
    Context from screen: {json.dumps(facts[:5])}
    
    What should the host know? Respond JSON:
    {{
        "show_overlay": true/false,
        "layer": "negotiation",
        "title": "Negotiation Note",
        "message": "key info for host (limits, past agreed values)",
        "source": "screen source",
        "urgency": "high/medium/low"
    }}
    """
    return await _call_gemini(prompt, {"show_overlay": False})


async def _task_logger(task_text: str, existing_tasks: list) -> dict:
    """Layer 4: Log verbal task assignments."""
    prompt = f"""
    A task was just assigned verbally: "{task_text}"
    
    Extract task details. Respond JSON:
    {{
        "show_overlay": true,
        "layer": "task_logger",
        "title": "Task Assigned",
        "message": "tap to confirm logging this task",
        "task": {{
            "description": "clear task description",
            "owner": "person responsible",
            "deadline": "mentioned deadline or null",
            "priority": "high/medium/low"
        }},
        "urgency": "medium"
    }}
    """
    return await _call_gemini(prompt, {"show_overlay": False})


async def _call_gemini(prompt: str, fallback: dict) -> dict:
    """Helper to call Gemini and parse JSON response."""
    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.0-flash-001",
            contents=[types.Part(text=prompt)]
        )
        text = response.text.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())
    except Exception as e:
        print(f"Gemini call error: {e}")
        return fallback
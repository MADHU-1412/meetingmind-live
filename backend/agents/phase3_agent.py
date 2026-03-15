cat > backend/agents/phase3_agent.py << 'ENDOFFILE'
from google import genai
from google.genai import types
from backend.services.secrets import GEMINI_API_KEY, GCP_PROJECT_ID
from google.cloud import storage
import json
from datetime import datetime

client = genai.Client(api_key=GEMINI_API_KEY)

async def generate_summary(transcript: list) -> dict:
    transcript_text = "\n".join([
        f"{e.get('speaker', 'Unknown')}: {e.get('text', '')}"
        for e in transcript if e.get('text')
    ])
    prompt = f"""
    Analyze this meeting transcript and generate a complete summary.
    TRANSCRIPT: {transcript_text[:8000]}
    Respond ONLY in this JSON format:
    {{
        "title": "meeting title",
        "duration_summary": "brief description",
        "key_decisions": ["decision 1", "decision 2"],
        "action_items": [
            {{"task": "task description", "owner": "person", "deadline": null, "priority": "high/medium/low"}}
        ],
        "follow_up_required": true,
        "next_meeting": null
    }}
    """
    return await _call_gemini(prompt, {
        "title": "Meeting Summary",
        "duration_summary": "Meeting completed",
        "key_decisions": [],
        "action_items": [],
        "follow_up_required": False,
        "next_meeting": None
    })

async def generate_followup_emails(summary: dict, attendees: list) -> list:
    emails = []
    action_items = summary.get("action_items", [])
    for attendee in attendees:
        their_tasks = [t for t in action_items if attendee.lower() in t.get("owner", "").lower()]
        prompt = f"""
        Write a follow-up email for {attendee} after a meeting.
        Summary: {summary.get('duration_summary', '')}
        Their tasks: {json.dumps(their_tasks)}
        Respond ONLY in JSON:
        {{"to": "{attendee}", "subject": "subject line", "body": "email body 3-4 sentences", "tasks_mentioned": {len(their_tasks)}}}
        """
        email = await _call_gemini(prompt, {
            "to": attendee,
            "subject": "Follow-up from today's meeting",
            "body": f"Hi {attendee}, thank you for joining today's meeting.",
            "tasks_mentioned": len(their_tasks)
        })
        emails.append(email)
    return emails

async def save_to_storage(session_id: str, summary: dict, emails: list, tasks: list) -> str:
    try:
        storage_client = storage.Client(project=GCP_PROJECT_ID)
        bucket = storage_client.bucket(f"{GCP_PROJECT_ID}-docs")
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"{session_id}/summary_{timestamp}.json"
        output = {"session_id": session_id, "generated_at": timestamp, "summary": summary, "follow_up_emails": emails, "confirmed_tasks": tasks}
        blob = bucket.blob(filename)
        blob.upload_from_string(json.dumps(output, indent=2), content_type="application/json")
        return f"gs://{GCP_PROJECT_ID}-docs/{filename}"
    except Exception as e:
        print(f"Storage save error: {e}")
        return ""

async def run_phase3(session_id: str, transcript: list, tasks: list, attendees: list) -> dict:
    print(f"Phase 3 starting for session: {session_id}")
    summary = await generate_summary(transcript)
    all_tasks = tasks + summary.get("action_items", [])
    summary["action_items"] = all_tasks
    emails = await generate_followup_emails(summary, attendees)
    storage_path = await save_to_storage(session_id, summary, emails, tasks)
    return {"summary": summary, "emails": emails, "tasks": all_tasks, "storage_path": storage_path, "generated_at": datetime.utcnow().isoformat()}

async def _call_gemini(prompt: str, fallback: dict) -> dict:
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
        print(f"Gemini Phase 3 error: {e}")
        return fallback
ENDOFFILE
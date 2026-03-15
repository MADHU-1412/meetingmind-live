import json
from google import genai
from google.genai import types
from backend.services.secrets import GEMINI_API_KEY, GCP_PROJECT_ID
from google.cloud import storage

client = genai.Client(api_key=GEMINI_API_KEY)

async def run_phase3(session_id: str, transcript: list, tasks: list, attendees: list) -> dict:
    print(f"Phase 3 starting for session: {session_id}")
    transcript_text = "\n".join([f"{e.get('speaker','?')}: {e.get('text','')}" for e in transcript])
    tasks_text = "\n".join([f"- {t.get('description','')} (owner: {t.get('owner','?')}, deadline: {t.get('deadline','TBD')})" for t in tasks])

    prompt = f"""
You are MeetingMind. Analyze this meeting transcript and generate a complete post-meeting report.

TRANSCRIPT:
{transcript_text or 'No transcript available.'}

LOGGED TASKS:
{tasks_text or 'No tasks logged.'}

ATTENDEES: {', '.join(attendees) or 'Unknown'}

Respond ONLY in this JSON format:
{{
    "summary": "3-4 sentence meeting summary",
    "key_decisions": ["decision 1", "decision 2"],
    "action_items": [
        {{"description": "task", "owner": "person", "deadline": "date", "priority": "high/medium/low"}}
    ],
    "follow_up_emails": {{
        "attendee_name": "Dear X, following up on today's meeting..."
    }},
    "next_steps": ["step 1", "step 2"]
}}
"""
    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.0-flash-001",
            contents=[types.Part(text=prompt)]
        )
        text = response.text.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"): text = text[4:]
        result = json.loads(text.strip())

        try:
            storage_client = storage.Client(project=GCP_PROJECT_ID)
            bucket = storage_client.bucket(f"{GCP_PROJECT_ID}-docs")
            blob = bucket.blob(f"{session_id}/summary.json")
            blob.upload_from_string(json.dumps(result, indent=2))
            print(f"Phase 3 saved to GCS: {session_id}/summary.json")
        except Exception as e:
            print(f"GCS save error (non-fatal): {e}")

        return result
    except Exception as e:
        print(f"Phase 3 error: {e}")
        return {
            "summary": "Meeting completed. Summary generation encountered an error.",
            "key_decisions": [],
            "action_items": tasks,
            "follow_up_emails": {},
            "next_steps": []
        }

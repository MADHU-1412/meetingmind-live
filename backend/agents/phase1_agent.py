from google import genai
from google.genai import types
from backend.services.secrets import GEMINI_API_KEY, GCP_PROJECT_ID
from google.cloud import storage
import json

client = genai.Client(api_key=GEMINI_API_KEY)

async def get_meeting_docs(bucket_name: str, prefix: str = "") -> list:
    """Fetch relevant documents from Cloud Storage."""
    try:
        storage_client = storage.Client(project=GCP_PROJECT_ID)
        bucket = storage_client.bucket(bucket_name)
        blobs = bucket.list_blobs(prefix=prefix)
        docs = []
        for blob in blobs:
            if blob.name.endswith(".txt") or blob.name.endswith(".md"):
                content = blob.download_as_text()
                docs.append({
                    "name": blob.name,
                    "content": content[:2000]
                })
        return docs
    except Exception as e:
        print(f"Doc fetch error: {e}")
        return []

async def generate_briefing(meeting_info: dict) -> dict:
    """
    Phase 1: Generate pre-meeting briefing.
    meeting_info = {
        title, attendees, agenda, past_notes
    }
    """
    prompt = f"""
    You are a professional AI meeting assistant.
    Generate a concise pre-meeting briefing for the HOST.

    Meeting: {meeting_info.get('title', 'Untitled Meeting')}
    Attendees: {', '.join(meeting_info.get('attendees', []))}
    Agenda: {meeting_info.get('agenda', 'No agenda provided')}
    Past meeting notes: {meeting_info.get('past_notes', 'None')}

    Generate a briefing in JSON:
    {{
        "spoken_brief": "2-3 sentence voice briefing to read to host",
        "key_context": ["bullet 1", "bullet 2", "bullet 3"],
        "watch_out_for": ["thing to watch 1", "thing to watch 2"],
        "relevant_doc": "most relevant document name",
        "attendee_notes": [
            {{"name": "person", "note": "key thing about them"}}
        ]
    }}
    
    Keep spoken_brief under 40 words. Be sharp and specific.
    """

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
        print(f"Phase 1 error: {e}")
        return {
            "spoken_brief": f"Your meeting '{meeting_info.get('title')}' is starting. Stay sharp.",
            "key_context": [],
            "watch_out_for": [],
            "relevant_doc": "",
            "attendee_notes": []
        }

async def run_phase1(session_id: str, meeting_info: dict) -> dict:
    """Main Phase 1 entry point."""
    print(f"Phase 1 starting for session: {session_id}")

    # Get docs from storage
    docs = await get_meeting_docs(
        f"{GCP_PROJECT_ID}-docs",
        prefix=session_id
    )
    if docs:
        meeting_info["past_notes"] = "\n".join(
            [d["content"] for d in docs[:2]]
        )

    briefing = await generate_briefing(meeting_info)
    print(f"Phase 1 complete: {briefing.get('spoken_brief')}")
    return briefing
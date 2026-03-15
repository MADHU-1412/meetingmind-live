import os
from google.cloud import firestore
from datetime import datetime

db = firestore.Client(project=os.getenv("GCP_PROJECT_ID", "meetingmind-live"))

async def create_session(session_id, metadata):
    db.collection("meetingmind_sessions").document(session_id).set({"session_id": session_id, "created_at": datetime.utcnow(), "status": "active", "transcript": [], "tasks": [], "screen_context": {}, **metadata})

async def update_session(session_id, data):
    db.collection("meetingmind_sessions").document(session_id).update({**data, "updated_at": datetime.utcnow()})

async def get_session(session_id):
    doc = db.collection("meetingmind_sessions").document(session_id).get()
    return doc.to_dict() if doc.exists else {}

async def append_transcript(session_id, entry):
    db.collection("meetingmind_sessions").document(session_id).update({"transcript": firestore.ArrayUnion([{**entry, "timestamp": datetime.utcnow().isoformat()}])})

async def append_task(session_id, task):
    db.collection("meetingmind_sessions").document(session_id).update({"tasks": firestore.ArrayUnion([{**task, "logged_at": datetime.utcnow().isoformat(), "status": "pending"}])})

async def close_session(session_id):
    db.collection("meetingmind_sessions").document(session_id).update({"status": "completed", "ended_at": datetime.utcnow()})

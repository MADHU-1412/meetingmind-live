# MeetingMind Live 🧠

> The only AI agent that prepares you **before** a meeting, assists you **invisibly during** it, and **executes all follow-up** tasks after — fully autonomously.

**Live Demo:** https://meetingmind-live-743060312558.us-central1.run.app  
**Hackathon:** Gemini Live Agent Challenge by Google  
**Deadline:** March 17, 2026

---

## How It Works — 3 Phases

### Phase 1 — Pre-Meeting Briefing
Reads calendar invite, agenda, past notes from Cloud Storage. Speaks a voice briefing to the host only and surfaces the most relevant document.

### Phase 2 — Battlefield Mode (silent, during meeting)
Shows a visual overlay on host's screen only. Four live layers:
- **Fact Shield** — catches wrong numbers silently
- **Question Anticipator** — surfaces docs before you're asked
- **Negotiation Assistant** — shows deal limits and past agreed values
- **Silent Task Logger** — queues verbal task assignments for one-tap confirm

### Phase 3 — Post-Meeting Executor (fully autonomous)
Auto-generates summary, extracts action items, drafts follow-up emails, saves everything to Cloud Storage — before you close your laptop.

---


## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python 3.11) |
| Agent Framework | Google ADK |
| Real-time | WebSockets |
| Audio + Diarization | Gemini Live API |
| Vision | Gemini Vision |
| Summarization | Gemini Flash |
| Session Storage | Firestore |
| Deployment | Cloud Run |

---

## Quickstart
```bash
git clone https://github.com/MADHU-1412/meetingmind-live
cd meetingmind-live
pip install -r requirements.txt
cp .env.example .env
# Add your GEMINI_API_KEY and GCP_PROJECT_ID to .env
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8080
```

## Deploy to Cloud Run
```bash
bash infra/deploy.sh
```

---

## Architecture
```
Browser (host only)
    │  WebSocket
    ▼
Cloud Run (FastAPI + Google ADK)
    ├── Phase 1 Agent → Cloud Storage + Gemini Flash
    ├── Phase 2 Agent → Gemini Live API + Gemini Vision
    └── Phase 3 Agent → Gemini Flash + Firestore
```

---

*Built for the Gemini Live Agent Challenge · Google Cloud · March 2026*

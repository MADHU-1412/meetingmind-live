from backend.services.firestore import (
    create_session, update_session, get_session,
    append_transcript, append_task, close_session
)

import asyncio
from enum import Enum
from backend.agents.phase1_agent import run_phase1
from backend.agents.phase2_agent import run_battlefield_check
from backend.services.firestore import (
    create_session, update_session,
    append_transcript, append_task, close_session
)

class MeetingPhase(Enum):
    IDLE = "idle"
    PRE_MEETING = "pre_meeting"
    ACTIVE = "active"
    POST_MEETING = "post_meeting"
    COMPLETED = "completed"

class MeetingOrchestrator:
    """ADK-style orchestrator managing all 3 phases."""

    def __init__(self, session_id: str, websocket):
        self.session_id = session_id
        self.websocket = websocket
        self.phase = MeetingPhase.IDLE
        self.screen_context = {}
        self.transcript = []
        self.tasks = []

    async def start_session(self, meeting_info: dict):
        """Initialize session and run Phase 1."""
        self.phase = MeetingPhase.PRE_MEETING

        # Create Firestore session
        await create_session(self.session_id, {
            "meeting_title": meeting_info.get("title", "Meeting"),
            "attendees": meeting_info.get("attendees", [])
        })

        # Send Phase 1 status to frontend
        await self._send({
            "type": "phase1_starting",
            "message": "Preparing your briefing..."
        })

        # Run Phase 1
        briefing = await run_phase1(self.session_id, meeting_info)

        # Send briefing to frontend
        await self._send({
            "type": "phase1_complete",
            "briefing": briefing
        })

        self.phase = MeetingPhase.ACTIVE
        await update_session(self.session_id, {
            "phase": self.phase.value,
            "briefing": briefing
        })

    async def process_audio_result(self, audio_result: dict):
        """Process audio analysis result through Phase 2."""
        if self.phase != MeetingPhase.ACTIVE:
            return

        # Add to transcript
        self.transcript.append(audio_result)
        await append_transcript(self.session_id, audio_result)

        # Run Phase 2 battlefield check
        overlay = await run_battlefield_check(
            audio_result,
            self.screen_context,
            self.tasks
        )

        if overlay.get("show_overlay"):
            await self._send({
                "type": "overlay_alert",
                "alert": overlay
            })

    async def update_screen(self, screen_context: dict):
        """Update screen context from vision analysis."""
        self.screen_context = screen_context
        await update_session(self.session_id, {
            "screen_context": screen_context
        })

    async def log_task(self, task: dict):
        """Log confirmed task to Firestore."""
        self.tasks.append(task)
        await append_task(self.session_id, task)
        await self._send({
            "type": "task_logged",
            "task": task,
            "total_tasks": len(self.tasks)
        })

    async def end_meeting(self):
        """Transition to Phase 3."""
        from backend.agents.phase3_agent import run_phase3

        self.phase = MeetingPhase.POST_MEETING
        await close_session(self.session_id)

        await self._send({
            "type": "phase3_starting",
            "message": "Meeting ended. Generating your summary...",
            "transcript_length": len(self.transcript),
            "tasks_logged": len(self.tasks)
        })

    # Get attendees from session
        session = await get_session(self.session_id)
        attendees = session.get("attendees", [])

    # Run Phase 3
        result = await run_phase3(
            self.session_id,
            self.transcript,
            self.tasks,
            attendees
        )

    # Send complete results to frontend
        await self._send({
            "type": "phase3_complete",
            "result": result
        })

        self.phase = MeetingPhase.COMPLETED

    async def _send(self, data: dict):
        """Send message to frontend via WebSocket."""
        import json
        try:
            await self.websocket.send_text(json.dumps(data))
        except Exception as e:
            print(f"WebSocket send error: {e}")
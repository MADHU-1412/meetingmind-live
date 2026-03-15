from fastapi import FastAPI

app = FastAPI(title="MeetingMind Live")

@app.get("/")
async def root():
    return {"status": "MeetingMind Live is running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")

@app.get("/ui")
async def ui():
    return FileResponse("frontend/index.html")

from fastapi import FastAPI

app = FastAPI(title="MeetingMind Live")

@app.get("/")
async def root():
    return {"status": "MeetingMind Live is running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

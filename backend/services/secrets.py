cat > backend/services/secrets.py << 'EOF'
import os
from google.cloud import secretmanager
from dotenv import load_dotenv

load_dotenv()

def get_secret(secret_id: str) -> str:
    local_val = os.getenv(secret_id)
    if local_val:
        return local_val
    project_id = os.getenv("GCP_PROJECT_ID", "meetingmind-live")
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{project_id}/secrets/{secret_id}/versions/latest"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("UTF-8")

GEMINI_API_KEY = get_secret("GEMINI_API_KEY")
GCP_PROJECT_ID = get_secret("GCP_PROJECT_ID")
EOF
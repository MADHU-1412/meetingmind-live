#!/bin/bash
set -e
PROJECT_ID="meetingmind-live"
REGION="us-central1"
SERVICE_NAME="meetingmind-live"
SA="meetingmind-sa@${PROJECT_ID}.iam.gserviceaccount.com"
echo "Deploying MeetingMind Live to Cloud Run..."
gcloud config set project $PROJECT_ID
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --service-account $SA \
  --memory 2Gi \
  --cpu 2 \
  --set-env-vars GCP_PROJECT_ID=$PROJECT_ID,GCP_REGION=$REGION
echo "Done!"
gcloud run services describe $SERVICE_NAME --region $REGION --format="value(status.url)"

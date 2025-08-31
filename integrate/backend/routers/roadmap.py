# backend/routers/roadmap.py
import sys
from pathlib import Path

# IMPORTANT: Ensure the 'backend' directory is on sys.path for local development
current_file_dir = Path(__file__).resolve().parent
backend_dir = current_file_dir.parent # Go up one level from 'routers' to 'backend'
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, Optional, List

from core.db_core import DatabaseManager
from core.ai_core import generate_career_roadmap, get_tutor_explanation, get_chatbot_response

from dependencies import get_db_manager, get_current_user # CRITICAL: Import from dependencies (now relative)

router = APIRouter()

# Pydantic models for roadmap generation request
class RoadmapRequest(BaseModel):
    current_skills_input: str
    current_level: str
    goal_input: str
    goal_level: str
    duration: str
    study_hours: str

class ChatbotRequest(BaseModel):
    query: str
    history: List[Dict[str, str]]
    career_plan: Dict[str, Any]

class TutorRequest(BaseModel):
    topic: str

@router.post("/generate")
async def generate_roadmap_endpoint(
    request: RoadmapRequest,
    user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_db_manager)
):
    uid = user['uid']
    
    user_profile = request.dict()
    
    try:
        roadmap_output = generate_career_roadmap(user_profile)
        if not roadmap_output:
            raise HTTPException(status_code=500, detail="AI failed to generate a career roadmap.")
        
        # Optional: Save the generated roadmap to Firestore under the user's document
        # e.g., db.db.collection('users').document(uid).collection('roadmaps').add(roadmap_output)
        
        return roadmap_output
    except Exception as e:
        print(f"Error generating roadmap for user {uid}: {e}")
        raise HTTPException(status_code=500, detail=f"An internal server error occurred: {str(e)}")

@router.post("/tutor")
async def get_tutor_response_endpoint(
    request: TutorRequest,
    user: dict = Depends(get_current_user)
):
    try:
        tutor_response = get_tutor_explanation(request.topic)
        if not tutor_response:
            raise HTTPException(status_code=500, detail="AI tutor failed to provide an explanation.")
        return tutor_response
    except Exception as e:
        print(f"Error getting tutor explanation for user {user['uid']}: {e}")
        raise HTTPException(status_code=500, detail=f"An internal server error occurred: {str(e)}")

@router.post("/chat")
async def get_chatbot_response_endpoint(
    request: ChatbotRequest,
    user: dict = Depends(get_current_user)
):
    try:
        chatbot_response = get_chatbot_response(request.query, request.history, request.career_plan)
        if not chatbot_response:
            raise HTTPException(status_code=500, detail="AI chatbot failed to generate a response.")
        return chatbot_response
    except Exception as e:
        print(f"Error getting chatbot response for user {user['uid']}: {e}")
        raise HTTPException(status_code=500, detail=f"An internal server error occurred: {str(e)}")
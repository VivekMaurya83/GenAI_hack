# backend/routers/user.py
import sys
from pathlib import Path

# IMPORTANT: Ensure the 'backend' directory is on sys.path for local development
# This makes 'core' and 'dependencies' importable from this router.
current_file_dir = Path(__file__).resolve().parent
backend_dir = current_file_dir.parent # Go up one level from 'routers' to 'backend'
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, Optional

from core.db_core import DatabaseManager # Import the class for type hinting
from dependencies import get_db_manager, get_current_user # CRITICAL: Import from dependencies (now relative)

router = APIRouter()

class ResumeDetailsUpdateRequest(BaseModel):
    parsed_data: Dict[str, Any]
    file_name: Optional[str] = "EditedResume.txt"

@router.get("/profile")
async def get_user_profile(
    user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_db_manager)
) -> Dict[str, Any]:
    try:
        uid = user['uid']
        
        resume_data = db.fetch_resume_relational(user_uid=uid, get_optimized=False)
        
        profile_response = {
            "uid": uid,
            "name": user.get("name") or (resume_data.get('personal_info', {}).get('name') if resume_data else None),
            "email": user.get("email") or (resume_data.get('personal_info', {}).get('email') if resume_data else None),
            "phone": resume_data.get('personal_info', {}).get('phone') if resume_data else None,
            "linkedin": resume_data.get('personal_info', {}).get('linkedin') if resume_data else None,
            "github": resume_data.get('personal_info', {}).get('github') if resume_data else None,
            "resume_content": resume_data or {}
        }
        
        return profile_response

    except Exception as e:
        print(f"Error fetching user profile or resume for UID {user.get('uid', 'N/A')}: {e}")
        raise HTTPException(status_code=500, detail=f"An internal server error occurred: {str(e)}")

@router.put("/profile/resume-details")
async def update_user_resume_details(
    request: ResumeDetailsUpdateRequest,
    user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_db_manager)
):
    uid = user['uid']
    
    file_name_to_use = request.file_name or "EditedResume.txt"
    
    success = db.update_resume_relational(
        user_uid=uid,
        file_name=file_name_to_use,
        parsed_data=request.parsed_data
    )
    
    if success:
        return {"message": "Resume details updated successfully."}
    else:
        raise HTTPException(status_code=500, detail="Failed to update resume details in the database.")
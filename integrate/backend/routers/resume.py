# backend/routers/resume.py
import sys
from pathlib import Path

# IMPORTANT: Ensure the 'backend' directory is on sys.path for local development
current_file_dir = Path(__file__).resolve().parent
backend_dir = current_file_dir.parent # Go up one level from 'routers' to 'backend'
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import os
import io
import tempfile
import json
from fastapi import APIRouter, File, UploadFile, HTTPException, Form, Depends
from pydantic import BaseModel
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi import Path
from typing import Dict, Any, Optional

from core.db_core import DatabaseManager
from core.ai_core import (
    extract_text_auto,
    get_resume_structure,
    categorize_skills_from_text,
    optimize_resume_json,
    optimize_for_linkedin,
    save_resume_json_to_docx
)

from dependencies import get_db_manager, get_current_user # CRITICAL: Import from dependencies (now relative)

router = APIRouter()

class OptimizeRequest(BaseModel):
    user_request: str

@router.get("/{user_uid}")
async def get_user_optimized_resume(user_uid: str = Path(..., description="The UID of the user whose resume is to be fetched."),
                                    user: dict = Depends(get_current_user),
                                    db: DatabaseManager = Depends(get_db_manager)):
    if user_uid != user['uid']:
        raise HTTPException(status_code=403, detail="Not authorized to access this user's resume.")

    try:
        resume_data = db.fetch_resume_relational(user_uid, get_optimized=True)
        if not resume_data:
            raise HTTPException(status_code=404, detail="No resume data found for this user.")
        return JSONResponse(content=resume_data)
    except Exception as e:
        print(f"Error fetching user optimized resume for UID {user_uid}: {e}")
        raise HTTPException(status_code=500, detail=f"An internal server error occurred: {str(e)}")


@router.post("/upload")
async def upload_and_process_resume(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_db_manager)
):
    uid = user['uid']
    
    suffix = os.path.splitext(file.filename)[1]
    tmp_file_path: Optional[str] = None
    try:
        os.makedirs("temp_resume_uploads", exist_ok=True)
        file_location = os.path.join("temp_resume_uploads", file.filename)
        with open(file_location, "wb+") as file_object:
            file_object.write(await file.read())
        tmp_file_path = file_location

        resume_text = extract_text_auto(tmp_file_path)
        if not resume_text:
            raise HTTPException(status_code=400, detail="Could not extract text from file.")
        
        structured_data = get_resume_structure(resume_text)
        if not structured_data:
            raise HTTPException(status_code=500, detail="AI failed to structure the resume.")
            
        categorized_skills = categorize_skills_from_text(resume_text)
        if categorized_skills:
            structured_data['skills'] = categorized_skills
        
        success = db.update_resume_relational(
            user_uid=uid,
            file_name=file.filename,
            parsed_data=structured_data
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save processed resume data.")
        
        return JSONResponse(content={"message": "Resume uploaded and processed successfully!", "user_uid": uid})
    except Exception as e:
        print(f"Resume upload error for user {uid}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error during resume processing: {str(e)}")
    finally:
        if tmp_file_path and os.path.exists(tmp_file_path):
            os.remove(tmp_file_path)


@router.post("/optimize")
async def optimize_resume(request_data: OptimizeRequest, user: dict = Depends(get_current_user),
                          db: DatabaseManager = Depends(get_db_manager)):
    uid = user['uid']
    
    try:
        resume_to_optimize = db.fetch_resume_relational(uid, get_optimized=False)
        if not resume_to_optimize:
            raise HTTPException(status_code=404, detail="Resume not found for this user.")
        
        optimized_data = optimize_resume_json(resume_to_optimize, request_data.user_request)
        
        db.update_optimized_resume_relational(uid, optimized_data)
        
        return JSONResponse(content={
            "message": "Optimization successful",
            "download_url": f"/api/resume/download/{uid}"
        })
    except Exception as e:
        print(f"Error during resume optimization for user {uid}: {e}")
        raise HTTPException(status_code=500, detail=f"An internal server error occurred during optimization: {str(e)}")


@router.post("/linkedin-optimize")
async def optimize_linkedin_profile(request_data: OptimizeRequest, user: dict = Depends(get_current_user),
                                   db: DatabaseManager = Depends(get_db_manager)):
    uid = user['uid']

    try:
        resume_data = db.fetch_resume_relational(uid, get_optimized=False)
        if not resume_data:
            raise HTTPException(status_code=404, detail="Resume not found for this user.")
        
        linkedin_content = optimize_for_linkedin(resume_data, request_data.user_request)
        if not linkedin_content:
            raise HTTPException(status_code=500, detail="AI failed to generate LinkedIn content.")
        
        return JSONResponse(content=linkedin_content)
    except Exception as e:
        print(f"Error during LinkedIn optimization for user {uid}: {e}")
        raise HTTPException(status_code=500, detail=f"An internal server error occurred during LinkedIn optimization: {str(e)}")


@router.get("/download/{user_uid}")
async def download_resume(user_uid: str = Path(..., description="The UID of the user whose optimized resume is to be downloaded."),
                          user: dict = Depends(get_current_user),
                          db: DatabaseManager = Depends(get_db_manager)):
    if user_uid != user['uid']:
        raise HTTPException(status_code=403, detail="Not authorized to download this user's resume.")

    try:
        final_data_for_doc = db.fetch_resume_relational(user_uid, get_optimized=True)
        if not final_data_for_doc:
            raise HTTPException(status_code=404, detail="Could not find optimized resume data for this user.")
        
        doc = save_resume_json_to_docx(final_data_for_doc)
        
        buffer = io.BytesIO()
        doc.save(buffer)
        buffer.seek(0)
        
        resume_metadata = final_data_for_doc.get('resume_metadata', {})
        original_filename = resume_metadata.get('file_name', 'resume')
        base_name = os.path.splitext(original_filename)[0]
        
        return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                                 headers={"Content-Disposition": f"attachment; filename=Optimized_{base_name}.docx"})
    except Exception as e:
        print(f"Error during resume DOCX generation for user {user_uid}: {e}")
        raise HTTPException(status_code=500, detail=f"An error occurred during file generation: {str(e)}")
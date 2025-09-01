# backend/routers/joblisting.py
import sys
from pathlib import Path
from collections import defaultdict
import os # For file cleanup
import json # For JSONResponse
import tempfile # For temporary file handling

# IMPORTANT: Local sys.path adjustment for local development imports
current_file_dir = Path(__file__).resolve().parent
backend_dir = current_file_dir.parent # Go up one level from 'routers' to 'backend'
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))
    print(f"DEBUG: Added {backend_dir} to sys.path from routers/joblisting.py") # DIAGNOSTIC PRINT

from fastapi import APIRouter, File, UploadFile, Query, HTTPException, Depends
from fastapi.responses import JSONResponse
from typing import List, Dict, Any, Optional

# Import job-related core logic from new modules
from core.adzuna_client import fetch_jobs
from core.job_processor import extract_skills_from_text, get_job_ratings_in_one_call
from core.ai_core import extract_text_auto # Re-use existing text extractor from ai_core

# Import dependencies for authentication
from dependencies import get_current_user

router = APIRouter()

@router.post("/find_jobs/") # Endpoint for frontend to hit
async def upload_resume_and_find_jobs(
    file: UploadFile = File(..., description="The user's resume in PDF format."),
    location: str = Query("India", description="The country or city to search for jobs in (e.g., 'USA', 'London')"),
    user: Dict[str, Any] = Depends(get_current_user) # Authenticate the user
) -> JSONResponse:
    """
    Uploads a user's resume, extracts skills, fetches relevant job listings from Adzuna,
    rates them using Gemini AI, and returns a sorted list of top job matches.
    """
    uid = user['uid']
    print(f"DEBUG: User {uid} uploading resume for job search in {location}.")

    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported for resume upload.")

    tmp_file_path: Optional[str] = None
    try:
        # Create a temporary file to save the uploaded content
        os.makedirs("temp_resume_uploads", exist_ok=True)
        # Use tempfile to create a secure temporary file name
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf", dir="temp_resume_uploads") as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file_path = tmp_file.name
        
        print(f"DEBUG: Temporary resume file saved to: {tmp_file_path}")

        # Extract text using ai_core's function
        resume_text = extract_text_auto(tmp_file_path)
        if not resume_text:
            raise HTTPException(status_code=400, detail="Could not extract text from resume PDF.")
        
        user_skills = extract_skills_from_text(resume_text) # Use the new extract_skills_from_text
        print(f"DEBUG: Extracted skills: {user_skills}")

        if not user_skills:
            return JSONResponse(content={"skills": [], "jobs": [], "message": "No relevant skills found in your resume to search for jobs."})

        # Fetch jobs for each skill and deduplicate
        unique_jobs_dict = {}
        # Fetch up to 50 jobs in total to have a good pool for rating, adjust results_per_page
        adzuna_results_per_skill = max(1, 50 // len(user_skills)) # Distribute fetches if many skills
        
        for skill in user_skills:
            # Call the Adzuna client's fetch_jobs function
            job_results = fetch_jobs(skill, location=location, results_per_page=adzuna_results_per_skill)
            for job in job_results:
                job_identifier = (job.get("title"), job.get("company", {}).get("display_name"), job.get("location", {}).get("display_name"))
                if job_identifier not in unique_jobs_dict:
                    job['match_skill'] = skill # Store which skill initially matched this job
                    unique_jobs_dict[job_identifier] = job
        
        unique_jobs_list = list(unique_jobs_dict.values())
        print(f"DEBUG: Found {len(unique_jobs_list)} unique jobs from Adzuna.")

        if not unique_jobs_list:
            return JSONResponse(content={"skills": user_skills, "jobs": [], "message": f"No jobs found for your skills in {location}."})

        # Rate jobs using Gemini AI in one call (from job_processor)
        rated_jobs = get_job_ratings_in_one_call(unique_jobs_list, user_skills)
        print(f"DEBUG: Rated {len(rated_jobs)} jobs with AI.")

        # Consolidate and select top jobs (logic from your original main.py, refined)
        jobs_by_skill = defaultdict(list)
        for job in rated_jobs:
            if job.get('match_skill'):
                jobs_by_skill[job['match_skill']].append(job)

        final_top_jobs = []
        seen_jobs = set()

        # Add the highest rated job per unique skill
        for skill in user_skills:
            # Sort jobs for this skill by rating to pick the best one
            sorted_jobs_for_skill = sorted(jobs_by_skill[skill], key=lambda x: x.get('rating', 0), reverse=True)
            if sorted_jobs_for_skill:
                job = sorted_jobs_for_skill[0] # Take the top job for this skill
                job_tuple = (job.get('title'), job.get('company', {}).get("display_name"), job.get("location", {}).get("display_name"))
                if job_tuple not in seen_jobs:
                    final_top_jobs.append(job)
                    seen_jobs.add(job_tuple)

        # Fill up remaining slots (up to a total of 7) with the highest rated overall jobs
        all_rated_jobs_sorted = sorted(rated_jobs, key=lambda x: x.get('rating', 0), reverse=True)
        for job in all_rated_jobs_sorted:
            if len(final_top_jobs) >= 7: # Limit to top 7 total jobs
                break
            job_tuple = (job.get('title'), job.get('company', {}).get("display_name"), job.get("location", {}).get("display_name"))
            if job_tuple not in seen_jobs:
                final_top_jobs.append(job)
                seen_jobs.add(job_tuple)
        
        # Final sort of the selected jobs by rating
        final_top_jobs_sorted_by_rating = sorted(final_top_jobs, key=lambda x: x.get('rating', 0), reverse=True)

        # Reformat the final job list for the frontend
        formatted_jobs = []
        for job in final_top_jobs_sorted_by_rating:
            formatted_job = {
                "title": job.get("title", "N/A"),
                "company": job.get("company", {}).get("display_name", "N/A"),
                "location": job.get("location", {}).get("display_name", "N/A"),
                "url": job.get("redirect_url", "#"),
                "match_skill": job.get("match_skill", "N/A"),
                "rating": job.get("rating", 0),
                "reason": job.get("reason", "No reason provided.")
            }
            formatted_jobs.append(formatted_job)
        
        print(f"DEBUG: Returning {len(formatted_jobs)} formatted jobs to frontend.")
        return JSONResponse(content={"skills": user_skills, "jobs": formatted_jobs})

    except HTTPException as e:
        print(f"HTTPException in /find_jobs/ for user {uid}: {e.detail}")
        raise
    except Exception as e:
        print(f"Unexpected error in /find_jobs/ for user {uid}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error during job search: {str(e)}")
    finally:
        if tmp_file_path and os.path.exists(tmp_file_path):
            os.remove(tmp_file_path)
            print(f"DEBUG: Cleaned up temporary file: {tmp_file_path}")
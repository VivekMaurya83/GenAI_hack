import os
import io
import tempfile
import uvicorn
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

# Import all the backend logic from our other file
import backend

# =========================
# FastAPI Application Setup
# =========================
app = FastAPI(
    title="AI Resume Optimizer API",
    description="An API to upload, parse, optimize, and download resumes.",
    version="1.0.0"
)

# --- CORS Configuration ---
# This remains important for allowing the frontend to communicate with the backend.
origins = [
    "http://localhost", "http://localhost:8080", "http://localhost:5500",
    "http://127.0.0.1", "http://127.0.0.1:8080", "http://127.0.0.1:5500",
    "null"
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# =========================
# API Endpoints
# =========================
# The API logic remains unchanged, as it was already correct.

@app.get("/api")
def read_api_root():
    return JSONResponse(content={"message": "AI Resume Optimizer API is running."})

@app.post("/api/upload")
async def upload_and_parse_resume(file: UploadFile = File(...)):
    db = None
    try:
        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file_path = tmp_file.name
        
        resume_text = backend.extract_text_auto(tmp_file_path)
        if not resume_text: raise HTTPException(status_code=400, detail="Could not extract text from file.")
        structured_data = backend.get_resume_structure(resume_text)
        if not structured_data: raise HTTPException(status_code=500, detail="AI failed to structure the resume.")
        categorized_skills = backend.categorize_skills_from_text(resume_text)
        if categorized_skills: structured_data['skills'] = categorized_skills
        
        db = backend.DatabaseManager()
        resume_id = db.save_resume_relational(file.filename, structured_data)
        parsed_data = db.fetch_resume_relational(resume_id, get_optimized=False)
        return JSONResponse(content={"resume_id": resume_id, "parsed_data": parsed_data})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
    finally:
        if db: db.close_connection()
        if 'tmp_file_path' in locals() and os.path.exists(tmp_file_path): os.remove(tmp_file_path)

@app.post("/api/optimize")
async def optimize_resume(resume_id: int = Form(...), user_request: str = Form(...)):
    db = None
    try:
        db = backend.DatabaseManager()
        resume_to_optimize = db.fetch_resume_relational(resume_id, get_optimized=False)
        if not resume_to_optimize: raise HTTPException(status_code=404, detail="Resume not found.")
        optimized_data = backend.optimize_resume_json(resume_to_optimize, user_request)
        db.update_optimized_resume_relational(resume_id, optimized_data)
        return JSONResponse(content={"message": "Optimization successful", "download_url": f"/api/download/{resume_id}"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during optimization: {str(e)}")
    finally:
        if db: db.close_connection()

# In backend/main.py, add this new endpoint:

@app.post("/api/linkedin-optimize")
async def optimize_linkedin_profile(resume_id: int = Form(...), user_request: str = Form(...)):
    """
    Fetches original resume data and generates optimized LinkedIn content based on user input.
    """
    db = None
    try:
        db = backend.DatabaseManager()
        
        resume_data = db.fetch_resume_relational(resume_id, get_optimized=False)
        if not resume_data:
            raise HTTPException(status_code=404, detail="Resume not found in database.")
            
        # Call the updated LinkedIn optimization function with the user's request
        linkedin_content = backend.optimize_for_linkedin(resume_data, user_request)
        if not linkedin_content:
            raise HTTPException(status_code=500, detail="AI failed to generate LinkedIn content.")
            
        return JSONResponse(content=linkedin_content)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during LinkedIn optimization: {str(e)}")
    finally:
        if db: db.close_connection()


@app.get("/api/download/{resume_id}")
async def download_resume(resume_id: int):
    db = None
    try:
        db = backend.DatabaseManager()
        final_data_for_doc = db.fetch_resume_relational(resume_id, get_optimized=True)
        if not final_data_for_doc: raise HTTPException(status_code=404, detail="Could not find data.")
        doc = backend.save_resume_json_to_docx(final_data_for_doc)
        buffer = io.BytesIO()
        doc.save(buffer)
        buffer.seek(0)
        return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                                 headers={"Content-Disposition": f"attachment; filename=Optimized_Resume_{resume_id}.docx"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred during file generation: {str(e)}")
    finally:
        if db: db.close_connection()

# =========================
# Static File Serving (The FIX)
# =========================
# This MUST be placed AFTER your API routes.
# It tells FastAPI that any request that doesn't match an API endpoint above
# should be treated as a request for a file from the 'frontend' directory.

app.mount("/", StaticFiles(directory="../frontend", html=True), name="static")

# =========================
# Main Execution Block
# =========================
if __name__ == "__main__":
    print("Starting AI Resume Optimizer API server...")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
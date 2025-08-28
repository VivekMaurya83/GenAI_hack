import os, io, tempfile, uvicorn
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, HTTPException,Response
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

import backend

# --- Pydantic model for request validation ---
class OptimizeRequest(BaseModel):
    resume_id: str # Firebase IDs are strings
    user_request: str

app = FastAPI(title="AI Resume Optimizer API", version="1.0.0")

origins = ["http://localhost", "http://localhost:8080", "http://localhost:5500", "http://127.0.0.1", "http://127.0.0.1:8080", "http://127.0.0.1:5500", "null"]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.post("/api/upload")
async def upload_and_parse_resume(file: UploadFile = File(...)):
    db = None
    try:
        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
            content = await file.read(); tmp_file.write(content); tmp_file_path = tmp_file.name
        resume_text = backend.extract_text_auto(tmp_file_path)
        if not resume_text: raise HTTPException(status_code=400, detail="Could not extract text from file.")
        structured_data = backend.get_resume_structure(resume_text)
        if not structured_data: raise HTTPException(status_code=500, detail="AI failed to structure the resume.")
        categorized_skills = backend.categorize_skills_from_text(resume_text)
        if categorized_skills: structured_data['skills'] = categorized_skills
        db = backend.DatabaseManager()
        resume_id = db.save_resume_relational(file.filename, structured_data)
        return JSONResponse(content={"resume_id": resume_id})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
    finally:
        if db: db.close_connection()
        if 'tmp_file_path' in locals() and os.path.exists(tmp_file_path): os.remove(tmp_file_path)

@app.post("/api/optimize")
async def optimize_resume(request_data: OptimizeRequest):
    db = None
    try:
        db = backend.DatabaseManager()
        resume_to_optimize = db.fetch_resume_relational(request_data.resume_id, get_optimized=False)
        if not resume_to_optimize: raise HTTPException(status_code=404, detail="Resume not found.")
        optimized_data = backend.optimize_resume_json(resume_to_optimize, request_data.user_request)
        db.update_optimized_resume_relational(request_data.resume_id, optimized_data)
        return JSONResponse(content={"message": "Optimization successful", "download_url": f"/api/download/{request_data.resume_id}"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during optimization: {str(e)}")
    finally:
        if db: db.close_connection()

@app.post("/api/linkedin-optimize")
async def optimize_linkedin_profile(request_data: OptimizeRequest):
    db = None
    try:
        db = backend.DatabaseManager()
        resume_data = db.fetch_resume_relational(request_data.resume_id, get_optimized=False)
        if not resume_data: raise HTTPException(status_code=404, detail="Resume not found.")
        linkedin_content = backend.optimize_for_linkedin(resume_data, request_data.user_request)
        if not linkedin_content: raise HTTPException(status_code=500, detail="AI failed to generate LinkedIn content.")
        return JSONResponse(content=linkedin_content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during LinkedIn optimization: {str(e)}")
    finally:
        if db: db.close_connection()

@app.get("/api/download/{resume_id}")
async def download_resume(resume_id: str):
    db = None
    try:
        db = backend.DatabaseManager()
        final_data_for_doc = db.fetch_resume_relational(resume_id, get_optimized=True)
        if not final_data_for_doc: raise HTTPException(status_code=404, detail="Could not find data.")
        doc = backend.save_resume_json_to_docx(final_data_for_doc)
        buffer = io.BytesIO(); doc.save(buffer); buffer.seek(0)
        return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                                 headers={"Content-Disposition": f"attachment; filename=Optimized_Resume.docx"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred during file generation: {str(e)}")
    finally:
        if db: db.close_connection()
        
@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
    favicon_path = frontend_dir / "favicon.ico"
    if favicon_path.exists():
        return FileResponse(favicon_path)
    return Response(status_code=204)

backend_dir = Path(__file__).resolve().parent
root_dir = backend_dir.parent
frontend_dir = root_dir / "frontend"
app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="static")

if __name__ == "__main__":
    print("Starting AI Resume Optimizer API server...")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
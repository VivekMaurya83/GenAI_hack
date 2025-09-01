from fastapi import FastAPI, File, UploadFile, Query
from fastapi.middleware.cors import CORSMiddleware
import fitz  # PyMuPDF for PDF parsing
import requests
import re
import google.generativeai as genai
import os
import json
from collections import defaultdict

app = FastAPI()

# Allow frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🔑 Replace with your Adzuna API credentials
ADZUNA_APP_ID = ""
ADZUNA_APP_KEY = ""

# 🔑 Replace with your Gemini API Key
GEMINI_API_KEY=""

# Configure the Gemini API
genai.configure(api_key=GEMINI_API_KEY)

def extract_text_from_pdf(pdf_file):
    """Extract text from uploaded resume PDF"""
    doc = fitz.open(stream=pdf_file, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
    return text

def extract_skills(text):
    """Simple skill extractor (could be improved with NLP)"""
    skills_list = ["Python", "Java", "C++", "SQL", "JavaScript", "React", "Node.js", "AWS", "Machine Learning", "Data Analysis"]
    found = [skill for skill in skills_list if re.search(rf"\b{skill}\b", text, re.IGNORECASE)]
    return list(set(found)) # Use set to get unique skills

def fetch_jobs(query, location="India", results_per_page=20):
    """Fetch jobs from Adzuna API based on query and location"""
    # Adzuna uses different endpoints for different countries, we'll keep it simple by passing country name
    # For a production app, you might map country names to country codes (e.g., "USA" -> "us")
    country_code = "in" # Default to India
    if location.lower() in ["usa", "us", "united states"]:
        country_code = "us"
    elif location.lower() in ["uk", "gb", "united kingdom"]:
        country_code = "gb"
    
    url = f"https://api.adzuna.com/v1/api/jobs/{country_code}/search/1"
    params = {
        "app_id": ADZUNA_APP_ID,
        "app_key": ADZUNA_APP_KEY,
        "results_per_page": results_per_page,
        "what": query,
        "where": location # Adzuna can often use the location name for more specific searches
    }
    response = requests.get(url, params=params)
    if response.status_code == 200:
        return response.json().get("results", [])
    print(f"Adzuna API Error for {query} in {location}: {response.status_code} - {response.text}")
    return []

def get_job_ratings_in_one_call(jobs, skills):
    """
    Rates and summarizes a list of jobs in a single API call to Gemini.
    """
    if not jobs:
        return []

    model = genai.GenerativeModel('gemini-1.5-flash')

    prompt_parts = [
        f"Based on the following skills from a user's resume: {', '.join(skills)}.",
        "Please evaluate the list of job descriptions below.",
        "For each job, provide a rating from 1 to 10 on how well it matches the skills, and a single sentence reason.",
        "IMPORTANT: You MUST respond with ONLY a valid JSON array of objects. Do not include any other text, explanations, or code markers.",
        "Each JSON object must have exactly three keys: 'id' (the original job index as an integer), 'rating' (an integer 1-10), and 'reason' (a string).",
        "CRITICAL: Ensure every object in the array is separated by a comma.",
        "\nHere are the jobs:\n"
    ]

    for i, job in enumerate(jobs):
        prompt_parts.append(
            f"--- Job {i} ---\n"
            f"Title: {job.get('title')}\n"
            f"Company: {job.get('company', {}).get('display_name')}\n"
            f"Description: {job.get('description', 'No description available.').replace('---', '-')}\n"
        )
    
    final_prompt = "\n".join(prompt_parts)

    try:
        response = model.generate_content(final_prompt)
        raw_text = response.text
        
        json_match = re.search(r'\[.*\]', raw_text, re.DOTALL)
        if not json_match:
            print("Error: Gemini did not return a valid JSON array structure.")
            print("GEMINI RESPONSE:", raw_text)
            for job in jobs: job.update({'rating': 0, 'reason': "Error: Invalid response format from AI."})
            return jobs

        json_str = json_match.group(0)

        try:
            ratings_data = json.loads(json_str)
        except json.JSONDecodeError:
            fixed_json_str = re.sub(r'}\s*{', '},{', json_str)
            try:
                ratings_data = json.loads(fixed_json_str)
            except json.JSONDecodeError as e:
                print(f"JSON parsing failed again after attempting a fix: {e}")
                for job in jobs: job.update({'rating': 0, 'reason': "Error: Could not parse AI response."})
                return jobs

        for rating_info in ratings_data:
            job_id = rating_info.get('id')
            if job_id is not None and isinstance(job_id, int) and 0 <= job_id < len(jobs):
                jobs[job_id]['rating'] = rating_info.get('rating', 0)
                jobs[job_id]['reason'] = rating_info.get('reason', 'N/A')

    except Exception as e:
        print(f"A critical error occurred while processing jobs with Gemini: {e}")
        for job in jobs:
            job['rating'] = 0
            job['reason'] = "Error during rating process."

    return jobs


@app.post("/upload_resume/")
async def upload_resume(
    file: UploadFile = File(...), 
    location: str = Query("India", description="The country or city to search for jobs in (e.g., 'USA', 'London')")
):
    content = await file.read()
    text = extract_text_from_pdf(content)
    skills = extract_skills(text)

    if not skills:
        return {"skills": [], "jobs": []}

    unique_jobs_dict = {}
    for skill in skills:
        # Pass the location parameter to the fetch_jobs function
        job_results = fetch_jobs(skill, location=location, results_per_page=20)
        for job in job_results:
            job_identifier = (job.get("title"), job.get("company", {}).get("display_name"), job.get("location", {}).get("display_name"))
            if job_identifier not in unique_jobs_dict:
                job['match_skill'] = skill
                unique_jobs_dict[job_identifier] = job
    
    unique_jobs_list = list(unique_jobs_dict.values())
    rated_jobs = get_job_ratings_in_one_call(unique_jobs_list, skills)

    jobs_by_skill = defaultdict(list)
    for job in rated_jobs:
        if job.get('match_skill'):
            jobs_by_skill[job['match_skill']].append(job)

    for skill in jobs_by_skill:
        jobs_by_skill[skill] = sorted(jobs_by_skill[skill], key=lambda x: x.get('rating', 0), reverse=True)

    top_jobs_per_skill = []
    for skill in skills:
        if jobs_by_skill[skill]:
            top_jobs_per_skill.append(jobs_by_skill[skill][0])

    all_sorted_jobs = sorted(rated_jobs, key=lambda x: x.get('rating', 0), reverse=True)

    final_top_jobs = []
    seen_jobs = set()

    for job in top_jobs_per_skill:
        job_tuple = (job.get('title'), job.get('company', {}).get('display_name'), job.get("location", {}).get("display_name"))
        if job_tuple not in seen_jobs:
            final_top_jobs.append(job)
            seen_jobs.add(job_tuple)

    for job in all_sorted_jobs:
        if len(final_top_jobs) >= 7:
            break
        job_tuple = (job.get('title'), job.get('company', {}).get('display_name'), job.get("location", {}).get("display_name"))
        if job_tuple not in seen_jobs:
            final_top_jobs.append(job)
            seen_jobs.add(job_tuple)
            
    # --- NEW: Sort the final selected jobs by rating in descending order ---
    final_top_jobs_sorted = sorted(final_top_jobs, key=lambda x: x.get('rating', 0), reverse=True)

    # Reformat the final job list for the frontend
    formatted_jobs = []
    for job in final_top_jobs_sorted:
        formatted_job = {
            "title": job.get("title"),
            "company": job.get("company", {}).get("display_name", "N/A"),
            "location": job.get("location", {}).get("display_name", "N/A"),
            "url": job.get("redirect_url"),
            "match_skill": job.get("match_skill"),
            "rating": job.get("rating", 0),
            "reason": job.get("reason", "No reason provided.")
        }
        formatted_jobs.append(formatted_job)

    return {"skills": skills, "jobs": formatted_jobs}
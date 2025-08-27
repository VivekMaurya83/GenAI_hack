import os
import json
import google.generativeai as genai
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import List, Optional, Any, Dict

# --- NEW MODEL DEFINITIONS FOR CHATBOT FEATURE ---
class TutorRequest(BaseModel):
    topic: str

class ChatMessage(BaseModel):
    # Role can be 'user' or 'model' (formerly 'assistant')
    role: str
    content: str

# Define a Pydantic model for the career plan data
class CareerPlan(BaseModel):
    domain: str
    extracted_skills_and_projects: Dict[str, Any]
    job_match_score: Dict[str, Any]
    skills_to_learn_summary: List[str]
    timeline_chart_data: Dict[str, Any]
    detailed_roadmap: List[Dict[str, Any]]
    suggested_projects: List[Dict[str, Any]]
    suggested_courses: List[Dict[str, Any]]

class ChatRequest(BaseModel):
    query: str
    history: List[ChatMessage]
    career_plan: Optional[CareerPlan] = None # Now accepting the entire plan

# --- CONFIGURATION & INITIALIZATION ---
load_dotenv()
try:
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        raise ValueError("GEMINI_API_KEY not found in .env file")
    genai.configure(api_key=gemini_api_key)
    model = genai.GenerativeModel('gemini-1.5-flash')
    print("Gemini API configured successfully.")
except Exception as e:
    print(f"Error configuring Gemini API: {e}")
    model = None

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API ENDPOINTS ---

@app.post("/generate_plan")
async def generate_plan(request: Request):
    """
    Receives user profile data, generates a career plan using the Gemini API,
    and returns the complete plan as JSON.
    """
    if not model:
        raise HTTPException(status_code=500, detail="Gemini API is not configured.")

    data = await request.json()

    # --- MASTER PROMPT (V3.3) ---
    prompt = f"""
    Act as a world-class AI Career Strategist and Technical Project Manager. Your task is to generate a deeply personalized, multi-faceted career action plan.

    **STEP 1: ANALYZE THE USER'S PROFILE**
    - **User's Current State (from resume or manual input):** ```{data.get('current_skills_input')}```
    - **Stated Current Proficiency:** {data.get('current_level')}
    - **User's Stated Goal (Job Description or Desired Skills):** ```{data.get('goal_input')}```
    - **Desired Goal Proficiency:** {data.get('goal_level')}
    - **Time Commitment:** Plan for a duration of **{data.get('duration')}**, assuming **{data.get('study_hours')}** study hours per month.

    **STEP 2: GENERATE THE ACTION PLAN AS A SINGLE, VALID JSON OBJECT**
    The JSON output must be perfectly structured with the following keys. Do not include any explanatory text outside of the JSON object.

    1.  "domain": A single string representing the most relevant domain inferred from the goal input (e.g., "Data Science", "Cybersecurity"). This is a new, crucial key.
    2.  "extracted_skills_and_projects": A JSON object with "skills" (array of strings) and "projects" (array of strings).
    3.  "job_match_score": A JSON object with "score" (number) and "summary" (string).
    4.  "skills_to_learn_summary": An array of strings.
    5.  "timeline_chart_data": A JSON object with "labels" (array of strings) and "durations" (array of numbers).
    6.  "detailed_roadmap": An array of "phase" objects, each with "phase_title", "phase_duration", and "topics" (array of strings).
    7.  "suggested_projects": An array of 2 "project" objects, each with "project_title", "project_level", "skills_mapped", "what_you_will_learn", and a multi-step "implementation_plan".
    8.  "suggested_courses": THIS IS A CRITICAL SECTION.
        - You MUST generate an array of 2-3 "course" objects.
        - Each object MUST contain the following FOUR keys: "course_name", "platform", "url", and "mapping".
        - The "platform" MUST be a string like "Coursera", "edX", "Pluralsight", etc.
        - The "url" MUST be a direct, fully-qualified, and workable hyperlink.
        - The "mapping" MUST be a concise sentence explaining how the course helps the roadmap.
        - **Follow this example format precisely:**
          `{{ "course_name": "Google Data Analytics Certificate", "platform": "Coursera", "url": "https://www.coursera.org/professional-certificates/google-data-analytics", "mapping": "This certificate covers the foundational skills in Phase 1 and 2." }}`
    """
    try:
        response = model.generate_content(prompt)
        cleaned_response_text = response.text.replace('```json', '').replace('```', '').strip()
        genai_result = json.loads(cleaned_response_text)
        return genai_result
    except Exception as e:
        print(f"An error occurred during AI generation or data processing: {e}")
        raise HTTPException(status_code=500, detail=f"An internal error occurred: {str(e)}")

# --- ENDPOINT FOR AI TUTOR FEATURE ---
@app.post("/get_explanation")
async def get_explanation(request: TutorRequest):
    """
    Receives a specific topic the user is stuck on and returns a detailed explanation.
    """
    if not model:
        raise HTTPException(status_code=500, detail="Gemini API is not configured.")

    topic = request.topic
    prompt = f"""
    Act as a friendly and encouraging expert tutor. A user is currently working through a personalized learning plan and is stuck on the following topic: **"{topic}"**

    Your task is to provide a clear, helpful explanation in a structured JSON format. The JSON object must have the following keys:

    1.  **"analogy"**: A simple, real-world analogy to help the user understand the core concept intuitively.
    2.  **"technical_definition"**: A concise, technically accurate definition. If the topic involves code, provide a short, well-commented code snippet in the appropriate language (e.g., Python, JavaScript).
    3.  **"prerequisites"**: An array of 1-3 prerequisite concepts the user might need to review. This helps them identify foundational knowledge gaps.

    Generate the JSON object and nothing else.
    """
    try:
        response = model.generate_content(prompt)
        cleaned_response_text = response.text.replace('```json', '').replace('```', '').strip()
        explanation_data = json.loads(cleaned_response_text)
        return explanation_data
    except json.JSONDecodeError as e:
        print(f"JSON decoding error: {e}")
        print(f"Failed to decode JSON from response: {cleaned_response_text}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response as JSON.")
    except Exception as e:
        print(f"An error occurred in AI Tutor: {e}")
        raise HTTPException(status_code=500, detail="Failed to get explanation.")

@app.post("/chat_with_tutor")
async def chat_with_tutor(request: ChatRequest):
    """
    Handles a conversational chat with the AI tutor, using conversation history and plan data.
    """
    if not model:
        raise HTTPException(status_code=500, detail="Gemini API is not configured.")

    # Convert Pydantic ChatMessage list to Gemini API format
    formatted_history = [
        {'role': msg.role, 'parts': [{'text': msg.content}]}
        for msg in request.history
    ]

    # Dynamically build the system instruction based on the career plan data
    career_plan_details = "No career plan provided."
    if request.career_plan:
        plan = request.career_plan
        roadmap_topics = [topic for phase in plan.detailed_roadmap for topic in phase['topics']]
        
        career_plan_details = (
            f"**Domain:** {plan.domain}\n\n"
            f"**Job Match Score:** {plan.job_match_score.get('score', 'N/A')}% with a summary of: \"{plan.job_match_score.get('summary', 'N/A')}\"\n\n"
            f"**Priority Skills to Learn:** {', '.join(plan.skills_to_learn_summary)}\n\n"
            f"**Timeline:** The plan is broken down into phases: {', '.join([f'{p.get("phase_title", "N/A")} ({p.get("phase_duration", "N/A")})' for p in plan.detailed_roadmap])}\n\n"
            f"**Roadmap Topics:** {', '.join(roadmap_topics)}\n\n"
            f"**Projects:**\n"
            f"1. {plan.suggested_projects[0].get('project_title', 'N/A') if plan.suggested_projects else 'N/A'}\n"
            f"2. {plan.suggested_projects[1].get('project_title', 'N/A') if len(plan.suggested_projects) > 1 else 'N/A'}\n\n"
            f"**Suggested Courses:**\n"
            f"1. {plan.suggested_courses[0].get('course_name', 'N/A') if plan.suggested_courses else 'N/A'}\n"
            f"2. {plan.suggested_courses[1].get('course_name', 'N/A') if len(plan.suggested_courses) > 1 else 'N/A'}\n"
        )
    
    # Create the full system instruction prompt
    system_instruction_prompt = (
        f"You are an AI career strategist and tutor. Your purpose is to provide concise, point-to-point, and beginner-friendly guidance to the user, strictly based on the career plan provided below.\n\n"
        f"**Career Plan Details:**\n"
        f"{career_plan_details}\n\n"
        f"**Your Instructions:**\n"
        f"1. Keep responses brief, beginner-friendly, and to the point.\n"
        f"2. You can answer questions related to the provided career plan, including the **job match score, priority skills, timeline, detailed roadmap, projects, and courses**.\n"
        f"3. If the user asks a question that is **outside the scope** of the career plan's domain or is not directly related to the provided plan data, you must respond with a polite refusal. For example, 'That question seems to be outside the scope of your current career plan. Is there anything I can help you with related to your career plan?'\n\n"
        f"Let's begin."
    )
    
    # Prepend the system instruction to the chat history to guide the model's behavior
    formatted_history.insert(0, {'role': 'model', 'parts': [{'text': system_instruction_prompt}]})

    try:
        chat_session = model.start_chat(history=formatted_history)
        user_query = request.query
        response = await chat_session.send_message_async(
            user_query,
            generation_config=genai.types.GenerationConfig(
                temperature=0.4, 
            ),
        )
        return {"response": response.text}
    except Exception as e:
        print(f"An error occurred in the chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"An internal error occurred: {str(e)}")
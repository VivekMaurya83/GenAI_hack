import os
import time
import sys
import json
import re
from typing import Optional, Tuple

# Required libraries are listed above.
import fitz  # PyMuPDF
import google.generativeai as genai
from dotenv import load_dotenv
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
import mysql.connector

# =========================
# Setup
# =========================
def setup_api():
    """Loads environment variables and configures the API key."""
    load_dotenv()
    try:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key: raise ValueError("GOOGLE_API_KEY not found in your .env file.")
        genai.configure(api_key=api_key)
        return "gemini-1.5-flash-latest"
    except Exception as e:
        print(f"Error: API configuration failed. {e}")
        sys.exit(1)

MODEL_NAME = setup_api()

# =========================
# Helper Functions
# =========================
def _safe_json_loads(s: str, fallback=None):
    """Safely loads a JSON string, even if it's embedded in markdown."""
    if not s: return fallback
    s = s.strip()
    if s.startswith("```json"): s = s[7:]
    if s.endswith("```"): s = s[:-3]
    try: return json.loads(s)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", s, flags=re.DOTALL)
        if m:
            try: return json.loads(m.group(0))
            except json.JSONDecodeError: return fallback
    return fallback

def _norm(s: Optional[str]) -> str:
    """Returns a stripped string or an empty string if input is None."""
    return (s or "").strip()

def _smart_join(parts):
    """Joins a list of parts with a separator, ignoring empty or None parts."""
    return " | ".join([str(p) for p in parts if _norm(p)])

def _best_section_key(target_key: str, available_keys):
    """Finds the best matching key in a dictionary from a fuzzy user input."""
    if not target_key: return None
    t = target_key.strip().lower().replace(" ", "_")
    for k in available_keys:
        k_norm = k.lower().replace(" ", "_")
        if t == k_norm or t in k_norm or k_norm in t: return k
    return None

def parse_user_optimization_input(inp: str) -> Tuple[Optional[str], Optional[str]]:
    """Parses user input into a (section, instruction) tuple."""
    val = (inp or "").strip()
    if not val: return None, None
    if ":" in val:
        left, right = val.split(":", 1)
        return _norm(left), _norm(right)
    if len(val.split()) == 1:
        return val, None
    return None, val

def _stringify_list_content(content) -> str:
    """Safely converts a list of strings or dicts into a single newline-separated string."""
    if not isinstance(content, list): return str(content or "")
    string_parts = []
    for item in content:
        if isinstance(item, str): string_parts.append(item)
        elif isinstance(item, dict):
            dict_str = ", ".join([f"{k.replace('_', ' ').title()}: {v}" for k, v in item.items()])
            string_parts.append(dict_str)
        else: string_parts.append(str(item))
    return "\n".join(string_parts)

# =========================
# Database Manager Class
# =========================
class DatabaseManager:
    """Handles all interactions with the relational MySQL database."""
    def __init__(self):
        try:
            self.connection = mysql.connector.connect(
                host=os.getenv("DB_HOST"), user=os.getenv("DB_USER"),
                password=os.getenv("DB_PASSWORD"), database=os.getenv("DB_NAME")
            )
            self.cursor = self.connection.cursor(dictionary=True) # Use dictionary cursor
            print("✅ Database connection successful.")
        except mysql.connector.Error as err:
            print(f"❌ Database Error: {err}")
            sys.exit(1)

    def _map_ai_section_to_standard_key(self, ai_key: str) -> Optional[str]:
        """Maps a potentially variable AI-generated key to a standard internal key."""
        normalized_key = ai_key.lower().replace(" ", "_").replace("-", "_")
        mapping = {
            'work_experience': ['work_experience', 'professional_experience', 'experience', 'work_history'],
            'education': ['education', 'academic_background'], 'projects': ['projects', 'personal_projects'],
            'internships': ['internships', 'internship_experience'], 'skills': ['skills', 'technical_skills', 'proficiencies'],
            'certifications': ['certifications', 'licenses_&_certifications']
        }
        for standard_key, variations in mapping.items():
            if normalized_key in variations: return standard_key
        return None

    def save_resume_relational(self, file_name: str, parsed_data: dict) -> int:
        """Saves the parsed resume data into multiple related tables using a robust mapping system."""
        p_info = parsed_data.get('personal_info', {})
        sql_resume = "INSERT INTO resumes (file_name, name, email, phone, linkedin, github, summary) VALUES (%s, %s, %s, %s, %s, %s, %s)"
        self.cursor.execute(sql_resume, (
            file_name, p_info.get('name'), p_info.get('email'), p_info.get('phone'),
            p_info.get('linkedin'), p_info.get('github'), parsed_data.get('summary')
        ))
        resume_id = self.cursor.lastrowid
        print(f" -> Saved base resume with ID: {resume_id}")

        known_sections_db_map = {
            'work_experience': ('work_experiences', ['role', 'company', 'duration', 'description']),
            'education': ('education', ['institution', 'degree', 'duration', 'description']),
            'projects': ('projects', ['title', 'description']), 'internships': ('internships', ['role', 'company', 'duration', 'description']),
            'certifications': ('certifications', ['name', 'description'])
        }

        for ai_section_key, section_content in parsed_data.items():
            if ai_section_key in ['personal_info', 'summary', 'skills']: continue # Skip skills, handled separately
            standard_key = self._map_ai_section_to_standard_key(ai_section_key)
            if standard_key:
                table_name, columns = known_sections_db_map[standard_key]
                if not isinstance(section_content, list): continue
                for item in section_content:
                    if not isinstance(item, dict): continue
                    if 'description' in item: item['description'] = _stringify_list_content(item.get('description'))
                    cols = ["resume_id"] + [col for col in columns if col in item]
                    vals = [resume_id] + [item.get(col) for col in columns if col in item]
                    sql = f"INSERT INTO {table_name} ({', '.join(cols)}) VALUES ({', '.join(['%s']*len(cols))})"
                    self.cursor.execute(sql, tuple(vals))
            else:
                description = _stringify_list_content(section_content)
                sql = "INSERT INTO additional_sections (resume_id, section_name, description) VALUES (%s, %s, %s)"
                self.cursor.execute(sql, (resume_id, ai_section_key, description))

        if 'skills' in parsed_data and isinstance(parsed_data['skills'], dict):
            for category, skill_list in parsed_data['skills'].items():
                if isinstance(skill_list, list):
                    for skill_name in skill_list:
                        sql = "INSERT INTO skills (resume_id, category, description) VALUES (%s, %s, %s)"
                        self.cursor.execute(sql, (resume_id, category, skill_name)) # 'description' column stores skill name

        self.connection.commit()
        return resume_id

    def fetch_resume_relational(self, resume_id: int, get_optimized: bool = False) -> Optional[dict]:
        """
        Fetches and reconstructs a resume.
        If get_optimized is True, it prioritizes optimized content.
        """
        resume_data = {}
        self.cursor.execute("SELECT * FROM resumes WHERE id = %s", (resume_id,))
        main_info = self.cursor.fetchone()
        if not main_info: return None
        
        resume_data['personal_info'] = {k: main_info[k] for k in ['name', 'email', 'phone', 'linkedin', 'github']}
        resume_data['summary'] = (main_info['optimized_summary'] if get_optimized and main_info['optimized_summary'] else main_info['summary'])

        known_sections_map = {
            'work_experience': ('work_experiences', ['role', 'company', 'duration']),
            'education': ('education', ['institution', 'degree', 'duration']),
            'projects': ('projects', ['title']),
            'internships': ('internships', ['role', 'company', 'duration']),
            'certifications': ('certifications', ['name'])
        }
        for key, (table_name, columns) in known_sections_map.items():
            data_list = []
            self.cursor.execute(f"SELECT * FROM {table_name} WHERE resume_id = %s", (resume_id,))
            for row in self.cursor.fetchall():
                desc_to_use = (row['optimized_description'] if get_optimized and row['optimized_description'] else row['description'])
                item = {col: row[col] for col in columns}
                if desc_to_use: item['description'] = desc_to_use.split('\n')
                data_list.append(item)
            if data_list: resume_data[key] = data_list
        
        self.cursor.execute("SELECT category, description as skill_name FROM skills WHERE resume_id = %s", (resume_id,))
        skills_dict = {}
        for row in self.cursor.fetchall():
            if row['category'] not in skills_dict:
                skills_dict[row['category']] = []
            skills_dict[row['category']].append(row['skill_name'])
        if skills_dict:
            resume_data['skills'] = skills_dict
        
        self.cursor.execute("SELECT * FROM additional_sections WHERE resume_id = %s", (resume_id,))
        for row in self.cursor.fetchall():
            desc_to_use = (row['optimized_description'] if get_optimized and row['optimized_description'] else row['description'])
            if row['section_name'] and desc_to_use:
                resume_data[row['section_name']] = desc_to_use.split('\n')
        return {k: v for k, v in resume_data.items() if v}

    def update_optimized_resume_relational(self, resume_id: int, optimized_data: dict):
        """Updates the 'optimized' columns in the relational tables with high precision."""
        if 'summary' in optimized_data:
            self.cursor.execute("UPDATE resumes SET optimized_summary = %s WHERE id = %s", (optimized_data['summary'], resume_id))

        def update_many(table_name: str, items: list, match_keys: list):
            for item in items:
                desc = _stringify_list_content(item.get('description', []))
                match_values = [item.get(key) for key in match_keys]
                if all(match_values):
                    sql = f"UPDATE {table_name} SET optimized_description = %s WHERE resume_id = %s AND {' AND '.join([f'{k} = %s' for k in match_keys])}"
                    self.cursor.execute(sql, (desc, resume_id, *match_values))

        if 'work_experience' in optimized_data: update_many('work_experiences', optimized_data['work_experience'], ['role', 'company'])
        if 'education' in optimized_data: update_many('education', optimized_data['education'], ['institution', 'degree'])
        if 'projects' in optimized_data: update_many('projects', optimized_data['projects'], ['title'])
        if 'internships' in optimized_data: update_many('internships', optimized_data['internships'], ['role', 'company'])
        if 'certifications' in optimized_data: update_many('certifications', optimized_data['certifications'], ['name'])
        
        for key, content in optimized_data.items():
            if self._map_ai_section_to_standard_key(key) is None and key not in ['personal_info', 'summary', 'skills']:
                desc = _stringify_list_content(content)
                self.cursor.execute("UPDATE additional_sections SET optimized_description = %s WHERE resume_id = %s AND section_name = %s", (desc, resume_id, key))
        self.connection.commit()
        print(f" -> Optimized data for resume ID {resume_id} has been fully updated in the database.")

    def close_connection(self):
        """Closes the database connection."""
        if self.connection and self.connection.is_connected():
            self.cursor.close()
            self.connection.close()
            print(" -> Database connection closed.")

# =========================
# File Text Extraction
# =========================
def extract_text_auto(path: str) -> Optional[str]:
    """Automatically extracts text from a .pdf or .docx file."""
    if not os.path.exists(path):
        print(f"Error: File not found at path: {path}")
        return None
    ext = os.path.splitext(path)[1].lower()
    try:
        if ext == ".pdf":
            with fitz.open(path) as doc: return "\n".join([page.get_text() for page in doc])
        elif ext == ".docx":
            doc = Document(path)
            chunks = [p.text for p in doc.paragraphs if _norm(p.text)]
            for table in doc.tables:
                for row in table.rows:
                    cells = [cell.text for cell in row.cells if _norm(cell.text)]
                    if cells: chunks.append(" | ".join(cells))
            return "\n".join(chunks)
        else:
            print(f"Error: Unsupported file type '{ext}'.")
            return None
    except Exception as e:
        print(f"Error reading file '{path}': {e}")
        return None

# =========================
# AI-Powered Parsing & Optimization
# =========================
def get_resume_structure(resume_text: str) -> Optional[dict]:
    """Uses a generative model to parse raw resume text into a structured JSON object."""
    prompt = f"""
You are an expert HR Technology engineer specializing in resume data extraction. Your task is to convert the raw text of a resume into a structured, valid JSON object, capturing ALL information with high fidelity.
**Instructions:**
1.  **Use the Base Schema:** For common sections, use the following schema.
2.  **Capture Everything Else:** If you find other sections that do not fit the schema (e.g., "Achievements", "Leadership"), create a new top-level key for them (e.g., "achievements").
3.  **IGNORE THE SKILLS SECTION:** Do not parse the skills section in this step. It will be handled by a different process. Omit the 'skills' key from your output.
**Base Schema:**
{{
  "personal_info": {{ "name": "string", "email": "string", "phone": "string", "linkedin": "string", "github": "string" }},
  "summary": "string",
  "work_experience": [ {{ "role": "string", "company": "string", "duration": "string", "description": ["string", ...] }} ],
  "internships": [ {{ "role": "string", "company": "string", "duration": "string", "description": ["string", ...] }} ],
  "education": [ {{ "institution": "string", "degree": "string", "duration": "string", "description": ["string", ...] }} ],
  "projects": [ {{ "title": "string", "description": ["string", ...] }} ],
  "certifications": [ {{ "name": "string", "description": "string" }} ]
}}
**Critical Rules:**
- If a section from the base schema is NOT in the resume, YOU MUST OMIT ITS KEY from the final JSON. Do not create empty sections.
- Your final output must be a single, valid JSON object starting with `{{` and ending with `}}`. Do not include markdown.
--- RESUME TEXT ---
{resume_text}
--- END RESUME TEXT ---
"""
    model = genai.GenerativeModel(MODEL_NAME)
    try:
        safety_settings = {
            'HARM_CATEGORY_HARASSMENT': 'BLOCK_NONE', 'HARM_CATEGORY_HATE_SPEECH': 'BLOCK_NONE',
            'HARM_CATEGORY_SEXUALLY_EXPLICIT': 'BLOCK_NONE', 'HARM_CATEGORY_DANGEROUS_CONTENT': 'BLOCK_NONE',
        }
        response = model.generate_content(prompt, safety_settings=safety_settings)
        data = _safe_json_loads(response.text, fallback=None)
        if not data:
            print("\n--- ERROR: GEMINI API FAILED TO RETURN VALID JSON ---")
            print("This is often due to safety filters blocking the response because of personal info.")
            print("API Response Text:", response.text)
            try: print("API Prompt Feedback:", response.prompt_feedback)
            except ValueError: pass
            print("-----------------------------------------------------\n")
            return None
        return data
    except Exception as e:
        print(f"Error during API call to Gemini: {e}")
        return None

def categorize_skills_from_text(resume_text: str) -> Optional[dict]:
    """Uses a specialized prompt to extract and categorize all skills from the entire resume text."""
    prompt = f"""
You are an expert technical recruiter and data analyst.
Your sole job is to scan the entire resume text provided and identify all skills, both technical and soft.
**Instructions:**
1.  Extract skills from *anywhere* in the text: summaries, project descriptions, a dedicated skills section, etc.
2.  Categorize the skills into the predefined keys in the JSON schema below.
3.  Place each skill only in the most appropriate category.
4.  If a category has no skills, you can omit the key from the output.
**JSON Output Schema:**
{{
    "Programming Languages": ["Python", "JavaScript", "Java", "C++", ...],
    "Frameworks and Libraries": ["TensorFlow", "PyTorch", "React", "Node.js", "Pandas", ...],
    "Databases": ["MySQL", "PostgreSQL", "MongoDB", ...],
    "Tools and Platforms": ["Git", "Docker", "AWS", "Jira", "Linux", ...],
    "Data Science": ["Machine Learning", "NLP", "Data Visualization", "Predictive Modeling", ...],
    "Soft Skills": ["Leadership", "Teamwork", "Communication", "Problem Solving", ...]
}}
**Critical Rules:**
- Your output must be ONLY the valid JSON object described above.
- Do not add any explanation or markdown.
--- RESUME TEXT ---
{resume_text}
--- END RESUME TEXT ---
"""
    model = genai.GenerativeModel(MODEL_NAME)
    try:
        safety_settings = {
            'HARM_CATEGORY_HARASSMENT': 'BLOCK_NONE', 'HARM_CATEGORY_HATE_SPEECH': 'BLOCK_NONE',
            'HARM_CATEGORY_SEXUALLY_EXPLICIT': 'BLOCK_NONE', 'HARM_CATEGORY_DANGEROUS_CONTENT': 'BLOCK_NONE',
        }
        response = model.generate_content(prompt, safety_settings=safety_settings)
        data = _safe_json_loads(response.text, fallback=None)
        if not data:
            print("\n--- ERROR: GEMINI FAILED TO INFER SKILLS ---")
            print("API Response Text:", response.text)
            try: print("API Prompt Feedback:", response.prompt_feedback)
            except ValueError: pass
            print("-------------------------------------------------\n")
            return None
        return data
    except Exception as e:
        print(f"Error inferring skills with Gemini: {e}")
        return None

def optimize_resume_json(resume_json: dict, user_input: str) -> dict:
    """Uses a generative model with a high-impact prompt to optimize the resume content."""
    section_req, instruction = parse_user_optimization_input(user_input)
    keys_present = set(resume_json.keys())
    model = genai.GenerativeModel(MODEL_NAME)
    base_prompt_context = f"""
CONTEXT: You are an elite career strategist and executive resume writer. Your task is to transform a resume from a passive list of duties into a compelling narrative of achievements that will impress top-tier recruiters.
**Your Transformation Checklist (Apply to every relevant bullet point):**
1.  **Lead with a Powerful Action Verb:** Replace weak verbs with strong, specific verbs (e.g., "Engineered," "Architected," "Spearheaded").
2.  **Quantify Metrics Relentlessly:** Add concrete numbers to show scale and achievement (e.g., "...boosting application response time by 40%...").
3.  **Showcase Impact and Scope:** If a number isn't available, describe the tangible impact or business outcome (e.g., "...which became a key selling point...").
4.  **Integrate Technical Skills Naturally:** Weave technologies into the story of the achievement (e.g., "...launched an interactive analytics dashboard using React and D3.js...").
5.  **Ensure Brevity and Clarity:** Remove filler words. Each bullet point should be a single, powerful line.
**Critical Rules:**
- **Do not modify, add, or delete any titles, names, companies, institutions, or skill names.** This is a strict rule. Only rewrite descriptions.
- DO NOT invent facts or skills.
- DO NOT invent specific numbers.
- Do not modify personal information (name, email, phone).
- Your final output must be only the requested, valid JSON. Do not include markdown.
"""
    if section_req:
        mapped = _best_section_key(section_req, keys_present)
        if not mapped:
            print(f"⚠️ Section '{section_req}' not found.")
            return resume_json
        sec_data = resume_json.get(mapped)
        instr_text = instruction or "Apply your transformation checklist to make this section world-class."
        prompt = f"""
{base_prompt_context}
TASK: Apply your full transformation checklist to optimize ONLY the following JSON section, named "{mapped}". Do not optimize skill names, only their descriptions if any.
USER INSTRUCTION: "{instr_text}"
--- INPUT JSON SECTION ---
{json.dumps(sec_data, indent=2)}
--- END INPUT JSON SECTION ---
"""
    else:
        prompt = f"""
{base_prompt_context}
TASK: Apply your full transformation checklist to optimize all sections of the following resume JSON. Do not optimize skill names.
USER INSTRUCTION: "{instruction or 'Globally apply your transformation checklist to every relevant section to maximize impact.'}"
--- FULL INPUT JSON ---
{json.dumps(resume_json, indent=2)}
--- END FULL INPUT JSON ---
"""
    try:
        safety_settings = {
            'HARM_CATEGORY_HARASSMENT': 'BLOCK_NONE', 'HARM_CATEGORY_HATE_SPEECH': 'BLOCK_NONE',
            'HARM_CATEGORY_SEXUALLY_EXPLICIT': 'BLOCK_NONE', 'HARM_CATEGORY_DANGEROUS_CONTENT': 'BLOCK_NONE',
        }
        response = model.generate_content(prompt, safety_settings=safety_settings)
        optimized_data = _safe_json_loads(response.text, fallback=None)
        if section_req and optimized_data: resume_json[mapped] = optimized_data
        elif optimized_data: resume_json = optimized_data
    except Exception as e: print(f"Error during optimization: {e}")
    return resume_json


# In backend.py, add this new function:

# In backend/backend.py

def optimize_for_linkedin(resume_json: dict, user_input: str) -> Optional[dict]:
    """
    Uses a specialized prompt to generate optimized text for a LinkedIn profile
    based on the structured resume data and a user's specific request.
    """
    context_text = []
    if 'summary' in resume_json:
        context_text.append(f"Summary:\n{resume_json['summary']}")
    if 'work_experience' in resume_json:
        context_text.append("\nWork Experience:")
        for job in resume_json['work_experience']:
            context_text.append(f"- {job.get('role')} at {job.get('company')}: {' '.join(job.get('description', []))}")
    if 'internships' in resume_json:
        context_text.append("\nInternships:")
        for job in resume_json['internships']:
            context_text.append(f"- {job.get('role')} at {job.get('company')}: {' '.join(job.get('description', []))}")
    if 'projects' in resume_json:
        context_text.append("\nProjects:")
        for project in resume_json['projects']:
            context_text.append(f"- {project.get('title')}: {' '.join(project.get('description', []))}")
    if 'skills' in resume_json:
        skills_summary = ", ".join([f"{cat}: {', '.join(skills)}" for cat, skills in resume_json['skills'].items()])
        context_text.append(f"\nSkills: {skills_summary}")
    resume_context = "\n".join(context_text)

    section_req, instruction = parse_user_optimization_input(user_input)

    base_prompt_context = f"""
You are an expert LinkedIn profile strategist and personal branding coach.
Your task is to generate compelling, optimized text for a user's LinkedIn profile based on the provided resume content.

**Instructions:**
1.  **Headline:** Create 2-3 powerful, keyword-rich headline options.
2.  **About (Summary):** Write a compelling, first-person "About" section.
3.  **Experiences:** For EACH job/internship in the context, rewrite the bullet points to be concise and results-oriented.
4.  **Projects:** For EACH project in the context, rewrite its description to be engaging for a LinkedIn audience.

**JSON Output Schema:**
{{
    "headlines": ["string option 1", "string option 2", ...],
    "about_section": "string (a multi-paragraph summary)",
    "optimized_experiences": [
        {{
            "title": "Role at Company",
            "description": "string (1-2 rewritten, impactful bullet points)"
        }}
    ],
    "optimized_projects": [
        {{
            "title": "Project Title",
            "description": "string (an engaging, brief description)"
        }}
    ]
}}

**Critical Rules:**
- Generate content ONLY from the provided resume context. Do not invent skills or experiences.
- Keep the tone professional but approachable, using the first person ("I...") for the About section.
- Your final output must be ONLY the valid JSON object that matches the requested task.
"""

    if section_req:
        instr_text = instruction or f"Make the {section_req} section more compelling and professional."
        prompt = f"""
{base_prompt_context}
TASK: Based on the resume context, optimize ONLY the '{section_req}' portion of a LinkedIn profile.
USER INSTRUCTION: "{instr_text}"
--- RESUME CONTEXT ---
{resume_context}
--- END RESUME CONTEXT ---
"""
    else:
        instr_text = instruction or "Optimize the entire LinkedIn profile, creating content for all key sections."
        prompt = f"""
{base_prompt_context}
TASK: Based on the resume context, perform a full optimization of a LinkedIn profile, generating content for all sections in the JSON schema.
USER INSTRUCTION: "{instr_text}"
--- RESUME CONTEXT ---
{resume_context}
--- END RESUME CONTEXT ---
"""
    model = genai.GenerativeModel(MODEL_NAME)
    try:
        safety_settings = {
            'HARM_CATEGORY_HARASSMENT': 'BLOCK_NONE', 'HARM_CATEGORY_HATE_SPEECH': 'BLOCK_NONE',
            'HARM_CATEGORY_SEXUALLY_EXPLICIT': 'BLOCK_NONE', 'HARM_CATEGORY_DANGEROUS_CONTENT': 'BLOCK_NONE',
        }
        response = model.generate_content(prompt, safety_settings=safety_settings)
        return _safe_json_loads(response.text, fallback=None)
    except Exception as e:
        print(f"Error generating LinkedIn content with Gemini: {e}")
        return None
    

# =========================
# DOCX Generation
# =========================
def save_resume_json_to_docx(resume_json: dict, output_path="Optimized_Resume.docx"):
    """Saves the final, optimized JSON data into a formatted DOCX file."""
    doc = Document()
    def add_heading(text, level=1):
        t = _norm(text)
        if t:
            h = doc.add_heading(t, level=level)
            h.alignment = WD_ALIGN_PARAGRAPH.LEFT
    def add_para(text, bold=False):
        t = _norm(text)
        if t:
            p = doc.add_paragraph()
            run = p.add_run(t)
            run.bold = bold
            run.font.size = Pt(11)
    
    print_order = ['personal_info', 'summary', 'skills', 'work_experience', 'internships', 'projects', 'education', 'certifications']
    
    for section in print_order:
        if section in resume_json:
            content = resume_json[section]
            if section == 'personal_info':
                name = content.get('name', '')
                if name: add_heading(name, level=0)
                contact_info = [content.get('email'), content.get('phone'), content.get('linkedin'), content.get('github')]
                add_para(_smart_join(contact_info))
                continue
            
            add_heading(section.replace("_", " ").title(), level=2)
            
            if section == 'skills':
                # Format categorized skills professionally
                for category, skill_list in content.items():
                    if isinstance(skill_list, list):
                        p = doc.add_paragraph()
                        p.add_run(category.replace("_", " ").title() + ': ').bold = True
                        p.add_run(", ".join(skill_list))
                continue
            
            if isinstance(content, str): add_para(content)
            elif isinstance(content, list):
                for item in content:
                    if isinstance(item, str): 
                        doc.add_paragraph(item, style="List Bullet")
                    elif isinstance(item, dict):
                        header_parts = [item.get("title"), item.get("name"), item.get("role"), item.get("degree"), item.get("institution")]
                        header = _smart_join(header_parts)
                        if header: add_para(header, bold=True)
                        sub_header_parts = [item.get("company"), item.get("duration")]
                        sub_header = _smart_join(sub_header_parts)
                        if sub_header: add_para(sub_header)
                        desc = item.get("description", [])
                        if isinstance(desc, list):
                            for bullet in desc:
                                if _norm(bullet): doc.add_paragraph(str(bullet), style="List Bullet")
                        elif _norm(desc): doc.add_paragraph(str(desc), style="List Bullet")
                        
    # Print any additional sections at the end
    for section, content in resume_json.items():
        if section not in print_order:
            add_heading(section.replace("_", " ").title(), level=2)
            if isinstance(content, list):
                for item in content:
                    doc.add_paragraph(str(item), style="List Bullet")
            else:
                add_para(str(content))
    print("\n✅ DOCX document generated in memory.")
    return doc # Return the document object

# =========================
# Main Execution Block
# =========================
if __name__ == "__main__":
    db = None
    try:
        db = DatabaseManager()
        default_path = "resume.pdf"
        file_path = input(f"\nEnter resume path (.pdf/.docx) [default: {default_path}]: ").strip() or default_path

        print("\nStep 1: Extracting text...")
        resume_text = extract_text_auto(file_path)
        if not resume_text: sys.exit(1)
        print("✅ Text extracted successfully.")

        print("\nStep 2a: Structuring resume layout (excluding skills)...")
        structured = get_resume_structure(resume_text)
        if not structured: sys.exit(1)
        print(" -> Structure parsed.")

        # --- THE FIX: ADD A PAUSE BEFORE THE NEXT API CALL ---
        print(" -> Pausing for a moment to respect API rate limits...")
        time.sleep(2) # Pauses the script for 2 seconds        

        print("Step 2b: Categorizing all skills from full text...")
        categorized_skills = categorize_skills_from_text(resume_text)
        if categorized_skills:
            structured['skills'] = categorized_skills
            print("✅ Skills categorized and added successfully!")
        else:
            print(" -> No skills were inferred.")
        
        print("\nStep 3: Saving comprehensive resume to the relational database...")
        resume_id = db.save_resume_relational(os.path.basename(file_path), structured)
        if not resume_id:
            print("❌ Failed to save resume to the database.")
            sys.exit(1)

        print("\nStep 4: Enter optimisation request:")
        user_request = input("Your input: ").strip()

        print("\nStep 5: Fetching original resume from database for optimization...")
        resume_to_optimize = db.fetch_resume_relational(resume_id, get_optimized=False)
        if not resume_to_optimize:
            print(f"❌ Failed to fetch resume with ID {resume_id} from database.")
            sys.exit(1)
        
        optimized = optimize_resume_json(resume_to_optimize, user_request)

        print("\nStep 6: Saving optimized version back to the database...")
        db.update_optimized_resume_relational(resume_id, optimized)

        print("\nStep 7: Fetching final, optimized data for document generation...")
        final_data_for_doc = db.fetch_resume_relational(resume_id, get_optimized=True)
        if not final_data_for_doc:
            print("❌ Failed to fetch final data for DOCX generation.")
            sys.exit(1)

        print("\nStep 8: Generating DOCX file...")
        out_name = "Optimized_Resume.docx"
        if user_request:
            sec, _ = parse_user_optimization_input(user_request)
            if sec:
                out_name = f"Optimized_Resume_{sec}.docx"
        save_resume_json_to_docx(final_data_for_doc, out_name)

    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}")
    finally:
        if db:
            db.close_connection()
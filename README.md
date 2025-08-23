# 🎯 Personalized Career & Skills Advisor

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License"/>
  <img src="https://img.shields.io/badge/AI-Google%20Gemini-4285F4.svg" alt="Gemini API"/>
  <img src="https://img.shields.io/badge/Framework-Flask-black.svg" alt="Flask"/>
  <img src="https://img.shields.io/badge/Language-Python-3776AB.svg" alt="Python"/>
  <img src="https://img.shields.io/badge/Frontend-React-61DAFB.svg" alt="React"/>
  <img src="https://img.shields.io/badge/Database-Firebase-FFCA28.svg" alt="Firebase"/>
  <img src="https://img.shields.io/badge/Parsing-PyPDF2-lightgrey.svg" alt="PyPDF2"/>
</p>

---

## 📌 Problem Statement
Students in India often face a **bewildering array of career choices** with little **personalized guidance**.  
- Traditional career counseling methods are **generic**.  
- They fail to keep up with **emerging roles** and **in-demand skills**.  
- As a result, students often feel **lost, unprepared, and unsure** about their career paths.  

---

## 🎯 Objective
Leverage **Google Cloud Generative AI (Gemini API)** to create an **AI-powered personalized career and skills advisor** that:  
- Maps a student’s **current skills**.  
- Identifies **skill gaps** compared to industry requirements.  
- Generates **career roadmaps** and **actionable guidance**.  
- Suggests **learning paths and resume improvements**.  

---

## ⚡ Core Features (MVP)

✅ **Skill Mapping & Gap Analysis** 🧩  
- Extracts student skills (via manual input or resume upload).  
- Compares with job role skill sets to highlight **gaps**.  

✅ **Personalized Career Roadmaps** 🗺️  
- Generates step-by-step roadmaps including **courses, projects, and timelines**.  

✅ **Resume & LinkedIn Optimization** 📄  
- AI-powered keyword suggestions.  
- Enhances resumes and LinkedIn profiles for better visibility.  

✅ **Learning Path Recommendations** 🎓  
- Suggests **relevant online courses** (Coursera, NPTEL, Udemy, etc.) based on skill gaps.  

---

## 🛠️ Tech Stack

**Frontend**  
- HTML, CSS, JavaScript/React.js → User interface for inputs & displaying recommendations  

**Backend**  
- Python (Flask / FastAPI) → Core API & business logic  

**Generative AI**  
- Google Gemini API → Skill mapping, career roadmaps, resume optimization  

**Resume Parsing**  
- PyPDF2 / pdfplumber → Resume text extraction  
- spaCy / NLTK → (optional) text preprocessing & entity extraction  

**Database**  
- SQLite / Firebase (lightweight) → Storing user inputs and generated recommendations  

---

## 📊 System Architecture

```
                                        ┌───────────────────┐
                                        │       👤 User     |
                                        └─────────┬─────────┘
                                                  │
                                ┌─────────────────▼─────────────────┐
                                │      Resume Upload / Manual Input │
                                └─────────────────┬─────────────────┘
                                                  │
                                        ┌─────────▼─────────┐
                                        │  Backend (Flask)  │
                                        └─────────┬─────────┘
                                                  │
                              ┌───────────────────┼───────────────────┐
                              │                   │                   │
                       ┌──────▼───────┐    ┌──────▼───────┐    ┌──────▼────────┐
                       │ Resume Parser│    │  Gemini AI   │    │   Firebase DB │
                       │ (PyPDF2, etc)│    │  (Skill Gap, │    │ (User Data,   │
                       │              │    │  Roadmap,    │    │ Profiles,     │
                       └──────┬───────┘    │  Resume Fix) │    │ History)      │
                              │            └──────┬───────┘    └──────┬────────┘
                              │                   │                   │
                              └───────────┬───────┴───────┬───────────┘
                                          │               │
                                  ┌───────▼─────────┐     │
                                  │ Recommendations │ <───┘
                                  │   + Roadmap     │
                                  └───────┬─────────┘
                                          │
                                   ┌──────▼──────┐
                                   │  Frontend   │
                                   │ (React UI)  │
                                   └─────────────┘
```


---

## 🖼️ Screenshots (to be added later)

- 🔹 Home Page – Skill Input / Resume Upload  
- 🔹 Skill Gap Analysis – Table view of skills vs. job role requirements  
- 🔹 Career Roadmap – AI-generated learning timeline  
- 🔹 Resume Suggestions – Optimized text snippets  

*(Screenshots will be added as the project develops.)*  

---

## 🔮 Future Scope

1. **AI Mock Interviews** 🎤 – Domain-specific questions with instant feedback.  
2. **Portfolio Project Generator** 💡 – AI suggests projects to strengthen profile.  
3. **Job Market Insights** 📊 – Track trending roles and skills demand in real time.  
4. **Gamified Learning Dashboard** 🏆 – Achievements, badges, streaks for motivation.  
5. **AI Mentor Chatbot** 🤖 – 24/7 personalized guidance.  
6. **Integration with Job Platforms** 💼 – LinkedIn, Naukri, Internshala APIs.  
7. **Multilingual Support** 🌍 – Provide advice in multiple Indian languages. 

---


## 📜 License
This project is licensed under the **MIT License**.  


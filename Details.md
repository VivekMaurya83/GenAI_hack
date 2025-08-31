# AI Career Coach – Technical Details

This document provides a technical overview of the project structure, the purpose of each key file, and instructions for running the application in a development environment.

---

## 1. Project Structure

The application follows a **decoupled architecture**, with a distinct backend API and a static frontend.  
This separation of concerns allows for independent development, testing, and deployment.

```
/integrate/
│
├── backend/                        # All Python server-side code
│   ├── .env                        # Secret keys (API, DB credentials)
│   ├── firebase-credentials.json   # Firebase service account key
│   ├── requirements.txt            # Python dependencies
│   ├── main.py,dependencies        # FastAPI application entry point and server,user data(dependecies.py)
│   │
│   ├── core/                       # Core business logic, separated from API layer
│   │   ├── __init__.py
│   │   ├── ai_core.py              # Functions for Gemini AI API interactions
│   │   └── db_core.py              # DatabaseManager class for Firestore interactions
│   │
│   └── routers/                    # API endpoint definitions (organized by feature)
│       ├── __init__.py
│       ├── auth.py,user.py         # Endpoints for user login and signup
│       ├── resume.py               # Endpoints for resume upload/optimization/download
│       └── roadmap.py              # Endpoints for roadmap, tutor, and chatbot features
│
├── frontend/                       # All static user interface files
│   ├── login.html                  # User login & signup page
│   ├── home.html                   # Dashboard after login
│   ├── optimizer.html              # Resume & LinkedIn Optimizer tool
│   ├── roadmap.html                # Elaborative Roadmap tool
│   ├── profile.html                # User profile & resume management
│   │
│   ├── templates/                  # Resume templates in docx
│   │   ├── template1.docx
│   │   ├── template2.docx
│   │   └── ...
│   │
│   ├── assets/                     # Images and static media for resume preview
│   │   ├── template1.png
│   │   ├── template2.png
│   │   └── ...
│   │
│   ├── style/                      # CSS stylesheets
│   │   ├── login.css               # login stylesheet
│   │   ├── home.css
│   │   ├── optimizer.css
│   │   └── ...
│   │
│   └── script/                     # JavaScript files
│       ├── auth.js                 # Shared authentication logic
│       ├── login.js                # Login & signup page logic
│       ├── home.js                 # Dashboard logic
│       ├── optimizer.js            # Resume optimization logic
│       ├── roadmap.js              # Roadmap generation logic
│       └── profile.js              # Profile management logic
│
|__temp.css                         #Shared main Stylesheet
└── README.md                       # General project overview & setup guide
```

---

## 2. File Summary

### Backend (`backend/`)

- **`main.py`** – Entry point for the FastAPI server. Initializes the app, sets up CORS, Firebase Admin SDK, and includes routers. Contains no business logic.  
- **`core/ai_core.py`** – The "brain" of the application. Constructs prompts and makes calls to the Google Gemini API for parsing, skill categorization, and content optimization.  
- **`core/db_core.py`** – Data layer. Contains the `DatabaseManager` class for Firestore operations (save, fetch, update user and resume data).  
- **`routers/auth.py`** – Defines authentication endpoints (`/api/auth/login`, `/api/auth/signup`).  
- **`routers/resume.py`** – Defines endpoints for resume optimization (`/api/resume/upload`, `/api/resume/optimize`, `/api/resume/download`).  
- **`routers/roadmap.py`** – Defines endpoints for roadmap generation, AI tutor, and chatbot features.  

### Frontend (`frontend/`)

- **HTML files** – Core views (`login.html`, `home.html`, `optimizer.html`, `roadmap.html`, `profile.html`),etc.  
- **Templates (`templates/`)** – Contains downloadable and editable resume templates (e.g., `template1.docx`, `template2.docx`),etc.  
- **Assets (`assets/`)** – Images and other media used in the UI.  
- **Styles (`style/`)** – CSS files for global and page-specific styling.  
- **Scripts (`script/`)** – JavaScript files handling page-specific logic and authentication (`auth.js`, `login.js`, etc.).  

---

## 3. Running the Application

The application requires **two processes running in separate terminals**: backend and frontend.

### Step 1: Start the Backend Server

```bash
# Navigate to backend folder
cd path/to/integrate/backend

# Install dependencies
pip install -r requirements.txt

# Run FastAPI server (with auto-reload on save)
uvicorn main:app --reload
```

- The backend will run at: **http://127.0.0.1:8000**  

---

### Step 2: Start the Frontend Server

```bash
# Navigate to frontend folder
cd path/to/integrate/frontend

# Serve static files using Python’s built-in HTTP server
python -m http.server 8080
```

- The frontend will run at: **http://localhost:8080**  

---

### Step 3: Access the Application

- Open your browser and go to: **http://localhost:8080**  
- If not signed in, you will be redirected to **login.html**.  

---

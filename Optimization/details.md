
---

## How It Works

The application operates through an intelligent, multi-stage workflow. First, a user uploads their resume. The backend extracts the raw text and performs a two-pass AI analysis: one pass to understand the document's structure (experience, projects, etc.) and a second, specialized pass to find and categorize every skill mentioned anywhere in the text.

This complete, structured data is then saved to a **Firebase Firestore** database using a relational-style model with collections and sub-collections. The user can then choose a tool, such as the Resume or LinkedIn Optimizer. The application fetches the original data from the database and sends it to the AI again with a powerful prompt to generate enhanced, impactful content. This optimized text is saved back to the database, and the final, improved version is used to generate a downloadable `.docx` file or display the content on the UI.

---

## Setup Guide

Follow these steps to get the application running on your local machine.

### 1. Prerequisites

-   Python 3.8+
-   A Google Firebase Project.
-   An API Key from Google AI Studio for the Gemini API.

### 2. Backend Setup

1.  **Navigate to the Backend Directory:**
    ```bash
    cd optimization/backend
    ```

2.  **Create the Environment File (`.env`):**
    Create a file named `.env` inside the `backend` folder and add your Google API key.

    ```env
    # Your secret key from Google AI Studio
    GOOGLE_API_KEY="your_google_api_key_here"
    ```

3.  **Add Firebase Credentials:**
    -   Go to your Firebase project settings in the Firebase Console.
    -   Navigate to "Service accounts".
    -   Click "Generate new private key" and download the resulting JSON file.
    -   **CRITICAL:** Rename this file to `firebase-credentials.json` and place it inside the `backend` folder.

4.  **Install Python Dependencies:**
    From the `optimization` directory, run the following command to install all required libraries from the `requirements.txt` file:
    ```bash
    pip install -r requirements.txt
    ```

### 3. Database Setup (in Firebase Console)

1.  **Create a Firebase Project:**
    -   Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.

2.  **Create a Firestore Database:**
    -   In your project, go to "Build" > "Firestore Database" and click "Create database".
    -   When prompted, select **"Start in test mode"**. This will allow your local server to read and write data during development.
    -   Choose a location for your database.
    -   **No further setup is needed.** The Python script will automatically create the necessary collections and documents the first time it runs.

---

## Running the Application

### Start the Backend Server

-   Open a terminal window.
-   Navigate to the **`backend`** folder.
    ```bash
    cd optimization/backend
    ```
-   Run the FastAPI server:
    ```bash
    python main.py
    ```
-   The server will start at `http://127.0.0.1:8000`. Leave this terminal running.


---

## How It Works

First, a user uploads their resume. The backend extracts the raw text and performs a two-pass AI analysis: one pass to understand the document's structure (experience, projects, etc.) and a second, specialized pass to find and categorize every skill mentioned anywhere in the text.

This complete, structured data is then saved to a relational MySQL database. The user can then choose a tool, such as the Resume or LinkedIn Optimizer. The application fetches the original data from the database and sends it to the AI again with a powerful prompt to generate enhanced, impactful content. This optimized text is saved back to the database, and the final, improved version is used to generate a downloadable `.docx` file or display the content on the UI.

---

## Setup Guide

Follow these steps to get the application running on your local machine.

### 1. Prerequisites

-   Python 3.8+
-   A mysql workbench.
-   An API Key from Google AI Studio for the Gemini API.

### 2. Backend Setup

1.  **Navigate to the Backend Directory:**
    ```bash
    cd backend
    ```

2.  **Create the Environment File (`.env`):**
    Create a file named `.env` inside the `backend` folder and add your credentials.

    ```env
    # Your secret key from Google AI Studio
    GOOGLE_API_KEY="your_google_api_key_here"

    # Your local database connection details
    DB_HOST="localhost"
    DB_USER="root"
    DB_PASSWORD="your_mysql_password"  # Often blank or 'root' on a default local setup
    DB_NAME="resume_db"
    ```

3.  **Install Python Dependencies:**
    From the `base` directory, run the following command to install all required libraries from the `requirements.txt` file:
    ```bash
    pip install -r requirements.txt
    ```

### 3. Database Setup

1.  **Create the Database:**
    Using a MySQL tool likeMySQL Workbench, execute the following SQL command:
    ```sql
    CREATE DATABASE resume_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    ```

2.  **Create the Tables:**
    Select the `resume_db` database and then execute the SQL script found in `db.txt` to create all the necessary tables.

## Running the Application

-   Open a terminal window.
-   Navigate to the **`backend`** folder.
    ```bash
    cd backend
    ```
-   Run the FastAPI server:
    ```bash
    python main.py
    ```
-   The server will start at `http://127.0.0.1:8000`. Leave this terminal running.

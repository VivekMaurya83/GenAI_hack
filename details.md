# AI Learning Path Generator

This project is a web application that uses a powerful AI to generate personalized learning paths for users based on their career goals and experience. It also provides curated course recommendations, project ideas, quizzes, and external resources for each step of the learning path.

## Project Structure

-   **`server.js`**: This is the backend of the application. It's a Node.js server built with Express that handles all the logic. It takes requests from the frontend, communicates with the Google Gemini AI, searches the local course data, and sends the results back.
-   **`public/index.html`**: This is the frontend of the application. It's a single HTML file with a beautiful, user-friendly interface that allows users to input their goals and view the generated learning path.
-   **`package.json`**: This is the project's configuration file. It lists all the necessary libraries (dependencies) that the server needs to run.
-   **`.env`**: This is a crucial security file where you store your secret API key. It is kept private and is not shared publicly.
-   **`udemy_courses.csv` & `coursera_course_2024.csv`**: These are the local databases that contain the course information used for recommendations.
-   **`.gitignore`**: This file tells Git (a version control system) which files and folders to ignore, such as `node_modules` and the `.env` file, to keep your project secure and clean.

## How to Set Up and Run the Project

1.  **Install Dependencies:** Open your terminal in the main project folder and run the following command. This will download all the necessary libraries listed in `package.json`.
    ```bash
    npm install
    ```

2.  **Create Your `.env` File:** Create a file named `.env` in the main project folder. Open it and add your Google AI API key like this:
    ```
    GEMINI_API_KEY="YOUR_SECRET_API_KEY"
    ```

3.  **Start the Server:** To start the backend server, run the following command in your terminal:
    ```bash
    node server.js
    ```
    If everything is set up correctly, you will see a message saying `🚀 Server is running on http://localhost:3000`.

4.  **Open the Frontend:** Find the `index.html` file inside the `public` folder and open it in your web browser. You can now use the application.


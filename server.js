// --- 1. Import Dependencies ---
const express = require('express');
const fs = require('fs');
const csv = require('csv-parser');
const fetch = require('node-fetch');
require('dotenv').config(); // Loads .env file content into process.env

// --- 2. Initialize Express App ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- 3. Middleware ---
app.use(express.json()); // For parsing application/json
app.use(express.static('public')); // Serve static files like index.html from 'public' folder

// --- 4. Data Loading ---
let udemyCourses = [];
let courseraCourses = [];

/**
 * Asynchronously loads a CSV file into memory.
 * @param {string} filePath The path to the CSV file.
 * @returns {Promise<Array<object>>} A promise that resolves with the parsed data.
 */
const loadCsvData = (filePath) => {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filePath)) {
            console.warn(`⚠️  Warning: '${filePath}' not found. Recommendations from this source will be unavailable.`);
            return resolve([]); // Resolve with an empty array if file doesn't exist
        }

        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
};

// --- 5. Course Search & Helper Functions ---

/**
 * Creates a URL-friendly slug from a course name for Coursera links.
 * @param {string} text The text to slugify.
 * @returns {string} The slugified text.
 */
function createSlug(text) {
    if (typeof text !== 'string' || !text) return '';
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '') // Remove non-word characters
        .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with a single hyphen
        .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Finds relevant courses from the loaded datasets based on a topic.
 * @param {string} topic The topic to search for.
 * @param {number} limit The maximum number of courses to return.
 * @returns {Array<object>} A sorted list of course recommendations.
 */
function findCourses(topic, limit = 2) {
    const keywords = topic.toLowerCase().split(' ').filter(kw => kw.length > 2);
    let allCourses = [];

    // Scoring Logic for Udemy
    udemyCourses.forEach(course => {
        const title = (course.course_title || '').toLowerCase();
        let score = 0;
        keywords.forEach(kw => {
            if (title.includes(kw)) score++;
        });
        if (score > 0) {
            allCourses.push({
                score,
                platform: 'Udemy',
                course_title: course.course_title,
                reason: `A relevant course on Udemy for ${topic}.`,
                course_url: course.url
            });
        }
    });

    // Scoring Logic for Coursera with FIXED URL
    courseraCourses.forEach(course => {
        const title = (course['Course Name'] || '').toLowerCase();
        let score = 0;
        keywords.forEach(kw => {
            if (title.includes(kw)) score++;
        });
        if (score > 0) {
            const courseSlug = createSlug(course['Course Name']);
            allCourses.push({
                score,
                platform: 'Coursera',
                course_title: course['Course Name'],
                reason: `A structured course on Coursera for ${topic}.`,
                course_url: `https://www.coursera.org/learn/${courseSlug}`
            });
        }
    });

    return allCourses.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * A centralized helper function to call the Gemini API.
 * @param {string} prompt The prompt to send to the AI.
 * @param {object} schema The expected JSON schema for the response.
 * @returns {Promise<object>} The parsed JSON object from the API response.
 */
async function callGeminiAPI(prompt, schema) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not set in the .env file. Please add it to proceed.");
    }

    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema
        }
    };
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const apiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        throw new Error(`API call failed with status ${apiResponse.status}: ${errorText}`);
    }

    const result = await apiResponse.json();
    if (result.candidates && result.candidates[0]?.content?.parts?.[0]) {
        return JSON.parse(result.candidates[0].content.parts[0].text);
    } else {
        console.error("Unexpected API response structure:", JSON.stringify(result, null, 2));
        throw new Error('The AI returned an unexpected response structure. Please check the server logs.');
    }
}

// --- 6. API Endpoints ---

app.post('/api/generate-path', async (req, res) => {
    try {
        const { currentSkills, goal, experience, learningStyle } = req.body;
        if (!goal || !experience || !currentSkills || !learningStyle) {
            return res.status(400).json({ error: 'All fields (currentSkills, goal, experience, learningStyle) are required.' });
        }

        // ADVANCED PROMPT: Now uses all inputs from your frontend for a better result.
        const prompt = `
            Act as an expert career advisor creating a personalized learning path.
            The user's details are:
            - Current Skills: "${currentSkills}"
            - Career Goal: "${goal}"
            - Experience Level: "${experience}"
            - Preferred Learning Style: "${learningStyle}"

            Generate a concise, step-by-step learning path of topics that bridges their current skills to their goal, tailored to their experience and learning style.
            Return a JSON object with a key "learning_topics" which is an array of strings.
            Example: {"learning_topics": ["Python Fundamentals", "Data Analysis with Pandas", "Machine Learning with Scikit-learn"]}`;
        
        const schema = { type: "OBJECT", properties: { learning_topics: { type: "ARRAY", items: { type: "STRING" } } } };
        const { learning_topics } = await callGeminiAPI(prompt, schema);

        const recommendedCourses = learning_topics.map((topic, index) => ({
            step: index + 1,
            topic: topic,
            courses: findCourses(topic, 2)
        }));

        res.json({ recommendedCourses });
    } catch (error) {
        console.error('Error in /api/generate-path:', error.message);
        res.status(500).json({ error: 'An internal server error occurred while generating the path.' });
    }
});

app.post('/api/suggest-project', async (req, res) => {
    try {
        const { topic, goal } = req.body;
        if (!topic || !goal) {
            return res.status(400).json({ error: 'Both "topic" and "goal" are required fields.' });
        }
        const prompt = `Act as a senior software engineer mentoring someone learning "${topic}" to become a "${goal}". Suggest a single, practical project. Return a JSON object with "project_title", "description", "key_features" (array), and "technologies" (array).`;
        const schema = { type: "OBJECT", properties: { project_title: { type: "STRING" }, description: { type: "STRING" }, key_features: { type: "ARRAY", items: { type: "STRING" } }, technologies: { type: "ARRAY", items: { type: "STRING" } } } };
        const projectData = await callGeminiAPI(prompt, schema);
        res.json(projectData);
    } catch (error) {
        console.error('Error in /api/suggest-project:', error.message);
        res.status(500).json({ error: 'An internal server error occurred while suggesting a project.' });
    }
});

app.post('/api/generate-quiz', async (req, res) => {
    try {
        const { topic } = req.body;
        if (!topic) {
            return res.status(400).json({ error: 'The "topic" field is required.' });
        }
        const prompt = `Create a short, 3-question multiple-choice quiz on the topic "${topic}". Each question should have 4 options. Return a JSON object with a "questions" array. Each object in the array should have "question", "options" (array), and "correct_answer".`;
        const schema = { type: "OBJECT", properties: { questions: { type: "ARRAY", items: { type: "OBJECT", properties: { question: { type: "STRING" }, options: { type: "ARRAY", items: { type: "STRING" } }, correct_answer: { type: "STRING" } } } } } };
        const quizData = await callGeminiAPI(prompt, schema);
        res.json(quizData);
    } catch (error) {
        console.error('Error in /api/generate-quiz:', error.message);
        res.status(500).json({ error: 'An internal server error occurred while generating the quiz.' });
    }
});

app.post('/api/fetch-resources', async (req, res) => {
    try {
        const { topic, goal } = req.body;
        if (!topic || !goal) {
            return res.status(400).json({ error: 'Both "topic" and "goal" are required fields.' });
        }
        const prompt = `Act as a senior engineer at Google curating a learning guide for a new team member learning "${topic}" to become a "${goal}". Find the top 2 YouTube tutorials, top 2 articles/blogs, and one relevant Google Codelab. For each, provide a "title", "url", and "reason". Return a JSON object with keys "youtube_tutorials", "articles", and "google_codelab".`;
        const schema = { type: "OBJECT", properties: { youtube_tutorials: { type: "ARRAY", items: { type: "OBJECT", properties: { title: { type: "STRING" }, url: { type: "STRING" }, reason: { type: "STRING" } } } }, articles: { type: "ARRAY", items: { type: "OBJECT", properties: { title: { type: "STRING" }, url: { type: "STRING" }, reason: { type: "STRING" } } } }, google_codelab: { type: "OBJECT", properties: { title: { type: "STRING" }, url: { type: "STRING" }, reason: { type: "STRING" } } } } };
        const resourceData = await callGeminiAPI(prompt, schema);
        res.json(resourceData);
    } catch (error) {
        console.error('Error in /api/fetch-resources:', error.message);
        res.status(500).json({ error: 'An internal server error occurred while fetching resources.' });
    }
});

// --- 7. Start the Server After Data is Loaded ---
const startServer = async () => {
    try {
        // Load all datasets concurrently and wait for them to finish
        const [udemyData, courseraData] = await Promise.all([
            loadCsvData('udemy_courses.csv'),
            loadCsvData('coursera_course_2024.csv')
        ]);

        // Filter and assign the loaded data
        udemyCourses = udemyData.filter(row => row.course_title && row.url);
        courseraCourses = courseraData.filter(row => row['Course Name'] && row['Course ID']);

        console.log(`✅ Loaded ${udemyCourses.length} valid Udemy courses.`);
        console.log(`✅ Loaded ${courseraCourses.length} valid Coursera courses.`);

        // Only start listening for requests after the data is ready
        app.listen(PORT, () => {
            console.log(`🚀 Server is running on http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error("❌ Failed to load course data. Server will not start.", error);
        process.exit(1); // Exit the process with an error code
    }
};

startServer();
        
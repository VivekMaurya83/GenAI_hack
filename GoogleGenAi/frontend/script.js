// Import necessary libraries for file parsing
import * as pdfjsLib from "https://mozilla.github.io/pdf.js/build/pdf.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://mozilla.github.io/pdf.js/build/pdf.worker.mjs`;

// --- DOM ELEMENT REFERENCES ---
const resumeUpload = document.getElementById('resume-upload');
const skillSourceRadios = document.querySelectorAll('input[name="skill-source"]');
const resumeInputContainer = document.getElementById('resume-input-container');
const manualSkillsContainer = document.getElementById('manual-skills-container');
const manualSkillsInput = document.getElementById('manual-skills-input');
const generateBtn = document.getElementById('generate-btn');
const loadingSpinner = document.getElementById('loading-spinner');
const resultsSection = document.getElementById('results-section');
const downloadBtn = document.getElementById('download-btn');
let resumeText = '';

// AI Tutor DOM references (unchanged)
const tutorModal = document.getElementById('tutor-modal');
const modalTopicTitle = document.getElementById('modal-topic-title');
const analogyText = document.getElementById('analogy-text');
const technicalDefinitionText = document.getElementById('technical-definition-text');
const prerequisitesList = document.getElementById('prerequisites-list');
const tutorLoadingState = document.getElementById('tutor-loading-state');
const tutorErrorState = document.getElementById('tutor-error-state');
const tutorResponseContent = document.getElementById('tutor-response-content');

// New AI Chatbot DOM references
const chatbotBtn = document.getElementById('chatbot-button');
const chatbotWindow = document.getElementById('chatbot-window');
const closeChatbotBtn = document.getElementById('close-chatbot-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatbotTypingIndicator = document.getElementById('chatbot-typing-indicator');

// Global variable to store chat history and full plan data
let chatHistory = [];
let userDomain = '';
let careerPlanData = null; // New global variable to store the entire plan

// --- EVENT LISTENERS ---
resumeUpload.addEventListener('change', handleResumeUpload);
generateBtn.addEventListener('click', generatePlan);
downloadBtn.addEventListener('click', downloadPlanAsPDF);

// Event listener for dynamically created help buttons (using event delegation)
document.getElementById('detailed-roadmap-container').addEventListener('click', handleHelpButtonClick);

// Event listener to close the tutor modal
if (tutorModal) {
    tutorModal.querySelector('.close-button').addEventListener('click', () => {
        tutorModal.classList.add('hidden');
    });
}

// Event listener for the new chatbot button
if (chatbotBtn) {
    chatbotBtn.addEventListener('click', () => {
        chatbotWindow.classList.remove('hidden');
        chatbotBtn.classList.add('hidden');
    });
}

// Event listener to close the chatbot window
if (closeChatbotBtn) {
    closeChatbotBtn.addEventListener('click', () => {
        chatbotWindow.classList.add('hidden');
        chatbotBtn.classList.remove('hidden');
    });
}

// Event listener for sending a message
if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
}
if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
}

// Event listeners for skill source selection
if (skillSourceRadios) {
    skillSourceRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'resume') {
                resumeInputContainer.classList.remove('hidden');
                manualSkillsContainer.classList.add('hidden');
            } else {
                resumeInputContainer.classList.add('hidden');
                manualSkillsContainer.classList.remove('hidden');
            }
        });
    });
}

// Event listener for resume file upload
if (resumeUpload) {
    resumeUpload.addEventListener('change', handleResumeUpload);
}

// --- CORE FUNCTIONS ---
async function handleResumeUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    loadingSpinner.classList.remove('hidden');
    let text = '';
    try {
        if (file.type === "application/pdf") {
            const doc = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
            for (let i = 1; i <= doc.numPages; i++) {
                const page = await doc.getPage(i);
                const content = await page.getTextContent();
                text += content.items.map(item => item.str).join(' ');
            }
        } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            const arrayBuffer = await file.arrayBuffer();
            const mammoth = window.mammoth;
            const result = await mammoth.extractRawText({ arrayBuffer });
            text = result.value;
        }
        resumeText = text;
        alert("Resume parsed successfully! The extracted text will be used as your 'Current State' input.");
    } catch (error) {
        console.error("Error parsing resume:", error);
        alert("Could not read the resume file. Please try again or enter skills manually.");
    } finally {
        loadingSpinner.classList.add('hidden');
    }
}

async function generatePlan() {
    const skillSource = document.querySelector('input[name="skill-source"]:checked').value;
    let currentSkillsInput = skillSource === 'resume' ? resumeText : manualSkillsInput.value;

    const inputs = {
        current_skills_input: currentSkillsInput,
        current_level: document.getElementById('current-level').value,
        goal_input: document.getElementById('goal-input').value,
        goal_level: document.getElementById('goal-level').value,
        duration: document.getElementById('duration').value,
        study_hours: document.getElementById('study-hours').value,
    };

    if (!inputs.current_skills_input || !inputs.goal_input) {
        alert("Please provide both your starting point and your destination.");
        return;
    }

    loadingSpinner.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    generateBtn.disabled = true;

    try {
        const response = await fetch('http://127.0.0.1:8000/generate_plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(inputs),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        careerPlanData = data; // Store the entire plan data globally
        renderResults(data);
        userDomain = data.domain; // Store the domain for the chatbot
        chatbotBtn.classList.remove('hidden'); // Show the chatbot button
    } catch (error) {
        console.error("API Error:", error);
        alert(`An error occurred: ${error.message}`);
    } finally {
        loadingSpinner.classList.add('hidden');
        generateBtn.disabled = false;
    }
}

function downloadPlanAsPDF() {
    const element = document.getElementById('results-section');
    const opt = {
        margin: 0.5,
        filename: 'My_Career_Plan.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    const wasHidden = element.classList.contains('hidden');
    if (wasHidden) element.classList.remove('hidden');
    
    html2pdf().set(opt).from(element).save();

    if (wasHidden) element.classList.add('hidden');
}

// --- RENDER FUNCTIONS ---
function renderResults(data) {
    renderScore(data.job_match_score);
    renderSummary(data.skills_to_learn_summary);
    renderTimelineChart(data.timeline_chart_data);
    renderEditableRoadmap(data.detailed_roadmap);
    renderProjects(data.suggested_projects);
    renderCourses(data.suggested_courses);
    resultsSection.classList.remove('hidden');
}

function renderScore(scoreData) {
    const scoreValue = document.getElementById('score-value');
    const scoreCircle = document.querySelector('.score-circle');
    scoreValue.textContent = `${scoreData.score}%`;
    scoreCircle.style.background = `conic-gradient(var(--primary-color) ${scoreData.score * 3.6}deg, #E0E0E0 0deg)`;
    document.getElementById('score-summary').textContent = scoreData.summary;
}

function renderSummary(summary) {
    const list = document.getElementById('summary-list');
    list.innerHTML = summary.map(item => `<li>${item}</li>`).join('');
}

let timelineChartInstance = null;

function renderTimelineChart(chartData) {
    const ctx = document.getElementById('timeline-chart').getContext('2d');
    if (timelineChartInstance) timelineChartInstance.destroy();
    timelineChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Duration in Weeks',
                data: chartData.durations,
                backgroundColor: 'rgba(66, 133, 244, 0.8)',
                borderColor: 'rgba(66, 133, 244, 1)',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, title: { display: true, text: 'Weeks' } } }
        }
    });
}

function renderEditableRoadmap(roadmap) {
    const container = document.getElementById('detailed-roadmap-container');
    container.innerHTML = roadmap.map((phase, index) => `
        <div class="roadmap-phase">
            <h4>${phase.phase_title} (${phase.phase_duration})</h4>
            <ul class="task-list" id="phase-list-${index}">
                ${phase.topics.map(topic => `
                    <li class="task-item">
                        <input type="checkbox" id="${topic.replace(/\s+/g, '-')}-${index}">
                        <label for="${topic.replace(/\s+/g, '-')}-${index}">${topic}</label>
                        <div class="task-actions">
                            <button class="help-btn" data-topic="${topic}"><i class="fas fa-lifesaver"></i> I'm Stuck</button>
                            <button class="delete-task-btn" title="Delete task">✖</button>
                        </div>
                    </li>
                `).join('')}
            </ul>
            <div class="add-task-container">
                <input type="text" class="add-task-input" placeholder="Add a custom task...">
                <button class="add-task-btn" data-phase-index="${index}">Add Task</button>
            </div>
        </div>
    `).join('');
}

function renderProjects(projects) {
    const container = document.getElementById('projects-container');
    container.innerHTML = projects.map(proj => `
        <div class="card">
            <h4>${proj.project_title} <span class="tag">${proj.project_level}</span></h4>
            <p><strong>Skills Covered:</strong> ${proj.skills_mapped.join(', ')}</p>
            <p><strong>What you will learn:</strong> ${proj.what_you_will_learn}</p>
            <strong>Implementation Plan:</strong>
            <ol>
                ${proj.implementation_plan.map(step => `<li>${step}</li>`).join('')}
            </ol>
        </div>
    `).join('');
}

function renderCourses(courses) {
    const container = document.getElementById('courses-container');
    container.innerHTML = courses.map(course => `
        <div class="card">
            <h4><a href="${course.url}" target="_blank" rel="noopener noreferrer">${course.course_name}</a></h4>
            <p><span class="tag">${course.platform}</span></p>
            <p class="mapping">${course.mapping}</p>
        </div>
    `).join('');
}

// --- AI TUTOR FUNCTIONS ---

async function handleHelpButtonClick(event) {
    const helpBtn = event.target.closest('.help-btn');
    if (!helpBtn) return;

    const topic = helpBtn.dataset.topic;
    if (!topic) {
        console.error("No topic found for help button.");
        return;
    }

    tutorModal.classList.remove('hidden');
    tutorLoadingState.classList.remove('hidden');
    tutorResponseContent.classList.add('hidden');
    tutorErrorState.classList.add('hidden');
    modalTopicTitle.textContent = `Explaining: ${topic}`;

    try {
        const response = await fetch('http://127.0.0.1:8000/get_explanation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: topic })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        renderTutorResponse(data);

    } catch (error) {
        console.error("Tutor API Error:", error);
        tutorErrorState.classList.remove('hidden');
        tutorErrorState.textContent = `An error occurred: ${error.message}`;
        tutorResponseContent.classList.add('hidden');
    } finally {
        tutorLoadingState.classList.add('hidden');
    }
}

function renderTutorResponse(data) {
    analogyText.textContent = data.analogy;
    technicalDefinitionText.textContent = data.technical_definition;
    
    prerequisitesList.innerHTML = data.prerequisites.map(item => `<li>${item}</li>`).join('');

    tutorResponseContent.classList.remove('hidden');
}

// --- NEW AI CHATBOT FUNCTIONS ---

async function sendMessage() {
    const userMessage = chatInput.value.trim();
    if (userMessage === '') return;

    // Add user message to chat window and clear input
    appendMessage(userMessage, 'user');
    chatInput.value = '';

    // Show typing indicator
    appendMessage(null, 'typing');

    try {
        // Construct the full chat history and plan data to send to the backend
        const chatPayload = {
            query: userMessage,
            history: chatHistory,
            career_plan: careerPlanData, // Now sending the entire plan
        };

        const response = await fetch('http://127.0.0.1:8000/chat_with_tutor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chatPayload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        
        // Remove typing indicator
        removeTypingIndicator();

        // Add AI response to chat window
        appendMessage(data.response, 'ai');

    } catch (error) {
        console.error("Chat API Error:", error);
        removeTypingIndicator();
        appendMessage("Sorry, I couldn't process your request. Please try again.", 'ai');
    }
}

function appendMessage(text, sender) {
    const messageElement = document.createElement('div');
    
    if (sender === 'typing') {
        messageElement.classList.add('message', 'typing-indicator');
        messageElement.innerHTML = `
            <span></span>
            <span></span>
            <span></span>
        `;
    } else {
        messageElement.classList.add('message', `${sender}-message`);
        const textElement = document.createElement('p');
        textElement.textContent = text;
        messageElement.appendChild(textElement);
        
        // Add message to chat history
        chatHistory.push({ role: sender === 'user' ? 'user' : 'model', content: text });
    }
    
    chatMessages.appendChild(messageElement);

    // Scroll to the latest message
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
    const typingIndicator = document.querySelector('.typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}
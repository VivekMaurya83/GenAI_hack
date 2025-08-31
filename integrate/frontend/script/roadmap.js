// frontend/script/roadmap.js

const API_BASE_URL = "http://127.0.0.1:8000"; // Ensure this matches your FastAPI server address

let currentUser = null;
let currentRoadmapData = null; // To store the generated roadmap
let chatHistory = []; // For the chatbot

// Roadmap form elements
const roadmapGenerationForm = document.getElementById('roadmap-generation-form');
const currentSkillsInput = document.getElementById('currentSkillsInput');
const currentLevelSelect = document.getElementById('currentLevel');
const goalInput = document.getElementById('goalInput');
const goalLevelSelect = document.getElementById('goalLevel');
const durationSelect = document.getElementById('duration');
const studyHoursInput = document.getElementById('studyHours');
const generateRoadmapButton = document.getElementById('generateRoadmapButton');
const imStuckButton = document.getElementById('imStuckButton'); // Now toggles chatbot
const roadmapStatusDiv = document.getElementById('roadmap-status'); // Unified status

// Roadmap output elements
const loadingDiv = document.getElementById('loading');
const resultsSection = document.getElementById('results-section'); // The main output container
const scoreValueSpan = document.getElementById('score-value');
const scoreSummaryP = document.getElementById('score-summary');
const summaryListUl = document.getElementById('summary-list');
const timelineChartCanvas = document.getElementById('timeline-chart');
const detailedRoadmapContainer = document.getElementById('detailed-roadmap-container');
const projectsContainer = document.getElementById('projects-container');
const coursesContainer = document.getElementById('courses-container');
const startNewRoadmapButton = document.getElementById('startNewRoadmapButton');

// Tutor Modal elements
const tutorModal = document.getElementById('tutor-modal');
const closeTutorModalButton = document.getElementById('closeTutorModalButton');
const modalTopicTitle = document.getElementById('modal-topic-title');
const tutorLoadingState = document.getElementById('tutor-loading-state');
const tutorResponseContent = document.getElementById('tutor-response-content');
const analogyTextP = document.getElementById('analogy-text');
const technicalDefinitionTextDiv = document.getElementById('technical-definition-text');
const prerequisitesListUl = document.getElementById('prerequisites-list');

// Chatbot elements
const chatbotFloatButton = document.getElementById('chatbot-float-button');
const chatbotWindow = document.getElementById('chatbot-window');
const closeChatbotButton = document.getElementById('close-chatbot-button');
const chatMessagesDiv = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatButton = document.getElementById('send-chat-button');
const chatbotForm = document.getElementById('chatbot-form');

// Chart.js instance for timeline
let timelineChartInstance = null;

// Navigation buttons
const logoutButton = document.getElementById('logoutButton');

/**
 * Called by auth.js when the user's authentication state changes and they are logged in.
 * @param {firebase.User} user - The authenticated Firebase user object.
 */
function onUserLoggedIn(user) {
    currentUser = user;
    console.log("Roadmap page: User logged in:", currentUser.uid);

    // Fetch and autofill skills from resume
    fetchAndAutofillSkills();

    // Add event listeners
    roadmapGenerationForm.addEventListener('submit', handleGenerateRoadmap);
    imStuckButton.addEventListener('click', () => toggleChatbot(true));
    closeTutorModalButton.addEventListener('click', () => tutorModal.classList.add('hidden'));
    startNewRoadmapButton.addEventListener('click', resetRoadmapUI);

    // Chatbot specific listeners
    chatbotFloatButton.addEventListener('click', () => toggleChatbot(true));
    closeChatbotButton.addEventListener('click', () => toggleChatbot(false));
    chatbotForm.addEventListener('submit', handleChatbotSubmit);
    detailedRoadmapContainer.addEventListener('click', handleHelpButtonClick); // Ensure this is attached

    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
}

/**
 * Fetches user's resume data from profile endpoint and autofills currentSkillsInput.
 */
async function fetchAndAutofillSkills() {
    if (!currentUser) {
        showStatus(roadmapStatusDiv, 'User not authenticated. Please log in.', true);
        return;
    }

    try {
        const idToken = await currentUser.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();

        if (!response.ok) {
            console.error('Failed to fetch profile/resume for autofill:', data.detail || data.message);
            showStatus(roadmapStatusDiv, 'Failed to load skills for autofill. Please enter them manually.', true);
            return;
        }

        const resumeContent = data.resume_content;
        let autofillText = '';

        let allSkills = [];
        if (resumeContent.skills) {
            for (const category in resumeContent.skills) {
                allSkills = allSkills.concat(resumeContent.skills[category]);
            }
        }
        if (allSkills.length > 0) {
            autofillText += `Skills: ${allSkills.join(', ')}`;
        }

        let projectStrings = [];
        if (resumeContent.projects && resumeContent.projects.length > 0) {
            resumeContent.projects.forEach(proj => {
                const title = proj.title || 'Untitled Project';
                const description = (proj.description && Array.isArray(proj.description) ? proj.description.join(' ') : proj.description || '');
                projectStrings.push(`${title} - ${description}`);
            });
            if (autofillText) autofillText += '\n';
            autofillText += `Projects: ${projectStrings.join('\n')}`;
        }
        
        currentSkillsInput.value = autofillText;
        console.log('Skills and Projects autofilled from resume.');
        showStatus(roadmapStatusDiv, '', false, true);
    } catch (error) {
        console.error('Error fetching resume for autofill:', error);
        showStatus(roadmapStatusDiv, 'Error autofilling skills/projects. You can enter them manually.', true);
    }
}

/**
 * Handles the generation of the career roadmap.
 * @param {Event} e - The form submission event.
 */
async function handleGenerateRoadmap(e) {
    e.preventDefault();
    if (!currentUser) {
        showStatus(roadmapStatusDiv, 'User not authenticated. Please log in.', true);
        return;
    }

    if (!currentSkillsInput.value.trim() || !goalInput.value.trim() || 
        !currentLevelSelect.value || !goalLevelSelect.value || 
        !durationSelect.value || !studyHoursInput.value.trim()) {
        showStatus(roadmapStatusDiv, 'Please fill in all required fields.', true);
        return;
    }

    showLoading(true, generateRoadmapButton, "Generating...");
    resultsSection.classList.add('hidden');
    chatbotFloatButton.classList.add('hidden');
    chatbotWindow.classList.add('hidden');
    
    const roadmapRequestData = {
        current_skills_input: currentSkillsInput.value.trim(),
        current_level: currentLevelSelect.value,
        goal_input: goalInput.value.trim(),
        goal_level: goalLevelSelect.value,
        duration: durationSelect.value,
        study_hours: studyHoursInput.value.trim(),
    };

    try {
        const idToken = await currentUser.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/roadmap/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify(roadmapRequestData)
        });

        const result = await response.json();

        if (response.ok) {
            currentRoadmapData = result;
            displayRoadmap(currentRoadmapData);
            resultsSection.classList.remove('hidden');
            roadmapStatusDiv.classList.add('hidden');
            chatbotFloatButton.classList.remove('hidden');
            console.log("Roadmap generated:", currentRoadmapData);
        } else {
            throw new Error(result.detail || result.message || 'Failed to generate roadmap.');
        }
    } catch (error) {
        console.error('Error generating roadmap:', error);
        showStatus(roadmapStatusDiv, `Error: ${error.message}`, true);
    } finally {
        showLoading(false, generateRoadmapButton, "Generate My Strategic Plan");
    }
}

/**
 * Displays the generated roadmap in the output section.
 * @param {Object} roadmap - The structured roadmap data from the AI.
 */
function displayRoadmap(roadmap) {
    scoreValueSpan.textContent = '0%';
    scoreSummaryP.textContent = '';
    summaryListUl.innerHTML = '';
    detailedRoadmapContainer.innerHTML = '';
    projectsContainer.innerHTML = '';
    coursesContainer.innerHTML = '';
    if (timelineChartInstance) timelineChartInstance.destroy();

    if (roadmap.job_match_score) renderScore(roadmap.job_match_score);
    if (roadmap.skills_to_learn_summary) renderSummary(roadmap.skills_to_learn_summary);
    if (roadmap.timeline_chart_data) renderTimelineChart(roadmap.timeline_chart_data);
    if (roadmap.detailed_roadmap) renderInteractiveRoadmap(roadmap.detailed_roadmap);
    if (roadmap.suggested_projects) renderProjects(roadmap.suggested_projects);
    if (roadmap.suggested_courses) renderCourses(roadmap.suggested_courses);
}

/**
 * Renders the job match score.
 * @param {Object} scoreData - Contains score (number) and summary (string).
 */
function renderScore(scoreData) {
    scoreValueSpan.textContent = `${scoreData.score || 0}%`;
    const scoreCircle = document.querySelector(".score-circle");
    if (scoreCircle) {
      scoreCircle.style.background = `conic-gradient(var(--primary-genai-color) ${
        (scoreData.score || 0) * 3.6
      }deg, var(--border-dark) 0deg)`; // Used CSS variable for consistency
    }
    scoreSummaryP.textContent = scoreData.summary || 'N/A';
}

/**
 * Renders the priority skills to learn summary.
 * @param {Array<string>} summary - List of skills.
 */
function renderSummary(summary) {
    summaryListUl.innerHTML = summary.map(item => `<li>${item}</li>`).join('');
}

/**
 * Renders the timeline chart using Chart.js.
 * @param {Object} chartData - Contains labels (array) and durations (array).
 */
function renderTimelineChart(chartData) {
    const ctx = timelineChartCanvas.getContext("2d");
    if (timelineChartInstance) timelineChartInstance.destroy();

    // Get computed styles for CSS variables
    const primaryGenaiColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-genai-color').trim();
    const borderDark = getComputedStyle(document.documentElement).getPropertyValue('--border-dark').trim();
    const textLight = getComputedStyle(document.documentElement).getPropertyValue('--text-light').trim();
    const textMedium = getComputedStyle(document.documentElement).getPropertyValue('--text-medium').trim();

    timelineChartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: chartData.labels,
        datasets: [
          {
            label: "Duration in Weeks",
            data: chartData.durations,
            backgroundColor: primaryGenaiColor, // Use CSS var
            borderColor: primaryGenaiColor, // Use CSS var
            borderWidth: 1
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { 
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        return context.dataset.label + ': ' + context.raw + ' weeks';
                    }
                },
                titleColor: textLight, // Tooltip title color
                bodyColor: textMedium,  // Tooltip body color
                backgroundColor: borderDark, // Tooltip background
                borderColor: primaryGenaiColor, // Tooltip border
                borderWidth: 1
            }
        },
        scales: {
          x: { 
              beginAtZero: true, 
              title: { display: true, text: "weeks", color: textLight },
              grid: { color: borderDark },
              ticks: { color: textMedium }
          },
          y: { 
              title: { display: true, text: "Phase", color: textLight },
              grid: { color: borderDark },
              ticks: { color: textMedium }
          }
        },
        animation: {
            duration: 1000,
            easing: 'easeOutQuart'
        }
      },
    });
}

/**
 * Renders the interactive detailed roadmap with "I'm Stuck" buttons.
 * @param {Array<Object>} roadmap - Array of phase objects.
 */
function renderInteractiveRoadmap(roadmap) {
    detailedRoadmapContainer.innerHTML = roadmap
      .map(
        (phase) => `
            <div class="roadmap-phase card">
                <h4>${phase.phase_title} (${phase.phase_duration} weeks)</h4>
                <ul class="task-list">
                    ${(phase.topics || [])
                      .map(
                        (topic) =>
                          `<li class="task-item"><span>${topic}</span><button class="help-btn btn secondary-btn" data-topic="${topic}"><i class="fas fa-question-circle"></i> I'm Stuck</button></li>`
                      )
                      .join("")}
                </ul>
            </div>
        `
      )
      .join("");
}

/**
 * Renders suggested projects.
 * @param {Array<Object>} projects - Array of project objects.
 */
function renderProjects(projects) {
    projectsContainer.innerHTML = projects
      .map(
        (proj) => `
            <div class="project-card card">
                <h4>${proj.project_title} <span class="tag">${
          proj.project_level
        }</span></h4>
                <p><strong>Skills Covered:</strong> ${(proj.skills_mapped || []).join(
                  ", "
                )}</p>
                <p><strong>What you will learn:</strong> ${proj.what_you_will_learn || 'N/A'}</p>
                <strong>Implementation Plan:</strong>
                <ol>${(proj.implementation_plan || [])
                  .map((step) => `<li>${step}</li>`)
                  .join("")}</ol>
            </div>`
      )
      .join("");
}

/**
 * Renders suggested courses.
 * @param {Array<Object>} courses - Array of course objects.
 */
function renderCourses(courses) {
    coursesContainer.innerHTML = courses
      .map(
        (course) => `
            <div class="course-card card">
                <h4><a href="${course.url}" target="_blank" rel="noopener noreferrer">${course.course_name}</a></h4>
                <p><span class="tag platform-tag">${course.platform}</span></p>
                <p class="mapping">${course.mapping}</p>
            </div>`
      )
      .join("");
}

/**
 * Handles clicks on "I'm Stuck" buttons to show the tutor modal.
 * @param {Event} event - The click event.
 */
async function handleHelpButtonClick(event) {
    const helpBtn = event.target.closest(".help-btn");
    if (!helpBtn) return;
    const topic = helpBtn.dataset.topic;
    if (!topic) return;

    tutorModal.classList.remove("hidden"); // Show the modal
    tutorLoadingState.classList.remove("hidden");
    tutorResponseContent.classList.add("hidden");
    modalTopicTitle.textContent = `Explaining: ${topic}`;

    try {
        const idToken = await currentUser.getIdToken();
        const response = await fetch(
            `${API_BASE_URL}/api/roadmap/tutor`,
            {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ topic: topic }),
            }
        );
        if (!response.ok) {
            throw await response.json();
        }
        const data = await response.json();
        renderTutorResponse(data);
    } catch (error) {
        console.error("Tutor API Error:", error);
        modalTopicTitle.textContent = `Error explaining: ${topic}`;
        analogyTextP.textContent = `Could not fetch explanation. Error: ${error.detail || error.message}`;
        technicalDefinitionTextDiv.innerHTML = '';
        prerequisitesListUl.innerHTML = '';
        tutorResponseContent.classList.remove("hidden");
    } finally {
        tutorLoadingState.classList.add("hidden");
    }
}

/**
 * Renders the AI tutor's response in the modal.
 * @param {Object} data - The structured explanation from the AI tutor.
 */
function renderTutorResponse(data) {
    analogyTextP.textContent = data.analogy || 'N/A';
    technicalDefinitionTextDiv.innerHTML = data.technical_definition || 'N/A';
    prerequisitesListUl.innerHTML = (data.prerequisites || []).map(item => `<li>${item}</li>`).join('') || '<li>None</li>';
    tutorResponseContent.classList.remove("hidden");
}

/**
 * Toggles the visibility of the chatbot window.
 * @param {boolean} show - True to show, false to hide.
 */
function toggleChatbot(show) {
    if (show) {
        chatbotWindow.classList.remove('hidden');
        chatbotFloatButton.classList.add('hidden');
        if (chatHistory.length === 0) {
            appendChatMessage('model', "Hello! I'm your AI Career Assistant. I can help with questions about your *current* career roadmap. What can I do for you?");
        }
        chatInput.focus();
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    } else {
        chatbotWindow.classList.add('hidden');
        chatbotFloatButton.classList.remove('hidden');
    }
}

/**
 * Handles sending messages to the chatbot.
 * @param {Event} e - The form submission event.
 */
async function handleChatbotSubmit(e) {
    e.preventDefault();
    const query = chatInput.value.trim();
    if (!query) return;

    appendChatMessage('user', query);
    chatInput.value = '';
    chatInput.disabled = true;
    sendChatButton.disabled = true;

    const typingIndicatorElement = document.createElement('div');
    typingIndicatorElement.classList.add('chat-message', 'model', 'typing-indicator');
    typingIndicatorElement.textContent = 'AI is typing...';
    chatMessagesDiv.appendChild(typingIndicatorElement);
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;

    try {
        const idToken = await currentUser.getIdToken();
        const chatPayload = {
            query: query,
            history: chatHistory.filter(msg => msg.role !== 'typing'),
            career_plan: currentRoadmapData || {},
        };
        const response = await fetch(`${API_BASE_URL}/api/roadmap/chat`, {
            method: 'POST',
            headers: { 
                "Content-Type": "application/json",
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify(chatPayload),
        });

        const result = await response.json();

        if (response.ok) {
            typingIndicatorElement.remove();
            appendChatMessage('model', result.response);
        } else {
            throw new Error(result.detail || result.message || 'Chatbot failed to respond.');
        }
    } catch (error) {
        console.error('Chatbot error:', error);
        typingIndicatorElement.remove();
        appendChatMessage('model', `Sorry, I couldn't process that. Error: ${error.message}. Please try again.`);
    } finally {
        chatInput.disabled = false;
        sendChatButton.disabled = false;
        chatInput.focus();
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    }
}

/**
 * Appends a message to the chatbot history display.
 * @param {'user' | 'model'} role - The role of the speaker.
 * @param {string} message - The message content.
 */
function appendChatMessage(role, message) {
    chatHistory.push({ role, content: message });

    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message', role);
    messageElement.innerHTML = `<strong>${role === 'user' ? 'You' : 'AI'}:</strong> ${message.replace(/\n/g, '<br>')}`;
    chatMessagesDiv.appendChild(messageElement);
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}


/**
 * Resets the UI to allow generating a new roadmap.
 */
function resetRoadmapUI() {
    resultsSection.classList.add('hidden');
    loadingDiv.classList.add('hidden');
    roadmapStatusDiv.classList.add('hidden');
    chatbotFloatButton.classList.add('hidden');
    chatbotWindow.classList.add('hidden');

    currentRoadmapData = null;
    chatHistory = [];
    chatMessagesDiv.innerHTML = '';

    roadmapGenerationForm.reset();
    fetchAndAutofillSkills();
}


/**
 * Displays a status message to the user.
 * @param {HTMLElement} div - The div element to display the message in.
 * @param {string} message - The message to display.
 * @param {boolean} isError - True if it's an error message, false otherwise.
 * @param {boolean} clearOnly - If true, only clears the message and hides the div.
 */
function showStatus(div, message, isError = false, clearOnly = false) {
    if (clearOnly) {
        div.textContent = '';
        div.classList.add('hidden');
        return;
    }
    div.textContent = message;
    div.className = isError ? 'status-message error' : 'status-message success';
    div.classList.remove('hidden');
}

/**
 * Shows/hides the main loading spinner and updates button text/state.
 * @param {boolean} show - True to show, false to hide.
 * @param {HTMLElement} button - The button element to update.
 * @param {string} defaultText - The default text for the button when not loading.
 */
function showLoading(show, button, defaultText) {
    loadingDiv.classList.toggle('hidden', !show);
    
    const buttonIcon = button.querySelector('i');
    const iconHtml = buttonIcon ? buttonIcon.outerHTML : '';
    
    // Store original text without icon if not already stored
    if (!button.dataset.originalText) {
        button.dataset.originalText = defaultText;
    }

    button.disabled = show;
    button.innerHTML = show
        ? `${iconHtml} ${defaultText}`.trim() // Display loading message with icon
        : `${iconHtml} ${button.dataset.originalText}`.trim(); // Revert to original text with icon

    // Also disable/enable the "I'm Stuck" button
    imStuckButton.disabled = show;
}

/**
 * Handles user logout.
 */
async function handleLogout() {
    try {
        await firebase.auth().signOut();
    } catch (error) {
        console.error("Error signing out:", error);
        showStatus(roadmapStatusDiv, "Failed to log out. Please try again.", true);
    }
}
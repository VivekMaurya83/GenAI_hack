// frontend/script/assessment.js

const API_BASE_URL = "http://127.0.0.1:8000";

let currentUser = null;
let assessmentQuestions = [];
let currentQuestionIndex = 0;
let userAnswers = [];

// --- Predefined Assessment Data ---
const predefinedAssessments = {
    "software_developer": {
        skills: "Python, JavaScript, Data Structures, Algorithms, Git, REST APIs, HTML, CSS, Software Design Principles, Unit Testing",
        targetRolePlaceholder: "e.g., Junior Software Engineer, Senior Backend Developer"
    },
    "data_scientist": {
        skills: "Python, R, SQL, Machine Learning, Statistics, Data Visualization, Deep Learning, A/B Testing, Predictive Modeling",
        targetRolePlaceholder: "e.g., Entry-level Data Scientist, Lead AI/ML Researcher"
    },
    "cybersecurity_analyst": {
        skills: "Network Security, Cryptography, Incident Response, Linux, Python Scripting, SIEM, Vulnerability Assessment, Threat Intelligence, Compliance",
        targetRolePlaceholder: "e.g., Cybersecurity Analyst, Security Engineer"
    },
    "cloud_engineer": {
        skills: "AWS, Azure, GCP, Docker, Kubernetes, CI/CD, Infrastructure as Code (Terraform), Networking, System Administration",
        targetRolePlaceholder: "e.g., Cloud DevOps Engineer, Azure Solutions Architect"
    },
    "custom": {
        skills: "", // User will input custom skills
        targetRolePlaceholder: "Your custom target role (e.g., UX Designer, Blockchain Developer)"
    }
};


// --- DOM Element References ---
const assessmentSetupSection = document.getElementById('assessment-setup-section');
const activeAssessmentSection = document.getElementById('active-assessment-section');
const assessmentResultsSection = document.getElementById('assessment-results-section');
const loadingDiv = document.getElementById('loading');

// Setup Form Elements
const assessmentSetupForm = document.getElementById('assessment-setup-form');
const assessmentTypeSelect = document.getElementById('assessment-type-select'); // NEW
const skillsToAssessTextarea = document.getElementById('skills-to-assess');
const targetRoleInput = document.getElementById('target-role');
const startAssessmentBtn = document.getElementById('start-assessment-btn');
const setupStatusMessageDiv = document.getElementById('setup-status-message');

// Active Assessment Elements
const prevQuestionBtn = document.getElementById('prev-question-btn');
const nextQuestionBtn = document.getElementById('next-question-btn');
const progressBar = document.getElementById('progress-bar');
const currentQuestionCountSpan = document.getElementById('current-question-count');
const questionTextH3 = document.getElementById('question-text');
const questionOptionsDiv = document.getElementById('question-options');
const questionShortAnswerTextarea = document.getElementById('question-short-answer');
const assessmentStatusMessageDiv = document.getElementById('assessment-status-message');

// Results Elements
const overallScoreP = document.getElementById('overall-score');
const skillsMasteredP = document.getElementById('skills-mastered');
const areasToImproveP = document.getElementById('areas-to-improve');
const skillBreakdownChartCanvas = document.getElementById('skill-breakdown-chart');
const strengthsListUl = document.getElementById('strengths-list');
const weaknessesListUl = document.getElementById('weaknesses-list');
const recommendationsListUl = document.getElementById('recommendations-list');
const retakeAssessmentBtn = document.getElementById('retake-assessment-btn');
const resultsStatusMessageDiv = document.getElementById('results-status-message');

const logoutButton = document.getElementById('logoutButton');

let skillBreakdownChartInstance = null;

function onUserLoggedIn(user) {
    currentUser = user;
    console.log("Assessment page: User logged in:", currentUser.uid);

    // Initial setup for the form
    initializeAssessmentSetupForm(); // NEW: Call an initialization function

    // Event Listeners
    assessmentSetupForm.addEventListener('submit', handleStartAssessment);
    nextQuestionBtn.addEventListener('click', handleNextQuestion);
    prevQuestionBtn.addEventListener('click', handlePreviousQuestion);
    retakeAssessmentBtn.addEventListener('click', resetAssessmentUI);
    
    // NEW: Listen for changes on the assessment type select
    assessmentTypeSelect.addEventListener('change', updateSkillsAndRolePlaceholder);

    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
}

// NEW: Function to initialize the assessment setup form
function initializeAssessmentSetupForm() {
    // Attempt to autofill skills from profile first
    fetchAndAutofillSkills(); // This will fill the textarea if data is available

    // Set default placeholder for target role
    targetRoleInput.placeholder = predefinedAssessments.custom.targetRolePlaceholder;
    
    // If the textarea is empty after autofill, or if 'custom' is selected by default,
    // ensure the skills textarea is enabled for editing.
    if (!skillsToAssessTextarea.value.trim() || assessmentTypeSelect.value === 'custom') {
        skillsToAssessTextarea.disabled = false;
    }
}


/**
 * Fetches user's skills from profile endpoint and autofills `skillsToAssessTextarea`.
 * This is now the *initial* autofill; `updateSkillsAndRolePlaceholder` handles changes after user selection.
 */
async function fetchAndAutofillSkills() {
    if (!currentUser) {
        // showStatus(setupStatusMessageDiv, 'User not authenticated. Please log in.', true); // Keep quiet if not logged in yet
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
            console.warn('Failed to fetch profile/resume for autofill, user can still input manually.');
            return;
        }

        const resumeContent = data.resume_content;
        let allSkills = [];
        if (resumeContent.skills) {
            for (const category in resumeContent.skills) {
                allSkills = allSkills.concat(resumeContent.skills[category]);
            }
        }
        if (allSkills.length > 0) {
            skillsToAssessTextarea.value = allSkills.join(', ');
            // If we autofilled, set assessment type to custom and enable editing
            assessmentTypeSelect.value = 'custom';
            skillsToAssessTextarea.disabled = false;
            targetRoleInput.placeholder = predefinedAssessments.custom.targetRolePlaceholder;
        }
        
        console.log('Skills autofilled from resume (if available).');
        // showStatus(setupStatusMessageDiv, '', false, true); // Clear any old status
    } catch (error) {
        console.warn('Error fetching resume for autofill, user can still input manually:', error);
        // showStatus(setupStatusMessageDiv, 'Error autofilling skills. You can enter them manually.', true);
    }
}

// NEW: Function to update skills and role placeholder based on assessment type selection
function updateSkillsAndRolePlaceholder() {
    const selectedType = assessmentTypeSelect.value;
    const data = predefinedAssessments[selectedType];

    if (data) {
        skillsToAssessTextarea.value = data.skills;
        targetRoleInput.placeholder = data.targetRolePlaceholder;

        // If 'custom' is selected, enable skills textarea for editing
        if (selectedType === 'custom') {
            skillsToAssessTextarea.disabled = false;
        } else {
            skillsToAssessTextarea.disabled = true; // Disable if pre-defined type selected
        }
    } else {
        // Fallback if somehow an invalid option is selected
        skillsToAssessTextarea.value = '';
        skillsToAssessTextarea.disabled = false;
        targetRoleInput.placeholder = predefinedAssessments.custom.targetRolePlaceholder;
    }
}


/**
 * Handles the start assessment button click.
 * Fetches questions from the backend.
 */
async function handleStartAssessment(e) {
    e.preventDefault();
    if (!currentUser) {
        showStatus(setupStatusMessageDiv, 'User not authenticated. Please log in.', true);
        return;
    }

    const selectedAssessmentType = assessmentTypeSelect.value; // NEW
    const skills = skillsToAssessTextarea.value.trim();
    const targetRole = targetRoleInput.value.trim();

    if (!selectedAssessmentType || !skills) { // Ensure type and skills are selected/entered
        showStatus(setupStatusMessageDiv, 'Please select an assessment type and ensure skills are entered.', true);
        return;
    }

    showLoading(true, startAssessmentBtn, "Generating Questions...");
    showStatus(setupStatusMessageDiv, '', false, true); // Clear previous messages

    const assessmentRequestData = {
        assessment_type: selectedAssessmentType, // NEW
        skills: skills.split(',').map(s => s.trim()).filter(s => s !== ''),
        target_role: targetRole // Optional
    };

    try {
        const idToken = await currentUser.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/assessment/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify(assessmentRequestData)
        });

        const result = await response.json();

        if (response.ok) {
            assessmentQuestions = result.questions;
            userAnswers = Array(assessmentQuestions.length).fill(null);
            currentQuestionIndex = 0;
            if (assessmentQuestions.length > 0) {
                assessmentSetupSection.classList.add('hidden');
                activeAssessmentSection.classList.remove('hidden');
                renderQuestion();
            } else {
                showStatus(setupStatusMessageDiv, 'No questions could be generated for the specified skills. Please try different skills or a different assessment type.', true);
            }
        } else {
            throw new Error(result.detail || result.message || 'Failed to start assessment.');
        }
    } catch (error) {
        console.error('Error starting assessment:', error);
        showStatus(setupStatusMessageDiv, `Error: ${error.message}`, true);
    } finally {
        showLoading(false, startAssessmentBtn, "Start Assessment");
    }
}

/**
 * Renders the current question and updates UI.
 */
function renderQuestion() {
    const question = assessmentQuestions[currentQuestionIndex];
    if (!question) {
        console.error("No question to render at index:", currentQuestionIndex);
        return;
    }

    questionTextH3.textContent = question.question_text;
    currentQuestionCountSpan.textContent = `Question ${currentQuestionIndex + 1} of ${assessmentQuestions.length}`;
    updateProgressBar();
    hideStatus(assessmentStatusMessageDiv);

    questionOptionsDiv.innerHTML = '';
    questionShortAnswerTextarea.classList.add('hidden');

    if (question.question_type === 'multiple_choice' || question.question_type === 'single_choice') {
        questionOptionsDiv.classList.remove('hidden');
        question.options.forEach((option, index) => {
            const inputType = question.question_type === 'single_choice' ? 'radio' : 'checkbox';
            const optionId = `option-${currentQuestionIndex}-${index}`;
            const isChecked = Array.isArray(userAnswers[currentQuestionIndex]) 
                ? userAnswers[currentQuestionIndex].includes(option)
                : userAnswers[currentQuestionIndex] === option;

            questionOptionsDiv.innerHTML += `
                <div class="option-item">
                    <input type="${inputType}" id="${optionId}" name="question-${currentQuestionIndex}" value="${option}" ${isChecked ? 'checked' : ''}>
                    <label for="${optionId}">${option}</label>
                </div>
            `;
        });
        questionOptionsDiv.querySelectorAll(`input[name="question-${currentQuestionIndex}"]`).forEach(input => {
            input.addEventListener('change', captureAnswer);
        });

    } else if (question.question_type === 'short_answer' || question.question_type === 'coding_challenge') {
        questionOptionsDiv.classList.add('hidden');
        questionShortAnswerTextarea.classList.remove('hidden');
        questionShortAnswerTextarea.value = userAnswers[currentQuestionIndex] || '';
    }

    prevQuestionBtn.disabled = currentQuestionIndex === 0;
    nextQuestionBtn.textContent = (currentQuestionIndex === assessmentQuestions.length - 1) 
        ? "Submit Assessment" 
        : "Next";
    nextQuestionBtn.querySelector('i').className = (currentQuestionIndex === assessmentQuestions.length - 1) 
        ? "fas fa-check-circle" 
        : "fas fa-arrow-right";
}

function captureAnswer() {
    const question = assessmentQuestions[currentQuestionIndex];
    if (!question) return;

    if (question.question_type === 'short_answer' || question.question_type === 'coding_challenge') {
        userAnswers[currentQuestionIndex] = questionShortAnswerTextarea.value;
    } else {
        const selectedOptions = Array.from(
            questionOptionsDiv.querySelectorAll(`input[name="question-${currentQuestionIndex}"]:checked`)
        ).map(input => input.value);

        if (question.question_type === 'single_choice') {
            userAnswers[currentQuestionIndex] = selectedOptions[0] || null;
        } else if (question.question_type === 'multiple_choice') {
            userAnswers[currentQuestionIndex] = selectedOptions;
        }
    }
    console.log("Answer for question", currentQuestionIndex + 1, ":", userAnswers[currentQuestionIndex]);
}

async function handleNextQuestion() {
    captureAnswer();

    const currentAnswer = userAnswers[currentQuestionIndex];
    if (currentAnswer === null || (Array.isArray(currentAnswer) && currentAnswer.length === 0) || (typeof currentAnswer === 'string' && currentAnswer.trim() === '')) {
        showStatus(assessmentStatusMessageDiv, 'Please answer the current question before proceeding.', true);
        return;
    }

    if (currentQuestionIndex < assessmentQuestions.length - 1) {
        currentQuestionIndex++;
        renderQuestion();
    } else {
        await handleSubmitAssessment();
    }
}

function handlePreviousQuestion() {
    captureAnswer();
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderQuestion();
    }
}

function updateProgressBar() {
    const progress = ((currentQuestionIndex + 1) / assessmentQuestions.length) * 100;
    progressBar.style.width = `${progress}%`;
}

async function handleSubmitAssessment() {
    showLoading(true, nextQuestionBtn, "Submitting...");
    hideStatus(assessmentStatusMessageDiv);

    const answersPayload = {
        assessment_id: currentUser.uid,
        answers: userAnswers.map((answer, index) => ({
            question_id: assessmentQuestions[index].question_id,
            answer: answer
        }))
    };
    
    try {
        const idToken = await currentUser.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/assessment/submit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify(answersPayload)
        });

        const result = await response.json();

        if (response.ok) {
            displayResults(result);
            activeAssessmentSection.classList.add('hidden');
            assessmentResultsSection.classList.remove('hidden');
        } else {
            throw new Error(result.detail || result.message || 'Failed to submit assessment.');
        }
    } catch (error) {
        console.error('Error submitting assessment:', error);
        showStatus(assessmentStatusMessageDiv, `Error: ${error.message}`, true);
    } finally {
        showLoading(false, nextQuestionBtn, "Submit Assessment");
    }
}

function displayResults(results) {
    overallScoreP.textContent = `${results.overall_score || 0}%`;
    skillsMasteredP.textContent = results.skills_mastered || 0;
    areasToImproveP.textContent = results.areas_to_improve || 0;

    strengthsListUl.innerHTML = results.strengths 
        ? results.strengths.map(s => `<li class="strength"><i class="fas fa-plus-circle"></i> ${s}</li>`).join('')
        : '';
    weaknessesListUl.innerHTML = results.weaknesses
        ? results.weaknesses.map(w => `<li class="weakness"><i class="fas fa-minus-circle"></i> ${w}</li>`).join('')
        : '';
    recommendationsListUl.innerHTML = results.recommendations
        ? results.recommendations.map(r => `<li><i class="fas fa-lightbulb"></i> ${r}</li>`).join('')
        : '';

    renderSkillBreakdownChart(results.skill_scores);
}

function renderSkillBreakdownChart(skillScores) {
    const ctx = skillBreakdownChartCanvas.getContext('2d');
    if (skillBreakdownChartInstance) {
        skillBreakdownChartInstance.destroy();
    }

    const labels = Object.keys(skillScores);
    const data = Object.values(skillScores);

    const primaryGenaiColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-genai-color').trim();
    const textLight = getComputedStyle(document.documentElement).getPropertyValue('--text-light').trim();
    const textMedium = getComputedStyle(document.documentElement).getPropertyValue('--text-medium').trim();
    const borderDark = getComputedStyle(document.documentElement).getPropertyValue('--border-dark').trim();
    const cardBgDark = getComputedStyle(document.documentElement).getPropertyValue('--card-bg-dark').trim();


    skillBreakdownChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Your Proficiency',
                data: data,
                backgroundColor: `${primaryGenaiColor}40`,
                borderColor: primaryGenaiColor,
                borderWidth: 2,
                pointBackgroundColor: primaryGenaiColor,
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: primaryGenaiColor
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            elements: {
                line: {
                    borderWidth: 3
                }
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: textLight
                    }
                },
                tooltip: {
                    titleColor: textLight,
                    bodyColor: textMedium,
                    backgroundColor: cardBgDark,
                    borderColor: primaryGenaiColor,
                    borderWidth: 1
                }
            },
            scales: {
                r: {
                    angleLines: {
                        color: borderDark
                    },
                    grid: {
                        color: borderDark
                    },
                    pointLabels: {
                        color: textMedium,
                        font: {
                            size: 12
                        }
                    },
                    ticks: {
                        backdropColor: cardBgDark,
                        color: textLight,
                        beginAtZero: true,
                        max: 100,
                        min: 0,
                        stepSize: 25
                    }
                }
            }
        }
    });
}


function resetAssessmentUI() {
    assessmentSetupSection.classList.remove('hidden');
    activeAssessmentSection.classList.add('hidden');
    assessmentResultsSection.classList.add('hidden');
    loadingDiv.classList.add('hidden');

    assessmentQuestions = [];
    currentQuestionIndex = 0;
    userAnswers = [];

    assessmentSetupForm.reset();
    initializeAssessmentSetupForm(); // Re-initialize form to reset dropdown/skills

    overallScoreP.textContent = '--%';
    skillsMasteredP.textContent = '0';
    areasToImproveP.textContent = '0';
    strengthsListUl.innerHTML = '';
    weaknessesListUl.innerHTML = '';
    recommendationsListUl.innerHTML = '';
    if (skillBreakdownChartInstance) {
        skillBreakdownChartInstance.destroy();
        skillBreakdownChartInstance = null;
    }

    hideAllStatusMessages();
}


function showLoading(show, button, defaultText) {
    loadingDiv.classList.toggle('hidden', !show);
    
    const buttonIcon = button.querySelector('i');
    const iconHtml = buttonIcon ? buttonIcon.outerHTML : '';
    
    if (!button.dataset.originalText) {
        button.dataset.originalText = defaultText;
    }

    button.disabled = show;
    button.innerHTML = show
        ? `${iconHtml} ${defaultText}`.trim()
        : `${iconHtml} ${button.dataset.originalText}`.trim();

    if (show) {
        prevQuestionBtn.disabled = true;
        nextQuestionBtn.disabled = true;
        startAssessmentBtn.disabled = true;
        retakeAssessmentBtn.disabled = true;
        logoutButton.disabled = true;
    } else {
        prevQuestionBtn.disabled = currentQuestionIndex === 0;
        nextQuestionBtn.disabled = false;
        startAssessmentBtn.disabled = false;
        retakeAssessmentBtn.disabled = false;
        logoutButton.disabled = false;
    }
}

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

function hideStatus(div) {
    if (div) {
        div.classList.add('hidden');
        div.textContent = '';
    }
}

function hideAllStatusMessages() {
    hideStatus(setupStatusMessageDiv);
    hideStatus(assessmentStatusMessageDiv);
    hideStatus(resultsStatusMessageDiv);
}

async function handleLogout() {
    try {
        await firebase.auth().signOut();
    } catch (error) {
        console.error("Error signing out:", error);
        showStatus(resultsStatusMessageDiv, "Failed to log out. Please try again.", true);
    }
}
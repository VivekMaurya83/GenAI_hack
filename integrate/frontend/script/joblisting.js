// frontend/script/joblisting.js

const API_BASE_URL = 'http://127.0.0.1:8000'; // Ensure this matches your FastAPI server address

let currentUser = null;

// DOM Elements
const resumeUploadInput = document.getElementById('resumeUpload');
const fileNameSpan = document.getElementById('fileName');
const customFileButton = document.querySelector('.custom-file-button'); // Reference to the custom button
const locationInput = document.getElementById('locationInput');
const findJobsButton = document.getElementById('findJobsButton');
const jobSearchStatusDiv = document.getElementById('job-search-status');
const jobSearchForm = document.getElementById('job-search-form');

const loadingDiv = document.getElementById('loading');
const resultsContainer = document.getElementById('results-container');
const skillsListUl = document.getElementById('skills-list');
const jobsListDiv = document.getElementById('jobs-list');
const noJobsMessageP = document.getElementById('no-jobs-message');
const startNewSearchButton = document.getElementById('startNewSearchButton');

const logoutButton = document.getElementById('logoutButton');

/**
 * Called by auth.js when the user's authentication state changes and they are logged in.
 * @param {firebase.User} user - The authenticated Firebase user object.
 */
function onUserLoggedIn(user) {
    currentUser = user;
    console.log("JobListing page: User logged in:", currentUser.uid);

    // Event Listeners
    resumeUploadInput.addEventListener('change', updateFileName);
    jobSearchForm.addEventListener('submit', handleFindJobs);
    startNewSearchButton.addEventListener('click', resetJobSearchUI);
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
}

function updateFileName() {
    if (resumeUploadInput.files.length > 0) {
        fileNameSpan.textContent = resumeUploadInput.files[0].name;
    } else {
        fileNameSpan.textContent = "No file chosen"; // Changed text to match image
    }
    hideStatus(jobSearchStatusDiv); // Clear status when file changes
}

async function handleFindJobs(e) {
    e.preventDefault();
    hideStatus(jobSearchStatusDiv);
    
    if (!currentUser) {
        showStatus(jobSearchStatusDiv, 'User not authenticated. Please log in.', true);
        return;
    }

    const file = resumeUploadInput.files[0];
    const location = locationInput.value.trim();

    if (!file) {
        showStatus(jobSearchStatusDiv, 'Please upload your resume (PDF).', true);
        return;
    }
    if (!location) {
        showStatus(jobSearchStatusDiv, 'Please enter a location for job search.', true);
        return;
    }

    showLoading(true); // Now correctly calls local showLoading
    resultsContainer.classList.add('hidden'); // Hide previous results
    noJobsMessageP.classList.add('hidden'); // Hide previous no jobs message

    const formData = new FormData();
    formData.append('file', file);

    try {
        const idToken = await currentUser.getIdToken();
        console.log("Job Search: Sending ID Token:", idToken); // Diagnostic log

        const response = await fetch(`${API_BASE_URL}/api/jobs/find_jobs/?location=${encodeURIComponent(location)}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`
            },
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || data.message || `HTTP error! Status: ${response.status}`);
        }

        console.log("Job search results:", data);
        renderJobResults(data);

    } catch (error) {
        console.error("Error fetching job data:", error);
        showStatus(jobSearchStatusDiv, `Error searching for jobs: ${error.message || 'An unknown error occurred.'}`, true);
    } finally {
        showLoading(false); // Now correctly calls local showLoading
    }
}

function renderJobResults(data) {
    resultsContainer.classList.remove('hidden');
    jobsListDiv.innerHTML = ''; // Clear previous jobs
    skillsListUl.innerHTML = ''; // Clear previous skills

    if (data.skills && data.skills.length > 0) {
        skillsListUl.innerHTML = data.skills.map(skill => `<li>${skill}</li>`).join('');
    } else {
        skillsListUl.innerHTML = '<li class="no-data-message">No prominent skills extracted from resume.</li>'; // Added class for specific styling
    }

    if (data.jobs && data.jobs.length > 0) {
        data.jobs.forEach(job => {
            const jobCard = `
                <div class="job-card">
                    <h3><a href="${job.url}" target="_blank" rel="noopener noreferrer">${job.title || 'N/A'}</a></h3>
                    <p><strong>Company:</strong> ${job.company || 'N/A'}</p>
                    <p><strong>Location:</strong> ${job.location || 'N/A'}</p>
                    <p><strong>Matched Skill:</strong> <span class="tag">${job.match_skill || 'N/A'}</span></p>
                    <p><strong>AI Relevance Score:</strong> <span class="rating">${job.rating || 0}/10</span></p>
                    <p class="reason">"${job.reason || 'No reason provided by AI.'}"</p>
                    <a href="${job.url}" target="_blank" rel="noopener noreferrer" class="btn secondary-btn">View Job & Apply</a>
                </div>
            `;
            jobsListDiv.innerHTML += jobCard;
        });
    } else {
        noJobsMessageP.classList.remove('hidden');
    }
}

function resetJobSearchUI() {
    jobSearchForm.reset(); // Clear form inputs
    resumeUploadInput.value = ''; // Clear file input
    fileNameSpan.textContent = 'No file chosen'; // Changed text to match image
    hideStatus(jobSearchStatusDiv);
    loadingDiv.classList.add('hidden');
    resultsContainer.classList.add('hidden');
    noJobsMessageP.classList.add('hidden');
    jobsListDiv.innerHTML = '';
    skillsListUl.innerHTML = '';
}

/**
 * Displays a status message in a given div.
 * @param {HTMLElement} targetDiv - The div element to display the message in.
 * @param {string} message - The message content.
 * @param {boolean} isError - True if it's an error message (red/error class), false for success (green/success class).
 */
function showStatus(targetDiv, message, isError = false) {
    if (targetDiv) {
        targetDiv.textContent = message;
        targetDiv.className = isError ? 'status-message error' : 'status-message success';
        targetDiv.classList.remove("hidden");
    } else {
        console.error("Error: targetDiv for status message is null.", message);
        alert(isError ? `Error: ${message}` : message); // Fallback alert for critical issues
    }
}

/**
 * Hides a status message div.
 * @param {HTMLElement} targetDiv - The div element to hide.
 */
function hideStatus(targetDiv) {
    if (targetDiv) {
        targetDiv.classList.add("hidden");
        targetDiv.textContent = '';
    }
}

/**
 * Shows/hides the main loading spinner.
 * @param {boolean} show - True to show, false to hide.
 */
function showLoading(show) { // Defined locally
    loadingDiv.classList.toggle('hidden', !show);
    findJobsButton.disabled = show;
}

async function handleLogout() {
    try {
        await firebase.auth().signOut();
    } catch (error) {
        console.error("Error signing out:", error);
        alert("Failed to log out. Please try again.");
    }
}

// Initial check for user authentication state is handled by auth.js
// auth.js will call onUserLoggedIn if a user is already signed in.
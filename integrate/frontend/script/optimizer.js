// frontend/script/optimizer.js

const API_BASE_URL = "http://127.0.0.1:8000"; // Ensure this matches your FastAPI server address

// Get references to all the HTML elements on this page
const fileInput = document.getElementById("resume_file");
const uploadForm = document.getElementById("upload-form");
const resumeOptimizeForm = document.getElementById("optimize-form-resume");
const linkedinOptimizeForm = document.getElementById("optimize-form-linkedin");

const loadingDiv = document.getElementById("loading");
const uploadSection = document.getElementById("upload-section");
const choiceSection = document.getElementById("choice-section");
const resumeOptimizerSection = document.getElementById(
  "resume-optimizer-section"
);
const linkedinOptimizerSection = document.getElementById(
  "linkedin-optimizer-section"
);

// Changed button IDs for clarity and to align with new HTML structure
const showResumeOptimizerCard = document.getElementById("show-resume-optimizer-card");
const showLinkedinOptimizerCard = document.getElementById("show-linkedin-optimizer-card");
const linkedinContentDiv = document.getElementById("linkedin-content");

// --- IMPORTANT: Updated Error Message Div References ---
const uploadErrorMessageDiv = document.getElementById("upload-error-message"); // Changed ID
const resumeOptimizerErrorMessageDiv = document.getElementById("resume-optimize-error-message"); // Changed ID
const linkedinOptimizerErrorMessageDiv = document.getElementById("linkedin-optimize-error-message"); // Changed ID

const startOverLink = document.getElementById("start-over-link");
const backLinks = document.querySelectorAll(".back-link");

// Optimization request inputs (for autofill suggestions)
const resumeUserRequestTextarea = document.getElementById("resume_user_request");
const linkedinUserRequestTextarea = document.getElementById("linkedin_user_request");


// --- Global variables for authentication and resume ID ---
let currentUser = null; // Stores the Firebase user object
let currentResumeId = null; // This will now always be the user.uid
let fetchedResumeContent = null; // To store the fetched resume data for suggesting optimizations

/**
 * Called by auth.js when the user's authentication state changes and they are logged in.
 * @param {firebase.User} user - The authenticated Firebase user object.
 */
function onUserLoggedIn(user) {
    currentUser = user;
    currentResumeId = user.uid; // The user's UID is now their "resume_id" for DB operations
    console.log("Optimizer page: User logged in. currentResumeId:", currentResumeId);

    resetUI(); // Ensure UI is in a clean state
    fetchAndSuggestOptimizations(); // New: Fetch resume for suggestions

    // Event listeners for navigation
    showResumeOptimizerCard.addEventListener("click", () => {
        choiceSection.classList.add("hidden");
        resumeOptimizerSection.classList.remove("hidden");
        hideAllErrors(); // Clear errors when navigating sections
    });
    showLinkedinOptimizerCard.addEventListener("click", () => {
        choiceSection.classList.add("hidden");
        linkedinOptimizerSection.classList.remove("hidden");
        hideAllErrors(); // Clear errors when navigating sections
    });

    // Add the event listener for the logout button
    const logoutButton = document.getElementById("logoutButton");
    if (logoutButton) {
        logoutButton.addEventListener("click", async () => {
            try {
                await firebase.auth().signOut();
                // Redirect will be handled by auth.js onAuthStateChanged
            } catch (error) {
                console.error("Error signing out:", error);
                alert("Failed to log out. Please try again.");
            }
        });
    }
}

/**
 * Fetches user's resume data and suggests initial optimization requests.
 */
async function fetchAndSuggestOptimizations() {
    if (!currentUser) {
        showError('User not authenticated. Please log in.', uploadErrorMessageDiv);
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
            console.error('Failed to fetch profile/resume for suggestions:', data.detail || data.message);
            console.warn('Could not fetch resume for optimization suggestions. User can manually input requests.');
            return;
        }

        fetchedResumeContent = data.resume_content;
        console.log('Resume content fetched for optimization suggestions.');

        if (fetchedResumeContent && fetchedResumeContent.summary) {
            resumeUserRequestTextarea.placeholder = "e.g., 'Summary: make it more impactful and concise'";
        } else if (fetchedResumeContent && fetchedResumeContent.work_experience && fetchedResumeContent.work_experience.length > 0) {
            resumeUserRequestTextarea.placeholder = "e.g., 'Work experience: quantify achievements in my latest role'";
        } else {
            resumeUserRequestTextarea.placeholder = "e.g., 'Improve overall clarity' or 'Add a strong summary'";
        }
        
        if (fetchedResumeContent && (fetchedResumeContent.work_experience || fetchedResumeContent.projects || fetchedResumeContent.summary)) {
             linkedinUserRequestTextarea.placeholder = "e.g., 'Generate strong headlines and an About section' or 'Highlight my key achievements for LinkedIn'";
        } else {
            linkedinUserRequestTextarea.placeholder = "e.g., 'Generate a professional summary for my LinkedIn profile'";
        }

    } catch (error) {
        console.error('Error fetching resume for optimization suggestions:', error);
        console.warn('Network error when trying to fetch resume for suggestions.');
    }
}


// --- UI State Management ---
function resetUI() {
  choiceSection.classList.add("hidden");
  resumeOptimizerSection.classList.add("hidden");
  linkedinOptimizerSection.classList.add("hidden");
  uploadSection.classList.remove("hidden");
  linkedinContentDiv.innerHTML = "";
  hideAllErrors();
  fileInput.value = "";
  resumeUserRequestTextarea.value = '';
  linkedinUserRequestTextarea.value = '';
}
startOverLink.addEventListener("click", (e) => {
  e.preventDefault();
  resetUI();
  fetchAndSuggestOptimizations();
});

// --- Form Submission Logic: Initial Resume File Upload ---
uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = fileInput.files[0];
  if (!file) {
    showError("Please select a file.", uploadErrorMessageDiv); // Use specific div
    return;
  }
  if (!currentUser) {
      showError("User not authenticated. Please log in.", uploadErrorMessageDiv); // Use specific div
      return;
  }

  const formData = new FormData();
  formData.append("file", file);

  showLoading(true);
  try {
    const idToken = await currentUser.getIdToken();
    console.log("Upload: Sending ID Token:", idToken);
    const response = await fetch(`${API_BASE_URL}/api/resume/upload`, {
      method: "POST",
      headers: {
          'Authorization': `Bearer ${idToken}`
      },
      body: formData,
    });
    if (!response.ok) {
      throw await response.json();
    }
    const data = await response.json();
    console.log("Resume upload successful:", data);

    uploadSection.classList.add("hidden");
    choiceSection.classList.remove("hidden");
    fetchAndSuggestOptimizations();

  } catch (error) {
    console.error("Upload and analysis failed:", error);
    showError(error.detail || "Upload and analysis failed.", uploadErrorMessageDiv); // Use specific div
  } finally {
    showLoading(false);
  }
});

// --- UI Navigation Logic ---
backLinks.forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    resumeOptimizerSection.classList.add("hidden");
    linkedinOptimizerSection.classList.add("hidden");
    choiceSection.classList.remove("hidden");
    hideAllErrors();
    resumeUserRequestTextarea.value = '';
    linkedinUserRequestTextarea.value = '';
    linkedinContentDiv.innerHTML = '';
  });
});


// --- Resume Optimization Logic ---
resumeOptimizeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentResumeId) {
    showError("Resume ID is missing. Please upload a resume first.", resumeOptimizerErrorMessageDiv);
    return;
  }
  if (!currentUser) {
      showError("User not authenticated. Please log in.", resumeOptimizerErrorMessageDiv);
      return;
  }

  const userRequest = resumeUserRequestTextarea.value;
  const requestBody = { user_request: userRequest };
  
  const button = resumeOptimizeForm.querySelector("button");
  setButtonLoading(button, true, "Optimizing...");
  try {
    const idToken = await currentUser.getIdToken();
    console.log("Optimize: Sending ID Token:", idToken);

    const optimizeResponse = await fetch(`${API_BASE_URL}/api/resume/optimize`, {
      method: "POST",
      headers: { 
          "Content-Type": "application/json",
          'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify(requestBody),
    });
    if (!optimizeResponse.ok) {
      throw await optimizeResponse.json();
    }
    const optimizeData = await optimizeResponse.json();

    if (optimizeData.download_url) {
        showLoading(true);
        showError('Download starting...', false, resumeOptimizerErrorMessageDiv);
        const downloadUrl = `${API_BASE_URL}${optimizeData.download_url}`;

        console.log("Download: Making authenticated fetch for URL:", downloadUrl);
        console.log("Download: Using ID Token for GET request:", idToken);

        const downloadResponse = await fetch(downloadUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        });

        if (!downloadResponse.ok) {
            let errorText = await downloadResponse.text();
            try {
                const errorJson = JSON.parse(errorText);
                errorText = errorJson.detail || errorJson.message || errorText;
            } catch (e) { /* not JSON */ }
            throw new Error(`Failed to download optimized resume. Status: ${downloadResponse.status}, Response: ${errorText}`);
        }

        const contentDisposition = downloadResponse.headers.get('Content-Disposition');
        let filename = 'Optimized_Resume.docx';
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
            if (filenameMatch && filenameMatch[1]) {
                filename = filenameMatch[1];
            }
        }
        
        const blob = await downloadResponse.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        
        showError('Optimized resume downloaded successfully!', false, resumeOptimizerErrorMessageDiv);

    } else {
        showError('Optimization successful, but no download URL was provided by the backend.', true, resumeOptimizerErrorMessageDiv);
    }
  } catch (error) {
    console.error("Resume optimization or download failed:", error);
    showError(error.message || error.detail || "Resume optimization or download failed.", resumeOptimizerErrorMessageDiv);
  } finally {
    setButtonLoading(button, false, "Optimize & Download");
    showLoading(false);
  }
});

// --- LinkedIn Optimization Logic ---
linkedinOptimizeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentResumeId) {
    showError("Resume ID is missing. Please upload a resume first.", linkedinOptimizerErrorMessageDiv);
    return;
  }
  if (!currentUser) {
      showError("User not authenticated. Please log in.", linkedinOptimizerErrorMessageDiv);
      return;
  }

  const userRequest = linkedinUserRequestTextarea.value;
  const requestBody = { user_request: userRequest };
  
  const button = linkedinOptimizeForm.querySelector("button");
  setButtonLoading(button, true, "Generating...");
  linkedinContentDiv.innerHTML = '<div class="spinner"></div>';
  try {
    const idToken = await currentUser.getIdToken();
    console.log("LinkedIn Optimize: Sending ID Token:", idToken);

    const response = await fetch(
      `${API_BASE_URL}/api/resume/linkedin-optimize`,
      {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(requestBody),
      }
    );
    if (!response.ok) {
      throw await response.json();
    }
    const data = await response.json();
    displayLinkedInContent(data);
  } catch (error) {
    console.error("LinkedIn content generation failed:", error);
    showError(error.detail || "LinkedIn content generation failed.", linkedinOptimizerErrorMessageDiv);
    linkedinContentDiv.innerHTML = "";
  } finally {
    setButtonLoading(button, false, "Generate Content");
  }
});

// --- Helper Functions ---
function displayLinkedInContent(data) {
  let html = "";
  if (data.headlines && data.headlines.length > 0) {
    html +=
      "<h3>Headline Suggestions</h3><ul>" +
      data.headlines.map((h) => `<li>${h}</li>`).join("") +
      "</ul>";
  }
  if (data.about_section) {
    html += `<h3>About Section</h3><p>${data.about_section.replace(
      /\n/g,
      "<br>"
    )}</p>`;
  }
  if (data.optimized_experiences && data.optimized_experiences.length > 0) {
    html += "<h3>Experience Suggestions</h3>";
    data.optimized_experiences.forEach((exp) => {
      html += `<h4>${exp.title}</h4><p>${exp.description}</p>`;
    });
  }
  if (data.optimized_projects && data.optimized_projects.length > 0) {
    html += "<h3>Project Suggestions</h3>";
    data.optimized_projects.forEach((proj) => {
      html += `<h4>${proj.title}</h4><p>${proj.description}</p>`;
    });
  }
  linkedinContentDiv.innerHTML = html;
}
function showLoading(isLoading) {
  loadingDiv.classList.toggle("hidden", !isLoading);
  hideAllErrors();
}
function setButtonLoading(button, isLoading, loadingText) {
  button.disabled = isLoading;
  button.textContent = isLoading
    ? loadingText
    : (button.form.id.includes("resume")
        ? "Optimize & Download"
        : "Generate Content");
}
// Modified showError to accept a targetDiv
function showError(message, targetDiv, isError = true) {
    if (targetDiv) { // Ensure targetDiv is not null
        targetDiv.textContent = isError ? `Error: ${message}` : message;
        targetDiv.className = isError ? 'status-message error' : 'status-message success';
        targetDiv.classList.remove("hidden");
    } else {
        console.error("Error: targetDiv for status message is null.", message);
        // Fallback to a generic alert or console log if a specific div isn't available
        alert(`${message}`);
    }
}
// Modified hideError to accept a targetDiv, and added hideAllErrors
function hideError(targetDiv) {
    if (targetDiv) {
        targetDiv.classList.add("hidden");
        targetDiv.textContent = '';
    }
}
function hideAllErrors() {
    hideError(uploadErrorMessageDiv);
    hideError(resumeOptimizerErrorMessageDiv);
    hideError(linkedinOptimizerErrorMessageDiv);
}

// Initial check for user authentication state is handled by auth.js
// auth.js will call onUserLoggedIn if a user is already signed in.
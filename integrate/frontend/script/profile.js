// frontend/script/profile.js

const API_BASE_URL = 'http://127.0.0.1:8000';

const userNameSpan = document.getElementById('user-name');
const userEmailSpan = document.getElementById('user-email');

const profileNameInput = document.getElementById('profileName');
const profileEmailInput = document.getElementById('profileEmail');
const profilePhoneInput = document.getElementById('profilePhone');
const profileLinkedinInput = document.getElementById('profileLinkedin');
const profileGithubInput = document.getElementById('profileGithub');
const profileSummaryTextarea = document.getElementById('profileSummary');
const profileSkillsTextarea = document.getElementById('profileSkills');
const profileProjectsTextarea = document.getElementById('profileProjects');

const editResumeDetailsButton = document.getElementById('editResumeDetailsButton');
const saveResumeDetailsButton = document.getElementById('saveResumeDetailsButton');
const cancelEditDetailsButton = document.getElementById('cancelEditDetailsButton');
const editDetailsForm = document.getElementById('edit-resume-details-form');
const detailsUpdateStatusDiv = document.getElementById('details-update-status');

const uploadResumeFileForm = document.getElementById('upload-resume-file-form');
const resumeFileInput = document.getElementById('resumeFileInput');
const uploadResumeFileButton = document.getElementById('uploadResumeFileButton');
const fileUploadStatusDiv = document.getElementById('file-upload-status');

const logoutButton = document.getElementById('logoutButton');


let currentUser = null;
let originalResumeData = {};

function onUserLoggedIn(user) {
    currentUser = user;
    console.log("Profile page: User logged in:", currentUser.uid);

    userNameSpan.textContent = currentUser.displayName || 'Not available';
    userEmailSpan.textContent = currentUser.email || 'Not available';

    fetchAndDisplayResume();

    editResumeDetailsButton.addEventListener('click', () => toggleEditMode(true));
    cancelEditDetailsButton.addEventListener('click', () => {
        populateResumeFields(originalResumeData);
        toggleEditMode(false);
    });
    editDetailsForm.addEventListener('submit', handleSaveResumeDetails);

    uploadResumeFileForm.addEventListener('submit', handleResumeFileUpload);

    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
}

async function fetchAndDisplayResume() {
    if (!currentUser) {
        console.error('User not authenticated for fetching resume.');
        showStatus(fileUploadStatusDiv, 'Please log in to view your profile.', true);
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
            console.error('Failed to fetch profile/resume:', data.detail || data.message);
            showStatus(fileUploadStatusDiv, data.message || 'Failed to load resume details.', true);
            return;
        }

        console.log("Fetched profile and resume data:", data);

        userNameSpan.textContent = data.name || currentUser.displayName || 'Not available';
        userEmailSpan.textContent = data.email || currentUser.email || 'Not available';

        const resumeContent = data.resume_content;
        originalResumeData = JSON.parse(JSON.stringify(resumeContent));

        populateResumeFields(resumeContent);
        showStatus(fileUploadStatusDiv, '', false, true);
        showStatus(detailsUpdateStatusDiv, '', false, true);

    } catch (error) {
        console.error('Error fetching profile data:', error);
        showStatus(fileUploadStatusDiv, 'Error loading profile/resume data.', true);
    }
}

function populateResumeFields(resumeContent) {
    const pInfo = resumeContent.personal_info || {};
    profileNameInput.value = pInfo.name || currentUser.displayName || '';
    profileEmailInput.value = pInfo.email || currentUser.email || '';
    profilePhoneInput.value = pInfo.phone || '';
    profileLinkedinInput.value = pInfo.linkedin || '';
    profileGithubInput.value = pInfo.github || '';
    
    profileSummaryTextarea.value = resumeContent.summary || '';

    let allSkills = [];
    if (resumeContent.skills) {
        for (const category in resumeContent.skills) {
            allSkills = allSkills.concat(resumeContent.skills[category]);
        }
    }
    profileSkillsTextarea.value = allSkills.join(', ');

    let projectStrings = [];
    if (resumeContent.projects) {
        resumeContent.projects.forEach(proj => {
            const title = proj.title || 'Untitled Project';
            const description = (proj.description && Array.isArray(proj.description) ? proj.description.join(' ') : proj.description || '');
            projectStrings.push(`${title} - ${description}`);
        });
    }
    profileProjectsTextarea.value = projectStrings.join('\n');
}

function toggleEditMode(isEditing) {
    const editableFields = [
        profileNameInput, profileEmailInput, profilePhoneInput,
        profileLinkedinInput, profileGithubInput, profileSummaryTextarea,
        profileSkillsTextarea, profileProjectsTextarea
    ];

    editableFields.forEach(field => {
        field.disabled = !isEditing;
    });

    editResumeDetailsButton.style.display = isEditing ? 'none' : 'inline-block';
    saveResumeDetailsButton.style.display = isEditing ? 'inline-block' : 'none';
    cancelEditDetailsButton.style.display = isEditing ? 'inline-block' : 'none';
    
    resumeFileInput.disabled = isEditing;
    uploadResumeFileButton.disabled = isEditing;

    showStatus(detailsUpdateStatusDiv, '', false, true);
}

async function handleSaveResumeDetails(e) {
    e.preventDefault();
    if (!currentUser) {
        showStatus(detailsUpdateStatusDiv, 'User not authenticated. Please log in.', true);
        return;
    }

    const updatedResumeData = {
        personal_info: {
            name: profileNameInput.value.trim(),
            email: profileEmailInput.value.trim(),
            phone: profilePhoneInput.value.trim(),
            linkedin: profileLinkedinInput.value.trim(),
            github: profileGithubInput.value.trim(),
        },
        summary: profileSummaryTextarea.value.trim(),
        skills: {},
        projects: [],
    };

    const rawSkills = profileSkillsTextarea.value.split(',').map(s => s.trim()).filter(s => s !== '');
    if (rawSkills.length > 0) {
        updatedResumeData.skills['Miscellaneous'] = rawSkills;
    }

    const rawProjects = profileProjectsTextarea.value.split('\n').map(s => s.trim()).filter(s => s !== '');
    rawProjects.forEach(projStr => {
        const parts = projStr.split(' - ', 2);
        const title = parts[0] || 'Untitled Project';
        const description = parts.length > 1 ? parts[1].trim() : '';
        updatedResumeData.projects.push({
            title: title,
            description: description ? [description] : []
        });
    });

    showStatus(detailsUpdateStatusDiv, 'Saving changes...', false);
    saveResumeDetailsButton.disabled = true;

    try {
        const idToken = await currentUser.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/user/profile/resume-details`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                parsed_data: updatedResumeData,
                file_name: originalResumeData.resume_metadata?.file_name || 'EditedResume.txt'
            })
        });

        const result = await response.json();
        if (response.ok) {
            showStatus(detailsUpdateStatusDiv, 'Resume details updated successfully!', false);
            originalResumeData = JSON.parse(JSON.stringify(updatedResumeData));
            toggleEditMode(false);
            fetchAndDisplayResume();
        } else {
            showStatus(detailsUpdateStatusDiv, `Error: ${result.detail || result.message || 'Could not update resume details.'}`, true);
            console.error('Structured update failed:', result);
        }
    } catch (error) {
        showStatus(detailsUpdateStatusDiv, 'Network error during resume details update.', true);
        console.error('Error saving resume details:', error);
    } finally {
        saveResumeDetailsButton.disabled = false;
    }
}

async function handleResumeFileUpload(e) {
    e.preventDefault();
    const file = resumeFileInput.files[0];
    if (!file) {
        showStatus(fileUploadStatusDiv, 'Please select a file to upload.', true);
        return;
    }
    if (!currentUser) {
        showStatus(fileUploadStatusDiv, 'User not authenticated. Please log in.', true);
        return;
    }

    showStatus(fileUploadStatusDiv, 'Uploading and processing resume...', false);
    uploadResumeFileButton.disabled = true;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const idToken = await currentUser.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/resume/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`
            },
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            showStatus(fileUploadStatusDiv, `Resume "${file.name}" processed successfully! Your profile will update.`, false);
            resumeFileInput.value = '';
            await fetchAndDisplayResume();
        } else {
            showStatus(fileUploadUploadStatusDiv, `Error uploading: ${data.detail || data.message || 'Unknown error'}`, true);
            console.error('Resume file upload failed:', data);
        }
    } catch (error) {
        showStatus(fileUploadStatusDiv, 'Network error during resume file upload.', true);
        console.error('Error during file upload:', error);
    } finally {
        uploadResumeFileButton.disabled = false;
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

async function handleLogout() {
    try {
        await firebase.auth().signOut();
    } catch (error) {
        console.error("Error signing out:", error);
        alert("Failed to log out. Please try again.");
    }
}
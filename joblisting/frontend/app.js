// function updateFileName() {
//     const fileInput = document.getElementById("resumeUpload");
//     const fileNameSpan = document.getElementById("fileName");
//     if (fileInput.files.length > 0) {
//         fileNameSpan.textContent = fileInput.files[0].name;
//     } else {
//         fileNameSpan.textContent = "No file selected";
//     }
// }

// async function uploadResume() {
//     const fileInput = document.getElementById("resumeUpload");
//     if (!fileInput.files.length) {
//         alert("Please upload a resume first!");
//         return;
//     }

//     const formData = new FormData();
//     formData.append("file", fileInput.files[0]);

//     // UI update for loading state
//     const button = document.querySelector('button');
//     const jobsContainer = document.getElementById("jobs");
//     const resultsContainer = document.getElementById("results-container");
//     button.textContent = 'Analyzing...';
//     button.disabled = true;
//     jobsContainer.innerHTML = '<p>Searching for the best jobs based on your skills...</p>';
//     resultsContainer.style.display = 'block';


//     try {
//         const response = await fetch("http://127.0.0.1:8000/upload_resume/", {
//             method: "POST",
//             body: formData
//         });

//         if (!response.ok) {
//             throw new Error(`HTTP error! Status: ${response.status}`);
//         }

//         const data = await response.json();

//         // Display Skills
//         document.getElementById("skills").innerHTML = data.skills.map(s => `<li>${s}</li>`).join("");

//         // Display Jobs
//         let jobHTML = "";
//         if (data.jobs.length > 0) {
//             data.jobs.forEach(job => {
//                 jobHTML += `
//                   <div class="job-card">
//                     <h3>${job.title}</h3>
//                     <p><b>Company:</b> ${job.company}</p>
//                     <p><b>Location:</b> ${job.location}</p>
//                     <p><b>Relevance Score:</b> <span class="rating">${job.rating}/10</span></p>
//                     <p class="reason">"${job.reason}"</p>
//                     <a href="${job.url}" target="_blank">Apply Here</a>
//                   </div>
//                 `;
//             });
//         } else {
//             jobHTML = "<p>No suitable jobs found. Try updating your resume with more skills!</p>";
//         }
//         jobsContainer.innerHTML = jobHTML;

//     } catch (error) {
//         console.error("Error fetching job data:", error);
//         jobsContainer.innerHTML = `<p style="color: #ff6b6b;">An error occurred while fetching jobs. Please try again.</p>`;
//     } finally {
//         // Restore button state
//         button.textContent = 'Find My Jobs';
//         button.disabled = false;
//     }
// }



function updateFileName() {
    const fileInput = document.getElementById("resumeUpload");
    const fileNameSpan = document.getElementById("fileName");
    if (fileInput.files.length > 0) {
        fileNameSpan.textContent = fileInput.files[0].name;
    } else {
        fileNameSpan.textContent = "No file selected";
    }
}

async function uploadResume() {
    const fileInput = document.getElementById("resumeUpload");
    if (!fileInput.files.length) {
        alert("Please upload a resume first!");
        return;
    }

    // --- NEW: Get the location value from the new input field ---
    const locationInput = document.getElementById("locationInput");
    const location = locationInput.value.trim(); // .trim() removes leading/trailing whitespace

    if (!location) {
        alert("Please enter a location!");
        return;
    }
    // --- END NEW ---

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);

    // UI update for loading state
    const button = document.querySelector('button');
    const jobsContainer = document.getElementById("jobs");
    const resultsContainer = document.getElementById("results-container");
    button.textContent = 'Analyzing...';
    button.disabled = true;
    jobsContainer.innerHTML = `<p>Searching for the best jobs in ${location} based on your skills...</p>`;
    resultsContainer.style.display = 'block';

    try {
        // --- MODIFIED: Construct the URL with the location query parameter ---
        const apiUrl = `http://127.0.0.1:8000/upload_resume/?location=${encodeURIComponent(location)}`;
        
        const response = await fetch(apiUrl, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();

        // Display Skills
        document.getElementById("skills").innerHTML = data.skills.map(s => `<li>${s}</li>`).join("");

        // Display Jobs
        let jobHTML = "";
        if (data.jobs.length > 0) {
            data.jobs.forEach(job => {
                jobHTML += `
                  <div class="job-card">
                    <h3>${job.title}</h3>
                    <p><b>Company:</b> ${job.company}</p>
                    <p><b>Location:</b> ${job.location}</p>
                    <p><b>Relevance Score:</b> <span class="rating">${job.rating}/10</span></p>
                    <p class="reason">"${job.reason}"</p>
                    <a href="${job.url}" target="_blank">Apply Here</a>
                  </div>
                `;
            });
        } else {
            jobHTML = "<p>No suitable jobs found. Try updating your resume with more skills!</p>";
        }
        jobsContainer.innerHTML = jobHTML;

    } catch (error) {
        console.error("Error fetching job data:", error);
        jobsContainer.innerHTML = `<p style="color: #ff6b6b;">An error occurred while fetching jobs. Please try again.</p>`;
    } finally {
        // Restore button state
        button.textContent = 'Find My Jobs';
        button.disabled = false;
    }
}
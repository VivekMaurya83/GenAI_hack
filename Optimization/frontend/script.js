document.addEventListener("DOMContentLoaded", () => {
  const API_BASE_URL = "";

  const fileInput = document.getElementById("resume_file");
  const uploadForm = document.getElementById("upload-form");
  const resumeOptimizeForm = document.getElementById("optimize-form-resume");
  const linkedinOptimizeForm = document.getElementById(
    "optimize-form-linkedin"
  );

  const loadingDiv = document.getElementById("loading");
  const uploadSection = document.getElementById("upload-section");
  const choiceSection = document.getElementById("choice-section");
  const resumeOptimizerSection = document.getElementById(
    "resume-optimizer-section"
  );
  const linkedinOptimizerSection = document.getElementById(
    "linkedin-optimizer-section"
  );

  const showResumeBtn = document.getElementById("show-resume-optimizer");
  const showLinkedinBtn = document.getElementById("show-linkedin-optimizer");
  const linkedinContentDiv = document.getElementById("linkedin-content");
  const errorMessageDiv = document.getElementById("error-message");
  const startOverLink = document.getElementById("start-over-link");
  const backLinks = document.querySelectorAll(".back-link");

  let currentResumeId = null;

  function resetUI() {
    choiceSection.classList.add("hidden");
    resumeOptimizerSection.classList.add("hidden");
    linkedinOptimizerSection.classList.add("hidden");
    uploadSection.classList.remove("hidden");
    linkedinContentDiv.innerHTML = "";
    hideError();
    currentResumeId = null;
    fileInput.value = "";
  }
  startOverLink.addEventListener("click", (e) => {
    e.preventDefault();
    resetUI();
  });

  uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = fileInput.files[0];
    if (!file) {
      showError("Please select a file.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    showLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw await response.json();
      }
      const data = await response.json();
      currentResumeId = data.resume_id;
      uploadSection.classList.add("hidden");
      choiceSection.classList.remove("hidden");
    } catch (error) {
      showError(error.detail || "Upload and analysis failed.");
    } finally {
      showLoading(false);
    }
  });

  showResumeBtn.addEventListener("click", () => {
    choiceSection.classList.add("hidden");
    resumeOptimizerSection.classList.remove("hidden");
  });
  showLinkedinBtn.addEventListener("click", () => {
    choiceSection.classList.add("hidden");
    linkedinOptimizerSection.classList.remove("hidden");
  });

  backLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      resumeOptimizerSection.classList.add("hidden");
      linkedinOptimizerSection.classList.add("hidden");
      choiceSection.classList.remove("hidden");
      hideError();
    });
  });

  resumeOptimizeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentResumeId) {
      showError("Resume ID is missing.");
      return;
    }
    const userRequest = document.getElementById("resume_user_request").value;
    const button = resumeOptimizeForm.querySelector("button");
    const requestBody = {
      resume_id: currentResumeId,
      user_request: userRequest,
    };
    setButtonLoading(button, true, "Optimizing...");
    try {
      const response = await fetch(`${API_BASE_URL}/api/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        throw await response.json();
      }
      const data = await response.json();
      window.location.href = `${API_BASE_URL}${data.download_url}`;
    } catch (error) {
      showError(error.detail || "Resume optimization failed.");
    } finally {
      setButtonLoading(button, false, "Optimize & Download DOCX");
    }
  });

  linkedinOptimizeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentResumeId) {
      showError("Resume ID is missing.");
      return;
    }
    const userRequest = document.getElementById("linkedin_user_request").value;
    const button = linkedinOptimizeForm.querySelector("button");
    const requestBody = {
      resume_id: currentResumeId,
      user_request: userRequest,
    };
    setButtonLoading(button, true, "Generating...");
    linkedinContentDiv.innerHTML = '<div class="spinner"></div>';
    try {
      const response = await fetch(`${API_BASE_URL}/api/linkedin-optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        throw await response.json();
      }
      const data = await response.json();
      displayLinkedInContent(data);
    } catch (error) {
      showError(error.detail || "LinkedIn content generation failed.");
    } finally {
      setButtonLoading(button, false, "Generate LinkedIn Content");
    }
  });

  function displayLinkedInContent(data) {
    let html = "";
    if (data.headlines) {
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
    if (data.optimized_experiences) {
      html += "<h3>Experience Suggestions</h3>";
      data.optimized_experiences.forEach((exp) => {
        html += `<h4>${exp.title}</h4><p>${exp.description}</p>`;
      });
    }
    if (data.optimized_projects) {
      html += "<h3>Project Suggestions</h3>";
      data.optimized_projects.forEach((proj) => {
        html += `<h4>${proj.title}</h4><p>${proj.description}</p>`;
      });
    }
    linkedinContentDiv.innerHTML = html;
  }
  function showLoading(isLoading) {
    loadingDiv.classList.toggle("hidden", !isLoading);
    uploadSection.classList.toggle("hidden", isLoading);
    hideError();
  }
  function setButtonLoading(button, isLoading, loadingText) {
    button.disabled = isLoading;
    button.textContent = isLoading
      ? loadingText
      : button.form.id === "optimize-form-resume"
      ? "Optimize & Download DOCX"
      : "Generate LinkedIn Content";
  }
  function showError(message) {
    errorMessageDiv.textContent = `Error: ${message}`;
    errorMessageDiv.classList.remove("hidden");
  }
  function hideError() {
    errorMessageDiv.classList.add("hidden");
  }
});

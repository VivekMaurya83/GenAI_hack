// This function will be called by our auth.js guard when the user is confirmed to be logged in.
function onUserLoggedIn(user) {
    const welcomeMessage = document.getElementById('welcome-message');
    const logoutBtnHeader = document.getElementById('logout-btn'); // Original header logout button
    const logoutBtnSidebar = document.getElementById('logout-btn-sidebar'); // NEW: Sidebar logout button

    // Display a personalized welcome message
    if (user.displayName) {
        welcomeMessage.textContent = `Welcome, ${user.displayName}!`;
    } else {
        welcomeMessage.textContent = 'Welcome!';
    }

    // --- Handle Logout ---
    const handleLogout = () => {
        auth.signOut().then(() => {
            console.log('User signed out successfully.');
            // The onAuthStateChanged listener in auth.js will automatically handle the redirect
        }).catch(error => {
            console.error('Sign out error', error);
        });
    };

    // Attach logout listener to header button (if visible)
    if (logoutBtnHeader) {
        logoutBtnHeader.addEventListener('click', handleLogout);
    }
    // Attach logout listener to sidebar button (if it exists)
    if (logoutBtnSidebar) {
        logoutBtnSidebar.addEventListener('click', handleLogout);
    }
}

// --- Navigation for Feature Cards ---
document.getElementById('roadmap-card').addEventListener('click', () => {
    window.location.href = '/roadmap.html';
});

document.getElementById('optimizer-card').addEventListener('click', () => {
    window.location.href = '/optimizer.html';
});

// NEW: Event listeners for new feature cards
document.getElementById('assessment-card').addEventListener('click', () => {
    window.location.href = '/assessment.html'; // Assuming you'll create this page
});

document.getElementById('jobs-card').addEventListener('click', () => {
    window.location.href = '/jobs.html'; // Assuming you'll create this page
});
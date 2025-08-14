const CLIENT_ID = '683774476384-iv9jqtjdtbl211o0rj4o2rlpms6v83t7.apps.googleusercontent.com'; // Replace with your Google Cloud OAuth Client ID

// Load the API client and auth2 library
function handleClientLoad() {
    gapi.load('client:auth2', initClient);
}

// Initialize the gapi.client and set up sign-in state listeners
function initClient() {
    gapi.client.init({
        apiKey: 'YOUR_API_KEY_HERE', // Optional: Replace with your API key if needed
        clientId: CLIENT_ID,
        discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"],
        scope: "https://www.googleapis.com/auth/calendar.events"
    }).then(() => {
        // Listen for sign-in state changes
        gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);
        // Handle the initial sign-in state
        updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
    });
}

// Update the UI based on the sign-in status
function updateSigninStatus(isSignedIn) {
    const signInBtn = document.getElementById('sign-in-button');
    const signOutBtn = document.getElementById('sign-out-button');
    if (signInBtn && signOutBtn) {
        if (isSignedIn) {
            signInBtn.style.display = 'none';
            signOutBtn.style.display = 'block';
        } else {
            signInBtn.style.display = 'block';
            signOutBtn.style.display = 'none';
        }
    }
}

// Sign in the user upon button click
function handleSignInClick() {
    gapi.auth2.getAuthInstance().signIn();
}

// Sign out the user upon button click
function handleSignOutClick() {
    gapi.auth2.getAuthInstance().signOut();
}

// Function to open the modal for event details
function openModal() {
    document.getElementById('eventModal').style.display = 'block';
}

// Function to close the modal
function closeModal() {
    document.getElementById('eventModal').style.display = 'none';
}

// Function to create an event in the user's Google Calendar
function createEvent() {
    const title = document.getElementById('eventTitle').value;
    const urgency = document.getElementById('urgency').value;
    const startTimeInput = document.getElementById('eventDate');
    if (!startTimeInput) {
        alert('Please add a datetime-local input with id="eventDate" to your form.');
        return;
    }
    const startTime = startTimeInput.value;
    if (!startTime) {
        alert('Please select a date and time.');
        return;
    }
    const startISO = new Date(startTime).toISOString();
    const endISO = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString(); // 1 hour later

    const event = {
        'summary': `${title} ${urgency}`,
        'start': {
            'dateTime': startISO,
            'timeZone': 'America/Los_Angeles' // Adjust as necessary
        },
        'end': {
            'dateTime': endISO,
            'timeZone': 'America/Los_Angeles' // Adjust as necessary
        },
        'description': ''
    };

    gapi.client.calendar.events.insert({
        'calendarId': 'primary',
        'resource': event
    }).then((response) => {
        console.log('Event created: ' + response.htmlLink);
        closeModal();
    });
}

// Load the API client and auth2 library when the window loads
window.onload = function() {
    handleClientLoad();

    // Open modal when button is clicked
    document.getElementById('addEventButton').onclick = openModal;

    // Close modal when close button is clicked
    document.querySelector('.close-button').onclick = closeModal;

    // Optional: Close modal when clicking outside modal content
    window.onclick = function(event) {
        const modal = document.getElementById('eventModal');
        if (event.target === modal) {
            closeModal();
        }
    };

    // Populate urgency dropdown
    const urgencyDropdown = document.getElementById('urgency');
    urgencyDropdown.innerHTML = `
        <option value="URGENT">(URGENT)</option>
        <option value="Normal">(Normal)</option>
        <option value="non-urgent">(non-urgent)</option>
    `;

    // Handle event form submission
    document.getElementById('eventForm').onsubmit = function(e) {
        e.preventDefault();
        createEvent();
    };
};
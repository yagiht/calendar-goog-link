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
    if (isSignedIn) {
        document.getElementById('sign-in-button').style.display = 'none';
        document.getElementById('sign-out-button').style.display = 'block';
    } else {
        document.getElementById('sign-in-button').style.display = 'block';
        document.getElementById('sign-out-button').style.display = 'none';
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
    document.getElementById('event-modal').style.display = 'block';
}

// Function to close the modal
function closeModal() {
    document.getElementById('event-modal').style.display = 'none';
}

// Function to create an event in the user's Google Calendar
function createEvent() {
    const title = document.getElementById('event-title').value;
    const urgency = document.getElementById('urgency-dropdown').value;
    const startTime = document.getElementById('event-start-time').value;
    const endTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString(); // 1 hour later

    const event = {
        'summary': `${title} (${urgency})`,
        'start': {
            'dateTime': startTime,
            'timeZone': 'America/Los_Angeles' // Adjust as necessary
        },
        'end': {
            'dateTime': endTime,
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
};
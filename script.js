// ---- Configuration ---------------------------------------------------
// Create an OAuth 2.0 Client ID in Google Cloud Console (Web application)
// and put it here. See README.md for the full setup walkthrough.
const CLIENT_ID = '683774476384-iv9jqtjdtbl211o0rj4o2rlpms6v83t7.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events';

// gapi.client is used only to call the Calendar API. Auth itself is handled
// by Google Identity Services (tokenClient below) — gapi.auth2 is deprecated
// and no longer reliably initializes for OAuth client IDs, which is why the
// old sign-in flow silently failed.
let gapiInited = false;
let gisInited = false;
let tokenClient;

function gapiLoaded() {
    gapi.load('client', initGapiClient);
}

async function initGapiClient() {
    await gapi.client.init({
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
    });
    gapiInited = true;
    maybeEnableButtons();
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // set dynamically before each requestAccessToken() call
    });
    gisInited = true;
    maybeEnableButtons();
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        document.getElementById('sign-in-button').style.display = 'inline-block';
    }
}

// ---- Sign in / sign out ------------------------------------------------
function handleSignInClick() {
    tokenClient.callback = (resp) => {
        if (resp.error) {
            console.error(resp);
            alert('Sign-in failed: ' + resp.error);
            return;
        }
        updateSigninStatus(true);
    };
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

function handleSignOutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {});
        gapi.client.setToken('');
    }
    updateSigninStatus(false);
}

function updateSigninStatus(isSignedIn) {
    document.getElementById('sign-in-button').style.display = isSignedIn ? 'none' : 'inline-block';
    document.getElementById('sign-out-button').style.display = isSignedIn ? 'inline-block' : 'none';
    document.getElementById('addEventButton').disabled = !isSignedIn;
}

// ---- Modal --------------------------------------------------------------
function openModal() {
    document.getElementById('eventModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('eventModal').style.display = 'none';
}

// ---- Create event ---------------------------------------------------
function createEvent() {
    const title = document.getElementById('eventTitle').value;
    const urgency = document.getElementById('urgency').value;
    const startTime = document.getElementById('eventDate').value;

    if (!startTime) {
        alert('Please select a date and time.');
        return;
    }

    const startISO = new Date(startTime).toISOString();
    const endISO = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString(); // 1 hour later

    const event = {
        summary: `${title} (${urgency})`,
        start: {
            dateTime: startISO,
            timeZone: 'America/Los_Angeles',
        },
        end: {
            dateTime: endISO,
            timeZone: 'America/Los_Angeles',
        },
        description: '',
    };

    gapi.client.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
    }).then((response) => {
        console.log('Event created: ' + response.result.htmlLink);
        closeModal();
        document.getElementById('eventForm').reset();
    }).catch((err) => {
        console.error('Failed to create event', err);
        alert('Failed to create event. Check the console for details.');
    });
}

// ---- Wire everything up on load --------------------------------------
window.onload = function () {
    gapiLoaded();
    gisLoaded();

    document.getElementById('sign-in-button').onclick = handleSignInClick;
    document.getElementById('sign-out-button').onclick = handleSignOutClick;
    document.getElementById('addEventButton').onclick = openModal;
    document.querySelector('.close-button').onclick = closeModal;

    window.onclick = function (event) {
        const modal = document.getElementById('eventModal');
        if (event.target === modal) {
            closeModal();
        }
    };

    document.getElementById('eventForm').onsubmit = function (e) {
        e.preventDefault();
        createEvent();
    };
};

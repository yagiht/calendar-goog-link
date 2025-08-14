# calendar-goog-link

## Project Overview
This project is a static HTML/CSS/JavaScript website designed for GitHub Pages that integrates directly with Google Calendar using the Google Calendar API and OAuth 2.0 authentication.

## File Structure
```
calendar-goog-link
├── index.html
├── style.css
├── script.js
└── README.md
```

## Setup Instructions

### Enabling Google Calendar API
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing project.
3. Navigate to the "Library" section in the left sidebar.
4. Search for "Google Calendar API" and enable it for your project.
5. Go to the "Credentials" section in the left sidebar.
6. Click on "Create Credentials" and select "OAuth client ID".
7. Configure the consent screen as required.
8. Set the application type to "Web application".
9. Add the following Authorized JavaScript origins:
   - `https://yagiht.github.io`
10. Add the following Authorized redirect URI:
    - `https://yagiht.github.io/calendar-goog-link/`
11. After creating the credentials, note down the `CLIENT_ID`.

### Adding CLIENT_ID in script.js
1. Open `script.js`.
2. At the top of the file, define the `CLIENT_ID` variable:
   ```javascript
   const CLIENT_ID = 'YOUR_CLIENT_ID_HERE'; // Replace with your actual CLIENT_ID
   ```

### Deployment on GitHub Pages
1. Push your code to a GitHub repository named `calendar-goog-link`.
2. Go to the repository settings.
3. Scroll down to the "GitHub Pages" section.
4. Select the branch you want to deploy (usually `main` or `master`).
5. Click "Save".
6. Your site will be published at `https://yagiht.github.io/calendar-goog-link/`.

## Functionality
- Users can sign in with their Google account to access their Google Calendar.
- A modal allows users to input event details, including title and urgency.
- Events can be created in the user's primary Google Calendar after successful sign-in.

## Acknowledgments
This project utilizes the Google Calendar API and the gapi JavaScript client library for OAuth 2.0 authentication.
# ECHO Calendar
**DISLAIMER: Google restricts apps that edit calendars to approved test users until the app passes its verification process. To try the live site, message me your Google email and I'll add you :) 
There's also a GIF demo! **

Type our your plans, and ECHO puts them straight into your Google Calendar. It's a static website with no backend, so your calendar access never touches a server I run.

**Live site:** https://yagiht.github.io/echo-calendar/

<!-- Add a screenshot or short GIF here, e.g. ![demo](docs/demo.gif) -->
<img width="800" height="428" alt="ScreenRecording2026-09-30at7 21 54PM-ezgif com-video-to-gif-converter" src="https://github.com/user-attachments/assets/2423540d-e538-451a-8b2a-bcc4613c2d5c" />


## What it does

- **Free text in, calendar events out.** Write something like "dentist tomorrow at 3pm" and ECHO finds the date and time and creates the event.
- **Recurring events.** Repeating plans are converted into standard Google Calendar recurrence rules (frequency, interval, and days of the week).
- **Writes directly to your Google Calendar** after you sign in with Google.
- **Command-room theme.** The interface is styled like a Star Wars(specically Clone Wars)-inspired command room.
- **Voice feature.** Uses browsers Web Speech API, so users can speak into the textbox as well.

## How it works

| Piece | What it does |
|---|---|
| `index.html`, `style.css` | The page and its styling |
| `script.js` | Sign-in, text parsing, recurrence rules, and calendar calls |

- **Parsing:** dates and times are extracted from your text in the browser with [chrono-node](https://github.com/wanasit/chrono), with a forward-date bias so "Friday" means the next Friday.
- **Recurrence:** parsed repeat patterns are turned into [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545) `RRULE` strings (`FREQ`, `INTERVAL`, `BYDAY`), which is the format Google Calendar expects.
- **Sign-in:** [Google Identity Services](https://developers.google.com/identity/gsi/web) (OAuth 2.0 token flow). The only permission requested is `calendar.events`, which lets the app create and edit events.
- **No server:** everything runs client-side and is hosted on GitHub Pages, so no backend ever holds your credentials or your text.

## Run it yourself

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Calendar API**.
2. Create an **OAuth client ID** of type "Web application" and add your site's origin under **Authorized JavaScript origins** (for example `https://yourname.github.io`, plus `http://localhost:8000` for local testing). No redirect URI is needed.
3. Put your client ID in the `CLIENT_ID` constant near the top of `script.js`.
4. Serve the folder over http (OAuth doesn't work from `file://`):

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`. To deploy, push to GitHub and turn on Pages under **Settings, then Pages**.

## Troubleshooting

- **Sign-in popup closes or errors:** the Authorized JavaScript origin must match the page's origin exactly (protocol and domain, no path). If the OAuth consent screen is in "Testing" mode, your Google account must be listed as a test user.
- **403 from the Calendar API:** the Google Calendar API isn't enabled on the project tied to your client ID.

## Status and ideas

**Working:** sign-in, free-text date and time parsing, recurring events, writing to Google Calendar.

**Ideas:** editing or deleting events from the page, handling more kinds of phrasing, and showing a preview of the parsed event before it is created.

## Built with

JavaScript, Google Calendar API, Google Identity Services (OAuth 2.0), chrono-node, GitHub Pages.

<!-- Optional: one honest line, e.g. "Built with AI assistance (Claude Code); I designed the features and tested them." -->

// chrono-node stopped publishing a plain <script>-friendly global bundle;
// it's CJS/ESM only now, so we pull it in as an ES module (this file is
// loaded with type="module" in index.html, which is what allows this import).
import * as chrono from 'https://esm.sh/chrono-node@2';

// ---- Configuration ---------------------------------------------------
const CLIENT_ID = '683774476384-iv9jqtjdtbl211o0rj4o2rlpms6v83t7.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events';
const TIMEZONE = 'America/Los_Angeles';

let gapiInited = false;
let gisInited = false;
let tokenClient;
let drafts = []; // { id, title, start: Date, end: Date, rrule: string|null, needsReview: bool }

// ---- Auth (Google Identity Services + gapi.client) ----------------------
function gapiLoaded() {
    gapi.load('client', initGapiClient);
}

async function initGapiClient() {
    await gapi.client.init({
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
    });
    gapiInited = true;
    maybeReady();
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '',
    });
    gisInited = true;
    maybeReady();
}

function maybeReady() {
    if (gapiInited && gisInited) {
        document.getElementById('authLoading').style.display = 'none';
        document.getElementById('sign-in-button').style.display = 'inline-block';
    }
}

function handleSignInClick() {
    tokenClient.callback = (resp) => {
        if (resp.error) {
            console.error(resp);
            showToast('Sign-in failed: ' + resp.error, true);
            return;
        }
        setSignedIn(true);
    };
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

function handleSignOutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {});
        gapi.client.setToken('');
    }
    setSignedIn(false);
}

function setSignedIn(isSignedIn) {
    document.getElementById('authGate').hidden = isSignedIn;
    document.getElementById('plannerView').hidden = !isSignedIn;
}

// ---- Recurrence parsing ---------------------------------------------
const DAY_CODES = {
    sun: 'SU', sunday: 'SU',
    mon: 'MO', monday: 'MO',
    tue: 'TU', tues: 'TU', tuesday: 'TU',
    wed: 'WE', weds: 'WE', wednesday: 'WE',
    thu: 'TH', thur: 'TH', thurs: 'TH', thursday: 'TH',
    fri: 'FR', friday: 'FR',
    sat: 'SA', saturday: 'SA',
};

const DAY_NAME_RE = /\b(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|weds|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)\b/gi;

function extractRecurrence(text) {
    let cleaned = text;
    let recurrence = null;
    let until = null;

    const untilMatch = cleaned.match(/\buntil\s+([a-zA-Z0-9,\/\-\s]+?)(?=$|[,;.])/i);
    if (untilMatch) {
        const parsed = chrono.parseDate(untilMatch[1]);
        if (parsed) {
            until = parsed;
            cleaned = cleaned.replace(untilMatch[0], ' ');
        }
    }

    const hasTriggerWord = /\b(every|recurring)\b/i.test(cleaned);
    const dayMatches = [...cleaned.matchAll(DAY_NAME_RE)];
    const dayCodes = [...new Set(dayMatches.map((m) => DAY_CODES[m[0].toLowerCase()]))];

    if (/\b(every day|daily)\b/i.test(cleaned)) {
        recurrence = { freq: 'DAILY' };
        cleaned = cleaned.replace(/\b(every day|daily)\b/i, ' ');
    } else if (dayCodes.length >= 2 || (dayCodes.length >= 1 && hasTriggerWord)) {
        // Two-or-more distinct weekdays mentioned together ("Mon, Wed, Fri", "every
        // Tuesday") reads as a recurring schedule even without the word "every" —
        // that's just how people write a class/meeting schedule.
        recurrence = { freq: 'WEEKLY', byday: dayCodes };
        cleaned = cleaned
            .replace(DAY_NAME_RE, ' ')
            .replace(/\bevery\b/i, ' ')
            .replace(/\bon\b/gi, ' ')
            .replace(/,\s*and\b/gi, ' ')
            .replace(/\band\b/gi, ' ')
            .replace(/\//g, ' ')
            .replace(/[,\s]{2,}/g, ' ');
    } else if (/\bbiweekly\b/i.test(cleaned)) {
        recurrence = { freq: 'WEEKLY', interval: 2 };
        cleaned = cleaned.replace(/\bbiweekly\b/i, ' ');
    } else if (/\bweekly\b/i.test(cleaned)) {
        recurrence = { freq: 'WEEKLY' };
        cleaned = cleaned.replace(/\bweekly\b/i, ' ');
    } else if (/\brecurring\b/i.test(cleaned)) {
        recurrence = { freq: 'WEEKLY' };
        cleaned = cleaned.replace(/\brecurring\b/i, ' ');
    }

    if (recurrence && until) recurrence.until = until;
    return { recurrence, cleaned };
}

function toRRule(rec) {
    if (!rec) return null;
    const parts = [`FREQ=${rec.freq}`];
    if (rec.interval) parts.push(`INTERVAL=${rec.interval}`);
    if (rec.byday && rec.byday.length) parts.push(`BYDAY=${rec.byday.join(',')}`);
    if (rec.until) {
        const u = rec.until;
        const y = u.getFullYear();
        const m = String(u.getMonth() + 1).padStart(2, '0');
        const d = String(u.getDate()).padStart(2, '0');
        parts.push(`UNTIL=${y}${m}${d}T235959Z`);
    }
    return `RRULE:${parts.join(';')}`;
}

function recurrenceSummary(rrule) {
    if (!rrule) return 'Does not repeat';
    const freqMatch = rrule.match(/FREQ=(\w+)/);
    const bydayMatch = rrule.match(/BYDAY=([\w,]+)/);
    const untilMatch = rrule.match(/UNTIL=(\d{8})/);
    let summary = freqMatch[1] === 'DAILY' ? 'Daily' : 'Weekly';
    if (bydayMatch) {
        summary += ' on ' + bydayMatch[1].split(',').join(', ');
    }
    if (untilMatch) {
        const s = untilMatch[1];
        summary += ` until ${s.slice(4, 6)}/${s.slice(6, 8)}/${s.slice(0, 4)}`;
    } else {
        summary += ' — no end date';
    }
    return summary;
}

function getUntilFromRRule(rrule) {
    if (!rrule) return null;
    const m = rrule.match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function setUntilOnRRule(rrule, date) {
    if (!rrule) return rrule;
    const base = rrule.replace(/;?UNTIL=\d{8}T\d{6}Z/, '');
    if (!date) return base;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${base};UNTIL=${y}${m}${d}T235959Z`;
}

// ---- Segment parsing ----------------------------------------------------
function splitIntoSegments(text) {
    // Only newlines/semicolons separate distinct events. Commas are left alone
    // because they show up constantly inside a single event's own text ("every
    // Mon, Wed, Fri", "until Dec 5, 2026") and splitting on them there does
    // more harm than good. One event per line is the reliable way to enter
    // multiple events; a comma-separated day list on one line stays intact.
    return text
        .split(/\r?\n|;/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function parseSegment(raw) {
    const { recurrence, cleaned } = extractRecurrence(raw);
    const results = chrono.parse(cleaned, new Date(), { forwardDate: true });

    let start = null;
    let end = null;
    let title = cleaned;
    let needsReview = false;

    if (results.length) {
        const r = results[0];
        start = r.start.date();
        end = r.end ? r.end.date() : null;
        title = cleaned.slice(0, r.index) + cleaned.slice(r.index + r.text.length);

        const hasTime = r.start.isCertain('hour');
        if (!end) {
            if (hasTime) {
                end = new Date(start.getTime() + 60 * 60 * 1000);
            } else {
                start.setHours(23, 59, 0, 0);
                end = new Date(start.getTime() + 30 * 60 * 1000);
            }
        }
    } else {
        needsReview = true;
        start = new Date();
        start.setDate(start.getDate() + 1);
        start.setHours(9, 0, 0, 0);
        end = new Date(start.getTime() + 60 * 60 * 1000);
    }

    title = title.replace(/^[\s,.\-–:]+|[\s,.\-–:]+$/g, '').trim();
    if (!title) title = raw.trim();

    return {
        id: crypto.randomUUID(),
        title,
        start,
        end,
        rrule: toRRule(recurrence),
        repeats: !!recurrence,
        needsReview,
        raw,
    };
}

// ---- Draft rendering -----------------------------------------------
function toLocalInputValue(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toLocalDateInputValue(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function renderDrafts() {
    const list = document.getElementById('draftList');
    const actions = document.getElementById('draftActions');
    list.innerHTML = '';

    if (!drafts.length) {
        actions.hidden = true;
        return;
    }
    actions.hidden = false;

    drafts.forEach((draft) => {
        const card = document.createElement('div');
        card.className = 'draft-card' + (draft.needsReview ? ' needs-review' : '');
        card.dataset.id = draft.id;

        card.innerHTML = `
            <button class="draft-remove" title="Remove">&times;</button>
            <input type="text" class="draft-title" value="${escapeHtml(draft.title)}">
            <div class="draft-row">
                <label>Start
                    <input type="datetime-local" class="draft-start" value="${toLocalInputValue(draft.start)}">
                </label>
                <label>End
                    <input type="datetime-local" class="draft-end" value="${toLocalInputValue(draft.end)}">
                </label>
            </div>
            <div class="draft-meta">
                <label class="draft-recurrence">
                    <input type="checkbox" class="draft-repeat-toggle" ${draft.repeats ? 'checked' : ''}>
                    <span class="draft-repeat-summary">${draft.repeats ? recurrenceSummary(draft.rrule) : 'Does not repeat'}</span>
                </label>
            </div>
            <div class="draft-until-row" ${draft.repeats ? '' : 'hidden'}>
                <label>Ends
                    <input type="date" class="draft-until" value="${getUntilFromRRule(draft.rrule) ? toLocalDateInputValue(getUntilFromRRule(draft.rrule)) : ''}">
                </label>
                <span class="draft-until-hint">Leave blank to repeat with no end date</span>
            </div>
            ${draft.needsReview ? '<div class="draft-review-note">Couldn’t detect a date/time — defaulted to tomorrow 9am. Please check.</div>' : ''}
        `;

        card.querySelector('.draft-remove').onclick = () => {
            drafts = drafts.filter((d) => d.id !== draft.id);
            renderDrafts();
        };
        card.querySelector('.draft-title').oninput = (e) => {
            draft.title = e.target.value;
        };
        card.querySelector('.draft-start').onchange = (e) => {
            draft.start = new Date(e.target.value);
        };
        card.querySelector('.draft-end').onchange = (e) => {
            draft.end = new Date(e.target.value);
        };
        card.querySelector('.draft-repeat-toggle').onchange = (e) => {
            draft.repeats = e.target.checked;
            if (draft.repeats && !draft.rrule) {
                // Turned on manually with nothing detected — default to a plain weekly repeat.
                draft.rrule = 'RRULE:FREQ=WEEKLY';
            }
            card.querySelector('.draft-repeat-summary').textContent = draft.repeats ? recurrenceSummary(draft.rrule) : 'Does not repeat';
            card.querySelector('.draft-until-row').hidden = !draft.repeats;
        };
        card.querySelector('.draft-until').onchange = (e) => {
            const date = e.target.value ? new Date(e.target.value + 'T00:00:00') : null;
            draft.rrule = setUntilOnRRule(draft.rrule, date);
            card.querySelector('.draft-repeat-summary').textContent = recurrenceSummary(draft.rrule);
        };

        list.appendChild(card);
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ---- Calendar insert -----------------------------------------------
async function addAllDrafts() {
    if (!drafts.length) return;
    const button = document.getElementById('addAllButton');
    button.disabled = true;
    button.textContent = 'Adding…';

    let successCount = 0;
    const failures = [];

    for (const draft of drafts) {
        const event = {
            summary: draft.title,
            start: { dateTime: draft.start.toISOString(), timeZone: TIMEZONE },
            end: { dateTime: draft.end.toISOString(), timeZone: TIMEZONE },
        };
        if (draft.rrule) event.recurrence = [draft.rrule];

        try {
            await gapi.client.calendar.events.insert({ calendarId: 'primary', resource: event });
            successCount += 1;
        } catch (err) {
            console.error('Failed to create event', draft, err);
            failures.push(draft.title);
        }
    }

    button.disabled = false;
    button.textContent = 'Add to Calendar';

    if (failures.length === 0) {
        showToast(`Added ${successCount} event${successCount === 1 ? '' : 's'} to your calendar.`);
        drafts = [];
        renderDrafts();
        document.getElementById('chunkInput').value = '';
    } else {
        showToast(`Added ${successCount}, failed: ${failures.join(', ')}`, true);
        drafts = drafts.filter((d) => failures.includes(d.title));
        renderDrafts();
    }
}

// ---- Voice input (Web Speech API) --------------------------------------
// Chrome/Edge ship SpeechRecognition under the webkit-prefixed name; there's
// no vendor-neutral API and Firefox/Safari support is unreliable, so this is
// feature-detected and the button just stays hidden where it's unsupported.
const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let listening = false;
let baseTextBeforeListening = '';

function setupVoiceInput() {
    const micButton = document.getElementById('micButton');
    if (!SpeechRecognitionImpl) return; // stays hidden

    micButton.hidden = false;

    recognizer = new SpeechRecognitionImpl();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = 'en-US';

    recognizer.onresult = (event) => {
        const chunkInput = document.getElementById('chunkInput');
        let finalText = '';
        let interimText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalText += transcript;
            } else {
                interimText += transcript;
            }
        }

        if (finalText) {
            // Commit finalized speech onto the running base, one line per
            // recognized phrase — that matches how the parser expects
            // entries to be separated.
            baseTextBeforeListening = joinLines(baseTextBeforeListening, finalText.trim());
        }

        chunkInput.value = joinLines(baseTextBeforeListening, interimText.trim());
    };

    recognizer.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            showToast('Microphone access was denied.', true);
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
            showToast('Voice input error: ' + event.error, true);
        }
    };

    recognizer.onend = () => {
        // Browsers auto-stop the recognizer after a period of silence even
        // in continuous mode; reflect that in the UI rather than leaving the
        // button stuck in a "listening" state that no longer does anything.
        listening = false;
        micButton.classList.remove('listening');
    };

    micButton.onclick = () => {
        if (listening) {
            recognizer.stop();
            listening = false;
            micButton.classList.remove('listening');
        } else {
            baseTextBeforeListening = document.getElementById('chunkInput').value;
            try {
                recognizer.start();
                listening = true;
                micButton.classList.add('listening');
            } catch (err) {
                console.error('Failed to start recognition', err);
                showToast('Could not start the microphone.', true);
            }
        }
    };
}

function joinLines(base, addition) {
    if (!addition) return base;
    if (!base) return addition;
    return base.replace(/\s*$/, '') + '\n' + addition;
}

// ---- Toast ------------------------------------------------------------
let toastTimer;
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast' + (isError ? ' error' : '');
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.hidden = true;
    }, 4000);
}

// ---- Wire up on load --------------------------------------------------
window.onload = function () {
    gapiLoaded();
    gisLoaded();

    document.getElementById('sign-in-button').onclick = handleSignInClick;
    document.getElementById('sign-out-button').onclick = handleSignOutClick;

    setupVoiceInput();

    document.getElementById('parseButton').onclick = () => {
        const text = document.getElementById('chunkInput').value;
        const segments = splitIntoSegments(text);
        if (!segments.length) {
            showToast('Type something to parse first.', true);
            return;
        }
        drafts = segments.map(parseSegment);
        renderDrafts();
    };

    document.getElementById('clearButton').onclick = () => {
        document.getElementById('chunkInput').value = '';
        drafts = [];
        renderDrafts();
    };

    document.getElementById('addAllButton').onclick = addAllDrafts;
};

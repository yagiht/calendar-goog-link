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

    if (/\b(every day|daily)\b/i.test(cleaned)) {
        recurrence = { freq: 'DAILY' };
        cleaned = cleaned.replace(/\b(every day|daily)\b/i, ' ');
    } else {
        const everyMatch = cleaned.match(/\bevery\s+([a-zA-Z\/,&\s]+)/i);
        if (everyMatch) {
            const rawTokens = everyMatch[1]
                .split(/\s*[\/,&]\s*|\s+and\s+|\s+/i)
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean);
            const codes = [];
            for (const t of rawTokens) {
                const code = DAY_CODES[t];
                if (!code) break; // stop at the first token that isn't a day name (e.g. a time)
                codes.push(code);
            }
            if (codes.length) {
                recurrence = { freq: 'WEEKLY', byday: [...new Set(codes)] };
                cleaned = cleaned.replace(everyMatch[0], ' ');
            }
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
    }
    return summary;
}

// ---- Segment parsing ----------------------------------------------------
function splitIntoSegments(text) {
    return text
        .split(/\r?\n|;|,(?!\s*\d{4}\b)/)
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
        needsReview,
        raw,
    };
}

// ---- Draft rendering -----------------------------------------------
function toLocalInputValue(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
                    <input type="checkbox" class="draft-repeat-toggle" ${draft.rrule ? 'checked' : ''}>
                    <span class="draft-repeat-summary">${recurrenceSummary(draft.rrule)}</span>
                </label>
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
            if (!e.target.checked) draft.rrule = null;
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

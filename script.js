/* ================================================
   SkillSwap — script.js
   Vanilla JS | LocalStorage | No Framework
   ================================================ */
'use strict';

/* ================================================
   APP STATE
   ================================================ */
const State = {
  currentUser:  null,
  users:        [],
  connections:  [],
  searchQuery:  '',
  activeFilter: 'all',
  // ── Phase 2E: Real match results from GET /api/v1/matches ──────────────
  realMatches:     null,
  matchesFetching: false,
  // ── Phase 2F: Real connection state from GET /api/v1/requests ──────────
  realConnections:     null,
  connectionsFetching: false,
  // ── Phase 2G: Full dashboard data from GET /api/v1/dashboard ───────────
  dashboardData:     null,
  dashboardFetching: false,
  // ── Phase 3: Chat / Messaging ──────────────────────────────────────────
  chat: {
    otherUser:        null,     // { id, name, avatar } of the open conversation partner
    messages:         [],       // MessageOut[] loaded for current conversation
    ws:               null,     // active WebSocket instance (or null)
    wsStatus:         'disconnected', // 'connecting'|'connected'|'disconnected'|'error'
    reconnectTimer:   null,     // setTimeout handle for reconnect
    reconnectAttempts: 0,       // count of consecutive reconnect tries
    hasMore:          false,    // whether older messages exist beyond current page
    oldestMsgId:      null,     // cursor for "load earlier" pagination
    isSending:        false,    // prevents double-send
    isOpen:           false,    // true while chat modal is visible
  },
};

/* ================================================
   CONSTANTS
   ================================================ */
const STORAGE_KEYS = {
  CURRENT_USER: 'skillswap_current_user',
  USERS:        'skillswap_users',
  CONNECTIONS:  'skillswap_connections',
  SEEDED:       'skillswap_seeded',
};

const SKILL_CATEGORIES = {
  Technology: ['JavaScript','Python','React','Node.js','CSS','UI/UX Design','Machine Learning',
               'Data Science','Cybersecurity','Cloud Computing','DevOps','Blockchain','iOS Dev',
               'Android Dev','SQL'],
  Design:     ['Graphic Design','Illustration','Logo Design','Motion Graphics','Figma','Photoshop',
               'Video Editing','3D Modeling','UI Design','Brand Identity'],
  Music:      ['Guitar','Piano','Drums','Singing','Music Production','DJ','Violin','Music Theory',
               'Songwriting','Sound Design'],
  Language:   ['English','Spanish','French','German','Mandarin','Japanese','Arabic','Portuguese',
               'Italian','Korean'],
  Business:   ['Marketing','SEO','Copywriting','Public Speaking','Project Management','Finance',
               'Sales','Entrepreneurship','Leadership','Excel'],
};

const AVATARS = ['🧑‍💻','👩‍🎨','🧑‍🎸','👩‍🏫','🧑‍🚀','👩‍💼','🧑‍🔬','👩‍🍳','🧑‍🎤','👩‍🔧','🧑‍🎓','👩‍🌾'];

const MATCH_LABELS = {
  excellent: { label: 'Excellent Match', min: 70, color: '#10b981' },
  good:      { label: 'Good Match',      min: 40, color: '#6366f1' },
  low:       { label: 'Low Match',       min: 0,  color: '#64748b' },
};

const DEMO_USERS = [
  { name:'Sarah Kim',        avatar:'👩‍🎨', bio:'UI/UX designer passionate about accessible interfaces.',
    teachSkills:['UI Design','Figma','Illustration'], learnSkills:['JavaScript','React'],
    location:'San Francisco, US', category:'Design' },
  { name:'Marcus Lee',       avatar:'🧑‍💻', bio:'Full-stack developer who loves open source.',
    teachSkills:['JavaScript','Node.js','Python'],    learnSkills:['UI Design','Guitar'],
    location:'New York, US',       category:'Technology' },
  { name:'Priya Mehta',      avatar:'👩‍🏫', bio:'Data scientist turning numbers into stories.',
    teachSkills:['Python','Machine Learning','Data Science'], learnSkills:['Spanish','Public Speaking'],
    location:'Mumbai, IN',         category:'Technology' },
  { name:'Carlos Rivera',    avatar:'🧑‍🎸', bio:'Musician and music producer with 10 years experience.',
    teachSkills:['Guitar','Music Production','Songwriting'], learnSkills:['JavaScript','SEO'],
    location:'Madrid, ES',         category:'Music' },
  { name:'Aisha Johnson',    avatar:'👩‍💼', bio:'Marketing strategist and brand builder.',
    teachSkills:['Marketing','Copywriting','SEO'],    learnSkills:['Python','Figma'],
    location:'London, UK',         category:'Business' },
  { name:'Lena Müller',      avatar:'👩‍🔧', bio:'DevOps engineer automating everything.',
    teachSkills:['DevOps','Cloud Computing','SQL'],   learnSkills:['UI Design','French'],
    location:'Berlin, DE',         category:'Technology' },
  { name:'Kenji Tanaka',     avatar:'🧑‍🚀', bio:'Entrepreneur and startup mentor.',
    teachSkills:['Entrepreneurship','Leadership','Public Speaking'], learnSkills:['Machine Learning','React'],
    location:'Tokyo, JP',          category:'Business' },
  { name:'Fatima Al-Hassan', avatar:'👩‍🌾', bio:'Language teacher fluent in 4 languages.',
    teachSkills:['Arabic','French','English'],        learnSkills:['Graphic Design','Piano'],
    location:'Dubai, UAE',         category:'Language' },
  { name:'Tyler Brooks',     avatar:'🧑‍🎤', bio:'Vocalist and piano player available for sessions.',
    teachSkills:['Singing','Piano','Music Theory'],   learnSkills:['Marketing','iOS Dev'],
    location:'Toronto, CA',        category:'Music' },
  { name:'Nina Patel',       avatar:'🧑‍🎓', bio:'Graphic designer specialising in brand identity.',
    teachSkills:['Graphic Design','Logo Design','Photoshop'], learnSkills:['JavaScript','SQL'],
    location:'Sydney, AU',         category:'Design' },
];

/* ================================================
   LOCALSTORAGE
   ================================================ */
const Storage = {
  get(key) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; }
    catch { return null; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch { return false; }
  },
  remove(key) { localStorage.removeItem(key); },
};

/* ================================================
   UTILITIES
   ================================================ */
const uid   = () => `ss_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const esc   = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                               .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const wait  = (ms) => new Promise(r => setTimeout(r, ms));
const $     = (sel, ctx = document) => ctx.querySelector(sel);
const $$    = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/* ================================================
   AVATAR RENDERING
   ================================================ */

/**
 * Render an avatar value as safe HTML for insertion into the DOM.
 *
 * The avatar field stores either:
 *   a) A short emoji string, e.g. "🧑‍💻"  (legacy + predefined pickers)
 *   b) A base64 data URL, e.g. "data:image/jpeg;base64,…"  (custom photo)
 *
 * For emoji we return an escaped text node (same as before).
 * For data URLs we return an <img> element with a descriptive alt text and
 * the avatar CSS class so it inherits existing sizing/border-radius styles.
 *
 * Security: we ONLY render an <img> when the value starts with an allowed
 * data URL prefix — we never pass arbitrary strings as src.
 *
 * @param {string|null} avatar  The avatar field value from the user object
 * @param {string} [name='']   The user's name — used as img alt text
 * @returns {string}  Safe HTML string
 */
function renderAvatar(avatar, name = '') {
  if (!avatar) return esc(AVATARS[0]);
  const allowedPrefixes = [
    'data:image/jpeg;base64,',
    'data:image/jpg;base64,',
    'data:image/png;base64,',
    'data:image/webp;base64,',
  ];
  if (allowedPrefixes.some(p => avatar.startsWith(p))) {
    // Custom photo — render as <img>. The alt text is the user's name so
    // screen readers get a meaningful description. The src is the data URL
    // itself, which is safe because we verified the prefix above.
    const altText = name ? `${name}'s profile photo` : 'Profile photo';
    // We build src via a string concat to avoid ever passing avatar through
    // esc() which would double-encode the base64 '/' and '+' characters.
    return `<img src="${avatar}" alt="${esc(altText)}"
      class="avatar-img" loading="lazy"
      style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />`;
  }
  // Emoji / short string — plain text (esc handles &, <, > etc.)
  return esc(avatar);
}

/* ================================================
   API LAYER
   ================================================ */

/** Single source of truth for the backend URL. */
const API_BASE_URL = 'https://skillswap-rvm9.onrender.com';

/** Storage key for the JWT access token — isolated from demo data. */
const AUTH_TOKEN_KEY = 'skillswap_auth_token';

/**
 * Centralised JWT token manager.
 * Never read/write the token key anywhere else in the codebase.
 */
const Auth = {
  getToken()        { return localStorage.getItem(AUTH_TOKEN_KEY) || null; },
  setToken(token)   { localStorage.setItem(AUTH_TOKEN_KEY, token); },
  clearToken()      { localStorage.removeItem(AUTH_TOKEN_KEY); },
  isAuthenticated() { return !!this.getToken(); },
};

/**
 * Reusable fetch wrapper.
 * - Builds the full URL from API_BASE_URL.
 * - Automatically attaches Authorization: Bearer <token> when a token exists.
 * - Sets Content-Type: application/json on request bodies.
 * - Parses JSON responses safely.
 * - Throws a structured error for non-2xx responses.
 *
 * @param {string} endpoint  e.g. '/api/v1/users/me'
 * @param {RequestInit} [options]  standard fetch options
 * @returns {Promise<any>}  parsed JSON response body
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers = { ...(options.headers || {}) };
  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }
  const token = Auth.getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

  // Parse body once regardless of status
  let data = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try { data = await response.json(); } catch { data = null; }
  }

  if (!response.ok) {
    const message = data?.detail || `HTTP ${response.status} — ${response.statusText}`;
    const err = new Error(message);
    err.status = response.status;
    err.data   = data;
    throw err;
  }

  return data;
}

/**
 * Checks whether the FastAPI backend is reachable.
 * Uses the existing GET /health endpoint.
 *
 * @returns {Promise<boolean>}  true if backend responded with status "ok"
 */
async function checkBackendHealth() {
  try {
    const data = await apiRequest('/health');
    if (data?.status === 'ok') {
      console.info('[SkillSwap] ✅ API connected — version', data.version);
      return true;
    }
    console.warn('[SkillSwap] ⚠️ API responded but status unexpected:', data);
    return false;
  } catch (err) {
    console.warn('[SkillSwap] ⚠️ API unavailable — running in demo mode.', err.message);
    return false;
  }
}

/* ================================================
   SKILLS API LAYER
   ================================================ */

/**
 * Infer the backend SkillCategory enum value from a skill name.
 * Falls back to "Other" for anything not in the known lists.
 */
function inferCategory(skillName) {
  const name = skillName.toLowerCase();
  for (const [cat, skills] of Object.entries(SKILL_CATEGORIES)) {
    if (skills.some(s => s.toLowerCase() === name)) return cat;
  }
  return 'Other';
}

/**
 * Load the authenticated user's skills from GET /api/v1/skills.
 * Populates State.currentUser.teachSkills, learnSkills, and _apiSkills.
 * Safe to call at any time — silently does nothing if not authenticated.
 */
async function fetchUserSkills() {
  if (!Auth.isAuthenticated() || !State.currentUser?.isApiUser) return;
  try {
    const skills = await apiRequest('/api/v1/skills');
    applySkillsToState(skills);
  } catch (err) {
    if (err.status === 401) {
      Auth.clearToken();
      State.currentUser = null;
    }
    console.warn('[SkillSwap] Could not load skills:', err.message);
  }
}

/**
 * Apply a SkillOut[] array from the API into State.currentUser.
 * Keeps _apiSkills (full objects with id) and the flat name arrays
 * that the rest of the app uses for matching/display.
 */
function applySkillsToState(apiSkills) {
  if (!State.currentUser) return;
  State.currentUser._apiSkills  = apiSkills;
  State.currentUser.teachSkills = apiSkills
    .filter(s => s.type === 'teach')
    .map(s => s.name);
  State.currentUser.learnSkills = apiSkills
    .filter(s => s.type === 'learn')
    .map(s => s.name);
}

/**
 * POST /api/v1/skills — add a new skill for the authenticated user.
 * @param {string} name
 * @param {'teach'|'learn'} type
 * @returns {Promise<object>}  the created SkillOut object
 */
async function apiAddSkill(name, type) {
  const category = inferCategory(name);
  return apiRequest('/api/v1/skills', {
    method: 'POST',
    body: JSON.stringify({ name: name.trim(), type, category }),
  });
}

/**
 * DELETE /api/v1/skills/{id} — remove a skill for the authenticated user.
 * @param {number} skillId
 */
async function apiDeleteSkill(skillId) {
  await apiRequest(`/api/v1/skills/${skillId}`, { method: 'DELETE' });
}

/* ================================================
   REAL MATCHING API  (Phase 2E)
   ================================================ */

/**
 * Normalize a single MatchResult from GET /api/v1/matches into the shape
 * the rest of the frontend uses for rendering match cards.
 *
 * Backend shape:
 *   { user: {id, full_name, bio, avatar, location},
 *     score, label,
 *     teach_skills: [{id, name, type, category, ...}],
 *     learn_skills: [{id, name, type, category, ...}] }
 *
 * Frontend card shape:
 *   { id, name, bio, avatar, location, teachSkills[], learnSkills[],
 *     score, label, _isApiMatch }
 *
 * @param {object} match  Raw MatchResult from API
 * @returns {object}      Normalized match object
 */
function normalizeMatch(match) {
  return {
    id:          match.user.id,
    name:        match.user.full_name,
    bio:         match.user.bio      || '',
    avatar:      match.user.avatar   || AVATARS[0],  // emoji or data URL; fallback only if null
    location:    match.user.location || '',
    teachSkills: (match.teach_skills || []).map(s => s.name),
    learnSkills: (match.learn_skills || []).map(s => s.name),
    score:       match.score,
    label:       match.label,        // "Excellent Match" | "Good Match" | "Low Match"
    _isApiMatch: true,               // flag so card renderer knows not to recalculate score
  };
}

/**
 * Fetch real matches from GET /api/v1/matches.
 * - Uses the centralised apiRequest() — JWT is injected automatically.
 * - Normalizes the response into State.realMatches.
 * - Guards against simultaneous duplicate requests.
 * - Handles 401, network errors, and other API errors gracefully.
 * - Shows a loading state in #matches-grid while fetching.
 *
 * @returns {Promise<boolean>}  true if fetch succeeded
 */
async function fetchRealMatches() {
  // Guard: don't fire if already in flight
  if (State.matchesFetching) return false;

  State.matchesFetching = true;
  showMatchesLoading();

  try {
    const data = await apiRequest('/api/v1/matches');
    State.realMatches = (data.matches || []).map(normalizeMatch);
    console.info(`[SkillSwap] ✅ Fetched ${State.realMatches.length} real matches.`);
    return true;
  } catch (err) {
    if (err.status === 401) {
      // Token expired mid-session
      handleAuthExpiry();
      return false;
    }
    // Network or other error — show an inline error, don't crash the app
    console.warn('[SkillSwap] Could not load matches:', err.message);
    showMatchesFetchError();
    return false;
  } finally {
    State.matchesFetching = false;
  }
}

/**
 * Invalidate the real match cache and re-render the match section.
 * Called after a successful skill add or delete so the new skills
 * are reflected in match results.
 */
async function refreshRealMatches() {
  State.realMatches = null;  // invalidate cache
  await fetchRealMatches();
  renderMatchCards();
}

/**
 * Show a spinner/loading placeholder inside #matches-grid.
 * Keeps the rest of the page intact.
 */
function showMatchesLoading() {
  const grid = $('#matches-grid');
  if (!grid) return;
  grid.innerHTML = `
    <div class="matches-loading" role="status" aria-live="polite">
      <div class="matches-loading__spinner" aria-hidden="true"></div>
      <p class="matches-loading__text">Finding your best skill matches…</p>
    </div>`;
}

/**
 * Show a friendly error state inside #matches-grid when the API call fails.
 */
function showMatchesFetchError() {
  const grid = $('#matches-grid');
  if (!grid) return;
  grid.innerHTML = `
    <div class="empty-state">
      <span class="empty-state__icon">⚠️</span>
      <h3 class="empty-state__title">Unable to load matches</h3>
      <p class="empty-state__text">Please check your connection and try again.</p>
      <button class="btn btn--outline btn--sm js-retry-matches" aria-label="Retry loading matches">
        Try Again
      </button>
    </div>`;
  grid.querySelector('.js-retry-matches')?.addEventListener('click', async () => {
    await fetchRealMatches();
    renderMatchCards();
  });
}

/* ================================================
   REAL CONNECTION API  (Phase 2F)
   ================================================ */

/**
 * Normalize a single ConnectionOut from GET /api/v1/requests into the shape
 * the frontend uses for status checks and dashboard rendering.
 *
 * Backend shape:
 *   { id, sender_id, receiver_id, status, created_at,
 *     sender: UserPublic, receiver: UserPublic }
 *
 * Frontend shape:
 *   { id, senderId, receiverId, status, createdAt, sender, receiver }
 *
 * @param {object} conn  Raw ConnectionOut from API
 * @returns {object}     Normalized connection object
 */
function normalizeConnection(conn) {
  return {
    id:         conn.id,           // real integer — required for accept/reject calls
    senderId:   conn.sender_id,
    receiverId: conn.receiver_id,
    status:     conn.status,       // "pending" | "accepted" | "rejected"
    createdAt:  conn.created_at,
    sender:     conn.sender,       // UserPublic: {id, full_name, bio, avatar, location}
    receiver:   conn.receiver,
  };
}

/**
 * Fetch all connections for the current user from GET /api/v1/requests.
 * Stores normalized results in State.realConnections.
 * Guards against duplicate simultaneous requests.
 *
 * @returns {Promise<boolean>}  true if fetch succeeded
 */
async function fetchRealConnections() {
  if (State.connectionsFetching) return false;
  State.connectionsFetching = true;
  try {
    const data = await apiRequest('/api/v1/requests');
    State.realConnections = (data.connections || []).map(normalizeConnection);
    console.info(`[SkillSwap] ✅ Fetched ${State.realConnections.length} real connections.`);
    return true;
  } catch (err) {
    if (err.status === 401) {
      handleAuthExpiry();
      return false;
    }
    console.warn('[SkillSwap] Could not load connections:', err.message);
    // Don't crash — leave State.realConnections as-is
    if (State.realConnections === null) State.realConnections = [];
    return false;
  } finally {
    State.connectionsFetching = false;
  }
}

/**
 * Invalidate and re-fetch real connections, then re-render affected UI.
 * Called after a successful send/accept/reject.
 */
async function refreshRealConnections() {
  State.realConnections = null;
  await fetchRealConnections();
}

/* ================================================
   DASHBOARD API  (Phase 2G)
   ================================================ */

/**
 * Fetch the full dashboard payload from GET /api/v1/dashboard.
 *
 * This is the PRIMARY data source for authenticated users.  A single call
 * provides profile, skills, connections, stats, and top_matches.
 *
 * Side-effects on success:
 *   - Stores raw response in State.dashboardData
 *   - Applies teach/learn skills to State.currentUser (replaces fetchUserSkills)
 *   - Normalizes all connections into State.realConnections (replaces fetchRealConnections)
 *
 * @returns {Promise<boolean>}  true if fetch succeeded
 */
async function fetchDashboard() {
  if (State.dashboardFetching) return false;
  State.dashboardFetching = true;

  try {
    const data = await apiRequest('/api/v1/dashboard');
    State.dashboardData = data;

    // ── Apply skills to State.currentUser ─────────────────────────────────
    // Combines teach_skills + learn_skills from the dashboard response.
    // Reuses the existing applySkillsToState() which expects SkillOut[].
    if (State.currentUser) {
      const allSkills = [
        ...(data.teach_skills || []),
        ...(data.learn_skills  || []),
      ];
      applySkillsToState(allSkills);
    }

    // ── Normalize all connections into State.realConnections ──────────────
    // Merge pending_received + pending_sent + accepted_connections.
    // Use a Map keyed on connection id to deduplicate.
    const connMap = new Map();
    const allConns = [
      ...(data.pending_received     || []),
      ...(data.pending_sent         || []),
      ...(data.accepted_connections || []),
    ];
    for (const c of allConns) {
      if (!connMap.has(c.id)) {
        connMap.set(c.id, normalizeConnection(c));
      }
    }
    State.realConnections = Array.from(connMap.values());

    console.info(
      `[SkillSwap] ✅ Dashboard loaded — ` +
      `matches:${data.stats?.total_matches} ` +
      `connections:${data.stats?.total_connections} ` +
      `pending_recv:${data.stats?.pending_received}`
    );
    return true;
  } catch (err) {
    if (err.status === 401) {
      handleAuthExpiry();
      return false;
    }
    console.warn('[SkillSwap] Could not load dashboard:', err.message);
    // P1-2: Show a friendly toast when the dashboard fails to load.
    // Only show it once per fetch attempt — not on every background refresh.
    // Avoid the toast during silent background refreshes by checking whether
    // dashboardData was previously loaded (null = first load, not a refresh).
    if (State.dashboardData === null) {
      showToast('Could not load your dashboard. Please refresh.', 'warning');
    }
    return false;
  } finally {
    State.dashboardFetching = false;
  }
}

/**
 * Convenience: invalidate dashboard cache and re-fetch.
 * Called after connection mutations (send/accept/reject) and skill mutations.
 */
async function refreshDashboard() {
  State.dashboardData = null;
  await fetchDashboard();
}

/* ================================================
   "WHY THIS MATCH?" EXPLANATION ENGINE  (Phase 2E)
   ================================================ */

/**
 * Build a deterministic, human-readable explanation for why two users match.
 * Uses the real skills from the backend — no LLM, no randomness.
 *
 * Returns an array of explanation strings.  Empty array = no explanation available.
 *
 * @param {string[]} myTeach    Skills the current user can teach
 * @param {string[]} myLearn    Skills the current user wants to learn
 * @param {string[]} theirTeach Skills the matched user can teach
 * @param {string[]} theirLearn Skills the matched user wants to learn
 * @returns {string[]}
 */
function buildWhyMatch(myTeach, myLearn, theirTeach, theirLearn) {
  const reasons = [];

  // Case-insensitive intersection helper
  const intersect = (a, b) => {
    const bLower = b.map(s => s.toLowerCase());
    return a.filter(s => bLower.includes(s.toLowerCase()));
  };

  // Direction 1: I teach → they learn
  const iTeachTheyLearn = intersect(myTeach, theirLearn);
  for (const skill of iTeachTheyLearn) {
    reasons.push(`You teach ${skill}, and they want to learn ${skill}.`);
  }

  // Direction 2: They teach → I learn
  const theyTeachILearn = intersect(theirTeach, myLearn);
  for (const skill of theyTeachILearn) {
    reasons.push(`They teach ${skill}, and you want to learn ${skill}.`);
  }

  // Common interest: skills that appear in both users' combined teach+learn
  // but are NOT already covered by the reciprocal explanations above
  if (reasons.length < 3) {
    const alreadyCovered = new Set([
      ...iTeachTheyLearn.map(s => s.toLowerCase()),
      ...theyTeachILearn.map(s => s.toLowerCase()),
    ]);
    const allMine   = [...myTeach,    ...myLearn];
    const allTheirs = [...theirTeach, ...theirLearn];
    const common    = intersect(allMine, allTheirs)
      .filter(s => !alreadyCovered.has(s.toLowerCase()));

    for (const skill of common.slice(0, 1)) {  // at most one common-interest note
      reasons.push(`You both have an interest in ${skill}.`);
    }
  }

  return reasons;
}

/**
 * Render the "Why you match" HTML block for one match card.
 * Returns an empty string if there are no reasons (block is hidden).
 *
 * @param {object} match  Normalized match object from normalizeMatch()
 * @returns {string}      HTML string
 */
function whyMatchHTML(match) {
  if (!State.currentUser || !match._isApiMatch) return '';

  const reasons = buildWhyMatch(
    State.currentUser.teachSkills || [],
    State.currentUser.learnSkills || [],
    match.teachSkills,
    match.learnSkills,
  );

  if (!reasons.length) return '';

  const items = reasons
    .map(r => `<li class="why-match__item">✓ ${esc(r)}</li>`)
    .join('');

  return `
    <div class="why-match" aria-label="Why you match">
      <span class="why-match__heading">Why you match</span>
      <ul class="why-match__list" role="list">${items}</ul>
    </div>`;
}

/* ================================================
   AUTHENTICATION
   ================================================ */

/**
 * Map backend UserOut → the shape the rest of the frontend uses.
 * Backend uses full_name; frontend uses name.
 * Skills are now loaded separately via GET /api/v1/skills.
 * We do NOT preserve stale skills here anymore — fetchUserSkills() handles them.
 */
function mapBackendUser(apiUser) {
  return {
    id:          apiUser.id,
    name:        apiUser.full_name,
    email:       apiUser.email,
    bio:         apiUser.bio      || '',
    avatar:      apiUser.avatar   || AVATARS[0],  // emoji or data URL; fallback only if null
    location:    apiUser.location || '',
    teachSkills: [],   // populated by fetchUserSkills()
    learnSkills: [],   // populated by fetchUserSkills()
    // Raw API skill objects (with id/type/category) — used by makeApiSkillInput
    _apiSkills:  [],
    createdAt:   apiUser.created_at,
    updatedAt:   apiUser.updated_at,
    isDemo:      false,
    isApiUser:   true,
  };
}

/**
 * Fetch /api/v1/users/me and store in State.
 * Silently returns null if token is missing or invalid.
 */
async function fetchCurrentUser() {
  if (!Auth.getToken()) return null;
  try {
    const apiUser = await apiRequest('/api/v1/users/me');
    return mapBackendUser(apiUser);
  } catch (err) {
    if (err.status === 401) {
      // Token is invalid or expired — clear it silently
      Auth.clearToken();
      console.info('[SkillSwap] Token expired — cleared.');
    }
    return null;
  }
}

/**
 * Restore the session on page load.
 * If a stored token is found, validate it with the backend.
 * Falls back to demo mode gracefully if the backend is offline.
 */
async function restoreSession(apiOnline) {
  if (!Auth.getToken()) return;
  if (!apiOnline) {
    // Backend offline — cannot validate token, stay in demo mode
    Auth.clearToken();
    State.currentUser = null;
    return;
  }
  const user = await fetchCurrentUser();
  if (user) {
    State.currentUser = user;
    // Phase 2G: single dashboard call provides skills + connections + stats + top_matches.
    // Replaces the previous Promise.all([fetchUserSkills(), fetchRealConnections()]).
    await fetchDashboard();
  }
}

/**
 * Log out the current user.
 * Clears JWT, clears authenticated user state, refreshes UI.
 * Does NOT delete the database user.
 */
function logoutUser() {
  // Close any active chat WebSocket before clearing state
  if (State.chat.isOpen) chatClose();
  chatResetState();
  Auth.clearToken();
  State.currentUser = null;
  // Clear all API-backed state caches so next login starts fresh
  State.realMatches    = null;
  State.realConnections = null;
  State.dashboardData  = null;
  Storage.remove(STORAGE_KEYS.CURRENT_USER);
  renderMatchCards();
  renderDashboard();
  updateNavButtons();
  showToast('Logged out. See you soon! 👋', 'info');
}

/**
 * Register modal — collects full_name, email, password.
 * Calls POST /api/v1/auth/register.
 * On success → stores token + user, updates UI.
 */
function openRegisterModal() {
  openModal(`
    <form class="form" id="register-form" novalidate>
      <h2 class="form__title">Create Account</h2>
      <p class="form__subtitle">Join SkillSwap — teach what you know, learn what you love.</p>

      <div class="form-group">
        <label class="form-label" for="reg-name">Full Name *</label>
        <input class="form-input" id="reg-name" type="text"
          placeholder="e.g. Alex Johnson" maxlength="120"
          required autocomplete="name" />
      </div>

      <div class="form-group">
        <label class="form-label" for="reg-email">Email *</label>
        <input class="form-input" id="reg-email" type="email"
          placeholder="you@example.com" maxlength="255"
          required autocomplete="email" />
      </div>

      <div class="form-group">
        <label class="form-label" for="reg-password">Password *</label>
        <input class="form-input" id="reg-password" type="password"
          placeholder="Min 6 chars, must include a letter and a digit"
          minlength="6" maxlength="128"
          required autocomplete="new-password" />
      </div>

      <div class="form__error" id="reg-error" hidden></div>

      <button type="submit" class="btn btn--primary btn--full" id="reg-submit">
        Create Account
      </button>

      <div class="form__divider">Already have an account?
        <button type="button" class="form__link" id="reg-switch-login">Log In</button>
      </div>
    </form>
  `);

  $('#reg-switch-login')?.addEventListener('click', () => { closeModal(); openLoginModal(); });

  $('#register-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name     = $('#reg-name')?.value.trim();
    const email    = $('#reg-email')?.value.trim();
    const password = $('#reg-password')?.value;
    const errEl    = $('#reg-error');
    const submitBtn = $('#reg-submit');

    // Client-side validation
    if (!name)         { showFormError(errEl, 'Please enter your full name.'); return; }
    if (name.length < 2) { showFormError(errEl, 'Name must be at least 2 characters.'); return; }
    if (!email)        { showFormError(errEl, 'Please enter your email.'); return; }
    if (!password)     { showFormError(errEl, 'Please enter a password.'); return; }
    if (password.length < 6) { showFormError(errEl, 'Password must be at least 6 characters.'); return; }
    if (!/[A-Za-z]/.test(password)) { showFormError(errEl, 'Password must contain at least one letter.'); return; }
    if (!/\d/.test(password))       { showFormError(errEl, 'Password must contain at least one digit.'); return; }

    hideFormError(errEl);
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account…';

    try {
      const res = await apiRequest('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ full_name: name, email, password }),
      });
      Auth.setToken(res.access_token);
      State.currentUser = mapBackendUser(res.user);
      // Phase 2G: single fetchDashboard() provides skills, connections, stats, top_matches.
      State.realMatches    = null;
      State.realConnections = null;
      State.dashboardData  = null;
      await fetchDashboard();
      closeModal();
      showToast(`Welcome to SkillSwap, ${res.user.full_name.split(' ')[0]}! 🎉`, 'success');
      renderMatchCards();
      renderDashboard();
      updateNavButtons();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
      if (err.status === 409) {
        showFormError(errEl, 'An account with this email already exists.');
      } else if (err.status === 422) {
        const detail = err.data?.detail;
        const msg = Array.isArray(detail)
          ? detail.map(d => d.msg).join(' ')
          : (detail || 'Please check your input.');
        showFormError(errEl, msg);
      } else if (!navigator.onLine || err.message?.includes('fetch')) {
        showFormError(errEl, 'Unable to connect to SkillSwap API. Please try again.');
      } else {
        showFormError(errEl, err.message || 'Something went wrong. Please try again.');
      }
    }
  });
}

/**
 * Login modal — collects email + password.
 * Calls POST /api/v1/auth/login.
 * On success → stores token, fetches /me, updates UI.
 */
function openLoginModal() {
  openModal(`
    <form class="form" id="login-form" novalidate>
      <h2 class="form__title">Welcome Back</h2>
      <p class="form__subtitle">Log in to your SkillSwap account.</p>

      <div class="form-group">
        <label class="form-label" for="login-email">Email *</label>
        <input class="form-input" id="login-email" type="email"
          placeholder="you@example.com" maxlength="255"
          required autocomplete="email" />
      </div>

      <div class="form-group">
        <label class="form-label" for="login-password">Password *</label>
        <input class="form-input" id="login-password" type="password"
          placeholder="Your password" maxlength="128"
          required autocomplete="current-password" />
      </div>

      <div class="form__error" id="login-error" hidden></div>

      <button type="submit" class="btn btn--primary btn--full" id="login-submit">
        Log In
      </button>

      <div class="form__divider">Don't have an account?
        <button type="button" class="form__link" id="login-switch-register">Sign Up</button>
      </div>
    </form>
  `);

  $('#login-switch-register')?.addEventListener('click', () => { closeModal(); openRegisterModal(); });

  $('#login-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const email     = $('#login-email')?.value.trim();
    const password  = $('#login-password')?.value;
    const errEl     = $('#login-error');
    const submitBtn = $('#login-submit');

    if (!email)    { showFormError(errEl, 'Please enter your email.'); return; }
    if (!password) { showFormError(errEl, 'Please enter your password.'); return; }

    hideFormError(errEl);
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in…';

    try {
      const res = await apiRequest('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      Auth.setToken(res.access_token);
      State.currentUser = mapBackendUser(res.user);
      // Phase 2G: single fetchDashboard() provides skills, connections, stats, top_matches.
      State.realMatches    = null;
      State.realConnections = null;
      State.dashboardData  = null;
      await fetchDashboard();
      closeModal();
      showToast(`Welcome back, ${res.user.full_name.split(' ')[0]}! 👋`, 'success');
      renderMatchCards();
      renderDashboard();
      updateNavButtons();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log In';
      if (err.status === 401) {
        showFormError(errEl, 'Invalid email or password.');
      } else if (!navigator.onLine || err.message?.includes('fetch')) {
        showFormError(errEl, 'Unable to connect to SkillSwap API. Please try again.');
      } else {
        showFormError(errEl, err.message || 'Something went wrong. Please try again.');
      }
    }
  });
}

/** Show an inline form error message. */
function showFormError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

/** Hide the inline form error. */
function hideFormError(el) {
  if (!el) return;
  el.hidden = true;
  el.textContent = '';
}

/* ================================================
   TOAST
   ================================================ */
let _toastTimer = null;

function showToast(msg, type = 'info', ms = 3500) {
  const el = $('#toast');
  if (!el) return;
  const icons = { success:'✓', error:'✕', info:'ℹ', warning:'⚠' };
  el.className = `toast toast--${type}`;
  el.innerHTML = `<span class="toast__icon">${icons[type]||'ℹ'}</span><span>${esc(msg)}</span>`;
  el.hidden = false;
  // reset animation so it plays fresh each time
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = '';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.style.animation = 'slide-out-right 0.3s ease forwards';
    setTimeout(() => { el.hidden = true; el.style.animation = ''; }, 320);
  }, ms);
}

/* ================================================
   MODAL
   ================================================ */
let _modalReady = false;

function openModal(html) {
  const overlay = $('#modal-overlay');
  const content = $('#modal-content');
  if (!overlay || !content) return;
  content.innerHTML = html;
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  // focus first real input inside the form, not close button
  requestAnimationFrame(() => {
    const first = content.querySelector('input:not([type=hidden]), textarea, select');
    if (first) first.focus();
  });
}

function closeModal() {
  const overlay = $('#modal-overlay');
  if (!overlay || overlay.hidden) return;
  // If the chat modal is currently open, close the WebSocket cleanly.
  if (State.chat.isOpen) chatClose();
  overlay.hidden = true;
  document.body.style.overflow = '';
  // clear content to prevent stale event listeners
  const content = $('#modal-content');
  if (content) content.innerHTML = '';
}

function initModal() {
  if (_modalReady) return;
  _modalReady = true;
  const overlay = $('#modal-overlay');
  const closeBtn = $('#modal-close');
  if (!overlay || !closeBtn) return;
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) closeModal(); });
}

/* ================================================
   NAVIGATION
   ================================================ */
let _navReady = false;

function initNavigation() {
  /* ── Hamburger (re-init safe: replaces onclick each time) ── */
  const hamburger  = $('#hamburger');
  const mobileMenu = $('#mobile-menu');
  if (hamburger && mobileMenu) {
    hamburger.onclick = () => {
      const open = !mobileMenu.hidden;
      mobileMenu.hidden = open;
      hamburger.setAttribute('aria-expanded', String(!open));
    };
    $$('.navbar__link', mobileMenu).forEach(link => {
      link.onclick = () => {
        mobileMenu.hidden = true;
        hamburger.setAttribute('aria-expanded', 'false');
      };
    });
    // mobile "Get Started / My Dashboard" button
    const mobileBtn = $('#btn-mobile-get-started');
    if (mobileBtn) mobileBtn.onclick = () => {
      mobileMenu.hidden = true;
      hamburger.setAttribute('aria-expanded', 'false');
      if (State.currentUser) {
        $('#dashboard')?.scrollIntoView({ behavior:'smooth' });
      } else {
        openRegisterModal();
      }
    };
  }

  if (_navReady) return;
  _navReady = true;

  /* ── P2-1: Close mobile menu on outside click ── */
  document.addEventListener('click', e => {
    const mobileMenu = $('#mobile-menu');
    const hamburger  = $('#hamburger');
    if (!mobileMenu || mobileMenu.hidden) return;
    // Ignore clicks on the hamburger itself (its own onclick handles toggle)
    // and clicks inside the menu (link clicks have their own handlers)
    if (hamburger?.contains(e.target) || mobileMenu.contains(e.target)) return;
    mobileMenu.hidden = true;
    hamburger?.setAttribute('aria-expanded', 'false');
  }, true); // capture phase so it fires before any stopPropagation

  /* ── Scroll: navbar glass effect ── */
  window.addEventListener('scroll', () => {
    $('.navbar')?.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });

  /* ── Active link highlight via IntersectionObserver ── */
  const sections = $$('section[id], main[id]');
  const links    = $$('.navbar__link[href^="#"]');
  new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      links.forEach(l =>
        l.classList.toggle('active', l.getAttribute('href') === `#${entry.target.id}`)
      );
    });
  }, { rootMargin: '-40% 0px -55% 0px' }).observe
    && sections.forEach(s =>
      new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          links.forEach(l =>
            l.classList.toggle('active', l.getAttribute('href') === `#${entry.target.id}`)
          );
        });
      }, { rootMargin: '-40% 0px -55% 0px' }).observe(s)
    );

  /* ── Smooth scroll for all # links ── */
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const href = a.getAttribute('href');
    // P2-4: Prevent placeholder href="#" links from jumping to the top of the page.
    if (href === '#') { e.preventDefault(); return; }
    const target = $(href);
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior:'smooth', block:'start' }); }
  });
}

/* ================================================
   SCROLL FADE-UP ANIMATIONS
   ================================================ */
let _scrollObs = null;
function initScrollAnimations() {
  if (_scrollObs) _scrollObs.disconnect();
  _scrollObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        _scrollObs.unobserve(e.target);
      }
    });
  }, { rootMargin:'0px 0px -60px 0px', threshold: 0.1 });
  $$('.stats__item, .feature-card').forEach(el => {
    if (!el.classList.contains('visible')) {
      el.classList.add('fade-up');
      _scrollObs.observe(el);
    }
  });
}

/* ================================================
   COUNTER ANIMATION — removed (stats section deleted)
   ================================================ */

/* ================================================
   LOCALSTORAGE LAYER
   ================================================ */
function seedDemoUsers() {
  if (Storage.get(STORAGE_KEYS.SEEDED)) return;
  const users = DEMO_USERS.map(u => ({
    id: uid(), name: u.name, avatar: u.avatar, bio: u.bio,
    teachSkills: u.teachSkills, learnSkills: u.learnSkills,
    location: u.location, category: u.category,
    createdAt: new Date().toISOString(), isDemo: true,
  }));
  Storage.set(STORAGE_KEYS.USERS, users);
  Storage.set(STORAGE_KEYS.SEEDED, true);
  State.users = users;
}

function loadAll() {
  State.users       = Storage.get(STORAGE_KEYS.USERS)       || [];
  State.connections = Storage.get(STORAGE_KEYS.CONNECTIONS) || [];
  // Only restore from localStorage if no real API session exists.
  // restoreSession() (called before loadAll in boot) sets State.currentUser
  // from the backend when a valid token is present.
  if (!State.currentUser) {
    State.currentUser = Storage.get(STORAGE_KEYS.CURRENT_USER) || null;
  }
}

function persistUser(userData) {
  State.currentUser = userData;
  Storage.set(STORAGE_KEYS.CURRENT_USER, userData);
  const list = Storage.get(STORAGE_KEYS.USERS) || [];
  const idx  = list.findIndex(u => u.id === userData.id);
  if (idx === -1) list.push(userData); else list[idx] = userData;
  Storage.set(STORAGE_KEYS.USERS, list);
  State.users = list;
}

function persistConnections() {
  Storage.set(STORAGE_KEYS.CONNECTIONS, State.connections);
}

/* ================================================
   MATCH ENGINE
   ================================================ */
function calcScore(me, them) {
  if (!me || !them) return 0;
  let s = 0;
  const mt = me.teachSkills   || [], ml = me.learnSkills   || [];
  const tt = them.teachSkills || [], tl = them.learnSkills || [];
  if (mt.some(x => tl.includes(x))) s += 40;  // I teach what they learn
  if (tt.some(x => ml.includes(x))) s += 40;  // They teach what I learn
  if ([...mt,...ml].some(x => [...tt,...tl].includes(x))) s += 20; // common interest
  return Math.min(s, 100);
}

function getMatchLabel(score) {
  if (score >= MATCH_LABELS.excellent.min) return MATCH_LABELS.excellent;
  if (score >= MATCH_LABELS.good.min)      return MATCH_LABELS.good;
  return MATCH_LABELS.low;
}

function getMatches(user) {
  if (!user) return [];
  return State.users
    .filter(u => u.id !== user.id)
    .map(u => ({ ...u, score: calcScore(user, u) }))
    .filter(u => u.score > 0)
    .sort((a,b) => b.score - a.score);
}

/* ================================================
   CONNECTIONS
   ================================================ */

/**
 * Look up the connection between the current user and another user.
 *
 * For authenticated API users: searches State.realConnections (real DB data).
 * For demo users: searches State.connections (localStorage).
 *
 * @param {number|string} userId  The other user's id
 * @returns {object|null}  The connection object, or null if none exists
 */
function connStatus(userId) {
  if (!State.currentUser) return null;

  // ── Authenticated API user — use real connection cache ──────────────────
  if (State.currentUser.isApiUser && State.realConnections !== null) {
    const myId = State.currentUser.id;
    return State.realConnections.find(c =>
      (c.senderId === myId   && c.receiverId === Number(userId)) ||
      (c.receiverId === myId && c.senderId   === Number(userId))
    ) || null;
  }

  // ── Demo / localStorage user — unchanged behavior ───────────────────────
  return State.connections.find(c =>
    (c.fromId === State.currentUser.id && c.toId === userId) ||
    (c.fromId === userId && c.toId === State.currentUser.id)
  ) || null;
}

/**
 * Send a connection request to targetId.
 *
 * For authenticated API users:
 *   - Calls POST /api/v1/requests/send
 *   - Refreshes State.realConnections after success
 *   - Handles 400/404/409/401/network gracefully
 *
 * For demo users:
 *   - Existing localStorage behavior (unchanged)
 */
async function sendRequest(targetId) {
  if (!State.currentUser) {
    showToast('Create an account first!', 'warning');
    openRegisterModal();
    return;
  }

  // ── Authenticated API user ───────────────────────────────────────────────
  if (State.currentUser.isApiUser) {
    const myId = State.currentUser.id;
    if (Number(targetId) === myId) {
      showToast('You cannot connect with yourself.', 'error');
      return;
    }

    // Optimistic duplicate check — prevents double-click during fetch
    const existing = connStatus(targetId);
    if (existing && existing.status !== 'rejected') {
      showToast('Connection request already exists.', 'info');
      return;
    }

    // Find target name from real matches for the toast message
    const matchEntry = (State.realMatches || []).find(m => m.id === Number(targetId));
    const targetName = matchEntry ? matchEntry.name : 'this user';

    // Disable the button while request is in flight
    const btn = $(`[data-uid="${targetId}"]`);
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    try {
      await apiRequest('/api/v1/requests/send', {
        method: 'POST',
        body: JSON.stringify({ receiver_id: Number(targetId) }),
      });
      // Phase 2G: refreshDashboard updates connections + stats in one call
      await refreshDashboard();
      showToast(`Request sent to ${targetName}!`, 'success');
      renderMatchCards();
      renderDashboard();
    } catch (err) {
      // Re-enable button on error
      if (btn) { btn.disabled = false; btn.textContent = 'Connect'; }

      if (err.status === 401) {
        handleAuthExpiry();
      } else if (err.status === 409) {
        // Backend says duplicate — sync our state and update UI
        await refreshDashboard();
        renderMatchCards();
        showToast('Connection request already exists.', 'info');
      } else if (err.status === 400) {
        showToast('You cannot send a request to yourself.', 'error');
      } else if (err.status === 404) {
        showToast('User not found.', 'error');
      } else if (!navigator.onLine || err.message?.includes('fetch')) {
        showToast('Unable to send connection request. Please try again.', 'error');
      } else {
        showToast(err.message || 'Could not send request. Please try again.', 'error');
      }
    }
    return;
  }

  // ── Demo / localStorage user — unchanged behavior ───────────────────────
  if (Number(targetId) === State.currentUser.id) {
    showToast('Cannot connect with yourself.', 'error');
    return;
  }
  if (connStatus(targetId)) { showToast('Request already sent.', 'info'); return; }
  const target = State.users.find(u => u.id === targetId);
  if (!target) return;
  State.connections.push({ id: uid(), fromId: State.currentUser.id, toId: targetId,
    status: 'pending', createdAt: new Date().toISOString() });
  persistConnections();
  showToast(`Request sent to ${target.name}!`, 'success');
  renderMatchCards();
  renderDashboard();
}

/**
 * Accept a pending connection request.
 *
 * For authenticated API users:
 *   - Calls POST /api/v1/requests/accept with the real integer connection_id
 *   - Refreshes State.realConnections after success
 *
 * For demo users:
 *   - Existing localStorage behavior (unchanged)
 */
async function acceptRequest(connId) {
  // ── Authenticated API user ───────────────────────────────────────────────
  if (State.currentUser?.isApiUser) {
    // P1-1: Disable the button immediately to prevent duplicate clicks.
    const btn = $(`[data-cid="${connId}"].js-accept`);
    if (btn) {
      if (btn.disabled) return;   // already in-flight
      btn.disabled = true;
      btn.textContent = 'Accepting…';
    }

    try {
      await apiRequest('/api/v1/requests/accept', {
        method: 'POST',
        body: JSON.stringify({ connection_id: Number(connId) }),
      });
      // Phase 2G: refreshDashboard updates connections + stats in one call
      await refreshDashboard();
      showToast('Connection accepted! 🎉', 'success');
      renderMatchCards();
      renderDashboard();
    } catch (err) {
      // Restore button on failure so the user can retry
      if (btn) { btn.disabled = false; btn.textContent = 'Accept'; }
      if (err.status === 401) {
        handleAuthExpiry();
      } else if (err.status === 403) {
        showToast('You are not the receiver of this request.', 'error');
      } else if (err.status === 400) {
        // Already accepted/rejected — re-sync
        await refreshDashboard();
        renderDashboard();
        showToast('This request has already been actioned.', 'info');
      } else {
        showToast(err.message || 'Could not accept request. Please try again.', 'error');
      }
    }
    return;
  }

  // ── Demo / localStorage user — unchanged behavior ───────────────────────
  const conn = State.connections.find(c => c.id === connId);
  if (!conn) return;
  conn.status = 'accepted';
  persistConnections();
  showToast('Connection accepted! 🎉', 'success');
  renderMatchCards();
  renderDashboard();
}

/**
 * Reject a pending connection request.
 *
 * For authenticated API users:
 *   - Calls POST /api/v1/requests/reject with the real integer connection_id
 *
 * For demo users:
 *   - Marks the connection as rejected in localStorage
 */
async function rejectRequest(connId) {
  // ── Authenticated API user ───────────────────────────────────────────────
  if (State.currentUser?.isApiUser) {
    // P1-1: Disable the button immediately to prevent duplicate clicks.
    const btn = $(`[data-cid="${connId}"].js-reject`);
    if (btn) {
      if (btn.disabled) return;   // already in-flight
      btn.disabled = true;
      btn.textContent = 'Declining…';
    }

    try {
      await apiRequest('/api/v1/requests/reject', {
        method: 'POST',
        body: JSON.stringify({ connection_id: Number(connId) }),
      });
      // Phase 2G: refreshDashboard updates connections + stats in one call
      await refreshDashboard();
      showToast('Connection request declined.', 'info');
      renderDashboard();
    } catch (err) {
      // Restore button on failure so the user can retry
      if (btn) { btn.disabled = false; btn.textContent = 'Decline'; }
      if (err.status === 401) {
        handleAuthExpiry();
      } else if (err.status === 403) {
        showToast('You are not the receiver of this request.', 'error');
      } else if (err.status === 400) {
        await refreshDashboard();
        renderDashboard();
        showToast('This request has already been actioned.', 'info');
      } else {
        showToast(err.message || 'Could not decline request. Please try again.', 'error');
      }
    }
    return;
  }

  // ── Demo / localStorage user ─────────────────────────────────────────────
  const conn = State.connections.find(c => c.id === connId);
  if (!conn) return;
  conn.status = 'rejected';
  persistConnections();
  showToast('Connection request declined.', 'info');
  renderDashboard();
}

/**
 * Cancel an outgoing PENDING connection request sent by the current user.
 *
 * For authenticated API users:
 *   - Calls DELETE /api/v1/requests/{connection_id}
 *   - Backend enforces: current user must be the sender, status must be pending.
 *   - On success: removes from UI, refreshes dashboard, shows toast.
 *   - Button is disabled during the request to prevent double-clicks.
 *
 * For demo / localStorage users:
 *   - Removes the pending request from State.connections and localStorage.
 *
 * Security note: authorization is enforced on the backend — hiding the button
 * is only a UX convenience, not the security boundary.
 *
 * @param {number|string} connId  The connection id (integer for API users)
 */
async function cancelRequest(connId) {
  // ── Authenticated API user ───────────────────────────────────────────────
  if (State.currentUser?.isApiUser) {
    const btn = $(`[data-cid="${connId}"].js-cancel`);
    if (btn) {
      if (btn.disabled) return;   // already in-flight — prevent double-click
      btn.disabled = true;
      btn.textContent = 'Cancelling…';
    }

    try {
      await apiRequest(`/api/v1/requests/${Number(connId)}`, { method: 'DELETE' });
      // Refresh dashboard so the cancelled request disappears from both
      // Manish's outgoing list AND Rahul's incoming list.
      await refreshDashboard();
      showToast('Connection request cancelled.', 'info');
      renderMatchCards();   // re-enable "Connect" button on match card
      renderDashboard();
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Cancel Request'; }
      if (err.status === 401) {
        handleAuthExpiry();
      } else if (err.status === 403) {
        showToast('You can only cancel requests you sent.', 'error');
        await refreshDashboard();
        renderDashboard();
      } else if (err.status === 400) {
        // Already accepted/rejected — re-sync
        await refreshDashboard();
        renderDashboard();
        showToast('This request can no longer be cancelled.', 'info');
      } else if (err.status === 404) {
        // Already gone — just re-sync
        await refreshDashboard();
        renderDashboard();
        showToast('Request not found — it may have already been cancelled.', 'info');
      } else if (!navigator.onLine || err.message?.includes('fetch')) {
        showToast('Unable to cancel request. Please check your connection.', 'error');
      } else {
        showToast(err.message || 'Could not cancel request. Please try again.', 'error');
      }
    }
    return;
  }

  // ── Demo / localStorage user ─────────────────────────────────────────────
  const idx = State.connections.findIndex(c => c.id === connId);
  if (idx === -1) return;
  State.connections.splice(idx, 1);
  persistConnections();
  showToast('Connection request cancelled.', 'info');
  renderMatchCards();
  renderDashboard();
}

/* ================================================
   SKILL TAG INPUT  (demo / localStorage users)
   ================================================ */
function makeSkillInput(containerId, existing = [], max = 5) {
  const wrap = $(`#${containerId}`);
  if (!wrap) return { getTags: () => [] };
  let tags = [...existing];

  wrap.addEventListener('click', () => {
    const inp = wrap.querySelector('input[type=text]');
    if (inp) inp.focus();
  });

  function render() {
    wrap.innerHTML = '';
    tags.forEach(skill => {
      const span = document.createElement('span');
      span.className = 'skill-tag--removable';
      span.innerHTML = `${esc(skill)}<button class="skill-tag__remove" type="button" aria-label="Remove ${esc(skill)}">✕</button>`;
      span.querySelector('.skill-tag__remove').addEventListener('click', e => {
        e.stopPropagation();
        tags = tags.filter(t => t !== skill);
        render();
      });
      wrap.appendChild(span);
    });
    if (tags.length < max) {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.placeholder = `Add skill (${tags.length}/${max})`;
      inp.setAttribute('aria-label', 'Type a skill and press Enter');
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          addTag(inp.value);
          inp.value = '';
          addBtn.disabled = true;
        }
        if (e.key === 'Backspace' && inp.value === '' && tags.length) {
          tags.pop(); render();
        }
      });
      inp.addEventListener('input', () => {
        addBtn.disabled = !inp.value.trim();
      });

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn btn--outline btn--sm skill-add-btn';
      addBtn.textContent = 'Add';
      addBtn.disabled = true;
      addBtn.setAttribute('aria-label', 'Add skill');
      addBtn.addEventListener('click', () => {
        addTag(inp.value);
        inp.value = '';
        addBtn.disabled = true;
        inp.focus();
      });

      const row = document.createElement('div');
      row.className = 'skill-input-row';
      row.appendChild(inp);
      row.appendChild(addBtn);
      wrap.appendChild(row);
    }
  }

  function addTag(val) {
    const v = val.trim();
    if (!v) return;
    if (tags.length >= max) { showToast(`Max ${max} skills.`, 'warning'); return; }
    if (tags.map(t => t.toLowerCase()).includes(v.toLowerCase())) {
      showToast('Skill already added.', 'warning'); return;
    }
    tags.push(v); render();
  }

  render();
  return { getTags: () => [...tags] };
}

/* ================================================
   SKILL TAG INPUT  (API / authenticated users)
   Each add/delete fires immediately against the backend.
   Returns a getTags() for reading current names (used by profile save).
   ================================================ */
/**
 * @param {string}  containerId  DOM id of the container div
 * @param {'teach'|'learn'} skillType
 * @param {Array<{id:number,name:string}>} initialSkills  from _apiSkills
 * @param {number}  max  maximum skills (default 5, enforced by backend too)
 */
function makeApiSkillInput(containerId, skillType, initialSkills = [], max = 5) {
  const wrap = $(`#${containerId}`);
  if (!wrap) return { getTags: () => [] };

  // Working copy: [{id, name}]  — id is the real DB id for deletions
  let skills = initialSkills.map(s => ({ id: s.id, name: s.name }));

  wrap.addEventListener('click', () => {
    const inp = wrap.querySelector('input[type=text]');
    if (inp) inp.focus();
  });

  function render() {
    wrap.innerHTML = '';
    skills.forEach(skill => {
      const span = document.createElement('span');
      span.className = 'skill-tag--removable';
      span.dataset.skillId = skill.id;
      span.innerHTML = `${esc(skill.name)}<button class="skill-tag__remove" type="button" aria-label="Remove ${esc(skill.name)}">✕</button>`;
      span.querySelector('.skill-tag__remove').addEventListener('click', async e => {
        e.stopPropagation();
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await apiDeleteSkill(skill.id);
          skills = skills.filter(s => s.id !== skill.id);
          // Sync State.currentUser
          if (skillType === 'teach') {
            State.currentUser.teachSkills = skills.map(s => s.name);
          } else {
            State.currentUser.learnSkills = skills.map(s => s.name);
          }
          State.currentUser._apiSkills = (State.currentUser._apiSkills || [])
            .filter(s => s.id !== skill.id);
          render();
          // Phase 2G: refreshDashboard updates skills, stats, top_matches + connections.
          // Also invalidate match cache so the Matches section re-fetches.
          State.realMatches = null;
          await refreshDashboard();
          renderMatchCards();
          renderDashboard();
        } catch (err) {
          btn.disabled = false;
          if (err.status === 401) {
            handleAuthExpiry();
          } else {
            showToast('Unable to remove skill. Please try again.', 'error');
          }
        }
      });
      wrap.appendChild(span);
    });

    if (skills.length < max) {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.placeholder = `Add skill (${skills.length}/${max})`;
      inp.setAttribute('aria-label', `Type a ${skillType} skill and press Enter`);
      inp.addEventListener('keydown', async e => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const val = inp.value.trim();
          if (!val) return;
          inp.disabled = true;
          addBtn.disabled = true;
          inp.value = '';
          await handleAdd(val, inp);
        }
        if (e.key === 'Backspace' && inp.value === '' && skills.length) {
          // Remove last skill via API
          const last = skills[skills.length - 1];
          inp.disabled = true;
          try {
            await apiDeleteSkill(last.id);
            skills = skills.filter(s => s.id !== last.id);
            if (skillType === 'teach') {
              State.currentUser.teachSkills = skills.map(s => s.name);
            } else {
              State.currentUser.learnSkills = skills.map(s => s.name);
            }
            State.currentUser._apiSkills = (State.currentUser._apiSkills || [])
              .filter(s => s.id !== last.id);
            render();
            // Phase 2G: refreshDashboard updates skills, stats, top_matches + connections.
            // Also invalidate match cache so the Matches section re-fetches.
            State.realMatches = null;
            await refreshDashboard();
            renderMatchCards();
            renderDashboard();
          } catch (err) {
            inp.disabled = false;
            if (err.status === 401) { handleAuthExpiry(); return; }
            showToast('Unable to remove skill. Please try again.', 'error');
          }
        }
      });
      inp.addEventListener('input', () => {
        addBtn.disabled = !inp.value.trim();
      });

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn btn--outline btn--sm skill-add-btn';
      addBtn.textContent = 'Add';
      addBtn.disabled = true;
      addBtn.setAttribute('aria-label', `Add ${skillType} skill`);
      addBtn.addEventListener('click', async () => {
        const val = inp.value.trim();
        if (!val) return;
        inp.disabled = true;
        addBtn.disabled = true;
        inp.value = '';
        await handleAdd(val, inp);
      });

      const row = document.createElement('div');
      row.className = 'skill-input-row';
      row.appendChild(inp);
      row.appendChild(addBtn);
      wrap.appendChild(row);
    }
  }

  async function handleAdd(val) {
    if (skills.length >= max) { showToast(`Maximum ${max} skills allowed.`, 'warning'); return; }
    if (skills.some(s => s.name.toLowerCase() === val.toLowerCase())) {
      showToast('You already have this skill listed.', 'warning'); return;
    }
    try {
      const created = await apiAddSkill(val, skillType);
      skills.push({ id: created.id, name: created.name });
      // Sync State.currentUser
      if (skillType === 'teach') {
        State.currentUser.teachSkills = skills.map(s => s.name);
      } else {
        State.currentUser.learnSkills = skills.map(s => s.name);
      }
      State.currentUser._apiSkills = [...(State.currentUser._apiSkills || []), created];
      render();
      // Phase 2G: refreshDashboard updates skills, stats, top_matches + connections.
      // Also invalidate match cache so the Matches section re-fetches.
      State.realMatches = null;
      await refreshDashboard();
      renderMatchCards();
      renderDashboard();
    } catch (err) {
      if (err.status === 401) {
        handleAuthExpiry();
      } else if (err.status === 409) {
        showToast('You already have this skill listed.', 'warning');
      } else if (err.status === 400) {
        showToast(`Maximum ${max} skills per type allowed.`, 'warning');
      } else if (!navigator.onLine || err.message?.includes('fetch')) {
        showToast('Unable to update your skills. Please try again.', 'error');
      } else {
        showToast(err.message || 'Could not add skill. Please try again.', 'error');
      }
    }
  }

  render();
  return { getTags: () => skills.map(s => s.name) };
}

/** Shared 401 handler for skill operations. */
function handleAuthExpiry() {
  closeModal();
  Auth.clearToken();
  State.currentUser = null;
  renderMatchCards();
  renderDashboard();
  updateNavButtons();
  showToast('Session expired. Please log in again.', 'warning');
  openLoginModal();
}

/* ================================================
   PROFILE MODAL
   ================================================ */
function openProfileModal() {
  const user      = State.currentUser;
  const isEdit    = !!user;
  const isApiUser = !!user?.isApiUser;  // true = authenticated via backend

  const avatarBtns = AVATARS.map(a =>
    `<button type="button" class="avatar-option${user?.avatar===a?' selected':''}" data-avatar="${a}" aria-label="Avatar ${a}">${a}</button>`
  ).join('');

  // Detect whether the current avatar is a custom photo (data URL)
  const hasCustomPhoto = user?.avatar?.startsWith('data:') ?? false;

  // Email row — read-only for API users; hidden for new demo profiles
  const emailRow = isApiUser ? `
      <div class="form-group">
        <label class="form-label" for="profile-email">Email</label>
        <input class="form-input" id="profile-email" type="email"
          value="${esc(user.email)}" readonly disabled
          style="opacity:.6;cursor:not-allowed;" autocomplete="off" />
        <span style="font-size:.72rem;color:var(--text-muted);margin-top:2px;">
          Email cannot be changed here.
        </span>
      </div>` : '';

  openModal(`
    <form class="form" id="profile-form" novalidate>
      <h2 class="form__title">${isEdit ? 'Edit Profile' : 'Create Your Profile'}</h2>
      <p class="form__subtitle">${isEdit ? 'Update your details below.' : 'Set up your demo identity to explore SkillSwap.'}</p>

      <div class="form-group">
        <label class="form-label" for="profile-name">Full Name *</label>
        <input class="form-input" id="profile-name" type="text" placeholder="e.g. Alex Johnson"
          value="${esc(user?.name||'')}" maxlength="120" required autocomplete="name" />
      </div>

      ${emailRow}

      <div class="form-group">
        <label class="form-label" for="profile-location">Location</label>
        <input class="form-input" id="profile-location" type="text" placeholder="e.g. London, UK"
          value="${esc(user?.location||'')}" maxlength="120" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="profile-bio">Short Bio</label>
        <textarea class="form-textarea" id="profile-bio" placeholder="Tell people what you're about…"
          maxlength="500">${esc(user?.bio||'')}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Choose Avatar</label>
        <div class="avatar-picker" id="avatar-picker" role="group" aria-label="Choose avatar">${avatarBtns}</div>

        <!-- Upload Photo row — sits below the emoji options -->
        <div class="avatar-upload-row" id="avatar-upload-row">
          <!-- Hidden real file input, triggered by the styled button -->
          <input type="file" id="avatar-file-input"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;"
            aria-hidden="true"
            tabindex="-1" />
          <button type="button" class="btn btn--outline btn--sm avatar-upload-btn"
            id="avatar-upload-btn"
            aria-label="Upload a custom profile photo (JPEG, PNG or WEBP, max 3 MB)">
            📷 Upload Photo
          </button>
          <span class="avatar-upload-hint" id="avatar-upload-hint">
            JPEG · PNG · WEBP &nbsp;·&nbsp; max 3 MB
          </span>
        </div>

        <!-- Preview — hidden until a photo is selected -->
        <div class="avatar-preview-row" id="avatar-preview-row" hidden>
          <img id="avatar-preview-img"
            src="" alt="Your uploaded profile photo preview"
            class="avatar-preview-img" />
          <div class="avatar-preview-info">
            <span id="avatar-preview-name" class="avatar-preview-filename"></span>
            <button type="button" class="btn btn--ghost btn--sm"
              id="avatar-remove-btn"
              aria-label="Remove uploaded photo and revert to emoji avatar">
              ✕ Remove
            </button>
          </div>
        </div>

        <input type="hidden" id="profile-avatar" value="${esc(hasCustomPhoto ? user.avatar : (user?.avatar||AVATARS[0]))}" />
        ${hasCustomPhoto ? `<p style="font-size:.72rem;color:var(--text-muted);margin-top:4px;">Custom photo active — select an emoji above to switch back.</p>` : ''}
      </div>

      <div class="form-group">
        <label class="form-label">Skills I Can Teach * (max 5)</label>
        <div class="skill-input-area" id="teach-input" role="group" aria-label="Teach skills"></div>
      </div>

      <div class="form-group">
        <label class="form-label">Skills I Want to Learn * (max 5)</label>
        <div class="skill-input-area" id="learn-input" role="group" aria-label="Learn skills"></div>
      </div>

      <div class="form__error" id="profile-error" hidden></div>

      <div class="form__actions" style="display:flex;gap:12px;margin-top:8px;">
        <button type="button" class="btn btn--ghost btn--full" id="cancel-profile">Cancel</button>
        <button type="submit" class="btn btn--primary btn--full" id="profile-submit">
          ${isEdit ? 'Save Changes' : 'Create Profile'}
        </button>
      </div>
    </form>
  `);

  /* ── Init components inside modal ── */
  // API users: each skill add/delete fires immediately against the backend
  // Demo users: skills collected in memory and saved on form submit
  let teachCtrl, learnCtrl;
  if (isApiUser) {
    const teachApiSkills = (user._apiSkills || []).filter(s => s.type === 'teach');
    const learnApiSkills = (user._apiSkills || []).filter(s => s.type === 'learn');
    teachCtrl = makeApiSkillInput('teach-input', 'teach', teachApiSkills, 5);
    learnCtrl = makeApiSkillInput('learn-input', 'learn', learnApiSkills, 5);
  } else {
    teachCtrl = makeSkillInput('teach-input', user?.teachSkills || [], 5);
    learnCtrl = makeSkillInput('learn-input', user?.learnSkills || [], 5);
  }

  /* ── Avatar picker — emoji buttons ── */
  const picker = $('#avatar-picker');
  const hidden = $('#profile-avatar');
  picker?.addEventListener('click', e => {
    const btn = e.target.closest('.avatar-option');
    if (!btn) return;
    $$('.avatar-option', picker).forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    hidden.value = btn.dataset.avatar;
    // Switching to emoji deselects any uploaded custom photo
    _clearPhotoPreview();
  });

  /* ── Avatar upload — custom photo ── */

  // Max raw file size: 3 MB  (base64-encodes to ~4 MB, within backend PostgreSQL TEXT limit)
  const AVATAR_MAX_RAW_BYTES = 3 * 1024 * 1024;
  const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  // If the user currently has a custom photo, show the preview immediately
  if (hasCustomPhoto) {
    _showPhotoPreview(user.avatar, 'Current photo');
  }

  function _clearPhotoPreview() {
    const previewRow = $('#avatar-preview-row');
    const previewImg = $('#avatar-preview-img');
    const fileInput  = $('#avatar-file-input');
    if (previewRow) previewRow.hidden = true;
    if (previewImg) { previewImg.src = ''; }
    if (fileInput)  fileInput.value = '';
    const hint = $('#avatar-upload-hint');
    if (hint) hint.style.color = '';
  }

  function _showPhotoPreview(dataUrl, filename) {
    const previewRow  = $('#avatar-preview-row');
    const previewImg  = $('#avatar-preview-img');
    const previewName = $('#avatar-preview-name');
    if (!previewRow || !previewImg) return;
    previewImg.src         = dataUrl;
    if (previewName) previewName.textContent = filename || '';
    previewRow.hidden      = false;
    // Deselect all emoji options visually
    $$('.avatar-option', picker).forEach(b => b.classList.remove('selected'));
  }

  // Trigger real file input when styled button is clicked
  $('#avatar-upload-btn')?.addEventListener('click', () => {
    $('#avatar-file-input')?.click();
  });
  // Also allow Enter/Space on the button (native button behaviour handles this)

  $('#avatar-file-input')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;

    const hint = $('#avatar-upload-hint');

    // ── Client-side validation ──────────────────────────────────────────
    if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
      if (hint) { hint.textContent = '✕ Only JPEG, PNG, or WEBP images allowed.'; hint.style.color = 'var(--color-error, #ef4444)'; }
      e.target.value = '';
      return;
    }
    if (file.size > AVATAR_MAX_RAW_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      if (hint) { hint.textContent = `✕ File too large (${mb} MB). Max 3 MB.`; hint.style.color = 'var(--color-error, #ef4444)'; }
      e.target.value = '';
      return;
    }
    // Clear any previous error
    if (hint) { hint.textContent = 'JPEG · PNG · WEBP · max 3 MB'; hint.style.color = ''; }

    // ── Read as base64 data URL ─────────────────────────────────────────
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      // Extra safety: re-verify the data URL prefix after reading
      const allowedPrefixes = [
        'data:image/jpeg;base64,',
        'data:image/jpg;base64,',
        'data:image/png;base64,',
        'data:image/webp;base64,',
      ];
      if (!allowedPrefixes.some(p => dataUrl.startsWith(p))) {
        if (hint) { hint.textContent = '✕ Invalid image format.'; hint.style.color = 'var(--color-error, #ef4444)'; }
        return;
      }
      // Store in hidden field — picked up by the submit handler
      hidden.value = dataUrl;
      _showPhotoPreview(dataUrl, file.name);
    };
    reader.onerror = () => {
      if (hint) { hint.textContent = '✕ Could not read file. Please try another.'; hint.style.color = 'var(--color-error, #ef4444)'; }
    };
    reader.readAsDataURL(file);
  });

  // Remove photo — revert to first AVATARS emoji
  $('#avatar-remove-btn')?.addEventListener('click', () => {
    hidden.value = AVATARS[0];
    _clearPhotoPreview();
    // Re-select the first emoji option
    const firstEmoji = picker?.querySelector('.avatar-option');
    if (firstEmoji) {
      $$('.avatar-option', picker).forEach(b => b.classList.remove('selected'));
      firstEmoji.classList.add('selected');
    }
    const hint = $('#avatar-upload-hint');
    if (hint) hint.textContent = 'JPEG · PNG · WEBP · max 3 MB';
  });

  /* ── Cancel ── */
  $('#cancel-profile')?.addEventListener('click', closeModal);

  /* ── Submit ── */
  $('#profile-form')?.addEventListener('submit', async e => {
    e.preventDefault();

    const name      = $('#profile-name')?.value.trim();
    const bio       = $('#profile-bio')?.value.trim() || '';
    const location  = $('#profile-location')?.value.trim() || '';
    const avatar    = $('#profile-avatar')?.value || AVATARS[0];
    const teaches   = teachCtrl.getTags();
    const learns    = learnCtrl.getTags();
    const errEl     = $('#profile-error');
    const submitBtn = $('#profile-submit');

    // Validation
    if (!name)           { showFormError(errEl, 'Please enter your full name.'); $('#profile-name')?.focus(); return; }
    if (name.length < 2) { showFormError(errEl, 'Name must be at least 2 characters.'); return; }
    if (!teaches.length) { showFormError(errEl, 'Add at least one skill to teach.'); return; }
    if (!learns.length)  { showFormError(errEl, 'Add at least one skill to learn.'); return; }

    hideFormError(errEl);

    /* ── Authenticated user: persist profile fields to backend ── */
    if (isApiUser) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';

      try {
        const payload = {};
        if (name     !== user.name)          payload.full_name = name;
        if (bio      !== (user.bio||''))      payload.bio       = bio || null;
        if (location !== (user.location||'')) payload.location  = location || null;
        if (avatar   !== user.avatar)         payload.avatar    = avatar;

        let updatedApiUser = null;
        if (Object.keys(payload).length > 0) {
          updatedApiUser = await apiRequest('/api/v1/users/me', {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
        }

        // Skills are already persisted by makeApiSkillInput — just sync names
        State.currentUser = {
          ...(updatedApiUser ? mapBackendUser(updatedApiUser) : State.currentUser),
          // Preserve the skill state that makeApiSkillInput already synced
          teachSkills: teaches,
          learnSkills: learns,
          _apiSkills:  State.currentUser._apiSkills || [],
        };

        closeModal();
        showToast('Profile updated! ✨', 'success');
        renderHeroAvatars();
        renderMatchCards();
        renderDashboard();
        updateNavButtons();

      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Changes';

        if (err.status === 401) {
          closeModal();
          Auth.clearToken();
          State.currentUser = null;
          renderMatchCards();
          renderDashboard();
          updateNavButtons();
          showToast('Session expired. Please log in again.', 'warning');
          openLoginModal();
        } else if (err.status === 422) {
          const detail = err.data?.detail;
          const msg = Array.isArray(detail)
            ? detail.map(d => d.msg).join(' ')
            : (detail || 'Please check your input.');
          showFormError(errEl, msg);
        } else if (!navigator.onLine || err.message?.includes('fetch')) {
          showFormError(errEl, 'Unable to update your profile. Please try again.');
        } else {
          showFormError(errEl, err.message || 'Something went wrong. Please try again.');
        }
      }

    /* ── Demo / unauthenticated user: save to localStorage ── */
    } else {
      const userData = {
        id:          user?.id || uid(),
        name, bio, location, avatar,
        teachSkills: teaches,
        learnSkills: learns,
        createdAt:   user?.createdAt || new Date().toISOString(),
        updatedAt:   new Date().toISOString(),
        isDemo:      false,
      };
      persistUser(userData);
      closeModal();
      showToast(isEdit ? 'Profile updated! ✨' : 'Welcome to SkillSwap! 🎉', 'success');
      renderHeroAvatars();
      renderMatchCards();
      renderDashboard();
      updateNavButtons();
    }
  });
}

/* ================================================
   HERO AVATARS
   ================================================ */
function renderHeroAvatars() {
  const wrap = $('#hero-avatars');
  if (!wrap) return;
  wrap.innerHTML = State.users.slice(0, 5)
    .map(u => `<span class="hero__avatar-item" aria-hidden="true" title="${esc(u.name)}">${esc(u.avatar)}</span>`)
    .join('');
}

/* ================================================
   MATCH CARDS
   ================================================ */
function skillTagsHTML(skills, type) {
  return skills.map(s =>
    `<span class="skill-tag skill-tag--${type}" title="${esc(s)}">${esc(s)}</span>`
  ).join('');
}

function matchCardHTML(user, score) {
  // For API matches use the backend label directly;
  // for demo users fall back to the frontend getMatchLabel() calculation.
  const info   = user._isApiMatch
    ? (() => {
        const l = user.label || '';
        const color = l === 'Excellent Match' ? '#10b981'
                    : l === 'Good Match'      ? '#6366f1'
                    :                           '#64748b';
        return { label: l, color };
      })()
    : getMatchLabel(score);

  const conn   = connStatus(user.id);
  const status = conn?.status;

  let btn = '';
  if (status === 'accepted') {
    btn = `<button class="btn btn--ghost btn--sm" disabled>✓ Connected</button>`;
  } else if (status === 'pending') {
    // Distinguish: outgoing (I sent it) vs incoming (they sent it).
    // Only the sender gets a Cancel Request button on the match card.
    const isSentByMe = conn && conn.senderId === State.currentUser?.id;
    if (isSentByMe) {
      btn = `<button class="btn btn--ghost btn--sm js-cancel-match"
               data-cid="${esc(conn.id)}"
               aria-label="Cancel connection request to ${esc(user.name)}">
               ⏳ Pending &nbsp;·&nbsp; Cancel
             </button>`;
    } else {
      // I am the receiver — cannot cancel, just show Pending
      btn = `<button class="btn btn--ghost btn--sm" disabled aria-label="Pending request from ${esc(user.name)}">⏳ Pending</button>`;
    }
  } else {
    // status === 'rejected' or null — allow a new Connect attempt
    // NOTE (Phase 2F): sendRequest() routes to the real API for authenticated users.
    btn = `<button class="btn btn--primary btn--sm js-connect" data-uid="${esc(user.id)}"
             aria-label="Connect with ${esc(user.name)}">Connect</button>`;
  }

  // "Why This Match?" — only for real API matches
  const whySection = whyMatchHTML(user);

  return `
  <article class="match-card" role="listitem" aria-label="${esc(user.name)}">
    <div class="match-card__header">
      <div class="match-card__avatar" aria-hidden="true">${renderAvatar(user.avatar, user.name)}</div>
      <div class="match-card__info">
        <div class="match-card__name">${esc(user.name)}</div>
        <div class="match-card__location">${esc(user.location||'Somewhere on Earth')}</div>
      </div>
      <span class="match-card__score" style="color:${info.color}"
            aria-label="${info.label} ${score}%">${score}%</span>
    </div>
    <div class="match-card__skills">
      <div class="match-card__skill-row">
        <span class="match-card__skill-label match-card__skill-label--teach">Teaches</span>
        <div class="skill-tags-wrap">${skillTagsHTML(user.teachSkills.slice(0,3),'teach')}</div>
      </div>
      <div class="match-card__skill-row">
        <span class="match-card__skill-label match-card__skill-label--learn">Learns</span>
        <div class="skill-tags-wrap">${skillTagsHTML(user.learnSkills.slice(0,3),'learn')}</div>
      </div>
    </div>
    ${whySection}
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
      <span style="font-size:.75rem;font-weight:600;padding:2px 10px;border-radius:9999px;
        background:${info.color}22;color:${info.color};border:1px solid ${info.color}44">
        ${info.label}
      </span>
      <div class="match-card__actions">${btn}</div>
    </div>
  </article>`;
}

function getFilteredUsers() {
  let list = [...State.users];
  if (State.currentUser) list = list.filter(u => u.id !== State.currentUser.id);

  if (State.searchQuery) {
    const q = State.searchQuery.toLowerCase();
    list = list.filter(u =>
      u.name.toLowerCase().includes(q) ||
      (u.location||'').toLowerCase().includes(q) ||
      [...u.teachSkills,...u.learnSkills].some(s => s.toLowerCase().includes(q))
    );
  }
  if (State.activeFilter !== 'all') {
    const cats = SKILL_CATEGORIES[State.activeFilter] || [];
    list = list.filter(u =>
      u.category === State.activeFilter ||
      u.teachSkills.some(s => cats.includes(s)) ||
      u.learnSkills.some(s => cats.includes(s))
    );
  }
  return list;
}

/**
 * Filter the cached real API matches (State.realMatches) by the current
 * search query and category filter.  No API request is made.
 *
 * @returns {object[]}  Filtered + sorted (score desc) normalized match objects
 */
function getFilteredRealMatches() {
  let list = [...(State.realMatches || [])];

  if (State.searchQuery) {
    const q = State.searchQuery.toLowerCase();
    list = list.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.location || '').toLowerCase().includes(q) ||
      [...m.teachSkills, ...m.learnSkills].some(s => s.toLowerCase().includes(q))
    );
  }

  if (State.activeFilter !== 'all') {
    const cats = SKILL_CATEGORIES[State.activeFilter] || [];
    list = list.filter(m =>
      m.teachSkills.some(s => cats.map(c => c.toLowerCase()).includes(s.toLowerCase())) ||
      m.learnSkills.some(s => cats.map(c => c.toLowerCase()).includes(s.toLowerCase()))
    );
  }

  // Preserve backend ordering (already sorted by score desc); stable sort keeps it.
  return list;
}

async function renderMatchCards() {
  const grid = $('#matches-grid');
  if (!grid) return;

  // ── AUTHENTICATED API USER PATH ──────────────────────────────────────────
  if (Auth.isAuthenticated() && State.currentUser?.isApiUser) {

    // P1-4: Update the section subtitle to reflect real personalised matches.
    const subtitle = $('.matches-preview__subtitle');
    if (subtitle) subtitle.textContent = 'Personalized matches based on your skills.';

    // If we haven't fetched yet (null = no fetch attempted), go get them.
    if (State.realMatches === null) {
      await fetchRealMatches();
      // fetchRealMatches shows loading state and sets State.realMatches.
      // After it resolves, fall through to render.
    }

    // If still null (error path set by fetchRealMatches), stop — error state already shown.
    if (State.realMatches === null) return;

    const matches = getFilteredRealMatches();

    if (!matches.length) {
      const isFiltered = State.searchQuery || State.activeFilter !== 'all';
      grid.innerHTML = isFiltered
        ? `<div class="empty-state">
             <span class="empty-state__icon">🔍</span>
             <h3 class="empty-state__title">No results found</h3>
             <p class="empty-state__text">Try a different search or filter.</p>
           </div>`
        : `<div class="empty-state">
             <span class="empty-state__icon">✨</span>
             <h3 class="empty-state__title">No strong matches yet</h3>
             <p class="empty-state__text">Add more skills to improve your matches.</p>
           </div>`;
      return;
    }

    grid.innerHTML = matches.map(m => matchCardHTML(m, m.score)).join('');
    grid.onclick = e => {
      const btn = e.target.closest('.js-connect');
      if (btn) sendRequest(btn.dataset.uid);
      const cancelBtn = e.target.closest('.js-cancel-match');
      if (cancelBtn) cancelRequest(cancelBtn.dataset.cid);
    };
    $$('.match-card', grid).forEach((el, i) => {
      el.classList.add('fade-up');
      setTimeout(() => el.classList.add('visible'), 50 + i * 55);
    });
    return;
  }

  // ── DEMO / LOGGED-OUT PATH  (unchanged behavior) ─────────────────────────
  // P1-4: Restore the demo-oriented subtitle when in demo/logged-out mode.
  const subtitle = $('.matches-preview__subtitle');
  if (subtitle) subtitle.textContent = 'Browse demo profiles — create your own to see personalized matches.';

  const users = getFilteredUsers();
  if (!users.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__icon">🔍</span>
        <h3 class="empty-state__title">No results found</h3>
        <p class="empty-state__text">Try a different search or filter.</p>
      </div>`;
    return;
  }

  const scored = State.currentUser
    ? users.map(u => ({ ...u, score: calcScore(State.currentUser, u) })).sort((a,b) => b.score - a.score)
    : users.map(u => ({ ...u, score: 0 }));

  grid.innerHTML = scored.map(u => matchCardHTML(u, u.score)).join('');

  // Use event delegation on grid — rebinds correctly on every render
  grid.onclick = e => {
    const btn = e.target.closest('.js-connect');
    if (btn) sendRequest(btn.dataset.uid);
  };

  // Stagger fade-in
  $$('.match-card', grid).forEach((el, i) => {
    el.classList.add('fade-up');
    setTimeout(() => el.classList.add('visible'), 50 + i * 55);
  });
}

/* ================================================
   SEARCH & FILTER
   ================================================ */
function initSearchAndFilter() {
  const section = $('#matches');
  if (!section || $('#search-bar')) return;

  section.querySelector('.matches-preview__header')
    ?.insertAdjacentHTML('afterend', `
    <div class="search-filter-bar" role="search" aria-label="Search and filter">
      <div class="search-wrap">
        <span class="search-icon" aria-hidden="true">🔍</span>
        <input id="search-bar" type="search" class="form-input search-input"
          placeholder="Search name, skill, location…" autocomplete="off"
          aria-label="Search users" />
      </div>
      <div class="filter-pills" role="group" aria-label="Filter by category">
        <button class="filter-pill active" data-filter="all"         aria-pressed="true">All</button>
        <button class="filter-pill"        data-filter="Technology"  aria-pressed="false">💻 Tech</button>
        <button class="filter-pill"        data-filter="Design"      aria-pressed="false">🎨 Design</button>
        <button class="filter-pill"        data-filter="Music"       aria-pressed="false">🎸 Music</button>
        <button class="filter-pill"        data-filter="Language"    aria-pressed="false">🌍 Language</button>
        <button class="filter-pill"        data-filter="Business"    aria-pressed="false">💼 Business</button>
      </div>
    </div>
  `);

  // Inject search/filter styles once
  if (!$('#ss-sf-styles')) {
    const s = document.createElement('style');
    s.id = 'ss-sf-styles';
    s.textContent = `
      .search-filter-bar{display:flex;flex-direction:column;gap:12px;}
      .search-wrap{position:relative;display:flex;align-items:center;}
      .search-icon{position:absolute;left:14px;font-size:1rem;pointer-events:none;}
      .search-input{padding-left:42px!important;}
      .filter-pills{display:flex;flex-wrap:wrap;gap:8px;}
      .filter-pill{padding:5px 16px;border-radius:9999px;font-size:.8125rem;font-weight:600;
        cursor:pointer;background:rgba(255,255,255,.04);border:1.5px solid rgba(255,255,255,.08);
        color:var(--text-secondary);transition:all .2s;font-family:inherit;}
      .filter-pill:hover{background:rgba(99,102,241,.1);border-color:rgba(99,102,241,.3);color:var(--text-primary);}
      .filter-pill.active{background:rgba(99,102,241,.15);border-color:rgba(99,102,241,.4);
        color:var(--color-primary-light);box-shadow:0 0 12px rgba(99,102,241,.15);}
      .skill-tags-wrap{display:flex;flex-wrap:wrap;gap:4px;}
    `;
    document.head.appendChild(s);
  }

  // Search debounce
  let _debounce;
  $('#search-bar')?.addEventListener('input', e => {
    clearTimeout(_debounce);
    _debounce = setTimeout(() => {
      State.searchQuery = e.target.value.trim();
      renderMatchCards();
    }, 280);
  });

  // Filter pills — event delegation
  $('.filter-pills')?.addEventListener('click', e => {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;
    $$('.filter-pill').forEach(p => { p.classList.remove('active'); p.setAttribute('aria-pressed','false'); });
    pill.classList.add('active');
    pill.setAttribute('aria-pressed','true');
    State.activeFilter = pill.dataset.filter;
    renderMatchCards();
  });
}

/* ================================================
   DASHBOARD
   ================================================ */
function renderDashboard() {
  const wrap = $('#dashboard-content');
  if (!wrap) return;

  if (!State.currentUser) {
    wrap.innerHTML = `
      <div class="empty-state" style="width:100%">
        <span class="empty-state__icon">👤</span>
        <h3 class="empty-state__title">No profile yet</h3>
        <p class="empty-state__text">Create your profile to unlock the dashboard.</p>
        <button class="btn btn--primary js-open-profile" aria-label="Create profile">Create Profile</button>
      </div>`;
    wrap.querySelector('.js-open-profile')?.addEventListener('click', openProfileModal);
    return;
  }

  const user     = State.currentUser;
  const dash     = State.dashboardData;  // Phase 2G: primary data source for API users

  // ── Phase 2G: for API users, source top_matches from dashboard data ──────
  // This fixes the "No matches yet" blank state on fresh login before the
  // full Matches section has been visited.  normalizeMatch() is already defined.
  const matches = (user.isApiUser && dash)
    ? (dash.top_matches || []).map(normalizeMatch).slice(0, 6)
    : getMatches(user).slice(0, 6);

  // Phase 2F: for authenticated API users, use real connection data.
  // For demo users, continue using State.connections (localStorage).
  const myConns  = (user.isApiUser && State.realConnections !== null)
    ? State.realConnections.filter(c => c.status !== 'rejected')
    : State.connections.filter(c => c.fromId === user.id || c.toId === user.id);

  // Incoming pending: current user is the receiver
  const incoming = user.isApiUser
    ? myConns.filter(c => c.receiverId === user.id && c.status === 'pending')
    : myConns.filter(c => c.status === 'pending' && c.toId === user.id);

  // Outgoing pending: current user is the sender
  const sent = user.isApiUser
    ? myConns.filter(c => c.senderId === user.id && c.status === 'pending')
    : myConns.filter(c => c.status === 'pending' && c.fromId === user.id);

  // Accepted connections
  const accepted = myConns.filter(c => c.status === 'accepted');

  // ── Phase 2G: stats from backend for API users ───────────────────────────
  // Falls back to client-side counts for demo users.
  const statMatches  = (user.isApiUser && dash?.stats)
    ? dash.stats.total_matches
    : matches.length;
  const statConnected = (user.isApiUser && dash?.stats)
    ? dash.stats.total_connections
    : accepted.length;
  const statRequests  = (user.isApiUser && dash?.stats)
    ? (dash.stats.pending_received + dash.stats.pending_sent)
    : (sent.length + incoming.length);

  /* ── Connection item HTML ── */
  function connItem(conn) {
    // For API connections use embedded sender/receiver objects.
    // For demo connections look up the other user in State.users.
    let other, isIncoming;

    if (user.isApiUser) {
      // Determine who the "other" participant is by checking role, not status.
      // conn.sender is always the original requester; conn.receiver is always
      // the one who was asked. The current user could be on either side.
      const otherUser = conn.senderId === user.id ? conn.receiver : conn.sender;
      // isIncoming is only used to decide whether to show Accept/Decline buttons,
      // so the pending-status guard belongs only here.
      isIncoming = conn.receiverId === user.id && conn.status === 'pending';
      other = {
        id:          otherUser.id,
        name:        otherUser.full_name,
        avatar:      otherUser.avatar || AVATARS[0],
        teachSkills: [],   // not available in UserPublic — omit gracefully
      };
    } else {
      const otherId = conn.fromId === user.id ? conn.toId : conn.fromId;
      const found   = State.users.find(u => u.id === otherId);
      if (!found) return '';
      isIncoming = conn.toId === user.id && conn.status === 'pending';
      other = found;
    }

    if (!other) return '';

    // isOutgoingPending: current user sent this request and it is still pending.
    // Only the sender sees "Cancel Request"; the receiver always sees Accept/Decline.
    const isOutgoingPending = conn.status === 'pending' && !isIncoming;

    return `
      <div class="connection-item fade-up visible" role="listitem">
        <div class="connection-item__avatar" aria-hidden="true">${renderAvatar(other.avatar, other.name)}</div>
        <div class="connection-item__info">
          <div class="connection-item__name">${esc(other.name)}</div>
          ${other.teachSkills?.length
            ? `<div class="connection-item__skill">${esc(other.teachSkills.slice(0,2).join(', '))}</div>`
            : ''}
        </div>
        ${isIncoming
          ? `<div style="display:flex;gap:6px;">
               <button class="btn btn--primary btn--sm js-accept" data-cid="${esc(conn.id)}"
                 aria-label="Accept connection from ${esc(other.name)}">Accept</button>
               <button class="btn btn--ghost btn--sm js-reject" data-cid="${esc(conn.id)}"
                 aria-label="Decline connection from ${esc(other.name)}">Decline</button>
             </div>`
          : conn.status === 'accepted'
            ? `<div style="display:flex;gap:6px;align-items:center;">
                 <span class="connection-item__status connection-item__status--accepted">✓ Connected</span>
                 ${user.isApiUser
                   ? `<button class="btn btn--primary btn--sm js-open-chat"
                        data-uid="${esc(other.id)}"
                        data-name="${esc(other.name)}"
                        data-avatar="${esc(other.avatar)}"
                        aria-label="Message ${esc(other.name)}">💬 Message</button>`
                   : ''}
               </div>`
          : isOutgoingPending
            ? `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                 <span class="connection-item__status connection-item__status--pending"
                       aria-label="Request pending for ${esc(other.name)}">⏳ Pending</span>
                 <button class="btn btn--ghost btn--sm js-cancel"
                         data-cid="${esc(conn.id)}"
                         aria-label="Cancel connection request to ${esc(other.name)}">
                   Cancel Request
                 </button>
               </div>`
            : `<span class="connection-item__status connection-item__status--${conn.status}">
                 ⏳ Pending</span>`
        }
      </div>`;
  }

  const tabMatches = matches.slice(0,6).map(m => `
    <div class="connection-item fade-up visible" role="listitem">
      <div class="connection-item__avatar" aria-hidden="true">${renderAvatar(m.avatar, m.name)}</div>
      <div class="connection-item__info">
        <div class="connection-item__name">${esc(m.name)}</div>
        <div class="connection-item__skill">${esc(m.teachSkills.slice(0,2).join(', '))}</div>
      </div>
      <span class="match-card__score" style="font-size:.75rem;padding:2px 10px;">${m.score}%</span>
    </div>`).join('') ||
    `<div class="empty-state"><span class="empty-state__icon">✨</span>
     <p class="empty-state__text">No matches yet. Add more skills!</p></div>`;

  const pendingAll = [...incoming,...sent];
  const tabPending = pendingAll.map(connItem).join('') ||
    `<div class="empty-state"><span class="empty-state__icon">📭</span>
     <p class="empty-state__text">No pending requests.</p></div>`;

  const tabConnected = accepted.map(connItem).join('') ||
    `<div class="empty-state"><span class="empty-state__icon">🤝</span>
     <p class="empty-state__text">No connections yet.</p></div>`;

  const tabData = { matches: tabMatches, pending: tabPending, connections: tabConnected };

  wrap.innerHTML = `
    <div class="dashboard-inner">
      <!-- Profile panel -->
      <div class="profile-panel" role="region" aria-label="Your profile">
        <div class="profile-panel__avatar" aria-hidden="true">${renderAvatar(user.avatar, user.name)}</div>
        <div class="profile-panel__name">${esc(user.name)}</div>
        ${user.location?`<div style="font-size:.8rem;color:var(--text-muted)">📍 ${esc(user.location)}</div>`:''}
        <p class="profile-panel__bio">${esc(user.bio)}</p>
        <div class="profile-panel__stats">
          <div class="profile-stat"><span class="profile-stat__num">${statMatches}</span><span class="profile-stat__label">Matches</span></div>
          <div class="profile-stat"><span class="profile-stat__num">${statConnected}</span><span class="profile-stat__label">Connected</span></div>
          <div class="profile-stat"><span class="profile-stat__num">${statRequests}</span><span class="profile-stat__label">Requests</span></div>
        </div>
        <div style="width:100%;display:flex;flex-direction:column;gap:8px;">
          <div>
            <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--color-primary-light);margin-bottom:5px;">Teaches</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">
              ${user.teachSkills.length
                ? skillTagsHTML(user.teachSkills, 'teach')
                : `<span style="font-size:.75rem;color:var(--text-muted);font-style:italic;">No skills added yet — edit your profile.</span>`}
            </div>
          </div>
          <div>
            <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--color-accent);margin-bottom:5px;">Learning</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">
              ${user.learnSkills.length
                ? skillTagsHTML(user.learnSkills, 'learn')
                : `<span style="font-size:.75rem;color:var(--text-muted);font-style:italic;">No skills added yet — edit your profile.</span>`}
            </div>
          </div>
        </div>
        <button class="btn btn--outline btn--full js-edit-profile" aria-label="Edit profile">✏️ Edit Profile</button>
      </div>

      <!-- Main panel -->
      <div class="dashboard-main" role="region" aria-label="Activity">
        <div class="dashboard-tabs" role="tablist">
          <button class="dashboard-tab active" role="tab" aria-selected="true"  data-tab="matches">My Matches</button>
          <button class="dashboard-tab"         role="tab" aria-selected="false" data-tab="pending">
            Requests${pendingAll.length?`<span style="background:var(--color-primary);color:#fff;border-radius:9999px;padding:1px 7px;font-size:.68rem;margin-left:4px;">${pendingAll.length}</span>`:''}
          </button>
          <button class="dashboard-tab"         role="tab" aria-selected="false" data-tab="connections">Connected</button>
        </div>
        <div class="dashboard-connections" id="dash-tab-panel" role="tabpanel" aria-live="polite">
          ${tabMatches}
        </div>
      </div>
    </div>`;

  // Edit profile
  wrap.querySelector('.js-edit-profile')?.addEventListener('click', openProfileModal);

  // Tabs — event delegation
  wrap.querySelector('.dashboard-tabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.dashboard-tab');
    if (!tab) return;
    $$('.dashboard-tab', wrap).forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
    tab.classList.add('active');
    tab.setAttribute('aria-selected','true');
    const panel = $('#dash-tab-panel');
    if (panel) panel.innerHTML = tabData[tab.dataset.tab] || '';
    bindAcceptButtons(wrap);
  });

  bindAcceptButtons(wrap);
}

function bindAcceptButtons(ctx) {
  $$(`.js-accept`, ctx).forEach(btn => {
    btn.addEventListener('click', () => acceptRequest(btn.dataset.cid));
  });
  $$(`.js-reject`, ctx).forEach(btn => {
    btn.addEventListener('click', () => rejectRequest(btn.dataset.cid));
  });
  // Feature 1: bind Cancel Request buttons on outgoing pending connections
  $$(`.js-cancel`, ctx).forEach(btn => {
    btn.addEventListener('click', () => cancelRequest(btn.dataset.cid));
  });
  // Phase 3: bind Message buttons on accepted connections
  $$(`.js-open-chat`, ctx).forEach(btn => {
    btn.addEventListener('click', () => {
      openChatModal({
        id:     Number(btn.dataset.uid),
        name:   btn.dataset.name,
        avatar: btn.dataset.avatar,
      });
    });
  });
}

/* ================================================
   NAV BUTTON STATE
   ================================================ */
function updateNavButtons() {
  const btnLogin = $('#btn-login');
  const btnStart = $('#btn-get-started');
  const mobileBtn = $('#btn-mobile-get-started');

  if (State.currentUser) {
    const first  = State.currentUser.name.split(' ')[0];
    const avatarRaw = State.currentUser.avatar || '👤';
    // For custom photos (data URLs) show a 📷 icon in the nav button instead
    // of trying to embed the data URL in textContent (which doesn't render HTML).
    const avatarNav = avatarRaw.startsWith('data:') ? '📷' : avatarRaw;

    // Desktop: avatar + name shows profile; "Log Out" replaces "Get Started"
    if (btnLogin) {
      btnLogin.textContent = `${avatarNav} ${first}`;
      btnLogin.onclick = Auth.isAuthenticated()
        ? () => openProfileModal()
        : () => openLoginModal();
    }
    if (btnStart) {
      btnStart.textContent = 'Log Out';
      btnStart.onclick = logoutUser;
    }
    if (mobileBtn) {
      mobileBtn.textContent = 'My Dashboard';
      mobileBtn.onclick = () => {
        $('#mobile-menu').hidden = true;
        $('#hamburger').setAttribute('aria-expanded', 'false');
        $('#dashboard')?.scrollIntoView({ behavior: 'smooth' });
      };
    }
  } else {
    if (btnLogin) {
      btnLogin.textContent = 'Log In';
      btnLogin.onclick = Auth.isAuthenticated() ? openProfileModal : openLoginModal;
    }
    if (btnStart) {
      btnStart.textContent = 'Get Started';
      btnStart.onclick = openRegisterModal;
    }
    if (mobileBtn) {
      mobileBtn.textContent = 'Get Started';
      mobileBtn.onclick = () => {
        $('#mobile-menu').hidden = true;
        $('#hamburger').setAttribute('aria-expanded', 'false');
        openRegisterModal();
      };
    }
  }
}

/* ================================================
   AVATAR / DYNAMIC STYLES  (injected once)
   ================================================ */
function injectDynamicStyles() {
  if ($('#ss-dyn-styles')) return;
  const s = document.createElement('style');
  s.id = 'ss-dyn-styles';
  s.textContent = `
    .avatar-picker{display:flex;flex-wrap:wrap;gap:8px;}
    .avatar-option{width:48px;height:48px;border-radius:12px;font-size:1.55rem;
      background:rgba(255,255,255,.04);border:2px solid rgba(255,255,255,.08);cursor:pointer;
      transition:border-color .2s,transform .2s,background .2s;display:flex;align-items:center;justify-content:center;}
    .avatar-option:hover{border-color:rgba(99,102,241,.5);background:rgba(99,102,241,.1);transform:scale(1.08);}
    .avatar-option.selected{border-color:#6366f1;background:rgba(99,102,241,.2);box-shadow:0 0 16px rgba(99,102,241,.3);}
    @keyframes slide-out-right{to{opacity:0;transform:translateX(32px);}}
  `;
  document.head.appendChild(s);
}

/* ================================================
   PAGE LOADER
   ================================================ */
function showLoader() {
  if ($('#page-loader')) return;
  document.body.insertAdjacentHTML('afterbegin', `
    <div class="page-loader" id="page-loader" role="status" aria-label="Loading">
      <div class="page-loader__logo">SkillSwap</div>
      <div class="page-loader__bar"><div class="page-loader__bar-fill"></div></div>
    </div>`);
}
function hideLoader() {
  const el = $('#page-loader');
  if (!el) return;
  el.classList.add('hidden');
  setTimeout(() => el.remove(), 520);
}

/* ================================================
   INIT CTA BUTTONS  (once)
   ================================================ */
let _ctaReady = false;
function initCTA() {
  const heroStart   = $('#btn-hero-start');
  const heroExplore = $('#btn-hero-explore');
  const seeAll      = $('#btn-see-all-matches');

  if (heroStart)   heroStart.onclick   = () => State.currentUser
    ? $('#matches')?.scrollIntoView({ behavior:'smooth' })
    : openRegisterModal();
  if (heroExplore) heroExplore.onclick = () => $('#explore')?.scrollIntoView({ behavior:'smooth' });
  if (seeAll)      seeAll.onclick      = () => {
    if (!State.currentUser) {
      showToast('Create an account to see matches!', 'info');
      openRegisterModal();
    } else {
      // Phase 2G: for API users scroll to the real Matches section.
      // Never call getMatches() (localStorage calcScore) for authenticated users.
      $('#matches')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (!_ctaReady) {
    _ctaReady = true;
    // P1-3: Feature-card buttons behave differently depending on auth state.
    // Authenticated users are guided to their profile/matches instead of Register.
    document.addEventListener('click', e => {
      const btn = e.target.closest('.feature-card__btn');
      if (!btn) return;
      if (State.currentUser) {
        const label = btn.textContent.trim();
        if (label.startsWith('Find My Match')) {
          // Scroll to the real Matches section
          $('#matches')?.scrollIntoView({ behavior: 'smooth' });
        } else {
          // "Start Teaching" and "Start Learning" → open profile editor
          openProfileModal();
        }
      } else {
        openRegisterModal();
      }
    });
  }
}

/* ================================================
   BOOT
   ================================================ */
async function boot() {
  showLoader();
  await wait(700);
  try {
    injectDynamicStyles();
    const apiOnline = await checkBackendHealth();

    // ── Session restoration ───────────────────────────────────────────────
    // Try to restore a real authenticated session before falling back to demo.
    await restoreSession(apiOnline);

    if (!apiOnline) showToast('Running in demo mode — API unavailable', 'info', 4000);

    // ── Demo data (only used when no real user is logged in) ──────────────
    seedDemoUsers();
    loadAll();

    // If session restore found a real user, it takes priority over
    // any stale demo localStorage profile.
    // (restoreSession sets State.currentUser from the API response)

    initModal();
    initNavigation();
    initSearchAndFilter();
    renderHeroAvatars();
    renderMatchCards();
    renderDashboard();
    updateNavButtons();
    initCTA();
    setTimeout(initScrollAnimations, 120);

    if (State.currentUser && Auth.isAuthenticated()) {
      showToast(`Welcome back, ${State.currentUser.name.split(' ')[0]}! 👋`, 'success');
    }
  } catch (err) {
    console.error('[SkillSwap]', err);
    showToast('Something went wrong. Please refresh.', 'error');
  } finally {
    hideLoader();
  }
}

document.addEventListener('DOMContentLoaded', boot);

/* ================================================
   PHASE 3 — CHAT / MESSAGING
   ================================================ */

/* ── Constants ─────────────────────────────────── */
const CHAT_MAX_LEN        = 2000;
const CHAT_MAX_RECONNECTS = 3;
const CHAT_PAGE_SIZE      = 50;

/* ── WS URL builder (token in query-param per WS spec) ── */
const WS_BASE_URL = 'wss://skillswap-rvm9.onrender.com';
function chatWsUrl() {
  return `${WS_BASE_URL}/api/v1/ws/chat?token=${encodeURIComponent(Auth.getToken() || '')}`;
}

/* ── State helpers ──────────────────────────────── */

/**
 * Reset all chat sub-state to defaults.
 * Does NOT close an active WebSocket — call chatWsClose() first if needed.
 */
function chatResetState() {
  const c = State.chat;
  c.otherUser         = null;
  c.messages          = [];
  c.wsStatus          = 'disconnected';
  c.reconnectAttempts = 0;
  c.hasMore           = false;
  c.oldestMsgId       = null;
  c.isSending         = false;
  c.isOpen            = false;
  if (c.reconnectTimer) { clearTimeout(c.reconnectTimer); c.reconnectTimer = null; }
  // ws reference is cleared by chatWsClose
}

/* ── Format a UTC ISO timestamp for display ───── */
function chatFormatTime(isoStr) {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

/* ================================================
   REST API helpers
   ================================================ */

/**
 * GET /api/v1/messages/conversation/{id}?limit=N[&before_id=M]
 * Returns { messages: MessageOut[], has_more: bool }
 */
async function chatApiFetchHistory(otherUserId, limit = CHAT_PAGE_SIZE, beforeId = null) {
  let url = `/api/v1/messages/conversation/${otherUserId}?limit=${limit}`;
  if (beforeId) url += `&before_id=${beforeId}`;
  return apiRequest(url);
}

/**
 * POST /api/v1/messages/send
 * REST fallback when WebSocket is unavailable.
 * Returns MessageOut.
 */
async function chatApiSend(receiverId, content) {
  return apiRequest('/api/v1/messages/send', {
    method: 'POST',
    body: JSON.stringify({ receiver_id: receiverId, content }),
  });
}

/**
 * POST /api/v1/messages/mark-read/{id}
 * Fire-and-forget; errors are silently swallowed.
 */
async function chatApiMarkRead(otherUserId) {
  try {
    await apiRequest(`/api/v1/messages/mark-read/${otherUserId}`, { method: 'POST' });
  } catch { /* non-critical */ }
}

/* ================================================
   WebSocket manager
   ================================================ */

/** Close the active WebSocket (if any) without triggering a reconnect. */
function chatWsClose() {
  const c = State.chat;
  if (c.reconnectTimer) { clearTimeout(c.reconnectTimer); c.reconnectTimer = null; }
  if (c.ws) {
    // Remove handlers so onclose doesn't trigger the reconnect path
    c.ws.onclose   = null;
    c.ws.onerror   = null;
    c.ws.onmessage = null;
    try { c.ws.close(1000, 'chat closed'); } catch { /* already closed */ }
    c.ws = null;
  }
  c.wsStatus = 'disconnected';
  chatUpdateWsStatusBadge();
}

/** Open a WebSocket for the current chat session. */
function chatWsConnect() {
  const c = State.chat;
  if (!Auth.isAuthenticated() || !c.isOpen) return;

  // Don't open a second socket if one is already connecting/connected
  if (c.ws && (c.ws.readyState === WebSocket.OPEN || c.ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  c.wsStatus = 'connecting';
  chatUpdateWsStatusBadge();

  let ws;
  try {
    ws = new WebSocket(chatWsUrl());
  } catch {
    c.wsStatus = 'error';
    chatUpdateWsStatusBadge();
    return;
  }
  c.ws = ws;

  ws.onopen = () => {
    // 'connected' confirmation frame is sent by the server; wait for it
  };

  ws.onmessage = (event) => {
    let frame;
    try { frame = JSON.parse(event.data); }
    catch { return; }

    switch (frame.type) {
      case 'connected':
        c.wsStatus          = 'connected';
        c.reconnectAttempts = 0;
        chatUpdateWsStatusBadge();
        break;

      case 'ping':
        // Reply with pong so the server knows we're alive
        try { ws.send(JSON.stringify({ type: 'pong' })); } catch { /* ignore */ }
        break;

      case 'new_message': {
        const msg = frame.message;
        if (!msg) break;
        // Guard: only add if this message belongs to the open conversation
        const myId    = State.currentUser?.id;
        const otherId = c.otherUser?.id;
        const belongs = (msg.sender_id === myId   && msg.receiver_id === otherId) ||
                        (msg.sender_id === otherId && msg.receiver_id === myId);
        if (!belongs) break;
        // Dedup: don't add a message we already have in state
        if (!c.messages.some(m => m.id === msg.id)) {
          c.messages.unshift(msg);  // prepend — list is newest-first
          chatAppendBubble(msg, true);
          chatScrollToBottom();
        }
        break;
      }

      case 'error':
        chatHandleWsError(frame);
        break;

      case 'message_deleted': {
        // Received when another user deletes a message for everyone,
        // OR as a confirmation echo when WE delete via the WebSocket path.
        const msgId = frame.message_id;
        const mode  = frame.mode;
        if (!msgId) break;

        if (mode === 'for_everyone') {
          // Mark the message as deleted-for-everyone in local state
          const stateMsg = c.messages.find(m => m.id === msgId);
          if (stateMsg) {
            stateMsg.deleted_for_everyone = true;
            stateMsg.content = null;
          }
          // Update the DOM bubble in-place
          chatApplyDeletedPlaceholder(msgId);
        } else if (mode === 'for_me') {
          // Remove the bubble from the DOM and state (only this user sees this)
          c.messages = c.messages.filter(m => m.id !== msgId);
          chatRemoveBubble(msgId);
        }
        break;
      }

      default:
        break;
    }
  };

  ws.onclose = (event) => {
    c.ws = null;
    if (!c.isOpen) return;            // modal was closed — don't reconnect
    if (event.code === 4001) {        // server rejected auth — don't retry
      c.wsStatus = 'error';
      chatUpdateWsStatusBadge();
      return;
    }
    // Unexpected close — attempt reconnect with exponential back-off
    chatScheduleReconnect();
  };

  ws.onerror = () => {
    c.wsStatus = 'error';
    chatUpdateWsStatusBadge();
    // onclose fires after onerror; reconnect logic lives there
  };
}

/** Handle structured error frames from the server. */
function chatHandleWsError(frame) {
  const code   = frame.code   || 'UNKNOWN';
  const detail = frame.detail || 'An error occurred.';

  if (code === 'AUTH_FAILED') {
    handleAuthExpiry();
    return;
  }
  if (code === 'NOT_CONNECTED') {
    showToast('You are no longer connected to this user.', 'error');
    chatSetSendingState(false);
    return;
  }
  if (code === 'MESSAGE_TOO_LONG') {
    showToast('Message is too long (max 2000 characters).', 'error');
    chatSetSendingState(false);
    return;
  }
  if (code === 'EMPTY_MESSAGE' || code === 'INVALID_FIELD' || code === 'MISSING_FIELD') {
    showToast(detail, 'error');
    chatSetSendingState(false);
    return;
  }
  if (code === 'SEND_FAILED') {
    showToast('Message could not be sent. Please try again.', 'error');
    chatSetSendingState(false);
    return;
  }
  // Generic fallback
  showToast(detail, 'error');
  chatSetSendingState(false);
}

/** Schedule a reconnect attempt using exponential back-off. */
function chatScheduleReconnect() {
  const c = State.chat;
  if (!c.isOpen) return;
  if (c.reconnectAttempts >= CHAT_MAX_RECONNECTS) {
    c.wsStatus = 'disconnected';
    chatUpdateWsStatusBadge();
    showToast('Chat connection lost. Please close and reopen the chat.', 'warning');
    return;
  }
  c.wsStatus = 'connecting';
  chatUpdateWsStatusBadge();
  const delayMs = Math.min(1000 * Math.pow(2, c.reconnectAttempts), 8000);
  c.reconnectAttempts++;
  c.reconnectTimer = setTimeout(() => {
    c.reconnectTimer = null;
    if (c.isOpen) chatWsConnect();
  }, delayMs);
}

/* ================================================
   Modal open / close
   ================================================ */

/**
 * Open the chat modal for the given other user.
 * @param {{ id: number, name: string, avatar: string }} otherUser
 */
async function openChatModal(otherUser) {
  if (!Auth.isAuthenticated() || !State.currentUser?.isApiUser) {
    showToast('Please log in to use messaging.', 'warning');
    return;
  }

  // If a different chat is already open, close it first
  if (State.chat.isOpen) chatClose();

  // Populate state
  State.chat.otherUser = otherUser;
  State.chat.isOpen    = true;

  // Render the modal shell immediately
  openModal(chatModalHTML(otherUser));

  // Focus chat after render
  requestAnimationFrame(() => $('#chat-input')?.focus());

  // Load history, mark read, then connect WS — in order
  chatRenderLoadingState();
  try {
    const data = await chatApiFetchHistory(otherUser.id, CHAT_PAGE_SIZE);
    State.chat.messages    = data.messages || [];
    State.chat.hasMore     = data.has_more;
    State.chat.oldestMsgId = State.chat.messages.length
      ? State.chat.messages[State.chat.messages.length - 1].id
      : null;

    chatRenderHistory();
    chatScrollToBottom();
    chatUpdateLoadMoreBtn();

    // Mark received messages as read (fire-and-forget)
    chatApiMarkRead(otherUser.id);
  } catch (err) {
    if (err?.status === 401) { handleAuthExpiry(); return; }
    if (err?.status === 403) {
      chatRenderErrorState('You are not connected to this user.');
      return;
    }
    chatRenderErrorState('Could not load messages. Please try again.');
    return;
  }

  // Connect WebSocket for real-time delivery
  chatWsConnect();
}

/** Tear down the chat session (called by closeModal + logoutUser). */
function chatClose() {
  chatWsClose();
  chatCloseMenu();
  document.removeEventListener('click', _chatOutsideClickHandler, true);
  State.chat.isOpen = false;
  // Preserve otherUser/messages for potential re-open this session
}

/* ================================================
   Modal HTML builder
   ================================================ */
function chatModalHTML(otherUser) {
  return `
    <div class="chat-modal" id="chat-modal-inner" role="dialog" aria-label="Chat with ${esc(otherUser.name)}">
      <!-- Header -->
      <div class="chat-modal__header">
        <div class="chat-modal__avatar" aria-hidden="true">${renderAvatar(otherUser.avatar, otherUser.name)}</div>
        <div class="chat-modal__user-info">
          <div class="chat-modal__user-name">${esc(otherUser.name)}</div>
          <div class="chat-modal__ws-badge chat-modal__ws-badge--connecting" id="chat-ws-badge"
               role="status" aria-live="polite">Connecting…</div>
        </div>
      </div>

      <!-- Load-earlier button -->
      <button class="chat-modal__load-more" id="chat-load-more"
              aria-label="Load earlier messages" hidden>
        ↑ Load earlier messages
      </button>

      <!-- Message list -->
      <div class="chat-modal__messages" id="chat-messages"
           role="log" aria-label="Conversation with ${esc(otherUser.name)}"
           aria-live="polite" aria-relevant="additions">
        <!-- bubbles injected by JS -->
      </div>

      <!-- Input row -->
      <form class="chat-modal__input-row" id="chat-input-form" novalidate
            aria-label="Send a message">
        <textarea
          class="chat-modal__textarea"
          id="chat-input"
          placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
          rows="1"
          maxlength="${CHAT_MAX_LEN}"
          aria-label="Message input"
          autocomplete="off"
        ></textarea>
        <button type="submit" class="btn btn--primary chat-modal__send-btn" id="chat-send-btn"
                aria-label="Send message">Send</button>
      </form>
    </div>`;
}

/* ================================================
   Rendering helpers
   ================================================ */

function chatRenderLoadingState() {
  const el = $('#chat-messages');
  if (!el) return;
  el.innerHTML = `
    <div class="chat-state chat-state--loading" role="status" aria-live="polite">
      <div class="chat-spinner" aria-hidden="true"></div>
      <p>Loading messages…</p>
    </div>`;
}

function chatRenderEmptyState() {
  const el = $('#chat-messages');
  if (!el) return;
  el.innerHTML = `
    <div class="chat-state chat-state--empty" aria-live="polite">
      <span class="chat-state__icon" aria-hidden="true">💬</span>
      <p>No messages yet. Say hello!</p>
    </div>`;
}

function chatRenderErrorState(msg) {
  const el = $('#chat-messages');
  if (!el) return;
  el.innerHTML = `
    <div class="chat-state chat-state--error" role="alert">
      <span class="chat-state__icon" aria-hidden="true">⚠️</span>
      <p>${esc(msg)}</p>
    </div>`;
}

/**
 * Render the full current State.chat.messages list into #chat-messages.
 * Messages are stored newest-first; we render oldest-first for display.
 */
function chatRenderHistory() {
  const el = $('#chat-messages');
  if (!el) return;
  const msgs = [...State.chat.messages].reverse(); // oldest first
  if (!msgs.length) {
    chatRenderEmptyState();
    return;
  }
  el.innerHTML = msgs.map(m => chatBubbleHTML(m)).join('');
}

/**
 * Append a single new message bubble at the bottom of #chat-messages
 * without re-rendering the whole list.
 * @param {object} msg  MessageOut
 * @param {boolean} animate  whether to add fade-in class
 */
function chatAppendBubble(msg, animate = false) {
  const el = $('#chat-messages');
  if (!el) return;

  // If only the empty-state placeholder is showing, clear it first
  const placeholder = el.querySelector('.chat-state');
  if (placeholder) el.innerHTML = '';

  const div = document.createElement('div');
  div.innerHTML = chatBubbleHTML(msg);
  const bubble = div.firstElementChild;
  if (animate) bubble.classList.add('chat-bubble--new');
  el.appendChild(bubble);
}

/**
 * Build HTML for a single message bubble.
 * Uses esc() on all user-generated content.
 *
 * The ⋮ menu button is rendered INSIDE the bubble at the top-right corner
 * for sent messages and top-left for received.  This avoids negative offsets
 * that would place the button outside the bubble's clipping box — which was
 * the root cause of the "disappears when mouse moves toward it" bug.
 *
 * Visibility is controlled by CSS:
 *   - Shown on .chat-bubble:hover
 *   - Pinned visible while menu is open via .chat-bubble[data-menu-open]
 *     (set by chatOpenMenu / cleared by chatCloseMenu)
 */
function chatBubbleHTML(msg) {
  const myId   = State.currentUser?.id;
  const isSent = msg.sender_id === myId;
  const side   = isSent ? 'sent' : 'received';
  const time   = chatFormatTime(msg.created_at);
  const label  = isSent ? 'You' : esc(State.chat.otherUser?.name || 'Them');

  // ── Deleted-for-everyone placeholder ──────────────────────────────────────
  if (msg.deleted_for_everyone) {
    return `
    <div class="chat-bubble chat-bubble--${side} chat-bubble--deleted"
         data-msg-id="${msg.id}"
         role="article"
         aria-label="${label}: Message deleted">
      <p class="chat-bubble__text chat-bubble__text--deleted">
        <span aria-hidden="true">🚫</span> Message deleted
      </p>
      <time class="chat-bubble__time" datetime="${esc(msg.created_at)}">${esc(time)}</time>
    </div>`;
  }

  // ── Normal bubble with action menu trigger ─────────────────────────────────
  const menuLabel = isSent
    ? 'Message options: delete for me or delete for everyone'
    : 'Message options: delete for me';

  return `
    <div class="chat-bubble chat-bubble--${side}"
         data-msg-id="${msg.id}"
         data-msg-sent="${isSent}"
         role="article"
         aria-label="${label}: ${esc(msg.content ?? '')}">
      <button class="chat-bubble__menu-btn js-msg-menu"
              aria-label="${menuLabel}"
              aria-haspopup="true"
              tabindex="0"
              type="button"
              title="Message options">⋮</button>
      <p class="chat-bubble__text">${esc(msg.content ?? '')}</p>
      <time class="chat-bubble__time" datetime="${esc(msg.created_at)}">${esc(time)}</time>
    </div>`;
}

/** Scroll the message container to the bottom. */
function chatScrollToBottom() {
  const el = $('#chat-messages');
  if (el) el.scrollTop = el.scrollHeight;
}

/** Show/hide and update the "Load earlier" button. */
function chatUpdateLoadMoreBtn() {
  const btn = $('#chat-load-more');
  if (!btn) return;
  btn.hidden = !State.chat.hasMore;
}

/** Update the WS status badge text and CSS class. */
function chatUpdateWsStatusBadge() {
  const badge = $('#chat-ws-badge');
  if (!badge) return;
  const status = State.chat.wsStatus;
  badge.className = `chat-modal__ws-badge chat-modal__ws-badge--${status}`;
  const labels = {
    connected:    'Connected',
    connecting:   'Connecting…',
    disconnected: 'Disconnected',
    error:        'Connection error',
  };
  badge.textContent = labels[status] || status;
}

/** Enable or disable the send button and textarea. */
function chatSetSendingState(isSending) {
  State.chat.isSending = isSending;
  const btn   = $('#chat-send-btn');
  const input = $('#chat-input');
  if (btn)   btn.disabled   = isSending;
  if (input) input.disabled = isSending;
  if (btn)   btn.textContent = isSending ? '…' : 'Send';
}

/* ================================================
   Input / Send logic
   ================================================ */

/**
 * Initialise the chat form — called once after the modal HTML is injected.
 * Binds the form submit, Enter key, and load-more button.
 */
function initChatInputHandlers() {
  const form  = $('#chat-input-form');
  const input = $('#chat-input');
  const more  = $('#chat-load-more');

  if (!form || !input) return;

  // Auto-resize textarea as content grows (single line → multi-line)
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  // Enter = send, Shift+Enter = newline
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatHandleSend();
    }
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    chatHandleSend();
  });

  if (more) {
    more.addEventListener('click', chatLoadEarlier);
  }

  // ── Message action menu — event delegation on the messages container ───────
  // Menu is appended to document.body (position:fixed) so it escapes overflow
  // clipping on .chat-modal__messages. Delegation still works because the
  // .js-msg-menu button is inside the scrollable container.
  const msgs = $('#chat-messages');
  if (msgs) {
    msgs.addEventListener('click', e => {
      const menuBtn = e.target.closest('.js-msg-menu');
      if (menuBtn) {
        e.stopPropagation();
        // Toggle: if this exact bubble's menu is already open, close it
        const bubble = menuBtn.closest('.chat-bubble');
        if (_openChatMenuBubble === bubble) {
          chatCloseMenu();
        } else {
          chatOpenMenu(menuBtn);
        }
        return;
      }
    });
  }

  // Close open menu on outside click anywhere in the document
  // (capture phase fires before any stopPropagation inside the menu)
  document.addEventListener('click', _chatOutsideClickHandler, true);
}

/**
 * Core send handler — validates, chooses WS or REST fallback, updates UI.
 * Prevents double-send via State.chat.isSending guard.
 */
async function chatHandleSend() {
  if (State.chat.isSending) return;

  const input = $('#chat-input');
  if (!input) return;

  const content = input.value.trim();

  // Client-side validation (backend also validates)
  if (!content) return;
  if (content.length > CHAT_MAX_LEN) {
    showToast(`Message too long — max ${CHAT_MAX_LEN} characters.`, 'error');
    return;
  }
  if (!State.chat.otherUser) return;
  if (!Auth.isAuthenticated()) { handleAuthExpiry(); return; }

  chatSetSendingState(true);
  input.value   = '';
  input.style.height = 'auto';

  const receiverId = State.chat.otherUser.id;
  const ws         = State.chat.ws;
  const wsReady    = ws && ws.readyState === WebSocket.OPEN;

  try {
    if (wsReady) {
      // ── WebSocket path ─────────────────────────────────────────────────
      // Send the frame; the server echoes back a 'new_message' frame which
      // chatWs.onmessage will render.  Do NOT add a local bubble here —
      // we wait for the echo to avoid duplication.
      ws.send(JSON.stringify({
        type:        'send_message',
        receiver_id: receiverId,
        content,
      }));
      // Re-enable input immediately; rendering happens on WS echo
      chatSetSendingState(false);
      $('#chat-input')?.focus();
    } else {
      // ── REST fallback ──────────────────────────────────────────────────
      const msg = await chatApiSend(receiverId, content);
      // Add to local state and render (no WS echo will arrive)
      State.chat.messages.unshift(msg);
      chatAppendBubble(msg, true);
      chatScrollToBottom();
      chatSetSendingState(false);
      $('#chat-input')?.focus();
    }
  } catch (err) {
    chatSetSendingState(false);
    if (err?.status === 401) { handleAuthExpiry(); return; }
    if (err?.status === 403) {
      showToast('You are no longer connected to this user.', 'error');
      return;
    }
    showToast(err?.message || 'Message could not be sent.', 'error');
  }
}

/**
 * Load an older page of messages above the current scroll position.
 * Preserves the user's scroll position after prepend.
 */
async function chatLoadEarlier() {
  const btn = $('#chat-load-more');
  if (!btn || !State.chat.hasMore || !State.chat.otherUser) return;

  btn.disabled    = true;
  btn.textContent = '↑ Loading…';

  const container = $('#chat-messages');
  const prevHeight = container ? container.scrollHeight : 0;

  try {
    const data = await chatApiFetchHistory(
      State.chat.otherUser.id,
      CHAT_PAGE_SIZE,
      State.chat.oldestMsgId
    );
    const olderMsgs = data.messages || [];

    if (olderMsgs.length) {
      // Append to the end of State.chat.messages (which is newest-first)
      State.chat.messages = [...State.chat.messages, ...olderMsgs];
      State.chat.oldestMsgId = olderMsgs[olderMsgs.length - 1].id;

      // Prepend bubbles to the top of the scroll container
      if (container) {
        const fragment = document.createDocumentFragment();
        // olderMsgs is newest-first; reverse to render oldest at top
        [...olderMsgs].reverse().forEach(m => {
          const div = document.createElement('div');
          div.innerHTML = chatBubbleHTML(m);
          fragment.prepend(div.firstElementChild);
        });
        container.prepend(fragment);
        // Restore scroll position so the user's view doesn't jump
        container.scrollTop = container.scrollHeight - prevHeight;
      }
    }

    State.chat.hasMore = data.has_more;
    chatUpdateLoadMoreBtn();
  } catch (err) {
    showToast('Could not load earlier messages.', 'error');
  } finally {
    if (btn) {
      btn.disabled    = false;
      btn.textContent = '↑ Load earlier messages';
    }
  }
}

/* ================================================
   MESSAGE DELETION  (Feature 2)
   ================================================ */

/**
 * REST call: DELETE /api/v1/messages/{id}  body: {mode}
 * Returns the response (204 → null body on success).
 */
async function chatApiDeleteMessage(messageId, mode) {
  return apiRequest(`/api/v1/messages/${messageId}`, {
    method: 'DELETE',
    body: JSON.stringify({ mode }),
  });
}

/**
 * Replace a bubble's content with the "Message deleted" placeholder in-place.
 * Called when a delete-for-everyone event arrives via WS or after a successful
 * REST delete-for-everyone call.
 *
 * @param {number} messageId
 */
function chatApplyDeletedPlaceholder(messageId) {
  const bubble = $(`[data-msg-id="${messageId}"]`, $('#chat-messages'));
  if (!bubble) return;
  // Add the deleted modifier class
  bubble.classList.add('chat-bubble--deleted');
  // Remove the action-menu button (no actions on deleted messages)
  bubble.querySelector('.chat-bubble__menu-btn')?.remove();
  // Replace the text content
  const textEl = bubble.querySelector('.chat-bubble__text');
  if (textEl) {
    textEl.classList.add('chat-bubble__text--deleted');
    textEl.innerHTML = '<span aria-hidden="true">🚫</span> Message deleted';
  }
  // Update aria-label so screen readers get the new content
  const side = bubble.classList.contains('chat-bubble--sent') ? 'You' : esc(State.chat.otherUser?.name || 'Them');
  bubble.setAttribute('aria-label', `${side}: Message deleted`);
}

/**
 * Fully remove a bubble from the DOM (used for delete-for-me).
 *
 * @param {number} messageId
 */
function chatRemoveBubble(messageId) {
  const bubble = $(`[data-msg-id="${messageId}"]`, $('#chat-messages'));
  if (bubble) bubble.remove();
  // If the container is now empty, show the empty state
  const container = $('#chat-messages');
  if (container && !container.querySelector('.chat-bubble')) {
    chatRenderEmptyState();
  }
}

/* ── Message action menu ──────────────────────────────────────────────────── */

/** Currently open menu element (or null). */
let _openChatMenu = null;

/** Document-level capture listener — closes menu on outside click. */
function _chatOutsideClickHandler(e) {
  if (!_openChatMenu) return;
  // Don't close if the click is inside the menu itself or on a ⋮ button
  if (_openChatMenu.contains(e.target)) return;
  if (e.target.closest('.js-msg-menu')) return;
  chatCloseMenu();
}

/**
 * Open (or toggle) the action menu for a message bubble.
 *
 * The menu is appended to document.body with position:fixed, positioned
 * relative to the ⋮ button's bounding rect.  This approach:
 *   1. Completely escapes any overflow:hidden/auto on parent containers.
 *   2. Is never clipped by .chat-modal__messages (overflow-y:auto).
 *   3. Stays visible regardless of scroll position.
 *
 * The bubble gets a `data-menu-open` attribute while the menu is open.
 * CSS uses this to pin the ⋮ button visible so it doesn't disappear.
 *
 * @param {HTMLElement} menuBtn  The ⋮ button that was clicked
 */
function chatOpenMenu(menuBtn) {
  // Toggle: if this button's bubble already has a menu open, close it
  chatCloseMenu();

  const bubble  = menuBtn.closest('.chat-bubble');
  if (!bubble) return;

  const msgId  = Number(bubble.dataset.msgId);
  const isSent = bubble.dataset.msgSent === 'true';

  // ── Build menu items ───────────────────────────────────────────────────────
  const items = isSent
    ? [
        { label: 'Delete for me',       mode: 'for_me',      cls: 'msg-menu__item' },
        { label: 'Delete for everyone', mode: 'for_everyone', cls: 'msg-menu__item msg-menu__item--danger' },
      ]
    : [
        { label: 'Delete for me', mode: 'for_me', cls: 'msg-menu__item' },
      ];

  const itemsHTML = items
    .map(it => `
      <li role="none">
        <button class="${it.cls}" type="button" role="menuitem"
                data-mode="${it.mode}"
                aria-label="${it.label}">
          ${it.label}
        </button>
      </li>`)
    .join('');

  const menu = document.createElement('ul');
  menu.className = 'msg-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Message options');
  menu.innerHTML = itemsHTML;

  // ── Position using fixed coords from button's bounding rect ───────────────
  // Append to body first so we can measure its natural size.
  document.body.appendChild(menu);
  _openChatMenu = menu;
  _openChatMenuBubble = bubble;

  const btnRect  = menuBtn.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const vw       = window.innerWidth;
  const vh       = window.innerHeight;

  // Default: place below-left of the button
  let top  = btnRect.bottom + 4;
  let left = btnRect.right - menuRect.width;

  // Flip above if it would overflow the bottom of the viewport
  if (top + menuRect.height > vh - 8) {
    top = btnRect.top - menuRect.height - 4;
  }
  // Flip right if it would overflow the left edge
  if (left < 8) {
    left = btnRect.left;
  }
  // Never overflow right edge
  if (left + menuRect.width > vw - 8) {
    left = vw - menuRect.width - 8;
  }

  menu.style.position = 'fixed';
  menu.style.top      = `${Math.max(8, top)}px`;
  menu.style.left     = `${Math.max(8, left)}px`;
  menu.style.zIndex   = '9000';

  // ── Pin the ⋮ button visible while menu is open ───────────────────────────
  bubble.setAttribute('data-menu-open', '');
  menuBtn.setAttribute('aria-expanded', 'true');

  // ── Focus first item for keyboard users ───────────────────────────────────
  requestAnimationFrame(() => menu.querySelector('button')?.focus());

  // ── Bind item clicks ───────────────────────────────────────────────────────
  menu.addEventListener('click', e => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    e.stopPropagation();
    chatCloseMenu();
    chatHandleDeleteRequest(msgId, btn.dataset.mode);
  });

  // ── Keyboard: Escape closes, arrow keys navigate ───────────────────────────
  menu.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      chatCloseMenu();
      menuBtn.focus();
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const btns = [...menu.querySelectorAll('button[data-mode]')];
      const idx  = btns.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown'
        ? btns[(idx + 1) % btns.length]
        : btns[(idx - 1 + btns.length) % btns.length];
      next?.focus();
    }
  });
}

/** Tracking which bubble has an open menu (for data-menu-open cleanup). */
let _openChatMenuBubble = null;

/** Close and remove the currently open message menu. */
function chatCloseMenu() {
  if (_openChatMenu) {
    _openChatMenu.remove();
    _openChatMenu = null;
  }
  if (_openChatMenuBubble) {
    _openChatMenuBubble.removeAttribute('data-menu-open');
    const btn = _openChatMenuBubble.querySelector('.js-msg-menu');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    _openChatMenuBubble = null;
  }
}

/**
 * Handle a delete request after the user selects a menu item.
 *
 * delete-for-me:       no confirmation — act immediately.
 * delete-for-everyone: show a confirmation dialog first.
 *
 * @param {number} msgId
 * @param {'for_me'|'for_everyone'} mode
 */
function chatHandleDeleteRequest(msgId, mode) {
  if (mode === 'for_everyone') {
    // Show confirmation before the destructive action
    _chatConfirmDeleteForEveryone(msgId);
  } else {
    _chatExecuteDelete(msgId, 'for_me');
  }
}

/**
 * Show an inline confirmation inside the chat modal.
 * Re-uses the existing openModal() infrastructure — but we want the chat
 * modal to remain open, so we render the confirmation as an overlay inside
 * #chat-modal-inner rather than replacing the whole modal.
 */
function _chatConfirmDeleteForEveryone(msgId) {
  // Check if we already have an overlay
  $('#chat-delete-confirm')?.remove();

  const overlay = document.createElement('div');
  overlay.id        = 'chat-delete-confirm';
  overlay.className = 'chat-delete-overlay';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Confirm delete for everyone');
  overlay.innerHTML = `
    <div class="chat-delete-dialog">
      <p class="chat-delete-dialog__text">
        Delete this message for everyone?<br>
        <span class="chat-delete-dialog__sub">This cannot be undone.</span>
      </p>
      <div class="chat-delete-dialog__actions">
        <button class="btn btn--ghost btn--sm" id="chat-delete-cancel"
                type="button">Cancel</button>
        <button class="btn btn--sm chat-delete-dialog__confirm-btn" id="chat-delete-confirm-btn"
                type="button">Delete</button>
      </div>
    </div>`;

  // Mount inside the chat modal so it stays in context
  const chatInner = $('#chat-modal-inner');
  if (chatInner) {
    chatInner.appendChild(overlay);
  } else {
    // Fallback: mount on body
    document.body.appendChild(overlay);
  }

  // Focus the cancel button (safer default)
  requestAnimationFrame(() => $('#chat-delete-cancel')?.focus());

  $('#chat-delete-cancel')?.addEventListener('click', () => {
    overlay.remove();
  });
  $('#chat-delete-confirm-btn')?.addEventListener('click', () => {
    overlay.remove();
    _chatExecuteDelete(msgId, 'for_everyone');
  });

  // Close on Escape
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') overlay.remove();
  });
  // Close on outside click
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });
}

/**
 * Execute the actual delete: tries WS first, falls back to REST.
 * Updates local state and DOM on success.
 *
 * @param {number} msgId
 * @param {'for_me'|'for_everyone'} mode
 */
async function _chatExecuteDelete(msgId, mode) {
  const c  = State.chat;
  const ws = c.ws;
  const wsReady = ws && ws.readyState === WebSocket.OPEN;

  if (wsReady) {
    // WS path — server will echo back 'message_deleted' frame which the
    // onmessage handler will process (chatApplyDeletedPlaceholder / chatRemoveBubble)
    try {
      ws.send(JSON.stringify({ type: 'delete_message', message_id: msgId, mode }));
      return;
    } catch {
      // Fall through to REST
    }
  }

  // REST fallback
  try {
    await chatApiDeleteMessage(msgId, mode);
    // Apply locally because there is no WS echo on the REST path
    if (mode === 'for_everyone') {
      const stateMsg = c.messages.find(m => m.id === msgId);
      if (stateMsg) { stateMsg.deleted_for_everyone = true; stateMsg.content = null; }
      chatApplyDeletedPlaceholder(msgId);
      showToast('Message deleted for everyone.', 'info');
    } else {
      c.messages = c.messages.filter(m => m.id !== msgId);
      chatRemoveBubble(msgId);
      showToast('Message deleted.', 'info');
    }
  } catch (err) {
    if (err?.status === 401) { handleAuthExpiry(); return; }
    if (err?.status === 403) {
      showToast('You cannot delete this message.', 'error');
    } else if (err?.status === 404) {
      showToast('Message not found.', 'error');
    } else {
      showToast(err?.message || 'Could not delete message. Please try again.', 'error');
    }
  }
}

/* ================================================
   Override openModal to wire up chat handlers
   after the modal HTML is injected.
   ================================================ */

// Wrap the original openModal to hook chat-specific init
const _origOpenModal = openModal;
openModal = function(html) {
  _origOpenModal(html);
  // If a chat modal was just injected, bind its input handlers
  if ($('#chat-modal-inner')) {
    initChatInputHandlers();
  }
};

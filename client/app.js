const state = {
  personas: [],
  selectedPersonas: [],
  editingPersonaId: null,
  pollingDebateId: null,
  pollIntervalId: null,
  activeDebateId: null,
  mainTab: "chats",
  chatsView: "simple",
  groupWorkspace: "live",
  configView: "personas",
  responsibleAiPolicy: null,
  auth: {
    authenticated: false,
    bootstrapRequired: false,
    user: null
  },
  chatByDebate: {},
  lastCitationsByDebate: {},
  adminView: "debates",
  adminOverview: null,
  adminPersonas: null,
  adminChats: null,
  adminUsage: null,
  adminMatrixDimension: "channel",
  adminFilter: null,
  adminMetricFocus: null,
  governanceChat: {
    sessions: [],
    searchQuery: "",
    activeChatId: null,
    historyByChat: {}
  },
  knowledgePacks: [],
  personaFormKnowledgePackIds: [],
  selectedKnowledgePackIds: [],
  topicDiscovery: {
    query: "",
    provider: "",
    results: [],
    selected: null,
    generatedDrafts: []
  },
  personaChat: {
    selectedPersonaIds: [],
    sessions: [],
    activeChatId: null,
    historyByChat: {},
    activeSessionPersonaIds: [],
    dirtyConfig: false
  },
  simpleChat: {
    selectedKnowledgePackIds: [],
    sessions: [],
    activeChatId: null,
    historyByChat: {}
  },
  viewer: {
    type: "debate",
    activeId: null,
    historyByType: {
      debate: [],
      group: [],
      simple: []
    }
  }
};

const DEFAULT_RAI_POLICY = {
  stoplight: {
    redKeywords: [
      "kill",
      "suicide",
      "self-harm",
      "bomb",
      "terror",
      "ethnic cleansing",
      "genocide",
      "overdose",
      "rape",
      "how to hurt",
      "hack bank",
      "credit card theft"
    ],
    yellowKeywords: [
      "guaranteed profit",
      "insider tip",
      "evade taxes",
      "diagnose",
      "prescribe",
      "legal advice",
      "financial advice",
      "weapon",
      "violent",
      "harass",
      "exploit"
    ]
  },
  sentiment: {
    positiveKeywords: [
      "good",
      "great",
      "helpful",
      "constructive",
      "benefit",
      "improve",
      "safe",
      "clarify",
      "collaborate"
    ],
    negativeKeywords: ["bad", "terrible", "harm", "danger", "risky", "hate", "angry", "useless", "worse"],
    threshold: 1
  }
};

function byId(id) {
  return document.getElementById(id);
}

function parseCsv(input) {
  return String(input || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(text, term) {
  const t = String(term || "").toLowerCase().trim();
  if (!t) return false;
  const pattern = `(?:^|[^a-z0-9])${escapeRegex(t)}(?:$|[^a-z0-9])`;
  return new RegExp(pattern, "i").test(text);
}

function parseLineList(input) {
  return String(input || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeNumberInput(raw, fallback, { min = -Infinity, max = Infinity, integer = false } = {}) {
  let n = Number(raw);
  if (!Number.isFinite(n)) n = fallback;
  if (integer) n = Math.round(n);
  if (n < min) n = min;
  if (n > max) n = max;
  return n;
}

function assessExchange(content) {
  const text = String(content || "").toLowerCase();
  const policy = state.responsibleAiPolicy || DEFAULT_RAI_POLICY;
  const redTerms = policy.stoplight?.redKeywords || [];
  const yellowTerms = policy.stoplight?.yellowKeywords || [];
  const positiveTerms = policy.sentiment?.positiveKeywords || [];
  const negativeTerms = policy.sentiment?.negativeKeywords || [];
  const threshold = Number(policy.sentiment?.threshold || 1);

  const red = redTerms.some((term) => containsTerm(text, term));
  const yellow = !red && yellowTerms.some((term) => containsTerm(text, term));
  const stoplight = red ? "red" : yellow ? "yellow" : "green";
  let pos = 0;
  let neg = 0;
  positiveTerms.forEach((term) => {
    if (containsTerm(text, term)) pos += 1;
  });
  negativeTerms.forEach((term) => {
    if (containsTerm(text, term)) neg += 1;
  });
  const sentiment = pos - neg >= threshold ? "positive" : neg - pos >= threshold ? "negative" : "neutral";
  return { stoplight, sentiment };
}

function renderExchangeMessage(container, { roleClass, title, content }) {
  const signal = assessExchange(content);
  const el = document.createElement("div");
  el.className = `chat-msg ${roleClass}`;
  const head = document.createElement("div");
  head.className = "chat-msg-head";
  const titleEl = document.createElement("span");
  titleEl.textContent = String(title || "");
  const badges = document.createElement("span");
  badges.className = "risk-badges";
  const riskChip = document.createElement("span");
  riskChip.className = `risk-chip ${signal.stoplight}`;
  riskChip.textContent = signal.stoplight.toUpperCase();
  const sentimentChip = document.createElement("span");
  sentimentChip.className = `risk-chip sentiment-${signal.sentiment}`;
  sentimentChip.textContent = signal.sentiment;
  badges.append(riskChip, sentimentChip);
  head.append(titleEl, badges);
  const body = document.createElement("div");
  body.textContent = String(content || "");
  el.append(head, body);
  container.appendChild(el);
}

function apiErrorMessage(payload, fallback = "Request failed") {
  const message = payload?.error?.message || fallback;
  const details = Array.isArray(payload?.error?.details)
    ? payload.error.details
        .map((d) => `${d.path || "payload"}: ${d.message}`)
        .join("; ")
    : "";
  return details ? `${message} ${details}` : message;
}

function handleUnauthorized(payload = null) {
  state.auth.authenticated = false;
  state.auth.user = null;
  const message = payload?.error?.message || "Authentication required.";
  showAuthGate(message);
}

async function apiGet(url) {
  const res = await fetch(url);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload.ok) {
    if (res.status === 401) handleUnauthorized(payload);
    throw new Error(apiErrorMessage(payload));
  }
  return payload.data;
}

async function apiSend(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload.ok) {
    if (res.status === 401) handleUnauthorized(payload);
    throw new Error(apiErrorMessage(payload));
  }
  return payload.data;
}

function showAuthGate(statusMessage = "") {
  closeSystemMenu();
  byId("auth-gate").classList.remove("hidden");
  byId("bootstrap-status").textContent = "";
  byId("auth-status").textContent = statusMessage || "";
  byId("auth-bootstrap-panel").classList.toggle("hidden", !state.auth.bootstrapRequired);
  byId("auth-login-panel").classList.toggle("hidden", state.auth.bootstrapRequired);
}

function hideAuthGate() {
  byId("auth-gate").classList.add("hidden");
}

function openSystemMenu() {
  const pop = byId("system-menu-popout");
  const btn = byId("system-menu-toggle");
  pop.classList.remove("hidden");
  btn.setAttribute("aria-expanded", "true");
}

function closeSystemMenu() {
  const pop = byId("system-menu-popout");
  const btn = byId("system-menu-toggle");
  if (!pop || !btn) return;
  pop.classList.add("hidden");
  btn.setAttribute("aria-expanded", "false");
}

function toggleSystemMenu() {
  const pop = byId("system-menu-popout");
  if (pop.classList.contains("hidden")) {
    openSystemMenu();
  } else {
    closeSystemMenu();
  }
}

function renderAuthChrome() {
  const chip = byId("auth-user-chip");
  const logoutBtn = byId("auth-quick-logout");
  if (!chip || !logoutBtn) return;
  if (state.auth.authenticated && state.auth.user) {
    chip.textContent = `${state.auth.user.username} (${state.auth.user.role})`;
    logoutBtn.disabled = false;
    byId("auth-open-login").textContent = "Switch User";
  } else {
    chip.textContent = "Guest";
    logoutBtn.disabled = true;
    byId("auth-open-login").textContent = "Login";
  }
}

function parsePermissionsInput(input) {
  const values = parseCsv(input);
  const perms = {};
  values.forEach((value) => {
    perms[value] = true;
  });
  return perms;
}

async function loadAuthState() {
  try {
    const data = await apiGet("/api/auth/me");
    state.auth.authenticated = Boolean(data.authenticated);
    state.auth.bootstrapRequired = Boolean(data.bootstrapRequired);
    state.auth.user = data.user || null;
    if (!state.auth.authenticated) {
      showAuthGate(data.bootstrapRequired ? "Create the first admin account." : "Please log in.");
      renderAuthChrome();
      return false;
    }
    hideAuthGate();
    renderAuthChrome();
    return true;
  } catch (error) {
    showAuthGate(`Auth check failed: ${error.message}`);
    renderAuthChrome();
    return false;
  }
}

async function login() {
  const username = byId("auth-username").value.trim();
  const password = byId("auth-password").value;
  byId("auth-status").textContent = "Signing in...";
  try {
    await apiSend("/api/auth/login", "POST", { username, password });
    byId("auth-password").value = "";
    await loadAuthState();
    await refreshAfterAuth();
  } catch (error) {
    byId("auth-status").textContent = `Login failed: ${error.message}`;
  }
}

async function bootstrapAdmin() {
  const username = byId("bootstrap-username").value.trim();
  const password = byId("bootstrap-password").value;
  byId("bootstrap-status").textContent = "Creating admin account...";
  try {
    await apiSend("/api/auth/bootstrap", "POST", { username, password });
    byId("bootstrap-password").value = "";
    await loadAuthState();
    await refreshAfterAuth();
  } catch (error) {
    byId("bootstrap-status").textContent = `Bootstrap failed: ${error.message}`;
  }
}

async function logout() {
  try {
    await apiSend("/api/auth/logout", "POST", {});
  } catch {
    // ignore
  }
  state.auth.authenticated = false;
  state.auth.user = null;
  showAuthGate("Logged out.");
  renderAuthChrome();
  closeSystemMenu();
}

async function refreshAfterAuth() {
  renderSessionSummary();
  await loadPersonas();
  await loadKnowledgePacks();
  await loadResponsibleAiPolicy();
  await loadPersonaChatSessions();
  await loadSimpleChatSessions();
  await loadAdminData();
  await loadSecurityData();
}

function getActiveChatHistory() {
  if (!state.activeDebateId) return [];
  if (!state.chatByDebate[state.activeDebateId]) {
    state.chatByDebate[state.activeDebateId] = [];
  }
  return state.chatByDebate[state.activeDebateId];
}

function getActiveCitations() {
  if (!state.activeDebateId) return [];
  return state.lastCitationsByDebate[state.activeDebateId] || [];
}

function renderCitationsPopout() {
  const list = byId("chat-citations-list");
  const citations = getActiveCitations();
  list.innerHTML = "";

  if (!state.activeDebateId) {
    list.textContent = "Load a debate first.";
    return;
  }

  if (!citations.length) {
    list.textContent = "No citations yet. Ask a transcript question first.";
    return;
  }

  citations.forEach((citation) => {
    const card = document.createElement("div");
    card.className = "citation-card";
    card.textContent = `Excerpt ${citation.id}\n\n${citation.excerpt}`;
    list.appendChild(card);
  });
}

function openCitationsPopout() {
  const popout = byId("citations-popout");
  popout.classList.add("open");
  popout.setAttribute("aria-hidden", "false");
  renderCitationsPopout();
}

function closeCitationsPopout() {
  const popout = byId("citations-popout");
  popout.classList.remove("open");
  popout.setAttribute("aria-hidden", "true");
}

function currentHelpGuide() {
  if (state.mainTab === "governance") {
    return {
      title: "Governance Guide",
      points: [
        "Use Matrix Dimension (Channel/Model/Persona/User) to pivot metrics.",
        "Click a row or metric cell to drill into filtered views.",
        "Use History Explorer links to inspect full conversation history.",
        "Use Governance Admin Chat for natural-language Q&A over internal governance data."
      ]
    };
  }
  if (state.mainTab === "config") {
    if (state.configView === "personas") {
      return {
        title: "Personas Guide",
        points: [
          "Create personas with system prompts; optional fields can be inferred.",
          "Attach persona-specific knowledge packs for specialized responses.",
          "Use Add to Debate to include personas in formal debate setup."
        ]
      };
    }
    if (state.configView === "knowledge") {
      return {
        title: "Knowledge Studio Guide",
        points: [
          "Upload txt/pdf/image/doc files to create reusable knowledge packs.",
          "Attach packs globally in debates or per-persona in profile settings.",
          "Use tags and descriptions to keep packs searchable."
        ]
      };
    }
    if (state.configView === "rai") {
      return {
        title: "Responsible AI Guide",
        points: [
          "Tune red/yellow keyword packs and sentiment threshold.",
          "Save policy to apply risk chips and governance signals.",
          "Use governance charts to monitor stoplight and sentiment trends."
        ]
      };
    }
    if (state.configView === "security") {
      return {
        title: "Users & Access Guide",
        points: [
          "Create users with role-based permissions.",
          "Generate API keys for Postman/Copilot integrations.",
          "Track usage by user from the usage summary panel."
        ]
      };
    }
  }
  if (state.mainTab === "chats") {
    if (state.chatsView === "simple") {
      return {
        title: "Simple Chat Guide",
        points: [
          "Create a session, optionally attach knowledge packs, then send messages.",
          "Load past sessions from Saved Sessions to continue work.",
          "Use History Explorer for cross-session monitoring and flags."
        ]
      };
    }
    if (state.groupWorkspace === "live") {
      return {
        title: "Group Chat Guide",
        points: [
          "Select personas and create a session before sending messages.",
          "Use Engagement Mode to tune interaction style.",
          "Create a new session when changing personas/settings significantly."
        ]
      };
    }
    if (state.groupWorkspace === "debate-setup") {
      return {
        title: "Debate Setup Guide",
        points: [
          "Define topic/context, optionally discover sources and generate personas.",
          "Attach global knowledge packs and configure rounds/model settings.",
          "Run debate to stream transcript and moderator synthesis."
        ]
      };
    }
    return {
      title: "History Explorer Guide",
      points: [
        "Choose conversation type and browse saved history list.",
        "Open any session to inspect transcript/summary and risk flags.",
        "Debate type enables transcript Q&A and transcript download."
      ]
    };
  }
  return {
    title: "Platform Guide",
    points: [
      "Use Chats for operation, Governance for monitoring, Admin & Config for setup.",
      "All data is local-first and persisted in repository data folders."
    ]
  };
}

function openHelpPopout() {
  closeSystemMenu();
  const popout = byId("help-popout");
  const title = byId("help-title");
  const body = byId("help-body");
  const guide = currentHelpGuide();
  title.textContent = guide.title;
  body.innerHTML = guide.points
    .map((p) => `<div class="citation-card">${p}</div>`)
    .join("");
  popout.classList.add("open");
  popout.setAttribute("aria-hidden", "false");
}

function closeHelpPopout() {
  const popout = byId("help-popout");
  popout.classList.remove("open");
  popout.setAttribute("aria-hidden", "true");
}

function renderChatHistory() {
  const container = byId("chat-history");
  const history = getActiveChatHistory();
  container.innerHTML = "";

  if (!state.activeDebateId) {
    container.textContent = "Load a debate first.";
    return;
  }

  if (!history.length) {
    container.textContent = "No chat messages yet.";
    return;
  }

  history.forEach((msg) => {
    renderExchangeMessage(container, {
      roleClass: msg.role === "user" ? "user" : "assistant",
      title: msg.role === "user" ? "You" : "Assistant",
      content: msg.content
    });
  });

  container.scrollTop = container.scrollHeight;
}

function renderDebateTurns(turns) {
  const container = byId("viewer-turns");
  if (!container) return;
  container.innerHTML = "";
  const entries = Array.isArray(turns) ? turns : [];
  if (!entries.length) {
    container.textContent = "No debate exchanges yet.";
    return;
  }
  entries.forEach((turn) => {
    const title = `${turn.displayName || turn.speakerId || "Speaker"} (Round ${turn.round || 0})`;
    renderExchangeMessage(container, {
      roleClass: turn.type === "moderator" ? "system" : "assistant",
      title,
      content: turn.text || ""
    });
  });
}

async function askTranscriptChat() {
  const questionEl = byId("chat-question");
  const statusEl = byId("chat-status");
  const question = questionEl.value.trim();

  if (!state.activeDebateId) {
    statusEl.textContent = "Load a debate first.";
    return;
  }
  if (!question) return;

  const history = getActiveChatHistory();
  history.push({ role: "user", content: question });
  renderChatHistory();
  questionEl.value = "";
  statusEl.textContent = "Asking transcript chat...";

  try {
    const data = await apiSend(
      `/api/debates/${encodeURIComponent(state.activeDebateId)}/chat`,
      "POST",
      {
        question,
        history: history.slice(-8)
      }
    );
    const answer = String(data.answer || "").trim();
    state.lastCitationsByDebate[state.activeDebateId] = Array.isArray(data.citations)
      ? data.citations
      : [];
    history.push({ role: "assistant", content: answer || "(No answer returned)" });
    renderChatHistory();
    renderCitationsPopout();
    statusEl.textContent = `Answered using ${data.usedExcerpts || 0} transcript excerpts.`;
  } catch (error) {
    const msg = String(error.message || "");
    if (msg.includes("Route POST") && msg.includes("/chat")) {
      statusEl.textContent =
        "Chat endpoint not available on the running server. Restart with `npm start` and retry.";
      return;
    }
    statusEl.textContent = `Chat failed: ${error.message}`;
  }
}

function renderPersonaChatPersonaList() {
  const container = byId("persona-chat-persona-list");
  if (!container) return;
  container.innerHTML = "";

  if (!state.personas.length) {
    container.textContent = "No personas available. Create personas first.";
    return;
  }

  state.personas.forEach((persona) => {
    const row = document.createElement("label");
    row.className = "inline";
    const checked = state.personaChat.selectedPersonaIds.includes(persona.id);
    row.innerHTML = `
      <input type="checkbox" data-persona-chat-id="${persona.id}" ${checked ? "checked" : ""}>
      ${persona.displayName} <span class="muted">(${persona.id})</span>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll("input[type='checkbox'][data-persona-chat-id]").forEach((input) => {
    input.addEventListener("change", () => {
      const personaId = input.getAttribute("data-persona-chat-id");
      if (!personaId) return;
      if (input.checked) {
        if (!state.personaChat.selectedPersonaIds.includes(personaId)) {
          state.personaChat.selectedPersonaIds.push(personaId);
        }
      } else {
        state.personaChat.selectedPersonaIds = state.personaChat.selectedPersonaIds.filter((id) => id !== personaId);
      }
      if (state.personaChat.activeChatId) {
        state.personaChat.dirtyConfig = true;
        byId("persona-chat-status").textContent =
          "Persona selection changed. Click Create Chat Session to start a fresh conversation.";
      }
    });
  });
}

function renderPersonaChatSessionList() {
  const container = byId("persona-chat-session-list");
  if (!container) return;
  container.innerHTML = "";

  if (!state.personaChat.sessions.length) {
    container.textContent = "No persona chat sessions yet.";
    return;
  }

  state.personaChat.sessions.forEach((session) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-title">${session.title || "Persona Chat"}</div>
      <div class="muted">${session.chatId}</div>
      <div>Mode: ${session.engagementMode || "chat"}</div>
      <div>Participants: ${(session.participants || []).join(", ") || "none"}</div>
      <div>Messages: ${session.messageCount || 0}</div>
    `;
    const row = document.createElement("div");
    row.className = "row";
    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.textContent = "Load Chat";
    loadBtn.addEventListener("click", () => loadPersonaChatSession(session.chatId));
    row.appendChild(loadBtn);
    card.appendChild(row);
    container.appendChild(card);
  });
}

function renderPersonaChatHistory() {
  const container = byId("persona-chat-history");
  if (!container) return;
  container.innerHTML = "";

  const chatId = state.personaChat.activeChatId;
  if (!chatId) {
    container.textContent = "No chat loaded.";
    return;
  }

  const history = state.personaChat.historyByChat[chatId] || [];
  if (!history.length) {
    container.textContent = "No messages yet.";
    return;
  }

  history.forEach((msg) => {
    const role = msg.role === "user" ? "user" : (msg.role === "orchestrator" ? "system" : "assistant");
    const title = msg.role === "user" ? "You" : (msg.role === "orchestrator" ? "Orchestrator" : (msg.displayName || "Persona"));
    renderExchangeMessage(container, {
      roleClass: role,
      title,
      content: msg.content
    });
  });

  container.scrollTop = container.scrollHeight;
}

async function loadPersonaChatSessions() {
  const status = byId("persona-chat-create-status");
  try {
    const data = await apiGet("/api/persona-chats");
    state.personaChat.sessions = Array.isArray(data.chats) ? data.chats : [];
    renderPersonaChatSessionList();
  } catch (error) {
    status.textContent = `Failed to load persona chats: ${error.message}`;
  }
}

async function loadPersonaChatSession(chatId) {
  const status = byId("persona-chat-status");
  if (!chatId) {
    status.textContent = "Chat id is required.";
    return;
  }
  status.textContent = `Loading ${chatId}...`;
  try {
    const data = await apiGet(`/api/persona-chats/${encodeURIComponent(chatId)}`);
    state.personaChat.activeChatId = chatId;
    state.personaChat.activeSessionPersonaIds = Array.isArray(data.session?.personas)
      ? data.session.personas.map((p) => p.id).filter(Boolean)
      : [];
    state.personaChat.selectedPersonaIds = state.personaChat.activeSessionPersonaIds.slice();
    state.personaChat.dirtyConfig = false;
    state.personaChat.historyByChat[chatId] = Array.isArray(data.messages) ? data.messages : [];
    byId("persona-chat-id").value = chatId;
    if (data.session?.settings?.model) byId("persona-chat-model").value = data.session.settings.model;
    if (typeof data.session?.settings?.temperature !== "undefined") {
      byId("persona-chat-temperature").value = String(data.session.settings.temperature);
    }
    if (typeof data.session?.settings?.maxWordsPerTurn !== "undefined") {
      byId("persona-chat-max-words").value = String(data.session.settings.maxWordsPerTurn);
    }
    if (data.session?.settings?.engagementMode) {
      byId("persona-chat-mode").value = data.session.settings.engagementMode;
    }
    renderPersonaChatPersonaList();
    renderPersonaChatHistory();
    status.textContent = `Loaded chat ${chatId}`;
  } catch (error) {
    status.textContent = `Failed to load chat: ${error.message}`;
  }
}

async function createPersonaChatSession() {
  const status = byId("persona-chat-create-status");
  const selected = state.personaChat.selectedPersonaIds.slice();
  if (!selected.length) {
    status.textContent = "Select at least one persona.";
    return;
  }

  const payload = {
    title: byId("persona-chat-title").value.trim() || "Persona Collaboration Chat",
    context: byId("persona-chat-context").value.trim(),
    selectedPersonas: selected.map((id) => ({ type: "saved", id })),
    settings: {
      model: byId("persona-chat-model").value.trim() || "gpt-4.1-mini",
      temperature: safeNumberInput(byId("persona-chat-temperature").value, 0.6, { min: 0, max: 2 }),
      maxWordsPerTurn: safeNumberInput(byId("persona-chat-max-words").value, 140, {
        min: 40,
        max: 400,
        integer: true
      }),
      engagementMode: byId("persona-chat-mode").value || "chat"
    }
  };

  status.textContent = "Creating persona chat session...";
  try {
    const data = await apiSend("/api/persona-chats", "POST", payload);
    const chatId = data.chatId;
    status.textContent = `Created new chat ${chatId}`;
    state.personaChat.dirtyConfig = false;
    await loadPersonaChatSessions();
    await loadPersonaChatSession(chatId);
  } catch (error) {
    status.textContent = `Create failed: ${error.message}`;
  }
}

function startNewPersonaChatDraft() {
  state.personaChat.activeChatId = null;
  state.personaChat.activeSessionPersonaIds = [];
  state.personaChat.dirtyConfig = false;
  byId("persona-chat-id").value = "";
  byId("persona-chat-title").value = "Persona Collaboration Chat";
  byId("persona-chat-context").value = "";
  byId("persona-chat-model").value = "gpt-4.1-mini";
  byId("persona-chat-temperature").value = "0.6";
  byId("persona-chat-max-words").value = "140";
  byId("persona-chat-mode").value = "chat";
  byId("persona-chat-status").textContent = "Draft reset. Select personas/settings and click Create Chat Session.";
  renderPersonaChatHistory();
}

async function sendPersonaChatMessage() {
  const status = byId("persona-chat-status");
  const input = byId("persona-chat-message");
  const explicitChatId = byId("persona-chat-id").value.trim();
  const chatId = explicitChatId || state.personaChat.activeChatId;
  const message = input.value.trim();

  if (!chatId) {
    status.textContent = "Create or load a chat first.";
    return;
  }
  if (explicitChatId && state.personaChat.activeChatId && explicitChatId !== state.personaChat.activeChatId) {
    status.textContent = "Chat id field differs from active session. Click Load to switch sessions first.";
    return;
  }
  if (state.personaChat.dirtyConfig) {
    status.textContent =
      "Chat configuration changed since this session loaded. Click Create Chat Session to start a new conversation.";
    return;
  }
  if (!message) return;

  if (!state.personaChat.historyByChat[chatId]) state.personaChat.historyByChat[chatId] = [];
  state.personaChat.historyByChat[chatId].push({ role: "user", content: message });
  state.personaChat.activeChatId = chatId;
  renderPersonaChatHistory();
  input.value = "";
  status.textContent = "Thinking...";

  try {
    const data = await apiSend(`/api/persona-chats/${encodeURIComponent(chatId)}/messages`, "POST", {
      message
    });
    if (data.orchestration?.content) {
      state.personaChat.historyByChat[chatId].push({
        role: "orchestrator",
        content: data.orchestration.content,
        rationale: data.orchestration.rationale || []
      });
    }
    const responses = Array.isArray(data.responses) ? data.responses : [];
    state.personaChat.historyByChat[chatId].push(...responses);
    renderPersonaChatHistory();
    const selected = Array.isArray(data.orchestration?.rationale) ? data.orchestration.rationale : [];
    const selectedNames = selected.map((r) => r.displayName).join(", ");
    status.textContent = `Received ${responses.length} persona response(s). ${
      selectedNames ? `Selected: ${selectedNames}.` : ""
    }`;
    await loadPersonaChatSessions();
  } catch (error) {
    status.textContent = `Persona chat failed: ${error.message}`;
  }
}

function renderSimpleChatKnowledgeList() {
  const container = byId("simple-chat-knowledge-list");
  if (!container) return;
  container.innerHTML = "";

  if (!state.knowledgePacks.length) {
    container.textContent = "No knowledge packs available yet.";
    return;
  }

  state.knowledgePacks.forEach((pack) => {
    const row = document.createElement("label");
    row.className = "inline";
    const checked = state.simpleChat.selectedKnowledgePackIds.includes(pack.id);
    row.innerHTML = `
      <input type="checkbox" data-simple-pack-id="${pack.id}" ${checked ? "checked" : ""}>
      ${pack.title} <span class="muted">(${pack.id})</span>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll("input[type='checkbox'][data-simple-pack-id]").forEach((input) => {
    input.addEventListener("change", () => {
      const packId = input.getAttribute("data-simple-pack-id");
      if (!packId) return;
      if (input.checked) {
        if (!state.simpleChat.selectedKnowledgePackIds.includes(packId)) {
          state.simpleChat.selectedKnowledgePackIds.push(packId);
        }
      } else {
        state.simpleChat.selectedKnowledgePackIds = state.simpleChat.selectedKnowledgePackIds.filter((id) => id !== packId);
      }
    });
  });
}

function renderSimpleChatSessionList() {
  const container = byId("simple-chat-session-list");
  if (!container) return;
  container.innerHTML = "";
  const sessions = state.simpleChat.sessions || [];

  if (!sessions.length) {
    container.textContent = "No simple chat sessions yet.";
    return;
  }

  sessions.forEach((session) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-title">${session.title || "Simple Chat"}</div>
      <div class="muted">${session.chatId}</div>
      <div>Model: ${session.model || "unknown"} | Messages: ${session.messageCount || 0}</div>
      <div>Knowledge: ${(session.knowledgePackIds || []).join(", ") || "none"}</div>
    `;
    const row = document.createElement("div");
    row.className = "row";
    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.textContent = "Load Chat";
    loadBtn.addEventListener("click", () => loadSimpleChatSession(session.chatId));
    row.appendChild(loadBtn);
    card.appendChild(row);
    container.appendChild(card);
  });
}

function renderSimpleChatHistory() {
  const container = byId("simple-chat-history");
  if (!container) return;
  container.innerHTML = "";
  const chatId = state.simpleChat.activeChatId;
  if (!chatId) {
    container.textContent = "No chat loaded.";
    return;
  }

  const history = state.simpleChat.historyByChat[chatId] || [];
  if (!history.length) {
    container.textContent = "No messages yet.";
    return;
  }

  history.forEach((msg) => {
    const role = msg.role === "user" ? "user" : "assistant";
    const title = msg.role === "user" ? "You" : "Assistant";
    const citations = Array.isArray(msg.citations) && msg.citations.length
      ? `\n\nCitations: ${msg.citations.map((c) => c.id || c.title).join(", ")}`
      : "";
    renderExchangeMessage(container, {
      roleClass: role,
      title,
      content: `${msg.content || ""}${citations}`
    });
  });

  container.scrollTop = container.scrollHeight;
}

async function loadSimpleChatSessions() {
  const status = byId("simple-chat-create-status");
  try {
    const data = await apiGet("/api/simple-chats");
    state.simpleChat.sessions = Array.isArray(data.chats) ? data.chats : [];
    renderSimpleChatSessionList();
  } catch (error) {
    status.textContent = `Failed to load simple chats: ${error.message}`;
  }
}

async function loadSimpleChatSession(chatId) {
  const status = byId("simple-chat-status");
  if (!chatId) {
    status.textContent = "Chat id is required.";
    return;
  }

  status.textContent = `Loading ${chatId}...`;
  try {
    const data = await apiGet(`/api/simple-chats/${encodeURIComponent(chatId)}`);
    state.simpleChat.activeChatId = chatId;
    state.simpleChat.historyByChat[chatId] = Array.isArray(data.messages) ? data.messages : [];
    byId("simple-chat-id").value = chatId;
    renderSimpleChatHistory();
    status.textContent = `Loaded simple chat ${chatId}`;
  } catch (error) {
    status.textContent = `Failed to load simple chat: ${error.message}`;
  }
}

async function createSimpleChatSession() {
  const status = byId("simple-chat-create-status");
  const payload = {
    title: byId("simple-chat-title").value.trim() || "Simple Chat",
    context: byId("simple-chat-context").value.trim(),
    knowledgePackIds: state.simpleChat.selectedKnowledgePackIds.slice(),
    settings: {
      model: byId("simple-chat-model").value.trim() || "gpt-4.1-mini",
      temperature: safeNumberInput(byId("simple-chat-temperature").value, 0.4, { min: 0, max: 2 }),
      maxResponseWords: safeNumberInput(byId("simple-chat-max-words").value, 220, {
        min: 40,
        max: 800,
        integer: true
      })
    }
  };
  status.textContent = "Creating simple chat session...";
  try {
    const data = await apiSend("/api/simple-chats", "POST", payload);
    const chatId = data.chatId;
    status.textContent = `Created simple chat ${chatId}`;
    await loadSimpleChatSessions();
    await loadSimpleChatSession(chatId);
  } catch (error) {
    status.textContent = `Create failed: ${error.message}`;
  }
}

async function sendSimpleChatMessage() {
  const status = byId("simple-chat-status");
  const input = byId("simple-chat-message");
  const chatId = state.simpleChat.activeChatId || byId("simple-chat-id").value.trim();
  const message = input.value.trim();

  if (!chatId) {
    status.textContent = "Create or load a chat first.";
    return;
  }
  if (!message) return;

  if (!state.simpleChat.historyByChat[chatId]) state.simpleChat.historyByChat[chatId] = [];
  state.simpleChat.historyByChat[chatId].push({ role: "user", content: message });
  state.simpleChat.activeChatId = chatId;
  renderSimpleChatHistory();
  input.value = "";
  status.textContent = "Thinking...";

  try {
    const data = await apiSend(`/api/simple-chats/${encodeURIComponent(chatId)}/messages`, "POST", { message });
    if (data.assistant) {
      state.simpleChat.historyByChat[chatId].push(data.assistant);
    }
    renderSimpleChatHistory();
    status.textContent = `Response ready${Array.isArray(data.citations) && data.citations.length ? ` with ${data.citations.length} citations.` : "."}`;
    await loadSimpleChatSessions();
  } catch (error) {
    status.textContent = `Simple chat failed: ${error.message}`;
  }
}

function setSubtabActive(group, value) {
  const map = {
    chats: {
      simple: "chats-view-simple",
      group: "chats-view-group"
    },
    config: {
      personas: "config-view-personas",
      knowledge: "config-view-knowledge",
      rai: "config-view-rai",
      security: "config-view-security"
    }
  };
  const groupMap = map[group] || {};
  Object.entries(groupMap).forEach(([key, id]) => {
    const btn = byId(id);
    if (btn) btn.classList.toggle("active", key === value);
  });
}

function setGroupWorkspace(view) {
  state.groupWorkspace = ["live", "debate-setup", "debate-viewer"].includes(view) ? view : "live";
  const groupActive = state.mainTab === "chats" && state.chatsView === "group";
  byId("tab-persona-chat").classList.toggle("active", groupActive && state.groupWorkspace === "live");
  byId("tab-new-debate").classList.toggle("active", groupActive && state.groupWorkspace === "debate-setup");
  byId("tab-viewer").classList.toggle("active", groupActive && state.groupWorkspace === "debate-viewer");
  byId("group-work-live").classList.toggle("active", state.groupWorkspace === "live");
  byId("group-work-debate-setup").classList.toggle("active", state.groupWorkspace === "debate-setup");
  byId("group-work-debate-viewer").classList.toggle("active", state.groupWorkspace === "debate-viewer");
  if (groupActive && state.groupWorkspace === "debate-viewer") {
    const type = byId("viewer-conversation-type").value || "debate";
    loadViewerHistory(type).catch((error) => {
      byId("viewer-progress").textContent = `Failed to load history: ${error.message}`;
    });
  }
}

function setChatsView(view) {
  state.chatsView = view === "group" ? "group" : "simple";
  byId("tab-simple-chat").classList.toggle("active", state.mainTab === "chats" && state.chatsView === "simple");
  byId("tab-persona-chat").classList.remove("active");
  byId("tab-new-debate").classList.remove("active");
  byId("tab-viewer").classList.remove("active");
  setSubtabActive("chats", state.chatsView);
  if (state.mainTab === "chats" && state.chatsView === "simple") {
    renderSimpleChatKnowledgeList();
    renderSimpleChatHistory();
    loadSimpleChatSessions();
  }
  if (state.mainTab === "chats" && state.chatsView === "group") {
    setGroupWorkspace(state.groupWorkspace);
    renderPersonaChatPersonaList();
    renderPersonaChatHistory();
    loadPersonaChatSessions();
  }
}

function setConfigView(view) {
  state.configView = ["knowledge", "rai", "security"].includes(view) ? view : "personas";
  byId("tab-personas").classList.toggle("active", state.mainTab === "config" && state.configView === "personas");
  byId("tab-knowledge").classList.toggle("active", state.mainTab === "config" && state.configView === "knowledge");
  byId("tab-rai").classList.toggle("active", state.mainTab === "config" && state.configView === "rai");
  byId("tab-security").classList.toggle("active", state.mainTab === "config" && state.configView === "security");
  setSubtabActive("config", state.configView);
  if (state.mainTab === "config" && state.configView === "knowledge") {
    loadKnowledgePacks();
  }
  if (state.mainTab === "config" && state.configView === "rai") {
    loadResponsibleAiPolicy();
  }
  if (state.mainTab === "config" && state.configView === "security") {
    loadSecurityData();
  }
}

function switchTab(tabName) {
  state.mainTab = tabName;
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  document.querySelectorAll(".tab-section").forEach((section) => {
    section.classList.remove("active");
  });

  byId("subnav-chats").classList.toggle("hidden", tabName !== "chats");
  byId("subnav-config").classList.toggle("hidden", tabName !== "config");

  if (tabName === "chats") {
    setChatsView(state.chatsView);
    return;
  }

  if (tabName === "governance") {
    byId("tab-admin").classList.add("active");
    loadAdminData();
    return;
  }

  if (tabName === "config") {
    setConfigView(state.configView);
  }
}

function personaFromForm() {
  const form = byId("persona-form");
  const fd = new FormData(form);
  return {
    id: String(fd.get("id") || "").trim(),
    displayName: String(fd.get("displayName") || "").trim(),
    role: String(fd.get("role") || "").trim(),
    description: String(fd.get("description") || "").trim(),
    systemPrompt: String(fd.get("systemPrompt") || "").trim(),
    speakingStyle: {
      tone: String(fd.get("tone") || "").trim(),
      verbosity: String(fd.get("verbosity") || "").trim(),
      quirks: parseCsv(fd.get("quirks"))
    },
    expertiseTags: parseCsv(fd.get("expertiseTags")),
    biasValues: parseCsv(fd.get("biasValues")),
    debateBehavior: String(fd.get("debateBehavior") || "").trim(),
    knowledgePackIds: state.personaFormKnowledgePackIds.slice()
  };
}

function renderPersonaKnowledgePackList() {
  const container = byId("persona-knowledge-pack-list");
  if (!container) return;
  container.innerHTML = "";

  if (!state.knowledgePacks.length) {
    container.textContent = "No knowledge packs available. Create one in Knowledge Studio.";
    return;
  }

  state.knowledgePacks.forEach((pack) => {
    const row = document.createElement("label");
    row.className = "inline";
    const checked = state.personaFormKnowledgePackIds.includes(pack.id);
    row.innerHTML = `
      <input type="checkbox" data-pack-id="${pack.id}" ${checked ? "checked" : ""}>
      ${pack.title} <span class="muted">(${pack.id})</span>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll("input[type='checkbox'][data-pack-id]").forEach((input) => {
    input.addEventListener("change", () => {
      const packId = input.getAttribute("data-pack-id");
      if (!packId) return;
      if (input.checked) {
        if (!state.personaFormKnowledgePackIds.includes(packId)) {
          state.personaFormKnowledgePackIds.push(packId);
        }
      } else {
        state.personaFormKnowledgePackIds = state.personaFormKnowledgePackIds.filter((id) => id !== packId);
      }
      renderPersonaPreview();
    });
  });
}

function fillPersonaForm(persona) {
  const form = byId("persona-form");
  form.elements.id.value = persona.id || "";
  form.elements.displayName.value = persona.displayName || "";
  form.elements.role.value = persona.role || "";
  form.elements.description.value = persona.description || "";
  form.elements.systemPrompt.value = persona.systemPrompt || "";
  form.elements.tone.value = persona.speakingStyle?.tone || "";
  form.elements.verbosity.value = persona.speakingStyle?.verbosity || "";
  form.elements.quirks.value = (persona.speakingStyle?.quirks || []).join(", ");
  form.elements.expertiseTags.value = (persona.expertiseTags || []).join(", ");
  form.elements.biasValues.value = Array.isArray(persona.biasValues)
    ? persona.biasValues.join(", ")
    : String(persona.biasValues || "");
  form.elements.debateBehavior.value = persona.debateBehavior || "";
  state.personaFormKnowledgePackIds = Array.isArray(persona.knowledgePackIds)
    ? persona.knowledgePackIds.slice()
    : [];
  renderPersonaKnowledgePackList();
  renderPersonaPreview();
}

function resetPersonaForm() {
  state.editingPersonaId = null;
  byId("persona-form-title").textContent = "Create Persona";
  byId("persona-form").reset();
  state.personaFormKnowledgePackIds = [];
  renderPersonaKnowledgePackList();
  renderPersonaPreview();
}

function renderPersonaPreview() {
  const persona = personaFromForm();
  byId("persona-preview").textContent = JSON.stringify(persona, null, 2);
}

function addSavedPersonaToSelection(personaId) {
  const exists = state.selectedPersonas.some(
    (entry) => entry.type === "saved" && entry.id === personaId
  );
  if (exists) return;
  state.selectedPersonas.push({ type: "saved", id: personaId });
  renderSelectedPersonas();
}

function renderAvailablePersonas() {
  const container = byId("available-personas");
  container.innerHTML = "";

  if (!state.personas.length) {
    container.textContent = "No personas found. Create one in Personas tab.";
    return;
  }

  state.personas.forEach((persona) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-title">${persona.displayName} <span class="muted">(${persona.id})</span></div>
      <div>${persona.description}</div>
      <div>Tags: ${(persona.expertiseTags || []).join(", ") || "none"}</div>
      <div>Knowledge: ${(persona.knowledgePackIds || []).join(", ") || "none"}</div>
    `;

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "Add to Debate";
    addBtn.addEventListener("click", () => addSavedPersonaToSelection(persona.id));

    card.appendChild(addBtn);
    container.appendChild(card);
  });
}

function renderPersonaList() {
  const q = byId("persona-search").value.trim().toLowerCase();
  const tag = byId("persona-tag-filter").value.trim().toLowerCase();
  const container = byId("persona-list");
  container.innerHTML = "";

  const filtered = state.personas.filter((persona) => {
    const matchesQ =
      !q ||
      persona.id.toLowerCase().includes(q) ||
      persona.displayName.toLowerCase().includes(q) ||
      (persona.description || "").toLowerCase().includes(q);
    const matchesTag =
      !tag ||
      (persona.expertiseTags || []).some((t) => String(t).toLowerCase() === tag);
    return matchesQ && matchesTag;
  });

  if (!filtered.length) {
    container.textContent = "No personas match the filter.";
    return;
  }

  filtered.forEach((persona) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-title">${persona.displayName} <span class="muted">(${persona.id})</span></div>
      <div>${persona.description}</div>
      <div>Tags: ${(persona.expertiseTags || []).join(", ") || "none"}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "row";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      state.editingPersonaId = persona.id;
      byId("persona-form-title").textContent = `Edit Persona: ${persona.id}`;
      fillPersonaForm(persona);
      switchTab("config");
      setConfigView("personas");
    });

    const duplicateBtn = document.createElement("button");
    duplicateBtn.type = "button";
    duplicateBtn.textContent = "Duplicate";
    duplicateBtn.addEventListener("click", async () => {
      const newId = window.prompt("New persona id (slug):", `${persona.id}-copy`);
      if (!newId) return;
      try {
        await apiSend(`/api/personas/${persona.id}/duplicate`, "POST", { id: newId.trim() });
        await loadPersonas();
      } catch (error) {
        window.alert(error.message);
      }
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      if (!window.confirm(`Delete persona '${persona.id}'?`)) return;
      try {
        await apiSend(`/api/personas/${persona.id}`, "DELETE", {});
        state.selectedPersonas = state.selectedPersonas.filter(
          (entry) => !(entry.type === "saved" && entry.id === persona.id)
        );
        renderSelectedPersonas();
        await loadPersonas();
      } catch (error) {
        window.alert(error.message);
      }
    });

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "Add to Debate";
    addBtn.addEventListener("click", () => addSavedPersonaToSelection(persona.id));

    actions.append(editBtn, duplicateBtn, delBtn, addBtn);
    card.appendChild(actions);
    container.appendChild(card);
  });
}

function selectedLabel(entry) {
  if (entry.type === "saved") {
    const persona = state.personas.find((p) => p.id === entry.id);
    if (!persona) return `Saved (${entry.id})`;
    const packs = Array.isArray(persona.knowledgePackIds) ? persona.knowledgePackIds.length : 0;
    return `${persona.displayName} (${persona.id})${packs ? ` | persona packs: ${packs}` : ""}`;
  }
  const packs = Array.isArray(entry.persona?.knowledgePackIds)
    ? entry.persona.knowledgePackIds.length
    : 0;
  return `Ad-hoc: ${entry.persona.displayName}${packs ? ` | persona packs: ${packs}` : ""}`;
}

function renderSelectedPersonas() {
  const container = byId("selected-personas");
  container.innerHTML = "";

  if (!state.selectedPersonas.length) {
    container.textContent = "No personas selected yet.";
    return;
  }

  state.selectedPersonas.forEach((entry, index) => {
    const card = document.createElement("div");
    card.className = "card";
    card.draggable = true;
    card.dataset.index = String(index);

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = `${index + 1}. ${selectedLabel(entry)}`;
    card.appendChild(title);

    const actions = document.createElement("div");
    actions.className = "row";

    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "Up";
    up.disabled = index === 0;
    up.addEventListener("click", () => {
      const temp = state.selectedPersonas[index - 1];
      state.selectedPersonas[index - 1] = state.selectedPersonas[index];
      state.selectedPersonas[index] = temp;
      renderSelectedPersonas();
    });

    const down = document.createElement("button");
    down.type = "button";
    down.textContent = "Down";
    down.disabled = index === state.selectedPersonas.length - 1;
    down.addEventListener("click", () => {
      const temp = state.selectedPersonas[index + 1];
      state.selectedPersonas[index + 1] = state.selectedPersonas[index];
      state.selectedPersonas[index] = temp;
      renderSelectedPersonas();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      state.selectedPersonas.splice(index, 1);
      renderSelectedPersonas();
    });

    actions.append(up, down, remove);
    card.appendChild(actions);

    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", String(index));
      event.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
    });
    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      const fromIdx = Number(event.dataTransfer.getData("text/plain"));
      const toIdx = index;
      if (!Number.isFinite(fromIdx) || fromIdx === toIdx) return;
      const next = state.selectedPersonas.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      state.selectedPersonas = next;
      renderSelectedPersonas();
    });

    container.appendChild(card);
  });
}

function normalizeTopicSource(item) {
  return {
    title: String(item?.title || "").trim(),
    source: String(item?.source || "").trim(),
    url: String(item?.url || "").trim(),
    publishedAt: item?.publishedAt || null,
    snippet: String(item?.snippet || "").trim()
  };
}

function renderSelectedTopicSummary() {
  const el = byId("topic-selected-summary");
  const selected = state.topicDiscovery.selected;
  if (!selected) {
    el.textContent = "No current-event topic selected. Manual topic generation is available.";
    return;
  }
  const sourceLabel = selected.source || "Manual Topic";
  el.textContent = `Selected topic: ${selected.title} | Source: ${sourceLabel} | Published: ${selected.publishedAt || "n/a"}`;
}

function renderTopicDiscoveryResults() {
  const container = byId("topic-discovery-results");
  container.innerHTML = "";
  const results = state.topicDiscovery.results || [];

  if (!results.length) {
    container.textContent = "No topic results yet.";
    return;
  }

  results.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "topic-result";
    const source = item.source || "Unknown";
    card.innerHTML = `
      <div class="topic-result-title">${item.title}</div>
      <div class="admin-item-sub">${source} | ${item.publishedAt || "Unknown date"}</div>
      <div>${item.snippet || ""}</div>
      <a href="${item.url}" target="_blank" rel="noopener">Open source</a>
    `;

    const row = document.createElement("div");
    row.className = "row";
    const useBtn = document.createElement("button");
    useBtn.type = "button";
    useBtn.textContent = state.topicDiscovery.selected?.url === item.url ? "Selected" : "Use Topic";
    useBtn.disabled = state.topicDiscovery.selected?.url === item.url;
    useBtn.addEventListener("click", () => {
      state.topicDiscovery.selected = normalizeTopicSource(item);
      byId("debate-topic").value = item.title || byId("debate-topic").value;
      if (!byId("debate-context").value.trim()) {
        byId("debate-context").value = item.snippet || "";
      }
      renderSelectedTopicSummary();
      renderTopicDiscoveryResults();
    });
    row.appendChild(useBtn);
    card.appendChild(row);
    container.appendChild(card);

    if (index >= 20) return;
  });
}

function renderKnowledgePacks() {
  const container = byId("knowledge-pack-list");
  container.innerHTML = "";

  if (!state.knowledgePacks.length) {
    container.textContent = "No knowledge packs found.";
    return;
  }

  state.knowledgePacks.forEach((pack) => {
    const card = document.createElement("div");
    card.className = "topic-result";
    const selected = state.selectedKnowledgePackIds.includes(pack.id);
    card.innerHTML = `
      <div class="topic-result-title">${pack.title}</div>
      <div class="admin-item-sub">${pack.id} | tags: ${(pack.tags || []).join(", ") || "none"}</div>
      <div>${pack.description || ""}</div>
    `;

    const row = document.createElement("div");
    row.className = "row";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = selected ? "Attached" : "Attach";
    btn.disabled = selected;
    btn.addEventListener("click", () => {
      if (!state.selectedKnowledgePackIds.includes(pack.id)) {
        state.selectedKnowledgePackIds.push(pack.id);
      }
      renderKnowledgePacks();
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "Remove";
    removeBtn.disabled = !selected;
    removeBtn.addEventListener("click", () => {
      state.selectedKnowledgePackIds = state.selectedKnowledgePackIds.filter((id) => id !== pack.id);
      renderKnowledgePacks();
    });

    row.append(btn, removeBtn);
    card.appendChild(row);
    container.appendChild(card);
  });
}

function renderKnowledgeStudioList() {
  const container = byId("knowledge-studio-list");
  container.innerHTML = "";

  if (!state.knowledgePacks.length) {
    container.textContent = "No knowledge packs available yet.";
    return;
  }

  state.knowledgePacks.forEach((pack) => {
    const card = document.createElement("div");
    card.className = "topic-result";
    card.innerHTML = `
      <div class="topic-result-title">${pack.title}</div>
      <div class="admin-item-sub">${pack.id} | tags: ${(pack.tags || []).join(", ") || "none"}</div>
      <div>${pack.description || ""}</div>
      <pre class="knowledge-content-preview">${String(pack.content || "").slice(0, 900)}${String(pack.content || "").length > 900 ? "..." : ""}</pre>
    `;

    const row = document.createElement("div");
    row.className = "row";

    const attachBtn = document.createElement("button");
    attachBtn.type = "button";
    const already = state.selectedKnowledgePackIds.includes(pack.id);
    attachBtn.textContent = already ? "Attached in Debate Setup" : "Attach for Debate";
    attachBtn.disabled = already;
    attachBtn.addEventListener("click", () => {
      if (!state.selectedKnowledgePackIds.includes(pack.id)) {
        state.selectedKnowledgePackIds.push(pack.id);
      }
      renderKnowledgePacks();
      renderKnowledgeStudioList();
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      if (!window.confirm(`Delete knowledge pack '${pack.id}'?`)) return;
      try {
        await apiSend(`/api/knowledge/${encodeURIComponent(pack.id)}`, "DELETE", {});
        state.selectedKnowledgePackIds = state.selectedKnowledgePackIds.filter((id) => id !== pack.id);
        await loadKnowledgePacks();
      } catch (error) {
        window.alert(`Delete failed: ${error.message}`);
      }
    });

    row.append(attachBtn, delBtn);
    card.appendChild(row);
    container.appendChild(card);
  });
}

function renderGeneratedTopicDrafts() {
  const container = byId("topic-generated-drafts");
  container.innerHTML = "";
  const drafts = state.topicDiscovery.generatedDrafts || [];

  if (!drafts.length) {
    container.textContent = "No generated persona drafts yet.";
    return;
  }

  drafts.forEach((draft, idx) => {
    const p = draft.persona || {};
    const card = document.createElement("div");
    card.className = "topic-result";
    card.innerHTML = `
      <div class="topic-result-title">${p.displayName || `Generated Persona ${idx + 1}`}</div>
      <div class="admin-item-sub">${p.role || "No role"} | suggested id: ${draft.suggestedId || "generated-persona"}</div>
      <div>${p.description || ""}</div>
      <div class="admin-item-sub">Tags: ${(p.expertiseTags || []).join(", ") || "none"}</div>
    `;

    const row = document.createElement("div");
    row.className = "row";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "Add to Debate";
    addBtn.addEventListener("click", () => {
      state.selectedPersonas.push({
        type: "adhoc",
        savePersona: false,
        persona: {
          ...p,
          id: draft.suggestedId || p.id
        }
      });
      renderSelectedPersonas();
    });

    const saveAddBtn = document.createElement("button");
    saveAddBtn.type = "button";
    saveAddBtn.textContent = "Save + Add";
    saveAddBtn.addEventListener("click", async () => {
      try {
        const payload = {
          ...p,
          id: draft.suggestedId || p.id
        };
        const data = await apiSend("/api/personas", "POST", payload);
        const id = data?.persona?.id || payload.id;
        const exists = state.selectedPersonas.some((entry) => entry.type === "saved" && entry.id === id);
        if (!exists) state.selectedPersonas.push({ type: "saved", id });
        await loadPersonas();
        renderSelectedPersonas();
      } catch (error) {
        window.alert(`Save failed: ${error.message}`);
      }
    });

    row.append(addBtn, saveAddBtn);
    card.appendChild(row);
    container.appendChild(card);
  });
}

async function searchCurrentEventTopics() {
  const query = byId("topic-discovery-query").value.trim();
  if (!query) {
    byId("topic-selected-summary").textContent = "Enter a query to search current events.";
    return;
  }
  byId("topic-selected-summary").textContent = "Searching current events...";

  try {
    const data = await apiGet(
      `/api/topics/current-events?query=${encodeURIComponent(query)}&limit=8&recencyDays=7`
    );
    state.topicDiscovery.query = query;
    state.topicDiscovery.provider = data.provider || "";
    state.topicDiscovery.results = Array.isArray(data.items) ? data.items.map(normalizeTopicSource) : [];
    state.topicDiscovery.selected = state.topicDiscovery.results[0] || null;
    state.topicDiscovery.generatedDrafts = [];
    renderTopicDiscoveryResults();
    renderSelectedTopicSummary();
    renderGeneratedTopicDrafts();
  } catch (error) {
    byId("topic-selected-summary").textContent = `Topic discovery failed: ${error.message}`;
  }
}

async function generatePersonasFromSelectedTopic() {
  const manualTopic = byId("debate-topic").value.trim();
  const manualContext = byId("debate-context").value.trim();

  let selected = state.topicDiscovery.selected;
  if (!selected && Array.isArray(state.topicDiscovery.results) && state.topicDiscovery.results.length) {
    selected = state.topicDiscovery.results[0];
    state.topicDiscovery.selected = selected;
    renderSelectedTopicSummary();
    renderTopicDiscoveryResults();
  }

  if (!selected && manualTopic) {
    selected = {
      title: manualTopic,
      source: "Manual Topic",
      url: "",
      publishedAt: null,
      snippet: manualContext
    };
    state.topicDiscovery.selected = selected;
    renderSelectedTopicSummary();
  }

  if (!selected) {
    byId("topic-selected-summary").textContent =
      "Add a manual Topic/Context or select a discovered topic first.";
    return;
  }

  const count = safeNumberInput(byId("topic-persona-count").value, 3, {
    min: 1,
    max: 6,
    integer: true
  });
  byId("topic-selected-summary").textContent = "Generating personas from selected topic...";

  try {
    const data = await apiSend("/api/personas/generate-from-topic", "POST", {
      topic: selected.title,
      context: [selected.snippet, manualContext].filter(Boolean).join(" | "),
      count,
      model: byId("debate-model").value.trim() || "gpt-4.1-mini",
      sources: selected.source === "Manual Topic" ? [] : (state.topicDiscovery.results || []).slice(0, 8)
    });
    state.topicDiscovery.generatedDrafts = Array.isArray(data.drafts) ? data.drafts : [];
    renderGeneratedTopicDrafts();
    byId("topic-selected-summary").textContent = `Generated ${state.topicDiscovery.generatedDrafts.length} persona drafts from topic.`;
  } catch (error) {
    byId("topic-selected-summary").textContent = `Persona generation failed: ${error.message}`;
  }
}

function useManualTopicForGeneration() {
  const topic = byId("debate-topic").value.trim();
  const context = byId("debate-context").value.trim();
  if (!topic) {
    byId("topic-selected-summary").textContent = "Enter a Topic/Title first, then click Use Manual Topic.";
    return;
  }
  state.topicDiscovery.selected = {
    title: topic,
    source: "Manual Topic",
    url: "",
    publishedAt: null,
    snippet: context
  };
  renderSelectedTopicSummary();
  renderTopicDiscoveryResults();
}

function renderAdminSummaryCards() {
  const el = byId("admin-summary-cards");
  const totals = state.adminOverview?.totals || {};
  const usageUsers = state.adminUsage?.byUser || [];
  const cards = [
    { label: "Conversations", value: totals.totalConversations ?? ((totals.debates || 0) + (totals.chats || 0)) },
    { label: "Debates", value: totals.debates ?? 0 },
    { label: "Chats", value: totals.chats ?? 0 },
    { label: "Total Tokens", value: Number(totals.totalTokens || 0).toLocaleString() },
    { label: "Chat Messages", value: Number(totals.chatMessages || 0).toLocaleString() },
    { label: "Scope Refusals", value: Number(totals.scopeRefusals || 0).toLocaleString() },
    { label: "Grounded Replies", value: Number(totals.groundedReplies || 0).toLocaleString() },
    { label: "Ungrounded Replies", value: Number(totals.ungroundedReplies || 0).toLocaleString() },
    { label: "Risk Red", value: Number(totals.stoplightRed || 0).toLocaleString() },
    { label: "Risk Yellow", value: Number(totals.stoplightYellow || 0).toLocaleString() },
    { label: "Risk Green", value: Number(totals.stoplightGreen || 0).toLocaleString() },
    { label: "Sentiment +", value: Number(totals.sentimentPositive || 0).toLocaleString() },
    { label: "Sentiment -", value: Number(totals.sentimentNegative || 0).toLocaleString() },
    { label: "Active Users", value: Number(usageUsers.length || 0).toLocaleString() },
    {
      label: "Est. Cost (USD)",
      value:
        typeof totals.estimatedCostUsd === "number"
          ? totals.estimatedCostUsd.toFixed(4)
          : "n/a"
    }
  ];

  el.innerHTML = cards
    .map(
      (c) => `<div class="metric-card"><div class="metric-label">${c.label}</div><div class="metric-value">${c.value}</div></div>`
    )
    .join("");
}

function formatAdminUsd(value) {
  return typeof value === "number" ? `$${value.toFixed(6)}` : "n/a";
}

function getPersonaNameMaps() {
  const idToName = new Map();
  const nameToId = new Map();
  (state.adminPersonas?.personas || []).forEach((p) => {
    idToName.set(p.id, p.displayName);
    nameToId.set(String(p.displayName || "").toLowerCase(), p.id);
  });
  return { idToName, nameToId };
}

function buildUsageUserRows() {
  const usageRows = state.adminUsage?.byUser || [];
  return usageRows.map((row) => ({
    key: row.userId || "anonymous",
    label: row.username || row.userId || "anonymous",
    requests: Number(row.requests || 0),
    lastSeenAt: row.lastSeenAt || null
  }));
}

function buildAdminMatrixRows() {
  const debates = state.adminOverview?.debates || [];
  const chats = state.adminChats?.chats || state.adminOverview?.chats || [];
  const personas = state.adminPersonas?.personas || [];
  const { idToName, nameToId } = getPersonaNameMaps();

  const rowsByDimension = {
    channel: [],
    model: [],
    persona: [],
    user: []
  };

  const channelMap = new Map();
  const modelMap = new Map();
  const personaMap = new Map(
    personas.map((p) => [
      p.id,
      {
        key: p.id,
        label: p.displayName,
        conversations: 0,
        tokens: 0,
        cost: 0,
        messages: 0,
        scopeRefusals: 0,
        grounded: 0
      }
    ])
  );
  const userMap = new Map();

  function ensureMetricRow(map, key, label) {
    if (!map.has(key)) {
      map.set(key, {
        key,
        label,
        conversations: 0,
        tokens: 0,
        cost: 0,
        messages: 0,
        scopeRefusals: 0,
        grounded: 0
      });
    }
    return map.get(key);
  }

  debates.forEach((debate) => {
    const model = debate.model || "unknown";
    const turns = Number(debate.drillSummary?.turns || 0);
    const tokens = Number(debate.tokenUsage?.totalTokens || 0);
    const cost = typeof debate.estimatedCostUsd === "number" ? debate.estimatedCostUsd : 0;
    const channelRow = ensureMetricRow(channelMap, "debate", "Debate");
    const modelRow = ensureMetricRow(modelMap, model, model);
    const username = String(debate.createdByUsername || "unknown");
    const userRow = ensureMetricRow(userMap, username.toLowerCase(), username);
    channelRow.conversations += 1;
    channelRow.tokens += tokens;
    channelRow.cost += cost;
    channelRow.messages += turns;
    modelRow.conversations += 1;
    modelRow.tokens += tokens;
    modelRow.cost += cost;
    modelRow.messages += turns;
    userRow.conversations += 1;
    userRow.tokens += tokens;
    userRow.cost += cost;
    userRow.messages += turns;

    (debate.participants || []).forEach((name) => {
      const pid = nameToId.get(String(name).toLowerCase());
      if (!pid || !personaMap.has(pid)) return;
      const row = personaMap.get(pid);
      row.conversations += 1;
      row.tokens += tokens;
      row.cost += cost;
      row.messages += turns;
    });
  });

  chats.forEach((chat) => {
    const model = chat.model || "unknown";
    const kind = chat.kind === "simple" ? "simple" : "group";
    const label = kind === "simple" ? "Simple Chat" : "Group Chat";
    const tokens = Number(chat.tokenUsage?.totalTokens || 0);
    const cost = typeof chat.estimatedCostUsd === "number" ? chat.estimatedCostUsd : 0;
    const messages = Number(chat.messageCount || 0);
    const scopeRefusals = Number(chat.responsibleAi?.scopeRefusalCount || 0);
    const grounded = Number(chat.responsibleAi?.groundedReplyCount || 0);
    const channelRow = ensureMetricRow(channelMap, kind, label);
    const modelRow = ensureMetricRow(modelMap, model, model);
    const username = String(chat.createdByUsername || "unknown");
    const userRow = ensureMetricRow(userMap, username.toLowerCase(), username);

    channelRow.conversations += 1;
    channelRow.tokens += tokens;
    channelRow.cost += cost;
    channelRow.messages += messages;
    channelRow.scopeRefusals += scopeRefusals;
    channelRow.grounded += grounded;

    modelRow.conversations += 1;
    modelRow.tokens += tokens;
    modelRow.cost += cost;
    modelRow.messages += messages;
    modelRow.scopeRefusals += scopeRefusals;
    modelRow.grounded += grounded;
    userRow.conversations += 1;
    userRow.tokens += tokens;
    userRow.cost += cost;
    userRow.messages += messages;
    userRow.scopeRefusals += scopeRefusals;
    userRow.grounded += grounded;

    (chat.participants || []).forEach((name) => {
      const pid = nameToId.get(String(name).toLowerCase());
      if (!pid || !personaMap.has(pid)) return;
      const row = personaMap.get(pid);
      row.conversations += 1;
      row.tokens += tokens;
      row.cost += cost;
      row.messages += messages;
      row.scopeRefusals += scopeRefusals;
      row.grounded += grounded;
    });
  });

  rowsByDimension.channel = [...channelMap.values()].sort((a, b) => b.conversations - a.conversations);
  rowsByDimension.model = [...modelMap.values()].sort((a, b) => b.tokens - a.tokens);
  rowsByDimension.user = [...userMap.values()].sort((a, b) => b.conversations - a.conversations);
  rowsByDimension.persona = [...personaMap.values()]
    .filter((row) => row.conversations > 0 || row.messages > 0)
    .sort((a, b) => b.conversations - a.conversations || String(a.label).localeCompare(String(b.label)));

  // Keep known personas visible even with zero activity when persona dimension is selected.
  if (!rowsByDimension.persona.length && personas.length) {
    rowsByDimension.persona = personas.map((p) => ({
      key: p.id,
      label: idToName.get(p.id) || p.displayName,
      conversations: 0,
      tokens: 0,
      cost: 0,
      messages: 0,
      scopeRefusals: 0,
      grounded: 0
    }));
  }

  return rowsByDimension;
}

function renderAdminFilterSummary() {
  const el = byId("admin-filter-summary");
  if (!state.adminFilter) {
    el.textContent = "No active drill filter.";
    return;
  }
  const metricText = state.adminMetricFocus ? ` | metric = ${state.adminMetricFocus}` : "";
  el.textContent = `Active filter: ${state.adminFilter.dimension} = ${state.adminFilter.label}${metricText}`;
}

function setAdminFilter(filter, nextView = null, metricFocus = null) {
  state.adminFilter = filter;
  state.adminMetricFocus = metricFocus;
  if (nextView) state.adminView = nextView;
  renderAdminFilterSummary();
  renderAdminMatrix();
  renderAdminList();
  renderAdminCharts();
}

function getHeatClass(value, max) {
  if (!max || value <= 0) return "";
  const ratio = value / max;
  if (ratio >= 0.66) return "hot-3";
  if (ratio >= 0.33) return "hot-2";
  return "hot-1";
}

function renderAdminMatrix() {
  const container = byId("admin-matrix");
  const rowsByDimension = buildAdminMatrixRows();
  const dimension = state.adminMatrixDimension || "channel";
  const rows = rowsByDimension[dimension] || [];

  if (!rows.length) {
    container.textContent = "No metrics yet.";
    return;
  }

  const maxes = rows.reduce(
    (acc, row) => {
      acc.conversations = Math.max(acc.conversations, Number(row.conversations || 0));
      acc.tokens = Math.max(acc.tokens, Number(row.tokens || 0));
      acc.cost = Math.max(acc.cost, Number(row.cost || 0));
      acc.messages = Math.max(acc.messages, Number(row.messages || 0));
      acc.scopeRefusals = Math.max(acc.scopeRefusals, Number(row.scopeRefusals || 0));
      acc.grounded = Math.max(acc.grounded, Number(row.grounded || 0));
      return acc;
    },
    { conversations: 0, tokens: 0, cost: 0, messages: 0, scopeRefusals: 0, grounded: 0 }
  );

  container.innerHTML = `
    <table class="admin-matrix-table">
      <thead>
        <tr>
          <th>${dimension[0].toUpperCase()}${dimension.slice(1)}</th>
          <th>Conversations</th>
          <th>Tokens</th>
          <th>Cost (USD)</th>
          <th>Messages</th>
          <th>Scope Flags</th>
          <th>Grounded</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
          <tr data-dimension="${dimension}" data-key="${row.key}" data-label="${row.label}">
            <td><button type="button" class="admin-matrix-name">${row.label}</button></td>
            <td><button type="button" class="admin-matrix-cell ${getHeatClass(Number(row.conversations || 0), maxes.conversations)}" data-metric="conversations">${Number(row.conversations || 0).toLocaleString()}</button></td>
            <td><button type="button" class="admin-matrix-cell ${getHeatClass(Number(row.tokens || 0), maxes.tokens)}" data-metric="tokens">${Number(row.tokens || 0).toLocaleString()}</button></td>
            <td><button type="button" class="admin-matrix-cell ${getHeatClass(Number(row.cost || 0), maxes.cost)}" data-metric="cost">${formatAdminUsd(Number(row.cost || 0))}</button></td>
            <td><button type="button" class="admin-matrix-cell ${getHeatClass(Number(row.messages || 0), maxes.messages)}" data-metric="messages">${Number(row.messages || 0).toLocaleString()}</button></td>
            <td><button type="button" class="admin-matrix-cell ${getHeatClass(Number(row.scopeRefusals || 0), maxes.scopeRefusals)}" data-metric="scopeRefusals">${Number(row.scopeRefusals || 0).toLocaleString()}</button></td>
            <td><button type="button" class="admin-matrix-cell ${getHeatClass(Number(row.grounded || 0), maxes.grounded)}" data-metric="grounded">${Number(row.grounded || 0).toLocaleString()}</button></td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  function chooseNextViewForFilter(filter, metricFocus = null) {
    if (filter.dimension === "channel") {
      return filter.key === "debate" ? "debates" : "chats";
    }
    if (filter.dimension === "persona") {
      if (metricFocus === "scopeRefusals" || metricFocus === "grounded") return "chats";
      return "personas";
    }
    if (filter.dimension === "model") {
      if (metricFocus === "scopeRefusals" || metricFocus === "grounded") return "chats";
      return state.adminView;
    }
    if (filter.dimension === "user") {
      if (metricFocus === "scopeRefusals" || metricFocus === "grounded") return "chats";
      return state.adminView;
    }
    return state.adminView;
  }

  container.querySelectorAll("tr[data-key] .admin-matrix-name").forEach((nameEl) => {
    nameEl.addEventListener("click", (event) => {
      event.stopPropagation();
      const rowEl = nameEl.closest("tr[data-key]");
      if (!rowEl) return;
      const filter = {
        dimension: rowEl.getAttribute("data-dimension"),
        key: rowEl.getAttribute("data-key"),
        label: rowEl.getAttribute("data-label")
      };
      const nextView = chooseNextViewForFilter(filter, null);
      setAdminFilter(filter, nextView, null);
    });
  });

  container.querySelectorAll("tr[data-key] .admin-matrix-cell").forEach((cellEl) => {
    cellEl.addEventListener("click", (event) => {
      event.stopPropagation();
      const rowEl = cellEl.closest("tr[data-key]");
      if (!rowEl) return;
      const filter = {
        dimension: rowEl.getAttribute("data-dimension"),
        key: rowEl.getAttribute("data-key"),
        label: rowEl.getAttribute("data-label")
      };
      const metricFocus = cellEl.getAttribute("data-metric");
      const nextView = chooseNextViewForFilter(filter, metricFocus);
      setAdminFilter(filter, nextView, metricFocus);
    });
  });
}

function getFilteredGovernanceData() {
  const debates = applyDebateFilter(state.adminOverview?.debates || []);
  const chats = applyChatFilter(state.adminChats?.chats || state.adminOverview?.chats || []);
  return { debates, chats };
}

function aggregateSignals(records) {
  return records.reduce(
    (acc, record) => {
      acc.red += Number(record.responsibleAi?.stoplights?.red || 0);
      acc.yellow += Number(record.responsibleAi?.stoplights?.yellow || 0);
      acc.green += Number(record.responsibleAi?.stoplights?.green || 0);
      acc.positive += Number(record.responsibleAi?.sentiment?.positive || 0);
      acc.neutral += Number(record.responsibleAi?.sentiment?.neutral || 0);
      acc.negative += Number(record.responsibleAi?.sentiment?.negative || 0);
      return acc;
    },
    { red: 0, yellow: 0, green: 0, positive: 0, neutral: 0, negative: 0 }
  );
}

function renderVizCard(title, rows) {
  const max = rows.reduce((m, r) => Math.max(m, Number(r.value || 0)), 0);
  const body = rows.length
    ? rows
        .map((row) => {
          const pct = max > 0 ? Math.max(3, Math.round((Number(row.value || 0) / max) * 100)) : 0;
          return `
            <div class="viz-row">
              <div>${row.label}</div>
              <div class="viz-bar-track"><div class="viz-bar-fill" style="width:${pct}%"></div></div>
              <div class="viz-value">${row.valueText || Number(row.value || 0).toLocaleString()}</div>
            </div>
          `;
        })
        .join("")
    : `<div class="muted">No data.</div>`;
  return `<div class="viz-card"><div class="viz-title">${title}</div><div class="viz-bars">${body}</div></div>`;
}

function renderAdminCharts() {
  const statusEl = byId("admin-chart-status");
  const chartsEl = byId("admin-charts");
  if (!chartsEl || !statusEl) return;

  const { debates, chats } = getFilteredGovernanceData();
  const records = [...debates, ...chats];
  const signals = aggregateSignals(records);
  const channelRows = buildAdminMatrixRows().channel || [];
  const modelRows = (buildAdminMatrixRows().model || []).slice(0, 6);
  const userRows = (buildAdminMatrixRows().user || []).slice(0, 8);

  chartsEl.innerHTML = [
    renderVizCard(
      "Conversations by Channel",
      channelRows.map((row) => ({ label: row.label, value: row.conversations }))
    ),
    renderVizCard("Top Models by Cost", modelRows.map((row) => ({
      label: row.label,
      value: Number(row.cost || 0),
      valueText: formatAdminUsd(Number(row.cost || 0))
    }))),
    renderVizCard("Risk Stoplights", [
      { label: "Red", value: signals.red },
      { label: "Yellow", value: signals.yellow },
      { label: "Green", value: signals.green }
    ]),
    renderVizCard("Sentiment", [
      { label: "Positive", value: signals.positive },
      { label: "Neutral", value: signals.neutral },
      { label: "Negative", value: signals.negative }
    ]),
    renderVizCard("Top Users by Conversations", userRows.map((row) => ({
      label: row.label,
      value: row.conversations
    })))
  ].join("");

  statusEl.textContent = `Charts reflect ${records.length} filtered conversation(s).`;
}

function renderGovernanceChatHistory() {
  const container = byId("gov-chat-history");
  if (!container) return;
  container.innerHTML = "";
  const chatId = state.governanceChat.activeChatId;
  if (!chatId) {
    container.textContent = "No governance chat loaded.";
    return;
  }
  const history = state.governanceChat.historyByChat[chatId] || [];
  if (!history.length) {
    container.textContent = "No messages yet.";
    return;
  }
  history.forEach((msg) => {
    const roleClass = msg.role === "user" ? "user" : msg.role === "orchestrator" ? "system" : "assistant";
    const title = msg.role === "user" ? "You" : msg.role === "orchestrator" ? "Orchestrator" : (msg.displayName || "Governance Admin");
    renderExchangeMessage(container, {
      roleClass,
      title,
      content: msg.content || ""
    });
  });
  container.scrollTop = container.scrollHeight;
}

function renderGovernanceChatSessions() {
  const container = byId("gov-chat-session-list");
  const status = byId("gov-chat-search-status");
  if (!container) return;
  container.innerHTML = "";
  const query = String(state.governanceChat.searchQuery || "").trim();
  const sessions = state.governanceChat.sessions || [];

  if (!query) {
    container.classList.add("hidden");
    if (status) status.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");
  if (status) status.classList.remove("hidden");

  if (!sessions.length) {
    container.textContent = "No matches found.";
    if (status) status.textContent = `No governance chats matched "${query}".`;
    return;
  }

  if (status) status.textContent = `Found ${sessions.length} governance chat(s) for "${query}".`;

  sessions.forEach((session) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-title">${session.title || "Governance Admin Chat"}</div>
      <div class="muted">${session.chatId}</div>
      <div>Messages: ${session.messageCount || 0}</div>
      <div>Created: ${session.createdAt || "n/a"}</div>
    `;
    const row = document.createElement("div");
    row.className = "row";
    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.textContent = "Load Chat";
    loadBtn.addEventListener("click", () => loadGovernanceChatSession(session.chatId));
    row.appendChild(loadBtn);
    card.appendChild(row);
    container.appendChild(card);
  });
}

async function searchGovernanceChatSessions() {
  const query = byId("gov-chat-search")?.value.trim() || "";
  state.governanceChat.searchQuery = query;
  const status = byId("gov-chat-search-status");
  if (!query) {
    state.governanceChat.sessions = [];
    renderGovernanceChatSessions();
    return;
  }
  if (status) {
    status.classList.remove("hidden");
    status.textContent = "Searching governance chats...";
  }
  try {
    const data = await apiGet("/api/admin/governance-chat");
    const all = Array.isArray(data.chats) ? data.chats : [];
    const q = query.toLowerCase();
    state.governanceChat.sessions = all.filter((chat) => {
      const id = String(chat.chatId || "").toLowerCase();
      const title = String(chat.title || "").toLowerCase();
      return id.includes(q) || title.includes(q);
    });
    renderGovernanceChatSessions();
  } catch (error) {
    if (status) status.textContent = `Failed to search governance chats: ${error.message}`;
  }
}

async function createGovernanceChatSession() {
  const status = byId("gov-chat-create-status");
  status.textContent = "Creating governance admin chat...";
  try {
    const data = await apiSend("/api/admin/governance-chat/session", "POST", {});
    status.textContent = `Created governance chat ${data.chatId}`;
    state.governanceChat.searchQuery = "";
    byId("gov-chat-search").value = "";
    renderGovernanceChatSessions();
    await loadGovernanceChatSession(data.chatId);
  } catch (error) {
    status.textContent = `Create failed: ${error.message}`;
  }
}

async function loadGovernanceChatSession(chatId) {
  const id = String(chatId || "").trim();
  const status = byId("gov-chat-status");
  if (!id) {
    status.textContent = "Chat id is required.";
    return;
  }
  status.textContent = `Loading ${id}...`;
  try {
    const data = await apiGet(`/api/admin/governance-chat/${encodeURIComponent(id)}`);
    state.governanceChat.activeChatId = id;
    state.governanceChat.historyByChat[id] = Array.isArray(data.messages) ? data.messages : [];
    byId("gov-chat-id").value = id;
    state.governanceChat.searchQuery = "";
    byId("gov-chat-search").value = "";
    renderGovernanceChatSessions();
    renderGovernanceChatHistory();
    status.textContent = `Loaded governance chat ${id}`;
  } catch (error) {
    status.textContent = `Failed to load governance chat: ${error.message}`;
  }
}

async function sendGovernanceChatMessage() {
  const status = byId("gov-chat-status");
  const input = byId("gov-chat-message");
  const chatId = state.governanceChat.activeChatId || byId("gov-chat-id").value.trim();
  const message = input.value.trim();
  if (!chatId) {
    status.textContent = "Create or load a governance chat first.";
    return;
  }
  if (!message) return;

  if (!state.governanceChat.historyByChat[chatId]) state.governanceChat.historyByChat[chatId] = [];
  state.governanceChat.historyByChat[chatId].push({ role: "user", content: message });
  state.governanceChat.activeChatId = chatId;
  renderGovernanceChatHistory();
  input.value = "";
  status.textContent = "Thinking...";

  try {
    const data = await apiSend(`/api/admin/governance-chat/${encodeURIComponent(chatId)}/messages`, "POST", {
      message
    });
    if (data.orchestration?.content) {
      state.governanceChat.historyByChat[chatId].push({
        role: "orchestrator",
        content: data.orchestration.content
      });
    }
    const responses = Array.isArray(data.responses) ? data.responses : [];
    state.governanceChat.historyByChat[chatId].push(...responses);
    renderGovernanceChatHistory();
    status.textContent = `Received ${responses.length} response(s).`;
  } catch (error) {
    status.textContent = `Governance chat failed: ${error.message}`;
  }
}

function getMetricValue(item, metric) {
  if (!metric) return 0;
  if (metric === "tokens") return Number(item.tokenUsage?.totalTokens || 0);
  if (metric === "cost") return Number(item.estimatedCostUsd || 0);
  if (metric === "messages") {
    if (typeof item.messageCount === "number") return Number(item.messageCount || 0);
    return Number(item.drillSummary?.turns || 0);
  }
  if (metric === "conversations") return 1;
  if (metric === "scopeRefusals") return Number(item.responsibleAi?.scopeRefusalCount || 0);
  if (metric === "grounded") return Number(item.responsibleAi?.groundedReplyCount || 0);
  return 0;
}

function sortByMetric(items, metric) {
  if (!metric) return items;
  return [...items].sort((a, b) => {
    const delta = getMetricValue(b, metric) - getMetricValue(a, metric);
    if (delta !== 0) return delta;
    return String(b.lastActivityAt || b.createdAt || b.title || b.chatId || b.debateId || "").localeCompare(
      String(a.lastActivityAt || a.createdAt || a.title || a.chatId || a.debateId || "")
    );
  });
}

async function openDebateInHistory(debateId) {
  switchTab("chats");
  setChatsView("group");
  setGroupWorkspace("debate-viewer");
  byId("viewer-conversation-type").value = "debate";
  byId("viewer-conversation-select").value = debateId;
  renderViewerHistoryBrowser("debate");
  try {
    await loadViewerConversation("debate", debateId);
  } catch (error) {
    byId("viewer-progress").textContent = `Failed to open debate: ${error.message}`;
  }
}

async function openChatInHistory(chatId, kind = "group") {
  try {
    switchTab("chats");
    if (kind === "simple") {
      setChatsView("simple");
      await loadSimpleChatSession(chatId);
      return;
    }
    setChatsView("group");
    setGroupWorkspace("live");
    await loadPersonaChatSession(chatId);
  } catch (error) {
    window.alert(`Failed to open chat history: ${error.message}`);
  }
}

function applyDebateFilter(debates) {
  const filter = state.adminFilter;
  if (!filter) return debates;
  if (filter.dimension === "model") {
    return debates.filter((d) => String(d.model || "") === filter.key);
  }
  if (filter.dimension === "persona") {
    return debates.filter((d) => (d.participants || []).some((name) => String(name) === String(filter.label)));
  }
  if (filter.dimension === "channel") {
    return filter.key === "debate" ? debates : [];
  }
  if (filter.dimension === "user") {
    return debates.filter((d) => String(d.createdByUsername || "unknown").toLowerCase() === String(filter.key));
  }
  return debates;
}

function applyChatFilter(chats) {
  const filter = state.adminFilter;
  if (!filter) return chats;
  if (filter.dimension === "model") {
    return chats.filter((c) => String(c.model || "") === filter.key);
  }
  if (filter.dimension === "persona") {
    return chats.filter((c) => (c.participants || []).some((name) => String(name) === String(filter.label)));
  }
  if (filter.dimension === "channel") {
    if (filter.key === "group") return chats.filter((c) => c.kind === "group");
    if (filter.key === "simple") return chats.filter((c) => c.kind === "simple");
    return [];
  }
  if (filter.dimension === "user") {
    return chats.filter((c) => String(c.createdByUsername || "unknown").toLowerCase() === String(filter.key));
  }
  return chats;
}

function renderAdminDebatesList() {
  const container = byId("admin-list");
  container.innerHTML = "";
  const debates = sortByMetric(applyDebateFilter(state.adminOverview?.debates || []), state.adminMetricFocus);

  if (!debates.length) {
    container.textContent = "No debates found.";
    return;
  }

  debates.forEach((debate) => {
    const item = document.createElement("div");
    item.className = "admin-item";
    item.innerHTML = `
      <div class="admin-item-head">
        <strong>${debate.title}</strong>
        <span class="admin-item-sub">${debate.status}</span>
      </div>
      <div class="admin-item-sub">Participants: ${debate.participants.join(", ") || "n/a"}</div>
      <div class="admin-item-sub">Topic: ${debate.topicSummary || "n/a"}</div>
      <div class="admin-item-sub">Outcomes: ${debate.outcomes || "n/a"}</div>
      <div class="admin-item-sub">Created by: ${debate.createdByUsername || "unknown"}</div>
      <div class="admin-item-sub">Tokens: ${Number(debate.tokenUsage?.totalTokens || 0).toLocaleString()} | Est. Cost: ${
        typeof debate.estimatedCostUsd === "number" ? `$${debate.estimatedCostUsd.toFixed(6)}` : "n/a"
      }</div>
      <div class="admin-item-sub">Risk: R ${Number(debate.responsibleAi?.stoplights?.red || 0)} | Y ${Number(debate.responsibleAi?.stoplights?.yellow || 0)} | G ${Number(debate.responsibleAi?.stoplights?.green || 0)}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "row";
    const open = document.createElement("button");
    open.type = "button";
    open.textContent = "Open in Debate Viewer";
    open.addEventListener("click", () => openDebateInHistory(debate.debateId));
    actions.appendChild(open);
    item.appendChild(actions);

    container.appendChild(item);
  });
}

function renderAdminPersonasList() {
  const container = byId("admin-list");
  container.innerHTML = "";
  const all = state.adminPersonas?.personas || [];
  const filter = state.adminFilter;
  let personas = !filter
    ? all
    : all.filter((persona) => {
        if (filter.dimension === "persona") return persona.id === filter.key;
        if (filter.dimension === "channel") {
          if (filter.key === "debate") return Number(persona.metrics?.debateCount || 0) > 0;
          if (filter.key === "group") return Number(persona.metrics?.chatCount || 0) > 0;
          if (filter.key === "simple") return false;
          return true;
        }
        if (filter.dimension === "model") {
          const debates = applyDebateFilter(state.adminOverview?.debates || []);
          const chats = applyChatFilter(state.adminChats?.chats || state.adminOverview?.chats || []);
          const usedNames = new Set([
            ...debates.flatMap((d) => d.participants || []),
            ...chats.flatMap((c) => c.participants || [])
          ]);
          return usedNames.has(persona.displayName);
        }
        if (filter.dimension === "user") {
          const debates = applyDebateFilter(state.adminOverview?.debates || []);
          const chats = applyChatFilter(state.adminChats?.chats || state.adminOverview?.chats || []);
          const usedNames = new Set([
            ...debates.flatMap((d) => d.participants || []),
            ...chats.flatMap((c) => c.participants || [])
          ]);
          return usedNames.has(persona.displayName);
        }
        return true;
      });
  if (state.adminMetricFocus) {
    personas = [...personas].sort((a, b) => {
      const aConversations = Number(a.metrics?.debateCount || 0) + Number(a.metrics?.chatCount || 0);
      const bConversations = Number(b.metrics?.debateCount || 0) + Number(b.metrics?.chatCount || 0);
      const aMessages = Number(a.metrics?.turnCount || 0) + Number(a.metrics?.chatTurnCount || 0);
      const bMessages = Number(b.metrics?.turnCount || 0) + Number(b.metrics?.chatTurnCount || 0);
      if (state.adminMetricFocus === "conversations") return bConversations - aConversations;
      if (state.adminMetricFocus === "messages") return bMessages - aMessages;
      return String(a.displayName || "").localeCompare(String(b.displayName || ""));
    });
  }

  if (!personas.length) {
    container.textContent = "No personas found.";
    return;
  }

  personas.forEach((persona) => {
    const item = document.createElement("div");
    item.className = "admin-item";
    item.innerHTML = `
      <div class="admin-item-head">
        <strong>${persona.displayName}</strong>
        <span class="admin-item-sub">${persona.id}</span>
      </div>
      <div class="admin-item-sub">Role: ${persona.role || "n/a"}</div>
      <div class="admin-item-sub">Tags: ${(persona.expertiseTags || []).join(", ") || "none"}</div>
      <div class="admin-item-sub">Debates: ${persona.metrics?.debateCount || 0} | Turns: ${
        persona.metrics?.turnCount || 0
      } | Avg words/turn: ${persona.metrics?.avgWordsPerTurn || 0}</div>
      <div class="admin-item-sub">Chats: ${persona.metrics?.chatCount || 0} | Chat turns: ${
        persona.metrics?.chatTurnCount || 0
      }</div>
      <div class="admin-item-sub">Last used: ${persona.metrics?.lastUsedAt || "n/a"}</div>
    `;
    container.appendChild(item);
  });
}

function renderAdminChatsList() {
  const container = byId("admin-list");
  container.innerHTML = "";
  const chats = sortByMetric(
    applyChatFilter(state.adminChats?.chats || state.adminOverview?.chats || []),
    state.adminMetricFocus
  );

  if (!chats.length) {
    container.textContent = "No persona chats found.";
    return;
  }

  chats.forEach((chat) => {
    const item = document.createElement("div");
    item.className = "admin-item";
    item.innerHTML = `
      <div class="admin-item-head">
        <strong>${chat.title || chat.chatId}</strong>
        <span class="admin-item-sub">${chat.kind || "chat"} | ${chat.chatId}</span>
      </div>
      <div class="admin-item-sub">Mode: ${chat.engagementMode || (chat.kind === "simple" ? "simple-chat" : "chat")}</div>
      <div class="admin-item-sub">Participants: ${(chat.participants || []).join(", ") || "n/a"}</div>
      <div class="admin-item-sub">Created by: ${chat.createdByUsername || "unknown"}</div>
      <div class="admin-item-sub">Turns: ${chat.turns || 0} | Messages: ${chat.messageCount || 0}</div>
      <div class="admin-item-sub">Tokens: ${Number(chat.tokenUsage?.totalTokens || 0).toLocaleString()} | Est. Cost: ${
        typeof chat.estimatedCostUsd === "number" ? `$${chat.estimatedCostUsd.toFixed(6)}` : "n/a"
      }</div>
      <div class="admin-item-sub">Risk: R ${Number(chat.responsibleAi?.stoplights?.red || 0)} | Y ${Number(chat.responsibleAi?.stoplights?.yellow || 0)} | G ${Number(chat.responsibleAi?.stoplights?.green || 0)}</div>
      <div class="admin-item-sub">Last activity: ${chat.lastActivityAt || chat.updatedAt || "n/a"}</div>
      <div class="admin-item-sub">Summary: ${chat.summary || "n/a"}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "row";
    const open = document.createElement("button");
    open.type = "button";
    open.textContent = chat.kind === "simple" ? "Open in Simple Chat" : "Open in Group Chat";
    open.addEventListener("click", () => openChatInHistory(chat.chatId, chat.kind));
    actions.appendChild(open);
    item.appendChild(actions);

    container.appendChild(item);
  });
}

function renderAdminList() {
  renderAdminFilterSummary();
  if (state.adminView === "personas") {
    renderAdminPersonasList();
  } else if (state.adminView === "chats") {
    renderAdminChatsList();
  } else {
    renderAdminDebatesList();
  }
  renderAdminCharts();
}

async function loadAdminData() {
  byId("admin-pricing-note").textContent = "Loading governance metrics...";
  try {
    const [overview, personas, chats, usage] = await Promise.all([
      apiGet("/api/admin/overview"),
      apiGet("/api/admin/personas"),
      apiGet("/api/admin/chats"),
      apiGet("/api/auth/usage")
    ]);
    state.adminOverview = overview;
    state.adminPersonas = personas;
    state.adminChats = chats;
    state.adminUsage = usage;
    byId("admin-pricing-note").textContent = overview.pricingNote || "";
    renderAdminSummaryCards();
    renderAdminMatrix();
    renderAdminFilterSummary();
    renderAdminList();
    renderAdminCharts();
    renderGovernanceChatSessions();
  } catch (error) {
    byId("admin-pricing-note").textContent = `Failed to load admin data: ${error.message}`;
  }
}

async function loadPersonas() {
  try {
    const data = await apiGet("/api/personas");
    state.personas = data.personas || [];
    byId("persona-errors").textContent =
      data.errors && data.errors.length
        ? `Corrupted persona files skipped: ${data.errors.map((e) => e.file).join(", ")}`
        : "";
    renderPersonaList();
    renderAvailablePersonas();
    renderSelectedPersonas();
    state.personaChat.selectedPersonaIds = state.personaChat.selectedPersonaIds.filter((id) =>
      state.personas.some((p) => p.id === id)
    );
    renderPersonaChatPersonaList();
  } catch (error) {
    byId("persona-errors").textContent = error.message;
  }
}

async function loadKnowledgePacks() {
  try {
    const data = await apiGet("/api/knowledge");
    state.knowledgePacks = Array.isArray(data.packs) ? data.packs : [];
    state.selectedKnowledgePackIds = state.selectedKnowledgePackIds.filter((id) =>
      state.knowledgePacks.some((p) => p.id === id)
    );
    state.personaFormKnowledgePackIds = state.personaFormKnowledgePackIds.filter((id) =>
      state.knowledgePacks.some((p) => p.id === id)
    );
    state.simpleChat.selectedKnowledgePackIds = state.simpleChat.selectedKnowledgePackIds.filter((id) =>
      state.knowledgePacks.some((p) => p.id === id)
    );
    renderKnowledgePacks();
    renderKnowledgeStudioList();
    renderPersonaKnowledgePackList();
    renderSimpleChatKnowledgeList();
  } catch {
    state.knowledgePacks = [];
    state.selectedKnowledgePackIds = [];
    state.personaFormKnowledgePackIds = [];
    state.simpleChat.selectedKnowledgePackIds = [];
    renderKnowledgePacks();
    renderKnowledgeStudioList();
    renderPersonaKnowledgePackList();
    renderSimpleChatKnowledgeList();
  }
}

function renderResponsibleAiPolicyForm() {
  const policy = state.responsibleAiPolicy;
  if (!policy || !byId("rai-preview")) return;
  byId("rai-red-keywords").value = (policy.stoplight?.redKeywords || []).join("\n");
  byId("rai-yellow-keywords").value = (policy.stoplight?.yellowKeywords || []).join("\n");
  byId("rai-positive-keywords").value = (policy.sentiment?.positiveKeywords || []).join("\n");
  byId("rai-negative-keywords").value = (policy.sentiment?.negativeKeywords || []).join("\n");
  byId("rai-sentiment-threshold").value = String(policy.sentiment?.threshold || 1);
  byId("rai-preview").textContent = JSON.stringify(policy, null, 2);
}

async function loadResponsibleAiPolicy() {
  const status = byId("rai-status");
  if (!status) return;
  status.textContent = "Loading Responsible AI policy...";
  try {
    const data = await apiGet("/api/settings/responsible-ai");
    state.responsibleAiPolicy = data.policy || null;
    renderResponsibleAiPolicyForm();
    status.textContent = "Policy loaded.";
  } catch (error) {
    status.textContent = `Failed to load policy: ${error.message}`;
  }
}

function collectResponsibleAiPolicyFromForm() {
  return {
    stoplight: {
      redKeywords: parseLineList(byId("rai-red-keywords").value),
      yellowKeywords: parseLineList(byId("rai-yellow-keywords").value)
    },
    sentiment: {
      positiveKeywords: parseLineList(byId("rai-positive-keywords").value),
      negativeKeywords: parseLineList(byId("rai-negative-keywords").value),
      threshold: safeNumberInput(byId("rai-sentiment-threshold").value, 1, { min: 1, max: 5, integer: true })
    }
  };
}

async function saveResponsibleAiPolicy() {
  const status = byId("rai-status");
  const payload = collectResponsibleAiPolicyFromForm();
  status.textContent = "Saving policy...";
  try {
    const data = await apiSend("/api/settings/responsible-ai", "PUT", { policy: payload });
    state.responsibleAiPolicy = data.policy || payload;
    renderResponsibleAiPolicyForm();
    status.textContent = "Policy saved.";
    renderSimpleChatHistory();
    renderPersonaChatHistory();
    renderChatHistory();
    if (state.activeDebateId) {
      try {
        const debateData = await apiGet(`/api/debates/${encodeURIComponent(state.activeDebateId)}`);
        renderDebateTurns(debateData.session?.turns || []);
      } catch {
        renderDebateTurns([]);
      }
    }
    renderAdminSummaryCards();
    renderAdminCharts();
  } catch (error) {
    status.textContent = `Save failed: ${error.message}`;
  }
}

function resetResponsibleAiPolicyDefaults() {
  byId("rai-red-keywords").value = [
    "kill",
    "suicide",
    "self-harm",
    "bomb",
    "terror",
    "ethnic cleansing",
    "genocide",
    "overdose",
    "rape",
    "how to hurt",
    "hack bank",
    "credit card theft"
  ].join("\n");
  byId("rai-yellow-keywords").value = [
    "guaranteed profit",
    "insider tip",
    "evade taxes",
    "diagnose",
    "prescribe",
    "legal advice",
    "financial advice",
    "weapon",
    "violent",
    "harass",
    "exploit"
  ].join("\n");
  byId("rai-positive-keywords").value = [
    "good",
    "great",
    "helpful",
    "constructive",
    "benefit",
    "improve",
    "safe",
    "clarify",
    "collaborate"
  ].join("\n");
  byId("rai-negative-keywords").value = [
    "bad",
    "terrible",
    "harm",
    "danger",
    "risky",
    "hate",
    "angry",
    "useless",
    "worse"
  ].join("\n");
  byId("rai-sentiment-threshold").value = "1";
  byId("rai-status").textContent = "Default values loaded. Click Save Policy to persist.";
}

function renderSessionSummary() {
  const el = byId("security-session");
  if (!el) return;
  if (!state.auth.authenticated || !state.auth.user) {
    el.textContent = "Not authenticated.";
    return;
  }
  const user = state.auth.user;
  const perms = Object.entries(user.permissions || {})
    .filter(([, allowed]) => Boolean(allowed))
    .map(([name]) => name)
    .join(", ");
  el.textContent = `Logged in as ${user.username} (${user.role}). Permissions: ${perms || "none"}.`;
}

function renderSecurityUsers(users) {
  const container = byId("security-users");
  if (!container) return;
  container.innerHTML = "";
  if (!users.length) {
    container.textContent = "No users.";
    return;
  }
  users.forEach((user) => {
    const card = document.createElement("div");
    card.className = "card";
    const perms = Object.entries(user.permissions || {})
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ");
    card.innerHTML = `
      <div class="card-title">${user.username}</div>
      <div>Role: ${user.role}</div>
      <div class="muted">Permissions: ${perms || "none"}</div>
      <div class="muted">Last login: ${user.lastLoginAt || "n/a"}</div>
    `;
    if (state.auth.user?.role === "admin") {
      const row = document.createElement("div");
      row.className = "row";

      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.textContent = "Reset Password";
      resetBtn.addEventListener("click", async () => {
        const password = window.prompt(`New password for ${user.username}:`);
        if (!password) return;
        try {
          await apiSend(`/api/auth/users/${encodeURIComponent(user.id)}`, "PUT", { password });
          byId("security-user-status").textContent = `Password updated for ${user.username}.`;
        } catch (error) {
          byId("security-user-status").textContent = `Failed: ${error.message}`;
        }
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.disabled = state.auth.user?.id === user.id;
      delBtn.addEventListener("click", async () => {
        if (!window.confirm(`Delete user ${user.username}?`)) return;
        try {
          await apiSend(`/api/auth/users/${encodeURIComponent(user.id)}`, "DELETE", {});
          byId("security-user-status").textContent = `Deleted ${user.username}.`;
          await loadSecurityData();
        } catch (error) {
          byId("security-user-status").textContent = `Failed: ${error.message}`;
        }
      });
      row.append(resetBtn, delBtn);
      card.appendChild(row);
    }
    container.appendChild(card);
  });
}

function renderSecurityApiKeys(keys) {
  const container = byId("security-api-keys");
  if (!container) return;
  container.innerHTML = "";
  if (!keys.length) {
    container.textContent = "No API keys.";
    return;
  }
  keys.forEach((key) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-title">${key.name}</div>
      <div class="muted">${key.prefix}...</div>
      <div>Created: ${key.createdAt || "n/a"}</div>
      <div>Last used: ${key.lastUsedAt || "never"}</div>
      <div>Status: ${key.revokedAt ? `revoked (${key.revokedAt})` : "active"}</div>
    `;
    if (!key.revokedAt) {
      const row = document.createElement("div");
      row.className = "row";
      const revokeBtn = document.createElement("button");
      revokeBtn.type = "button";
      revokeBtn.textContent = "Revoke";
      revokeBtn.addEventListener("click", async () => {
        try {
          await apiSend(`/api/auth/api-keys/${encodeURIComponent(key.id)}`, "DELETE", {});
          byId("security-key-status").textContent = "Key revoked.";
          await loadSecurityData();
        } catch (error) {
          byId("security-key-status").textContent = `Failed: ${error.message}`;
        }
      });
      row.appendChild(revokeBtn);
      card.appendChild(row);
    }
    container.appendChild(card);
  });
}

function renderSecurityUsage(usage) {
  const container = byId("security-usage");
  if (!container) return;
  container.innerHTML = "";
  const rows = usage?.byUser || [];
  if (!rows.length) {
    container.textContent = "No usage logs yet.";
    return;
  }
  rows.forEach((row) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-title">${row.username || row.userId || "unknown"}</div>
      <div>Requests: ${row.requests || 0}</div>
      <div>Last seen: ${row.lastSeenAt || "n/a"}</div>
    `;
    container.appendChild(card);
  });
}

async function loadSecurityData() {
  renderSessionSummary();
  if (!state.auth.authenticated) return;
  byId("security-key-once").textContent = "";
  byId("security-key-status").textContent = "";
  try {
    const [keys, usage] = await Promise.all([
      apiGet("/api/auth/api-keys"),
      apiGet("/api/auth/usage")
    ]);
    renderSecurityApiKeys(keys.keys || []);
    renderSecurityUsage(usage);
  } catch (error) {
    byId("security-key-status").textContent = `Failed to load security data: ${error.message}`;
  }

  if (state.auth.user?.role === "admin") {
    try {
      const usersData = await apiGet("/api/auth/users");
      renderSecurityUsers(usersData.users || []);
    } catch (error) {
      byId("security-user-status").textContent = `Failed to load users: ${error.message}`;
      renderSecurityUsers([]);
    }
  } else {
    renderSecurityUsers([]);
  }
}

async function uploadKnowledgeFile(event) {
  event.preventDefault();
  const status = byId("knowledge-upload-status");
  const fileInput = byId("knowledge-upload-file");
  const file = fileInput.files?.[0];

  if (!file) {
    status.textContent = "Select a file first.";
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  const title = byId("knowledge-upload-title").value.trim();
  const id = byId("knowledge-upload-id").value.trim();
  const tags = byId("knowledge-upload-tags").value.trim();
  const description = byId("knowledge-upload-description").value.trim();
  if (title) formData.append("title", title);
  if (id) formData.append("id", id);
  if (tags) formData.append("tags", tags);
  if (description) formData.append("description", description);

  status.textContent = "Uploading and converting file...";
  try {
    const res = await fetch("/api/knowledge/ingest", {
      method: "POST",
      body: formData
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.ok) {
      throw new Error(apiErrorMessage(payload, "Knowledge upload failed"));
    }

    status.textContent = `Created pack '${payload.data.pack.id}' from ${payload.data.ingestMeta.fileName} via ${payload.data.ingestMeta.extractionMethod}.`;
    byId("knowledge-upload-form").reset();
    await loadKnowledgePacks();
  } catch (error) {
    status.textContent = `Upload failed: ${error.message}`;
  }
}

function adHocPersonaFromForm() {
  return {
    id: byId("adhoc-id").value.trim() || undefined,
    displayName: byId("adhoc-displayName").value.trim(),
    role: byId("adhoc-role").value.trim(),
    description: byId("adhoc-description").value.trim(),
    systemPrompt: byId("adhoc-systemPrompt").value.trim(),
    speakingStyle: {
      tone: byId("adhoc-tone").value.trim(),
      verbosity: byId("adhoc-verbosity").value.trim(),
      quirks: parseCsv(byId("adhoc-quirks").value)
    },
    expertiseTags: parseCsv(byId("adhoc-tags").value),
    biasValues: parseCsv(byId("adhoc-bias").value),
    debateBehavior: byId("adhoc-debateBehavior").value.trim(),
    knowledgePackIds: parseCsv(byId("adhoc-knowledge-pack-ids").value)
  };
}

function clearAdHocForm() {
  [
    "adhoc-id",
    "adhoc-displayName",
    "adhoc-role",
    "adhoc-description",
    "adhoc-systemPrompt",
    "adhoc-tone",
    "adhoc-verbosity",
    "adhoc-quirks",
    "adhoc-tags",
    "adhoc-bias",
    "adhoc-debateBehavior",
    "adhoc-knowledge-pack-ids"
  ].forEach((id) => {
    byId(id).value = "";
  });
  byId("adhoc-save").checked = false;
}

async function loadDebate(debateId) {
  const data = await apiGet(`/api/debates/${encodeURIComponent(debateId)}`);
  const session = data.session;
  state.viewer.type = "debate";
  state.viewer.activeId = debateId;
  state.activeDebateId = debateId;
  if (!state.chatByDebate[debateId]) {
    state.chatByDebate[debateId] = [];
  }
  if (!state.lastCitationsByDebate[debateId]) {
    state.lastCitationsByDebate[debateId] = [];
  }

  try {
    const chatData = await apiGet(`/api/debates/${encodeURIComponent(debateId)}/chat`);
    state.chatByDebate[debateId] = Array.isArray(chatData.history) ? chatData.history : [];
    state.lastCitationsByDebate[debateId] = Array.isArray(chatData.citations)
      ? chatData.citations
      : [];
  } catch {
    // Ignore missing/unavailable chat history and keep local state.
  }

  byId("viewer-conversation-type").value = "debate";
  byId("viewer-conversation-select").value = debateId;
  renderViewerHistoryBrowser("debate");
  byId("download-transcript").href = `/api/debates/${encodeURIComponent(debateId)}/transcript`;
  byId("download-transcript").classList.remove("hidden");
  byId("viewer-transcript-chat").classList.remove("hidden");
  byId("viewer-progress").textContent = `${session.status.toUpperCase()} | Round ${
    session.progress?.round || 0
  } | ${session.progress?.currentSpeaker || "-"} | ${session.progress?.message || ""}`;
  if (session.personaSelection?.mode) {
    byId("viewer-progress").textContent += ` | selection=${session.personaSelection.mode}`;
  }
  byId("viewer-transcript").textContent = data.transcript || "";
  renderDebateTurns(session.turns || []);
  renderChatHistory();
  renderCitationsPopout();
  byId("chat-status").textContent = "Transcript chat ready.";
  byId("debate-run-status").textContent = `Debate ${debateId}: ${session.status}`;

  if (session.status === "completed" || session.status === "failed") {
    if (state.pollIntervalId) {
      clearInterval(state.pollIntervalId);
      state.pollIntervalId = null;
      state.pollingDebateId = null;
    }
  }
}

function normalizeViewerMessagesFromChat(chat) {
  const messages = Array.isArray(chat?.messages) ? chat.messages : [];
  return messages.map((m, idx) => {
    const roleClass = m.role === "user" ? "user" : m.role === "orchestrator" ? "system" : "assistant";
    const title =
      m.role === "user"
        ? "You"
        : m.role === "orchestrator"
          ? "Orchestrator"
          : m.displayName || m.speakerId || "Assistant";
    return {
      id: `${m.turnId || 0}-${idx}`,
      roleClass,
      title,
      content: m.content || ""
    };
  });
}

function renderViewerExchanges(entries) {
  const container = byId("viewer-turns");
  if (!container) return;
  container.innerHTML = "";
  if (!entries.length) {
    container.textContent = "No exchanges yet.";
    return;
  }
  entries.forEach((entry) => {
    renderExchangeMessage(container, {
      roleClass: entry.roleClass,
      title: entry.title,
      content: entry.content
    });
  });
}

function setViewerTypeUI(type) {
  const isDebate = type === "debate";
  byId("viewer-transcript-chat").classList.toggle("hidden", !isDebate);
  byId("download-transcript").classList.toggle("hidden", !isDebate);
  if (!isDebate) {
    byId("chat-status").textContent = "Transcript chat is available for debates only.";
    byId("chat-history").textContent = "Select Debate type to use transcript Q&A.";
  }
}

function viewerEntryId(type, row) {
  return row.id;
}

function viewerEntryTitle(type, row) {
  return row.title || row.id;
}

function renderViewerHistoryBrowser(type) {
  const select = byId("viewer-conversation-select");
  const list = byId("viewer-history-list");
  const rows = state.viewer.historyByType[type] || [];
  select.innerHTML = `<option value="">Select conversation</option>`;
  list.innerHTML = "";

  if (!rows.length) {
    list.textContent = "No saved conversations for this type.";
    return;
  }

  rows.forEach((row) => {
    const id = viewerEntryId(type, row);
    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${viewerEntryTitle(type, row)} (${id}) | tokens ${Number(row.tokens || 0).toLocaleString()} | cost ${formatAdminUsd(row.cost)}`;
    if (state.viewer.activeId === id) option.selected = true;
    select.appendChild(option);
  });
  if (!select.value && rows.length) {
    select.value = viewerEntryId(type, rows[0]);
  }

  rows.forEach((row) => {
    const id = viewerEntryId(type, row);
    const card = document.createElement("div");
    card.className = "card";
    const subtitle = `participants: ${(row.participants || []).join(", ") || "n/a"} | messages: ${Number(row.messages || 0).toLocaleString()} | tokens: ${Number(row.tokens || 0).toLocaleString()} | cost: ${formatAdminUsd(row.cost)}`;
    const risk = row.risk || { red: 0, yellow: 0, green: 0 };
    const sentiment = row.sentiment || { positive: 0, neutral: 0, negative: 0 };
    card.innerHTML = `
      <div class="card-title">${viewerEntryTitle(type, row)}</div>
      <div class="muted">${id}</div>
      <div>${type === "debate" ? `status: ${row.status || "n/a"} | ` : ""}${subtitle}</div>
      <div class="admin-item-sub">Risk: R ${risk.red} | Y ${risk.yellow} | G ${risk.green}</div>
      <div class="admin-item-sub">Sentiment: + ${sentiment.positive} | ~ ${sentiment.neutral} | - ${sentiment.negative}</div>
    `;
    const actions = document.createElement("div");
    actions.className = "row";
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.textContent = "Open";
    openBtn.addEventListener("click", async () => {
      byId("viewer-conversation-select").value = id;
      try {
        await loadViewerConversation(type, id);
      } catch (error) {
        byId("viewer-progress").textContent = error.message;
      }
    });
    actions.appendChild(openBtn);
    card.appendChild(actions);
    list.appendChild(card);
  });
}

async function loadViewerHistory(type) {
  let rows = [];
  if (type === "debate") {
    const overview = await apiGet("/api/admin/overview");
    rows = (overview.debates || []).map((d) => ({
      id: d.debateId,
      title: d.title || d.debateId,
      status: d.status || "n/a",
      participants: d.participants || [],
      messages: Number(d.drillSummary?.turns || 0),
      tokens: Number(d.tokenUsage?.totalTokens || 0),
      cost: typeof d.estimatedCostUsd === "number" ? d.estimatedCostUsd : 0,
      risk: {
        red: Number(d.responsibleAi?.stoplights?.red || 0),
        yellow: Number(d.responsibleAi?.stoplights?.yellow || 0),
        green: Number(d.responsibleAi?.stoplights?.green || 0)
      },
      sentiment: {
        positive: Number(d.responsibleAi?.sentiment?.positive || 0),
        neutral: Number(d.responsibleAi?.sentiment?.neutral || 0),
        negative: Number(d.responsibleAi?.sentiment?.negative || 0)
      },
      createdAt: d.createdAt || ""
    }));
  } else {
    const chats = await apiGet("/api/admin/chats");
    rows = (chats.chats || [])
      .filter((c) => (type === "group" ? c.kind === "group" : c.kind === "simple"))
      .map((c) => ({
        id: c.chatId,
        title: c.title || c.chatId,
        participants: c.participants || [],
        messages: Number(c.messageCount || 0),
        tokens: Number(c.tokenUsage?.totalTokens || 0),
        cost: typeof c.estimatedCostUsd === "number" ? c.estimatedCostUsd : 0,
        risk: {
          red: Number(c.responsibleAi?.stoplights?.red || 0),
          yellow: Number(c.responsibleAi?.stoplights?.yellow || 0),
          green: Number(c.responsibleAi?.stoplights?.green || 0)
        },
        sentiment: {
          positive: Number(c.responsibleAi?.sentiment?.positive || 0),
          neutral: Number(c.responsibleAi?.sentiment?.neutral || 0),
          negative: Number(c.responsibleAi?.sentiment?.negative || 0)
        },
        createdAt: c.lastActivityAt || c.updatedAt || c.createdAt || ""
      }));
  }
  rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  state.viewer.historyByType[type] = rows;
  renderViewerHistoryBrowser(type);
}

async function loadViewerConversation(type, id) {
  if (!id) throw new Error("Conversation id is required.");
  if (type === "debate") {
    setViewerTypeUI("debate");
    await loadDebate(id);
    startPollingDebate(id);
    return;
  }

  if (state.pollIntervalId) {
    clearInterval(state.pollIntervalId);
    state.pollIntervalId = null;
    state.pollingDebateId = null;
  }

  state.viewer.type = type;
  state.viewer.activeId = id;
  byId("viewer-conversation-type").value = type;
  byId("viewer-conversation-select").value = id;
  renderViewerHistoryBrowser(type);
  setViewerTypeUI(type);
  byId("download-transcript").removeAttribute("href");
  byId("viewer-transcript").textContent = "";
  state.activeDebateId = null;

  if (type === "group") {
    const data = await apiGet(`/api/persona-chats/${encodeURIComponent(id)}`);
    const session = data.session || {};
    byId("viewer-progress").textContent = `GROUP CHAT | ${session.title || id} | mode=${session.settings?.engagementMode || "chat"} | messages=${(data.messages || []).length}`;
    byId("viewer-transcript").textContent = [
      `Title: ${session.title || id}`,
      `Type: Group Chat`,
      `Participants: ${(session.personas || []).map((p) => p.displayName).join(", ") || "n/a"}`,
      `Model: ${session.settings?.model || "n/a"}`,
      `Context: ${session.context || "(none)"}`
    ].join("\n");
    renderViewerExchanges(normalizeViewerMessagesFromChat(data));
    return;
  }

  if (type === "simple") {
    const data = await apiGet(`/api/simple-chats/${encodeURIComponent(id)}`);
    const session = data.session || {};
    byId("viewer-progress").textContent = `SIMPLE CHAT | ${session.title || id} | messages=${(data.messages || []).length}`;
    byId("viewer-transcript").textContent = [
      `Title: ${session.title || id}`,
      `Type: Simple Chat`,
      `Model: ${session.settings?.model || "n/a"}`,
      `Context: ${session.context || "(none)"}`,
      `Knowledge Packs: ${(session.knowledgePackIds || []).join(", ") || "none"}`
    ].join("\n");
    renderViewerExchanges(normalizeViewerMessagesFromChat(data));
    return;
  }

  throw new Error(`Unsupported conversation type: ${type}`);
}

function startPollingDebate(debateId) {
  if (state.pollIntervalId) {
    clearInterval(state.pollIntervalId);
  }

  state.pollingDebateId = debateId;
  state.pollIntervalId = setInterval(async () => {
    try {
      await loadDebate(debateId);
    } catch (error) {
      byId("viewer-progress").textContent = `Failed to refresh debate: ${error.message}`;
    }
  }, 2000);
}

function wireEvents() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  byId("chats-view-simple").addEventListener("click", () => setChatsView("simple"));
  byId("chats-view-group").addEventListener("click", () => setChatsView("group"));
  byId("group-work-live").addEventListener("click", () => setGroupWorkspace("live"));
  byId("group-work-debate-setup").addEventListener("click", () => setGroupWorkspace("debate-setup"));
  byId("group-work-debate-viewer").addEventListener("click", () => setGroupWorkspace("debate-viewer"));
  byId("config-view-personas").addEventListener("click", () => setConfigView("personas"));
  byId("config-view-knowledge").addEventListener("click", () => setConfigView("knowledge"));
  byId("config-view-rai").addEventListener("click", () => setConfigView("rai"));
  byId("config-view-security").addEventListener("click", () => setConfigView("security"));
  byId("system-menu-toggle").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSystemMenu();
  });
  byId("auth-login").addEventListener("click", login);
  byId("bootstrap-create").addEventListener("click", bootstrapAdmin);
  byId("auth-open-login").addEventListener("click", () => {
    showAuthGate("Sign in with a different user.");
    closeSystemMenu();
  });
  byId("auth-quick-logout").addEventListener("click", logout);
  byId("open-help-flyout").addEventListener("click", openHelpPopout);
  byId("open-security-tab").addEventListener("click", () => {
    switchTab("config");
    setConfigView("security");
    closeSystemMenu();
  });
  byId("help-close").addEventListener("click", closeHelpPopout);
  document.addEventListener("click", (event) => {
    const shell = byId("system-menu-popout");
    const toggle = byId("system-menu-toggle");
    if (!shell || shell.classList.contains("hidden")) return;
    const target = event.target;
    if (shell.contains(target) || toggle.contains(target)) return;
    closeSystemMenu();
  });
  byId("auth-password").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      login();
    }
  });
  byId("bootstrap-password").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      bootstrapAdmin();
    }
  });
  byId("security-refresh-session").addEventListener("click", async () => {
    await loadAuthState();
    await loadSecurityData();
  });
  byId("security-logout").addEventListener("click", logout);
  byId("security-create-key").addEventListener("click", async () => {
    const name = byId("security-key-name").value.trim();
    byId("security-key-status").textContent = "Generating key...";
    try {
      const data = await apiSend("/api/auth/api-keys", "POST", { name });
      byId("security-key-status").textContent = "API key created. Copy it now; it will not be shown again.";
      byId("security-key-once").textContent = data.key?.rawKey || "";
      byId("security-key-name").value = "";
      await loadSecurityData();
    } catch (error) {
      byId("security-key-status").textContent = `Failed: ${error.message}`;
    }
  });
  byId("security-create-user").addEventListener("click", async () => {
    const username = byId("security-new-username").value.trim();
    const password = byId("security-new-password").value;
    const role = byId("security-new-role").value || "user";
    byId("security-user-status").textContent = "Creating user...";
    try {
      await apiSend("/api/auth/users", "POST", { username, password, role });
      byId("security-new-username").value = "";
      byId("security-new-password").value = "";
      byId("security-user-status").textContent = "User created.";
      await loadSecurityData();
    } catch (error) {
      byId("security-user-status").textContent = `Failed: ${error.message}`;
    }
  });
  byId("rai-save").addEventListener("click", saveResponsibleAiPolicy);
  byId("rai-reset-defaults").addEventListener("click", resetResponsibleAiPolicyDefaults);
  byId("rai-reload").addEventListener("click", loadResponsibleAiPolicy);

  byId("persona-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const persona = personaFromForm();
    const statusEl = byId("persona-status");
    statusEl.textContent = state.editingPersonaId
      ? "Updating persona..."
      : "Creating persona and running optimizer...";

    try {
      if (state.editingPersonaId) {
        await apiSend(`/api/personas/${state.editingPersonaId}`, "PUT", persona);
        statusEl.textContent = "Persona updated.";
      } else {
        const data = await apiSend("/api/personas", "POST", persona);
        const details = data.optimization
          ? `changedFields=${data.optimization.changedFields || 0}, strictRewrite=${Boolean(
              data.optimization.strictRewrite
            )}`
          : "";
        const baseMessage = `${data.optimization?.message || "Persona created."}${
          details ? ` (${details})` : ""
        }`;
        const levelPrefix = data.optimization?.warning ? "Warning: " : "";
        statusEl.textContent = `${levelPrefix}${baseMessage}`;
      }
      resetPersonaForm();
      await loadPersonas();
    } catch (error) {
      statusEl.textContent = `Failed: ${error.message}`;
    }
  });

  byId("persona-form").addEventListener("input", renderPersonaPreview);
  byId("persona-reset").addEventListener("click", resetPersonaForm);
  byId("refresh-personas").addEventListener("click", loadPersonas);
  byId("persona-search").addEventListener("input", renderPersonaList);
  byId("persona-tag-filter").addEventListener("input", renderPersonaList);

  byId("add-adhoc").addEventListener("click", () => {
    const persona = adHocPersonaFromForm();
    const savePersona = byId("adhoc-save").checked;

    if (!persona.displayName || !persona.description || !persona.systemPrompt) {
      window.alert("Ad-hoc persona needs displayName, description, and systemPrompt.");
      return;
    }

    if (savePersona && !persona.id) {
      window.alert("Save Id is required when 'Save persona' is checked.");
      return;
    }

    state.selectedPersonas.push({
      type: "adhoc",
      savePersona,
      persona
    });

    clearAdHocForm();
    renderSelectedPersonas();
  });

  byId("run-debate").addEventListener("click", async () => {
    const topic = byId("debate-topic").value.trim();
    if (!topic) {
      window.alert("Topic is required.");
      return;
    }

    const payload = {
      topic,
      context: byId("debate-context").value.trim(),
      selectedPersonas: Array.isArray(state.selectedPersonas) ? state.selectedPersonas : [],
      knowledgePackIds: state.selectedKnowledgePackIds.slice(),
      topicDiscovery: {
        query: state.topicDiscovery.query || "",
        selectedTitle: state.topicDiscovery.selected?.title || "",
        selectedSummary: state.topicDiscovery.selected?.snippet || "",
        sources: (state.topicDiscovery.results || []).slice(0, 8).map(normalizeTopicSource)
      },
      settings: {
        rounds: safeNumberInput(byId("debate-rounds").value, 3, { min: 1, max: 8, integer: true }),
        maxWordsPerTurn: safeNumberInput(byId("debate-max-words").value, 120, {
          min: 40,
          max: 400,
          integer: true
        }),
        moderationStyle: byId("debate-moderation-style").value.trim() || "neutral",
        sourceGroundingMode: byId("debate-source-grounding").value || "light",
        model: byId("debate-model").value.trim() || "gpt-4.1-mini",
        temperature: safeNumberInput(byId("debate-temperature").value, 0.7, { min: 0, max: 2 }),
        includeModerator: byId("debate-include-moderator").checked
      }
    };

    byId("debate-run-status").textContent = "Submitting debate...";

    try {
      const data = await apiSend("/api/debates", "POST", payload);
      const debateId = data.debateId;
      const mode = data.personaSelection?.mode || "manual";
      byId("debate-run-status").textContent = `Debate queued: ${debateId} (selection: ${mode})`;
      byId("viewer-conversation-type").value = "debate";
      byId("viewer-conversation-select").value = debateId;
      await loadViewerHistory("debate");
      switchTab("chats");
      setChatsView("group");
      setGroupWorkspace("debate-viewer");
      await loadViewerConversation("debate", debateId);
    } catch (error) {
      byId("debate-run-status").textContent = `Failed: ${error.message}`;
    }
  });

  byId("load-conversation").addEventListener("click", async () => {
    const type = byId("viewer-conversation-type").value || "debate";
    const id = byId("viewer-conversation-select").value.trim();
    if (!id) {
      window.alert("Select a conversation from history.");
      return;
    }

    try {
      await loadViewerConversation(type, id);
    } catch (error) {
      byId("viewer-progress").textContent = error.message;
    }
  });
  byId("viewer-conversation-type").addEventListener("change", () => {
    const type = byId("viewer-conversation-type").value || "debate";
    setViewerTypeUI(type);
    loadViewerHistory(type).catch((error) => {
      byId("viewer-progress").textContent = `Failed to load history: ${error.message}`;
    });
    if (type !== "debate" && state.pollIntervalId) {
      clearInterval(state.pollIntervalId);
      state.pollIntervalId = null;
      state.pollingDebateId = null;
    }
  });

  byId("chat-send").addEventListener("click", askTranscriptChat);
  byId("chat-citations-open").addEventListener("click", openCitationsPopout);
  byId("chat-citations-close").addEventListener("click", closeCitationsPopout);
  byId("chat-question").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      askTranscriptChat();
    }
  });

  byId("topic-discovery-search").addEventListener("click", searchCurrentEventTopics);
  byId("topic-use-manual").addEventListener("click", useManualTopicForGeneration);
  byId("topic-discovery-query").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchCurrentEventTopics();
    }
  });
  byId("topic-generate-personas").addEventListener("click", generatePersonasFromSelectedTopic);
  byId("knowledge-upload-form").addEventListener("submit", uploadKnowledgeFile);
  byId("knowledge-refresh").addEventListener("click", loadKnowledgePacks);
  byId("persona-chat-create").addEventListener("click", createPersonaChatSession);
  byId("persona-chat-new-draft").addEventListener("click", startNewPersonaChatDraft);
  byId("persona-chat-refresh-list").addEventListener("click", loadPersonaChatSessions);
  byId("persona-chat-load").addEventListener("click", () => {
    loadPersonaChatSession(byId("persona-chat-id").value.trim());
  });
  byId("persona-chat-send").addEventListener("click", sendPersonaChatMessage);
  byId("persona-chat-message").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendPersonaChatMessage();
    }
  });
  ["persona-chat-title", "persona-chat-context", "persona-chat-model", "persona-chat-temperature", "persona-chat-max-words", "persona-chat-mode"].forEach((id) => {
    const el = byId(id);
    if (!el) return;
    el.addEventListener("input", () => {
      if (!state.personaChat.activeChatId) return;
      state.personaChat.dirtyConfig = true;
      byId("persona-chat-status").textContent =
        "Settings changed. Click Create Chat Session to start a new conversation.";
    });
  });
  byId("simple-chat-create").addEventListener("click", createSimpleChatSession);
  byId("simple-chat-refresh-list").addEventListener("click", loadSimpleChatSessions);
  byId("simple-chat-load").addEventListener("click", () => {
    loadSimpleChatSession(byId("simple-chat-id").value.trim());
  });
  byId("simple-chat-send").addEventListener("click", sendSimpleChatMessage);
  byId("simple-chat-message").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendSimpleChatMessage();
    }
  });

  byId("admin-view-debates").addEventListener("click", () => {
    state.adminView = "debates";
    renderAdminList();
  });
  byId("admin-view-chats").addEventListener("click", () => {
    state.adminView = "chats";
    renderAdminList();
  });
  byId("admin-view-personas").addEventListener("click", () => {
    state.adminView = "personas";
    renderAdminList();
  });
  byId("admin-dim-channel").addEventListener("click", () => {
    state.adminMatrixDimension = "channel";
    state.adminMetricFocus = null;
    renderAdminMatrix();
    renderAdminFilterSummary();
    renderAdminList();
    renderAdminCharts();
  });
  byId("admin-dim-model").addEventListener("click", () => {
    state.adminMatrixDimension = "model";
    state.adminMetricFocus = null;
    renderAdminMatrix();
    renderAdminFilterSummary();
    renderAdminList();
    renderAdminCharts();
  });
  byId("admin-dim-persona").addEventListener("click", () => {
    state.adminMatrixDimension = "persona";
    state.adminMetricFocus = null;
    renderAdminMatrix();
    renderAdminFilterSummary();
    renderAdminList();
    renderAdminCharts();
  });
  byId("admin-dim-user").addEventListener("click", () => {
    state.adminMatrixDimension = "user";
    state.adminMetricFocus = null;
    renderAdminMatrix();
    renderAdminFilterSummary();
    renderAdminList();
    renderAdminCharts();
  });
  byId("admin-clear-filter").addEventListener("click", () => {
    state.adminFilter = null;
    state.adminMetricFocus = null;
    renderAdminFilterSummary();
    renderAdminMatrix();
    renderAdminList();
    renderAdminCharts();
  });
  byId("admin-nav-group-history").addEventListener("click", () => {
    switchTab("chats");
    setChatsView("group");
    setGroupWorkspace("live");
  });
  byId("admin-nav-simple-history").addEventListener("click", () => {
    switchTab("chats");
    setChatsView("simple");
  });
  byId("admin-nav-debate-history").addEventListener("click", () => {
    switchTab("chats");
    setChatsView("group");
    setGroupWorkspace("debate-viewer");
  });
  byId("gov-chat-create").addEventListener("click", createGovernanceChatSession);
  byId("gov-chat-search-btn").addEventListener("click", searchGovernanceChatSessions);
  byId("gov-chat-search").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchGovernanceChatSessions();
    }
  });
  byId("gov-chat-load").addEventListener("click", () => loadGovernanceChatSession(byId("gov-chat-id").value.trim()));
  byId("gov-chat-send").addEventListener("click", sendGovernanceChatMessage);
  byId("gov-chat-message").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendGovernanceChatMessage();
    }
  });
  byId("admin-refresh").addEventListener("click", loadAdminData);
}

async function init() {
  wireEvents();
  const authed = await loadAuthState();
  renderSessionSummary();
  switchTab("chats");
  setChatsView("simple");
  setGroupWorkspace("live");
  setConfigView("personas");
  renderPersonaKnowledgePackList();
  renderPersonaPreview();
  renderChatHistory();
  renderPersonaChatPersonaList();
  renderPersonaChatHistory();
  renderSimpleChatKnowledgeList();
  renderSimpleChatHistory();
  renderSelectedTopicSummary();
  renderTopicDiscoveryResults();
  renderGeneratedTopicDrafts();
  renderKnowledgeStudioList();
  setViewerTypeUI(byId("viewer-conversation-type").value || "debate");
  renderGovernanceChatSessions();
  renderGovernanceChatHistory();
  if (!authed) {
    return;
  }
  await refreshAfterAuth();
}

init();

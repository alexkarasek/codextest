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
  adminHeatmap: {
    mode: "capability",
    data: null,
    loading: false
  },
  adminToolUsage: {
    events: [],
    loading: false
  },
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
    selectedKnowledgePackIds: [],
    sessions: [],
    activeChatId: null,
    historyByChat: {},
    activeSessionPersonaIds: [],
    dirtyConfig: false,
    sidebarCollapsed: false
  },
  simpleChat: {
    selectedKnowledgePackIds: [],
    sessions: [],
    activeChatId: null,
    historyByChat: {},
    sidebarCollapsed: false
  },
  supportConcierge: {
    history: [],
    citations: []
  },
  theme: null,
  webPolicy: null,
  agentic: {
    tools: [],
    tasks: [],
    templates: [],
    approvals: [],
    jobs: [],
    metrics: null,
    mcp: null,
    mcpServers: [],
    events: {
      task: [],
      tool: []
    },
    activeTaskId: "",
    stepDrafts: []
  },
  viewer: {
    type: "debate",
    activeId: null,
    historyByType: {
      debate: [],
      group: [],
      simple: []
    },
    stage: {
      replay: null,
      activeIndex: 0,
      playing: false,
      speed: 1,
      timerId: null
    }
  }
};

const AGENTIC_BUILTIN_PRESETS = [
  {
    id: "preset-autonomous-persona-image",
    kind: "builtin",
    name: "Autonomous Persona -> Image",
    template: {
      title: "Autonomous Multi-Persona Image Scenario",
      objective:
        "Let selected personas discuss unattended, synthesize final image instructions, generate the image, and persist a full report.",
      team: { mode: "auto", personaIds: [], tags: ["design", "architecture"], maxAgents: 3 },
      settings: { model: "gpt-4.1-mini", temperature: 0.3 },
      steps: [
        {
          id: "step-1",
          name: "Run autonomous persona image brainstorm",
          type: "tool",
          toolId: "persona.autonomous_image_brainstorm",
          input: {
            prompt:
              "Design a modern cloud-native reference architecture diagram for a secure, cost-efficient AI workbench platform.",
            mode: "debate-work-order",
            rounds: 2,
            maxAgents: 3,
            model: "gpt-4.1-mini",
            temperature: 0.5,
            maxWordsPerTurn: 140,
            generateImage: true,
            imageModel: "gpt-image-1",
            imageSize: "1024x1024",
            imageQuality: "auto"
          },
          dependsOn: [],
          requiresApproval: false
        },
        {
          id: "step-2",
          name: "Persist final markdown report",
          type: "tool",
          toolId: "filesystem.write_text",
          input: {
            path: "data/agentic/reports/autonomous-persona-image.md",
            content: "{{steps.step-1.result.reportMarkdown}}"
          },
          dependsOn: ["step-1"],
          requiresApproval: false
        }
      ]
    }
  },
  {
    id: "preset-http-analyze-save",
    kind: "builtin",
    name: "HTTP -> Analyze -> Save report",
    template: {
      title: "HTTP Analysis Report",
      objective: "Fetch endpoint data, summarize, and persist a concise report.",
      team: { mode: "auto", personaIds: [], tags: ["analysis"], maxAgents: 3 },
      settings: { model: "gpt-4.1-mini", temperature: 0.3 },
      steps: [
        {
          id: "step-1",
          name: "Fetch endpoint",
          type: "tool",
          toolId: "http.request",
          input: { url: "http://localhost:3000/health", method: "GET" },
          dependsOn: [],
          requiresApproval: false
        },
        {
          id: "step-2",
          name: "Summarize response",
          type: "llm",
          prompt:
            "Summarize this response in 3 concise bullets and include key status signals:\\n{{steps.step-1.result.bodyPreview}}",
          dependsOn: ["step-1"],
          requiresApproval: false
        },
        {
          id: "step-3",
          name: "Write report",
          type: "tool",
          toolId: "filesystem.write_text",
          input: {
            path: "data/agentic/reports/http-report.txt",
            content: "{{steps.step-2.result.text}}"
          },
          dependsOn: ["step-2"],
          requiresApproval: false
        }
      ]
    }
  },
  {
    id: "preset-safe-write-with-approval",
    kind: "builtin",
    name: "Safe write with approval gate",
    template: {
      title: "Approved File Write Workflow",
      objective: "Draft content and require approval before writing to disk.",
      team: { mode: "auto", personaIds: [], tags: ["governance"], maxAgents: 3 },
      settings: { model: "gpt-4.1-mini", temperature: 0.2 },
      steps: [
        {
          id: "step-1",
          name: "Draft content",
          type: "llm",
          prompt: "Draft a short operational note with 5 bullet points for governance reporting.",
          dependsOn: [],
          requiresApproval: false
        },
        {
          id: "step-2",
          name: "Write approved note",
          type: "tool",
          toolId: "filesystem.write_text",
          input: {
            path: "data/agentic/reports/approved-note.txt",
            content: "{{steps.step-1.result.text}}"
          },
          dependsOn: ["step-1"],
          requiresApproval: true
        }
      ]
    }
  }
];

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

function toPrettyJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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

function renderExchangeMessage(container, { roleClass, title, content, image = null, citation = null }) {
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
  if (image?.url) {
    const media = document.createElement("img");
    media.className = "chat-image";
    media.src = String(image.url);
    media.alt = String(image.prompt || "Generated image");
    media.loading = "lazy";
    body.appendChild(document.createElement("br"));
    body.appendChild(media);
  }
  if (citation && citation.url) {
    const details = document.createElement("details");
    details.className = "chat-citation";
    const summary = document.createElement("summary");
    summary.textContent = citation.label || "Source";
    details.appendChild(summary);

    const link = document.createElement("a");
    link.href = String(citation.url);
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = String(citation.url);
    details.appendChild(link);

    if (citation.requestedUrl && citation.requestedUrl !== citation.url) {
      const requested = document.createElement("div");
      requested.className = "muted";
      requested.textContent = `Requested: ${citation.requestedUrl}`;
      details.appendChild(requested);
    }
    if (citation.discoveredFrom) {
      const discovered = document.createElement("div");
      discovered.className = "muted";
      discovered.textContent = `Discovered via: ${citation.discoveredFrom}`;
      details.appendChild(discovered);
    }
    body.appendChild(document.createElement("br"));
    body.appendChild(details);
  }
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
  document.body.classList.add("auth-locked");
  byId("auth-gate").classList.remove("hidden");
  byId("bootstrap-status").textContent = "";
  byId("auth-status").textContent = statusMessage || "";
  byId("auth-bootstrap-panel").classList.toggle("hidden", !state.auth.bootstrapRequired);
  byId("auth-login-panel").classList.toggle("hidden", state.auth.bootstrapRequired);
}

function hideAuthGate() {
  document.body.classList.remove("auth-locked");
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
  const logoUploadBtn = byId("logo-upload-trigger");
  if (!chip || !logoutBtn) return;
  if (state.auth.authenticated && state.auth.user) {
    chip.textContent = `${state.auth.user.username} (${state.auth.user.role})`;
    logoutBtn.disabled = false;
    if (logoUploadBtn) logoUploadBtn.disabled = false;
    byId("auth-open-login").textContent = "Switch User";
  } else {
    chip.textContent = "Guest";
    logoutBtn.disabled = true;
    if (logoUploadBtn) logoUploadBtn.disabled = true;
    byId("auth-open-login").textContent = "Login";
  }
}

async function uploadHeaderLogo(file) {
  if (!file) return;
  const statusTargets = [byId("support-status"), byId("auth-status")].filter(Boolean);
  statusTargets.forEach((el) => {
    if (el) el.textContent = "Uploading logo...";
  });
  try {
    const form = new FormData();
    form.append("logo", file);
    const res = await fetch("/api/settings/logo", {
      method: "POST",
      body: form
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.ok) {
      if (res.status === 401) handleUnauthorized(payload);
      throw new Error(apiErrorMessage(payload, "Logo upload failed"));
    }
    const logo = byId("hero-logo");
    if (logo) {
      logo.src = payload?.data?.logoUrl || `/media/logo?t=${Date.now()}`;
    }
    statusTargets.forEach((el) => {
      if (el) el.textContent = "Logo updated.";
    });
  } catch (error) {
    statusTargets.forEach((el) => {
      if (el) el.textContent = `Logo upload failed: ${error.message}`;
    });
  }
}

async function copyGeneratedApiKey() {
  const key = byId("security-key-once")?.textContent || "";
  if (!key.trim()) {
    byId("security-key-status").textContent = "No generated key to copy.";
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(key.trim());
    } else {
      const ta = document.createElement("textarea");
      ta.value = key.trim();
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    byId("security-key-status").textContent = "API key copied to clipboard.";
  } catch (error) {
    byId("security-key-status").textContent = `Copy failed: ${error.message}`;
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
  await loadThemeSettings();
  await loadPersonas();
  await loadKnowledgePacks();
  await loadResponsibleAiPolicy();
  await loadPersonaChatSessions();
  await loadSimpleChatSessions();
  await loadAdminData();
  await loadSecurityData();
  await loadAgenticData();
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
        "Use Conversation Explorer links to inspect full conversation history.",
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
          "Select personas in Persona Chat configuration, then use Structured Debate Run when needed."
        ]
      };
    }
    if (state.configView === "knowledge") {
      return {
        title: "Knowledge Studio Guide",
        points: [
          "Upload txt/pdf/image/doc files to create reusable knowledge packs.",
          "Attach packs globally in debates or persona chats, or per-persona in profile settings.",
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
          "Use Conversation Explorer for cross-session monitoring and flags."
        ]
      };
    }
    if (state.groupWorkspace === "live") {
      return {
        title: "Group Chat Guide",
        points: [
          "Interactive Chat mode: address personas directly (for example, @Big Tex) for targeted replies.",
          "Panel mode: moderator facilitates persona-to-persona discussion without a winner.",
          "Debate to Decision mode: moderator pushes toward a concrete outcome with next actions."
        ]
      };
    }
    return {
      title: "Conversation Explorer Guide",
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
  closeSupportPopout();
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

function citationHref(citation) {
  const file = String(citation?.file || "").trim();
  if (!file) return "#";
  let pathPart = "";
  if (file === "README.md") {
    pathPart = "README.md";
  } else if (file.startsWith("docs/")) {
    pathPart = file.slice("docs/".length);
  } else {
    return "#";
  }
  return `/docs/${encodeURI(pathPart)}`;
}

function truncateCitationExcerpt(text, max = 180) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 1)).trim()}...`;
}

function normalizeCitations(citations, limit = 6) {
  const seen = new Set();
  const rows = [];
  for (const citation of Array.isArray(citations) ? citations : []) {
    const file = String(citation?.file || "").trim() || "doc";
    const heading = String(citation?.heading || "").trim() || "section";
    const key = `${file}::${heading}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      file,
      heading,
      href: citationHref(citation),
      excerpt: truncateCitationExcerpt(citation?.excerpt || "", 180)
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

function renderSupportPopout() {
  const historyEl = byId("support-history");
  const citationsEl = byId("support-citations");
  if (!historyEl || !citationsEl) return;

  historyEl.innerHTML = "";
  const rows = state.supportConcierge.history || [];
  if (!rows.length) {
    historyEl.textContent = "No support messages yet.";
  } else {
    rows.forEach((row) => {
      renderExchangeMessage(historyEl, {
        roleClass: row.role === "user" ? "user" : "assistant",
        title: row.role === "user" ? "You" : "Support Concierge",
        content: row.content || ""
      });
    });
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  citationsEl.innerHTML = "";
  const citations = normalizeCitations(state.supportConcierge.citations || []);
  if (!citations.length) {
    citationsEl.textContent = "No citations yet.";
    return;
  }
  citations.forEach((citation) => {
    const card = document.createElement("div");
    card.className = "citation-card";
    const link = document.createElement("a");
    link.href = citation.href || "#";
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = `${citation.file} -> ${citation.heading}`;
    const excerpt = document.createElement("div");
    excerpt.className = "muted";
    excerpt.textContent = citation.excerpt;
    card.append(link, excerpt);
    citationsEl.appendChild(card);
  });
}

function openSupportPopout() {
  closeSystemMenu();
  closeHelpPopout();
  const popout = byId("support-popout");
  popout.classList.add("open");
  popout.setAttribute("aria-hidden", "false");
  renderSupportPopout();
}

function closeSupportPopout() {
  const popout = byId("support-popout");
  popout.classList.remove("open");
  popout.setAttribute("aria-hidden", "true");
}

async function sendSupportPopoutMessage() {
  const input = byId("support-message");
  const status = byId("support-status");
  const message = String(input.value || "").trim();
  if (!message) return;

  state.supportConcierge.history.push({ role: "user", content: message });
  input.value = "";
  status.textContent = "Support Concierge is thinking...";
  renderSupportPopout();

  try {
    const res = await fetch("/api/support/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.ok) {
      if (res.status === 401) handleUnauthorized(payload);
      throw new Error(apiErrorMessage(payload, "Support request failed"));
    }
    const data = payload.data || {};
    state.supportConcierge.history.push({
      role: "assistant",
      content: String(data.reply || "(No reply returned)")
    });
    state.supportConcierge.citations = Array.isArray(data.citations) ? data.citations : [];
    status.textContent = "Support reply ready.";
    renderSupportPopout();
  } catch (error) {
    state.supportConcierge.history.push({
      role: "assistant",
      content: `I hit an issue while processing that request: ${error.message}`
    });
    status.textContent = `Failed: ${error.message}`;
    renderSupportPopout();
  }
}

function clearSupportPopoutHistory() {
  state.supportConcierge.history = [];
  state.supportConcierge.citations = [];
  byId("support-status").textContent = "Support conversation cleared.";
  renderSupportPopout();
}

function stopViewerStagePlayback() {
  if (state.viewer.stage.timerId) {
    clearInterval(state.viewer.stage.timerId);
    state.viewer.stage.timerId = null;
  }
  state.viewer.stage.playing = false;
  const playBtn = byId("viewer-stage-play");
  if (playBtn) playBtn.textContent = "Play";
}

function fallbackAvatarForName(name, role = "") {
  const low = `${String(name || "")} ${String(role || "")}`.toLowerCase();
  if (low.includes("moderator") || low.includes("orchestrator")) return "🎙️";
  if (low.includes("assistant")) return "🤖";
  if (low.includes("policy") || low.includes("governance")) return "📜";
  if (low.includes("market") || low.includes("finance")) return "📈";
  if (low.includes("developer") || low.includes("engineer")) return "💻";
  if (low.includes("design") || low.includes("creative")) return "🎨";
  if (low.includes("poker") || low.includes("casino")) return "♠️";
  if (low.includes("nutrition") || low.includes("health")) return "🥗";
  return "🧠";
}

function normalizeAvatarValue(value, name, role = "") {
  const raw = String(value || "").trim();
  if (!raw) return { type: "emoji", value: fallbackAvatarForName(name, role) };
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return { type: "image", value: raw };
  return { type: "emoji", value: raw };
}

function buildPersonaMetaMapFromSession(session) {
  const map = new Map();
  (session?.personas || []).forEach((p) => {
    if (!p?.id) return;
    map.set(String(p.id), {
      displayName: p.displayName || p.id,
      role: p.role || "",
      avatar: normalizeAvatarValue(p.avatar, p.displayName || p.id, p.role || "")
    });
  });
  return map;
}

function renderViewerStageButtonState() {
  const btn = byId("viewer-open-stage");
  if (!btn) return;
  const hasReplay = Boolean(state.viewer.stage.replay && state.viewer.stage.replay.entries?.length);
  btn.disabled = !hasReplay;
}

function setViewerStageReplay(replay, { preserveIndex = false } = {}) {
  const prev = state.viewer.stage.replay;
  const prevIndex = state.viewer.stage.activeIndex || 0;
  state.viewer.stage.replay = replay || null;
  if (!replay || !Array.isArray(replay.entries) || !replay.entries.length) {
    state.viewer.stage.activeIndex = 0;
    stopViewerStagePlayback();
    renderViewerStageButtonState();
    renderViewerStagePopout();
    return;
  }
  if (
    preserveIndex &&
    prev &&
    prev.type === replay.type &&
    String(prev.title || "") === String(replay.title || "")
  ) {
    state.viewer.stage.activeIndex = Math.max(0, Math.min(replay.entries.length - 1, prevIndex));
  } else {
    state.viewer.stage.activeIndex = 0;
    stopViewerStagePlayback();
  }
  renderViewerStageButtonState();
  renderViewerStagePopout();
}

function stageEntryFromChatMessage(m, idx, personaMap = new Map()) {
  const role = String(m?.role || "assistant");
  const personaMeta = personaMap.get(String(m?.speakerId || "")) || null;
  const speakerLabel =
    role === "user"
      ? "You"
      : role === "orchestrator"
        ? "Moderator"
        : String(m?.displayName || personaMeta?.displayName || m?.speakerId || "Assistant");
  const speakerKey =
    role === "user"
      ? "user"
      : role === "orchestrator"
        ? "moderator"
        : String(m?.speakerId || m?.displayName || `assistant-${idx}`);
  const trace = {
    turnId: m?.turnId || null,
    speakerId: m?.speakerId || null,
    usage: m?.usage || null,
    citations: Array.isArray(m?.citations) ? m.citations.length : 0,
    toolExecution: m?.toolExecution || null,
    rationale: m?.rationale || null,
    selectedSpeakerIds: m?.selectedSpeakerIds || null,
    omittedCount: m?.omittedCount || null
  };
  return {
    id: `${m?.turnId || 0}-${idx}`,
    speakerKey,
    speakerLabel,
    role,
    content: String(m?.content || ""),
    round: Number(m?.turnId || 0) || null,
    avatar: role === "user"
      ? normalizeAvatarValue("🙂", "You", role)
      : role === "orchestrator"
        ? normalizeAvatarValue("", "Moderator", role)
        : normalizeAvatarValue(personaMeta?.avatar?.value || personaMeta?.avatar || "", speakerLabel, personaMeta?.role || role),
    trace
  };
}

function buildViewerStageReplayFromChat(data, type) {
  const session = data?.session || {};
  const messages = Array.isArray(data?.messages) ? data.messages : [];
  const personaMap = buildPersonaMetaMapFromSession(session);
  const entries = messages.map((m, idx) => stageEntryFromChatMessage(m, idx, personaMap));
  const bySpeaker = new Map();
  entries.forEach((entry) => {
    if (!bySpeaker.has(entry.speakerKey)) {
      bySpeaker.set(entry.speakerKey, {
        key: entry.speakerKey,
        label: entry.speakerLabel,
        role: entry.role,
        avatar: entry.avatar
      });
    }
  });
  return {
    title: session.title || session.topic || "Conversation",
    type,
    entries,
    participants: [...bySpeaker.values()]
  };
}

function buildViewerStageReplayFromDebate(session, debateDetail = null) {
  const turns = Array.isArray(session?.turns) ? session.turns : [];
  const personaMap = buildPersonaMetaMapFromSession(session);
  const payloadByKey = new Map();
  const llmByKey = new Map();
  const orchestrationByKey = new Map();
  const detailObs = debateDetail?.observability || {};
  (detailObs.payloadTraces || []).forEach((row) => {
    const key = `${row?.round || 0}|${row?.speakerId || "moderator"}`;
    payloadByKey.set(key, row);
  });
  (detailObs.llmTraces || []).forEach((row) => {
    const key = `${row?.round || 0}|${row?.speakerId || "moderator"}`;
    llmByKey.set(key, row);
  });
  (detailObs.orchestration || []).forEach((row) => {
    const key = `${row?.round || 0}|${row?.speaker || row?.speakerId || "moderator"}`;
    orchestrationByKey.set(key, row);
  });
  const entries = turns.map((turn, idx) => {
    const isModerator = turn.type === "moderator";
    const speakerLabel = isModerator ? "Moderator" : String(turn.displayName || turn.speakerId || `Speaker ${idx + 1}`);
    const speakerKey = isModerator ? "moderator" : String(turn.speakerId || turn.displayName || `speaker-${idx}`);
    const meta = personaMap.get(String(turn.speakerId || "")) || null;
    const traceKey = `${turn.round || 0}|${isModerator ? "moderator" : turn.speakerId || "moderator"}`;
    return {
      id: `${turn.round || 0}-${idx}`,
      speakerKey,
      speakerLabel,
      role: isModerator ? "orchestrator" : "persona",
      content: String(turn.text || ""),
      round: Number(turn.round || 0) || null,
      avatar: isModerator
        ? normalizeAvatarValue("", "Moderator", "moderator")
        : normalizeAvatarValue(meta?.avatar?.value || meta?.avatar || "", speakerLabel, meta?.role || "persona"),
      trace: {
        llm: llmByKey.get(traceKey) || null,
        payload: payloadByKey.get(traceKey) || null,
        orchestration: orchestrationByKey.get(traceKey) || null
      }
    };
  });
  const bySpeaker = new Map();
  entries.forEach((entry) => {
    if (!bySpeaker.has(entry.speakerKey)) {
      bySpeaker.set(entry.speakerKey, {
        key: entry.speakerKey,
        label: entry.speakerLabel,
        role: entry.role,
        avatar: entry.avatar
      });
    }
  });
  return {
    title: session?.topic || "Debate",
    type: "debate",
    entries,
    participants: [...bySpeaker.values()]
  };
}

function renderViewerStagePopout() {
  const status = byId("viewer-stage-status");
  const roster = byId("viewer-stage-roster");
  const transcript = byId("viewer-stage-transcript");
  const trace = byId("viewer-stage-trace");
  if (!status || !roster || !transcript || !trace) return;
  const replay = state.viewer.stage.replay;
  roster.innerHTML = "";
  transcript.innerHTML = "";
  if (!replay || !Array.isArray(replay.entries) || !replay.entries.length) {
    status.textContent = "Load a conversation from Explorer first.";
    transcript.textContent = "No replay data.";
    return;
  }
  const idx = Math.max(0, Math.min(state.viewer.stage.activeIndex, replay.entries.length - 1));
  state.viewer.stage.activeIndex = idx;
  const active = replay.entries[idx];
  status.textContent = `${String(replay.type || "conversation").toUpperCase()} | ${replay.title} | Turn ${idx + 1}/${replay.entries.length} | Active: ${active.speakerLabel}`;

  (replay.participants || []).forEach((p) => {
    const card = document.createElement("div");
    card.className = `stage-card ${p.key === active.speakerKey ? "active" : ""}`;
    const avatar = p.avatar || normalizeAvatarValue("", p.label, p.role);
    const avatarHtml =
      avatar.type === "image"
        ? `<span class="stage-avatar"><img src="${avatar.value}" alt="${p.label} avatar"></span>`
        : `<span class="stage-avatar">${avatar.value}</span>`;
    card.innerHTML = `${avatarHtml}<div><div><strong>${p.label}</strong></div><div class="muted">${p.role || "speaker"}</div></div>`;
    roster.appendChild(card);
  });

  replay.entries.forEach((entry, entryIdx) => {
    const row = document.createElement("div");
    row.className = `stage-line ${entryIdx === idx ? "active" : ""}`;
    const roundText = entry.round ? ` (Round ${entry.round})` : "";
    row.innerHTML = `<div class="muted"><strong>${entry.speakerLabel}</strong>${roundText}</div><div>${entry.content}</div>`;
    row.addEventListener("click", () => {
      state.viewer.stage.activeIndex = entryIdx;
      renderViewerStagePopout();
    });
    transcript.appendChild(row);
  });
  const activeLine = transcript.querySelector(".stage-line.active");
  if (activeLine) {
    activeLine.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  trace.textContent = JSON.stringify(active.trace || { note: "No trace available for this turn." }, null, 2);
}

function stepViewerStage(delta = 1) {
  const replay = state.viewer.stage.replay;
  if (!replay || !replay.entries.length) return;
  const max = replay.entries.length - 1;
  state.viewer.stage.activeIndex = Math.max(0, Math.min(max, state.viewer.stage.activeIndex + delta));
  renderViewerStagePopout();
}

function toggleViewerStagePlayback() {
  const replay = state.viewer.stage.replay;
  if (!replay || !replay.entries.length) return;
  if (state.viewer.stage.playing) {
    stopViewerStagePlayback();
    return;
  }
  state.viewer.stage.playing = true;
  const playBtn = byId("viewer-stage-play");
  if (playBtn) playBtn.textContent = "Pause";
  const tickMs = Math.max(500, Math.round(1800 / Math.max(0.25, Number(state.viewer.stage.speed || 1))));
  state.viewer.stage.timerId = setInterval(() => {
    const max = replay.entries.length - 1;
    if (state.viewer.stage.activeIndex >= max) {
      stopViewerStagePlayback();
      return;
    }
    state.viewer.stage.activeIndex += 1;
    renderViewerStagePopout();
  }, tickMs);
}

function openViewerStagePopout() {
  const popout = byId("viewer-stage-popout");
  if (!popout) return;
  popout.classList.add("open");
  popout.setAttribute("aria-hidden", "false");
  renderViewerStagePopout();
}

function closeViewerStagePopout() {
  const popout = byId("viewer-stage-popout");
  if (!popout) return;
  stopViewerStagePlayback();
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
  const filter = String(byId("persona-chat-persona-filter")?.value || "")
    .trim()
    .toLowerCase();

  if (!state.personas.length) {
    container.textContent = "No personas available. Create personas first.";
    return;
  }

  const visible = state.personas.filter((persona) => {
    if (!filter) return true;
    return (
      String(persona.displayName || "").toLowerCase().includes(filter) ||
      String(persona.id || "").toLowerCase().includes(filter)
    );
  });

  if (!visible.length) {
    container.textContent = "No personas match the current filter.";
    return;
  }

  visible.forEach((persona) => {
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
      renderPersonaMentionStrip();
    });
  });
  renderPersonaMentionStrip();
}

function personaMentionCandidates() {
  const ids =
    state.personaChat.activeChatId && state.personaChat.activeSessionPersonaIds.length
      ? state.personaChat.activeSessionPersonaIds
      : state.personaChat.selectedPersonaIds;
  const byIdMap = new Map(state.personas.map((p) => [p.id, p]));
  return ids.map((id) => byIdMap.get(id)).filter(Boolean);
}

function insertPersonaMention(displayName) {
  const input = byId("persona-chat-message");
  if (!input) return;
  const mention = `@${String(displayName || "").trim()}`;
  if (!mention || mention === "@") return;
  const current = String(input.value || "");
  input.value = current.trim() ? `${current.trim()} ${mention} ` : `${mention} `;
  input.focus();
}

function renderPersonaMentionStrip() {
  const container = byId("persona-chat-mention-strip");
  if (!container) return;
  container.innerHTML = "";
  const candidates = personaMentionCandidates();
  if (!candidates.length) {
    container.innerHTML = `<span class="hint">Tip: select personas, then click a chip to direct replies with @mentions.</span>`;
    return;
  }
  const lead = document.createElement("span");
  lead.className = "muted";
  lead.textContent = "Direct replies:";
  container.appendChild(lead);
  candidates.forEach((persona) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "mention-chip";
    chip.textContent = `@${persona.displayName}`;
    chip.addEventListener("click", () => insertPersonaMention(persona.displayName));
    container.appendChild(chip);
  });
}

function renderPersonaChatKnowledgeList() {
  const container = byId("persona-chat-knowledge-list");
  if (!container) return;
  container.innerHTML = "";

  if (!state.knowledgePacks.length) {
    container.textContent = "No knowledge packs available yet.";
    return;
  }

  state.knowledgePacks.forEach((pack) => {
    const row = document.createElement("label");
    row.className = "inline";
    const checked = state.personaChat.selectedKnowledgePackIds.includes(pack.id);
    row.innerHTML = `
      <input type="checkbox" data-persona-pack-id="${pack.id}" ${checked ? "checked" : ""}>
      ${pack.title} <span class="muted">(${pack.id})</span>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll("input[type='checkbox'][data-persona-pack-id]").forEach((input) => {
    input.addEventListener("change", () => {
      const packId = input.getAttribute("data-persona-pack-id");
      if (!packId) return;
      if (input.checked) {
        if (!state.personaChat.selectedKnowledgePackIds.includes(packId)) {
          state.personaChat.selectedKnowledgePackIds.push(packId);
        }
      } else {
        state.personaChat.selectedKnowledgePackIds = state.personaChat.selectedKnowledgePackIds.filter(
          (id) => id !== packId
        );
      }
      if (state.personaChat.activeChatId) {
        state.personaChat.dirtyConfig = true;
        byId("persona-chat-status").textContent =
          "Knowledge pack selection changed. Click Create Chat Session to start a fresh conversation.";
      }
    });
  });
}

function applyDebateTemplateFromPersonaChat() {
  const status = byId("persona-chat-status");
  const selected = state.personaChat.selectedPersonaIds.slice();
  if (!selected.length) {
    status.textContent = "Select at least one persona before using the debate template.";
    return;
  }

  state.selectedPersonas = selected.map((id) => ({ type: "saved", id }));
  state.selectedKnowledgePackIds = state.personaChat.selectedKnowledgePackIds.slice();
  renderSelectedPersonas();
  renderKnowledgePacks();
  renderKnowledgeStudioList();

  const chatTitle = byId("persona-chat-title").value.trim();
  const chatContext = byId("persona-chat-context").value.trim();
  setUnifiedDebateTopicContext(
    chatTitle && chatTitle !== "Persona Collaboration Chat" ? chatTitle : "Untitled Debate",
    chatContext,
    { onlyIfEmptyContext: true }
  );

  const advanced = document.querySelector("#persona-chat-debate-host details.setup-advanced");
  if (advanced) advanced.open = true;
  const debateDetails = byId("persona-chat-debate-details");
  if (debateDetails) debateDetails.open = true;

  setChatsView("group");
  setGroupWorkspace("live");
  const debateHost = byId("persona-chat-debate-host");
  if (debateHost) debateHost.scrollIntoView({ behavior: "smooth", block: "start" });
  syncDebateModeTopicContextFromGroup(true);
  byId("debate-run-status").textContent = "Structured debate template loaded from persona chat.";
}

function syncDebateParticipantsFromPersonaChat() {
  const selected = state.personaChat.selectedPersonaIds.slice();
  if (!selected.length) {
    byId("debate-run-status").textContent = "Select one or more personas in Group Chat first.";
    return;
  }
  state.selectedPersonas = selected.map((id) => ({ type: "saved", id }));
  state.selectedKnowledgePackIds = state.personaChat.selectedKnowledgePackIds.slice();
  renderSelectedPersonas();
  renderKnowledgePacks();
  byId("debate-run-status").textContent = "Debate participants synced from current Group Chat selection.";
}

function getUnifiedDebateTopic() {
  return String(byId("persona-chat-title")?.value || "").trim();
}

function getUnifiedDebateContext() {
  return String(byId("persona-chat-context")?.value || "").trim();
}

function setUnifiedDebateTopicContext(topic = "", context = "", { onlyIfEmptyContext = false } = {}) {
  const normalizedTopic = String(topic || "").trim();
  const normalizedContext = String(context || "").trim();
  if (normalizedTopic && byId("persona-chat-title")) {
    byId("persona-chat-title").value = normalizedTopic;
  }
  if (normalizedContext && byId("persona-chat-context")) {
    const current = String(byId("persona-chat-context").value || "").trim();
    if (!onlyIfEmptyContext || !current) {
      byId("persona-chat-context").value = normalizedContext;
    }
  }
}

function syncDebateModeTopicContextFromGroup(force = false) {
  if (!force && !byId("persona-chat-title") && !byId("persona-chat-context")) return;
  setUnifiedDebateTopicContext(getUnifiedDebateTopic() || "Untitled Debate", getUnifiedDebateContext());
}

function updatePersonaChatModeHelp() {
  const mode = String(byId("persona-chat-mode")?.value || "chat");
  const helpEl = byId("persona-chat-mode-help");
  if (!helpEl) return;
  if (mode === "panel") {
    helpEl.textContent =
      "Panel discussion: moderator facilitates agent-to-agent dialogue, synthesizes viewpoints, and asks one next exploration question. No winner is declared.";
    return;
  }
  if (mode === "debate-work-order") {
    helpEl.textContent =
      "Debate to decision: moderator drives convergence toward a practical outcome, including open risks and next actions.";
    return;
  }
  helpEl.textContent =
    "Interactive chat: personas mostly reply when directly addressed. If unclear, moderator routes the turn and gives guidance.";
}

function applyPersonaChatSelectionBulk(mode = "select") {
  const filter = String(byId("persona-chat-persona-filter")?.value || "")
    .trim()
    .toLowerCase();
  const visibleIds = state.personas
    .filter((persona) => {
      if (!filter) return true;
      return (
        String(persona.displayName || "").toLowerCase().includes(filter) ||
        String(persona.id || "").toLowerCase().includes(filter)
      );
    })
    .map((persona) => persona.id);

  if (mode === "clear") {
    state.personaChat.selectedPersonaIds = state.personaChat.selectedPersonaIds.filter(
      (id) => !visibleIds.includes(id)
    );
  } else {
    const next = new Set(state.personaChat.selectedPersonaIds);
    visibleIds.forEach((id) => next.add(id));
    state.personaChat.selectedPersonaIds = [...next];
  }

  if (state.personaChat.activeChatId) {
    state.personaChat.dirtyConfig = true;
    byId("persona-chat-status").textContent =
      "Persona selection changed. Click Create Chat Session to start a fresh conversation.";
  }
  renderPersonaChatPersonaList();
  renderPersonaMentionStrip();
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
    const active = state.personaChat.activeChatId === session.chatId;
    const item = document.createElement("button");
    item.type = "button";
    item.className = `session-item ${active ? "active" : ""}`;
    item.innerHTML = `
      <div class="session-title">${session.title || "Persona Chat"}</div>
      <div class="session-meta">${session.chatId}</div>
      <div class="session-meta">mode: ${session.engagementMode || "chat"} | messages: ${session.messageCount || 0}</div>
    `;
    item.addEventListener("click", () => loadPersonaChatSession(session.chatId));
    container.appendChild(item);
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
    let content = msg.content;
    let citation = null;
    if (msg.role === "persona" && msg.toolExecution) {
      const requestedToolId = msg.toolExecution?.requested?.toolId || "unknown";
      const status = String(msg.toolExecution?.status || "").toLowerCase();
      const label =
        status === "ok" ? "Tool executed" : status === "forbidden" ? "Tool blocked" : "Tool failed";
      const error = msg.toolExecution?.error ? ` | ${msg.toolExecution.error}` : "";
      content = `${msg.content}\n\n[${label}: ${requestedToolId}${error}]`;
      if (requestedToolId === "web.fetch") {
        const source = msg.toolExecution?.source || {};
        const resolvedUrl = String(source.resolvedUrl || "");
        const requestedUrl = String(source.requestedUrl || "");
        const fallbackRequested = String(msg.toolExecution?.requested?.input?.url || "");
        const url = resolvedUrl || requestedUrl || fallbackRequested;
        if (url) {
          citation = {
            label: "Source",
            url,
            requestedUrl: requestedUrl || fallbackRequested,
            discoveredFrom: String(source.discoveredFrom || "")
          };
        }
      }
    }
    renderExchangeMessage(container, {
      roleClass: role,
      title,
      content,
      image: msg.image || null,
      citation
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
    state.personaChat.selectedKnowledgePackIds = Array.isArray(data.session?.knowledgePackIds)
      ? data.session.knowledgePackIds.slice()
      : [];
    state.personaChat.dirtyConfig = false;
    state.personaChat.historyByChat[chatId] = Array.isArray(data.messages) ? data.messages : [];
    byId("persona-chat-id").value = chatId;
    if (typeof data.session?.title === "string") byId("persona-chat-title").value = data.session.title;
    if (typeof data.session?.context === "string") byId("persona-chat-context").value = data.session.context;
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
    updatePersonaChatModeHelp();
    renderPersonaChatPersonaList();
    renderPersonaChatKnowledgeList();
    renderPersonaMentionStrip();
    syncDebateModeTopicContextFromGroup(true);
    renderPersonaChatHistory();
    const configDetails = byId("persona-chat-config-details");
    if (configDetails) configDetails.open = false;
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
    knowledgePackIds: state.personaChat.selectedKnowledgePackIds.slice(),
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
    const configDetails = byId("persona-chat-config-details");
    if (configDetails) configDetails.open = false;
  } catch (error) {
    status.textContent = `Create failed: ${error.message}`;
  }
}

function startNewPersonaChatDraft() {
  state.personaChat.activeChatId = null;
  state.personaChat.activeSessionPersonaIds = [];
  state.personaChat.dirtyConfig = false;
  state.personaChat.selectedKnowledgePackIds = [];
  byId("persona-chat-id").value = "";
  byId("persona-chat-title").value = "Persona Collaboration Chat";
  byId("persona-chat-context").value = "";
  byId("persona-chat-model").value = "gpt-4.1-mini";
  byId("persona-chat-temperature").value = "0.6";
  byId("persona-chat-max-words").value = "140";
  byId("persona-chat-mode").value = "chat";
  updatePersonaChatModeHelp();
  byId("persona-chat-persona-filter").value = "";
  byId("persona-chat-status").textContent = "Draft reset. Select personas/settings and click Create Chat Session.";
  const configDetails = byId("persona-chat-config-details");
  if (configDetails) configDetails.open = true;
  renderPersonaChatPersonaList();
  renderPersonaChatKnowledgeList();
  renderPersonaMentionStrip();
  renderPersonaChatHistory();
}

async function sendPersonaChatMessage({ forceImage = false } = {}) {
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
  const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  state.personaChat.historyByChat[chatId].push({
    role: "system",
    content: "Working on it...",
    pendingId
  });
  state.personaChat.activeChatId = chatId;
  renderPersonaChatHistory();
  input.value = "";
  status.textContent = "Thinking...";

  try {
    const data = await apiSend(`/api/persona-chats/${encodeURIComponent(chatId)}/messages`, "POST", {
      message,
      forceImage
    });
    if (data.orchestration?.content) {
      state.personaChat.historyByChat[chatId].push({
        role: "orchestrator",
        content: data.orchestration.content,
        rationale: data.orchestration.rationale || []
      });
    }
    const responses = Array.isArray(data.responses) ? data.responses : [];
    state.personaChat.historyByChat[chatId] = (state.personaChat.historyByChat[chatId] || []).filter(
      (msg) => msg.pendingId !== pendingId
    );
    state.personaChat.historyByChat[chatId].push(...responses);
    renderPersonaChatHistory();
    const selected = Array.isArray(data.orchestration?.rationale) ? data.orchestration.rationale : [];
    const selectedNames = selected.map((r) => r.displayName).join(", ");
    const toolRuns = responses.filter((r) => r && r.toolExecution && r.toolExecution.status === "ok").length;
    const toolFailures = responses.filter((r) => r && r.toolExecution && r.toolExecution.status !== "ok").length;
    status.textContent = selectedNames
      ? `Received ${responses.length} persona response(s). Selected: ${selectedNames}. Tool runs: ${toolRuns}, failures: ${toolFailures}.`
      : `Received ${responses.length} persona response(s). Tool runs: ${toolRuns}, failures: ${toolFailures}.`;
    await loadPersonaChatSessions();
  } catch (error) {
    state.personaChat.historyByChat[chatId] = (state.personaChat.historyByChat[chatId] || []).filter(
      (msg) => msg.pendingId !== pendingId
    );
    renderPersonaChatHistory();
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
    const active = state.simpleChat.activeChatId === session.chatId;
    const item = document.createElement("button");
    item.type = "button";
    item.className = `session-item ${active ? "active" : ""}`;
    item.innerHTML = `
      <div class="session-title">${session.title || "Simple Chat"}</div>
      <div class="session-meta">${session.chatId}</div>
      <div class="session-meta">messages: ${session.messageCount || 0}</div>
    `;
    item.addEventListener("click", () => loadSimpleChatSession(session.chatId));
    container.appendChild(item);
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
      content: `${msg.content || ""}${citations}`,
      image: msg.image || null
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
    const configDetails = byId("simple-chat-config-details");
    if (configDetails) configDetails.open = false;
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
    const configDetails = byId("simple-chat-config-details");
    if (configDetails) configDetails.open = false;
  } catch (error) {
    status.textContent = `Create failed: ${error.message}`;
  }
}

function startNewSimpleChatDraft() {
  state.simpleChat.activeChatId = null;
  byId("simple-chat-id").value = "";
  byId("simple-chat-title").value = "Simple Chat";
  byId("simple-chat-context").value = "";
  byId("simple-chat-model").value = "gpt-4.1-mini";
  byId("simple-chat-temperature").value = "0.4";
  byId("simple-chat-max-words").value = "220";
  byId("simple-chat-status").textContent =
    "Draft reset. Configure settings and click New Chat to create a fresh session.";
  const configDetails = byId("simple-chat-config-details");
  if (configDetails) configDetails.open = true;
  renderSimpleChatKnowledgeList();
  renderSimpleChatHistory();
}

async function sendSimpleChatMessage({ forceImage = false } = {}) {
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
    const data = await apiSend(`/api/simple-chats/${encodeURIComponent(chatId)}/messages`, "POST", {
      message,
      forceImage
    });
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

async function sendSimpleChatImageMessage() {
  const input = byId("simple-chat-message");
  const prompt = String(input.value || "").trim();
  if (!prompt) {
    byId("simple-chat-status").textContent = "Enter an image prompt first.";
    return;
  }
  await sendSimpleChatMessage({ forceImage: true });
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
      agentic: "config-view-agentic",
      theme: "config-view-theme",
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
  state.groupWorkspace = ["live", "debate-viewer"].includes(view) ? view : "live";
  const groupActive = state.mainTab === "chats" && state.chatsView === "group";
  byId("tab-persona-chat").classList.toggle("active", groupActive && state.groupWorkspace === "live");
  byId("tab-viewer").classList.toggle("active", groupActive && state.groupWorkspace === "debate-viewer");
  byId("group-work-live").classList.toggle("active", state.groupWorkspace === "live");
  byId("group-work-debate-viewer").classList.toggle("active", state.groupWorkspace === "debate-viewer");
  byId("group-nav-live").classList.toggle("active", state.groupWorkspace === "live");
  byId("group-nav-debate-viewer").classList.toggle("active", state.groupWorkspace === "debate-viewer");
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
  byId("tab-viewer").classList.remove("active");
  byId("subnav-group-work").classList.toggle("hidden", !(state.mainTab === "chats" && state.chatsView === "group"));
  setSubtabActive("chats", state.chatsView);
  if (state.mainTab === "chats" && state.chatsView === "simple") {
    renderSimpleChatKnowledgeList();
    renderSimpleChatHistory();
    loadSimpleChatSessions();
  }
  if (state.mainTab === "chats" && state.chatsView === "group") {
    setGroupWorkspace(state.groupWorkspace);
    renderPersonaChatPersonaList();
    renderPersonaChatKnowledgeList();
    renderPersonaChatHistory();
    loadPersonaChatSessions();
  }
}

function setSimpleSidebarCollapsed(collapsed) {
  state.simpleChat.sidebarCollapsed = Boolean(collapsed);
  const shell = byId("tab-simple-chat");
  if (!shell) return;
  shell.classList.toggle("sidebar-collapsed-simple", state.simpleChat.sidebarCollapsed);
  byId("simple-chat-show-sidebar").classList.toggle("hidden", !state.simpleChat.sidebarCollapsed);
}

function setPersonaSidebarCollapsed(collapsed) {
  state.personaChat.sidebarCollapsed = Boolean(collapsed);
  const shell = byId("tab-persona-chat");
  if (!shell) return;
  shell.classList.toggle("sidebar-collapsed-persona", state.personaChat.sidebarCollapsed);
  byId("persona-chat-show-sidebar").classList.toggle("hidden", !state.personaChat.sidebarCollapsed);
}

function setConfigView(view) {
  state.configView = ["knowledge", "rai", "agentic", "theme", "security"].includes(view) ? view : "personas";
  byId("tab-personas").classList.toggle("active", state.mainTab === "config" && state.configView === "personas");
  byId("tab-knowledge").classList.toggle("active", state.mainTab === "config" && state.configView === "knowledge");
  byId("tab-rai").classList.toggle("active", state.mainTab === "config" && state.configView === "rai");
  byId("tab-agentic").classList.toggle("active", state.mainTab === "config" && state.configView === "agentic");
  byId("tab-theme").classList.toggle("active", state.mainTab === "config" && state.configView === "theme");
  byId("tab-security").classList.toggle("active", state.mainTab === "config" && state.configView === "security");
  setSubtabActive("config", state.configView);
  if (state.mainTab === "config" && state.configView === "knowledge") {
    loadKnowledgePacks();
    loadWebPolicy();
  }
  if (state.mainTab === "config" && state.configView === "rai") {
    loadResponsibleAiPolicy();
  }
  if (state.mainTab === "config" && state.configView === "agentic") {
    loadAgenticData();
  }
  if (state.mainTab === "config" && state.configView === "theme") {
    loadThemeSettings();
    renderThemeEditor();
  }
  if (state.mainTab === "config" && state.configView === "security") {
    loadSecurityData();
  }
}

function switchTab(tabName) {
  if (!state.auth.authenticated) {
    showAuthGate(state.auth.bootstrapRequired ? "Create the first admin account." : "Please log in.");
    return;
  }
  state.mainTab = tabName;
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  document.querySelectorAll(".tab-section").forEach((section) => {
    section.classList.remove("active");
  });

  byId("subnav-chats").classList.toggle("hidden", tabName !== "chats");
  byId("subnav-group-work").classList.toggle("hidden", !(tabName === "chats" && state.chatsView === "group"));
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
    avatar: String(fd.get("avatar") || "").trim(),
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
    toolIds: parseCsv(fd.get("toolIds")),
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
  form.elements.id.readOnly = true;
  form.elements.id.title = "ID is locked while editing. Use Duplicate to create a new ID.";
  form.elements.displayName.value = persona.displayName || "";
  form.elements.avatar.value = persona.avatar || "";
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
  form.elements.toolIds.value = (persona.toolIds || []).join(", ");
  state.personaFormKnowledgePackIds = Array.isArray(persona.knowledgePackIds)
    ? persona.knowledgePackIds.slice()
    : [];
  renderPersonaKnowledgePackList();
  renderPersonaPreview();
}

function resetPersonaForm() {
  state.editingPersonaId = null;
  byId("persona-form-title").textContent = "Create Persona";
  const form = byId("persona-form");
  form.reset();
  form.elements.id.readOnly = false;
  form.elements.id.title = "";
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
      <div>Avatar: ${persona.avatar || fallbackAvatarForName(persona.displayName, persona.role)}</div>
      <div>${persona.description}</div>
      <div>Tags: ${(persona.expertiseTags || []).join(", ") || "none"}</div>
      <div>Knowledge: ${(persona.knowledgePackIds || []).join(", ") || "none"}</div>
      <div>Tools: ${(persona.toolIds || []).join(", ") || "none"}</div>
    `;

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "Add to Debate Participants";
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
      <div>Avatar: ${persona.avatar || fallbackAvatarForName(persona.displayName, persona.role)}</div>
      <div>${persona.description}</div>
      <div>Tags: ${(persona.expertiseTags || []).join(", ") || "none"}</div>
      <div>Tools: ${(persona.toolIds || []).join(", ") || "none"}</div>
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
    addBtn.textContent = "Add to Debate Participants";
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
    const tools = Array.isArray(persona.toolIds) ? persona.toolIds.length : 0;
    return `${persona.displayName} (${persona.id})${packs ? ` | persona packs: ${packs}` : ""}${tools ? ` | tools: ${tools}` : ""}`;
  }
  const packs = Array.isArray(entry.persona?.knowledgePackIds)
    ? entry.persona.knowledgePackIds.length
    : 0;
  const tools = Array.isArray(entry.persona?.toolIds) ? entry.persona.toolIds.length : 0;
  return `Ad-hoc: ${entry.persona.displayName}${packs ? ` | persona packs: ${packs}` : ""}${tools ? ` | tools: ${tools}` : ""}`;
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
      setUnifiedDebateTopicContext(item.title || getUnifiedDebateTopic(), item.snippet || "", {
        onlyIfEmptyContext: true
      });
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
    attachBtn.textContent = already ? "Attached in Structured Debate" : "Attach for Structured Debate";
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
    addBtn.textContent = "Add to Debate Participants";
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
  const manualTopic = getUnifiedDebateTopic();
  const manualContext = getUnifiedDebateContext();

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
  const topic = getUnifiedDebateTopic();
  const context = getUnifiedDebateContext();
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
    const kind = chat.kind === "simple" ? "simple" : chat.kind === "support" ? "support" : "group";
    const label = kind === "simple" ? "Simple Chat" : kind === "support" ? "Support Chat" : "Group Chat";
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

function renderAdminHeatmap() {
  const statusEl = byId("admin-heatmap-status");
  const container = byId("admin-heatmap");
  if (!statusEl || !container) return;
  const modeSel = byId("admin-heatmap-mode");
  if (modeSel) modeSel.value = state.adminHeatmap.mode || "capability";

  if (state.adminHeatmap.loading) {
    statusEl.textContent = "Loading heatmap...";
    return;
  }

  const data = state.adminHeatmap.data;
  if (!data || !Array.isArray(data.rows) || !Array.isArray(data.columns)) {
    statusEl.textContent = "No heatmap data loaded.";
    container.innerHTML = "";
    return;
  }

  const rows = data.rows || [];
  const columns = data.columns || [];
  const legendEl = byId("admin-heatmap-legend");
  const noteEl = byId("admin-heatmap-note");
  if (noteEl) {
    noteEl.textContent =
      "Composite score (0-100): weighted message contribution + token share + novelty + citations/tool usage + follow-up engagement.";
  }
  if (legendEl) {
    legendEl.innerHTML = `
      <div class="heat-legend">
        <span class="heat-legend-item"><span class="heat-legend-chip heat-1"></span>0-20 Low</span>
        <span class="heat-legend-item"><span class="heat-legend-chip heat-2"></span>21-40 Light</span>
        <span class="heat-legend-item"><span class="heat-legend-chip heat-3"></span>41-60 Medium</span>
        <span class="heat-legend-item"><span class="heat-legend-chip heat-4"></span>61-80 High</span>
        <span class="heat-legend-item"><span class="heat-legend-chip heat-5"></span>81-100 Very High</span>
      </div>
    `;
  }

  const scoreClass = (score) => {
    if (score >= 81) return "heat-5";
    if (score >= 61) return "heat-4";
    if (score >= 41) return "heat-3";
    if (score >= 21) return "heat-2";
    return "heat-1";
  };

  container.innerHTML = `
    <table class="admin-heatmap-table">
      <thead>
        <tr>
          <th>Agent</th>
          ${columns.map((col) => `<th>${col.label}</th>`).join("")}
          <th>Avg</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => {
            const cells = columns.map((col) => {
              const cell = (row.cells || []).find((c) => c.key === col.key) || { score: 0, metrics: {} };
              const score = Number(cell.score || 0);
              const cls = scoreClass(score);
              const metrics = cell.metrics || {};
              const msgCount = Number(metrics.messageCount || 0).toFixed(1);
              const msgNorm = `${Math.round(Number(metrics.messageNormalized || 0) * 100)}%`;
              const tokenShare = `${Math.round(Number(metrics.tokenShare || 0) * 100)}%`;
              const novelty = `${Math.round(Number(metrics.novelty || 0) * 100)}%`;
              const opsRate = `${Math.round(Number(metrics.operationsRate || 0) * 100)}%`;
              const opsNorm = `${Math.round(Number(metrics.operationsNormalized || 0) * 100)}%`;
              const engagement = `${Math.round(Number(metrics.engagement || 0) * 100)}%`;
              const contrib = metrics.weightedContributions || {};
              const tooltip = [
                `Score ${score.toFixed(1)} / 100`,
                `Messages: ${msgCount} (norm ${msgNorm})`,
                `Token share: ${tokenShare}`,
                `Novelty: ${novelty}`,
                `Ops rate: ${opsRate} (norm ${opsNorm})`,
                `Engagement: ${engagement}`,
                "",
                "Weighted contribution to score:",
                `- Message: ${Number(contrib.messageCount || 0).toFixed(2)}`,
                `- Token: ${Number(contrib.tokenShare || 0).toFixed(2)}`,
                `- Novelty: ${Number(contrib.novelty || 0).toFixed(2)}`,
                `- Ops: ${Number(contrib.operations || 0).toFixed(2)}`,
                `- Engagement: ${Number(contrib.engagement || 0).toFixed(2)}`
              ].join("\n");
              return `
                <td>
                  <div class="heat-cell ${cls}" title="${tooltip}">
                    <span class="heat-score">${score.toFixed(1)}</span>
                    <span class="heat-meta">msg ${msgCount} | tok ${tokenShare} | nov ${novelty}</span>
                  </div>
                </td>
              `;
            });
            return `
              <tr>
                <td><strong>${row.agentName || row.agentId}</strong></td>
                ${cells.join("")}
                <td><strong>${Number(row.averageScore || 0).toFixed(1)}</strong></td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;

  statusEl.textContent = `Heatmap: ${rows.length} agent(s) x ${columns.length} ${
    state.adminHeatmap.mode === "topic" ? "topic" : "capability"
  } column(s).`;
}

async function loadAdminHeatmap() {
  state.adminHeatmap.loading = true;
  renderAdminHeatmap();
  try {
    const mode = state.adminHeatmap.mode || "capability";
    const data = await apiGet(
      `/api/admin/heatmap?mode=${encodeURIComponent(mode)}&limit=300&maxColumns=8`
    );
    state.adminHeatmap.data = data;
    renderAdminHeatmap();
  } catch (error) {
    state.adminHeatmap.data = null;
    const statusEl = byId("admin-heatmap-status");
    if (statusEl) statusEl.textContent = `Failed to load heatmap: ${error.message}`;
    const container = byId("admin-heatmap");
    if (container) container.innerHTML = "";
  } finally {
    state.adminHeatmap.loading = false;
    renderAdminHeatmap();
  }
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

function filteredToolEvents() {
  const tool = String(byId("admin-tool-filter-tool")?.value || "")
    .trim()
    .toLowerCase();
  const context = String(byId("admin-tool-filter-context")?.value || "").trim().toLowerCase();
  const status = String(byId("admin-tool-filter-status")?.value || "").trim().toLowerCase();
  const rows = Array.isArray(state.adminToolUsage?.events) ? state.adminToolUsage.events : [];

  return rows.filter((row) => {
    const toolId = String(row.toolId || "").toLowerCase();
    const contextType = String(row.contextType || (row.taskId ? "task" : "")).toLowerCase();
    const ok = row.ok === true;
    if (tool && !toolId.includes(tool)) return false;
    if (context && contextType !== context) return false;
    if (status === "ok" && !ok) return false;
    if (status === "error" && ok) return false;
    return true;
  });
}

function renderAdminToolUsage() {
  const list = byId("admin-tool-usage-list");
  const status = byId("admin-tool-status");
  if (!list || !status) return;
  list.innerHTML = "";

  if (state.adminToolUsage.loading) {
    status.textContent = "Loading tool usage...";
    return;
  }

  const rows = filteredToolEvents();
  if (!rows.length) {
    status.textContent = "No tool runs match current filters.";
    list.textContent = "No tool usage records.";
    return;
  }

  status.textContent = `Showing ${rows.length} tool run(s).`;
  rows.slice(0, 150).forEach((row) => {
    const item = document.createElement("div");
    item.className = "admin-item";
    const ok = row.ok === true;
    item.innerHTML = `
      <div class="admin-item-head">
        <strong>${row.toolId || "unknown tool"}</strong>
        <span class="admin-item-sub">${ok ? "SUCCESS" : "FAILED"}</span>
      </div>
      <div class="admin-item-sub">When: ${row.ts || "n/a"}</div>
      <div class="admin-item-sub">Context: ${row.contextType || (row.taskId ? "task" : "n/a")} | Context Id: ${row.contextId || row.taskId || "n/a"} | Step: ${row.stepId || "n/a"} | Turn: ${row.turnId || "n/a"}</div>
      <div class="admin-item-sub">Persona: ${row.personaId || "n/a"} | User: ${row.createdByUsername || "unknown"}</div>
      <div class="admin-item-sub">URL: ${row.requestedUrl || "n/a"}</div>
      <div class="admin-item-sub">Duration: ${Number(row.durationMs || 0).toLocaleString()} ms</div>
      <div class="admin-item-sub">Error: ${row.error || "none"}</div>
    `;
    list.appendChild(item);
  });
}

async function loadAdminToolUsage() {
  state.adminToolUsage.loading = true;
  renderAdminToolUsage();
  try {
    const data = await apiGet("/api/agentic/events?type=tool&limit=600");
    state.adminToolUsage.events = Array.isArray(data.events) ? data.events.slice().reverse() : [];
  } catch (error) {
    state.adminToolUsage.events = [];
    const status = byId("admin-tool-status");
    if (status) status.textContent = `Failed to load tool usage: ${error.message}`;
  } finally {
    state.adminToolUsage.loading = false;
    renderAdminToolUsage();
  }
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
    if (kind === "support") {
      window.open("/support", "_blank", "noopener");
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
    if (filter.key === "support") return chats.filter((c) => c.kind === "support");
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
    open.textContent = "Open in Conversation Explorer";
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
      <div class="admin-item-sub">Mode: ${chat.engagementMode || (chat.kind === "simple" ? "simple-chat" : chat.kind === "support" ? "support-chat" : "chat")}</div>
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
    open.textContent =
      chat.kind === "simple"
        ? "Open in Simple Chat"
        : chat.kind === "support"
          ? "Open in Support"
          : "Open in Group Chat";
    open.addEventListener("click", () => openChatInHistory(chat.chatId, chat.kind));
    actions.appendChild(open);
    item.appendChild(actions);

    container.appendChild(item);
  });
}

function renderAdminToolsList() {
  const container = byId("admin-list");
  container.innerHTML = "";
  const events = filteredToolEvents();

  if (!events.length) {
    container.textContent = "No tool runs found for current filters.";
    return;
  }

  events.slice(0, 200).forEach((row) => {
    const item = document.createElement("div");
    item.className = "admin-item";
    const ok = row.ok === true;
    item.innerHTML = `
      <div class="admin-item-head">
        <strong>${row.toolId || "unknown tool"}</strong>
        <span class="admin-item-sub">${ok ? "SUCCESS" : "FAILED"}</span>
      </div>
      <div class="admin-item-sub">When: ${row.ts || "n/a"}</div>
      <div class="admin-item-sub">Context: ${row.contextType || (row.taskId ? "task" : "n/a")} | Context Id: ${row.contextId || row.taskId || "n/a"}</div>
      <div class="admin-item-sub">Persona: ${row.personaId || "n/a"} | User: ${row.createdByUsername || "unknown"}</div>
      <div class="admin-item-sub">URL: ${row.requestedUrl || "n/a"}</div>
      <div class="admin-item-sub">Turn/Step: ${row.turnId || "n/a"} / ${row.stepId || "n/a"} | Duration: ${Number(row.durationMs || 0).toLocaleString()} ms</div>
      <div class="admin-item-sub">Error: ${row.error || "none"}</div>
    `;
    container.appendChild(item);
  });
}

function renderAdminList() {
  renderAdminFilterSummary();
  if (state.adminView === "personas") {
    renderAdminPersonasList();
  } else if (state.adminView === "tools") {
    renderAdminToolsList();
  } else if (state.adminView === "chats") {
    renderAdminChatsList();
  } else {
    renderAdminDebatesList();
  }
  renderAdminCharts();
}

async function loadAdminData() {
  byId("admin-pricing-note").textContent = "Loading governance metrics...";
  state.adminHeatmap.loading = true;
  renderAdminHeatmap();
  try {
    const [overview, personas, chats, usage, heatmap] = await Promise.all([
      apiGet("/api/admin/overview"),
      apiGet("/api/admin/personas"),
      apiGet("/api/admin/chats"),
      apiGet("/api/auth/usage"),
      apiGet(
        `/api/admin/heatmap?mode=${encodeURIComponent(state.adminHeatmap.mode || "capability")}&limit=300&maxColumns=8`
      )
    ]);
    state.adminOverview = overview;
    state.adminPersonas = personas;
    state.adminChats = chats;
    state.adminUsage = usage;
    state.adminHeatmap.data = heatmap;
    byId("admin-pricing-note").textContent = overview.pricingNote || "";
    renderAdminSummaryCards();
    renderAdminMatrix();
    renderAdminFilterSummary();
    renderAdminList();
    renderAdminCharts();
    renderAdminHeatmap();
    renderGovernanceChatSessions();
    await loadAdminToolUsage();
  } catch (error) {
    byId("admin-pricing-note").textContent = `Failed to load admin data: ${error.message}`;
  } finally {
    state.adminHeatmap.loading = false;
    renderAdminHeatmap();
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
    state.personaChat.selectedKnowledgePackIds = state.personaChat.selectedKnowledgePackIds.filter((id) =>
      state.knowledgePacks.some((p) => p.id === id)
    );
    state.simpleChat.selectedKnowledgePackIds = state.simpleChat.selectedKnowledgePackIds.filter((id) =>
      state.knowledgePacks.some((p) => p.id === id)
    );
    renderKnowledgePacks();
    renderKnowledgeStudioList();
    renderPersonaKnowledgePackList();
    renderPersonaChatKnowledgeList();
    renderSimpleChatKnowledgeList();
  } catch {
    state.knowledgePacks = [];
    state.selectedKnowledgePackIds = [];
    state.personaFormKnowledgePackIds = [];
    state.personaChat.selectedKnowledgePackIds = [];
    state.simpleChat.selectedKnowledgePackIds = [];
    renderKnowledgePacks();
    renderKnowledgeStudioList();
    renderPersonaKnowledgePackList();
    renderPersonaChatKnowledgeList();
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

function applyThemeSettings(theme) {
  if (!theme || typeof theme !== "object") return;
  const root = document.documentElement;
  const variables = theme.variables && typeof theme.variables === "object" ? theme.variables : {};
  Object.entries(variables).forEach(([key, value]) => {
    if (!key || typeof value === "undefined") return;
    root.style.setProperty(String(key), String(value));
  });
  const typography = theme.typography && typeof theme.typography === "object" ? theme.typography : {};
  if (typography.body) root.style.setProperty("--font-body", String(typography.body));
  if (typography.display) root.style.setProperty("--font-display", String(typography.display));
}

function renderThemeEditor() {
  const variablesEl = byId("theme-variables-json");
  const typographyEl = byId("theme-typography-json");
  const previewEl = byId("theme-preview");
  if (!variablesEl || !typographyEl || !previewEl) return;
  const theme = state.theme || {};
  variablesEl.value = JSON.stringify(theme.variables || {}, null, 2);
  typographyEl.value = JSON.stringify(theme.typography || {}, null, 2);
  previewEl.textContent = JSON.stringify(theme, null, 2);
}

async function saveThemeEditor() {
  const status = byId("theme-status");
  if (!status) return;
  const variablesEl = byId("theme-variables-json");
  const typographyEl = byId("theme-typography-json");
  let variables = {};
  let typography = {};
  try {
    variables = variablesEl.value.trim() ? JSON.parse(variablesEl.value) : {};
  } catch (error) {
    status.textContent = `Invalid variables JSON: ${error.message}`;
    return;
  }
  try {
    typography = typographyEl.value.trim() ? JSON.parse(typographyEl.value) : {};
  } catch (error) {
    status.textContent = `Invalid typography JSON: ${error.message}`;
    return;
  }

  status.textContent = "Saving theme...";
  try {
    const data = await apiSend("/api/settings/theme", "PUT", { theme: { variables, typography } });
    state.theme = data.theme || null;
    applyThemeSettings(state.theme);
    renderThemeEditor();
    status.textContent = "Theme saved.";
  } catch (error) {
    status.textContent = `Failed to save theme: ${error.message}`;
  }
}

async function resetThemeEditor() {
  const status = byId("theme-status");
  if (!status) return;
  status.textContent = "Resetting theme...";
  try {
    const data = await apiSend("/api/settings/theme", "PUT", { theme: {} });
    state.theme = data.theme || null;
    applyThemeSettings(state.theme);
    renderThemeEditor();
    status.textContent = "Theme reset to defaults.";
  } catch (error) {
    status.textContent = `Failed to reset theme: ${error.message}`;
  }
}

async function loadThemeSettings() {
  try {
    const res = await fetch("/theme", { credentials: "include" });
    const payload = await res.json().catch(() => ({}));
    const theme = payload?.data?.theme || payload?.theme || null;
    if (theme) {
      state.theme = theme;
      applyThemeSettings(theme);
    }
  } catch {
    // ignore if not authenticated or unavailable
  }
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
  byId("security-copy-key").disabled = true;
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

function getDefaultAgenticSteps() {
  return [
    {
      id: "step-1",
      name: "Write task note",
      type: "tool",
      toolId: "filesystem.write_text",
      input: {
        path: "data/agentic/notes/latest-task.txt",
        content: "Agentic task scaffold created from UI.\n"
      },
      requiresApproval: false
    },
    {
      id: "step-2",
      name: "Read task note",
      type: "tool",
      toolId: "filesystem.read_text",
      input: {
        path: "data/agentic/notes/latest-task.txt"
      },
      dependsOn: ["step-1"],
      requiresApproval: false
    }
  ];
}

function normalizeAgenticTemplate(template = {}) {
  return {
    title: String(template.title || "").trim() || "Agentic Task",
    objective: String(template.objective || "").trim(),
    team: {
      mode: template.team?.mode === "manual" ? "manual" : "auto",
      personaIds: Array.isArray(template.team?.personaIds)
        ? template.team.personaIds.map((x) => String(x || "").trim()).filter(Boolean)
        : [],
      tags: Array.isArray(template.team?.tags)
        ? template.team.tags.map((x) => String(x || "").trim()).filter(Boolean)
        : [],
      maxAgents: safeNumberInput(template.team?.maxAgents, 3, { min: 1, max: 8, integer: true })
    },
    settings: {
      model: String(template.settings?.model || "gpt-4.1-mini"),
      temperature: safeNumberInput(template.settings?.temperature, 0.3, { min: 0, max: 2 })
    },
    steps: (Array.isArray(template.steps) && template.steps.length ? template.steps : getDefaultAgenticSteps()).map(
      (step, idx) => normalizeAgenticStepDraft(step, idx)
    )
  };
}

function applyAgenticTemplate(template) {
  const normalized = normalizeAgenticTemplate(template);
  byId("agentic-task-title").value = normalized.title;
  byId("agentic-task-objective").value = normalized.objective;
  byId("agentic-team-mode").value = normalized.team.mode;
  byId("agentic-team-persona-ids").value = normalized.team.personaIds.join(", ");
  byId("agentic-team-tags").value = normalized.team.tags.join(", ");
  byId("agentic-team-max-agents").value = String(normalized.team.maxAgents);
  byId("agentic-task-model").value = normalized.settings.model;
  byId("agentic-task-temperature").value = String(normalized.settings.temperature);
  initAgenticStepDrafts(normalized.steps);
  renderAgenticStepBuilder();
  refreshAgenticJsonFromBuilder({ silent: true });
}

function resetAgenticBuilderToBlank() {
  applyAgenticTemplate({
    title: "Agentic Task",
    objective: "",
    team: { mode: "auto", personaIds: [], tags: [], maxAgents: 3 },
    settings: { model: "gpt-4.1-mini", temperature: 0.3 },
    steps: [
      {
        id: "step-1",
        name: "New Step",
        type: "tool",
        toolId: "filesystem.write_text",
        input: { path: "data/agentic/output.txt", content: "hello" },
        dependsOn: [],
        requiresApproval: false
      }
    ]
  });
}

function renderAgenticPresetSelect() {
  const select = byId("agentic-preset-select");
  if (!select) return;
  const current = select.value;
  const options = [
    ...AGENTIC_BUILTIN_PRESETS.map((item) => ({
      value: `builtin:${item.id}`,
      label: `Built-in: ${item.name}`
    })),
    ...(state.agentic.templates || []).map((item) => ({
      value: `saved:${item.id}`,
      label: `Saved: ${item.name}`
    }))
  ];

  select.innerHTML = "";
  if (!options.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No presets available";
    select.appendChild(opt);
    return;
  }
  options.forEach((item, idx) => {
    const opt = document.createElement("option");
    opt.value = item.value;
    opt.textContent = item.label;
    if ((current && current === item.value) || (!current && idx === 0)) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function findSelectedAgenticPreset() {
  const raw = byId("agentic-preset-select").value || "";
  if (!raw.includes(":")) return null;
  const [kind, id] = raw.split(":");
  if (kind === "builtin") {
    const found = AGENTIC_BUILTIN_PRESETS.find((item) => item.id === id);
    return found ? { kind, id, name: found.name, template: found.template } : null;
  }
  if (kind === "saved") {
    const found = (state.agentic.templates || []).find((item) => item.id === id);
    if (!found) return null;
    return {
      kind,
      id,
      name: found.name,
      template: {
        title: found.title,
        objective: found.objective,
        team: found.team || {},
        settings: found.settings || {},
        steps: found.steps || []
      }
    };
  }
  return null;
}

function normalizeAgenticStepDraft(step, idx) {
  const position = idx + 1;
  const baseType = ["tool", "llm", "job"].includes(String(step?.type || "")) ? String(step.type) : "tool";
  return {
    id: String(step?.id || `step-${position}`).trim() || `step-${position}`,
    name: String(step?.name || `Step ${position}`).trim() || `Step ${position}`,
    type: baseType,
    toolId: String(step?.toolId || (baseType === "tool" ? "filesystem.write_text" : "")).trim(),
    prompt: String(step?.prompt || "").trim(),
    model: String(step?.model || "").trim(),
    input: step?.input && typeof step.input === "object" ? step.input : {},
    requiresApproval: Boolean(step?.requiresApproval),
    dependsOn: Array.isArray(step?.dependsOn) ? step.dependsOn.map((x) => String(x || "").trim()).filter(Boolean) : []
  };
}

function initAgenticStepDrafts(steps) {
  const source = Array.isArray(steps) && steps.length ? steps : getDefaultAgenticSteps();
  state.agentic.stepDrafts = source.map((step, idx) => normalizeAgenticStepDraft(step, idx));
}

function getAgenticBuilderRowsFromDom() {
  const container = byId("agentic-step-builder");
  const rows = [...container.querySelectorAll(".agentic-step-row")];
  return rows.map((row, idx) => {
    let parsedInput = {};
    const inputRaw = row.querySelector(".agentic-step-input").value.trim();
    if (inputRaw) {
      try {
        parsedInput = JSON.parse(inputRaw);
      } catch {
        parsedInput = { raw: inputRaw };
      }
    }
    return normalizeAgenticStepDraft(
      {
        id: row.querySelector(".agentic-step-id").value.trim(),
        name: row.querySelector(".agentic-step-name").value.trim(),
        type: row.querySelector(".agentic-step-type").value,
        toolId: row.querySelector(".agentic-step-toolid").value.trim(),
        prompt: row.querySelector(".agentic-step-prompt").value.trim(),
        model: row.querySelector(".agentic-step-model").value.trim(),
        input: parsedInput,
        requiresApproval: row.querySelector(".agentic-step-approval").checked,
        dependsOn: parseCsv(row.querySelector(".agentic-step-depends").value)
      },
      idx
    );
  });
}

function refreshAgenticJsonFromBuilder({ silent = true } = {}) {
  state.agentic.stepDrafts = getAgenticBuilderRowsFromDom();
  byId("agentic-steps-json").value = toPrettyJson(state.agentic.stepDrafts);
  if (!silent) {
    byId("agentic-task-status").textContent = "Applied builder changes to JSON.";
  }
}

function renderAgenticStepBuilder() {
  const container = byId("agentic-step-builder");
  if (!container) return;
  const drafts = state.agentic.stepDrafts || [];
  container.innerHTML = "";
  if (!drafts.length) {
    container.textContent = "No steps yet. Add one.";
    return;
  }

  drafts.forEach((step, idx) => {
    const row = document.createElement("div");
    row.className = "card agentic-step-row";
    row.innerHTML = `
      <div class="row">
        <strong>Step ${idx + 1}</strong>
        <button type="button" class="agentic-step-remove">Remove</button>
      </div>
      <div class="grid two">
        <label>Id<input class="agentic-step-id" type="text" value="${step.id}"></label>
        <label>Name<input class="agentic-step-name" type="text" value="${step.name}"></label>
      </div>
      <div class="grid two">
        <label>Type
          <select class="agentic-step-type">
            <option value="tool"${step.type === "tool" ? " selected" : ""}>tool</option>
            <option value="llm"${step.type === "llm" ? " selected" : ""}>llm</option>
            <option value="job"${step.type === "job" ? " selected" : ""}>job</option>
          </select>
        </label>
        <label>Depends On (comma-separated)<input class="agentic-step-depends" type="text" value="${step.dependsOn.join(", ")}"></label>
      </div>
      <label>Tool Id (tool only)<input class="agentic-step-toolid" type="text" value="${step.toolId || ""}" placeholder="filesystem.read_text"></label>
      <label>Prompt (llm only)<textarea class="agentic-step-prompt" rows="2" placeholder="Summarize {{steps.step-1.result.bodyPreview}}">${step.prompt || ""}</textarea></label>
      <div class="grid two">
        <label>Model (optional)<input class="agentic-step-model" type="text" value="${step.model || ""}" placeholder="gpt-4.1-mini"></label>
        <label class="inline"><input class="agentic-step-approval" type="checkbox"${step.requiresApproval ? " checked" : ""}> Requires approval</label>
      </div>
      <label>Input JSON<textarea class="agentic-step-input" rows="4">${toPrettyJson(step.input || {})}</textarea></label>
    `;

    row.querySelector(".agentic-step-remove").addEventListener("click", () => {
      state.agentic.stepDrafts.splice(idx, 1);
      if (!state.agentic.stepDrafts.length) {
        state.agentic.stepDrafts.push(normalizeAgenticStepDraft({}, 0));
      }
      renderAgenticStepBuilder();
      refreshAgenticJsonFromBuilder({ silent: true });
    });
    row.querySelectorAll("input,textarea,select").forEach((el) => {
      el.addEventListener("change", () => refreshAgenticJsonFromBuilder({ silent: true }));
      el.addEventListener("input", () => refreshAgenticJsonFromBuilder({ silent: true }));
    });

    container.appendChild(row);
  });
}

function getAgenticStepsFromForm() {
  const raw = byId("agentic-steps-json").value.trim();
  if (!raw) return getDefaultAgenticSteps();
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Steps JSON must be an array.");
  }
  return parsed;
}

function agenticTaskSummary(task) {
  const done = (task.steps || []).filter((s) => s.status === "completed").length;
  const total = (task.steps || []).length;
  return `${task.id} | ${task.status || "unknown"} | ${done}/${total} steps`;
}

function renderAgenticTaskSelect() {
  const select = byId("agentic-task-select");
  if (!select) return;
  const tasks = state.agentic.tasks || [];
  const active = state.agentic.activeTaskId || select.value;
  select.innerHTML = "";
  if (!tasks.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No tasks yet";
    select.appendChild(opt);
    state.agentic.activeTaskId = "";
    byId("agentic-task-detail").textContent = "No task selected.";
    return;
  }
  tasks.forEach((task) => {
    const opt = document.createElement("option");
    opt.value = task.id;
    opt.textContent = agenticTaskSummary(task);
    if ((active && active === task.id) || (!active && tasks[0].id === task.id)) {
      opt.selected = true;
      state.agentic.activeTaskId = task.id;
    }
    select.appendChild(opt);
  });
}

function renderAgenticTaskDetail() {
  const detail = byId("agentic-task-detail");
  const taskId = state.agentic.activeTaskId || byId("agentic-task-select").value;
  const task = (state.agentic.tasks || []).find((t) => t.id === taskId);
  if (!task) {
    detail.textContent = "No task selected.";
    return;
  }
  const summary = {
    id: task.id,
    title: task.title,
    objective: task.objective,
    status: task.status,
    selectedPersonaIds: task.routing?.selectedPersonaIds || [],
    routingReasoning: task.routing?.reasoning || "",
    updatedAt: task.updatedAt,
    steps: (task.steps || []).map((step) => ({
      id: step.id,
      name: step.name,
      type: step.type,
      status: step.status,
      requiresApproval: step.requiresApproval,
      approvalId: step.approvalId,
      error: step.error || null,
      result: step.result || null
    })),
    summary: task.summary || ""
  };
  detail.textContent = toPrettyJson(summary);
}

function renderAgenticTools() {
  const list = byId("agentic-tools-list");
  if (!list) return;
  list.innerHTML = "";
  const tools = state.agentic.tools || [];
  if (!tools.length) {
    list.textContent = "No tools found.";
    return;
  }
  tools.forEach((tool) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-title">${tool.id}</div>
      <div class="muted">${tool.description || "No description."}</div>
      <pre class="knowledge-content-preview">${toPrettyJson(tool.inputSchema || {})}</pre>
    `;
    list.appendChild(card);
  });
}

function renderAgenticApprovals() {
  const list = byId("agentic-approvals-list");
  if (!list) return;
  list.innerHTML = "";
  const approvals = (state.agentic.approvals || []).filter((a) => a.status === "pending");
  if (!approvals.length) {
    list.textContent = "No pending approvals.";
    return;
  }
  approvals.forEach((approval) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-title">${approval.title || approval.id}</div>
      <div>task: ${approval.taskId}</div>
      <div>step: ${approval.stepId}</div>
      <div class="muted">requested: ${approval.createdAt || "n/a"}</div>
    `;
    const row = document.createElement("div");
    row.className = "row";
    const approveBtn = document.createElement("button");
    approveBtn.type = "button";
    approveBtn.textContent = "Approve";
    approveBtn.addEventListener("click", async () => {
      byId("agentic-task-status").textContent = `Approving ${approval.id}...`;
      try {
        const data = await apiSend(`/api/agentic/approvals/${encodeURIComponent(approval.id)}/decision`, "POST", {
          decision: "approved",
          notes: "Approved via UI."
        });
        state.agentic.activeTaskId = data.task?.id || approval.taskId;
        byId("agentic-task-status").textContent = `Approved ${approval.id}.`;
        await loadAgenticData();
      } catch (error) {
        byId("agentic-task-status").textContent = `Approval failed: ${error.message}`;
      }
    });
    const rejectBtn = document.createElement("button");
    rejectBtn.type = "button";
    rejectBtn.textContent = "Reject";
    rejectBtn.addEventListener("click", async () => {
      const notes = window.prompt("Optional rejection notes:", "Rejected from UI.");
      if (notes === null) return;
      byId("agentic-task-status").textContent = `Rejecting ${approval.id}...`;
      try {
        const data = await apiSend(`/api/agentic/approvals/${encodeURIComponent(approval.id)}/decision`, "POST", {
          decision: "rejected",
          notes: notes || "Rejected from UI."
        });
        state.agentic.activeTaskId = data.task?.id || approval.taskId;
        byId("agentic-task-status").textContent = `Rejected ${approval.id}.`;
        await loadAgenticData();
      } catch (error) {
        byId("agentic-task-status").textContent = `Rejection failed: ${error.message}`;
      }
    });
    row.append(approveBtn, rejectBtn);
    card.appendChild(row);
    list.appendChild(card);
  });
}

function renderAgenticMetrics() {
  const cards = byId("agentic-metrics-cards");
  const jobsList = byId("agentic-jobs-list");
  const taskEvents = byId("agentic-task-events");
  const toolEvents = byId("agentic-tool-events");
  const mcpStatus = byId("agentic-mcp-status");
  if (!cards || !jobsList || !taskEvents || !toolEvents || !mcpStatus) return;

  cards.innerHTML = "";
  const totals = state.agentic.metrics?.totals || {};
  [
    ["Tasks", totals.tasks || 0],
    ["Approvals", totals.approvals || 0],
    ["Jobs", totals.jobs || 0],
    ["Task Events", totals.taskEvents || 0],
    ["Tool Runs", totals.toolExecutions || 0],
    ["Avg Task ms", totals.avgTaskDurationMs || 0]
  ].forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "metric-card";
    card.innerHTML = `<div class="metric-label">${label}</div><div class="metric-value">${value}</div>`;
    cards.appendChild(card);
  });

  jobsList.innerHTML = "";
  const jobs = state.agentic.jobs || [];
  if (!jobs.length) {
    jobsList.textContent = "No queued jobs.";
  } else {
    jobs.forEach((job) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="card-title">${job.name || job.id}</div>
        <div>status: ${job.status || "unknown"}</div>
        <div class="muted">created: ${job.createdAt || "n/a"}</div>
      `;
      jobsList.appendChild(card);
    });
  }

  taskEvents.textContent = toPrettyJson((state.agentic.events?.task || []).slice(-20));
  toolEvents.textContent = toPrettyJson((state.agentic.events?.tool || []).slice(-20));

  const mcp = state.agentic.mcp || {};
  mcpStatus.textContent = `MCP: ${mcp.phase || "unknown"} | enabled=${Boolean(mcp.enabled)} | transport=${mcp.transport || "n/a"} | servers=${mcp.serverCount || 0}`;
  renderMcpRegistry();
}

function renderMcpRegistry() {
  const container = byId("agentic-mcp-servers");
  if (!container) return;
  const servers = state.agentic.mcpServers || [];
  container.innerHTML = "";
  if (!servers.length) {
    container.textContent = "No MCP servers registered.";
    renderMcpToolSelect([]);
    return;
  }
  servers.forEach((server) => {
    const card = document.createElement("div");
    card.className = "card";
    const tools = Array.isArray(server.tools) ? server.tools : [];
    const toolNames = tools.map((tool) => tool.name).filter(Boolean);
    card.innerHTML = `
      <div class="card-title">${server.name || server.id}</div>
      <div>id: ${server.id}</div>
      <div>transport: ${server.transport || "n/a"}</div>
      <div>source: ${server.source || "unknown"}</div>
      <div>tools: ${server.toolCount ?? toolNames.length}</div>
      <div class="muted">${toolNames.length ? toolNames.join(", ") : "Tools not loaded."}</div>
    `;
    container.appendChild(card);
  });
  renderMcpToolSelect(servers);
}

function renderMcpToolSelect(servers) {
  const select = byId("agentic-mcp-tool-select");
  if (!select) return;
  const options = [];
  servers.forEach((server) => {
    (server.tools || []).forEach((tool) => {
      options.push({
        value: `${server.id}::${tool.name}`,
        label: `${server.name || server.id} / ${tool.name}`
      });
    });
  });
  select.innerHTML = "";
  if (!options.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No MCP tools available";
    select.appendChild(opt);
    return;
  }
  options.forEach((item, idx) => {
    const opt = document.createElement("option");
    opt.value = item.value;
    opt.textContent = item.label;
    if (idx === 0) opt.selected = true;
    select.appendChild(opt);
  });
}

async function runSelectedMcpTool() {
  const status = byId("agentic-mcp-tool-status");
  const output = byId("agentic-mcp-tool-output");
  const select = byId("agentic-mcp-tool-select");
  const inputEl = byId("agentic-mcp-tool-input");
  if (!status || !output || !select || !inputEl) return;

  const value = select.value || "";
  if (!value || !value.includes("::")) {
    status.textContent = "Select an MCP tool first.";
    return;
  }
  const [serverId, tool] = value.split("::");
  let input = {};
  const raw = inputEl.value.trim();
  if (raw) {
    try {
      input = JSON.parse(raw);
    } catch (error) {
      status.textContent = `Invalid JSON input: ${error.message}`;
      return;
    }
  }

  status.textContent = `Running ${serverId}.${tool}...`;
  output.textContent = "";
  try {
    const result = await apiSend(`/api/agentic/mcp/servers/${encodeURIComponent(serverId)}/call`, "POST", {
      tool,
      input
    });
    output.textContent = toPrettyJson(result.output || {});
    status.textContent = `Completed ${serverId}.${tool}.`;
    await loadAgenticData();
  } catch (error) {
    status.textContent = `MCP tool failed: ${error.message}`;
  }
}

async function loadAgenticData() {
  if (!state.auth.authenticated) return;
  byId("agentic-task-status").textContent = "Loading agentic workspace...";
  try {
    const [tools, tasks, approvals, jobs, metrics, taskEvents, toolEvents, mcp, mcpServers, templates] = await Promise.all([
      apiGet("/api/agentic/tools"),
      apiGet("/api/agentic/tasks"),
      apiGet("/api/agentic/approvals"),
      apiGet("/api/agentic/jobs"),
      apiGet("/api/agentic/metrics/overview"),
      apiGet("/api/agentic/events?type=task&limit=200"),
      apiGet("/api/agentic/events?type=tool&limit=200"),
      apiGet("/api/agentic/mcp/status"),
      apiGet("/api/agentic/mcp/servers?includeTools=true"),
      apiGet("/api/agentic/templates")
    ]);
    state.agentic.tools = tools.tools || [];
    state.agentic.tasks = tasks.tasks || [];
    state.agentic.approvals = approvals.approvals || [];
    state.agentic.jobs = jobs.jobs || [];
    state.agentic.metrics = metrics || null;
    state.agentic.events.task = taskEvents.events || [];
    state.agentic.events.tool = toolEvents.events || [];
    state.agentic.mcp = mcp || null;
    state.agentic.mcpServers = mcpServers.servers || [];
    state.agentic.templates = templates.templates || [];

    if (state.agentic.activeTaskId && !state.agentic.tasks.some((t) => t.id === state.agentic.activeTaskId)) {
      state.agentic.activeTaskId = "";
    }
    if (!state.agentic.activeTaskId && state.agentic.tasks.length) {
      state.agentic.activeTaskId = state.agentic.tasks[0].id;
    }

    renderAgenticTaskSelect();
    renderAgenticTaskDetail();
    renderAgenticTools();
    renderAgenticApprovals();
    renderAgenticMetrics();
    renderAgenticPresetSelect();
    byId("agentic-task-status").textContent = "Agentic workspace loaded.";
  } catch (error) {
    byId("agentic-task-status").textContent = `Failed to load agentic data: ${error.message}`;
  }
}

async function createAgenticTaskFromUi() {
  const status = byId("agentic-task-status");
  let steps = [];
  try {
    refreshAgenticJsonFromBuilder({ silent: true });
    steps = getAgenticStepsFromForm();
  } catch (error) {
    status.textContent = `Invalid steps JSON: ${error.message}`;
    return;
  }

  const payload = {
    title: byId("agentic-task-title").value.trim() || "Agentic Task",
    objective: byId("agentic-task-objective").value.trim(),
    team: {
      mode: byId("agentic-team-mode").value || "auto",
      personaIds: parseCsv(byId("agentic-team-persona-ids").value),
      tags: parseCsv(byId("agentic-team-tags").value),
      maxAgents: safeNumberInput(byId("agentic-team-max-agents").value, 3, {
        min: 1,
        max: 8,
        integer: true
      })
    },
    settings: {
      model: byId("agentic-task-model").value.trim() || "gpt-4.1-mini",
      temperature: safeNumberInput(byId("agentic-task-temperature").value, 0.3, { min: 0, max: 2 })
    },
    steps,
    runImmediately: byId("agentic-run-immediately").checked
  };

  status.textContent = "Creating task...";
  try {
    const data = await apiSend("/api/agentic/tasks", "POST", payload);
    const task = data.task;
    state.agentic.activeTaskId = task?.id || "";
    status.textContent = `Task created: ${task?.id || "unknown"} (${task?.status || "pending"})`;
    await loadAgenticData();
  } catch (error) {
    status.textContent = `Task creation failed: ${error.message}`;
  }
}

async function runSelectedAgenticTask() {
  const status = byId("agentic-task-status");
  const taskId = byId("agentic-task-select").value.trim();
  if (!taskId) {
    status.textContent = "Select a task first.";
    return;
  }
  status.textContent = `Running ${taskId}...`;
  try {
    const data = await apiSend(`/api/agentic/tasks/${encodeURIComponent(taskId)}/run`, "POST", {
      maxSteps: 200
    });
    state.agentic.activeTaskId = data.task?.id || taskId;
    status.textContent = `Run finished: ${data.task?.status || "unknown"}.`;
    await loadAgenticData();
  } catch (error) {
    status.textContent = `Run failed: ${error.message}`;
  }
}

async function previewAgenticRouting() {
  const status = byId("agentic-task-status");
  const output = byId("agentic-router-result");
  const payload = {
    mode: byId("agentic-team-mode").value || "auto",
    personaIds: parseCsv(byId("agentic-team-persona-ids").value),
    tags: parseCsv(byId("agentic-team-tags").value),
    maxAgents: safeNumberInput(byId("agentic-team-max-agents").value, 3, { min: 1, max: 8, integer: true })
  };
  status.textContent = "Previewing team routing...";
  try {
    const data = await apiSend("/api/agentic/router/preview", "POST", payload);
    output.textContent = toPrettyJson(data);
    status.textContent = "Routing preview ready.";
  } catch (error) {
    output.textContent = "";
    status.textContent = `Routing preview failed: ${error.message}`;
  }
}

async function generateAgenticPlanFromGoal() {
  const status = byId("agentic-task-status");
  const reasoningEl = byId("agentic-plan-reasoning");
  const goal = byId("agentic-goal").value.trim();
  if (!goal) {
    status.textContent = "Describe your goal first.";
    return;
  }

  const payload = {
    goal,
    constraints: byId("agentic-constraints").value.trim(),
    maxSteps: safeNumberInput(byId("agentic-plan-max-steps").value, 6, { min: 1, max: 12, integer: true }),
    team: {
      mode: byId("agentic-team-mode").value || "auto",
      personaIds: parseCsv(byId("agentic-team-persona-ids").value),
      tags: parseCsv(byId("agentic-team-tags").value),
      maxAgents: safeNumberInput(byId("agentic-team-max-agents").value, 3, { min: 1, max: 8, integer: true })
    }
  };

  status.textContent = "Generating plan from goal...";
  try {
    const data = await apiSend("/api/agentic/plan", "POST", payload);
    const plan = data.plan || {};
    byId("agentic-task-title").value = plan.title || byId("agentic-task-title").value;
    byId("agentic-task-objective").value = plan.objective || byId("agentic-task-objective").value;
    byId("agentic-team-mode").value = plan.team?.mode || byId("agentic-team-mode").value;
    byId("agentic-team-persona-ids").value = (plan.team?.personaIds || []).join(", ");
    byId("agentic-team-tags").value = (plan.team?.tags || []).join(", ");
    byId("agentic-team-max-agents").value = String(
      safeNumberInput(plan.team?.maxAgents, 3, { min: 1, max: 8, integer: true })
    );
    initAgenticStepDrafts(plan.steps || []);
    renderAgenticStepBuilder();
    refreshAgenticJsonFromBuilder({ silent: true });
    reasoningEl.textContent = toPrettyJson({
      reasoning: plan.reasoning || "",
      generatedAt: new Date().toISOString()
    });
    status.textContent = "Plan generated. Review/edit steps, then create task.";
  } catch (error) {
    status.textContent = `Plan generation failed: ${error.message}`;
  }
}

function loadSelectedAgenticPreset() {
  const chosen = findSelectedAgenticPreset();
  if (!chosen) {
    byId("agentic-task-status").textContent = "Select a preset first.";
    return;
  }
  applyAgenticTemplate(chosen.template);
  byId("agentic-task-status").textContent = `Loaded preset: ${chosen.name}.`;
}

function resetAgenticWorkflow() {
  resetAgenticBuilderToBlank();
  byId("agentic-goal").value = "";
  byId("agentic-constraints").value = "";
  byId("agentic-plan-reasoning").textContent = "";
  byId("agentic-router-result").textContent = "";
  byId("agentic-task-status").textContent = "Builder reset to blank.";
}

async function saveCurrentAgenticTemplate() {
  const status = byId("agentic-task-status");
  try {
    refreshAgenticJsonFromBuilder({ silent: true });
    const steps = getAgenticStepsFromForm();
    const suggestedName = byId("agentic-task-title").value.trim() || "Agentic Template";
    const name = window.prompt("Template name:", suggestedName);
    if (!name || !name.trim()) return;
    const payload = {
      name: name.trim(),
      template: {
        title: byId("agentic-task-title").value.trim() || "Agentic Task",
        objective: byId("agentic-task-objective").value.trim(),
        team: {
          mode: byId("agentic-team-mode").value || "auto",
          personaIds: parseCsv(byId("agentic-team-persona-ids").value),
          tags: parseCsv(byId("agentic-team-tags").value),
          maxAgents: safeNumberInput(byId("agentic-team-max-agents").value, 3, {
            min: 1,
            max: 8,
            integer: true
          })
        },
        settings: {
          model: byId("agentic-task-model").value.trim() || "gpt-4.1-mini",
          temperature: safeNumberInput(byId("agentic-task-temperature").value, 0.3, { min: 0, max: 2 })
        },
        steps
      }
    };
    status.textContent = "Saving template...";
    await apiSend("/api/agentic/templates", "POST", payload);
    await loadAgenticData();
    status.textContent = `Template saved: ${name.trim()}`;
  } catch (error) {
    status.textContent = `Template save failed: ${error.message}`;
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

async function ingestKnowledgeUrl(event) {
  event.preventDefault();
  const status = byId("knowledge-url-status");
  const url = byId("knowledge-url").value.trim();
  if (!url) {
    status.textContent = "URL is required.";
    return;
  }

  const payload = {
    url,
    title: byId("knowledge-url-title").value.trim() || undefined,
    id: byId("knowledge-url-id").value.trim() || undefined,
    tags: byId("knowledge-url-tags").value.trim() || undefined,
    description: byId("knowledge-url-description").value.trim() || undefined,
    mode: byId("knowledge-url-mode").value || "create",
    summarize: byId("knowledge-url-summarize").checked
  };

  status.textContent = "Fetching and ingesting URL...";
  try {
    const res = await apiSend("/api/knowledge/ingest-url", "POST", payload);
    status.textContent = `Ingested '${res.pack?.id || "knowledge pack"}' from ${payload.url}.`;
    byId("knowledge-url-form").reset();
    byId("knowledge-url-summarize").checked = true;
    const preview = byId("knowledge-url-preview-output");
    if (preview) preview.textContent = "";
    await loadKnowledgePacks();
  } catch (error) {
    status.textContent = `URL ingest failed: ${error.message}`;
  }
}

async function previewKnowledgeUrl() {
  const status = byId("knowledge-url-status");
  const url = byId("knowledge-url").value.trim();
  if (!url) {
    status.textContent = "URL is required for preview.";
    return;
  }
  status.textContent = "Fetching preview...";
  try {
    const res = await apiSend("/api/knowledge/preview-url", "POST", { url, maxChars: 4000 });
    const preview = byId("knowledge-url-preview-output");
    if (preview) preview.textContent = res.preview?.text || "";
    const titleEl = byId("knowledge-url-title");
    if (titleEl && !titleEl.value.trim() && res.preview?.title) {
      titleEl.value = res.preview.title;
    }
    status.textContent = "Preview loaded.";
    const panel = byId("knowledge-url-preview-panel");
    if (panel && panel.open === false) panel.open = true;
  } catch (error) {
    status.textContent = `Preview failed: ${error.message}`;
  }
}

function renderWebPolicyForm() {
  if (!state.webPolicy) return;
  const allowlist = byId("knowledge-web-allowlist");
  const denylist = byId("knowledge-web-denylist");
  if (!allowlist || !denylist) return;
  allowlist.value = (state.webPolicy.allowlist || []).join("\n");
  denylist.value = (state.webPolicy.denylist || []).join("\n");
}

async function loadWebPolicy() {
  const status = byId("knowledge-web-policy-status");
  if (!status) return;
  status.textContent = "Loading web policy...";
  try {
    const data = await apiGet("/api/settings/web");
    state.webPolicy = data.policy || null;
    renderWebPolicyForm();
    status.textContent = "Web policy loaded.";
  } catch (error) {
    status.textContent = `Failed to load web policy: ${error.message}`;
  }
}

async function saveWebPolicy() {
  const status = byId("knowledge-web-policy-status");
  if (!status) return;
  const allowlist = (byId("knowledge-web-allowlist").value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const denylist = (byId("knowledge-web-denylist").value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  status.textContent = "Saving web policy...";
  try {
    const data = await apiSend("/api/settings/web", "PUT", {
      policy: { allowlist, denylist }
    });
    state.webPolicy = data.policy || null;
    renderWebPolicyForm();
    status.textContent = "Web policy saved.";
  } catch (error) {
    status.textContent = `Failed to save web policy: ${error.message}`;
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
    toolIds: parseCsv(byId("adhoc-tool-ids").value),
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
    "adhoc-tool-ids",
    "adhoc-knowledge-pack-ids"
  ].forEach((id) => {
    byId(id).value = "";
  });
  byId("adhoc-save").checked = false;
}

async function loadDebate(debateId) {
  const data = await apiGet(`/api/debates/${encodeURIComponent(debateId)}`);
  const session = data.session;
  let debateDetail = null;
  try {
    debateDetail = await apiGet(`/api/admin/debates/${encodeURIComponent(debateId)}`);
  } catch {
    debateDetail = null;
  }
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
  setViewerStageReplay(buildViewerStageReplayFromDebate(session, debateDetail), { preserveIndex: true });
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
      content: m.content || "",
      image: m.image || null
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
      content: entry.content,
      image: entry.image || null
    });
  });
}

function setViewerTypeUI(type) {
  const isDebate = type === "debate";
  byId("viewer-transcript-chat").classList.toggle("hidden", !isDebate);
  byId("download-transcript").classList.toggle("hidden", !isDebate);
  if (!isDebate) {
    byId("chat-status").textContent = "Transcript chat is available for debate-mode sessions only.";
    byId("chat-history").textContent = "Select Debate Mode type to use transcript Q&A.";
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
  const overview = await apiGet("/api/admin/overview");
  const projected = projectOverviewConversations(overview);
  const rows = projected
    .filter((item) => {
      if (type === "debate") return item.conversationType === "debate" && item.transcriptCapable !== false;
      if (type === "group") return item.conversationType === "group-chat";
      if (type === "simple") return item.conversationType === "simple-chat";
      return false;
    })
    .map((item) => {
      const isDebate = item.conversationType === "debate";
      return {
        id: item.conversationId || item.debateId || item.chatId,
        title: item.title || item.conversationId || item.debateId || item.chatId,
        status: isDebate ? item.status || "n/a" : undefined,
        participants: item.participants || [],
        messages: Number(item.drillSummary?.turns || item.messageCount || 0),
        tokens: Number(item.tokenUsage?.totalTokens || 0),
        cost: typeof item.estimatedCostUsd === "number" ? item.estimatedCostUsd : 0,
        risk: {
          red: Number(item.responsibleAi?.stoplights?.red || 0),
          yellow: Number(item.responsibleAi?.stoplights?.yellow || 0),
          green: Number(item.responsibleAi?.stoplights?.green || 0)
        },
        sentiment: {
          positive: Number(item.responsibleAi?.sentiment?.positive || 0),
          neutral: Number(item.responsibleAi?.sentiment?.neutral || 0),
          negative: Number(item.responsibleAi?.sentiment?.negative || 0)
        },
        createdAt: item.lastActivityAt || item.updatedAt || item.createdAt || ""
      };
    });
  rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  state.viewer.historyByType[type] = rows;
  renderViewerHistoryBrowser(type);
}

function projectOverviewConversations(overview) {
  if (Array.isArray(overview?.conversations)) return overview.conversations;
  return [
    ...((overview?.debates || []).map((d) => ({
      ...d,
      conversationType: "debate",
      conversationId: d.debateId,
      transcriptCapable: true
    })) || []),
    ...((overview?.chats || []).map((c) => ({
      ...c,
      conversationType: c.kind === "simple" ? "simple-chat" : c.kind === "support" ? "support-chat" : "group-chat",
      conversationId: c.chatId,
      transcriptCapable: false
    })) || [])
  ];
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
  setViewerStageReplay(null);

  if (type === "group") {
    const data = await apiGet(`/api/persona-chats/${encodeURIComponent(id)}`);
    const session = data.session || {};
    byId("viewer-progress").textContent = `GROUP CHAT | ${session.title || id} | mode=${session.settings?.engagementMode || "chat"} | messages=${(data.messages || []).length}`;
    byId("viewer-transcript").textContent = [
      `Title: ${session.title || id}`,
      `Type: Group Chat`,
      `Participants: ${(session.personas || []).map((p) => p.displayName).join(", ") || "n/a"}`,
      `Model: ${session.settings?.model || "n/a"}`,
      `Context: ${session.context || "(none)"}`,
      `Knowledge Packs: ${(session.knowledgePackIds || []).join(", ") || "none"}`
    ].join("\n");
    renderViewerExchanges(normalizeViewerMessagesFromChat(data));
    setViewerStageReplay(buildViewerStageReplayFromChat(data, "group"));
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
    setViewerStageReplay(buildViewerStageReplayFromChat(data, "simple"));
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
  byId("group-work-debate-viewer").addEventListener("click", () => setGroupWorkspace("debate-viewer"));
  byId("group-nav-live").addEventListener("click", () => setGroupWorkspace("live"));
  byId("group-nav-debate-viewer").addEventListener("click", () => setGroupWorkspace("debate-viewer"));
  byId("persona-chat-template-debate").addEventListener("click", applyDebateTemplateFromPersonaChat);
  byId("debate-sync-from-group").addEventListener("click", syncDebateParticipantsFromPersonaChat);
  byId("persona-chat-mode").addEventListener("change", updatePersonaChatModeHelp);
  byId("config-view-personas").addEventListener("click", () => setConfigView("personas"));
  byId("config-view-knowledge").addEventListener("click", () => setConfigView("knowledge"));
  byId("config-view-rai").addEventListener("click", () => setConfigView("rai"));
  byId("config-view-agentic").addEventListener("click", () => setConfigView("agentic"));
  byId("config-view-theme").addEventListener("click", () => setConfigView("theme"));
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
  byId("logo-upload-trigger").addEventListener("click", () => {
    if (!state.auth.authenticated) {
      showAuthGate("Please log in to update logo.");
      return;
    }
    byId("logo-upload-input").click();
  });
  byId("logo-upload-input").addEventListener("change", async (event) => {
    const file = event.target?.files?.[0] || null;
    await uploadHeaderLogo(file);
    event.target.value = "";
  });
  byId("auth-quick-logout").addEventListener("click", logout);
  byId("open-documentation-page").addEventListener("click", () => {
    window.open("/documentation", "_blank", "noopener");
    closeSystemMenu();
  });
  byId("open-support-page").addEventListener("click", () => {
    openSupportPopout();
  });
  byId("open-help-flyout").addEventListener("click", openHelpPopout);
  byId("open-security-tab").addEventListener("click", () => {
    switchTab("config");
    setConfigView("security");
    closeSystemMenu();
  });
  byId("help-close").addEventListener("click", closeHelpPopout);
  byId("support-close").addEventListener("click", closeSupportPopout);
  byId("support-send").addEventListener("click", sendSupportPopoutMessage);
  byId("support-clear").addEventListener("click", clearSupportPopoutHistory);
  byId("support-message").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendSupportPopoutMessage();
    }
  });
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
      const raw = String(data.key?.rawKey || "");
      byId("security-key-name").value = "";
      await loadSecurityData();
      byId("security-key-status").textContent = "API key created. Copy it now; it will not be shown again.";
      byId("security-key-once").textContent = raw;
      byId("security-copy-key").disabled = !raw;
    } catch (error) {
      byId("security-key-status").textContent = `Failed: ${error.message}`;
    }
  });
  byId("security-copy-key").addEventListener("click", copyGeneratedApiKey);
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
  byId("agentic-create-task").addEventListener("click", createAgenticTaskFromUi);
  byId("agentic-generate-plan").addEventListener("click", generateAgenticPlanFromGoal);
  byId("agentic-load-preset").addEventListener("click", loadSelectedAgenticPreset);
  byId("agentic-reset-blank").addEventListener("click", resetAgenticWorkflow);
  byId("agentic-save-template").addEventListener("click", saveCurrentAgenticTemplate);
  byId("agentic-refresh").addEventListener("click", loadAgenticData);
  byId("agentic-run-selected").addEventListener("click", runSelectedAgenticTask);
  byId("agentic-mcp-tool-run").addEventListener("click", runSelectedMcpTool);
  byId("agentic-router-preview").addEventListener("click", previewAgenticRouting);
  byId("agentic-step-add").addEventListener("click", () => {
    state.agentic.stepDrafts = getAgenticBuilderRowsFromDom();
    state.agentic.stepDrafts.push(normalizeAgenticStepDraft({}, state.agentic.stepDrafts.length));
    renderAgenticStepBuilder();
    refreshAgenticJsonFromBuilder({ silent: true });
  });
  byId("agentic-step-load-json").addEventListener("click", () => {
    try {
      const parsed = getAgenticStepsFromForm();
      initAgenticStepDrafts(parsed);
      renderAgenticStepBuilder();
      byId("agentic-task-status").textContent = "Loaded steps from JSON into builder.";
    } catch (error) {
      byId("agentic-task-status").textContent = `Cannot load JSON: ${error.message}`;
    }
  });
  byId("agentic-step-apply-json").addEventListener("click", () => refreshAgenticJsonFromBuilder({ silent: false }));
  byId("agentic-task-select").addEventListener("change", () => {
    state.agentic.activeTaskId = byId("agentic-task-select").value || "";
    renderAgenticTaskDetail();
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
        if (persona.id !== state.editingPersonaId) {
          statusEl.textContent =
            "Failed: Persona ID cannot be changed during update. Use Duplicate to create a new ID.";
          return;
        }
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
    syncDebateModeTopicContextFromGroup(true);
    const topic = getUnifiedDebateTopic();
    if (!topic) {
      window.alert("Topic is required.");
      return;
    }
    const context = getUnifiedDebateContext();

    const payload = {
      topic,
      context,
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
      byId("debate-run-status").textContent = `Structured debate queued: ${debateId} (selection: ${mode})`;
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
  byId("viewer-open-stage").addEventListener("click", openViewerStagePopout);
  byId("viewer-stage-close").addEventListener("click", closeViewerStagePopout);
  byId("viewer-stage-prev").addEventListener("click", () => stepViewerStage(-1));
  byId("viewer-stage-next").addEventListener("click", () => stepViewerStage(1));
  byId("viewer-stage-play").addEventListener("click", toggleViewerStagePlayback);
  byId("viewer-stage-speed").addEventListener("change", () => {
    state.viewer.stage.speed = Number(byId("viewer-stage-speed").value || 1) || 1;
    if (state.viewer.stage.playing) {
      stopViewerStagePlayback();
      toggleViewerStagePlayback();
    } else {
      renderViewerStagePopout();
    }
  });
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
  byId("knowledge-url-form").addEventListener("submit", ingestKnowledgeUrl);
  byId("knowledge-url-preview").addEventListener("click", previewKnowledgeUrl);
  byId("knowledge-url-reset").addEventListener("click", () => {
    byId("knowledge-url-form").reset();
    byId("knowledge-url-summarize").checked = true;
    byId("knowledge-url-status").textContent = "";
    const preview = byId("knowledge-url-preview-output");
    if (preview) preview.textContent = "";
  });
  byId("knowledge-web-policy-save").addEventListener("click", saveWebPolicy);
  byId("knowledge-refresh").addEventListener("click", loadKnowledgePacks);
  byId("theme-save").addEventListener("click", saveThemeEditor);
  byId("theme-reset").addEventListener("click", resetThemeEditor);
  byId("persona-chat-create").addEventListener("click", createPersonaChatSession);
  byId("persona-chat-new-draft").addEventListener("click", startNewPersonaChatDraft);
  byId("persona-chat-new-draft-main").addEventListener("click", startNewPersonaChatDraft);
  byId("persona-chat-refresh-list").addEventListener("click", loadPersonaChatSessions);
  byId("persona-chat-persona-filter").addEventListener("input", renderPersonaChatPersonaList);
  byId("persona-chat-select-all").addEventListener("click", () => applyPersonaChatSelectionBulk("select"));
  byId("persona-chat-clear-all").addEventListener("click", () => applyPersonaChatSelectionBulk("clear"));
  byId("persona-chat-toggle-sidebar").addEventListener("click", () => setPersonaSidebarCollapsed(true));
  byId("persona-chat-show-sidebar").addEventListener("click", () => setPersonaSidebarCollapsed(false));
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
      if (id === "persona-chat-title" || id === "persona-chat-context") {
        syncDebateModeTopicContextFromGroup();
      }
      if (!state.personaChat.activeChatId) return;
      state.personaChat.dirtyConfig = true;
      byId("persona-chat-status").textContent =
        "Settings changed. Click Create Chat Session to start a new conversation.";
    });
  });
  byId("simple-chat-create").addEventListener("click", createSimpleChatSession);
  byId("simple-chat-new-draft").addEventListener("click", startNewSimpleChatDraft);
  byId("simple-chat-refresh-list").addEventListener("click", loadSimpleChatSessions);
  byId("simple-chat-toggle-sidebar").addEventListener("click", () => setSimpleSidebarCollapsed(true));
  byId("simple-chat-show-sidebar").addEventListener("click", () => setSimpleSidebarCollapsed(false));
  byId("simple-chat-load").addEventListener("click", () => {
    loadSimpleChatSession(byId("simple-chat-id").value.trim());
  });
  byId("simple-chat-send").addEventListener("click", sendSimpleChatMessage);
  byId("simple-chat-image").addEventListener("click", sendSimpleChatImageMessage);
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
  byId("admin-view-tools").addEventListener("click", () => {
    state.adminView = "tools";
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
  byId("admin-tool-refresh").addEventListener("click", loadAdminToolUsage);
  byId("admin-heatmap-refresh").addEventListener("click", loadAdminHeatmap);
  byId("admin-heatmap-mode").addEventListener("change", (event) => {
    state.adminHeatmap.mode = String(event.target?.value || "capability");
    loadAdminHeatmap();
  });
  byId("admin-tool-filter-tool").addEventListener("input", renderAdminToolUsage);
  byId("admin-tool-filter-context").addEventListener("change", renderAdminToolUsage);
  byId("admin-tool-filter-status").addEventListener("change", renderAdminToolUsage);
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
  await loadThemeSettings();
  wireEvents();
  initAgenticStepDrafts(getDefaultAgenticSteps());
  renderAgenticStepBuilder();
  byId("agentic-steps-json").value = toPrettyJson(state.agentic.stepDrafts);
  renderAgenticPresetSelect();
  byId("agentic-router-result").textContent = "";
  byId("agentic-plan-reasoning").textContent = "";
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
  renderPersonaChatKnowledgeList();
  updatePersonaChatModeHelp();
  syncDebateModeTopicContextFromGroup(true);
  renderPersonaChatHistory();
  renderSimpleChatKnowledgeList();
  renderSimpleChatHistory();
  renderSelectedTopicSummary();
  renderTopicDiscoveryResults();
  renderGeneratedTopicDrafts();
  renderKnowledgeStudioList();
  setViewerTypeUI(byId("viewer-conversation-type").value || "debate");
  renderViewerStageButtonState();
  syncDebateModeTopicContextFromGroup(true);
  renderGovernanceChatSessions();
  renderGovernanceChatHistory();
  renderAdminHeatmap();
  setSimpleSidebarCollapsed(false);
  setPersonaSidebarCollapsed(false);
  if (!authed) {
    return;
  }
  await refreshAfterAuth();
}

init();

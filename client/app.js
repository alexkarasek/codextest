const state = {
  personas: [],
  selectedPersonas: [],
  editingPersonaId: null,
  pollingDebateId: null,
  pollIntervalId: null,
  activeDebateId: null,
  mainTab: "debates",
  debatesView: "setup",
  configView: "personas",
  chatByDebate: {},
  lastCitationsByDebate: {},
  adminView: "debates",
  adminOverview: null,
  adminPersonas: null,
  adminChats: null,
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
    historyByChat: {}
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

function safeNumberInput(raw, fallback, { min = -Infinity, max = Infinity, integer = false } = {}) {
  let n = Number(raw);
  if (!Number.isFinite(n)) n = fallback;
  if (integer) n = Math.round(n);
  if (n < min) n = min;
  if (n > max) n = max;
  return n;
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

async function apiGet(url) {
  const res = await fetch(url);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload.ok) {
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
    throw new Error(apiErrorMessage(payload));
  }
  return payload.data;
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
    const el = document.createElement("div");
    el.className = `chat-msg ${msg.role}`;
    el.textContent = `${msg.role === "user" ? "You" : "Assistant"}: ${msg.content}`;
    container.appendChild(el);
  });

  container.scrollTop = container.scrollHeight;
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
    const el = document.createElement("div");
    el.className = `chat-msg ${role}`;
    el.textContent = `${title}: ${msg.content}`;
    container.appendChild(el);
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
    state.personaChat.historyByChat[chatId] = Array.isArray(data.messages) ? data.messages : [];
    byId("persona-chat-id").value = chatId;
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
      })
    }
  };

  status.textContent = "Creating persona chat session...";
  try {
    const data = await apiSend("/api/persona-chats", "POST", payload);
    const chatId = data.chatId;
    status.textContent = `Created chat ${chatId}`;
    await loadPersonaChatSessions();
    await loadPersonaChatSession(chatId);
  } catch (error) {
    status.textContent = `Create failed: ${error.message}`;
  }
}

async function sendPersonaChatMessage() {
  const status = byId("persona-chat-status");
  const input = byId("persona-chat-message");
  const chatId = state.personaChat.activeChatId || byId("persona-chat-id").value.trim();
  const message = input.value.trim();

  if (!chatId) {
    status.textContent = "Create or load a chat first.";
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

function setSubtabActive(group, value) {
  const map = {
    debates: {
      setup: "debates-view-setup",
      viewer: "debates-view-viewer"
    },
    config: {
      personas: "config-view-personas",
      knowledge: "config-view-knowledge"
    }
  };
  const groupMap = map[group] || {};
  Object.entries(groupMap).forEach(([key, id]) => {
    const btn = byId(id);
    if (btn) btn.classList.toggle("active", key === value);
  });
}

function setDebatesView(view) {
  state.debatesView = view === "viewer" ? "viewer" : "setup";
  byId("tab-new-debate").classList.toggle("active", state.mainTab === "debates" && state.debatesView === "setup");
  byId("tab-viewer").classList.toggle("active", state.mainTab === "debates" && state.debatesView === "viewer");
  setSubtabActive("debates", state.debatesView);
}

function setConfigView(view) {
  state.configView = view === "knowledge" ? "knowledge" : "personas";
  byId("tab-personas").classList.toggle("active", state.mainTab === "config" && state.configView === "personas");
  byId("tab-knowledge").classList.toggle("active", state.mainTab === "config" && state.configView === "knowledge");
  setSubtabActive("config", state.configView);
  if (state.mainTab === "config" && state.configView === "knowledge") {
    loadKnowledgePacks();
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

  byId("subnav-debates").classList.toggle("hidden", tabName !== "debates");
  byId("subnav-config").classList.toggle("hidden", tabName !== "config");

  if (tabName === "debates") {
    setDebatesView(state.debatesView);
    return;
  }

  if (tabName === "chats") {
    byId("tab-persona-chat").classList.add("active");
    renderPersonaChatPersonaList();
    renderPersonaChatHistory();
    loadPersonaChatSessions();
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
  const cards = [
    { label: "Conversations", value: totals.totalConversations ?? ((totals.debates || 0) + (totals.chats || 0)) },
    { label: "Debates", value: totals.debates ?? 0 },
    { label: "Chats", value: totals.chats ?? 0 },
    { label: "Total Tokens", value: Number(totals.totalTokens || 0).toLocaleString() },
    { label: "Chat Messages", value: Number(totals.chatMessages || 0).toLocaleString() },
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

function renderAdminDebatesList() {
  const container = byId("admin-list");
  container.innerHTML = "";
  const debates = state.adminOverview?.debates || [];

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
      <div class="admin-item-sub">Tokens: ${Number(debate.tokenUsage?.totalTokens || 0).toLocaleString()} | Est. Cost: ${
        typeof debate.estimatedCostUsd === "number" ? `$${debate.estimatedCostUsd.toFixed(6)}` : "n/a"
      }</div>
    `;

    const actions = document.createElement("div");
    actions.className = "row";
    const drill = document.createElement("button");
    drill.type = "button";
    drill.textContent = "Drill Down";
    drill.addEventListener("click", () => loadAdminDebateDetail(debate.debateId));
    actions.appendChild(drill);
    item.appendChild(actions);

    container.appendChild(item);
  });
}

function renderAdminPersonasList() {
  const container = byId("admin-list");
  container.innerHTML = "";
  const personas = state.adminPersonas?.personas || [];

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
  const chats = state.adminChats?.chats || state.adminOverview?.chats || [];

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
        <span class="admin-item-sub">${chat.chatId}</span>
      </div>
      <div class="admin-item-sub">Participants: ${(chat.participants || []).join(", ") || "n/a"}</div>
      <div class="admin-item-sub">Turns: ${chat.turns || 0} | Messages: ${chat.messageCount || 0}</div>
      <div class="admin-item-sub">Last activity: ${chat.lastActivityAt || chat.updatedAt || "n/a"}</div>
      <div class="admin-item-sub">Summary: ${chat.summary || "n/a"}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "row";
    const drill = document.createElement("button");
    drill.type = "button";
    drill.textContent = "Drill Down";
    drill.addEventListener("click", () => loadAdminChatDetail(chat.chatId));
    actions.appendChild(drill);
    item.appendChild(actions);

    container.appendChild(item);
  });
}

function renderAdminList() {
  if (state.adminView === "personas") {
    renderAdminPersonasList();
  } else if (state.adminView === "chats") {
    renderAdminChatsList();
  } else {
    renderAdminDebatesList();
  }
}

async function loadAdminDebateDetail(debateId) {
  const statusEl = byId("admin-detail-status");
  const detailEl = byId("admin-detail");
  statusEl.textContent = `Loading ${debateId}...`;

  try {
    const detail = await apiGet(`/api/admin/debates/${encodeURIComponent(debateId)}`);
    const roundsText = (detail.rounds || [])
      .map((round) => {
        const entries = (round.entries || [])
          .map((e) => `- ${e.speaker} [${e.type}, ${e.wordCount} words]\\n${e.text}`)
          .join("\\n\\n");
        return `## Round ${round.round}\\n\\n${entries}`;
      })
      .join("\\n\\n");

    detailEl.textContent = [
      `Title: ${detail.title}`,
      `Participants: ${(detail.participants || []).join(", ")}`,
      `Model: ${detail.model}`,
      `Tokens: ${Number(detail.tokenUsage?.totalTokens || 0).toLocaleString()}`,
      `Estimated Cost: ${typeof detail.estimatedCostUsd === "number" ? `$${detail.estimatedCostUsd.toFixed(6)}` : "n/a"}`,
      "",
      `Outcomes:\\n${detail.outcomes || "n/a"}`,
      "",
      roundsText || "No round data available."
    ].join("\\n");
    statusEl.textContent = `Loaded ${debateId}`;
  } catch (error) {
    statusEl.textContent = `Failed to load detail: ${error.message}`;
  }
}

async function loadAdminChatDetail(chatId) {
  const statusEl = byId("admin-detail-status");
  const detailEl = byId("admin-detail");
  statusEl.textContent = `Loading chat ${chatId}...`;

  try {
    const detail = await apiGet(`/api/admin/chats/${encodeURIComponent(chatId)}`);
    const rows = (detail.messages || [])
      .map((m) => {
        const who =
          m.role === "user"
            ? "You"
            : m.role === "orchestrator"
              ? "Orchestrator"
              : (m.displayName || m.speakerId || "Persona");
        return `- ${who} [${m.role}] ${m.content || ""}`;
      })
      .join("\n\n");

    detailEl.textContent = [
      `Title: ${detail.title}`,
      `Chat Id: ${detail.chatId}`,
      `Participants: ${(detail.participants || []).join(", ")}`,
      `Model: ${detail.model}`,
      `Turns: ${detail.turns || 0}`,
      `Messages: ${detail.messageCount || 0}`,
      `Last activity: ${detail.lastActivityAt || detail.updatedAt || "n/a"}`,
      "",
      rows || "No chat messages available."
    ].join("\n");
    statusEl.textContent = `Loaded chat ${chatId}`;
  } catch (error) {
    statusEl.textContent = `Failed to load chat detail: ${error.message}`;
  }
}

async function loadAdminData() {
  byId("admin-pricing-note").textContent = "Loading governance metrics...";
  try {
    const [overview, personas, chats] = await Promise.all([
      apiGet("/api/admin/overview"),
      apiGet("/api/admin/personas"),
      apiGet("/api/admin/chats")
    ]);
    state.adminOverview = overview;
    state.adminPersonas = personas;
    state.adminChats = chats;
    byId("admin-pricing-note").textContent = overview.pricingNote || "";
    renderAdminSummaryCards();
    renderAdminList();
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
    renderKnowledgePacks();
    renderKnowledgeStudioList();
    renderPersonaKnowledgePackList();
  } catch {
    state.knowledgePacks = [];
    state.selectedKnowledgePackIds = [];
    state.personaFormKnowledgePackIds = [];
    renderKnowledgePacks();
    renderKnowledgeStudioList();
    renderPersonaKnowledgePackList();
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

  byId("viewer-debate-id").value = debateId;
  byId("download-transcript").href = `/api/debates/${encodeURIComponent(debateId)}/transcript`;
  byId("viewer-progress").textContent = `${session.status.toUpperCase()} | Round ${
    session.progress?.round || 0
  } | ${session.progress?.currentSpeaker || "-"} | ${session.progress?.message || ""}`;
  if (session.personaSelection?.mode) {
    byId("viewer-progress").textContent += ` | selection=${session.personaSelection.mode}`;
  }
  byId("viewer-transcript").textContent = data.transcript || "";
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
  byId("debates-view-setup").addEventListener("click", () => setDebatesView("setup"));
  byId("debates-view-viewer").addEventListener("click", () => setDebatesView("viewer"));
  byId("config-view-personas").addEventListener("click", () => setConfigView("personas"));
  byId("config-view-knowledge").addEventListener("click", () => setConfigView("knowledge"));

  byId("persona-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const persona = personaFromForm();

    try {
      if (state.editingPersonaId) {
        await apiSend(`/api/personas/${state.editingPersonaId}`, "PUT", persona);
        byId("persona-status").textContent = "Persona updated.";
      } else {
        const data = await apiSend("/api/personas", "POST", persona);
        const details = data.optimization
          ? `changedFields=${data.optimization.changedFields || 0}, strictRewrite=${Boolean(
              data.optimization.strictRewrite
            )}`
          : "";
        const message = `${data.optimization?.message || "Persona created."}${
          details ? ` (${details})` : ""
        }`;
        byId("persona-status").textContent = message;
      }
      resetPersonaForm();
      await loadPersonas();
    } catch (error) {
      window.alert(error.message);
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
      byId("viewer-debate-id").value = debateId;
      switchTab("debates");
      setDebatesView("viewer");
      await loadDebate(debateId);
      startPollingDebate(debateId);
    } catch (error) {
      byId("debate-run-status").textContent = `Failed: ${error.message}`;
    }
  });

  byId("load-debate").addEventListener("click", async () => {
    const debateId = byId("viewer-debate-id").value.trim();
    if (!debateId) {
      window.alert("Enter debate id.");
      return;
    }

    try {
      await loadDebate(debateId);
      startPollingDebate(debateId);
    } catch (error) {
      byId("viewer-progress").textContent = error.message;
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
  byId("admin-refresh").addEventListener("click", loadAdminData);
}

async function init() {
  wireEvents();
  switchTab("debates");
  setDebatesView("setup");
  setConfigView("personas");
  renderPersonaKnowledgePackList();
  renderPersonaPreview();
  renderChatHistory();
  renderPersonaChatPersonaList();
  renderPersonaChatHistory();
  renderSelectedTopicSummary();
  renderTopicDiscoveryResults();
  renderGeneratedTopicDrafts();
  renderKnowledgeStudioList();
  await loadPersonas();
  await loadKnowledgePacks();
  await loadPersonaChatSessions();
}

init();

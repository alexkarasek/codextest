const state = {
  personas: [],
  selectedPersonas: [],
  editingPersonaId: null,
  pollingDebateId: null,
  pollIntervalId: null,
  activeDebateId: null,
  chatByDebate: {},
  lastCitationsByDebate: {}
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

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  document.querySelectorAll(".tab-section").forEach((section) => {
    section.classList.remove("active");
  });
  byId(`tab-${tabName}`).classList.add("active");
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
    debateBehavior: String(fd.get("debateBehavior") || "").trim()
  };
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
  renderPersonaPreview();
}

function resetPersonaForm() {
  state.editingPersonaId = null;
  byId("persona-form-title").textContent = "Create Persona";
  byId("persona-form").reset();
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
      switchTab("personas");
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
    return persona ? `${persona.displayName} (${persona.id})` : `Saved (${entry.id})`;
  }
  return `Ad-hoc: ${entry.persona.displayName}`;
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
  } catch (error) {
    byId("persona-errors").textContent = error.message;
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
    debateBehavior: byId("adhoc-debateBehavior").value.trim()
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
    "adhoc-debateBehavior"
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
      settings: {
        rounds: safeNumberInput(byId("debate-rounds").value, 3, { min: 1, max: 8, integer: true }),
        maxWordsPerTurn: safeNumberInput(byId("debate-max-words").value, 120, {
          min: 40,
          max: 400,
          integer: true
        }),
        moderationStyle: byId("debate-moderation-style").value.trim() || "neutral",
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
      switchTab("viewer");
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
}

async function init() {
  wireEvents();
  renderPersonaPreview();
  renderChatHistory();
  await loadPersonas();
}

init();

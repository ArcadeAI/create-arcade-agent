// Dashboard client — vanilla JS for the triage dashboard + chat panel.
// Handles: Arcade connection gate, plan streaming (NDJSON), task rendering, chat panel (SSE).

// --- DOM refs ---
const gate = document.getElementById("gate");
const gateChecking = document.getElementById("gate-checking");
const gateAuth = document.getElementById("gate-auth");
const gateAuthLink = document.getElementById("gate-auth-link");
const gateAuthRetry = document.getElementById("gate-auth-retry");
const gateError = document.getElementById("gate-error");
const gateErrorMsg = document.getElementById("gate-error-msg");
const dashboardArea = document.getElementById("dashboard-area");
const emptyState = document.getElementById("empty-state");
const loadingSkeletons = document.getElementById("loading-skeletons");
const statsBar = document.getElementById("stats-bar");
const taskList = document.getElementById("task-list");
const taskContainer = document.getElementById("task-container");
const taskCount = document.getElementById("task-count");
const authPrompts = document.getElementById("auth-prompts");
const statusBar = document.getElementById("status-bar");
const statusText = document.getElementById("status-text");
const errorBar = document.getElementById("error-bar");
const planBtn = document.getElementById("plan-btn");
const planDisabledHint = document.getElementById("plan-disabled-hint");
const replanBtn = document.getElementById("replan-btn");
const logoutBtn = document.getElementById("logout-btn");
const chatToggleBtn = document.getElementById("chat-toggle-btn");
const chatPanel = document.getElementById("chat-panel");
const chatOverlay = document.getElementById("chat-overlay");
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");

// --- State ---
let items = [];
let chatOpen = false;
let chatConversation = [];
let isChatStreaming = false;
let isPlanning = false;
let sourceStatuses = {}; // { github: 'checking' | 'connected' | 'auth_required', ... }
let authUrlsBySource = {}; // { github: 'https://...', ... }
const skippedProviders = new Set();

const REQUIRED_PROVIDERS = ["slack", "google", "linear", "github"];
const SOURCE_TO_PROVIDER = {
  slack: "slack",
  google_calendar: "google",
  gmail: "google",
  linear: "linear",
  github: "github",
};
const PROVIDER_CONFIG = {
  slack: { label: "Slack", color: "bg-purple-100 text-purple-700 border-purple-200", icon: "💬" },
  google: { label: "Google", color: "bg-blue-100 text-blue-700 border-blue-200", icon: "📅" },
  linear: { label: "Linear", color: "bg-indigo-100 text-indigo-700 border-indigo-200", icon: "✅" },
  github: { label: "GitHub", color: "bg-gray-100 text-gray-700 border-gray-300", icon: "🔀" },
  other: { label: "Other", color: "bg-gray-100 text-gray-600 border-gray-200", icon: "🌐" },
};

function normalizeSourceName(name) {
  if (!name) return null;
  if (SOURCE_TO_PROVIDER[name]) return name;
  if (name.startsWith("Slack_")) return "slack";
  if (name.startsWith("Google") || name.startsWith("Calendar")) return "google_calendar";
  if (name.startsWith("Linear_")) return "linear";
  if (name.startsWith("Github_") || name.startsWith("GitHub_")) return "github";
  if (name.startsWith("Gmail_")) return "gmail";
  return null;
}

function providerForSource(source) {
  return SOURCE_TO_PROVIDER[source] || "other";
}

function getProviderState() {
  const grouped = {};
  for (const [source, status] of Object.entries(sourceStatuses)) {
    const provider = providerForSource(source);
    grouped[provider] = grouped[provider] || [];
    grouped[provider].push(status);
  }

  const providerStatuses = {};
  for (const provider of REQUIRED_PROVIDERS) {
    const statuses = grouped[provider] || [];
    if (statuses.includes("auth_required")) providerStatuses[provider] = "auth_required";
    else if (statuses.includes("checking")) providerStatuses[provider] = "checking";
    else if (statuses.includes("connected")) providerStatuses[provider] = "connected";
    else providerStatuses[provider] = "unknown";
  }

  const providerAuthUrls = {};
  for (const [source, url] of Object.entries(authUrlsBySource)) {
    const provider = providerForSource(source);
    if (!providerAuthUrls[provider]) providerAuthUrls[provider] = url;
  }

  const unresolvedProviders = REQUIRED_PROVIDERS.filter(
    (provider) => providerStatuses[provider] !== "connected" && !skippedProviders.has(provider)
  );

  return { providerStatuses, providerAuthUrls, unresolvedProviders };
}

// --- Date display ---
const dateEl = document.getElementById("header-date");
if (dateEl) {
  dateEl.textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

// --- Arcade connection gate ---
let connectInFlight = false;
let authInProgress = false;

function showGateState(state) {
  gateChecking.classList.add("hidden");
  gateAuth.classList.add("hidden");
  gateError.classList.add("hidden");
  gate.classList.remove("hidden");
  dashboardArea.classList.add("hidden");

  if (state === "checking") {
    gateChecking.classList.remove("hidden");
  } else if (state === "auth") {
    gateAuth.classList.remove("hidden");
  } else if (state === "error") {
    gateError.classList.remove("hidden");
  } else if (state === "connected") {
    gate.classList.add("hidden");
    dashboardArea.classList.remove("hidden");
    dashboardArea.classList.add("flex");
  }
}

async function checkArcadeConnection() {
  if (connectInFlight) return;
  if (authInProgress) return;
  connectInFlight = true;
  showGateState("checking");

  try {
    const res = await fetch("/api/arcade/connect", { method: "POST" });
    if (res.status === 401) {
      window.location.href = "/";
      return;
    }
    const data = await res.json();

    if (data.connected) {
      authInProgress = false;
      showGateState("connected");
      checkSourceStatuses();
    } else if (data.authUrl) {
      authInProgress = true;
      gateAuthLink.href = data.authUrl;
      showGateState("auth");
    } else {
      authInProgress = false;
      gateErrorMsg.textContent = data.error || "Could not connect to Arcade Gateway.";
      showGateState("error");
    }
  } catch {
    authInProgress = false;
    gateErrorMsg.textContent = "Failed to check Arcade connection.";
    showGateState("error");
  } finally {
    connectInFlight = false;
  }
}

function retryArcadeConnection() {
  authInProgress = false;
  checkArcadeConnection();
}

gateAuthRetry.addEventListener("click", retryArcadeConnection);
checkArcadeConnection();
window.addEventListener("focus", () => {
  if (!dashboardArea.classList.contains("hidden")) return;
  if (!authInProgress) return;
  retryArcadeConnection();
});

// --- Logout ---
logoutBtn.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/";
});

// --- Check source auth status via WhoAmI tools ---
async function checkSourceStatuses() {
  try {
    const res = await fetch("/api/sources", { method: "POST" });
    if (!res.ok) return;
    const data = await res.json();
    for (const [source, info] of Object.entries(data.sources || {})) {
      sourceStatuses[source] = info.status;
      if (info.authUrl) authUrlsBySource[source] = info.authUrl;
    }
    for (const provider of [...skippedProviders]) {
      const sourcesForProvider = Object.keys(sourceStatuses).filter(
        (source) => providerForSource(source) === provider
      );
      const providerConnected = sourcesForProvider.some(
        (source) => sourceStatuses[source] === "connected"
      );
      if (providerConnected) skippedProviders.delete(provider);
    }
    renderToolStatus();
    renderAuthPrompts();
    showState();
  } catch {
    /* silent */
  }
}

// --- Utility ---
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return url;
  } catch {
    /* invalid URL */
  }
  return "#";
}

// --- Source config ---
const SOURCE_CONFIG = {
  slack: { label: "Slack", color: "bg-purple-100 text-purple-700 border-purple-200", icon: "💬" },
  google_calendar: {
    label: "Calendar",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    icon: "📅",
  },
  linear: { label: "Linear", color: "bg-indigo-100 text-indigo-700 border-indigo-200", icon: "✅" },
  github: { label: "GitHub", color: "bg-gray-100 text-gray-700 border-gray-300", icon: "🔀" },
  gmail: { label: "Gmail", color: "bg-red-100 text-red-700 border-red-200", icon: "📧" },
  other: { label: "Other", color: "bg-gray-100 text-gray-600 border-gray-200", icon: "🌐" },
};

// --- Tool status bar ---
function renderToolStatus() {
  let container = document.getElementById("tool-status-bar");
  if (!container) {
    container = document.createElement("div");
    container.id = "tool-status-bar";
    container.className = "flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-4";
    const main = dashboardArea.querySelector(".max-w-4xl") || dashboardArea;
    main.insertBefore(container, main.firstChild);
  }

  const { providerStatuses, providerAuthUrls } = getProviderState();
  const entries = REQUIRED_PROVIDERS.map((provider) => [provider, providerStatuses[provider]]).filter(
    ([, status]) => status !== "unknown"
  );
  if (!entries.length) {
    container.classList.add("hidden");
    return;
  }
  container.classList.remove("hidden");

  container.innerHTML =
    '<span class="font-medium">Sources:</span>' +
    entries
      .map(([provider, status]) => {
        const config = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.other;
        const dotClass =
          status === "connected"
            ? "bg-green-500"
            : status === "auth_required"
              ? "bg-amber-500"
              : status === "checking"
                ? "bg-gray-400 animate-pulse"
                : "bg-gray-300";
        const borderClass =
          status === "connected"
            ? "border-green-200 bg-green-50"
            : status === "auth_required"
              ? "border-amber-200 bg-amber-50"
              : "border-gray-200 bg-gray-50";
        const authUrl = status === "auth_required" ? providerAuthUrls[provider] : null;
        const inner =
          `<span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${borderClass}">` +
          `${config.icon} <span>${escapeHtml(config.label)}</span>` +
          `<span class="inline-block w-2 h-2 rounded-full ${dotClass}"></span>` +
          `</span>`;
        if (authUrl) {
          return `<a href="${sanitizeUrl(authUrl)}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity">${inner}</a>`;
        }
        return inner;
      })
      .join("");
}

// --- Priority / Category badges ---
const PRIORITY_COLORS = {
  P0: "bg-red-100 text-red-700 border-red-200",
  P1: "bg-amber-100 text-amber-700 border-amber-200",
  P2: "bg-blue-100 text-blue-700 border-blue-200",
  FYI: "bg-gray-100 text-gray-600 border-gray-200",
};

const CATEGORY_LABELS = {
  NEEDS_REPLY: "Needs Reply",
  NEEDS_FEEDBACK: "Needs Feedback",
  NEEDS_DECISION: "Needs Decision",
  NEEDS_REVIEW: "Needs Review",
  ATTEND: "Attend",
  FYI: "FYI",
  IGNORE: "Ignore",
};

function createTaskCard(task, index) {
  const card = document.createElement("div");
  const priorityClass = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.FYI;
  const categoryLabel = CATEGORY_LABELS[task.category] || task.category;
  const source = SOURCE_CONFIG[task.source] || SOURCE_CONFIG.other;

  card.className =
    "bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow";
  card.style.animation = `fadeSlideIn 0.3s ease-out ${index * 0.05}s both`;

  const subtitle =
    task.sourceDetail ||
    (task.participants || []).map((p) => escapeHtml(p.name || p.id)).join(", ");
  const summaryHtml = task.url
    ? `<a href="${escapeHtml(task.url)}" target="_blank" rel="noopener noreferrer" class="text-sm font-medium mb-1 hover:underline block">${escapeHtml(task.summary || "")}</a>`
    : `<p class="text-sm font-medium mb-1">${escapeHtml(task.summary || "")}</p>`;

  const timeHtml = task.scheduledTime
    ? `<span class="text-xs font-medium text-blue-600">${new Date(task.scheduledTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>`
    : "";

  card.innerHTML = `
    <div class="flex items-start justify-between gap-3 mb-2">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="px-2 py-0.5 rounded-full text-xs font-medium border ${source.color}">${source.icon} ${escapeHtml(source.label)}</span>
        <span class="px-2 py-0.5 rounded-full text-xs font-medium border ${priorityClass}">${escapeHtml(task.priority)}</span>
        <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">${escapeHtml(categoryLabel)}</span>
        ${task.effort ? `<span class="text-xs text-gray-400">${escapeHtml(task.effort)}</span>` : ""}
        ${timeHtml}
      </div>
    </div>
    ${summaryHtml}
    ${subtitle ? `<p class="text-xs text-gray-400 mb-2">${escapeHtml(subtitle)}</p>` : ""}
    ${task.suggestedNextStep ? `<p class="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1"><span class="font-medium">Next:</span> ${escapeHtml(task.suggestedNextStep)}</p>` : ""}
  `;

  return card;
}

function renderTasks() {
  taskContainer.innerHTML = "";
  items.forEach((task, i) => taskContainer.appendChild(createTaskCard(task, i)));
  taskCount.textContent = `(${items.length})`;
}

function renderStats(data) {
  const container = document.getElementById("stats-container");
  if (!container) return;
  container.innerHTML = "";

  // Total card
  const totalCard = document.createElement("div");
  totalCard.className = "bg-white rounded-xl border border-gray-200 p-4";
  totalCard.innerHTML = `
    <div class="flex items-center gap-2 text-gray-500 text-sm mb-1">📊 Total</div>
    <div class="text-2xl font-semibold">${data.total || 0}</div>
  `;
  container.appendChild(totalCard);

  // Per-source cards
  const bySource = data.bySource || {};
  for (const [source, count] of Object.entries(bySource)) {
    if (count <= 0) continue;
    const config = SOURCE_CONFIG[source] || SOURCE_CONFIG.other;
    const card = document.createElement("div");
    card.className = "bg-white rounded-xl border border-gray-200 p-4";
    card.innerHTML = `
      <div class="flex items-center gap-2 text-gray-500 text-sm mb-1">${config.icon} ${escapeHtml(config.label)}</div>
      <div class="text-2xl font-semibold">${count}</div>
    `;
    container.appendChild(card);
  }
}

function showState() {
  const { unresolvedProviders } = getProviderState();
  const hasItems = items.length > 0;
  const hasUnresolvedProviders = unresolvedProviders.length > 0;
  const hasAuthPrompts = !authPrompts.classList.contains("hidden");

  emptyState.classList.toggle("hidden", hasItems || isPlanning || hasAuthPrompts);
  loadingSkeletons.classList.toggle("hidden", !isPlanning || hasItems || hasAuthPrompts);
  statsBar.classList.toggle("hidden", !hasItems);
  taskList.classList.toggle("hidden", !hasItems);
  planBtn.disabled = isPlanning || hasUnresolvedProviders;
  planDisabledHint.classList.toggle("hidden", !hasUnresolvedProviders || isPlanning);
  if (replanBtn) {
    replanBtn.classList.toggle("hidden", !hasItems);
  }
}

// --- Auth prompts ---
function renderAuthPrompts() {
  const { unresolvedProviders, providerAuthUrls } = getProviderState();
  authPrompts.innerHTML = "";

  if (!unresolvedProviders.length) {
    authPrompts.classList.add("hidden");
    return;
  }

  authPrompts.classList.remove("hidden");
  for (const provider of unresolvedProviders) {
    const config = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.other;
    const authUrl = providerAuthUrls[provider];
    const card = document.createElement("div");
    card.className = "bg-amber-50 border border-amber-200 rounded-lg p-4";
    card.innerHTML = `
      <div class="flex items-center gap-2 mb-2">
        <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        <h3 class="font-semibold text-sm">${escapeHtml(config.label)} authorization required</h3>
      </div>
      <p class="text-gray-500 text-xs mb-3">${escapeHtml(config.label)} needs permission to continue.</p>
      <div class="flex gap-2">
        ${
          authUrl
            ? `<a href="${sanitizeUrl(authUrl)}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 bg-red-500 text-white text-sm rounded-md hover:bg-red-600">Authorize</a>`
            : ""
        }
        <button class="skip-auth px-3 py-1.5 border border-gray-300 text-sm rounded-md hover:bg-gray-50">Skip for now</button>
      </div>
    `;

    card.querySelector(".skip-auth").addEventListener("click", () => {
      skippedProviders.add(provider);
      errorBar.classList.add("hidden");
      renderAuthPrompts();
      showState();
    });

    authPrompts.appendChild(card);
  }
}

// --- Plan execution ---
planBtn.addEventListener("click", handlePlan);
if (replanBtn) {
  replanBtn.addEventListener("click", handlePlan);
}

async function handlePlan() {
  const { unresolvedProviders } = getProviderState();
  if (unresolvedProviders.length) {
    errorBar.textContent = "Authorize or skip remaining toolkits before planning your day.";
    errorBar.classList.remove("hidden");
    showState();
    return;
  }

  isPlanning = true;
  planBtn.disabled = true;
  planBtn.textContent = "Planning...";
  if (replanBtn) {
    replanBtn.disabled = true;
    replanBtn.textContent = "Replanning...";
  }
  items = [];
  sourceStatuses = {};
  authUrlsBySource = {};
  errorBar.classList.add("hidden");
  authPrompts.innerHTML = "";
  authPrompts.classList.add("hidden");
  renderToolStatus();
  showState();

  try {
    const res = await fetch("/api/plan", { method: "POST" });
    if (!res.ok || !res.body) throw new Error(`Plan request failed (${res.status})`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          switch (event.type) {
            case "task":
              items.push(event.data);
              renderTasks();
              showState();
              break;
            case "summary":
              renderStats(event.data);
              break;
            case "sources":
              sourceStatuses = Object.fromEntries(event.sources.map((s) => [s, "checking"]));
              renderToolStatus();
              break;
            case "auth_required":
              if (event.toolName) {
                const source = normalizeSourceName(event.toolName);
                if (source) {
                  sourceStatuses[source] = "auth_required";
                  authUrlsBySource[source] = event.authUrl || event.auth_url;
                  renderToolStatus();
                  renderAuthPrompts();
                  showState();
                }
              }
              break;
            case "status":
              statusBar.classList.remove("hidden");
              statusText.textContent = event.message;
              break;
            case "error":
              errorBar.textContent = event.message;
              errorBar.classList.remove("hidden");
              break;
          }
        } catch {
          /* skip malformed */
        }
      }
    }
  } catch (err) {
    errorBar.textContent = err.message || "Something went wrong";
    errorBar.classList.remove("hidden");
  } finally {
    isPlanning = false;
    planBtn.disabled = false;
    planBtn.textContent = "Plan my day";
    if (replanBtn) {
      replanBtn.disabled = false;
      replanBtn.textContent = "Replan my day";
    }
    statusBar.classList.add("hidden");
    for (const key of Object.keys(sourceStatuses)) {
      if (sourceStatuses[key] === "checking") sourceStatuses[key] = "connected";
    }
    renderToolStatus();
    renderAuthPrompts();
    showState();
  }
}

// --- Chat panel ---
chatToggleBtn.addEventListener("click", toggleChat);

function toggleChat() {
  chatOpen = !chatOpen;
  chatPanel.classList.toggle("translate-x-full", !chatOpen);
  chatOverlay.classList.toggle("hidden", !chatOpen);
  if (chatOpen) chatInput.focus();
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || isChatStreaming) return;
  chatInput.value = "";
  sendChatMessage(text);
});

function addChatBubble(role, html) {
  // Remove empty state text
  const empty = chatMessages.querySelector("p.text-center");
  if (empty) empty.remove();

  const wrapper = document.createElement("div");
  wrapper.className = `flex ${role === "user" ? "justify-end" : "justify-start"}`;

  const bubble = document.createElement("div");
  bubble.className = `max-w-[80%] px-4 py-3 rounded-lg text-sm ${
    role === "user"
      ? "whitespace-pre-wrap bg-red-500 text-white"
      : "bg-white border border-gray-200 markdown-content"
  }`;
  bubble.innerHTML = html;

  wrapper.appendChild(bubble);
  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return bubble;
}

async function sendChatMessage(text) {
  isChatStreaming = true;
  chatSendBtn.disabled = true;

  addChatBubble("user", escapeHtml(text));
  chatConversation.push({ role: "user", content: text });

  let assistantBubble = null;
  let assistantText = "";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chatConversation }),
    });

    if (res.status === 401) {
      window.location.href = "/";
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      addChatBubble(
        "assistant",
        `<span class="text-red-600">Error: ${escapeHtml(err.error || res.statusText)}</span>`
      );
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "text") {
            if (!assistantBubble) assistantBubble = addChatBubble("assistant", "");
            assistantText += data.content;
            assistantBubble.innerHTML =
              typeof marked !== "undefined"
                ? marked.parse(assistantText)
                : escapeHtml(assistantText);
            chatMessages.scrollTop = chatMessages.scrollHeight;
          } else if (data.type === "auth_required") {
            const source = normalizeSourceName(data.toolName);
            if (source && data.authorization_url) {
              sourceStatuses[source] = "auth_required";
              authUrlsBySource[source] = data.authorization_url;
              renderToolStatus();
              renderAuthPrompts();
              showState();
            }
          }
        } catch {
          /* skip */
        }
      }
    }

    if (assistantText) {
      chatConversation.push({ role: "assistant", content: assistantText });
    }
  } catch (err) {
    addChatBubble(
      "assistant",
      `<span class="text-red-600">Error: ${escapeHtml(err.message)}</span>`
    );
  } finally {
    isChatStreaming = false;
    chatSendBtn.disabled = false;
  }
}

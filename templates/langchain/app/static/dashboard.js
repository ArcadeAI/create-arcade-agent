// Dashboard client — vanilla JS for the triage dashboard.
// Handles: Arcade connection gate, plan streaming (NDJSON), task rendering.

// --- DOM refs ---
const gate = document.getElementById("gate");
const gateChecking = document.getElementById("gate-checking");
const gateAuth = document.getElementById("gate-auth");
const gateAuthLink = document.getElementById("gate-auth-link");
const gateAuthCta = document.getElementById("gate-auth-cta");
const gateAuthWaiting = document.getElementById("gate-auth-waiting");
const gateAuthRetry = document.getElementById("gate-auth-retry");
const gateAuthWaitingRetry = document.getElementById("gate-auth-waiting-retry");
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
const replanBtn = document.getElementById("replan-btn");
const logoutBtn = document.getElementById("logout-btn");

// --- State ---
let items = [];
let sourceStatuses = {}; // { github: 'checking' | 'connected' | 'auth_required', ... }
let authUrlsBySource = {}; // { github: 'https://...', ... }

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
    resetGateAuthWaiting();
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

function showGateAuthWaiting() {
  gateAuthCta.classList.add("hidden");
  gateAuthWaiting.classList.remove("hidden");
}

function resetGateAuthWaiting() {
  gateAuthCta.classList.remove("hidden");
  gateAuthWaiting.classList.add("hidden");
}

function retryArcadeConnection() {
  resetGateAuthWaiting();
  authInProgress = false;
  checkArcadeConnection();
}

gateAuthLink.addEventListener("click", showGateAuthWaiting);
gateAuthRetry.addEventListener("click", retryArcadeConnection);
gateAuthWaitingRetry.addEventListener("click", retryArcadeConnection);
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
  slack: {
    label: "Slack",
    color:
      "bg-purple-100 text-purple-900 border-purple-200 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-900",
  },
  google_calendar: {
    label: "Calendar",
    color:
      "bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900",
  },
  linear: {
    label: "Linear",
    color:
      "bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-200 dark:border-indigo-900",
  },
  github: {
    label: "GitHub",
    color: "bg-muted text-muted-foreground border-border",
  },
  gmail: {
    label: "Gmail",
    color:
      "bg-red-100 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900",
  },
  other: {
    label: "Other",
    color: "bg-muted text-muted-foreground border-border",
  },
};

// --- Priority / Category badges ---
const PRIORITY_COLORS = {
  P0: "bg-red-100 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900",
  P1: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900",
  P2: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
  FYI: "bg-muted text-muted-foreground border-border",
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
    "task-card bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow space-y-3";
  card.style.animation = `fadeSlideIn 0.3s ease-out ${index * 0.05}s both`;

  const subtitle =
    task.sourceDetail ||
    (task.participants || []).map((p) => escapeHtml(p.name || p.id)).join(", ");
  const summaryHtml = task.url
    ? `<a href="${sanitizeUrl(task.url)}" target="_blank" rel="noopener noreferrer" class="text-sm font-medium leading-snug hover:underline block">${escapeHtml(task.summary || "")}</a>`
    : `<p class="text-sm font-medium leading-snug">${escapeHtml(task.summary || "")}</p>`;

  const timeHtml = task.scheduledTime
    ? `<span class="text-xs font-medium text-blue-600 dark:text-blue-400">${new Date(task.scheduledTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>`
    : "";

  const categoryBadge = `<span class="px-2 py-0.5 rounded text-xs font-medium border border-border bg-muted text-muted-foreground">${escapeHtml(categoryLabel)}</span>`;

  card.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="px-2 py-0.5 rounded text-xs font-medium border ${source.color}">${escapeHtml(source.label)}</span>
      <span class="px-2 py-0.5 rounded text-xs font-medium border ${priorityClass}">${escapeHtml(task.priority)}</span>
      ${categoryBadge}
      ${timeHtml}
      ${task.effort ? `<span class="ml-auto text-xs text-muted-foreground">${escapeHtml(task.effort)}</span>` : ""}
    </div>
    ${summaryHtml}
    <div class="flex items-baseline justify-between gap-4">
      ${subtitle ? `<span class="truncate text-xs text-muted-foreground">${escapeHtml(subtitle)}</span>` : "<span></span>"}
      ${task.suggestedNextStep ? `<span class="shrink-0 text-xs italic text-muted-foreground">${escapeHtml(task.suggestedNextStep)}</span>` : ""}
    </div>
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

  const statCardClass = "stats-card bg-card rounded-xl border border-border p-4";

  // Total card
  const totalCard = document.createElement("div");
  totalCard.className = statCardClass;
  totalCard.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <span class="text-sm font-medium text-muted-foreground">Total</span>
    </div>
    <div class="text-3xl font-bold">${data.total || 0}</div>
  `;
  container.appendChild(totalCard);

  // Per-source cards
  const bySource = data.bySource || {};
  for (const [source, count] of Object.entries(bySource)) {
    if (count <= 0) continue;
    const config = SOURCE_CONFIG[source] || SOURCE_CONFIG.other;
    const card = document.createElement("div");
    card.className = statCardClass;
    card.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium text-muted-foreground">${escapeHtml(config.label)}</span>
      </div>
      <div class="text-3xl font-bold">${count}</div>
    `;
    container.appendChild(card);
  }
}

function showState() {
  const hasItems = items.length > 0;
  const isLoading = planBtn.disabled;
  const hasAuthPrompts = !authPrompts.classList.contains("hidden");

  emptyState.classList.toggle("hidden", hasItems || isLoading || hasAuthPrompts);
  loadingSkeletons.classList.toggle("hidden", !isLoading || hasItems || hasAuthPrompts);
  statsBar.classList.toggle("hidden", !hasItems);
  taskList.classList.toggle("hidden", !hasItems);
  if (replanBtn) {
    replanBtn.classList.toggle("hidden", !hasItems);
  }
}

// --- Auth prompts ---
function addAuthPrompt(url, toolName) {
  if (authPrompts.querySelector(`[data-url="${CSS.escape(url)}"]`)) return;
  authPrompts.classList.remove("hidden");

  const label = toolName || "Service";
  const card = document.createElement("div");
  card.className = "auth-prompt-card bg-warning/10 border border-warning/30 rounded-lg p-4";
  card.dataset.url = url;
  card.innerHTML = `
    <div class="flex items-center gap-2 mb-2">
      <svg class="w-5 h-5 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
      <h3 class="font-semibold text-sm">${escapeHtml(label)} authorization required</h3>
    </div>
    <p class="text-muted-foreground text-xs mb-3">${escapeHtml(label)} needs permission to continue.</p>
    <div class="flex gap-2">
      <a href="${sanitizeUrl(url)}" target="_blank" rel="noopener noreferrer"
         class="px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-sm rounded-md transition-colors">Authorize</a>
      <button class="dismiss-auth-btn px-3 py-1.5 border border-border text-sm rounded-md hover:bg-muted transition-colors">Continue</button>
    </div>
  `;

  card.querySelector(".dismiss-auth-btn").addEventListener("click", () => {
    card.remove();
    if (!authPrompts.children.length) authPrompts.classList.add("hidden");
    showState();
    // Re-check sources — user may have just authorized
    checkSourceStatuses();
  });

  authPrompts.appendChild(card);
  showState();
}

// --- Plan execution ---
planBtn.addEventListener("click", handlePlan);
if (replanBtn) {
  replanBtn.addEventListener("click", handlePlan);
}

async function handlePlan() {
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
              break;
            case "auth_required":
              addAuthPrompt(event.authUrl || event.auth_url, event.toolName);
              if (event.toolName) {
                sourceStatuses[event.toolName] = "auth_required";
                authUrlsBySource[event.toolName] = event.authUrl || event.auth_url;
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
    showState();
  }
}

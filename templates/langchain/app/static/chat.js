// Chat client — vanilla JS port of the React chat/page.tsx from the ai-sdk template.
// Handles: Arcade connection gate, SSE streaming, tool call accordions, auth URL display.

const gate = document.getElementById('gate');
const gateChecking = document.getElementById('gate-checking');
const gateAuth = document.getElementById('gate-auth');
const gateAuthLink = document.getElementById('gate-auth-link');
const gateAuthRetry = document.getElementById('gate-auth-retry');
const gateError = document.getElementById('gate-error');
const gateErrorMsg = document.getElementById('gate-error-msg');
const chatArea = document.getElementById('chat-area');
const messagesEl = document.getElementById('messages');
const emptyState = document.getElementById('empty-state');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const logoutBtn = document.getElementById('logout-btn');

let conversationMessages = []; // {role, content} history sent to the backend
let isStreaming = false;
let lastUserMessage = '';

// --- Arcade connection gate ---
// Matches the ai-sdk/mastra UX: explicit button opens OAuth in a new tab,
// user clicks "retry" or refocuses the window to re-check connection.
// NOTE: No periodic health check for token expiry. If the Arcade token
// expires mid-session, the next chat request will return an error.

let connectInFlight = false;
let authInProgress = false;

function showGateState(state) {
  gateChecking.classList.add('hidden');
  gateAuth.classList.add('hidden');
  gateError.classList.add('hidden');
  gate.classList.remove('hidden');
  chatArea.classList.add('hidden');

  if (state === 'checking') {
    gateChecking.classList.remove('hidden');
  } else if (state === 'auth') {
    gateAuth.classList.remove('hidden');
  } else if (state === 'error') {
    gateError.classList.remove('hidden');
  } else if (state === 'connected') {
    gate.classList.add('hidden');
    chatArea.classList.remove('hidden');
    chatArea.classList.add('flex');
  }
}

async function checkArcadeConnection() {
  if (connectInFlight) return;
  if (authInProgress) return; // Don't regenerate PKCE verifier while OAuth is pending
  connectInFlight = true;

  showGateState('checking');

  try {
    const res = await fetch('/api/arcade/connect', { method: 'POST' });
    const data = await res.json();

    if (data.connected) {
      authInProgress = false;
      showGateState('connected');
    } else if (data.authUrl) {
      authInProgress = true;
      gateAuthLink.href = data.authUrl;
      showGateState('auth');
    } else {
      authInProgress = false;
      gateErrorMsg.textContent = data.error || 'Could not connect to Arcade Gateway.';
      showGateState('error');
    }
  } catch {
    authInProgress = false;
    gateErrorMsg.textContent = 'Failed to check Arcade connection.';
    showGateState('error');
  } finally {
    connectInFlight = false;
  }
}

function retryArcadeConnection() {
  authInProgress = false; // Allow a fresh connect attempt
  checkArcadeConnection();
}

gateAuthRetry.addEventListener('click', retryArcadeConnection);

checkArcadeConnection();
window.addEventListener('focus', () => {
  if (!chatArea.classList.contains('hidden')) return; // already connected
  if (!authInProgress) return; // only re-check if user was sent to OAuth
  retryArcadeConnection();
});

// --- Logout ---

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

// --- Chat ---

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addMessageBubble(role, html) {
  if (emptyState) emptyState.remove();

  const wrapper = document.createElement('div');
  wrapper.className = `flex ${role === 'user' ? 'justify-end' : 'justify-start'}`;

  const bubble = document.createElement('div');
  bubble.className = `max-w-2xl px-4 py-3 rounded-lg text-sm ${
    role === 'user'
      ? 'whitespace-pre-wrap bg-gray-900 text-white'
      : 'bg-white border border-gray-200 markdown-content'
  }`;
  bubble.innerHTML = html;

  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  scrollToBottom();
  return bubble;
}

function addToolAccordion(name, callId, args) {
  const bubbles = messagesEl.querySelectorAll('.justify-start > div');
  const lastBubble = bubbles[bubbles.length - 1];
  if (!lastBubble) return;

  const details = document.createElement('details');
  details.className = 'mt-2 border border-gray-200 rounded overflow-hidden text-xs';
  if (callId) details.dataset.toolCallId = callId;

  const summary = document.createElement('summary');
  summary.className = 'flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-600 cursor-pointer select-none hover:bg-gray-100 font-medium';
  summary.innerHTML = `<span class="tool-chevron inline-block w-3 text-[10px] transition-transform duration-150">&#9654;</span> ${escapeHtml(name)}`;

  const body = document.createElement('div');
  body.className = 'tool-body px-3 py-2 space-y-2 border-t border-gray-100';

  if (args && Object.keys(args).length > 0) {
    const inputSection = document.createElement('div');
    inputSection.innerHTML = `<div class="font-medium text-gray-500 mb-1">Input</div><pre class="bg-gray-50 rounded p-2 overflow-x-auto text-gray-700 whitespace-pre-wrap">${escapeHtml(JSON.stringify(args, null, 2))}</pre>`;
    body.appendChild(inputSection);
  }

  details.appendChild(summary);
  details.appendChild(body);
  lastBubble.appendChild(details);
  scrollToBottom();
}

function updateToolAccordionResult(callId, output) {
  let details;
  if (callId) {
    details = messagesEl.querySelector(`details[data-tool-call-id="${CSS.escape(callId)}"]`);
  }
  if (!details) {
    // Fallback: find the last accordion that doesn't yet have output
    const all = messagesEl.querySelectorAll('details');
    for (let i = all.length - 1; i >= 0; i--) {
      if (!all[i].querySelector('.tool-output')) {
        details = all[i];
        break;
      }
    }
  }
  if (!details) return;

  const body = details.querySelector('.tool-body');
  if (!body) return;

  const outputSection = document.createElement('div');
  outputSection.className = 'tool-output';
  outputSection.innerHTML =
    `<div class="font-medium text-gray-500 mb-1">Output</div>` +
    `<pre class="bg-gray-50 rounded p-2 overflow-x-auto text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto">${escapeHtml(output)}</pre>`;
  body.appendChild(outputSection);
  scrollToBottom();
}

function addAuthCard(toolName, authUrl) {
  const bubbles = messagesEl.querySelectorAll('.justify-start > div');
  const lastBubble = bubbles[bubbles.length - 1];
  if (!lastBubble) return;

  const card = document.createElement('div');
  card.className = 'bg-amber-50 border border-amber-200 p-3 rounded mt-2';
  card.innerHTML = `
    <p class="text-sm font-medium mb-2">Authorization required</p>
    <a href="${sanitizeUrl(authUrl)}" target="_blank" rel="noopener noreferrer"
       class="inline-block px-3 py-1 bg-gray-900 text-white text-sm rounded hover:bg-gray-800 mr-2 mb-1">
      Authorize ${escapeHtml(toolName)}
    </a>
    <button class="continue-auth-btn block mt-2 w-full px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700">
      Continue After Authorization
    </button>
  `;

  card.querySelector('.continue-auth-btn').addEventListener('click', () => {
    if (!isStreaming && lastUserMessage) {
      sendMessage(lastUserMessage);
    }
  });

  lastBubble.appendChild(card);
  scrollToBottom();
}

function addThinkingBubble() {
  const wrapper = document.createElement('div');
  wrapper.className = 'flex justify-start';
  wrapper.id = 'thinking-bubble';

  const bubble = document.createElement('div');
  bubble.className = 'px-4 py-3 rounded-lg bg-white border border-gray-200 text-sm text-gray-500';
  bubble.textContent = 'Thinking...';

  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  scrollToBottom();
}

function removeThinkingBubble() {
  const el = document.getElementById('thinking-bubble');
  if (el) el.remove();
}

function setLoading(loading) {
  isStreaming = loading;
  sendBtn.disabled = loading;
  chatInput.disabled = loading;
}

async function sendMessage(text) {
  if (isStreaming) return;
  setLoading(true);

  // Add user message to UI
  addMessageBubble('user', escapeHtml(text));

  // Track in conversation history
  conversationMessages.push({ role: 'user', content: text });
  lastUserMessage = text;

  addThinkingBubble();

  let assistantBubble = null;
  let assistantText = '';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationMessages }),
    });

    if (!res.ok) {
      removeThinkingBubble();
      const errData = await res.json().catch(() => ({}));
      addMessageBubble('assistant', `<span class="text-red-600">Error: ${escapeHtml(errData.error || res.statusText)}</span>`);
      setLoading(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            switch (data.type) {
              case 'text':
                removeThinkingBubble();
                if (!assistantBubble) {
                  assistantBubble = addMessageBubble('assistant', '');
                }
                assistantText += data.content;
                assistantBubble.innerHTML = typeof marked !== 'undefined'
                  ? marked.parse(assistantText)
                  : escapeHtml(assistantText);
                scrollToBottom();
                break;

              case 'tool_call':
                removeThinkingBubble();
                if (!assistantBubble) {
                  assistantBubble = addMessageBubble('assistant', '');
                }
                addToolAccordion(data.tool_name, data.tool_call_id, data.tool_args);
                break;

              case 'tool_result':
                updateToolAccordionResult(data.tool_call_id, data.tool_output);
                break;

              case 'auth_required':
                removeThinkingBubble();
                if (!assistantBubble) {
                  assistantBubble = addMessageBubble('assistant', '');
                }
                addAuthCard(data.tool_name, data.authorization_url);
                break;

              case 'error':
                removeThinkingBubble();
                addMessageBubble('assistant', `<span class="text-red-600">Error: ${escapeHtml(data.message)}</span>`);
                break;

              case 'done':
                break;
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    }

    // Track assistant response in conversation history
    if (assistantText) {
      conversationMessages.push({ role: 'assistant', content: assistantText });
    }
  } catch (err) {
    removeThinkingBubble();
    addMessageBubble('assistant', `<span class="text-red-600">Network error: ${escapeHtml(err.message)}</span>`);
  } finally {
    setLoading(false);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return url;
  } catch { /* invalid URL */ }
  return '#';
}

// --- Form handling ---

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || isStreaming) return;
  chatInput.value = '';
  sendMessage(text);
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});

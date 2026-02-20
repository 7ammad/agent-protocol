import { fetchState, fetchStatus, fetchEvents } from './utils/api.js';
import { connectSSE } from './utils/sse.js';
import { renderAgentCards } from './components/agent-card.js';
import { renderFileTree } from './components/file-tree.js';
import { renderEventList, prependEvent } from './components/event-list.js';
import { renderTaskBoard } from './components/task-board.js';

// ── Initial Load ──
try {
  const state = await fetchState();
  renderAgentCards(state.agents, state.lead);
  renderFileTree(state.resources);
  renderTaskBoard(state.tasks);

  const events = await fetchEvents(50);
  renderEventList(events);

  // Set initial event count
  const countEl = document.getElementById('event-count');
  if (countEl) {
    const filtered = events.filter(e => e.action !== 'agent.heartbeat');
    countEl.textContent = `${filtered.length} events`;
  }
} catch (err) {
  console.error('Failed to load initial state:', err);
}

// ── Health Polling ──
async function updateHealthBadge(status) {
  const dot = document.getElementById('health-dot');
  if (!dot) return;

  if (status && status.agents) {
    dot.classList.remove('health-dot--offline');
    dot.setAttribute('aria-label', 'Daemon status: online');
  } else {
    dot.classList.add('health-dot--offline');
    dot.setAttribute('aria-label', 'Daemon status: offline');
  }
}

setInterval(async () => {
  try {
    const status = await fetchStatus();
    updateHealthBadge(status);
  } catch {
    updateHealthBadge(null);
  }
}, 5000);

// ── SSE Real-time ──
connectSSE(async (event) => {
  // Always add to timeline (except heartbeat)
  if (event.action !== 'agent.heartbeat') {
    prependEvent(event);
  }

  // Route to section updaters
  if (event.action.startsWith('agent.')) {
    try {
      const state = await fetchState();
      renderAgentCards(state.agents, state.lead);
    } catch { /* SSE handler — silent */ }
  }
  if (event.action.startsWith('resource.')) {
    try {
      const state = await fetchState();
      renderFileTree(state.resources);
    } catch { /* SSE handler — silent */ }
  }
  if (event.action.startsWith('task.') || event.action.startsWith('handoff.')) {
    try {
      const state = await fetchState();
      renderTaskBoard(state.tasks);
    } catch { /* SSE handler — silent */ }
  }
});

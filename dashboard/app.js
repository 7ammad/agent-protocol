import { fetchState, fetchStatus, fetchEvents } from './utils/api.js';
import { connectSSE } from './utils/sse.js';
import { renderOverview } from './components/overview.js';
import { renderAgentCards } from './components/agent-card.js';
import { renderFileTree } from './components/file-tree.js';
import { renderEventList, prependEvent } from './components/event-list.js';
import { renderTaskBoard } from './components/task-board.js';
import { renderHandoffPanel } from './components/handoff-panel.js';

// ── State Cache ──
let currentState = { agents: [], resources: [], tasks: [], handoffs: [], lead: null };
let currentEvents = [];
let eventTotal = 0;

async function refreshState() {
  try {
    currentState = await fetchState();
  } catch { /* offline */ }
}

async function refreshEvents() {
  try {
    currentEvents = await fetchEvents(100);
    const filtered = currentEvents.filter(e => e.action !== 'agent.heartbeat');
    eventTotal = filtered.length;
    updateEventBadge();
  } catch { /* offline */ }
}

function updateEventBadge() {
  const badge = document.getElementById('event-count-badge');
  if (badge) badge.textContent = eventTotal;
}

// ── Router ──
const routes = {
  '/': renderOverviewPage,
  '/agents': renderAgentsPage,
  '/files': renderFilesPage,
  '/tasks': renderTasksPage,
  '/events': renderEventsPage,
  '/handoffs': renderHandoffsPage,
};

function getRoute() {
  const hash = window.location.hash || '#/';
  return hash.slice(1) || '/';
}

function updateActiveLink() {
  const route = getRoute();
  document.querySelectorAll('.sidebar-link').forEach(link => {
    const href = link.getAttribute('href');
    const linkRoute = href.slice(1) || '/';
    link.classList.toggle('active', linkRoute === route);
  });
}

async function navigate() {
  const route = getRoute();
  const renderer = routes[route] || routes['/'];
  updateActiveLink();
  await refreshState();
  await refreshEvents();
  renderer();
}

// ── Page Renderers ──
function renderOverviewPage() {
  const container = document.getElementById('page-container');
  renderOverview(container, currentState, currentEvents);
}

function renderAgentsPage() {
  const container = document.getElementById('page-container');
  container.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Agents</h2>
      <button class="btn btn-primary" id="btn-register-agent">+ Register Agent</button>
    </div>
    <div id="agent-cards-content"></div>
  `;
  renderAgentCards(currentState.agents, currentState.lead);
}

function renderFilesPage() {
  const container = document.getElementById('page-container');
  container.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Files</h2>
      <button class="btn btn-primary" id="btn-claim-file">+ Claim File</button>
    </div>
    <div id="file-tree-content"></div>
  `;
  renderFileTree(currentState.resources, currentState.agents);
}

function renderTasksPage() {
  const container = document.getElementById('page-container');
  container.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Tasks</h2>
      <button class="btn btn-primary" id="btn-create-task">+ Create Task</button>
    </div>
    <div id="task-board-content" class="task-board-columns"></div>
  `;
  renderTaskBoard(currentState.tasks, currentState.agents);
}

function renderEventsPage() {
  const container = document.getElementById('page-container');
  container.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Events</h2>
    </div>
    <div id="event-list-content" class="event-list event-list--full"></div>
  `;
  renderEventList(currentEvents);
}

function renderHandoffsPage() {
  const container = document.getElementById('page-container');
  container.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Handoffs</h2>
      <button class="btn btn-primary" id="btn-create-handoff">+ Create Handoff</button>
    </div>
    <div id="handoff-content"></div>
  `;
  renderHandoffPanel(currentState.handoffs, currentState.agents);
}

// ── Health Polling ──
async function updateHealthBadge() {
  const dot = document.getElementById('health-dot');
  if (!dot) return;
  try {
    const status = await fetchStatus();
    if (status && status.agents) {
      dot.classList.remove('health-dot--offline');
      dot.setAttribute('aria-label', 'Daemon status: online');
    } else {
      dot.classList.add('health-dot--offline');
      dot.setAttribute('aria-label', 'Daemon status: offline');
    }
  } catch {
    dot.classList.add('health-dot--offline');
    dot.setAttribute('aria-label', 'Daemon status: offline');
  }
}

setInterval(updateHealthBadge, 5000);

// ── SSE Real-time ──
connectSSE(async (event) => {
  if (event.action !== 'agent.heartbeat') {
    eventTotal++;
    updateEventBadge();
  }

  await refreshState();

  const route = getRoute();

  if (event.action !== 'agent.heartbeat' && route === '/events') {
    prependEvent(event);
  }

  if (route === '/' || route === '') {
    renderOverviewPage();
  } else if (route === '/agents' && event.action.startsWith('agent.')) {
    renderAgentCards(currentState.agents, currentState.lead);
  } else if (route === '/files' && event.action.startsWith('resource.')) {
    renderFileTree(currentState.resources, currentState.agents);
  } else if (route === '/tasks' && (event.action.startsWith('task.') || event.action.startsWith('handoff.'))) {
    renderTaskBoard(currentState.tasks, currentState.agents);
  } else if (route === '/handoffs' && event.action.startsWith('handoff.')) {
    renderHandoffPanel(currentState.handoffs, currentState.agents);
  }
});

// ── Init ──
window.addEventListener('hashchange', navigate);
navigate();
updateHealthBadge();

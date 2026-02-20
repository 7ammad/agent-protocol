const MAX_EVENTS = 100;
let userScrolled = false;
let scrollListenerAttached = false;

const ACTION_MAP = {
  'agent.joined': (e) => `${e.agent_id} joined as ${e.metadata?.role || 'worker'}`,
  'agent.left': (e) => `${e.agent_id} disconnected`,
  'agent.status_changed': (e) => `${e.agent_id} → ${e.metadata?.status || '?'}`,
  'resource.claimed': (e) => `${e.agent_id} claimed ${e.resource}`,
  'resource.released': (e) => `${e.agent_id} released ${e.resource}`,
  'resource.modified': (e) => `${e.resource} modified`,
  'resource.conflict_detected': (e) => `CONFLICT: ${e.resource}`,
  'resource.conflict_resolved': (e) => `${e.resource} conflict resolved`,
  'task.created': (e) => `New task: ${e.metadata?.title || e.task_id}`,
  'task.assigned': (e) => `${e.metadata?.title || e.task_id} → ${e.metadata?.assigned_to || '?'}`,
  'task.started': (e) => `${e.agent_id} started ${e.metadata?.title || e.task_id}`,
  'task.completed': (e) => `${e.metadata?.title || e.task_id} completed`,
  'task.blocked': (e) => `${e.metadata?.title || e.task_id} blocked`,
  'handoff.initiated': (e) => `${e.agent_id} → handoff to ${e.metadata?.to_agent || '?'}`,
  'handoff.accepted': (e) => `Handoff accepted by ${e.agent_id}`,
  'handoff.rejected': (e) => `Handoff rejected: ${e.metadata?.reason || ''}`,
  'authority.decision': (e) => `Authority: ${e.metadata?.type || 'decision'}`,
  'authority.escalation': (e) => `Escalation: ${e.metadata?.type || 'escalation'}`,
};

function getEventCategory(action) {
  if (action.startsWith('agent.')) return 'agent';
  if (action.startsWith('resource.')) return 'resource';
  if (action.startsWith('task.')) return 'task';
  if (action.startsWith('handoff.')) return 'handoff';
  if (action.startsWith('authority.')) return 'authority';
  return 'agent';
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function renderEventRow(event, animate = false) {
  const mapper = ACTION_MAP[event.action];
  if (!mapper) return '';

  const text = mapper(event);
  const category = getEventCategory(event.action);

  return `
    <div class="event-row ${animate ? 'ap-event-enter' : ''}">
      <span class="event-time">${formatTime(event.timestamp)}</span>
      <span class="event-agent"><span class="badge badge--tool-other">${escapeHtml(event.agent_id)}</span></span>
      <span class="event-text event-text--${category}">${escapeHtml(text)}</span>
    </div>
  `;
}

export function renderEventList(events) {
  const container = document.getElementById('event-list-content');

  // Filter out heartbeats
  const filtered = events.filter(e => e.action !== 'agent.heartbeat');

  if (filtered.length === 0) {
    container.innerHTML = '<p class="section-empty">No events yet</p>';
    return;
  }

  // Newest first
  const sorted = [...filtered].sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_EVENTS);
  container.innerHTML = sorted.map(e => renderEventRow(e, false)).join('');

  // Track user scroll (attach once to avoid listener leak)
  if (!scrollListenerAttached) {
    scrollListenerAttached = true;
    container.addEventListener('scroll', () => {
      userScrolled = container.scrollTop > 10;
    });
  }
}

export function prependEvent(event) {
  if (event.action === 'agent.heartbeat') return;

  const container = document.getElementById('event-list-content');

  // Remove empty state if present
  const empty = container.querySelector('.section-empty');
  if (empty) empty.remove();

  const html = renderEventRow(event, true);
  container.insertAdjacentHTML('afterbegin', html);

  // Trim to max
  const rows = container.querySelectorAll('.event-row');
  if (rows.length > MAX_EVENTS) {
    rows[rows.length - 1].remove();
  }

  // Auto-scroll to top unless user scrolled down
  if (!userScrolled) {
    container.scrollTop = 0;
  }

  // Update event count in header
  const countEl = document.getElementById('event-count');
  if (countEl) {
    const current = parseInt(countEl.textContent) || 0;
    countEl.textContent = `${current + 1} events`;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

import { escapeHtml, relativeTime } from '../utils/time.js';

export function renderOverview(container, state, events) {
  const agentCount = state.agents?.length || 0;
  const activeAgents = state.agents?.filter(a => a.status === 'working').length || 0;
  const totalFiles = state.resources?.length || 0;
  const claimedFiles = state.resources?.filter(r => r.state === 'claimed' || r.state === 'locked').length || 0;
  const conflictedFiles = state.resources?.filter(r => r.state === 'conflicted').length || 0;
  const totalTasks = state.tasks?.length || 0;
  const inProgress = state.tasks?.filter(t => t.status === 'in_progress').length || 0;
  const doneTasks = state.tasks?.filter(t => t.status === 'done').length || 0;
  const pendingHandoffs = state.handoffs?.filter(h => h.status === 'pending').length || 0;

  const recentEvents = (events || [])
    .filter(e => e.action !== 'agent.heartbeat')
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 8);

  container.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Overview</h2>
    </div>

    ${conflictedFiles > 0 ? `
      <div class="conflict-alert ap-conflict-alert">
        ${conflictedFiles} file conflict${conflictedFiles > 1 ? 's' : ''} detected — <a href="#/files" class="conflict-link">resolve now</a>
      </div>
    ` : ''}

    ${pendingHandoffs > 0 ? `
      <div class="handoff-alert">
        ${pendingHandoffs} pending handoff${pendingHandoffs > 1 ? 's' : ''} — <a href="#/handoffs" class="handoff-link">review</a>
      </div>
    ` : ''}

    <div class="stat-grid">
      <a href="#/agents" class="stat-card lg-glass-interactive">
        <div class="stat-value">${agentCount}</div>
        <div class="stat-label">Agents</div>
        <div class="stat-sub">${activeAgents} working</div>
      </a>
      <a href="#/files" class="stat-card lg-glass-interactive">
        <div class="stat-value">${totalFiles}</div>
        <div class="stat-label">Files Tracked</div>
        <div class="stat-sub">${claimedFiles} claimed</div>
      </a>
      <a href="#/tasks" class="stat-card lg-glass-interactive">
        <div class="stat-value">${totalTasks}</div>
        <div class="stat-label">Tasks</div>
        <div class="stat-sub">${inProgress} in progress, ${doneTasks} done</div>
      </a>
      <a href="#/events" class="stat-card lg-glass-interactive">
        <div class="stat-value">${recentEvents.length}</div>
        <div class="stat-label">Recent Events</div>
        <div class="stat-sub">Last activity</div>
      </a>
    </div>

    ${agentCount === 0 && totalTasks === 0 ? `
      <div class="onboarding-card lg-glass-thin">
        <h3>Getting Started</h3>
        <ol class="onboarding-steps">
          <li>Start the daemon: <code>agent-protocol start</code></li>
          <li>Register agents from the <a href="#/agents">Agents</a> page or start an adapter</li>
          <li>Create tasks from the <a href="#/tasks">Tasks</a> page to coordinate work</li>
          <li>Watch agents claim files and work in real-time</li>
        </ol>
      </div>
    ` : ''}

    ${state.agents?.length > 0 ? `
      <div class="overview-section">
        <h3 class="overview-section-title">Active Agents</h3>
        <div class="overview-agent-list">
          ${state.agents.slice(0, 4).map(a => `
            <div class="overview-agent-chip lg-glass-thin">
              <span class="status-dot status-dot--${a.status} ${a.status === 'working' ? 'ap-status-dot--working' : ''}"></span>
              <span class="overview-agent-id">${escapeHtml(a.id)}</span>
              <span class="badge badge--${a.role === 'lead' ? 'lead' : a.role}">${escapeHtml(a.role)}</span>
            </div>
          `).join('')}
          ${state.agents.length > 4 ? `<a href="#/agents" class="overview-more">+${state.agents.length - 4} more</a>` : ''}
        </div>
      </div>
    ` : ''}

    ${recentEvents.length > 0 ? `
      <div class="overview-section">
        <h3 class="overview-section-title">Recent Activity</h3>
        <div class="overview-events">
          ${recentEvents.map(e => `
            <div class="overview-event-row">
              <span class="overview-event-time">${relativeTime(e.timestamp)}</span>
              <span class="overview-event-text">${escapeHtml(e.agent_id)} — ${escapeHtml(e.action)}</span>
            </div>
          `).join('')}
        </div>
        <a href="#/events" class="overview-more">View all events</a>
      </div>
    ` : ''}
  `;
}

const TOOL_BADGE_CLASS = {
  'claude-code': 'badge--claude-code',
  'cursor': 'badge--cursor',
  'codex': 'badge--codex',
  'copilot': 'badge--copilot',
  'openclaw': 'badge--openclaw',
};

const ROLE_BADGE_CLASS = {
  'lead': 'badge--lead',
  'specialist': 'badge--specialist',
  'worker': 'badge--worker',
};

function relativeTime(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function renderAgentCards(agents, lead) {
  const container = document.getElementById('agent-cards-content');

  if (!agents || agents.length === 0) {
    container.innerHTML = '<p class="section-empty">No agents connected</p>';
    return;
  }

  // Lead first, then by joined_at
  const sorted = [...agents].sort((a, b) => {
    if (a.id === lead) return -1;
    if (b.id === lead) return 1;
    return a.joined_at - b.joined_at;
  });

  container.innerHTML = sorted.map((agent, i) => {
    const isLead = agent.id === lead;
    const toolClass = TOOL_BADGE_CLASS[agent.tool] || 'badge--tool-other';
    const roleClass = ROLE_BADGE_CLASS[agent.role] || 'badge--worker';
    const stagger = i < 4 ? `ap-stagger-${i + 1}` : '';

    return `
      <div class="agent-card lg-glass-interactive ${isLead ? 'agent-card--lead' : ''} ${stagger}">
        <div class="agent-card-header">
          <span class="status-dot status-dot--${agent.status} ${agent.status === 'working' ? 'ap-status-dot--working' : ''}"></span>
          <span class="agent-id">${escapeHtml(agent.id)}</span>
        </div>
        <div class="agent-card-badges">
          <span class="badge ${toolClass}">${escapeHtml(agent.tool)}</span>
          <span class="badge ${roleClass}">${escapeHtml(agent.role)}</span>
          <span class="badge badge--status badge--${agent.status}">${escapeHtml(agent.status)}</span>
        </div>
        <div class="agent-card-meta">
          <span>${agent.current_task ? `Task: ${escapeHtml(agent.current_task)}` : 'No active task'}</span>
          <span>Heartbeat: ${relativeTime(agent.last_heartbeat)}</span>
        </div>
        ${agent.capabilities && agent.capabilities.length > 0 ? `
          <div class="agent-capabilities">
            ${agent.capabilities.map(c => `<span class="badge badge--capability">${escapeHtml(c)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

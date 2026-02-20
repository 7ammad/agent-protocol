import { escapeHtml, relativeTime, TOOL_BADGE_CLASS } from '../utils/time.js';
import { announceAgent, removeAgent } from '../utils/api.js';
import { open as openModal } from './modal.js';

const ROLE_BADGE_CLASS = {
  'lead': 'badge--lead',
  'specialist': 'badge--specialist',
  'worker': 'badge--worker',
};

export function renderAgentCards(agents, lead) {
  const container = document.getElementById('agent-cards-content');
  if (!container) return;

  if (!agents || agents.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--lg-text-muted)" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
        </div>
        <p class="empty-state-title">No agents connected</p>
        <p class="empty-state-desc">Start an adapter or register one manually using the button above.</p>
      </div>
    `;
    return;
  }

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
          <button class="btn btn-sm btn-danger agent-remove-btn" data-remove="${agent.id}" title="Remove agent">&times;</button>
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

  // Bind remove buttons
  container.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.remove;
      if (confirm(`Remove agent "${id}"?`)) {
        await removeAgent(id);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    });
  });

  // Bind register button (in page header)
  const registerBtn = document.getElementById('btn-register-agent');
  if (registerBtn && !registerBtn.dataset.bound) {
    registerBtn.dataset.bound = 'true';
    registerBtn.addEventListener('click', showRegisterModal);
  }
}

function showRegisterModal() {
  openModal('Register Agent', `
    <form class="modal-form">
      <label>Agent ID<input name="id" required placeholder="claude-code-1"></label>
      <label>Tool
        <select name="tool" required>
          <option value="claude-code">Claude Code</option>
          <option value="cursor">Cursor</option>
          <option value="codex">Codex</option>
          <option value="copilot">Copilot</option>
          <option value="openclaw">OpenClaw</option>
        </select>
      </label>
      <label>Role
        <select name="role" required>
          <option value="worker">Worker</option>
          <option value="specialist">Specialist</option>
          <option value="lead">Lead</option>
        </select>
      </label>
      <label>Capabilities (comma-separated)<input name="capabilities" placeholder="typescript, testing, frontend"></label>
      <button type="submit" class="btn btn-primary">Register</button>
    </form>
  `, async (data) => {
    await announceAgent({
      id: data.id,
      tool: data.tool,
      role: data.role,
      capabilities: data.capabilities ? data.capabilities.split(',').map(s => s.trim()).filter(Boolean) : [],
    });
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

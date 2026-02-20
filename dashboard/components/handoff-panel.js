import { escapeHtml, relativeTime, getBadgeClass } from '../utils/time.js';
import { acceptHandoff, rejectHandoff, createHandoff } from '../utils/api.js';
import { open as openModal } from './modal.js';

export function renderHandoffPanel(handoffs, agents) {
  const container = document.getElementById('handoff-content');
  if (!container) return;

  if (!handoffs || handoffs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--lg-text-muted)" stroke-width="1.5"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 004 4h12"/></svg>
        </div>
        <p class="empty-state-title">No handoffs</p>
        <p class="empty-state-desc">Create a handoff when transferring work between agents.</p>
      </div>
    `;
    return;
  }

  // Group by status: pending first, then accepted, then rejected
  const sorted = [...handoffs].sort((a, b) => {
    const order = { pending: 0, accepted: 1, rejected: 2 };
    return (order[a.status] ?? 1) - (order[b.status] ?? 1);
  });

  container.innerHTML = sorted.map(h => {
    const statusClass = h.status === 'pending' ? 'handoff--pending' : h.status === 'accepted' ? 'handoff--accepted' : 'handoff--rejected';

    return `
      <div class="handoff-card lg-glass-interactive ${statusClass}">
        <div class="handoff-card-header">
          <span class="badge ${getBadgeClass(h.from_agent)}">${escapeHtml(h.from_agent)}</span>
          <span class="handoff-arrow">→</span>
          <span class="badge ${getBadgeClass(h.to_agent)}">${escapeHtml(h.to_agent || 'anyone')}</span>
          <span class="handoff-status badge badge--${h.status}">${escapeHtml(h.status)}</span>
        </div>
        <div class="handoff-summary">${escapeHtml(h.summary)}</div>
        ${h.context ? `<div class="handoff-context">${escapeHtml(h.context)}</div>` : ''}
        ${h.files_modified?.length > 0 ? `
          <div class="handoff-files">
            <span class="handoff-files-label">Modified:</span>
            ${h.files_modified.map(f => `<code class="handoff-file">${escapeHtml(f)}</code>`).join(' ')}
          </div>
        ` : ''}
        ${h.files_created?.length > 0 ? `
          <div class="handoff-files">
            <span class="handoff-files-label">Created:</span>
            ${h.files_created.map(f => `<code class="handoff-file">${escapeHtml(f)}</code>`).join(' ')}
          </div>
        ` : ''}
        ${h.blockers?.length > 0 ? `
          <div class="handoff-blockers">
            <span class="handoff-files-label">Blockers:</span>
            ${h.blockers.map(b => `<span class="badge badge--blocked">${escapeHtml(b)}</span>`).join(' ')}
          </div>
        ` : ''}
        <div class="handoff-meta">
          <span>${relativeTime(h.created_at)}</span>
          ${h.status === 'pending' ? `
            <div class="handoff-actions">
              <button class="btn btn-sm btn-success" data-accept="${h.id}">Accept</button>
              <button class="btn btn-sm btn-danger" data-reject="${h.id}">Reject</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Bind accept/reject buttons
  container.querySelectorAll('[data-accept]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await acceptHandoff(btn.dataset.accept);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });

  container.querySelectorAll('[data-reject]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await rejectHandoff(btn.dataset.reject);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });

  // Bind create handoff button
  const createBtn = document.getElementById('btn-create-handoff');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      const agentOptions = (agents || []).map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.id)}</option>`).join('');
      openModal('Create Handoff', `
        <form class="modal-form">
          <label>From Agent<select name="from_agent" required>${agentOptions}</select></label>
          <label>To Agent (optional)<select name="to_agent"><option value="">Anyone</option>${agentOptions}</select></label>
          <label>Task ID<input name="task_id" required placeholder="task-001"></label>
          <label>Summary<textarea name="summary" required placeholder="What was done and what's next..."></textarea></label>
          <label>Context<textarea name="context" placeholder="Additional context for the receiving agent..."></textarea></label>
          <label>Files Modified (comma-separated)<input name="files_modified" placeholder="src/index.ts, src/api.ts"></label>
          <label>Files Created (comma-separated)<input name="files_created" placeholder="src/new-file.ts"></label>
          <label>Blockers (comma-separated)<input name="blockers" placeholder="Failing test, missing dependency"></label>
          <button type="submit" class="btn btn-primary">Create Handoff</button>
        </form>
      `, async (data) => {
        await createHandoff({
          from_agent: data.from_agent,
          to_agent: data.to_agent || null,
          task_id: data.task_id,
          summary: data.summary,
          context: data.context || '',
          files_modified: data.files_modified ? data.files_modified.split(',').map(s => s.trim()).filter(Boolean) : [],
          files_created: data.files_created ? data.files_created.split(',').map(s => s.trim()).filter(Boolean) : [],
          blockers: data.blockers ? data.blockers.split(',').map(s => s.trim()).filter(Boolean) : [],
        });
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
    });
  }
}

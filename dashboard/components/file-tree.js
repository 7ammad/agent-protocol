import { escapeHtml, getBadgeClass } from '../utils/time.js';
import { claimResource, releaseResource, resolveConflict } from '../utils/api.js';
import { open as openModal } from './modal.js';

export function renderFileTree(resources, agents) {
  const container = document.getElementById('file-tree-content');
  if (!container) return;

  if (!resources || resources.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--lg-text-muted)" stroke-width="1.5"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
        </div>
        <p class="empty-state-title">No files being tracked</p>
        <p class="empty-state-desc">Files appear when agents claim them for editing.</p>
      </div>
    `;
    return;
  }

  const sorted = [...resources].sort((a, b) => {
    const order = { conflicted: 0, claimed: 1, locked: 1, free: 2 };
    return (order[a.state] ?? 2) - (order[b.state] ?? 2);
  });

  const hasConflicts = sorted.some(r => r.state === 'conflicted');

  let html = '';

  if (hasConflicts) {
    html += '<div class="conflict-alert ap-conflict-alert">CONFLICT DETECTED — resolve below</div>';
  }

  html += sorted.map(resource => {
    const stateClass = `file-row--${resource.state === 'locked' ? 'claimed' : resource.state}`;
    const ownerBadge = resource.owner ? `<span class="badge ${getBadgeClass(resource.owner)}">${escapeHtml(resource.owner)}</span>` : '';

    let actionBtn = '';
    if (resource.state === 'conflicted') {
      actionBtn = `<button class="btn btn-sm btn-danger" data-resolve="${resource.path}">Resolve</button>`;
    } else if (resource.state === 'claimed' || resource.state === 'locked') {
      actionBtn = `<button class="btn btn-sm btn-ghost" data-release="${resource.path}" data-owner="${resource.owner}">Release</button>`;
    }

    return `
      <div class="file-row ${stateClass}">
        <span class="file-path">${escapeHtml(resource.path)}</span>
        ${resource.state === 'conflicted' ? '<span class="conflict-badge">CONFLICT</span>' : ''}
        ${ownerBadge}
        ${actionBtn}
      </div>
    `;
  }).join('');

  container.innerHTML = html;

  // Bind release buttons
  container.querySelectorAll('[data-release]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await releaseResource(btn.dataset.release, btn.dataset.owner);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });

  // Bind resolve buttons
  container.querySelectorAll('[data-resolve]').forEach(btn => {
    btn.addEventListener('click', () => {
      const path = btn.dataset.resolve;
      const agentOptions = (agents || []).map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.id)}</option>`).join('');
      openModal(`Resolve Conflict: ${path}`, `
        <form class="modal-form">
          <p class="modal-desc">Pick the agent whose version should win:</p>
          <label>Agent<select name="picked_agent" required>${agentOptions}</select></label>
          <button type="submit" class="btn btn-primary">Resolve</button>
        </form>
      `, async (data) => {
        await resolveConflict(path, data.picked_agent);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
    });
  });

  // Bind claim button (in page header)
  const claimBtn = document.getElementById('btn-claim-file');
  if (claimBtn && !claimBtn.dataset.bound) {
    claimBtn.dataset.bound = 'true';
    claimBtn.addEventListener('click', () => {
      const agentOptions = (agents || []).map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.id)}</option>`).join('');
      openModal('Claim File', `
        <form class="modal-form">
          <label>File Path<input name="path" required placeholder="src/index.ts"></label>
          <label>Agent<select name="agent_id" required>${agentOptions}</select></label>
          <button type="submit" class="btn btn-primary">Claim</button>
        </form>
      `, async (data) => {
        const result = await claimResource(data.path, data.agent_id);
        if (!result.granted) {
          alert(`Claim denied: ${result.reason || 'File is owned by ' + result.owner}`);
          return false;
        }
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
    });
  }
}

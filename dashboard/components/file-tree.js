const TOOL_BADGE_CLASS = {
  'claude-code': 'badge--claude-code',
  'cursor': 'badge--cursor',
  'codex': 'badge--codex',
  'copilot': 'badge--copilot',
  'openclaw': 'badge--openclaw',
};

export function renderFileTree(resources) {
  const container = document.getElementById('file-tree-content');

  if (!resources || resources.length === 0) {
    container.innerHTML = '<p class="section-empty">No files tracked yet</p>';
    return;
  }

  // Group: conflicted first, then claimed, then free
  const sorted = [...resources].sort((a, b) => {
    const order = { conflicted: 0, claimed: 1, locked: 1, free: 2 };
    return (order[a.state] ?? 2) - (order[b.state] ?? 2);
  });

  const hasConflicts = sorted.some(r => r.state === 'conflicted');

  let html = '';

  if (hasConflicts) {
    html += '<div class="conflict-alert ap-conflict-alert">CONFLICT DETECTED — files require resolution</div>';
  }

  html += sorted.map(resource => {
    const stateClass = `file-row--${resource.state === 'locked' ? 'claimed' : resource.state}`;

    return `
      <div class="file-row ${stateClass}">
        <span class="file-path">${escapeHtml(resource.path)}</span>
        ${resource.state === 'conflicted' ? '<span class="conflict-badge">CONFLICT</span>' : ''}
        ${resource.owner ? `<span class="badge ${getBadgeClass(resource.owner)}">${escapeHtml(resource.owner)}</span>` : ''}
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

function getBadgeClass(owner) {
  // Try to detect tool from owner ID pattern
  if (owner.startsWith('claude')) return TOOL_BADGE_CLASS['claude-code'];
  if (owner.startsWith('cursor')) return TOOL_BADGE_CLASS['cursor'];
  if (owner.startsWith('codex')) return TOOL_BADGE_CLASS['codex'];
  if (owner.startsWith('copilot')) return TOOL_BADGE_CLASS['copilot'];
  if (owner.startsWith('openclaw')) return TOOL_BADGE_CLASS['openclaw'];
  return 'badge--tool-other';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

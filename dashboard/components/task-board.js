const COLUMNS = [
  { status: 'queued', label: 'Queued', color: 'var(--lg-gray-8)' },
  { status: 'assigned', label: 'Assigned', color: 'var(--lg-primary-9)' },
  { status: 'in_progress', label: 'In Progress', color: 'var(--ap-gold)' },
  { status: 'review', label: 'Review', color: 'var(--lg-accent-9)' },
  { status: 'done', label: 'Done', color: 'var(--lg-success-9)' },
  { status: 'blocked', label: 'Blocked', color: 'var(--lg-danger-9)' },
];

function relativeTime(timestamp) {
  if (!timestamp) return '';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function renderTaskBoard(tasks) {
  const container = document.getElementById('task-board-content');

  if (!tasks || tasks.length === 0) {
    container.innerHTML = '<p class="section-empty">No tasks yet</p>';
    return;
  }

  // Group tasks by status
  const grouped = {};
  for (const task of tasks) {
    if (!grouped[task.status]) grouped[task.status] = [];
    grouped[task.status].push(task);
  }

  // Only render columns that have tasks
  const html = COLUMNS
    .filter(col => grouped[col.status] && grouped[col.status].length > 0)
    .map(col => {
      const colTasks = grouped[col.status];
      return `
        <div class="task-column lg-glass-thin">
          <div class="task-column-header">
            <span class="task-column-dot" style="background: ${col.color}"></span>
            ${col.label} (${colTasks.length})
          </div>
          ${colTasks.map(task => renderTaskCard(task)).join('')}
        </div>
      `;
    }).join('');

  container.innerHTML = html;
}

function renderTaskCard(task) {
  const assignee = task.assigned_to
    ? `<span class="badge badge--tool-other">${escapeHtml(task.assigned_to)}</span>`
    : '<span style="color: var(--lg-text-muted); font-size: var(--lg-text-xs);">Unassigned</span>';

  const fileCount = task.resources ? task.resources.length : 0;

  return `
    <div class="task-card lg-glass-interactive">
      <div class="task-card-title">${escapeHtml(task.title)}</div>
      <div class="task-card-meta">
        <span>${assignee}</span>
        ${fileCount > 0 ? `<span>${fileCount} file${fileCount !== 1 ? 's' : ''}</span>` : ''}
        <span>${relativeTime(task.created_at)}</span>
      </div>
    </div>
  `;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

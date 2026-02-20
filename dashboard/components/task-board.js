import { escapeHtml, relativeTime } from '../utils/time.js';
import { createTask, updateTask } from '../utils/api.js';
import { open as openModal } from './modal.js';

const COLUMNS = [
  { status: 'queued', label: 'Queued', color: 'var(--lg-gray-8)' },
  { status: 'assigned', label: 'Assigned', color: 'var(--lg-primary-9)' },
  { status: 'in_progress', label: 'In Progress', color: 'var(--ap-gold)' },
  { status: 'review', label: 'Review', color: 'var(--lg-accent-9)' },
  { status: 'done', label: 'Done', color: 'var(--lg-success-9)' },
  { status: 'blocked', label: 'Blocked', color: 'var(--lg-danger-9)' },
];

const STATUS_OPTIONS = COLUMNS.map(c => c.status);

export function renderTaskBoard(tasks, agents) {
  const container = document.getElementById('task-board-content');
  if (!container) return;

  if (!tasks || tasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--lg-text-muted)" stroke-width="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        </div>
        <p class="empty-state-title">No tasks yet</p>
        <p class="empty-state-desc">Create a task to coordinate work between agents.</p>
      </div>
    `;
    return;
  }

  const grouped = {};
  for (const task of tasks) {
    if (!grouped[task.status]) grouped[task.status] = [];
    grouped[task.status].push(task);
  }

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

  // Bind status change selects
  container.querySelectorAll('[data-task-status]').forEach(select => {
    select.addEventListener('change', async () => {
      await updateTask(select.dataset.taskStatus, { status: select.value });
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });

  // Bind create task button
  const createBtn = document.getElementById('btn-create-task');
  if (createBtn && !createBtn.dataset.bound) {
    createBtn.dataset.bound = 'true';
    createBtn.addEventListener('click', () => {
      const agentOptions = (agents || []).map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.id)}</option>`).join('');
      openModal('Create Task', `
        <form class="modal-form">
          <label>Title<input name="title" required placeholder="Implement feature X"></label>
          <label>Description<textarea name="description" placeholder="Details about the task..."></textarea></label>
          <label>Assign To<select name="assigned_to"><option value="">Unassigned</option>${agentOptions}</select></label>
          <label>Assigned By<select name="assigned_by" required>${agentOptions}<option value="dashboard">Dashboard</option></select></label>
          <label>Files (comma-separated)<input name="resources" placeholder="src/index.ts, src/api.ts"></label>
          <button type="submit" class="btn btn-primary">Create Task</button>
        </form>
      `, async (data) => {
        await createTask({
          title: data.title,
          description: data.description || '',
          assigned_to: data.assigned_to || null,
          assigned_by: data.assigned_by,
          resources: data.resources ? data.resources.split(',').map(s => s.trim()).filter(Boolean) : [],
        });
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
    });
  }
}

function renderTaskCard(task) {
  const assignee = task.assigned_to
    ? `<span class="badge badge--tool-other">${escapeHtml(task.assigned_to)}</span>`
    : '<span style="color: var(--lg-text-muted); font-size: var(--lg-text-xs);">Unassigned</span>';

  const fileCount = task.resources ? task.resources.length : 0;

  const statusOptions = STATUS_OPTIONS.map(s =>
    `<option value="${s}" ${s === task.status ? 'selected' : ''}>${s.replace('_', ' ')}</option>`
  ).join('');

  return `
    <div class="task-card lg-glass-interactive">
      <div class="task-card-title">${escapeHtml(task.title)}</div>
      ${task.description ? `<div class="task-card-desc">${escapeHtml(task.description)}</div>` : ''}
      <div class="task-card-meta">
        <span>${assignee}</span>
        ${fileCount > 0 ? `<span>${fileCount} file${fileCount !== 1 ? 's' : ''}</span>` : ''}
        <span>${relativeTime(task.created_at)}</span>
      </div>
      <div class="task-card-actions">
        <select class="task-status-select" data-task-status="${task.id}">${statusOptions}</select>
      </div>
    </div>
  `;
}

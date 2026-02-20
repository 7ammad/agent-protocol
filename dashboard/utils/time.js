export function relativeTime(timestamp) {
  if (!timestamp) return '';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatTime(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

export const TOOL_BADGE_CLASS = {
  'claude-code': 'badge--claude-code',
  'cursor': 'badge--cursor',
  'codex': 'badge--codex',
  'copilot': 'badge--copilot',
  'openclaw': 'badge--openclaw',
};

export function getBadgeClass(owner) {
  if (!owner) return 'badge--tool-other';
  if (owner.startsWith('claude')) return TOOL_BADGE_CLASS['claude-code'];
  if (owner.startsWith('cursor')) return TOOL_BADGE_CLASS['cursor'];
  if (owner.startsWith('codex')) return TOOL_BADGE_CLASS['codex'];
  if (owner.startsWith('copilot')) return TOOL_BADGE_CLASS['copilot'];
  if (owner.startsWith('openclaw')) return TOOL_BADGE_CLASS['openclaw'];
  return 'badge--tool-other';
}

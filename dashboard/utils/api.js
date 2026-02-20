const BASE = '';

export async function fetchState() {
  const res = await fetch(`${BASE}/state`);
  return res.json();
}

export async function fetchStatus() {
  const res = await fetch(`${BASE}/status`);
  return res.json();
}

export async function fetchEvents(limit = 50) {
  const res = await fetch(`${BASE}/events?limit=${limit}`);
  return res.json();
}

// ── Action API calls ──

export async function announceAgent(agent) {
  const res = await fetch(`${BASE}/agents/announce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(agent),
  });
  return res.json();
}

export async function removeAgent(id) {
  const res = await fetch(`${BASE}/agents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return res.ok;
}

export async function claimResource(path, agentId) {
  const res = await fetch(`${BASE}/resources/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, agent_id: agentId }),
  });
  return res.json();
}

export async function releaseResource(path, agentId) {
  const res = await fetch(`${BASE}/resources/release`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, agent_id: agentId }),
  });
  return res.json();
}

export async function resolveConflict(path, pickedAgent) {
  const res = await fetch(`${BASE}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id: 'dashboard',
      action: 'resource.conflict_resolved',
      resource: path,
      metadata: { resolution: 'pick', picked_agent: pickedAgent },
    }),
  });
  return res.ok;
}

export async function createTask(task) {
  const res = await fetch(`${BASE}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(task),
  });
  return res.json();
}

export async function updateTask(id, updates) {
  const res = await fetch(`${BASE}/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return res.json();
}

export async function createHandoff(handoff) {
  const res = await fetch(`${BASE}/handoffs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(handoff),
  });
  return res.json();
}

export async function acceptHandoff(id) {
  const res = await fetch(`${BASE}/handoffs/${encodeURIComponent(id)}/accept`, {
    method: 'PATCH',
  });
  return res.json();
}

export async function rejectHandoff(id) {
  const res = await fetch(`${BASE}/handoffs/${encodeURIComponent(id)}/reject`, {
    method: 'PATCH',
  });
  return res.json();
}

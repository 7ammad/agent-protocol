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

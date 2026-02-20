let evtSource = null;
let pollInterval = null;

export function connectSSE(onEvent) {
  evtSource = new EventSource('/events/stream');

  evtSource.onmessage = (e) => {
    const event = JSON.parse(e.data);
    onEvent(event);
  };

  evtSource.onerror = () => {
    evtSource.close();
    startPolling(onEvent);
  };
}

function startPolling(onEvent) {
  if (pollInterval) return;
  pollInterval = setInterval(() => {
    try {
      const source = new EventSource('/events/stream');
      source.onmessage = (e) => {
        clearInterval(pollInterval);
        pollInterval = null;
        evtSource = source; // Keep reference for disconnectSSE
        const event = JSON.parse(e.data);
        onEvent(event);
      };
      source.onerror = () => {
        source.close();
      };
    } catch {
      // Still down — keep polling
    }
  }, 5000);
}

export function disconnectSSE() {
  if (evtSource) evtSource.close();
  if (pollInterval) clearInterval(pollInterval);
}

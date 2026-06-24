/**
 * streamTicket.js — SSE auth without a JWT in the URL (B93).
 *
 * EventSource can't set an Authorization header, so instead of putting the JWT
 * in the query string (logged / in history / in proxy logs) we mint a short-lived
 * (30s), single-use ticket via POST /chat/stream-ticket (header-authed) and open
 * the stream with ?ticket=…. The middleware redeems + deletes it.
 *
 * Because the ticket is single-use, native EventSource auto-reconnect (which
 * reuses the dead URL) can't be relied on — openTicketedStream owns reconnection,
 * minting a FRESH ticket on every (re)connect with capped backoff.
 */
const TICKET_URL = "/api/v1/community/chat/stream-ticket";

export async function mintStreamTicket() {
  const t = localStorage.getItem("tfos_access_token");
  if (!t) return null;
  try {
    const r = await fetch(TICKET_URL, { method: "POST", headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) return null;
    return (await r.json())?.ticket || null;
  } catch {
    return null;
  }
}

/**
 * Open a ticketed SSE stream with automatic fresh-ticket reconnection.
 * @param {string} path  stream path (e.g. "/api/v1/tis/stream")
 * @param {{listeners?: Record<string,(e:MessageEvent)=>void>, onOpen?:()=>void, onError?:()=>void}} opts
 * @returns {{close: () => void}}
 */
export function openTicketedStream(path, { listeners = {}, onOpen, onError } = {}) {
  let es = null;
  let closed = false;
  let retry = 0;
  let timer = null;

  const schedule = () => {
    if (closed || timer) return;
    const delay = Math.min(30000, 1000 * 2 ** retry);
    retry += 1;
    timer = setTimeout(() => { timer = null; connect(); }, delay);
  };

  async function connect() {
    if (closed) return;
    const ticket = await mintStreamTicket();
    if (closed) return;
    if (!ticket) { schedule(); return; }
    const sep = path.includes("?") ? "&" : "?";
    try {
      es = new EventSource(`${path}${sep}ticket=${encodeURIComponent(ticket)}`);
    } catch {
      schedule();
      return;
    }
    es.onopen = () => { retry = 0; onOpen && onOpen(); };
    es.onerror = () => {
      onError && onError();
      try { es && es.close(); } catch { /* ignore */ }
      es = null;
      schedule(); // reconnect with a fresh ticket — the old one is single-use
    };
    for (const [evt, fn] of Object.entries(listeners)) es.addEventListener(evt, fn);
  }

  connect();

  return {
    close() {
      closed = true;
      if (timer) { clearTimeout(timer); timer = null; }
      try { es && es.close(); } catch { /* ignore */ }
    },
  };
}

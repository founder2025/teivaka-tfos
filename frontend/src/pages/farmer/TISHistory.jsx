/**
 * TISHistory.jsx — past TIS conversations (real data).
 *
 * Reads GET /api/v1/tis/conversations (RLS-scoped to the signed-in user). Honest
 * empty state when there are none. Replaces the old ComingSoon stub at /tis/history.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, MessageSquare, ArrowRight } from "lucide-react";

const C = {
  cream: "var(--cream)", paper: "var(--paper)", soil: "var(--soil)", soilDk: "#2D2016",
  green: "var(--green)", greenDk: "var(--green-dk)", line: "var(--line)", muted: "var(--muted)",
};

function tok() { try { return localStorage.getItem("tfos_access_token") || ""; } catch { return ""; } }

function when(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(+d)) return "";
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

export default function TISHistory() {
  const navigate = useNavigate();
  const [state, setState] = useState("loading"); // loading | ready | error
  const [items, setItems] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/v1/tis/conversations", { headers: { Authorization: `Bearer ${tok()}` } });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (!alive) return;
        setItems(body?.data || []);
        setState("ready");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.soilDk, margin: 0 }}>TIS History</h1>
        <p style={{ fontSize: 13, color: C.soil, margin: "4px 0 0" }}>Your past conversations with TIS.</p>
      </div>

      {state === "loading" && <p style={{ color: C.muted, fontSize: 14 }}>Loading…</p>}
      {state === "error" && <p style={{ color: C.muted, fontSize: 14 }}>Couldn't load your history right now. Please try again in a moment.</p>}

      {state === "ready" && items.length === 0 && (
        <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: "32px 24px", textAlign: "center" }}>
          <MessageSquare size={28} color={C.green} style={{ margin: "0 auto 10px" }} />
          <p style={{ color: C.soilDk, fontWeight: 600, fontSize: 15 }}>No conversations yet</p>
          <p style={{ color: C.muted, fontSize: 13, margin: "4px 0 16px" }}>Ask TIS a question and it'll show up here.</p>
          <button type="button" onClick={() => navigate("/tis")}
            style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Start a chat →
          </button>
        </div>
      )}

      {state === "ready" && items.length > 0 && (
        <div className="flex flex-col" style={{ gap: 10 }}>
          {items.map((c, i) => (
            <button key={c.conversation_id || c.id || i} type="button" onClick={() => navigate("/tis")}
              className="flex items-center justify-between"
              style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", textAlign: "left", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: C.soilDk, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.title || c.summary || c.first_message || "Conversation"}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
                  <Clock size={12} /> {when(c.last_message_at || c.updated_at || c.created_at)}
                  {c.message_count ? ` · ${c.message_count} messages` : ""}
                </div>
              </div>
              <ArrowRight size={16} color={C.muted} style={{ flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

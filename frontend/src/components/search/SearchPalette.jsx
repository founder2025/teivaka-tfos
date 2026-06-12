/**
 * SearchPalette.jsx — global search + command palette (Cmd/Ctrl+K or the top-bar
 * search icon). Searches platform navigation (pages/pillars), People, and Businesses
 * (professional accounts), all in one grouped dropdown. People come from
 * /api/v1/community/people (global, open discovery); navigation is client-side from
 * the route map. Keyboard nav, debounce, recent searches, mobile-friendly.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, CornerDownLeft, MessageCircle, UserPlus, UserCheck, BadgeCheck, ArrowRight } from "lucide-react";
import { PILLAR_SUB_NAV } from "../nav/pillarSubNavMap";
import { useChat } from "../../context/ChatContext";
import Avatar from "../ui/Avatar";

const API = "/api/v1/community";
const tok = () => localStorage.getItem("tfos_access_token");
async function getJSON(u) { const t = tok(); const r = await fetch(u, { headers: t ? { Authorization: `Bearer ${t}` } : {} }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
async function send(method, u) { const t = tok(); const r = await fetch(u, { method, headers: t ? { Authorization: `Bearer ${t}` } : {} }); if (!r.ok) throw new Error(String(r.status)); return r.json().catch(() => ({})); }

const C = { soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", line: "#E8E2D4", cream: "#F8F3E9", muted: "#8A7B6F" };
const initials = (n) => (n || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
import { personaLabel, personaGroup } from "../../utils/personas";
const LS_RECENT = "tfos_search_recent";

// flatten the route map → navigation commands
const PILLAR_LABEL = { "/home": "Home", "/classroom": "Classroom", "/farm": "Farm", "/tis": "TIS", "/me": "Me" };
const NAV = (() => {
  const out = [];
  for (const [root, cfg] of Object.entries(PILLAR_SUB_NAV || {})) {
    out.push({ path: root, label: cfg.label || PILLAR_LABEL[root] || root, group: cfg.label || PILLAR_LABEL[root] });
    for (const it of (cfg.items || [])) {
      if (it.phase) continue; // skip coming-soon stubs
      out.push({ path: it.path, label: it.label, group: cfg.label || PILLAR_LABEL[root] });
    }
  }
  return out;
})();

export default function SearchPalette({ onClose }) {
  const navigate = useNavigate();
  const chat = useChat();
  const [q, setQ] = useState("");
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(() => { try { return JSON.parse(localStorage.getItem(LS_RECENT) || "[]"); } catch { return []; } });
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // debounced people search
  useEffect(() => {
    const term = q.trim();
    if (!term) { setPeople([]); return undefined; }
    setLoading(true);
    const id = setTimeout(() => {
      getJSON(`${API}/people?search=${encodeURIComponent(term)}`)
        .then((r) => setPeople(r.data || [])).catch(() => setPeople([])).finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  const navMatches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return NAV.filter((n) => n.label.toLowerCase().includes(term) || n.group.toLowerCase().includes(term)).slice(0, 7);
  }, [q]);
  const farmers = people.filter((p) => personaGroup(p.profession) === "PRODUCER");
  const businesses = people.filter((p) => personaGroup(p.profession) !== "PRODUCER");

  // flat selectable list for keyboard nav
  const flat = useMemo(() => {
    const arr = [];
    navMatches.forEach((n) => arr.push({ kind: "nav", item: n }));
    farmers.forEach((p) => arr.push({ kind: "person", item: p }));
    businesses.forEach((p) => arr.push({ kind: "person", item: p }));
    return arr;
  }, [navMatches, people]); // eslint-disable-line
  useEffect(() => { setActive(0); }, [q, people]);

  const rememberNav = (n) => {
    const next = [n, ...recent.filter((r) => r.path !== n.path)].slice(0, 6);
    setRecent(next); try { localStorage.setItem(LS_RECENT, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const goNav = (n) => { rememberNav({ path: n.path, label: n.label, group: n.group }); onClose(); navigate(n.path); };
  const onPerson = (p) => { onClose(); navigate(`/u/${p.user_id}`); };
  const choose = (entry) => { if (!entry) return; entry.kind === "nav" ? goNav(entry.item) : onPerson(entry.item); };

  const onKey = (e) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, Math.max(flat.length - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(flat[active]); }
  };
  useEffect(() => { listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  let idx = -1;
  const Row = ({ entry, children }) => { idx += 1; const i = idx; const on = i === active;
    return <button data-i={i} onMouseEnter={() => setActive(i)} onClick={() => choose(entry)}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", minHeight: 44, border: "none", background: on ? "rgba(106,168,79,0.10)" : "#fff", cursor: "pointer", textAlign: "left" }}>{children}</button>; };
  const GroupHead = ({ children }) => <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: C.muted, padding: "10px 14px 4px" }}>{children}</div>;

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(40,30,20,0.35)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "8vh" }}>
      <div style={{ width: "min(620px, calc(100vw - 24px))", maxHeight: "80vh", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.28)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${C.line}` }}>
          <Search size={18} style={{ color: C.muted }} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search people, businesses, or jump to a page…"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 15, color: C.soil, background: "transparent" }} />
          {loading && <span style={{ fontSize: 11, color: C.muted }}>…</span>}
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted }}><X size={18} /></button>
        </div>

        <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
          {!q.trim() ? (
            recent.length === 0
              ? <div style={{ padding: "26px 16px", color: C.muted, fontSize: 13, textAlign: "center" }}>Search farmers, buyers, exporters, bankers… or type a page like “Tasks”, “Cash”, “Marketplace”.</div>
              : <><GroupHead>Recent</GroupHead>{recent.map((r) => (
                  <button key={r.path} onClick={() => goNav(r)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", border: "none", background: "#fff", cursor: "pointer", textAlign: "left" }}>
                    <ArrowRight size={15} style={{ color: C.muted }} /><span style={{ fontSize: 13.5, color: C.soil }}>{r.label}</span><span style={{ fontSize: 10.5, color: C.muted, marginLeft: "auto" }}>{r.group}</span>
                  </button>))}</>
          ) : (flat.length === 0 && !loading) ? (
            <div style={{ padding: "26px 16px", color: C.muted, fontSize: 13, textAlign: "center" }}>No matches for “{q.trim()}”.</div>
          ) : (
            <>
              {navMatches.length > 0 && <GroupHead>Go to</GroupHead>}
              {navMatches.map((n) => (
                <Row key={`nav-${n.path}`} entry={{ kind: "nav", item: n }}>
                  <ArrowRight size={16} style={{ color: C.greenDk }} />
                  <span style={{ fontSize: 13.5, color: C.soil, fontWeight: 600 }}>{n.label}</span>
                  <span style={{ fontSize: 10.5, color: C.muted, marginLeft: "auto" }}>{n.group}</span>
                </Row>
              ))}
              {farmers.length > 0 && <GroupHead>People</GroupHead>}
              {farmers.map((p) => <PersonRow key={p.user_id} p={p} Row={Row} />)}
              {businesses.length > 0 && <GroupHead>Businesses</GroupHead>}
              {businesses.map((p) => <PersonRow key={p.user_id} p={p} Row={Row} />)}
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 14, padding: "8px 14px", borderTop: `1px solid ${C.line}`, fontSize: 10.5, color: C.muted }}>
          <span><CornerDownLeft size={11} style={{ verticalAlign: "middle" }} /> open</span>
          <span>↑ ↓ navigate</span><span>esc close</span>
        </div>
      </div>
    </div>
  );

  function PersonRow({ p, Row }) {
    return (
      <Row entry={{ kind: "person", item: p }}>
        <span style={{ position: "relative", flexShrink: 0 }}>
          <Avatar src={p.avatar_url} name={p.full_name} size={32} fontScale={0.38} />
          {p.online && <span style={{ position: "absolute", bottom: 0, right: 0, width: 10, height: 10, borderRadius: "50%", background: "#4caf50", border: "2px solid #fff" }} />}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontWeight: 600, fontSize: 13.5, color: C.soil, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.full_name}</span>
            {p.verified && <BadgeCheck size={13} style={{ color: C.green }} />}
          </span>
          <span style={{ fontSize: 11, color: C.muted }}>{personaLabel(p.profession)}{p.country ? ` · ${p.country}` : ""}</span>
        </span>
        <span style={{ fontSize: 11.5, color: C.greenDk, display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {p.is_connected ? <><MessageCircle size={13} />Message</> : p.is_following ? <><UserCheck size={13} />Following</> : <><UserPlus size={13} />Follow</>}
        </span>
      </Row>
    );
  }
}

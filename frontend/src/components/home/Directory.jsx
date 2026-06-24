/**
 * Directory.jsx — Teivaka's who's-who. Rich person cards (photo, green tick,
 * profession, bio, member-since, presence), profession filter + sort, actions
 * per card (Follow, Message when allowed, View listings -> marketplace bridge),
 * member counts, and an Invite-to-Teivaka card (referral link via WhatsApp).
 * Real data only; honest empty states.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, BadgeCheck, UserPlus, UserCheck, MessageCircle, Tag, Share2 } from "lucide-react";
import { getJSON, send } from "../../utils/api";
import { useChat } from "../../context/ChatContext";
import Avatar from "../ui/Avatar";

const API = "/api/v1/community";
const toast = (message, type) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message, type } })); } catch { /* noop */ } };
import { personaLabel } from "../../utils/personas";
const GROUP_TABS = [["all", "All"], ["PRODUCER", "Producers"], ["TRADE", "Trade"], ["CAPITAL", "Capital / Lenders"], ["GOVERNANCE", "Governance"], ["SERVICE", "Services"]];
const sinceYear = (iso) => { try { return new Date(iso).getFullYear(); } catch { return null; } };

function InviteCard() {
  const [link, setLink] = useState(null);
  useEffect(() => { getJSON("/api/v1/me/referral").then((r) => setLink(r?.share_links?.copy_text || r?.data?.share_links?.copy_text || null)).catch(() => {}); }, []);
  if (!link) return null;
  return (
    <div style={{ marginTop: 14, padding: "14px 16px", border: "1px dashed var(--green)", borderRadius: 12, background: "rgba(106,168,79,0.05)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 700, color: "var(--soil)", fontSize: 13.5 }}>Someone missing from this list?</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Invite your buyer, supplier or fellow farmer — the network is worth more with them on it.</div>
      </div>
      <a href={`https://wa.me/?text=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--green)", color: "#fff", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, textDecoration: "none", minHeight: 40 }}>
        <Share2 size={14} /> Invite via WhatsApp
      </a>
    </div>
  );
}

export default function Directory() {
  const navigate = useNavigate();
  const chat = useChat();
  const [q, setQ] = useState("");
  const [prof, setProf] = useState("all");
  const [sort, setSort] = useState("verified");
  const [people, setPeople] = useState(null);
  const [meta, setMeta] = useState(null);

  const load = (search) => {
    const p = new URLSearchParams({ sort });
    if (search) p.set("search", search);
    if (prof !== "all") p.set("group", prof);
    getJSON(`${API}/people?${p.toString()}`)
      .then((r) => { setPeople(r.data || []); setMeta(r.meta || null); })
      .catch((e) => { setPeople([]); toast(`Couldn't load the directory: ${e.userMessage || e.message}`, "error"); });
  };
  useEffect(() => { load(q); /* eslint-disable-next-line */ }, [prof, sort]);
  useEffect(() => { const id = setTimeout(() => load(q), 300); return () => clearTimeout(id); /* eslint-disable-next-line */ }, [q]);

  const toggleFollow = async (p) => {
    const next = !p.is_following;
    setPeople((list) => list.map((x) => x.user_id === p.user_id ? { ...x, is_following: next } : x));
    try {
      await send(next ? "POST" : "DELETE", `${API}/follow/${p.user_id}`);
      toast(next ? `Following ${p.full_name} ✓` : `Unfollowed ${p.full_name}`, "success");
    } catch (e) {
      setPeople((list) => list.map((x) => x.user_id === p.user_id ? { ...x, is_following: p.is_following } : x));
      toast(`Couldn't ${next ? "follow" : "unfollow"}: ${e.userMessage || e.message}`, "error");
    }
  };
  const message = (p) => {
    chat.openWith({ user_id: p.user_id, full_name: p.full_name, profession: p.profession });
    chat.setDropdownOpen?.(false);
  };

  return (
    <div className="card">
      {meta && (
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>
          <strong style={{ color: "var(--soil)" }}>{meta.members}</strong> member{meta.members === 1 ? "" : "s"} across Fiji
          {meta.verified > 0 && <> · <BadgeCheck size={12} style={{ color: "var(--green-dk)", verticalAlign: "-2px" }} /> {meta.verified} verified</>}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px" }}>
        <Search size={15} style={{ color: "var(--muted)" }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search farmers, buyers, suppliers, bankers…"
          style={{ border: "none", outline: "none", flex: 1, fontSize: 14, background: "transparent", color: "var(--soil)" }} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        {GROUP_TABS.map(([v, l]) => (
          <button key={v} onClick={() => setProf(v)} style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", minHeight: 34, border: `1px solid ${prof === v ? "var(--green-dk)" : "var(--line)"}`, background: prof === v ? "var(--green)" : "var(--paper)", color: prof === v ? "var(--paper)" : "var(--soil)" }}>{l}</button>
        ))}
        <button onClick={() => setSort(sort === "verified" ? "newest" : "verified")} style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 999, fontSize: 12, cursor: "pointer", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--muted)" }}>
          Sort: {sort === "verified" ? "Verified first" : "Newest"}
        </button>
      </div>

      {people == null ? <div style={{ color: "var(--muted)", padding: 14 }}>Loading…</div>
        : people.length === 0 ? <div style={{ color: "var(--muted)", padding: 14 }}>No people found{q ? ` for "${q}"` : prof !== "all" ? ` in ${(GROUP_TABS.find(([v]) => v === prof)?.[1] || prof)}` : " yet"}. As more users join, they appear here.</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {people.map((p) => (
              <div key={p.user_id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 12px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--paper)" }}>
                <button onClick={() => navigate(`/u/${p.user_id}`)} style={{ position: "relative", background: "transparent", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                  <Avatar src={p.avatar_url} name={p.full_name} size={46} />
                  {p.online && <span style={{ position: "absolute", bottom: 1, right: 1, width: 12, height: 12, borderRadius: "50%", background: "#4caf50", border: "2px solid #fff" }} />}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <button onClick={() => navigate(`/u/${p.user_id}`)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                    <span style={{ fontWeight: 700, color: "var(--soil)", fontSize: 14, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      {p.full_name}{p.verified && <BadgeCheck size={14} style={{ color: "var(--green-dk)" }} />}
                    </span>
                  </button>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", display: "flex", gap: 8, flexWrap: "wrap", marginTop: 1 }}>
                    <span className="pill grey" style={{ fontSize: 10.5 }}>{personaLabel(p.profession)}</span>
                    {p.country && <span>{p.country}</span>}
                    {p.member_since && <span>since {sinceYear(p.member_since)}</span>}
                    {p.online ? <span style={{ color: "var(--green)", fontWeight: 600 }}>online</span> : null}
                  </div>
                  {p.bio && <div style={{ fontSize: 12.5, color: "var(--soil)", marginTop: 4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.bio}</div>}
                  {(p.active_listings > 0 || p.wanted_count > 0) && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      {p.active_listings > 0 && (
                        <button onClick={() => navigate(`/home/marketplace?seller=${p.user_id}`)} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "var(--green-dk)", background: "rgba(106,168,79,0.1)", border: "1px solid var(--green)", borderRadius: 999, padding: "3px 10px", cursor: "pointer" }}>
                          <Tag size={11} /> {p.active_listings} listing{p.active_listings === 1 ? "" : "s"}
                        </button>
                      )}
                      {p.wanted_count > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--amber)", background: "rgba(191,144,0,0.1)", border: "1px solid rgba(191,144,0,0.4)", borderRadius: 999, padding: "3px 10px" }}>{p.wanted_count} wanted</span>}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                  <button className={`btn btn-sm ${p.is_following ? "btn-secondary" : "btn-primary"}`} onClick={() => toggleFollow(p)}>
                    {p.is_following ? <><UserCheck size={13} />Following</> : <><UserPlus size={13} />Follow</>}
                  </button>
                  {(p.is_following || p.is_connected || p.active_listings > 0) && (
                    <button className="btn btn-sm btn-secondary" onClick={() => message(p)}><MessageCircle size={13} />Message</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      <InviteCard />
    </div>
  );
}

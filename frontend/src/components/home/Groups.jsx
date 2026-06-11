/**
 * Groups.jsx — the Home pillar's connection engine. Public-read interest
 * groups (kava growers, poultry keepers, regions, exporters...): browse/search
 * grid, join/leave, create (verified members), and a group page whose feed IS
 * the real feed infrastructure (FeedView with a group filter — reactions,
 * replies, photos all work). Owner can edit/close; admin can feature.
 */
import { useEffect, useState } from "react";
import { Users, Plus, Search, X, Star, Lock as LockIcon, Settings as Cog } from "lucide-react";
import { getJSON, send } from "../../utils/api";
import FeedView from "./FeedView";

const API = "/api/v1/community";
const toast = (message, type) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message, type } })); } catch { /* noop */ } };

const CATEGORIES = [["CROPS", "Crops"], ["LIVESTOCK", "Livestock"], ["FISHING", "Fishing"], ["EXPORT", "Export"],
  ["WOMEN_IN_AG", "Women in Ag"], ["YOUTH", "Youth"], ["EQUIPMENT", "Equipment"], ["REGION", "Region"], ["GENERAL", "General"]];
const CAT_LABEL = Object.fromEntries(CATEGORIES);

const COVERS = [
  "linear-gradient(135deg,#6aa84f,#3d6b2e)", "linear-gradient(135deg,#bf9000,#7a5c00)",
  "linear-gradient(135deg,#2e7d6b,#174f42)", "linear-gradient(135deg,#7b5ea7,#4a3168)",
  "linear-gradient(135deg,#c0603a,#83402a)", "linear-gradient(135deg,#3a7ca5,#235a7c)",
];
function coverFor(name) {
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COVERS[h % COVERS.length];
}

function GroupForm({ group, onClose, onDone }) {
  const editing = Boolean(group);
  const [f, setF] = useState({ name: group?.name || "", description: group?.description || "", category: group?.category || "GENERAL" });
  const inp = { width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 11px", fontSize: 13.5, marginBottom: 10 };
  const submit = async () => {
    try {
      if (editing) {
        await send("PATCH", `${API}/groups/${group.group_id}`, f);
        toast("Group updated ✓", "success");
        onDone();
      } else {
        const r = await send("POST", `${API}/groups`, f);
        toast("Group created — you're the owner ✓", "success");
        onDone(r.data.group_id);
      }
    } catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };
  return (
    <div className="overlay-backdrop show" style={{ alignItems: "center", padding: 16 }} onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><span>{editing ? "Edit group" : "Start a group"}</span><button className="overlay-close" onClick={onClose}><X size={18} /></button></div>
        <div style={{ padding: 18 }}>
          <div className="cb-field-lbl">Group name *</div>
          <input autoFocus style={inp} value={f.name} placeholder="e.g. Kava Growers · Kadavu" onChange={(e) => setF({ ...f, name: e.target.value })} />
          <div className="cb-field-lbl">What's it about?</div>
          <textarea style={{ ...inp, minHeight: 70 }} value={f.description} placeholder="Who is this group for, and what do members share here?" onChange={(e) => setF({ ...f, description: e.target.value })} />
          <div className="cb-field-lbl">Category</div>
          <select style={inp} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
            {editing && (
              <button className="btn btn-sm btn-secondary" style={{ marginRight: "auto", color: group.status === "CLOSED" ? "var(--green-dk)" : "#b3402e" }}
                onClick={async () => {
                  try {
                    await send("PATCH", `${API}/groups/${group.group_id}`, { status: group.status === "CLOSED" ? "ACTIVE" : "CLOSED" });
                    toast(group.status === "CLOSED" ? "Group reopened ✓" : "Group closed — no new joins or posts", "success");
                    onDone();
                  } catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
                }}>
                {group.status === "CLOSED" ? "Reopen group" : "Close group"}
              </button>
            )}
            <button className="btn btn-sm btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={submit}>{editing ? "Save" : "Create group"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupPage({ groupId, onBack }) {
  const [g, setG] = useState(null);
  const [members, setMembers] = useState(null);
  const [showMembers, setShowMembers] = useState(false);
  const [editing, setEditing] = useState(false);
  const load = () => getJSON(`${API}/groups/${groupId}`).then((r) => setG(r.data))
    .catch((e) => { toast(`Couldn't open the group: ${e.userMessage || e.message}`, "error"); onBack(); });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [groupId]);
  useEffect(() => {
    if (showMembers) getJSON(`${API}/groups/${groupId}/members`).then((r) => setMembers(r.data || [])).catch(() => setMembers([]));
  }, [showMembers, groupId]);
  const toggleJoin = async () => {
    try {
      await send(g.is_member ? "DELETE" : "POST", `${API}/groups/${groupId}/join`);
      toast(g.is_member ? "You left the group" : `Welcome to ${g.name} ✓`, "success");
      load();
    } catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };
  if (!g) return <div className="card" style={{ color: "var(--muted)" }}>Loading…</div>;
  return (
    <div>
      <button className="cp-back" style={{ marginBottom: 10 }} onClick={onBack}>← All groups</button>
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ height: 90, background: g.cover_url ? `url(${g.cover_url}) center/cover` : coverFor(g.name), position: "relative" }}>
          {g.featured && <span style={{ position: "absolute", left: 12, top: 12, fontSize: 10.5, fontWeight: 800, background: "rgba(0,0,0,0.4)", color: "#ffd76a", borderRadius: 999, padding: "4px 10px" }}>★ FEATURED</span>}
          {g.status === "CLOSED" && <span style={{ position: "absolute", right: 12, top: 12, fontSize: 10.5, fontWeight: 800, background: "rgba(0,0,0,0.45)", color: "#fff", borderRadius: 999, padding: "4px 10px" }}><LockIcon size={9} /> CLOSED</span>}
        </div>
        <div style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 800, color: "var(--soil)", fontSize: 17 }}>{g.name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {CAT_LABEL[g.category] || g.category} · <button onClick={() => setShowMembers(!showMembers)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: "var(--green-dk)", fontWeight: 600, fontSize: 12 }}>{g.member_count} member{g.member_count === 1 ? "" : "s"}</button>
              {g.owner_name && <> · started by {g.owner_name}</>}
            </div>
            {g.description && <div style={{ fontSize: 13, color: "var(--soil)", marginTop: 4 }}>{g.description}</div>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {g.can_manage && <button className="btn btn-sm btn-secondary" onClick={() => setEditing(true)}><Cog size={13} />Edit</button>}
            {!g.is_owner && (
              <button className={`btn btn-sm ${g.is_member ? "btn-secondary" : "btn-primary"}`} onClick={toggleJoin}>
                {g.is_member ? "Joined ✓" : "Join group"}
              </button>
            )}
          </div>
        </div>
        {showMembers && (
          <div style={{ borderTop: "1px solid var(--line)", padding: "10px 16px" }}>
            {members == null ? <span style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</span>
              : members.map((m) => (
                <div key={m.user_id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 0", fontSize: 13, color: "var(--soil)" }}>
                  <strong>{m.full_name}</strong>
                  {m.verified && <span style={{ color: "var(--green-dk)", fontSize: 11 }}>✓</span>}
                  <span style={{ color: "var(--muted)", fontSize: 11.5 }}>{m.profession}{m.role === "OWNER" ? " · owner" : ""}</span>
                </div>
              ))}
          </div>
        )}
      </div>
      {editing && (
        <GroupForm group={g} onClose={() => setEditing(false)} onDone={() => { setEditing(false); load(); }} />
      )}
      {g.is_member || g.is_owner
        ? <FeedView initialFilter={`group_${groupId}`} groupId={groupId} />
        : (
          <div className="card" style={{ color: "var(--muted)", textAlign: "center", padding: 22 }}>
            <Users size={26} style={{ marginBottom: 6 }} />
            <div style={{ fontWeight: 700, color: "var(--soil)", marginBottom: 4 }}>Join to see the conversation</div>
            <div style={{ fontSize: 13 }}>Members share updates, questions and photos here. Joining is free and instant.</div>
          </div>
        )}
    </div>
  );
}

export default function Groups() {
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const [groups, setGroups] = useState(null);
  const [open, setOpen] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = (search) => {
    const p = new URLSearchParams();
    if (search?.trim()) p.set("search", search.trim());
    if (mine) p.set("mine", "true");
    getJSON(`${API}/groups?${p.toString()}`).then((r) => setGroups(r.data || []))
      .catch((e) => { setGroups([]); toast(`Couldn't load groups: ${e.userMessage || e.message}`, "error"); });
  };
  useEffect(() => { load(q); /* eslint-disable-next-line */ }, [mine]);
  useEffect(() => { const id = setTimeout(() => load(q), 300); return () => clearTimeout(id); /* eslint-disable-next-line */ }, [q]);

  const join = async (g, e) => {
    e.stopPropagation();
    try {
      await send(g.is_member ? "DELETE" : "POST", `${API}/groups/${g.group_id}/join`);
      toast(g.is_member ? "You left the group" : `Welcome to ${g.name} ✓`, "success");
      load(q);
    } catch (err) { toast(`${err.userMessage || err.message}`, "error"); }
  };

  if (open) return <GroupPage groupId={open} onBack={() => { setOpen(null); load(q); }} />;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 200, border: "1px solid var(--line)", borderRadius: 999, padding: "7px 14px", background: "#fff" }}>
          <Search size={14} style={{ color: "var(--muted)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search groups — crops, regions, export…"
            style={{ border: "none", outline: "none", flex: 1, fontSize: 13.5, background: "transparent", color: "var(--soil)" }} />
        </div>
        <button className={`btn btn-sm ${mine ? "btn-primary" : "btn-secondary"}`} onClick={() => setMine(!mine)}>My groups</button>
        <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}><Plus size={13} />Start a group</button>
      </div>
      {groups == null ? <div className="card" style={{ color: "var(--muted)" }}>Loading…</div>
        : groups.length === 0 ? (
          <div className="card" style={{ color: "var(--muted)", textAlign: "center", padding: 24 }}>
            <Users size={28} style={{ marginBottom: 6 }} />
            <div style={{ fontWeight: 700, color: "var(--soil)", marginBottom: 4 }}>{q || mine ? "No groups found" : "No groups yet"}</div>
            <div style={{ fontSize: 13 }}>{q || mine ? "Try a different search." : "Start the first one — your crop, your region, your people."}</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {groups.map((g) => (
              <div key={g.group_id} className="card" style={{ padding: 0, overflow: "hidden", cursor: "pointer" }} onClick={() => setOpen(g.group_id)}>
                <div style={{ height: 70, background: g.cover_url ? `url(${g.cover_url}) center/cover` : coverFor(g.name), position: "relative" }}>
                  {g.featured && <span style={{ position: "absolute", left: 10, top: 10, fontSize: 10, fontWeight: 800, background: "rgba(0,0,0,0.4)", color: "#ffd76a", borderRadius: 999, padding: "3px 9px" }}><Star size={9} /> FEATURED</span>}
                </div>
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ fontWeight: 800, color: "var(--soil)", fontSize: 14.5 }}>{g.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", margin: "2px 0 8px" }}>
                    {CAT_LABEL[g.category] || g.category} · {g.member_count} member{g.member_count === 1 ? "" : "s"}{g.post_count > 0 ? ` · ${g.post_count} post${g.post_count === 1 ? "" : "s"}` : ""}
                  </div>
                  {g.description && <div style={{ fontSize: 12.5, color: "var(--soil)", marginBottom: 10, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{g.description}</div>}
                  <button className={`btn btn-sm ${g.is_member ? "btn-secondary" : "btn-primary"}`} onClick={(e) => g.is_owner ? e.stopPropagation() || setOpen(g.group_id) : join(g, e)} style={{ width: "100%" }}>
                    {g.is_owner ? "Your group — open" : g.is_member ? "Joined ✓" : "Join"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      {creating && <GroupForm onClose={() => setCreating(false)} onDone={(gid) => { setCreating(false); if (gid) setOpen(gid); load(q); }} />}
    </div>
  );
}

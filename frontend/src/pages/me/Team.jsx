/** Team — /me/team. Prototype openTeamManagement parity: summary tiles,
 *  Members / Pending-invites tabs, and the 5-step invite flow (who → role →
 *  scope → review → send). The INVITER sends the WhatsApp message from their
 *  own phone (wa.me link) — delivery is in their hands, nothing is faked. */
import { useEffect, useState } from "react";
import { Users, Clock, Plus, Shield, Send, X, Check } from "lucide-react";
import { C, getJSON, card, MeShell } from "./_meCommon";

const API = "/api/v1/team";
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };
async function send(method, url, body) {
  const t = localStorage.getItem("tfos_access_token");
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.detail || `Request failed (${r.status})`);
  return j;
}

const ROLE_COLOR = { FOUNDER: "var(--green-dk)", ADMIN: "var(--green-dk)", MANAGER: "#2e6da4", WORKER: "var(--amber)", ACCOUNTANT: "#7b5ea7", VIEWER: "var(--muted)", FARMER: "var(--green-dk)" };
const inp = { width: "100%", border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, marginBottom: 10, boxSizing: "border-box" };

function InviteFlow({ onClose, onDone }) {
  const [step, setStep] = useState(0);
  const [roles, setRoles] = useState([]);
  const [farms, setFarms] = useState([]);
  const [f, setF] = useState({ name: "", phone: "", role: "WORKER", scope: "ALL", scopeLabel: "All farms" });
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getJSON(`${API}/roles`).then((r) => setRoles(r.data || [])).catch(() => {});
    getJSON("/api/v1/farms").then((r) => { const j = r?.data?.farms || r?.data || r?.farms || []; setFarms(Array.isArray(j) ? j : []); }).catch(() => {});
  }, []);
  const STEPS = ["Who", "Role", "Scope", "Review", "Sent"];
  const submit = async () => {
    setBusy(true);
    try {
      const r = await send("POST", `${API}/invites`, { invitee_name: f.name, invitee_phone: f.phone, team_role: f.role, farm_scope: f.scope, scope_label: f.scopeLabel });
      setSent(r.data); setStep(4); onDone();
    } catch (e) { toast(String(e.message || e), "error"); } finally { setBusy(false); }
  };
  const roleDef = roles.find((r) => r.id === f.role);
  const waPreview = `Hi ${f.name.split(" ")[0] || "…"}, you've been added as ${roleDef?.label || f.role} at ${f.scopeLabel} on Teivaka. Tap to confirm and set up your account.`;
  const pick = (sel) => ({ display: "block", width: "100%", textAlign: "left", border: `1px solid ${sel ? "var(--green)" : C.line}`, background: sel ? "rgba(106,168,79,0.07)" : "var(--paper)", borderRadius: 10, padding: "11px 13px", marginBottom: 8, cursor: "pointer" });
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "var(--paper)", borderRadius: 14, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <strong style={{ color: C.soil, fontSize: 17 }}>Invite a worker</strong>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted }}><X size={18} /></button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 4, borderRadius: 2, background: i <= step ? "var(--green)" : C.line, marginBottom: 4 }} />
              <span style={{ fontSize: 10, color: i <= step ? C.greenDk : C.muted, fontWeight: i === step ? 800 : 500 }}>{s}</span>
            </div>
          ))}
        </div>

        {step === 0 && (<>
          <div style={{ fontWeight: 700, color: C.soil, marginBottom: 2 }}>Who are you inviting?</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>Enter their name and WhatsApp number. You'll send the invitation from your own WhatsApp.</div>
          <input style={inp} value={f.name} placeholder="Full name — e.g. Tomasi Naliva" onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input style={inp} value={f.phone} placeholder="WhatsApp number — e.g. 679 9XX XXXX" onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <div style={{ fontSize: 11.5, color: C.muted, display: "flex", gap: 6, marginBottom: 14 }}><Shield size={13} style={{ flexShrink: 0 }} /> The invitee tap-confirms and creates their own login before they join your account.</div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-sm btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-sm btn-primary" disabled={f.name.trim().length < 2 || f.phone.replace(/\D/g, "").length < 6} onClick={() => setStep(1)}>Continue →</button>
          </div>
        </>)}

        {step === 1 && (<>
          <div style={{ fontWeight: 700, color: C.soil, marginBottom: 2 }}>What role will they have?</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>Roles decide what they can see and do. You can change this later.</div>
          {roles.map((r) => (
            <button key={r.id} onClick={() => setF({ ...f, role: r.id })} style={pick(f.role === r.id)}>
              <div style={{ fontWeight: 700, color: C.soil, fontSize: 14 }}>{r.label} {f.role === r.id && <Check size={13} style={{ color: C.greenDk, verticalAlign: "-2px" }} />}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{r.desc}</div>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 11.5, color: C.soil }}>{(r.caps || []).map((c, i) => <li key={i}>{c}</li>)}</ul>
            </button>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <button className="btn btn-sm btn-secondary" onClick={() => setStep(0)}>Back</button>
            <button className="btn btn-sm btn-primary" onClick={() => setStep(2)}>Continue →</button>
          </div>
        </>)}

        {step === 2 && (<>
          <div style={{ fontWeight: 700, color: C.soil, marginBottom: 2 }}>Which farms can they access?</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>Workers usually get one farm. Managers and accountants often get all farms.</div>
          <button onClick={() => setF({ ...f, scope: "ALL", scopeLabel: "All farms" })} style={pick(f.scope === "ALL")}>
            <div style={{ fontWeight: 700, color: C.soil, fontSize: 14 }}>All farms</div>
            <div style={{ fontSize: 12, color: C.muted }}>Best for managers, accountants, and trusted advisors.</div>
          </button>
          {farms.map((fm) => (
            <button key={fm.farm_id} onClick={() => setF({ ...f, scope: fm.farm_id, scopeLabel: fm.farm_name })} style={pick(f.scope === fm.farm_id)}>
              <div style={{ fontWeight: 700, color: C.soil, fontSize: 14 }}>{fm.farm_name}</div>
              <div style={{ fontSize: 12, color: C.muted }}>Single farm{fm.location_island ? ` · ${fm.location_island}` : ""} — common for field workers tied to one site.</div>
            </button>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <button className="btn btn-sm btn-secondary" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-sm btn-primary" onClick={() => setStep(3)}>Continue →</button>
          </div>
        </>)}

        {step === 3 && (<>
          <div style={{ fontWeight: 700, color: C.soil, marginBottom: 2 }}>Review and send</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>This is the message you'll send to {f.phone} from your WhatsApp.</div>
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: "4px 14px", marginBottom: 12 }}>
            {[["Invitee", f.name], ["Phone", f.phone], ["Role", roleDef?.label || f.role], ["Scope", f.scopeLabel]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
                <span style={{ color: C.muted }}>{k}</span><strong style={{ color: C.soil }}>{v}</strong>
              </div>
            ))}
          </div>
          <div style={{ background: "#e7f6e2", border: "1px solid #bfe3b0", borderRadius: 10, padding: 12, fontSize: 12.5, color: C.soil, marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 4 }}>📱 Message preview (to {f.phone})</div>
            {waPreview}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <button className="btn btn-sm btn-secondary" onClick={() => setStep(2)}>Back</button>
            <button className="btn btn-sm btn-primary" disabled={busy} onClick={submit}><Send size={13} />{busy ? "Creating…" : "Create invite"}</button>
          </div>
        </>)}

        {step === 4 && sent && (<>
          <div style={{ fontWeight: 700, color: C.soil, marginBottom: 2 }}>Invitation ready.</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>
            Tap the button below — it opens WhatsApp with the invitation prefilled for <strong>{f.phone}</strong>. The invite expires in {sent.expires_days} days; resend or cancel from the Pending tab.
          </div>
          <a className="btn btn-primary" style={{ display: "inline-flex", gap: 8, alignItems: "center", textDecoration: "none", marginBottom: 12 }} href={sent.whatsapp_link} target="_blank" rel="noreferrer">
            <Send size={14} /> Send WhatsApp invite
          </a>
          <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 14 }}>
            Or copy the link: <code style={{ fontSize: 11, color: C.greenDk, wordBreak: "break-all" }}>{sent.accept_url}</code>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-sm btn-secondary" onClick={onClose}>Back to team</button>
          </div>
        </>)}
      </div>
    </div>
  );
}

export default function Team() {
  const [members, setMembers] = useState(null);
  const [invites, setInvites] = useState(null);
  const [tab, setTab] = useState("members");
  const [inviting, setInviting] = useState(false);

  const load = () => {
    getJSON("/api/v1/me/team").then((r) => setMembers(r?.data ?? [])).catch(() => setMembers([]));
    getJSON(`${API}/invites`).then((r) => setInvites(r?.data ?? [])).catch(() => setInvites([]));
  };
  useEffect(() => { load(); }, []);

  const pending = (invites || []).filter((i) => i.status === "PENDING");
  const cancel = async (i) => {
    try { await send("POST", `${API}/invites/${i.invite_id}/cancel`); toast("Invitation cancelled", "success"); load(); }
    catch (e) { toast(String(e.message || e), "error"); }
  };

  const tile = { flex: 1, minWidth: 100, background: "var(--paper)", border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px", textAlign: "center" };
  return (
    <MeShell title="Team management" subtitle="All members on your account. Invitations go out via your WhatsApp; workers can be scoped to specific farms.">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={tile}><div style={{ fontSize: 24, fontWeight: 800, color: C.soil }}>{members?.length ?? "…"}</div><div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase" }}>Members</div></div>
        <div style={tile}><div style={{ fontSize: 24, fontWeight: 800, color: C.soil }}>{members ? members.filter((m) => ["WORKER", "MANAGER"].includes((m.role || "").toUpperCase())).length : "…"}</div><div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase" }}>Workers</div></div>
        <div style={tile}><div style={{ fontSize: 24, fontWeight: 800, color: C.soil }}>{invites ? pending.length : "…"}</div><div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase" }}>Pending invites</div></div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        {[["members", "Members", Users], ["pending", "Pending invites", Clock]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ display: "inline-flex", gap: 6, alignItems: "center", border: `1px solid ${tab === id ? "var(--green-dk)" : C.line}`, background: tab === id ? "var(--green)" : "var(--paper)", color: tab === id ? "var(--paper)" : C.soil, borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <Icon size={14} />{label}{id === "pending" && pending.length > 0 ? ` (${pending.length})` : ""}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-primary" onClick={() => setInviting(true)}><Plus size={13} />Invite a worker</button>
      </div>

      {tab === "members" ? (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          {members == null ? <div style={{ padding: 14, color: C.muted }}>Loading…</div>
            : members.length === 0 ? <div style={{ padding: 14, color: C.muted, fontSize: 13 }}>No members yet. Click "Invite a worker" above to get started.</div>
            : members.map((m) => (
              <div key={m.user_id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${C.line}` }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: ROLE_COLOR[(m.role || "").toUpperCase()] || C.muted, color: "#fff", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{(m.full_name || "?").slice(0, 1).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: C.soil, fontSize: 13.5 }}>{m.full_name} {m.is_you && <span style={{ fontSize: 10, color: C.muted }}>[you]</span>}</div>
                  <div style={{ fontSize: 11.5, color: C.muted }}>{m.email}</div>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "4px 10px", color: "#fff", background: ROLE_COLOR[(m.role || "").toUpperCase()] || C.muted }}>{(m.team_role || m.role || "").toUpperCase()}</span>
              </div>
            ))}
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          {invites == null ? <div style={{ padding: 14, color: C.muted }}>Loading…</div>
            : pending.length === 0 ? <div style={{ padding: 14, color: C.muted, fontSize: 13 }}>No pending invitations. Send one via "Invite a worker".</div>
            : pending.map((i) => (
              <div key={i.invite_id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
                <Clock size={18} style={{ color: "var(--amber)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700, color: C.soil, fontSize: 13.5 }}>{i.invitee_name}</div>
                  <div style={{ fontSize: 11.5, color: C.muted }}>{i.invitee_phone} · {i.team_role} · {i.scope_label} · sent {new Date(i.created_at).toLocaleDateString()}{i.sent_by ? ` by ${i.sent_by}` : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {i.whatsapp_link && <a className="btn btn-sm btn-secondary" style={{ textDecoration: "none" }} href={i.whatsapp_link} target="_blank" rel="noreferrer"><Send size={12} />Resend</a>}
                  <button className="btn btn-sm btn-secondary" style={{ color: "var(--red)" }} onClick={() => cancel(i)}>Cancel</button>
                </div>
              </div>
            ))}
        </div>
      )}

      <div style={{ ...card, background: C.cream, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: C.muted }}>
        <Shield size={14} style={{ flexShrink: 0, marginTop: 1, color: C.green }} />
        <span>All invitations bind the invitee to the <a href="/covenant" style={{ color: C.greenDk }}>Data Ownership Covenant</a>. Workers can revoke their participation anytime per Covenant §5.</span>
      </div>

      {inviting && <InviteFlow onClose={() => setInviting(false)} onDone={load} />}
    </MeShell>
  );
}

/** Shared helpers + page wrapper for the /me/* account pages. Rendered inside
 *  FarmerShell (no own chrome). Plain palette so it matches the app shell. */
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export const C = { soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", line: "#E8E2D4", cream: "#F8F3E9", muted: "#8A7B6F", amber: "#BF9000" };
export const tok = () => localStorage.getItem("tfos_access_token");
export const authHeaders = () => { const t = tok(); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; };
export async function getJSON(u) { const r = await fetch(u, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
export async function send(method, u, body) { const r = await fetch(u, { method, headers: authHeaders(), body: body ? JSON.stringify(body) : undefined }); if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.detail || String(r.status)); return r.json().catch(() => ({})); }

export function MeShell({ title, subtitle, children, back = "/me" }) {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "4px 0" }}>
      <Link to={back} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 12.5, textDecoration: "none", marginBottom: 10 }}>
        <ArrowLeft size={14} /> Account
      </Link>
      <h1 style={{ margin: "0 0 2px", color: C.soil, fontSize: 22, fontWeight: 700 }}>{title}</h1>
      {subtitle && <p style={{ margin: "0 0 18px", color: C.muted, fontSize: 13.5 }}>{subtitle}</p>}
      {children}
    </div>
  );
}

export const card = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, marginBottom: 14 };

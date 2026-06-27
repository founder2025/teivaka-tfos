/**
 * Consignments.jsx — /me/consignments — Lot traceability (TATI).
 *
 * Bundle harvests into a consignment for a buyer, get a public trace QR for the delivery
 * docket. Every figure traces back to the farmer's hash-chained records. The farmer logs
 * once (harvests already exist); this only assembles the shipment.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Package, ArrowLeft, Plus, Truck, QrCode, Check } from "lucide-react";
import { C, getJSON, send } from "./_meCommon";
import Modal from "../../components/ui/Modal.jsx";

const toast = (m) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); } catch { /* noop */ } };
const inp = { width: "100%", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, marginTop: 4 };

function Builder({ open, onClose, onCreated }) {
  const [avail, setAvail] = useState([]);
  const [picks, setPicks] = useState({});          // harvest_id -> {kg, ...row}
  const [buyer, setBuyer] = useState("");
  const [crop, setCrop] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setPicks({}); setBuyer(""); setCrop("");
    getJSON("/api/v1/lots/available-harvests").then((d) => setAvail(d?.data?.harvests || [])).catch(() => setAvail([]));
  }, [open]);
  const toggle = (h) => setPicks((p) => {
    const n = { ...p };
    if (n[h.harvest_id]) delete n[h.harvest_id];
    else n[h.harvest_id] = { ...h, kg: h.remaining_kg };
    return n;
  });
  const setKg = (id, kg) => setPicks((p) => ({ ...p, [id]: { ...p[id], kg } }));
  const chosen = Object.values(picks);
  const total = chosen.reduce((s, x) => s + (Number(x.kg) || 0), 0);
  const create = async () => {
    if (!chosen.length) { toast("Pick at least one harvest"); return; }
    setBusy(true);
    try {
      const d = await send("POST", "/api/v1/lots", {
        crop_name: crop || null, buyer_name: buyer || null,
        items: chosen.map((x) => ({ harvest_id: x.harvest_id, harvest_date: x.harvest_date, kg: Number(x.kg) })),
      });
      onCreated(d?.data); onClose();
    } catch (e) { toast(e.userMessage || e.message || "Couldn't create consignment"); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen={open} onClose={onClose} title="New consignment" size="sm"
      footer={<><button onClick={onClose} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 12px", fontSize: 13 }}>Cancel</button><button onClick={create} disabled={busy || !chosen.length} style={{ border: `1px solid ${C.greenDk}`, background: C.greenDk, color: "var(--paper)", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700 }}>{busy ? "Creating…" : `Create (${total.toFixed(0)} kg)`}</button></>}>
      <div style={{ display: "grid", gap: 10 }}>
        <label style={{ fontSize: 12.5, color: C.soil }}>Buyer / exporter (optional)
          <input value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="e.g. Pacific Exporters Ltd" style={inp} /></label>
        <label style={{ fontSize: 12.5, color: C.soil }}>Crop label (optional — auto-filled from harvests)
          <input value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="e.g. Ginger" style={inp} /></label>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".5px", marginTop: 4 }}>Available harvests</div>
        {avail.length === 0 ? <div style={{ fontSize: 13, color: C.muted }}>No harvests with un-allocated quantity. Log a harvest first.</div> :
          avail.map((h) => {
            const on = !!picks[h.harvest_id];
            return (
              <div key={h.harvest_id} style={{ border: `1px solid ${on ? C.greenDk : C.line}`, borderRadius: 10, padding: 10, background: on ? "var(--green-tint)" : "var(--paper)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(h)} />
                  <span style={{ flex: 1 }}>{h.production_name || "Harvest"} · {h.pu_name || "block"}<div style={{ fontSize: 11, color: C.muted }}>{h.harvest_date} · {h.remaining_kg} kg available {h.compliance_cleared ? "· ✓ cleared" : "· ⚠ not cleared"}</div></span>
                </label>
                {on && <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: C.muted }}>kg in this lot</span>
                  <input type="number" min="0" max={h.remaining_kg} step="0.1" value={picks[h.harvest_id].kg}
                    onChange={(e) => setKg(h.harvest_id, e.target.value)} style={{ ...inp, width: 110, marginTop: 0 }} />
                </div>}
              </div>
            );
          })}
      </div>
    </Modal>
  );
}

function Created({ data, onClose }) {
  if (!data) return null;
  const copy = () => { try { navigator.clipboard.writeText(data.trace_url); toast("Trace link copied"); } catch { /* noop */ } };
  return (
    <Modal isOpen={!!data} onClose={onClose} title="Consignment ready" size="sm"
      footer={<button onClick={onClose} style={{ border: `1px solid ${C.greenDk}`, background: C.greenDk, color: "var(--paper)", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700 }}>Done</button>}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "monospace", fontWeight: 700, color: C.soil }}>{data.lot_code} · {data.total_kg} kg</div>
        <img src={`${data.trace_url}/qr.png`} alt="Trace QR" width={180} height={180} style={{ border: `1px solid ${C.line}`, borderRadius: 10, background: "#fff", padding: 8, margin: "12px auto" }} />
        <div style={{ fontSize: 12, color: C.muted, wordBreak: "break-all", fontFamily: "monospace" }}>{data.trace_url}</div>
        <button onClick={copy} style={{ border: `1px solid ${C.greenDk}`, color: C.greenDk, background: "var(--paper)", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, marginTop: 8 }}>Copy link</button>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>Print this QR on the delivery docket or carton. The buyer scans it to trace the consignment back to your records.</div>
      </div>
    </Modal>
  );
}

export default function Consignments() {
  const navigate = useNavigate();
  const [lots, setLots] = useState([]);
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState(null);
  const load = useCallback(async () => { try { const d = await getJSON("/api/v1/lots"); setLots(d?.data?.lots || []); } catch { setLots([]); } }, []);
  useEffect(() => { load(); }, [load]);
  const deliver = async (id) => { try { await send("POST", `/api/v1/lots/${id}/deliver`, {}); toast("Marked delivered"); await load(); } catch (e) { toast(e.userMessage || e.message || "Couldn't update"); } };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <button onClick={() => navigate("/me/passport")} style={{ border: "none", background: "none", color: C.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}><ArrowLeft size={15} />Passport</button>
        <button onClick={() => setOpen(true)} style={{ border: `1px solid ${C.greenDk}`, background: C.greenDk, color: "var(--paper)", borderRadius: 8, padding: "7px 12px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}><Plus size={15} />New consignment</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Package size={20} style={{ color: C.greenDk }} />
        <div><div style={{ fontWeight: 800, fontSize: 18, color: C.soil }}>Consignments</div>
          <div style={{ fontSize: 12.5, color: C.muted }}>Bundle harvests into a traceable lot for a buyer — proof on a QR.</div></div>
      </div>

      {lots.length === 0 ? (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 22, color: C.muted, fontSize: 13, textAlign: "center" }}>
          No consignments yet. Tap “New consignment” to bundle your harvests into a traceable lot.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {lots.map((l) => (
            <div key={l.lot_id} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, background: "var(--paper)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 700, color: C.soil }}>{l.crop_name || "Consignment"} <span style={{ fontFamily: "monospace", fontSize: 11, color: C.muted }}>{l.lot_code}</span></div>
                <span style={{ fontSize: 11, fontWeight: 700, color: l.status === "DELIVERED" ? C.greenDk : C.amber }}>{l.status === "DELIVERED" ? <><Check size={11} style={{ verticalAlign: -1 }} /> Delivered</> : "Draft"}</span>
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>{l.total_kg} kg{l.buyer_name ? ` · ${l.buyer_name}` : ""}{l.delivered_at ? ` · ${l.delivered_at.slice(0, 10)}` : ""}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <a href={l.trace_url} target="_blank" rel="noopener noreferrer" style={{ border: `1px solid ${C.line}`, color: C.greenDk, borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}><QrCode size={13} />Trace page</a>
                <a href={`${l.trace_url}/qr.png`} target="_blank" rel="noopener noreferrer" style={{ border: `1px solid ${C.line}`, color: C.greenDk, borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>QR for docket</a>
                {l.status !== "DELIVERED" && <button onClick={() => deliver(l.lot_id)} style={{ border: `1px solid ${C.greenDk}`, background: C.greenDk, color: "var(--paper)", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}><Truck size={13} />Mark delivered</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Builder open={open} onClose={() => setOpen(false)} onCreated={(d) => { setCreated(d); load(); }} />
      <Created data={created} onClose={() => setCreated(null)} />
    </div>
  );
}

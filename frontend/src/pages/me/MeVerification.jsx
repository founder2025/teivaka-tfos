/**
 * MeVerification — /me/verification. Request the Teivaka green tick:
 * government-issued ID + selfie, reviewed by an admin. Files upload to a
 * PRIVATE path (admin-gated) — never the public uploads route.
 */
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Clock, XCircle, CreditCard, Camera, ShieldCheck } from "lucide-react";
import { MeShell, C, getJSON, card } from "./_meCommon";
import { compressImage, uploadWithProgress } from "../../utils/imageCompress";
import { send } from "../../utils/api";

const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };

function UploadBox({ label, Icon, value, pct, onPick, capture }) {
  const ref = useRef();
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <button onClick={() => ref.current?.click()} disabled={pct != null} style={{ width: "100%", minHeight: 110, border: `2px dashed ${value ? C.green : C.line}`, borderRadius: 12, background: value ? "rgba(106,168,79,0.06)" : "var(--paper)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: 14 }}>
        <Icon size={22} style={{ color: value ? C.greenDk : C.muted }} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.soil }}>{label}</span>
        <span style={{ fontSize: 11.5, color: value ? C.greenDk : C.muted }}>
          {pct != null ? `Uploading… ${pct}%` : value ? "Uploaded ✓ — tap to replace" : "Tap to upload"}
        </span>
      </button>
      <input ref={ref} type="file" accept="image/*" {...(capture ? { capture: "user" } : {})} hidden onChange={onPick} />
    </div>
  );
}

export default function MeVerification() {
  const [state, setState] = useState(null);   // {kyc_verified, request}
  const [idPath, setIdPath] = useState(null);
  const [selfiePath, setSelfiePath] = useState(null);
  const [pct, setPct] = useState({});         // {id: n, selfie: n}
  const [busy, setBusy] = useState(false);
  const load = () => getJSON("/api/v1/me/verification").then((r) => setState(r.data)).catch(() => setState({ kyc_verified: false, request: null }));
  useEffect(() => { load(); }, []);

  const upload = (kind, setPath) => async (e) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    setPct((m) => ({ ...m, [kind]: 0 }));
    try {
      const slim = await compressImage(f);
      const token = localStorage.getItem("tfos_access_token");
      const body = await uploadWithProgress("/api/v1/me/verification/upload", slim, token, (n) => setPct((m) => ({ ...m, [kind]: n })));
      setPath(body?.data?.path || null);
      toast(`${kind === "id" ? "ID" : "Selfie"} uploaded ✓`, "success");
    } catch (err) { toast(`Couldn't upload: ${err.message || err}`, "error"); }
    finally { setPct((m) => ({ ...m, [kind]: null })); }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await send("POST", "/api/v1/me/verification", { id_doc_path: idPath, selfie_path: selfiePath });
      toast("Verification request submitted ✓ — we'll review it shortly.", "success");
      setIdPath(null); setSelfiePath(null);
      load();
    } catch (e) { toast(`Couldn't submit: ${e.userMessage || e.message}`, "error"); }
    finally { setBusy(false); }
  };

  if (!state) return <MeShell title="Verification" subtitle="The Teivaka green tick"><div style={{ color: C.muted }}>Loading…</div></MeShell>;
  const req = state.request;

  return (
    <MeShell title="Verification" subtitle="The Teivaka green tick — identity verified with a government ID and selfie.">
      {state.kyc_verified ? (
        <div style={{ ...card, textAlign: "center", padding: 26, border: `1px solid ${C.green}` }}>
          <BadgeCheck size={34} style={{ color: C.greenDk }} />
          <div style={{ fontWeight: 700, color: C.soil, marginTop: 8 }}>You're verified</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Your green tick shows across the platform — buyers and lenders can trust your identity.</div>
        </div>
      ) : req?.status === "PENDING" ? (
        <div style={{ ...card, textAlign: "center", padding: 26 }}>
          <Clock size={30} style={{ color: C.amber }} />
          <div style={{ fontWeight: 700, color: C.soil, marginTop: 8 }}>Under review</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Your documents were submitted {req.created_at ? new Date(req.created_at).toLocaleDateString() : ""}. You'll get a notification when reviewed.</div>
        </div>
      ) : (
        <>
          {req?.status === "REJECTED" && (
            <div style={{ ...card, border: "1px solid var(--red)", background: "rgba(163,45,45,0.05)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--red)", fontWeight: 700, fontSize: 13.5 }}><XCircle size={16} /> Previous request not approved</div>
              {req.note && <div style={{ fontSize: 12.5, color: C.soil, marginTop: 6 }}>{req.note}</div>}
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>You can submit again with clearer documents.</div>
            </div>
          )}
          <div style={card}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <ShieldCheck size={16} style={{ color: C.greenDk }} /><strong style={{ color: C.soil }}>How it works</strong>
            </div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
              Upload a photo of your <strong>government-issued ID</strong> (passport, driver's licence, voter card or FNPF/joint card) and a <strong>selfie of yourself</strong>. An administrator reviews them — your documents stay private and are never shown publicly. Approval gives your account the green tick everywhere on Teivaka.
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <UploadBox label="Government ID" Icon={CreditCard} value={idPath} pct={pct.id} onPick={upload("id", setIdPath)} />
            <UploadBox label="Selfie" Icon={Camera} value={selfiePath} pct={pct.selfie} onPick={upload("selfie", setSelfiePath)} capture />
          </div>
          <button onClick={submit} disabled={busy || !idPath || !selfiePath} style={{ width: "100%", minHeight: 46, background: C.green, color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: busy || !idPath || !selfiePath ? 0.5 : 1 }}>
            {busy ? "Submitting…" : "Submit for verification"}
          </button>
        </>
      )}
    </MeShell>
  );
}

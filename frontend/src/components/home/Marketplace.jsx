/**
 * Marketplace.jsx — Teivaka Marketplace serving every profession.
 * Categories: Produce / Inputs & seeds / Tools & equipment / Livestock /
 * Services / Wanted (buyers post needs). Photo-first grid, listing detail with
 * seller identity (green tick) + Message seller (chat unlocks via the
 * listing-contact rule), save/share, and owner management (sold/relist/close).
 * New-listing modal opens from HomePillar's button via the "tfos:new-listing"
 * window event. Real endpoints only; honest empty states.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Search, MapPin, BadgeCheck, MessageCircle, Bookmark, Share2, X, ChevronLeft, ChevronRight, Tag, CheckCircle2, RotateCcw, Image as ImageIcon } from "lucide-react";
import { getJSON, send } from "../../utils/api";
import { uploadMedia } from "../../utils/imageCompress";
import { useChat } from "../../context/ChatContext";
import Avatar from "../ui/Avatar";
import { formatMoney } from "../../utils/money";

const API = "/api/v1/community";
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };
const CATS = [["ALL", "All"], ["PRODUCE", "Produce"], ["INPUTS", "Inputs & seeds"], ["TOOLS", "Tools & equipment"], ["LIVESTOCK", "Livestock"], ["SERVICES", "Services"], ["WANTED", "Wanted"]];
const CAT_LABEL = Object.fromEntries(CATS);
const ISLANDS = ["Viti Levu", "Vanua Levu", "Kadavu", "Taveuni", "Ovalau", "Rotuma", "Other"];
// Category-native config: fields, units and copy adapt to what's being listed.
const CAT_CFG = {
  PRODUCE:   { accent: "var(--green-dk)", qty: "Quantity (kg)", desc: "Describe it — condition, grade, harvest date…", bases: [["kg", "per kg"], ["unit", "per unit"], ["pack", "per pack"]], loc: "Pickup location — village / town", hash: true,
               extras: [["grade", "Grade (A / B / Organic / Mixed)"], ["harvest_date", "Harvest date (e.g. 10 Jun)"]], delivery: true },
  INPUTS:    { accent: "var(--amber)", qty: "Quantity available (packs/bags)", desc: "Describe it — brand, pack size, expiry…", bases: [["pack", "per pack"], ["unit", "per unit"], ["kg", "per kg"]], loc: "Pickup location — shop / town", hash: false,
               extras: [["brand", "Brand / product name"], ["pack_size", "Pack size (e.g. 25 kg bag)"]], delivery: true },
  TOOLS:     { accent: "#7A5C4E", qty: "How many available", desc: "Describe it — what it does, age, condition…", bases: [["item", "per item"], ["day", "per day (hire)"]], loc: "Pickup location — village / town", hash: false,
               extras: [["condition", "Condition (New / Used — good / Used — fair)"], ["brand_model", "Brand / model (optional)"]], delivery: false },
  LIVESTOCK: { accent: "var(--red)", qty: "Head count", desc: "Describe them — breed, age, health, vaccinations…", bases: [["head", "per head"], ["kg", "per kg (dressed)"]], loc: "Pickup location — farm / village", hash: true,
               extras: [["animal_type", "Animal (e.g. broiler, goat, piglet)"], ["age_weight", "Age / weight (e.g. 6 wks, ~2 kg)"]], delivery: false },
  SERVICES:  { accent: "#2C6E8A", qty: null, desc: "What's the service? Experience, equipment, availability…", bases: [["hour", "per hour"], ["job", "per job"], ["day", "per day"]], loc: "Service area — islands / regions covered", hash: false,
               extras: [["availability", "Availability (e.g. weekdays, from July)"]], delivery: false },
  WANTED:    { accent: "var(--soil)", qty: "Quantity needed", desc: "What do you need? Quantity, grade, when…", bases: [["budget", "total budget"]], loc: "Where you need it — town / island", hash: false,
               extras: [["needed_by", "Needed by (date)"]], delivery: false },
};
const BASIS_SUFFIX = { kg: "/kg", unit: "/unit", hour: "/hr", job: "/job", day: "/day", head: "/head", pack: "/pack", item: "", budget: "" };
const priceLine = (l) => {
  const v = fjd(l.price_per_kg_fjd);
  if (!v) return "Price on request";
  if ((l.price_basis || "kg") === "budget") return `Budget: ${v}`;
  return `${v}${BASIS_SUFFIX[l.price_basis || "kg"] ?? "/kg"}`;
};
// Profession-aware default category (just a default — freely changeable).
const PROF_DEFAULT_CAT = { commercial_buyer: "WANTED", agri_input_supplier: "INPUTS", logistics_operator: "SERVICES", trade_importer: "WANTED", commodity_exporter: "WANTED" };
const fjd = (v) => formatMoney(v);
const inp = { width: "100%", padding: "9px 11px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 14, background: "var(--paper)", boxSizing: "border-box" };

/* ---------------- new listing ---------------- */
function NewListingModal({ onClose, onCreated }) {
  const [f, setF] = useState({ listing_title: "", category: "PRODUCE", price_basis: "kg", production_id: "", listing_description: "", quantity_available_kg: "", price_per_kg_fjd: "", negotiable: true, island: "Viti Levu", pickup_location: "", contact_whatsapp: "", link_audit_hash: "" });
  const [details, setDetails] = useState({});
  const [prods, setProds] = useState([]);   // produce catalog for the crop picker
  const [mkt, setMkt] = useState(null);      // market-price stats for the chosen crop
  const setD = (k, v) => setDetails((d) => ({ ...d, [k]: v }));
  // Profession-aware default category from /auth/me (default only — changeable).
  useEffect(() => {
    getJSON("/api/v1/auth/me").then((r) => {
      const prof = ((r?.data ?? r)?.profession || "").toLowerCase();
      const def = PROF_DEFAULT_CAT[prof];
      if (def) setF((s2) => ({ ...s2, category: def, price_basis: CAT_CFG[def].bases[0][0] }));
    }).catch(() => {});
  }, []);
  const cfg = CAT_CFG[f.category] || CAT_CFG.PRODUCE;
  const [photos, setPhotos] = useState([]);
  const [pct, setPct] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gps, setGps] = useState([]);
  const fileRef = useRef();
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  // Crop catalog (for the price-hint picker) — fetched once.
  useEffect(() => { getJSON("/api/v1/productions").then((r) => setProds(r?.data || [])).catch(() => setProds([])); }, []);
  const onPickProd = async (id) => {
    set("production_id", id); setMkt(null);
    if (!id) return;
    try { const r = await getJSON(`/api/v1/marketplace/market-prices/${id}`); setMkt(r?.stats || null); }
    catch { setMkt(null); }
  };
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => getJSON(`/api/v1/geo/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`).then((r) => setGps(r?.data?.places || [])).catch(() => {}),
      () => {}, { timeout: 8000, maximumAge: 600000 });
  }, []);
  const pick = async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = ""; if (!files.length) return;
    try {
      for (let i = 0; i < files.length; i++) {
        setPct(0);
        const url = await uploadMedia(files[i], setPct);
        setPhotos((p) => [...p, url]);
      }
      toast("Photo added ✓", "success");
    } catch (err) { toast(`Couldn't upload: ${err.userMessage || err.message}`, "error"); }
    finally { setPct(null); }
  };
  const submit = async () => {
    if (!f.listing_title.trim() || !f.listing_description.trim()) { toast("Title and description are required.", "error"); return; }
    setBusy(true);
    try {
      await send("POST", `${API}/listings`, {
        ...f,
        production_id: f.production_id || null,
        listing_title: f.listing_title.trim(),
        listing_description: f.listing_description.trim(),
        quantity_available_kg: f.quantity_available_kg === "" ? null : Number(f.quantity_available_kg),
        price_per_kg_fjd: f.price_per_kg_fjd === "" ? null : Number(f.price_per_kg_fjd),
        pickup_location: f.pickup_location.trim() || null,
        contact_whatsapp: f.contact_whatsapp.trim() || null,
        link_audit_hash: cfg.hash ? (f.link_audit_hash.trim() || null) : null,
        price_basis: f.category === "WANTED" ? "budget" : f.price_basis,
        details: Object.fromEntries(Object.entries(details).filter(([, v]) => v)),
        photos,
      });
      toast("Listing published ✓", "success");
      onCreated();
    } catch (e) { toast(`Couldn't publish: ${e.userMessage || e.message}`, "error"); }
    finally { setBusy(false); }
  };
  return (
    <div className="overlay-backdrop show" style={{ alignItems: "center", padding: 16 }} onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><span className="overlay-title">New listing</span><button className="overlay-close" onClick={onClose}><X size={16} /></button></div>
        <div className="overlay-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input style={inp} placeholder="Title — e.g. Fresh cassava, 200 kg" maxLength={80} value={f.listing_title} onChange={(e) => set("listing_title", e.target.value)} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CATS.slice(1).map(([v, l]) => (
              <button key={v} onClick={() => { set("category", v); set("price_basis", CAT_CFG[v].bases[0][0]); setDetails({}); }} style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12.5, cursor: "pointer", fontWeight: 600, border: `1px solid ${f.category === v ? "var(--green-dk)" : "var(--line)"}`, background: f.category === v ? "var(--green)" : "var(--paper)", color: f.category === v ? "var(--paper)" : "var(--soil)" }}>{l}</button>
            ))}
          </div>
          <textarea style={{ ...inp, minHeight: 70 }} placeholder={cfg.desc} maxLength={1000} value={f.listing_description} onChange={(e) => set("listing_description", e.target.value)} />
          {/* photos */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {photos.map((u, i) => (
              <span key={i} style={{ position: "relative" }}>
                <img src={u} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }} />
                <button onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "1px solid var(--line)", background: "var(--paper)", cursor: "pointer", fontSize: 10 }}>✕</button>
              </span>
            ))}
            <button onClick={() => fileRef.current?.click()} disabled={pct != null} style={{ width: 64, height: 64, border: "2px dashed var(--line)", borderRadius: 8, background: "var(--paper)", cursor: "pointer", color: "var(--muted)", fontSize: 11 }}>
              {pct != null ? `${pct}%` : "+ Photos"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={pick} />
          </div>
          {/* category-specific extra fields */}
          {cfg.extras.map(([k, label]) => (
            <input key={k} style={inp} placeholder={label} maxLength={80} value={details[k] || ""} onChange={(e) => setD(k, e.target.value)} />
          ))}
          {f.category === "PRODUCE" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <select style={inp} value={f.production_id} onChange={(e) => onPickProd(e.target.value)}>
                <option value="">Which crop? (optional — shows the market price)</option>
                {prods.map((p) => <option key={p.production_id} value={p.production_id}>{p.production_name}</option>)}
              </select>
              {mkt && mkt.avg_price_fjd != null && (
                <div style={{ fontSize: 12, color: "var(--green-dk)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  Recent market avg: <strong>{fjd(mkt.avg_price_fjd)}/kg</strong> · {mkt.observation_count} sale{mkt.observation_count === 1 ? "" : "s"}
                  <button type="button" onClick={() => set("price_per_kg_fjd", String(mkt.avg_price_fjd))} style={{ border: "1px solid var(--green-dk)", background: "transparent", color: "var(--green-dk)", borderRadius: 6, padding: "1px 9px", cursor: "pointer", fontSize: 11.5, fontWeight: 600 }}>Use</button>
                </div>
              )}
              {mkt && mkt.avg_price_fjd == null && (
                <div style={{ fontSize: 11.5, color: "var(--muted)" }}>No market price logged for this crop yet — yours helps set the benchmark.</div>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {cfg.qty && <input style={{ ...inp, flex: 1, minWidth: 120 }} type="number" min="0" placeholder={cfg.qty} value={f.quantity_available_kg} onChange={(e) => set("quantity_available_kg", e.target.value)} />}
            <input style={{ ...inp, flex: 1, minWidth: 120 }} type="number" min="0" step="0.01" placeholder={f.category === "WANTED" ? "Budget FJD (total)" : "Price FJD"} value={f.price_per_kg_fjd} onChange={(e) => set("price_per_kg_fjd", e.target.value)} />
            {f.category !== "WANTED" && (
              <select style={{ ...inp, width: "auto", minWidth: 110 }} value={f.price_basis} onChange={(e) => set("price_basis", e.target.value)}>
                {cfg.bases.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            )}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--soil)" }}>
            <input type="checkbox" checked={f.negotiable} onChange={(e) => set("negotiable", e.target.checked)} /> {f.category === "WANTED" ? "Budget flexible" : "Price negotiable"}
          </label>
          {cfg.delivery && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--soil)" }}>
              <input type="checkbox" checked={!!details.delivery} onChange={(e) => setD("delivery", e.target.checked ? "yes" : "")} /> Delivery available
            </label>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select style={{ ...inp, flex: 1, minWidth: 140 }} value={f.island} onChange={(e) => set("island", e.target.value)}>
              {ISLANDS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
            <input style={{ ...inp, flex: 2, minWidth: 160 }} placeholder={cfg.loc} maxLength={80} value={f.pickup_location} onChange={(e) => set("pickup_location", e.target.value)} />
          </div>
          {gps.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {gps.map((g) => <button key={g} className="cm-tool-btn" onClick={() => set("pickup_location", g)}><MapPin size={11} />{g}</button>)}
            </div>
          )}
          <input style={inp} placeholder="WhatsApp contact (optional) — buyers can reach you off-app" maxLength={20} value={f.contact_whatsapp} onChange={(e) => set("contact_whatsapp", e.target.value)} />
          {cfg.hash && <input style={inp} placeholder="Verifiable record hash (optional) — prove it" maxLength={64} value={f.link_audit_hash} onChange={(e) => set("link_audit_hash", e.target.value)} />}
        </div>
        <div className="overlay-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || pct != null} onClick={submit}>{busy ? "Publishing…" : "Publish listing"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- listing detail ---------------- */
function ListingDetail({ l, onClose, onChanged }) {
  const chat = useChat();
  const [idx, setIdx] = useState(0);
  const [saved, setSaved] = useState(!!l.is_saved);
  const photos = l.photos || [];
  const act = async (method, path, okMsg) => {
    try { await send(method, `${API}/listings/${l.listing_id}/${path}`); toast(okMsg, "success"); onChanged(); onClose(); }
    catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };
  const toggleSave = async () => {
    const next = !saved; setSaved(next);
    try { await send(next ? "POST" : "DELETE", `${API}/listings/${l.listing_id}/save`); }
    catch (e) { setSaved(!next); toast(e.userMessage || e.message, "error"); }
  };
  const shareToFeed = async () => {
    try {
      await send("POST", `${API}/feed`, { body: `📦 ${l.listing_title} — ${fjd(l.price_per_kg_fjd) || "price on request"}${l.island ? ` · ${l.island}` : ""}. Find it on the Teivaka Marketplace.`, audience: "everyone", photos: photos.slice(0, 1) });
      toast("Shared to your feed ✓", "success");
    } catch (e) { toast(`Couldn't share: ${e.userMessage || e.message}`, "error"); }
  };
  const message = () => {
    if (!l.created_by) return;
    chat.openWith({ user_id: String(l.created_by), full_name: l.seller_name || "Seller", profession: l.seller_profession || undefined });
    chat.setDropdownOpen?.(false);
    onClose();
  };
  const order = async () => {
    const unit = l.price_basis || "kg";
    const cap = l.quantity_available_kg ? Number(l.quantity_available_kg) : null;
    const ans = window.prompt(cap ? `How many ${unit} to order? (up to ${cap})` : `How many ${unit} to order?`, cap ? String(cap) : "");
    if (ans == null) return;
    const qty = Number(ans);
    if (!qty || qty <= 0) { toast("Enter a valid quantity", "error"); return; }
    try {
      const r = await send("POST", `/api/v1/marketplace/listings/${l.listing_id}/order`, { quantity_kg: qty });
      toast(`Order placed ✓ — seller notified (${fjd(r?.data?.total_fjd)})`, "success");
      onChanged(); onClose();
    } catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };
  const requestService = async () => {
    const note = window.prompt("Anything the provider should know? (optional)", "");
    if (note == null) return;
    try {
      await send("POST", `/api/v1/marketplace/listings/${l.listing_id}/request-service`, { notes: note || null });
      toast("Request sent ✓ — find it in the Service hub", "success");
      onChanged(); onClose();
    } catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };
  return (
    <div className="overlay-backdrop show" style={{ alignItems: "center", padding: 16 }} onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 620, maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><span className="overlay-title">{l.listing_title}</span><button className="overlay-close" onClick={onClose}><X size={16} /></button></div>
        <div className="overlay-body">
          {photos.length > 0 && (
            <div style={{ position: "relative", marginBottom: 12 }}>
              <img src={photos[idx]} alt="" style={{ width: "100%", maxHeight: 320, objectFit: "contain", background: "#000", borderRadius: 10 }} />
              {photos.length > 1 && <>
                <button onClick={() => setIdx((idx - 1 + photos.length) % photos.length)} style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.85)", cursor: "pointer" }}><ChevronLeft size={18} /></button>
                <button onClick={() => setIdx((idx + 1) % photos.length)} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.85)", cursor: "pointer" }}><ChevronRight size={18} /></button>
                <span style={{ position: "absolute", bottom: 8, right: 10, fontSize: 11, color: "#fff", background: "rgba(0,0,0,0.5)", borderRadius: 8, padding: "2px 8px" }}>{idx + 1} / {photos.length}</span>
              </>}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: "var(--soil)" }}>{priceLine(l)}</span>
            {l.negotiable && <span style={{ fontSize: 11.5, color: "var(--green-dk)", fontWeight: 600 }}>negotiable</span>}
            <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{CAT_LABEL[l.category] || l.category}{l.quantity_available_kg ? ` · ${Number(l.quantity_available_kg)} kg` : ""}</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "4px 0 10px" }}>
            <MapPin size={12} /> {l.category === "SERVICES" ? "Service area: " : ""}{[l.pickup_location, l.island].filter(Boolean).join(", ") || "Location on request"}
            {l.created_at ? ` · listed ${new Date(l.created_at).toLocaleDateString()}` : ""}
          </div>
          <p style={{ fontSize: 14, color: "var(--soil)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{l.listing_description}</p>
          {l.details && Object.keys(l.details).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "6px 0 4px" }}>
              {Object.entries(l.details).map(([k, v]) => (
                <div key={k} style={{ fontSize: 12.5, color: "var(--soil)" }}>
                  <span style={{ color: "var(--muted)", textTransform: "capitalize" }}>{k.replace(/_/g, " ")}: </span>{String(v) === "yes" ? "Yes" : String(v)}
                </div>
              ))}
            </div>
          )}
          {l.link_audit_hash && <a href={`/verify/${l.link_audit_hash}`} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "var(--green-dk)", display: "inline-flex", gap: 5, alignItems: "center" }}><CheckCircle2 size={13} /> Verifiable record · {String(l.link_audit_hash).slice(0, 12)}…</a>}
          {/* seller */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10 }}>
            <Avatar src={l.seller_avatar} name={l.seller_name} size={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: "var(--soil)", fontSize: 13.5, display: "flex", alignItems: "center", gap: 5 }}>
                {l.seller_name || "Seller"}{l.seller_verified && <BadgeCheck size={14} style={{ color: "var(--green-dk)" }} />}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{l.seller_since ? `member since ${new Date(l.seller_since).getFullYear()}` : ""}</div>
            </div>
            {l.contact_whatsapp && <a href={`https://wa.me/${String(l.contact_whatsapp).replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--green-dk)", textDecoration: "none" }}>WhatsApp</a>}
          </div>
        </div>
        <div className="overlay-foot" style={{ flexWrap: "wrap", gap: 8 }}>
          {l.is_mine ? (
            <>
              {!l.sold_at
                ? <button className="btn btn-primary" onClick={() => act("PATCH", "sold", "Marked as sold ✓")}><CheckCircle2 size={14} /> Mark as sold</button>
                : <button className="btn btn-primary" onClick={() => act("PATCH", "relist", "Relisted ✓")}><RotateCcw size={14} /> Relist</button>}
              <button className="btn btn-secondary" onClick={() => act("PATCH", "close", "Listing closed")}>Close listing</button>
            </>
          ) : (
            <>
              {["PRODUCE", "INPUTS"].includes(l.category) && l.listing_status === "ACTIVE" && l.price_per_kg_fjd != null && (
                <button className="btn btn-primary" onClick={order}><CheckCircle2 size={14} /> Order now</button>
              )}
              {l.category === "SERVICES" && l.listing_status === "ACTIVE" && (
                <button className="btn btn-primary" onClick={requestService}><CheckCircle2 size={14} /> Request service</button>
              )}
              <button className="btn btn-secondary" onClick={message}><MessageCircle size={14} /> Message seller</button>
              <button className="btn btn-secondary" onClick={toggleSave}><Bookmark size={14} /> {saved ? "Saved ✓" : "Save"}</button>
              <button className="btn btn-secondary" onClick={shareToFeed}><Share2 size={14} /> Share to feed</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- marketplace ---------------- */
export default function Marketplace() {
  const location = useLocation();
  const navigate = useNavigate();
  // Directory -> Marketplace bridge: /home/marketplace?seller=<user_id>
  const seller = new URLSearchParams(location.search).get("seller");
  const [sellerName, setSellerName] = useState(null);
  const [cat, setCat] = useState("ALL");
  const [island, setIsland] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState("browse"); // browse | mine | saved
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    const p = new URLSearchParams();
    if (cat !== "ALL") p.set("category", cat);
    if (island) p.set("island", island);
    if (q.trim()) p.set("search", q.trim());
    if (view === "mine") p.set("mine", "true");
    if (view === "saved") p.set("saved", "true");
    if (seller) p.set("seller", seller);
    getJSON(`${API}/listings?${p.toString()}`).then((r) => { setItems(r.data || []); if (seller && r.data?.length) setSellerName(r.data[0].seller_name); })
      .catch((e) => { setItems([]); toast(`Couldn't load listings: ${e.userMessage || e.message}`, "error"); });
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [cat, island, view, seller]);
  useEffect(() => { const id = setTimeout(load, 350); return () => clearTimeout(id); /* eslint-disable-next-line */ }, [q]);
  // HomePillar's "New listing" header button dispatches this event.
  useEffect(() => {
    const on = () => setCreating(true);
    window.addEventListener("tfos:new-listing", on);
    return () => window.removeEventListener("tfos:new-listing", on);
  }, []);
  // The pillar (+) → "Sell an item" lands here with ?new=1 — open the form.
  const [sp, setSp] = useSearchParams();
  useEffect(() => {
    if (sp.get("new") === "1") {
      setCreating(true);
      const next = new URLSearchParams(sp);
      next.delete("new");
      setSp(next, { replace: true });
    }
  }, [sp, setSp]);

  return (
    <div>
      {seller && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 13px", marginBottom: 10, border: "1px solid var(--green)", borderRadius: 10, background: "rgba(106,168,79,0.07)", fontSize: 13, color: "var(--soil)" }}>
          Showing listings by <strong>{sellerName || "this member"}</strong>
          <button onClick={() => navigate("/home/marketplace")} style={{ marginLeft: "auto", border: "1px solid var(--line)", background: "var(--paper)", borderRadius: 999, padding: "4px 12px", fontSize: 12, cursor: "pointer" }}>Show all</button>
        </div>
      )}
      {/* controls */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 200, border: "1px solid var(--line)", borderRadius: 999, padding: "7px 12px", background: "var(--paper)" }}>
          <Search size={14} style={{ color: "var(--muted)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the marketplace…" style={{ border: "none", outline: "none", flex: 1, fontSize: 13.5, background: "transparent" }} />
        </div>
        <select value={island} onChange={(e) => setIsland(e.target.value)} style={{ ...inp, width: "auto", borderRadius: 999 }}>
          <option value="">All islands</option>
          {ISLANDS.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <button onClick={() => setView(view === "mine" ? "browse" : "mine")} style={{ padding: "8px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer", minHeight: 38, border: `1px solid ${view === "mine" ? "var(--green-dk)" : "var(--line)"}`, background: view === "mine" ? "var(--green)" : "var(--paper)", color: view === "mine" ? "var(--paper)" : "var(--soil)" }}>My listings</button>
        <button onClick={() => setView(view === "saved" ? "browse" : "saved")} style={{ padding: "8px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer", minHeight: 38, border: `1px solid ${view === "saved" ? "var(--green-dk)" : "var(--line)"}`, background: view === "saved" ? "var(--green)" : "var(--paper)", color: view === "saved" ? "var(--paper)" : "var(--soil)" }}>Saved</button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {CATS.map(([v, l]) => (
          <button key={v} onClick={() => setCat(v)} style={{ padding: "7px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer", minHeight: 38, border: `1px solid ${cat === v ? "var(--green-dk)" : "var(--line)"}`, background: cat === v ? "var(--green)" : "var(--paper)", color: cat === v ? "var(--paper)" : "var(--soil)" }}>{l}</button>
        ))}
      </div>

      {/* grid */}
      {items == null ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>
        : items.length === 0 ? (
          <div className="card" style={{ padding: 24, color: "var(--muted)", textAlign: "center" }}>
            {view === "mine" ? "You haven't listed anything yet — tap New listing to sell or post a need."
              : view === "saved" ? "No saved listings yet — tap Save on any listing."
              : cat === "WANTED" ? "No buyer requests yet — buyers can post what they need with New listing → Wanted."
              : "Nothing here yet — be the first to list with the New listing button."}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
            {items.map((l) => (
              <button key={l.listing_id} onClick={() => setOpen(l)} style={{ textAlign: "left", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", cursor: "pointer", padding: 0, position: "relative" }}>
                {(l.photos || [])[0]
                  ? <img src={l.photos[0]} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }} />
                  : <div style={{ width: "100%", aspectRatio: "1", background: "rgba(106,168,79,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--green-dk)" }}><Tag size={26} /></div>}
                {l.sold_at && <span style={{ position: "absolute", top: 8, left: 8, background: "var(--ink)", color: "var(--paper)", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6 }}>SOLD</span>}
                {l.category === "WANTED" && !l.sold_at && <span style={{ position: "absolute", top: 8, left: 8, background: "var(--amber)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6 }}>WANTED</span>}
                <div style={{ padding: "8px 10px 10px" }}>
                  <div style={{ fontWeight: 700, color: "var(--soil)", fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.listing_title}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--green-dk)" }}>{priceLine(l)}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: (CAT_CFG[l.category] || CAT_CFG.PRODUCE).accent, textTransform: "uppercase", letterSpacing: 0.4 }}>{CAT_LABEL[l.category] || l.category}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <Avatar src={l.seller_avatar} name={l.seller_name} size={16} fontScale={0.45} />
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.seller_name || "Seller"}</span>
                    {l.seller_verified && <BadgeCheck size={11} style={{ color: "var(--green-dk)", flexShrink: 0 }} />}
                    {l.island && <span style={{ flexShrink: 0 }}>· {l.island}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

      {open && <ListingDetail l={open} onClose={() => setOpen(null)} onChanged={load} />}
      {creating && <NewListingModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); setView("mine"); load(); }} />}
    </div>
  );
}

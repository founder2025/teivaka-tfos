import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, ChevronDown, ChevronLeft, Sprout, PawPrint, Banknote,
  // event-card icons (cover every verb icon across the 4 configs)
  Eye, Droplet, Scissors, ShieldCheck, Warehouse, Coins, Leaf,
  CalendarPlus, CalendarCheck, Egg, Wheat, Bird, Stethoscope, Scale, Home,
  AlertTriangle, PlusCircle, Skull, HandCoins, Syringe, Milk, Repeat,
  Wallet, UserCheck,
} from "lucide-react";
import Modal from "../ui/Modal";
import CaptureEngine from "../../capture/CaptureEngine";
import { buildCatalog, configForVertical, DOORS, essentialsCards } from "../../capture/catalog";
import { useFormModal } from "../../context/FormModalContext";

/**
 * LogSheet — the (+) FAB, restructured around real-world usage (2026-06-24,
 * Operator-directed; intentionally NOT the prototype's flat catalog).
 *
 * Level 1 = ① Quick-Log essentials (one tap → the 80% a farmer logs daily),
 * ② three doors — Plant-based · Animal-based · Whole-farm, ③ search (jump anywhere).
 * Pick a door → its events in natural farming-flow order as cards → tap → the form
 * (CaptureEngine, rendered as a card). Enterprise-scoped (farm_active_groups); a door
 * the farm doesn't run is hidden; whole-farm always shown; fail-open when unknown.
 */

const DOOR_ICONS = { Sprout, PawPrint, Banknote };
const ICONS = {
  Eye, Droplet, Scissors, ShieldCheck, Sprout, Warehouse, Coins, Leaf,
  CalendarPlus, CalendarCheck, Egg, Wheat, Bird, Stethoscope, Scale, Home,
  AlertTriangle, PlusCircle, Skull, HandCoins, Syringe, Milk, Repeat,
  Wallet, Banknote, UserCheck, PawPrint,
};
const cardIcon = (name) => { const I = ICONS[name] || Leaf; return <I size={14} />; };

// (+) route cards that have a registered form-modal open as a card over the page.
const ROUTE_TO_FORMKEY = {
  "/farm/cycles/new": "cycle_new",
  "/farm/nursery/new": "nursery_new",
  "/farm/harvest/new": "harvest_new",
  "/farm/poultry/flocks/new": "flock_new",
  "/farm/labor": "labor",
};

export default function LogSheet({ isOpen, onClose, target = null }) {
  const navigate = useNavigate();
  const { openFormModal } = useFormModal();
  const [activeGroups, setActiveGroups] = useState(null);   // null => unknown => fail-open
  const [door, setDoor] = useState(null);                   // PLANT | ANIMAL | WHOLE | null
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const [formEntry, setFormEntry] = useState(null);         // { vertical, eventType }

  // Reset on open; honour a deep-link target.
  useEffect(() => {
    if (!isOpen) return;
    setDoor(null);
    setQuery("");
    setExpanded(new Set());
    if (target?.eventType) setFormEntry({ vertical: target.vertical, eventType: target.eventType });
    else setFormEntry(null);
  }, [isOpen, target]);

  // Enterprise scope (best-effort; fail-open).
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const token = localStorage.getItem("tfos_access_token") || sessionStorage.getItem("tfos_access_token");
    const authHdrs = { Authorization: `Bearer ${token}` };
    (async () => {
      try {
        let farmId = null;
        const fr = await fetch("/api/v1/farms", { headers: authHdrs });
        if (fr.ok) {
          const fb = await fr.json();
          const farms = fb?.data?.farms || fb?.data || fb?.farms || [];
          if (Array.isArray(farms) && farms.length > 0) farmId = farms[0].farm_id;
        }
        const url = farmId ? `/api/v1/event-catalog?farm_id=${encodeURIComponent(farmId)}` : "/api/v1/event-catalog";
        const res = await fetch(url, { headers: authHdrs });
        if (res.ok && !cancelled) {
          const body = await res.json();
          const groups = body?.meta?.active_groups ?? null;
          setActiveGroups(Array.isArray(groups) ? groups : null);
        }
      } catch { /* fail-open */ }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  const sections = useMemo(() => buildCatalog(activeGroups), [activeGroups]);
  const essentials = useMemo(() => essentialsCards(activeGroups), [activeGroups]);
  const doors = useMemo(
    () => DOORS.filter((d) => d.key === "WHOLE" || sections.some((s) => d.verticals.includes(s.vertical))),
    [sections],
  );

  const q = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!q) return [];
    const out = [];
    for (const sec of sections) {
      for (const c of sec.cards) {
        if (
          c.label.toLowerCase().includes(q) ||
          (c.desc || "").toLowerCase().includes(q) ||
          (c.eventType || "").toLowerCase().includes(q) ||
          sec.title.toLowerCase().includes(q)
        ) out.push({ ...c, vertical: sec.vertical });
      }
    }
    return out;
  }, [sections, q]);

  const doorSections = useMemo(() => {
    if (!door) return [];
    const d = DOORS.find((x) => x.key === door);
    return sections.filter((s) => d?.verticals.includes(s.vertical));
  }, [sections, door]);

  function toggleGroup(id) {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function pickCard(vertical, card) {
    if (card.route) {
      const formKey = ROUTE_TO_FORMKEY[card.route];
      onClose();
      if (formKey) openFormModal(formKey); else navigate(card.route);
      return;
    }
    setFormEntry({ vertical, eventType: card.eventType });
  }

  const headerTitle = formEntry
    ? "Log activity"
    : door
      ? (DOORS.find((d) => d.key === door)?.label || "Log")
      : "What do you want to log?";

  // ── shared card renderers (reuse the app's .tfp catalog styling) ──
  const Card = ({ vertical, card }) => (
    <div className="catalog-type-card" onClick={() => pickCard(vertical, card)}>
      <div className="catalog-type-head">
        <div className="catalog-type-icon">{cardIcon(card.icon)}</div>
        <div className="catalog-type-label">{card.label}</div>
      </div>
      {card.desc ? <div className="catalog-type-desc">{card.desc}</div> : null}
    </div>
  );

  const SectionAccordion = ({ sec }) => {
    const open = !!q || expanded.has(sec.id);
    return (
      <div className="catalog-group-section">
        <div className="catalog-group-head" onClick={() => toggleGroup(sec.id)}>
          <div>
            <div className="catalog-group-title">{sec.title}
              <span className="catalog-group-count" style={{ marginLeft: 8 }}>{sec.cards.length}</span>
            </div>
            <div className="catalog-group-sub">{sec.sub}</div>
          </div>
          <span style={{ color: "var(--muted)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
            <ChevronDown size={14} />
          </span>
        </div>
        <div className={"catalog-group-body" + (open ? " show" : "")}>
          <div className="catalog-cards-grid">
            {sec.cards.map((c) => <Card key={c.key} vertical={sec.vertical} card={c} />)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={headerTitle} size="lg">
      {formEntry ? (
        <CaptureEngine
          config={configForVertical(formEntry.vertical)}
          preselect={{ eventType: formEntry.eventType }}
          onBack={() => setFormEntry(null)}
          onDone={onClose}
        />
      ) : (
        <div className="tfp">
          <div className="catalog-wrap">
            {/* search — always available, jumps anywhere */}
            <div className="catalog-controls">
              <div className="catalog-search" style={{ width: "100%" }}>
                <span className="catalog-search-icon"><Search size={14} /></span>
                <input type="search" placeholder="Search events…" value={query}
                  onChange={(e) => setQuery(e.target.value)} autoFocus />
              </div>
            </div>

            {q ? (
              /* ── search results (flat, across everything) ── */
              searchResults.length === 0 ? (
                <div style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>No events match your search.</div>
              ) : (
                <div className="catalog-cards-grid">
                  {searchResults.map((c) => <Card key={c.key} vertical={c.vertical} card={c} />)}
                </div>
              )
            ) : door ? (
              /* ── level 2: a door's events in natural farming-flow order ── */
              <>
                <button type="button" onClick={() => setDoor(null)}
                  className="inline-flex items-center gap-1 text-sm mb-2" style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }}>
                  <ChevronLeft size={16} /> All
                </button>
                {doorSections.map((sec) => <SectionAccordion key={sec.id} sec={sec} />)}
              </>
            ) : (
              /* ── level 1: quick-log essentials + the three doors ── */
              <>
                {essentials.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div className="catalog-group-sub" style={{ marginBottom: 8 }}>Quick log · tap to record</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {essentials.map((c) => (
                        <button key={c.key} type="button" onClick={() => pickCard(c.vertical, c)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 999,
                            border: "1px solid var(--line)", background: "var(--paper)", color: "var(--soil)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                          {cardIcon(c.icon)}{c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="catalog-group-sub" style={{ marginBottom: 8 }}>Or pick an area</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                  {doors.map((d) => {
                    const I = DOOR_ICONS[d.icon] || Sprout;
                    return (
                      <button key={d.key} type="button" onClick={() => { setExpanded(new Set()); setDoor(d.key); }}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                          padding: 18, minHeight: 116, borderRadius: 14, border: "1px solid var(--line)", background: "#fff", cursor: "pointer" }}>
                        <I size={30} strokeWidth={1.6} style={{ color: "var(--green-dk)" }} />
                        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--soil)" }}>{d.label}</span>
                        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{d.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, ChevronDown,
  // config icon names (must cover every verb icon across the 4 configs)
  Eye, Droplet, Scissors, ShieldCheck, Sprout, Warehouse, Coins, Leaf,
  CalendarPlus, CalendarCheck, Egg, Wheat, Bird, Stethoscope, Scale, Home,
  AlertTriangle, PlusCircle, Skull, HandCoins, Syringe, Milk, Repeat,
  Wallet, Banknote, UserCheck,
} from "lucide-react";
import Modal from "../ui/Modal";
import CaptureEngine from "../../capture/CaptureEngine";
import { buildCatalog, configForVertical } from "../../capture/catalog";
import { useFormModal } from "../../context/FormModalContext";

// (+) route cards that have a registered form-modal open as a card over the page
// instead of navigating to a full page. Routes with no entry (e.g. a list page like
// "Close a crop" → /farm/cycles) fall through to plain navigation.
const ROUTE_TO_FORMKEY = {
  "/farm/cycles/new": "cycle_new",
  "/farm/nursery/new": "nursery_new",
  "/farm/harvest/new": "harvest_new",
  "/farm/poultry/flocks/new": "flock_new",
  "/farm/labor": "labor",
};

/**
 * LogSheet — the Universal (+) catalog (prototype-parity rebuild 2026-06-24).
 *
 * Pixel-exact to the prototype's `openCatalogOverlay`: ONE searchable accordion of
 * event-type cards grouped by activity, with a "condensed essentials" toggle. Reuses
 * the prototype's own `.tfp .catalog-*` stylesheet (scoped in prototype.css). Tap a
 * card → the existing CaptureEngine form for that event_type opens inline (the rich,
 * backend-wired, WHD-enforced form is unchanged). `route` cards hand off to their page.
 *
 * Replaces the old vertical → sub-flow → verb → branch → form nesting (4-5 taps) with
 * search/scan → card → form (2 taps). Catalog is built from the four configs and gated
 * by farm_active_groups (enterprise scope; whole-farm money always shown; fail-open).
 */

const ICONS = {
  Eye, Droplet, Scissors, ShieldCheck, Sprout, Warehouse, Coins, Leaf,
  CalendarPlus, CalendarCheck, Egg, Wheat, Bird, Stethoscope, Scale, Home,
  AlertTriangle, PlusCircle, Skull, HandCoins, Syringe, Milk, Repeat,
  Wallet, Banknote, UserCheck,
};

function svgIcon(name) {
  const I = ICONS[name] || Leaf;
  return <I size={14} />;
}

export default function LogSheet({ isOpen, onClose, target = null }) {
  const navigate = useNavigate();
  const { openFormModal } = useFormModal();
  const [activeGroups, setActiveGroups] = useState(null);   // null => unknown => fail-open
  const [query, setQuery] = useState("");
  const [condensed, setCondensed] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  // formEntry: when set, the catalog hands off to the inline CaptureEngine form.
  // { vertical, eventType }.
  const [formEntry, setFormEntry] = useState(null);

  // Reset transient UI each time the sheet opens; honour a deep-link target.
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setCondensed(false);
    setExpanded(new Set());
    if (target?.eventType) setFormEntry({ vertical: target.vertical, eventType: target.eventType });
    else setFormEntry(null);
  }, [isOpen, target]);

  // Enterprise scope: fetch the farm's active groups so the catalog only shows the
  // verticals this farm runs. Best-effort — any failure leaves activeGroups null
  // (fail-open: every vertical shown).
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

  // Apply search + condensed filters, computing which sections/cards to show and which
  // are force-expanded (a query or condensed mode expands everything that matches).
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return sections
      .map((sec) => {
        let cards = sec.cards;
        if (condensed) cards = cards.filter((c) => c.essential);
        if (q) {
          cards = cards.filter(
            (c) =>
              c.label.toLowerCase().includes(q) ||
              (c.desc || "").toLowerCase().includes(q) ||
              (c.eventType || "").toLowerCase().includes(q) ||
              sec.title.toLowerCase().includes(q),
          );
        }
        return { ...sec, cards };
      })
      .filter((sec) => sec.cards.length > 0);
  }, [sections, condensed, q]);

  const forceOpen = !!q || condensed;

  function toggleGroup(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function pickCard(vertical, card) {
    if (card.route) {
      const formKey = ROUTE_TO_FORMKEY[card.route];
      onClose();                                  // close the (+) sheet first
      if (formKey) openFormModal(formKey);        // open the form as a card over the page
      else navigate(card.route);                  // list pages etc. still navigate
      return;
    }
    setFormEntry({ vertical, eventType: card.eventType });
  }

  const headerTitle = formEntry ? "Log activity" : "Pick an event to log";

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
            <div className="catalog-controls">
              <div className="catalog-search">
                <span className="catalog-search-icon"><Search size={14} /></span>
                <input
                  type="search"
                  placeholder="Search events…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <label className="catalog-solo-toggle">
                <input type="checkbox" checked={condensed} onChange={() => setCondensed((v) => !v)} />
                Show condensed (essentials)
              </label>
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
                <div style={{ fontSize: 14, marginBottom: 6 }}>No events match your search.</div>
                <div style={{ fontSize: 12.5 }}>Try different words or clear the search.</div>
              </div>
            ) : (
              filtered.map((sec) => {
                const open = forceOpen || expanded.has(sec.id);
                return (
                  <div className="catalog-group-section" key={sec.id}>
                    <div className="catalog-group-head" onClick={() => toggleGroup(sec.id)}>
                      <div>
                        <div className="catalog-group-title">
                          {sec.title}
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
                        {sec.cards.map((c) => (
                          <div className="catalog-type-card" key={c.key} onClick={() => pickCard(sec.vertical, c)}>
                            <div className="catalog-type-head">
                              <div className="catalog-type-icon">{svgIcon(c.icon)}</div>
                              <div className="catalog-type-label">{c.label}</div>
                            </div>
                            {c.desc ? <div className="catalog-type-desc">{c.desc}</div> : null}
                            {c.essential ? (
                              <div className="catalog-type-meta">
                                <span className="catalog-backdate-badge" style={{ background: "rgba(106,168,79,0.18)", color: "var(--green-dk)" }}>Essential</span>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

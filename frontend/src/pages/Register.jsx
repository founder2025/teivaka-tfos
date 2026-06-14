/**
 * Register.jsx — Teivaka Agriculture Ecosystem onboarding gateway.
 *
 * Front-door flow (themed to the post-login .tfp system, flat lucide icons):
 *   Step 1 — Account-type switcher: Individual / Personal vs Company / Agribusiness.
 *   Step 2 — 3x3 ecosystem-profile grid (9 cards); cards 5 & 9 fan out into a
 *            Stage-2 governance/capital dropdown (12-tier account_type).
 *   Step 3 — Conditional fields per account kind + a data-driven geographic
 *            cascade (Province -> District -> Tikina; levels render only when the
 *            geo dataset has them). Password spine retained; lightweight 18+ check
 *            (year-of-birth) replaces the heavy calendar.
 *
 * API: POST /api/v1/auth/register ; GET /api/v1/geo/regions
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Sprout, ShoppingCart, Factory, Truck, Landmark, Building2,
  Ship, Package, Users, Eye, EyeOff,
} from "lucide-react";

// In-app (.tfp) palette.
const T = {
  cream: "var(--cream)", cream2: "var(--line)", paper: "var(--paper)",
  green: "var(--green)", greenDk: "var(--green-dk)", greenTint: "var(--green-tint)",
  soil: "var(--soil)", soil2: "#7A5C4E", amber: "var(--amber)",
  line: "var(--line)", ink: "#2A2118", muted: "var(--muted)", red: "var(--red)",
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const COUNTRY_CODES = [
  { iso: "FJ", flag: "🇫🇯", code: "+679", name: "Fiji" },
  { iso: "WS", flag: "🇼🇸", code: "+685", name: "Samoa" },
  { iso: "TO", flag: "🇹🇴", code: "+676", name: "Tonga" },
  { iso: "VU", flag: "🇻🇺", code: "+678", name: "Vanuatu" },
  { iso: "SB", flag: "🇸🇧", code: "+677", name: "Solomon Islands" },
  { iso: "PG", flag: "🇵🇬", code: "+675", name: "Papua New Guinea" },
  { iso: "KI", flag: "🇰🇮", code: "+686", name: "Kiribati" },
  { iso: "NZ", flag: "🇳🇿", code: "+64", name: "New Zealand" },
  { iso: "AU", flag: "🇦🇺", code: "+61", name: "Australia" },
  { iso: "US", flag: "🇺🇸", code: "+1", name: "United States" },
  { iso: "GB", flag: "🇬🇧", code: "+44", name: "United Kingdom" },
];

// Generalized registration grid — 7 plain-language categories everyone fits into,
// + "Other → describe". Mirrors backend app/core/account_types.GENERAL_CATEGORIES.
// Each maps to one canonical account_type key (all already valid; no schema churn).
// Finer detail is captured by the free-text "What do you do?" field.
const PROFILES = [
  { key: "PRIMARY_PRODUCER", label: "Farmer / Producer", Icon: Sprout, value: "PRIMARY_PRODUCER",
    sub: "I grow crops, raise livestock or poultry, fish, keep bees, run a nursery or hatchery." },
  { key: "COMMERCIAL_BUYER", label: "Buyer / Trader", Icon: ShoppingCart, value: "COMMERCIAL_BUYER",
    sub: "I buy, sell or move produce — buyer, offtaker, aggregator, co-op, market vendor, exporter or importer." },
  { key: "AGRI_INPUT_SUPPLIER", label: "Supplier", Icon: Factory, value: "AGRI_INPUT_SUPPLIER",
    sub: "I supply inputs or products — seeds, fertiliser, feed, tools, an agri-shop, processor or pack-house." },
  { key: "LOGISTICS_OPERATOR", label: "Service Provider", Icon: Truck, value: "LOGISTICS_OPERATOR",
    sub: "I provide a service — vet, irrigation, transport, machinery hire, contractor, agronomist, labour or repairs." },
  { key: "AGRIBUSINESS_ENTERPRISE", label: "Agribusiness / Company", Icon: Building2, value: "AGRIBUSINESS_ENTERPRISE",
    sub: "I run a general agri company or a mixed operation spanning several of these." },
  { key: "BANKER_COMMERCIAL", label: "Finance / Funder", Icon: Landmark, value: "BANKER_COMMERCIAL",
    sub: "I fund, lend or insure — bank, microfinance, donor, development fund, NGO or insurer." },
  { key: "GOVERNMENT_REGULATOR", label: "Institution / Government", Icon: Users, value: "GOVERNMENT_REGULATOR",
    sub: "I regulate, certify, research, train or represent — govt, certifier, research/extension, association or landowning unit." },
  { key: "OTHER", label: "Other", Icon: Package, value: "AGRIBUSINESS_ENTERPRISE", other: true,
    sub: "Something else — tell us what you do below and we'll place you right." },
];

const PROFILE_LABELS = {};
PROFILES.forEach((p) => {
  if (p.value) PROFILE_LABELS[p.value] = p.label;
  if (p.dropdown) p.dropdown.options.forEach((o) => { PROFILE_LABELS[o.value] = o.label; });
});

const HIGH_TRUST = new Set([
  "BANKER_COMMERCIAL", "DONOR_DEVELOPMENT", "COMMODITY_EXPORTER", "TRADE_IMPORTER",
  "AGRIBUSINESS_ENTERPRISE", "GOVERNMENT_REGULATOR", "QUALITY_AUDITOR", "MATAQALI_TRUSTEE",
]);

// CFO cost-routing mirror — the channel a profile verifies on by default
// (backend app/core/verification_routing.py is the source of truth).
const EMAIL_DEFAULT_PROFILES = new Set([
  "BANKER_COMMERCIAL", "DONOR_DEVELOPMENT", "COMMODITY_EXPORTER", "TRADE_IMPORTER",
  "AGRIBUSINESS_ENTERPRISE", "GOVERNMENT_REGULATOR", "QUALITY_AUDITOR",
  "MATAQALI_TRUSTEE", "COMMERCIAL_BUYER",
]);
function defaultChannel(t) { return EMAIL_DEFAULT_PROFILES.has(t) ? "email" : "whatsapp"; }

const PRIVACY_POLICY_VERSION = "1.0";
const CURRENT_YEAR = new Date().getFullYear();
const BIRTH_YEARS = [];
for (let y = CURRENT_YEAR - 18; y >= 1900; y--) BIRTH_YEARS.push(y);

function extractErrorMessage(detail) {
  if (!detail) return "Registration failed. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msgs = detail.map((d) => (typeof d === "string" ? d : d?.msg)).filter(Boolean);
    return msgs.length ? msgs.join(" · ") : "Please check the highlighted fields and try again.";
  }
  if (typeof detail === "object") return detail.msg || detail.message || "Registration failed. Please try again.";
  return String(detail);
}

function passwordComplexityError(pw) {
  if (!pw) return "Password is required";
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Password must contain an uppercase letter";
  if (!/\d/.test(pw)) return "Password must contain a number";
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(pw))
    return "Password must contain a special character";
  return null;
}

function passwordStrength(pw) {
  let s = 0;
  if (!pw) return 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

function Field({ label, id, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold mb-1.5" style={{ color: T.soil }}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs mt-1" style={{ color: T.muted }}>{hint}</p>}
      {error && <p className="text-xs mt-1" style={{ color: T.red }} role="alert">⚠ {error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Geographic cascade — data-driven. Renders Province now; District/Tikina light
// up automatically once shared.geo_regions has them (no empty/dead pickers).
// ---------------------------------------------------------------------------
// Fiji's 14 provinces (yasana) — ids match shared.geo_regions. Built-in so the
// region dropdown never depends on a backend round-trip / seed state.
const FIJI_PROVINCES = [
  { region_id: "FJI-BA", name: "Ba" },
  { region_id: "FJI-BUA", name: "Bua" },
  { region_id: "FJI-CAK", name: "Cakaudrove" },
  { region_id: "FJI-KAD", name: "Kadavu" },
  { region_id: "FJI-LAU", name: "Lau" },
  { region_id: "FJI-LOM", name: "Lomaiviti" },
  { region_id: "FJI-MAC", name: "Macuata" },
  { region_id: "FJI-NAD", name: "Nadroga-Navosa" },
  { region_id: "FJI-NAI", name: "Naitasiri" },
  { region_id: "FJI-NAM", name: "Namosi" },
  { region_id: "FJI-RA", name: "Ra" },
  { region_id: "FJI-REW", name: "Rewa" },
  { region_id: "FJI-SER", name: "Serua" },
  { region_id: "FJI-TAI", name: "Tailevu" },
];

function RegionCascade({ label, onChange }) {
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [tikinas, setTikinas] = useState([]);
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [tikina, setTikina] = useState("");

  useEffect(() => {
    let cancelled = false;
    // Built-in Fiji provinces — the dropdown always loads, no backend dependency.
    // Canonical ids match shared.geo_regions; the API upgrades the list if it
    // returns richer data (e.g. once districts are loaded).
    if (!cancelled) setProvinces(FIJI_PROVINCES);
    fetch("/api/v1/geo/regions?level=PROVINCE")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => { if (!cancelled && Array.isArray(j.data) && j.data.length) setProvinces(j.data); })
      .catch(() => { /* keep the built-in list */ });
    return () => { cancelled = true; };
  }, []);

  function loadChildren(parentId) {
    return fetch(`/api/v1/geo/regions?parent_id=${encodeURIComponent(parentId)}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => j.data || [])
      .catch(() => []);
  }

  async function pickProvince(id) {
    setProvince(id); setDistrict(""); setTikina(""); setDistricts([]); setTikinas([]);
    onChange(id || null);
    if (id) setDistricts(await loadChildren(id));
  }
  async function pickDistrict(id) {
    setDistrict(id); setTikina(""); setTikinas([]);
    onChange(id || province || null);
    if (id) setTikinas(await loadChildren(id));
  }
  function pickTikina(id) {
    setTikina(id);
    onChange(id || district || province || null);
  }

  const selectStyle = {
    width: "100%", border: `1px solid ${T.line}`, borderRadius: 12, padding: "12px 14px",
    fontSize: 14, outline: "none", fontFamily: FONT, color: T.ink, background: T.paper,
  };

  return (
    <Field label={label} id="region">
      <select value={province} onChange={(e) => pickProvince(e.target.value)} style={selectStyle}>
        <option value="">— Select province —</option>
        {provinces.map((p) => <option key={p.region_id} value={p.region_id}>{p.name}</option>)}
      </select>
      {districts.length > 0 && (
        <select value={district} onChange={(e) => pickDistrict(e.target.value)} style={{ ...selectStyle, marginTop: 8 }}>
          <option value="">— Select district —</option>
          {districts.map((d) => <option key={d.region_id} value={d.region_id}>{d.name}</option>)}
        </select>
      )}
      {tikinas.length > 0 && (
        <select value={tikina} onChange={(e) => pickTikina(e.target.value)} style={{ ...selectStyle, marginTop: 8 }}>
          <option value="">— Select tikina —</option>
          {tikinas.map((t) => <option key={t.region_id} value={t.region_id}>{t.name}</option>)}
        </select>
      )}
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Registration Form
// ---------------------------------------------------------------------------

function RegistrationForm({ onSuccess }) {
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", password: "",
    phone_number: "", whatsapp_number: "",
    country: "FJ", referral_source: "", referral_code: "",
  });

  // Step 1 — account-type switcher.
  const [accountKind, setAccountKind] = useState("individual"); // "individual" | "company"
  const [businessName, setBusinessName] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [regionId, setRegionId] = useState(null);
  const [birthYear, setBirthYear] = useState("");
  const [preferredChannel, setPreferredChannel] = useState(""); // "" = use CFO default
  const isCompany = accountKind === "company";

  // Step 2 — ecosystem-profile selection.
  const [selectedKey, setSelectedKey] = useState("PRIMARY_PRODUCER");
  const [subType, setSubType] = useState("");
  const [specialty, setSpecialty] = useState("");
  const selectedProfile = PROFILES.find((p) => p.key === selectedKey) || PROFILES[0];
  const resolvedType = selectedProfile.dropdown ? (subType || null) : selectedProfile.value;
  const isResolved = !!resolvedType;
  const effectiveChannel = preferredChannel || (resolvedType ? defaultChannel(resolvedType) : "email");

  const [policyAccepted, setPolicyAccepted] = useState(false);

  useEffect(() => {
    try {
      const ref = sessionStorage.getItem("teivaka_ref");
      if (ref) setForm((f) => (f.referral_code ? f : { ...f, referral_code: ref }));
    } catch { /* ignore */ }
  }, []);

  const [showPassword, setShowPassword] = useState(false);
  const [confirmPw, setConfirmPw] = useState("");
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [sameAsPhone, setSameAsPhone] = useState(true);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("FJ");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [phoneDropdownOpen, setPhoneDropdownOpen] = useState(false);
  const [phoneSearch, setPhoneSearch] = useState("");
  const phoneDropdownRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (phoneDropdownRef.current && !phoneDropdownRef.current.contains(e.target)) {
        setPhoneDropdownOpen(false);
        setPhoneSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedCountry = COUNTRY_CODES.find(c => c.iso === phoneCountry) || COUNTRY_CODES[0];
  const filteredCountries = phoneSearch
    ? COUNTRY_CODES.filter(c => c.name.toLowerCase().includes(phoneSearch.toLowerCase()) || c.code.includes(phoneSearch))
    : COUNTRY_CODES;
  const fullPhone = phoneLocal.trim() ? `${selectedCountry.code}${phoneLocal.trim().replace(/\s|-/g, "")}` : null;

  const pwStrength = passwordStrength(form.password);
  const STRENGTH_LABEL = ["", "Weak", "Fair", "Good", "Strong"][pwStrength];
  const STRENGTH_COLOR = [T.line, "#C0392B", T.amber, "#7CA85A", T.green][pwStrength];

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: "" }));
    setServerError("");
  }
  function clearErr(k) { setErrors((e) => ({ ...e, [k]: "" })); setServerError(""); }

  function selectProfile(key) {
    setSelectedKey(key); setSubType("");
    clearErr("account_type");
  }
  function selectSubType(value) { setSubType(value); clearErr("account_type"); }

  function validate() {
    const e = {};
    if (!isResolved) {
      e.account_type = selectedProfile.dropdown
        ? "Please select your profile from the dropdown to continue"
        : "Please choose who you are";
    }
    if (selectedProfile.other && !specialty.trim()) e.specialty = "Please tell us what you do";
    if (isCompany) {
      if (businessName.trim().length < 2) e.business_name = "Registered business name is required";
      if (operatorName.trim().length < 2) e.operator_name = "Authorized operator name is required";
    } else {
      if (!form.first_name.trim()) e.first_name = "First name is required";
      if (!form.last_name.trim())  e.last_name  = "Last name is required";
    }
    if (!form.email.trim())      e.email      = "Email address is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email address";
    const pwErr = passwordComplexityError(form.password);
    if (pwErr) e.password = pwErr;
    if (confirmPw !== form.password) e.confirmPw = "Passwords do not match";
    if (fullPhone && !/^\+[1-9]\d{6,14}$/.test(fullPhone)) e.phone_number = "Enter a valid phone number";
    if ((effectiveChannel === "whatsapp" || effectiveChannel === "sms") && !fullPhone)
      e.phone_number = "A mobile number is required for WhatsApp / SMS verification";
    if (!birthYear) e.birth_year = "Please confirm your year of birth (18+)";
    if (!policyAccepted) e.policy = "Please accept the Privacy Policy and Terms of Service to continue";
    return e;
  }

  function deriveNames() {
    if (!isCompany) return { first_name: form.first_name.trim(), last_name: form.last_name.trim() };
    const parts = operatorName.trim().split(/\s+/).filter(Boolean);
    const first = parts[0] || businessName.trim();
    const last = parts.slice(1).join(" ") || parts[0] || "Operator";
    return { first_name: first, last_name: last };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      // surface the problem — the button is at the bottom of a long form, so
      // scroll the user to the first issue instead of "nothing happening".
      setServerError("Please fix the highlighted fields above to continue.");
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* ignore */ }
      return;
    }
    setLoading(true);
    setServerError("");

    const phoneOrNull = fullPhone;
    const wa = sameAsPhone ? phoneOrNull : ((form.whatsapp_number || "").trim() || null);
    let anonymousId = null;
    try { anonymousId = localStorage.getItem("teivaka_anon_id"); } catch { /* ignore */ }
    const { first_name, last_name } = deriveNames();
    const payload = {
      ...form,
      first_name, last_name,
      account_type: resolvedType,
      is_company: isCompany,
      business_name: isCompany ? businessName.trim() : null,
      operator_name: isCompany ? operatorName.trim() : null,
      // region_id intentionally NOT sent at signup — it is a FK to
      // shared.geo_regions and an unseeded id was 500-ing registration. Region
      // is captured on the profile instead, so signup can never fail on it.
      region_id: null,
      preferred_verify_channel: effectiveChannel,
      date_of_birth: `${birthYear}-01-01`,
      phone_number: phoneOrNull, whatsapp_number: wa,
      referral_code: form.referral_code.trim() || null,
      referral_source: form.referral_source || null,
      anonymous_id: anonymousId, privacy_accepted: true,
      privacy_policy_version: PRIVACY_POLICY_VERSION,
    };

    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerError(extractErrorMessage(data.detail) || `Couldn't create your account (error ${res.status}). Please try again.`);
        try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* ignore */ }
        return;
      }
      localStorage.setItem("tfos_access_token", data.access_token);
      localStorage.setItem("tfos_refresh_token", data.refresh_token);
      // capture the free-text specialty (incl. "Other → describe") onto the new
      // profile — non-blocking; account creation already succeeded.
      if (specialty.trim()) {
        try {
          await fetch("/api/v1/me", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.access_token}` },
            body: JSON.stringify({ specialty: specialty.trim() }),
          });
        } catch { /* non-blocking */ }
      }
      onSuccess({ ...data, account_type: resolvedType });
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = (field) =>
    `w-full rounded-xl px-4 py-3 text-sm border bg-white focus:outline-none focus:ring-2 focus:ring-[var(--green)]/30 ${
      errors[field] ? "border-[var(--red)]" : "border-[var(--line)] focus:border-[var(--green)]"
    }`;
  const inputStyle = { fontFamily: FONT, color: T.ink };

  const kindBtn = (active) => ({
    flex: 1, padding: "12px", borderRadius: 12, border: `1px solid ${active ? T.green : T.line}`,
    background: active ? T.greenTint : T.paper, color: active ? T.greenDk : T.soil,
    fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: FONT,
  });

  return (
    <div className="min-h-screen flex flex-col" style={{ background: T.cream, fontFamily: FONT }}>
      <div className="text-center py-5" style={{ borderBottom: `1px solid ${T.line}` }}>
        <Link to="/" className="inline-flex items-center justify-center">
          <img src="/teivaka_logo.png" alt="Teivaka" style={{ height: 80, width: "auto", display: "block" }} />
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="rounded-2xl p-7" style={{ background: T.paper, border: `1px solid ${T.line}`, boxShadow: "0 2px 8px rgba(92,64,51,0.08)" }}>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold mb-1" style={{ color: T.soil }}>Join the Teivaka Agriculture Ecosystem</h1>
              <p className="text-sm" style={{ color: T.muted }}>Choose your account type and ecosystem profile</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {serverError && (
                <div className="px-4 py-3 rounded-xl text-sm flex gap-2" role="alert"
                  style={{ background: "#FBEAEA", border: `1px solid ${T.red}33`, color: T.red }}>
                  <span>⚠</span><span>{serverError}</span>
                </div>
              )}

              {/* Step 1 — account-type switcher */}
              <Field label="Account type" id="account_kind">
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" aria-pressed={!isCompany} style={kindBtn(!isCompany)}
                    onClick={() => setAccountKind("individual")}>Individual / Personal</button>
                  <button type="button" aria-pressed={isCompany} style={kindBtn(isCompany)}
                    onClick={() => setAccountKind("company")}>Company / Agribusiness</button>
                </div>
              </Field>

              {/* Step 2 — 3x3 ecosystem-profile grid */}
              <Field label="I am a…" id="account_type" error={errors.account_type}>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {PROFILES.map((p) => {
                    const selected = selectedKey === p.key;
                    const Icon = p.Icon;
                    return (
                      <button key={p.key} type="button" aria-pressed={selected} title={p.sub}
                        onClick={() => selectProfile(p.key)}
                        className="flex flex-col items-center justify-center text-center py-3 px-1 rounded-xl border text-[11px] leading-tight font-semibold transition-all min-h-[78px]"
                        style={{
                          borderColor: selected ? T.green : T.line,
                          background: selected ? T.greenTint : T.paper,
                          color: selected ? T.greenDk : T.soil,
                        }}>
                        <Icon size={22} strokeWidth={1.75} color={selected ? T.green : T.soil2} style={{ marginBottom: 5 }} />
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                {(() => { const SubIcon = selectedProfile.Icon; return (
                  <div className="mt-3 flex items-start gap-2.5 rounded-xl px-3.5 py-3"
                    style={{ background: T.greenTint, border: `1.5px solid ${T.green}` }}>
                    <SubIcon size={20} strokeWidth={2} color={T.greenDk} style={{ marginTop: 1, flexShrink: 0 }} />
                    <p className="text-sm font-semibold leading-snug" style={{ color: T.soil }}>{selectedProfile.sub}</p>
                  </div>
                ); })()}

                {/* What do you do? — free-text specialty (required for "Other") */}
                {isResolved && (
                  <div className="mt-3">
                    <label htmlFor="specialty" className="block text-sm font-semibold mb-1.5" style={{ color: T.soil }}>
                      {selectedProfile.other ? "Tell us what you do *" : "What do you do? (optional)"}
                    </label>
                    <input id="specialty" value={specialty} onChange={(e) => { setSpecialty(e.target.value); clearErr("specialty"); }}
                      placeholder="e.g. Veterinarian · Irrigation contractor · Co-op manager"
                      className={inputCls("specialty")} style={inputStyle} />
                    {errors.specialty && <p className="text-xs mt-1" style={{ color: "var(--red)" }}>{errors.specialty}</p>}
                  </div>
                )}

                {/* Step 3a — Stage-2 conditional dropdown (cards 5 & 9) */}
                {selectedProfile.dropdown && (
                  <div className="mt-3 p-3 rounded-xl" style={{ background: T.cream, border: `1px solid ${T.line}` }}>
                    <label htmlFor="profile_subtype" className="block text-sm font-semibold mb-1.5" style={{ color: T.soil }}>
                      {selectedProfile.dropdown.label}
                    </label>
                    <select id="profile_subtype" value={subType} onChange={(e) => selectSubType(e.target.value)}
                      className={inputCls("account_type")} style={inputStyle}>
                      <option value="">— Select —</option>
                      {selectedProfile.dropdown.options.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </Field>

              {/* Gate: rest of the form appears only once a profile resolves */}
              {!isResolved ? (
                <p className="text-sm text-center py-2" style={{ color: T.muted }}>
                  Choose your profile above to continue your registration.
                </p>
              ) : (
                <>
                  {/* Step 3b — conditional identity fields per account kind */}
                  {isCompany ? (
                    <>
                      <Field label="Registered business / trading name *" id="business_name" error={errors.business_name}>
                        <input id="business_name" type="text" value={businessName}
                          onChange={(e) => { setBusinessName(e.target.value); clearErr("business_name"); }}
                          placeholder="e.g. Save-A-Lot Produce Ltd" className={inputCls("business_name")} style={inputStyle} />
                      </Field>
                      <Field label="Authorized system operator name *" id="operator_name" error={errors.operator_name}
                        hint="The person who will manage this account">
                        <input id="operator_name" type="text" value={operatorName}
                          onChange={(e) => { setOperatorName(e.target.value); clearErr("operator_name"); }}
                          placeholder="e.g. Cody Viliami" className={inputCls("operator_name")} style={inputStyle} />
                      </Field>
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="First name *" id="first_name" error={errors.first_name}>
                        <input id="first_name" type="text" autoComplete="given-name" value={form.first_name}
                          onChange={(e) => update("first_name", e.target.value)} placeholder="e.g. Cody"
                          className={inputCls("first_name")} style={inputStyle} />
                      </Field>
                      <Field label="Last name *" id="last_name" error={errors.last_name}>
                        <input id="last_name" type="text" autoComplete="family-name" value={form.last_name}
                          onChange={(e) => update("last_name", e.target.value)} placeholder="e.g. Viliami"
                          className={inputCls("last_name")} style={inputStyle} />
                      </Field>
                    </div>
                  )}

                  {/* Geographic cascade (data-driven) */}
                  <RegionCascade
                    label={isCompany ? "Headquarters operating location" : "Geographic region"}
                    onChange={setRegionId}
                  />

                  {/* Email */}
                  <Field label="Email address *" id="email" error={errors.email}
                    hint="Use a permanent email — disposable addresses are not accepted">
                    <input id="email" type="email" autoComplete="email" value={form.email}
                      onChange={(e) => update("email", e.target.value.toLowerCase())} placeholder="you@example.com"
                      className={inputCls("email")} style={inputStyle} />
                  </Field>

                  {/* Password */}
                  <Field label="Password *" id="password" error={errors.password}>
                    <div className="relative">
                      <input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password"
                        value={form.password} onChange={(e) => update("password", e.target.value)}
                        placeholder="Min 8 chars — uppercase, number & symbol"
                        className={`${inputCls("password")} pr-11`} style={inputStyle} />
                      <button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: T.muted }}
                        aria-label={showPassword ? "Hide password" : "Show password"}>
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {form.password && (
                      <div className="mt-1.5">
                        <div className="h-1 rounded-full overflow-hidden" style={{ background: T.line }}>
                          <div className="h-full transition-all" style={{ width: `${pwStrength * 25}%`, background: STRENGTH_COLOR }} />
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: STRENGTH_COLOR }}>{STRENGTH_LABEL}</p>
                      </div>
                    )}
                  </Field>

                  {/* Confirm Password */}
                  <Field label="Confirm password *" id="confirm_password" error={errors.confirmPw}>
                    <div className="relative">
                      <input id="confirm_password" type={showConfirmPw ? "text" : "password"} autoComplete="new-password"
                        value={confirmPw}
                        onChange={(e) => { setConfirmPw(e.target.value); setErrors((er) => ({ ...er, confirmPw: "" })); }}
                        placeholder="Re-enter your password" className={`${inputCls("confirmPw")} pr-11`} style={inputStyle} />
                      <button type="button" tabIndex={-1} onClick={() => setShowConfirmPw((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: T.muted }}
                        aria-label={showConfirmPw ? "Hide password" : "Show password"}>
                        {showConfirmPw ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </Field>

                  {/* Omnichannel verification channel (CFO cost-routed) */}
                  <Field label="Verify your registration via" id="verify_channel"
                    hint={effectiveChannel === "email"
                      ? "A verification link will be emailed to you."
                      : "A code will be sent to your mobile (a backup email is also sent)."}>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[["whatsapp", "WhatsApp"], ["sms", "SMS Text"], ["email", "Email"]].map(([v, lbl]) => (
                        <button type="button" key={v} aria-pressed={effectiveChannel === v}
                          onClick={() => setPreferredChannel(v)} style={kindBtn(effectiveChannel === v)}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </Field>

                  {/* Phone */}
                  <Field label={effectiveChannel === "email" ? "Phone number" : "Mobile number *"}
                    id="phone_number" error={errors.phone_number}
                    hint={effectiveChannel === "email"
                      ? "Optional — used for WhatsApp alerts and two-factor login."
                      : "Required for your chosen verification channel."}>
                    <div ref={phoneDropdownRef} style={{ position: "relative" }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" onClick={() => { setPhoneDropdownOpen(v => !v); setPhoneSearch(""); }}
                          style={{ flexShrink: 0, border: `1px solid ${T.line}`, borderRadius: 12, padding: "12px", background: T.paper, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", color: T.ink }}>
                          {selectedCountry.flag} {selectedCountry.code} ▾
                        </button>
                        <input type="tel" value={phoneLocal} onChange={e => setPhoneLocal(e.target.value)}
                          placeholder="9123456" autoComplete="tel-national"
                          style={{ flex: 1, border: `1px solid ${T.line}`, borderRadius: 12, padding: "12px 16px", fontSize: 15, outline: "none", fontFamily: FONT, color: T.ink }} />
                      </div>
                      {phoneDropdownOpen && (
                        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 12, width: 260, maxHeight: 240, overflowY: "auto", marginTop: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
                          <input type="text" value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)}
                            placeholder="Search country..." autoFocus
                            style={{ width: "100%", border: "none", borderBottom: `1px solid ${T.line}`, padding: "10px 12px", fontSize: 14, outline: "none" }} />
                          {filteredCountries.map(c => (
                            <button key={c.iso} type="button"
                              onClick={() => { setPhoneCountry(c.iso); setPhoneDropdownOpen(false); setPhoneSearch(""); }}
                              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "none", background: c.iso === phoneCountry ? T.greenTint : "transparent", cursor: "pointer", fontSize: 14, textAlign: "left", color: T.ink }}>
                              <span>{c.flag}</span><span style={{ flex: 1 }}>{c.name}</span>
                              <span style={{ color: T.muted }}>{c.code}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </Field>

                  {/* WhatsApp toggle */}
                  <div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer mb-1" style={{ color: T.soil2 }}>
                      <input type="checkbox" checked={sameAsPhone} onChange={(e) => setSameAsPhone(e.target.checked)}
                        style={{ accentColor: T.green }} />
                      My WhatsApp number is the same as my phone number
                    </label>
                    {!sameAsPhone && (
                      <Field label="WhatsApp number" id="whatsapp_number" error={errors.whatsapp_number}
                        hint="Used for farm alerts and TIS AI messages">
                        <input id="whatsapp_number" type="tel" value={form.whatsapp_number}
                          onChange={(e) => update("whatsapp_number", e.target.value)} placeholder="+6799123456"
                          className={inputCls("whatsapp_number")} style={inputStyle} />
                      </Field>
                    )}
                  </div>

                  {/* Lightweight 18+ check — year of birth */}
                  <Field label="Year of birth *" id="birth_year" error={errors.birth_year}
                    hint="You must be 18 or older to register">
                    <select id="birth_year" value={birthYear}
                      onChange={(e) => { setBirthYear(e.target.value); clearErr("birth_year"); }}
                      className={inputCls("birth_year")} style={inputStyle}>
                      <option value="">— Select year —</option>
                      {BIRTH_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </Field>

                  {/* Country */}
                  <Field label="Country" id="country" error={errors.country}>
                    <select id="country" value={form.country} onChange={(e) => update("country", e.target.value)}
                      className={inputCls("country")} style={inputStyle}>
                      <option value="FJ">🇫🇯 Fiji</option>
                      <option value="SB">🇸🇧 Solomon Islands</option>
                      <option value="VU">🇻🇺 Vanuatu</option>
                      <option value="TO">🇹🇴 Tonga</option>
                      <option value="WS">🇼🇸 Samoa</option>
                      <option value="PG">🇵🇬 Papua New Guinea</option>
                      <option value="KI">🇰🇮 Kiribati</option>
                      <option value="AU">🇦🇺 Australia</option>
                      <option value="NZ">🇳🇿 New Zealand</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </Field>

                  {/* Referral */}
                  <Field label="How did you hear about Teivaka? (optional)" id="referral_source">
                    <select id="referral_source" value={form.referral_source}
                      onChange={(e) => update("referral_source", e.target.value)}
                      className={inputCls("referral_source")} style={inputStyle}>
                      <option value="">— Select —</option>
                      <option value="A friend or farmer">A friend or farmer</option>
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="Facebook or Instagram">Facebook or Instagram</option>
                      <option value="Radio or TV">Radio or TV</option>
                      <option value="A market or event">A market or event</option>
                      <option value="An extension officer">An extension officer</option>
                      <option value="Nayans supermarket">Nayans supermarket</option>
                      <option value="Other">Other</option>
                    </select>
                  </Field>

                  {/* Invite code */}
                  <Field label="Invite code (if you have one)" id="referral_code">
                    <input id="referral_code" type="text" value={form.referral_code}
                      onChange={(e) => update("referral_code", e.target.value.toUpperCase())}
                      maxLength={16} placeholder="e.g. 7K2QH9XM" className={inputCls("referral_code")}
                      style={inputStyle} autoComplete="off" />
                  </Field>

                  {/* Policy acceptance */}
                  <div>
                    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border"
                      style={{ borderColor: T.line, background: T.cream }}>
                      <input type="checkbox" checked={policyAccepted}
                        onChange={(e) => { setPolicyAccepted(e.target.checked); setErrors((er) => ({ ...er, policy: "" })); }}
                        className="mt-0.5 h-4 w-4" style={{ accentColor: T.green }} />
                      <span className="text-sm" style={{ color: T.soil }}>
                        I have read and agree to Teivaka's{" "}
                        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: T.greenDk }}>Privacy Policy</a>{" "}
                        and{" "}
                        <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: T.greenDk }}>Terms of Service</a>.
                        I confirm I am at least 18 years old. My registration IP and device info are logged for fraud prevention.
                      </span>
                    </label>
                    {errors.policy && <p className="text-xs mt-1" style={{ color: T.red }} role="alert">⚠ {errors.policy}</p>}
                  </div>

                  {/* Submit */}
                  <button type="submit" disabled={loading}
                    className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50 mt-1"
                    style={{ background: T.green }}>
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        Creating your account…
                      </span>
                    ) : "Create my account →"}
                  </button>
                </>
              )}
            </form>

            <p className="text-center text-sm mt-6" style={{ color: T.muted }}>
              Already have an account?{" "}
              <Link to="/login" className="font-medium hover:underline" style={{ color: T.greenDk }}>Sign in</Link>
            </p>
          </div>

          <p className="text-center text-xs mt-5" style={{ color: T.muted }}>Connecting Pacific Island farmers 🌏</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function Register() {
  const [accountData, setAccountData] = useState(null);

  if (accountData) {
    const highTrust = HIGH_TRUST.has(accountData.account_type);
    const profileLabel = PROFILE_LABELS[accountData.account_type] || accountData.account_type;
    return (
      <div className="min-h-screen flex flex-col" style={{ background: T.cream, fontFamily: FONT }}>
        <div className="text-center py-5" style={{ borderBottom: `1px solid ${T.line}` }}>
          <img src="/teivaka_logo.png" alt="Teivaka" style={{ height: 80, width: "auto", display: "block", margin: "0 auto" }} />
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <div className="rounded-2xl p-8 text-center" style={{ background: T.paper, border: `1px solid ${T.line}`, boxShadow: "0 2px 8px rgba(92,64,51,0.08)" }}>
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold" style={{ color: T.soil }}>Welcome to Teivaka!</h2>
              <p className="mt-2" style={{ color: T.muted }}>
                Hello <strong style={{ color: T.soil }}>{accountData.display_name}</strong> — your account is ready.
              </p>
              <div className="mt-4 rounded-xl p-3 text-sm text-left" style={{ background: T.greenTint, color: T.soil }}>
                <p>Profile: <strong>{profileLabel}</strong></p>
                <p>Plan: <strong>{accountData.tier || "BASIC"}</strong> — full access</p>
                <p>TIS queries: <strong>{accountData.tis_daily_limit ?? 20} per day</strong></p>
              </div>
              {accountData.email_unverified && (
                <div className="mt-3 rounded-xl p-3 text-sm text-left" style={{ background: "#F7ECCF", border: `1px solid ${T.amber}55`, color: "#7A5C00" }}>
                  📧 We've sent a verification link to <strong>{accountData.email}</strong>.
                  You can start now — please verify your email to keep full access.
                </div>
              )}
              {highTrust && (
                <div className="mt-3 rounded-xl p-3 text-sm text-left" style={{ background: "#EAF1F7", border: "1px solid #5E6D7E55", color: "#3A4A5A" }}>
                  🔒 Your <strong>{profileLabel}</strong> features unlock after we verify your account. We'll be in touch shortly.
                </div>
              )}
              <a href="/home" className="mt-6 inline-block w-full py-3 text-white rounded-xl font-semibold" style={{ background: T.green }}>
                Go to my dashboard →
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <RegistrationForm onSuccess={(data) => setAccountData(data)} />;
}

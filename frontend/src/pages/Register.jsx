/**
 * Register.jsx — Teivaka Farm OS Registration Page
 *
 * Themed to match the post-login app (the .tfp prototype design system:
 * styles/prototype.css) — system sans-serif, cream/soil/green palette,
 * flat lucide-react icons. NOT the serif auth-sibling theme.
 *
 * Single-screen flow:
 *   - Privacy/Terms acceptance via checkbox linking to the real /privacy +
 *     /terms pages (NO scroll-wall).
 *   - Full 8-profession taxonomy + smart "Other" (free-text → nearest type).
 *   - Password show/hide + strength meter; FastAPI 422 arrays parsed.
 *   - Verify-later: account created immediately; high-trust roles get a
 *     "pending verification" note on success.
 *
 * API: POST /api/v1/auth/register
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Sprout, ShoppingCart, Factory, Wrench, Landmark, Building2,
  Ship, Package, User, Eye, EyeOff,
} from "lucide-react";

// In-app (.tfp) palette — mirrors prototype.css light theme tokens.
const T = {
  cream: "#F8F3E9", cream2: "#EFE8D8", paper: "#FFFFFF",
  green: "#6AA84F", greenDk: "#4F8A37", greenTint: "#E8F0E0",
  soil: "#5C4033", soil2: "#7A5C4E", amber: "#BF9000",
  line: "#E2D8C3", ink: "#2A2118", muted: "#7A6E5C", red: "#A32D2D",
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

// ---------------------------------------------------------------------------
// Account-type taxonomy — these 8 values are the ONLY ones the backend accepts
// (auth.py valid_account_type). Flat lucide icons + a one-line "who this is for".
// ---------------------------------------------------------------------------

const ACCOUNT_TYPES = [
  { value: "FARMER",           label: "Farmer",          Icon: Sprout,       who: "I grow crops or raise animals" },
  { value: "BUYER",            label: "Buyer",           Icon: ShoppingCart, who: "I buy produce to sell or use" },
  { value: "SUPPLIER",         label: "Supplier",        Icon: Factory,      who: "I sell seeds, feed or inputs" },
  { value: "SERVICE_PROVIDER", label: "Service",         Icon: Wrench,       who: "I offer farm services or advice" },
  { value: "BANKER",           label: "Banker",          Icon: Landmark,     who: "I provide loans or finance" },
  { value: "BUSINESS",         label: "Business",        Icon: Building2,    who: "I run an agri-business" },
  { value: "EXPORTER",         label: "Exporter",        Icon: Ship,         who: "I export produce overseas" },
  { value: "IMPORTER",         label: "Importer",        Icon: Package,      who: "I import goods or inputs" },
];

// Roles whose privileged capabilities unlock only after manual/KYC verification.
const HIGH_TRUST = new Set(["BANKER", "EXPORTER", "IMPORTER", "BUSINESS"]);

// Smart "Other" — map a free-text role to the nearest valid account_type.
const OTHER_KEYWORD_MAP = [
  [/bank|lender|loan|credit|financ|microfinanc/i, "BANKER"],
  [/export/i,                                      "EXPORTER"],
  [/import/i,                                      "IMPORTER"],
  [/suppl|input|seed|fertili|vendor|wholesal/i,    "SUPPLIER"],
  [/buy|retail|grocer|market|shop|trader/i,        "BUYER"],
  [/servic|agronom|consult|\bvet\b|extension|transport|logistic|contractor|advis/i, "SERVICE_PROVIDER"],
  [/farm|grow|plant|crop|livestock|poultry|garden|plantation|fish/i, "FARMER"],
];

function mapOtherRole(text) {
  const t = (text || "").trim();
  if (!t) return "BUSINESS";
  for (const [re, type] of OTHER_KEYWORD_MAP) if (re.test(t)) return type;
  return "BUSINESS";
}

const ACCOUNT_LABEL = Object.fromEntries(ACCOUNT_TYPES.map((t) => [t.value, t.label]));
const PRIVACY_POLICY_VERSION = "1.0";

// ---------------------------------------------------------------------------
// Parse FastAPI `detail` into a human-readable string (422 → array of {msg}).
// Without this, React renders an array/object as "[object Object]".
// ---------------------------------------------------------------------------

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

// Field wrapper — MUST stay module-scope to keep input identity stable.
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
// Registration Form
// ---------------------------------------------------------------------------

function RegistrationForm({ onSuccess }) {
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", password: "",
    phone_number: "", whatsapp_number: "", date_of_birth: "",
    account_type: "FARMER", country: "FJ", referral_source: "", referral_code: "",
  });

  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState("");
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
  function selectAccountType(value) { setOtherOpen(false); update("account_type", value); }
  function openOther() { setOtherOpen(true); update("account_type", mapOtherRole(otherText)); }
  function onOtherTextChange(value) { setOtherText(value); update("account_type", mapOtherRole(value)); }

  function validate() {
    const e = {};
    if (!form.first_name.trim()) e.first_name = "First name is required";
    if (!form.last_name.trim())  e.last_name  = "Last name is required";
    if (!form.email.trim())      e.email      = "Email address is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email address";
    const pwErr = passwordComplexityError(form.password);
    if (pwErr) e.password = pwErr;
    if (confirmPw !== form.password) e.confirmPw = "Passwords do not match";
    if (fullPhone && !/^\+[1-9]\d{6,14}$/.test(fullPhone)) e.phone_number = "Enter a valid phone number";
    if (!form.date_of_birth) e.date_of_birth = "Date of birth is required";
    if (form.date_of_birth) {
      const dob = new Date(form.date_of_birth);
      const today = new Date();
      const age = today.getFullYear() - dob.getFullYear()
        - ((today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) ? 1 : 0);
      if (age < 18) e.date_of_birth = "You must be at least 18 years old to register";
    }
    if (!policyAccepted) e.policy = "Please accept the Privacy Policy and Terms of Service to continue";
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setLoading(true);
    setServerError("");

    const phoneOrNull = fullPhone;
    const wa = sameAsPhone ? phoneOrNull : ((form.whatsapp_number || "").trim() || null);
    let anonymousId = null;
    try { anonymousId = localStorage.getItem("teivaka_anon_id"); } catch { /* ignore */ }
    const payload = {
      ...form, phone_number: phoneOrNull, whatsapp_number: wa,
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
      const data = await res.json();
      if (!res.ok) { setServerError(extractErrorMessage(data.detail)); return; }
      localStorage.setItem("tfos_access_token", data.access_token);
      localStorage.setItem("tfos_refresh_token", data.refresh_token);
      onSuccess({ ...data, account_type: form.account_type });
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = (field) =>
    `w-full rounded-xl px-4 py-3 text-sm border bg-white focus:outline-none focus:ring-2 focus:ring-[#6AA84F]/30 ${
      errors[field] ? "border-[#A32D2D]" : "border-[#E2D8C3] focus:border-[#6AA84F]"
    }`;
  const inputStyle = { fontFamily: FONT, color: T.ink };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: T.cream, fontFamily: FONT }}>
      {/* Header */}
      <div className="text-center py-5" style={{ borderBottom: `1px solid ${T.line}` }}>
        <Link to="/" className="inline-flex items-center justify-center">
          <img src="/teivaka_logo.png" alt="Teivaka" style={{ height: 80, width: "auto", display: "block" }} />
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="rounded-2xl p-7" style={{ background: T.paper, border: `1px solid ${T.line}`, boxShadow: "0 2px 8px rgba(92,64,51,0.08)" }}>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold mb-1" style={{ color: T.soil }}>Create your account</h1>
              <p className="text-sm" style={{ color: T.muted }}>Your farm management platform starts here</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {serverError && (
                <div className="px-4 py-3 rounded-xl text-sm flex gap-2" role="alert"
                  style={{ background: "#FBEAEA", border: `1px solid ${T.red}33`, color: T.red }}>
                  <span>⚠</span><span>{serverError}</span>
                </div>
              )}

              {/* Account Type — 8 cards + smart Other, flat lucide icons */}
              <Field label="I am a…" id="account_type" error={errors.account_type}>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {ACCOUNT_TYPES.map((t) => {
                    const selected = !otherOpen && form.account_type === t.value;
                    const Icon = t.Icon;
                    return (
                      <button key={t.value} type="button" aria-pressed={selected} title={t.who}
                        onClick={() => selectAccountType(t.value)}
                        className="flex flex-col items-center justify-center text-center py-3 px-1 rounded-xl border text-xs font-semibold transition-all"
                        style={{
                          borderColor: selected ? T.green : T.line,
                          background: selected ? T.greenTint : T.paper,
                          color: selected ? T.greenDk : T.soil,
                        }}>
                        <Icon size={22} strokeWidth={1.75} color={selected ? T.green : T.soil2} style={{ marginBottom: 4 }} />
                        {t.label}
                      </button>
                    );
                  })}
                  <button type="button" aria-pressed={otherOpen} onClick={openOther}
                    className="flex flex-col items-center justify-center text-center py-3 px-1 rounded-xl border text-xs font-semibold transition-all"
                    style={{
                      borderColor: otherOpen ? T.green : T.line,
                      background: otherOpen ? T.greenTint : T.paper,
                      color: otherOpen ? T.greenDk : T.soil,
                    }}>
                    <User size={22} strokeWidth={1.75} color={otherOpen ? T.green : T.soil2} style={{ marginBottom: 4 }} />
                    Other
                  </button>
                </div>

                {!otherOpen && (
                  <p className="text-xs mt-1.5" style={{ color: T.muted }}>
                    {ACCOUNT_TYPES.find((t) => t.value === form.account_type)?.who}
                  </p>
                )}

                {otherOpen && (
                  <div className="mt-2">
                    <input type="text" value={otherText} onChange={(e) => onOtherTextChange(e.target.value)}
                      placeholder="Describe your role — e.g. cooperative officer, agronomist…"
                      className={inputCls("account_type")} style={inputStyle} aria-label="Describe your role" />
                    <p className="text-xs mt-1" style={{ color: T.muted }}>
                      We'll register you as{" "}
                      <span className="font-semibold" style={{ color: T.greenDk }}>{ACCOUNT_LABEL[form.account_type]}</span>.
                      Pick a card above if that's not right.
                    </p>
                  </div>
                )}
              </Field>

              {/* Name row */}
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

              {/* Phone */}
              <Field label="Phone number" id="phone_number" error={errors.phone_number}
                hint="Optional — used for WhatsApp alerts and two-factor login.">
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

              {/* Date of Birth */}
              <Field label="Date of birth *" id="date_of_birth" error={errors.date_of_birth}
                hint="You must be 18 or older to register">
                <input id="date_of_birth" type="date"
                  max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split("T")[0]}
                  value={form.date_of_birth} onChange={(e) => update("date_of_birth", e.target.value)}
                  className={inputCls("date_of_birth")} style={inputStyle} />
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

              {/* Policy acceptance — checkbox + links, no scroll-wall */}
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
                Hello <strong style={{ color: T.soil }}>{accountData.display_name}</strong> — your farm account is ready.
              </p>
              <div className="mt-4 rounded-xl p-3 text-sm text-left" style={{ background: T.greenTint, color: T.soil }}>
                <p>Your plan: <strong>{accountData.tier || "BASIC"}</strong> — full access</p>
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
                  🔒 Your <strong>{ACCOUNT_LABEL[accountData.account_type]}</strong> features unlock after we verify your account. We'll be in touch shortly.
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

/**
 * Register.jsx — Teivaka Farm OS Registration Page
 *
 * Single-screen flow (brand-aligned with Login / Forgot / Verify / Reset):
 *   - Privacy Policy & Terms acceptance via checkbox (links to full /privacy +
 *     /terms — NO scroll-wall; the old "scroll to the bottom to unlock" gate was a
 *     mobile conversion trap and has been removed).
 *   - Full registration form with the real 8-profession taxonomy + smart "Other".
 *   - Password show/hide; FastAPI 422 detail arrays parsed (never "[object Object]").
 *   - Verify-later: account is created immediately; high-trust roles (Banker /
 *     Exporter / Importer / Business) show a "pending verification" note on success.
 *
 * API: POST /api/v1/auth/register
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

// Brand palette — identical to Login.jsx / ForgotPassword.jsx / ResetPassword.jsx
const C = {
  soil:   "#2C1A0E",
  green:  "#3D8C40",
  cream:  "#F5EFE0",
  gold:   "#D4A017",
  border: "#E0D5C0",
};

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
// (auth.py valid_account_type). Keep this list in lockstep with that validator.
// Each card has a one-line "who this is for" so a low-literacy user knows which.
// ---------------------------------------------------------------------------

const ACCOUNT_TYPES = [
  { value: "FARMER",           label: "Farmer",          icon: "🌱", who: "I grow crops or raise animals" },
  { value: "BUYER",            label: "Buyer",           icon: "🛒", who: "I buy produce to sell or use" },
  { value: "SUPPLIER",         label: "Supplier",        icon: "🏭", who: "I sell seeds, feed or inputs" },
  { value: "SERVICE_PROVIDER", label: "Service Provider", icon: "🛠️", who: "I offer farm services or advice" },
  { value: "BANKER",           label: "Banker / Lender", icon: "🏦", who: "I provide loans or finance" },
  { value: "BUSINESS",         label: "Business",        icon: "🏢", who: "I run an agri-business" },
  { value: "EXPORTER",         label: "Exporter",        icon: "🚢", who: "I export produce overseas" },
  { value: "IMPORTER",         label: "Importer",        icon: "📦", who: "I import goods or inputs" },
];

// Roles whose privileged capabilities unlock only after manual/KYC verification.
// Signup is still instant (verify-later); these just carry a "pending" note.
const HIGH_TRUST = new Set(["BANKER", "EXPORTER", "IMPORTER", "BUSINESS"]);

// Smart "Other" — map a free-text role to the nearest valid account_type instead
// of silently dumping everything to BUSINESS. Ordered most-specific first.
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
// Parse whatever FastAPI returns in `detail` into a human-readable string.
// 4xx string → as-is. 422 validation → array of {msg, loc}. Object → .msg.
// Without this, React renders an array/object as "[object Object]".
// ---------------------------------------------------------------------------

function extractErrorMessage(detail) {
  if (!detail) return "Registration failed. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (typeof d === "string" ? d : d?.msg))
      .filter(Boolean);
    return msgs.length ? msgs.join(" · ") : "Please check the highlighted fields and try again.";
  }
  if (typeof detail === "object") return detail.msg || detail.message || "Registration failed. Please try again.";
  return String(detail);
}

// ---------------------------------------------------------------------------
// Password complexity check
// ---------------------------------------------------------------------------

function passwordComplexityError(pw) {
  if (!pw) return "Password is required";
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Password must contain an uppercase letter";
  if (!/\d/.test(pw)) return "Password must contain a number";
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(pw))
    return "Password must contain a special character";
  return null;
}

// Strength meter (0–4) for live feedback — a documented conversion aid.
function passwordStrength(pw) {
  let s = 0;
  if (!pw) return 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

// ---------------------------------------------------------------------------
// Field — module-scope wrapper. MUST stay outside RegistrationForm to keep
// React component identity stable across renders (otherwise inputs unmount
// + remount on every keystroke and lose focus).
// ---------------------------------------------------------------------------

function Field({ label, id, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1.5" style={{ color: C.soil }}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {error && (
        <p className="text-xs mt-1" style={{ color: "#B91C1C" }} role="alert">⚠ {error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Eye icon (show/hide password)
// ---------------------------------------------------------------------------

function EyeIcon({ open }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Registration Form (single screen)
// ---------------------------------------------------------------------------

function RegistrationForm({ onSuccess }) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    phone_number: "",
    whatsapp_number: "",
    date_of_birth: "",
    account_type: "FARMER",
    country: "FJ",
    referral_source: "",
    referral_code: "",
  });

  // Smart "Other" role capture.
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState("");

  // Policy acceptance (checkbox only — no scroll-wall).
  const [policyAccepted, setPolicyAccepted] = useState(false);

  // Pre-fill invite code from sessionStorage (set by landing page ?ref=XXXX capture).
  useEffect(() => {
    try {
      const ref = sessionStorage.getItem("teivaka_ref");
      if (ref) setForm((f) => (f.referral_code ? f : { ...f, referral_code: ref }));
    } catch { /* sessionStorage unavailable — ignore */ }
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
  const STRENGTH_COLOR = ["#E0D5C0", "#DC2626", "#D4A017", "#65A30D", C.green][pwStrength];

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: "" }));
    setServerError("");
  }

  function selectAccountType(value) {
    setOtherOpen(false);
    update("account_type", value);
  }

  function openOther() {
    setOtherOpen(true);
    update("account_type", mapOtherRole(otherText));
  }

  function onOtherTextChange(value) {
    setOtherText(value);
    update("account_type", mapOtherRole(value));
  }

  function validate() {
    const e = {};
    if (!form.first_name.trim()) e.first_name = "First name is required";
    if (!form.last_name.trim())  e.last_name  = "Last name is required";
    if (!form.email.trim())      e.email      = "Email address is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email address";
    const pwErr = passwordComplexityError(form.password);
    if (pwErr) e.password = pwErr;
    if (confirmPw !== form.password) e.confirmPw = "Passwords do not match";
    if (fullPhone && !/^\+[1-9]\d{6,14}$/.test(fullPhone))
      e.phone_number = "Enter a valid phone number";
    if (!form.date_of_birth)     e.date_of_birth = "Date of birth is required";
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
      ...form,
      phone_number: phoneOrNull,
      whatsapp_number: wa,
      referral_code: form.referral_code.trim() || null,
      referral_source: form.referral_source || null,
      anonymous_id: anonymousId,
      privacy_accepted: true,
      privacy_policy_version: PRIVACY_POLICY_VERSION,
    };

    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setServerError(extractErrorMessage(data.detail));
        return;
      }

      // Store tokens
      localStorage.setItem("tfos_access_token", data.access_token);
      localStorage.setItem("tfos_refresh_token", data.refresh_token);

      // Pass the chosen account_type through — the API response omits it, but the
      // success screen needs it to show the verify-later note for high-trust roles.
      onSuccess({ ...data, account_type: form.account_type });
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = (field) => ({
    borderColor: errors[field] ? "#DC2626" : C.border,
    fontFamily: "'Lora', Georgia, serif",
  });
  const inputCls = "w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.cream, fontFamily: "'Lora', Georgia, serif" }}>
      {/* Header */}
      <div className="text-center py-6" style={{ borderBottom: `1px solid ${C.border}` }}>
        <Link to="/" className="inline-flex items-center justify-center">
          <img src="/teivaka_logo.png" alt="Teivaka" style={{ height: 88, width: "auto", display: "block" }} />
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-3xl shadow-sm p-8" style={{ border: `1px solid ${C.border}` }}>
            {/* Title */}
            <div className="text-center mb-7">
              <h1 className="text-2xl font-bold mb-1" style={{ color: C.soil, fontFamily: "'Playfair Display', Georgia, serif" }}>
                Create your account
              </h1>
              <p className="text-sm text-gray-500">Your farm management platform starts here</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Server error banner */}
              {serverError && (
                <div className="px-4 py-3 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200 flex gap-2" role="alert">
                  <span>⚠</span>
                  <span>{serverError}</span>
                </div>
              )}

              {/* Account Type — 8 real professions + smart Other */}
              <Field label="I am a…" id="account_type" error={errors.account_type}>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {ACCOUNT_TYPES.map((t) => {
                    const selected = !otherOpen && form.account_type === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        aria-pressed={selected}
                        title={t.who}
                        onClick={() => selectAccountType(t.value)}
                        className="flex flex-col items-center justify-center text-center py-2.5 px-1 rounded-xl border text-xs font-medium transition-all"
                        style={{
                          borderColor: selected ? C.green : C.border,
                          background: selected ? "rgba(61,140,64,0.08)" : "#fff",
                          color: selected ? C.green : C.soil,
                        }}
                      >
                        <span className="text-lg mb-0.5">{t.icon}</span>
                        {t.label}
                      </button>
                    );
                  })}
                  {/* Other */}
                  <button
                    type="button"
                    aria-pressed={otherOpen}
                    onClick={openOther}
                    className="flex flex-col items-center justify-center text-center py-2.5 px-1 rounded-xl border text-xs font-medium transition-all"
                    style={{
                      borderColor: otherOpen ? C.green : C.border,
                      background: otherOpen ? "rgba(61,140,64,0.08)" : "#fff",
                      color: otherOpen ? C.green : C.soil,
                    }}
                  >
                    <span className="text-lg mb-0.5">👤</span>
                    Other
                  </button>
                </div>

                {/* "who this is for" caption for the current selection */}
                {!otherOpen && (
                  <p className="text-xs text-gray-400 mt-1.5">
                    {ACCOUNT_TYPES.find((t) => t.value === form.account_type)?.who}
                  </p>
                )}

                {otherOpen && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={otherText}
                      onChange={(e) => onOtherTextChange(e.target.value)}
                      placeholder="Describe your role — e.g. cooperative officer, agronomist…"
                      className={inputCls}
                      style={inputStyle("account_type")}
                      aria-label="Describe your role"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      We'll register you as{" "}
                      <span className="font-semibold" style={{ color: C.green }}>{ACCOUNT_LABEL[form.account_type]}</span>
                      . Pick a card above if that's not right.
                    </p>
                  </div>
                )}
              </Field>

              {/* Name row */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name *" id="first_name" error={errors.first_name}>
                  <input id="first_name" type="text" autoComplete="given-name"
                    value={form.first_name} onChange={(e) => update("first_name", e.target.value)}
                    placeholder="e.g. Cody" className={inputCls} style={inputStyle("first_name")} />
                </Field>
                <Field label="Last name *" id="last_name" error={errors.last_name}>
                  <input id="last_name" type="text" autoComplete="family-name"
                    value={form.last_name} onChange={(e) => update("last_name", e.target.value)}
                    placeholder="e.g. Viliami" className={inputCls} style={inputStyle("last_name")} />
                </Field>
              </div>

              {/* Email */}
              <Field label="Email address *" id="email" error={errors.email}
                hint="Use a permanent email — disposable addresses are not accepted">
                <input id="email" type="email" autoComplete="email"
                  value={form.email} onChange={(e) => update("email", e.target.value.toLowerCase())}
                  placeholder="you@example.com" className={inputCls} style={inputStyle("email")} />
              </Field>

              {/* Password */}
              <Field label="Password *" id="password" error={errors.password}>
                <div className="relative">
                  <input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password"
                    value={form.password} onChange={(e) => update("password", e.target.value)}
                    placeholder="Min 8 chars — uppercase, number & symbol"
                    className={`${inputCls} pr-11`} style={inputStyle("password")} />
                  <button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}>
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
                {form.password && (
                  <div className="mt-1.5">
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: C.border }}>
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
                    placeholder="Re-enter your password" className={`${inputCls} pr-11`} style={inputStyle("confirmPw")} />
                  <button type="button" tabIndex={-1} onClick={() => setShowConfirmPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showConfirmPw ? "Hide password" : "Show password"}>
                    <EyeIcon open={showConfirmPw} />
                  </button>
                </div>
              </Field>

              {/* Phone */}
              <Field label="Phone number" id="phone_number" error={errors.phone_number}
                hint="Optional — used for WhatsApp alerts and two-factor login.">
                <div ref={phoneDropdownRef} style={{ position: "relative" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button"
                      onClick={() => { setPhoneDropdownOpen(v => !v); setPhoneSearch(""); }}
                      style={{ flexShrink: 0, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 12px", background: "#fff", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                      {selectedCountry.flag} {selectedCountry.code} ▾
                    </button>
                    <input type="tel" value={phoneLocal} onChange={e => setPhoneLocal(e.target.value)}
                      placeholder="9123456" autoComplete="tel-national"
                      style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", fontSize: 15, outline: "none", fontFamily: "'Lora', Georgia, serif" }} />
                  </div>
                  {phoneDropdownOpen && (
                    <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, width: 260, maxHeight: 240, overflowY: "auto", marginTop: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
                      <input type="text" value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)}
                        placeholder="Search country..." autoFocus
                        style={{ width: "100%", border: "none", borderBottom: `1px solid ${C.border}`, padding: "10px 12px", fontSize: 14, outline: "none" }} />
                      {filteredCountries.map(c => (
                        <button key={c.iso} type="button"
                          onClick={() => { setPhoneCountry(c.iso); setPhoneDropdownOpen(false); setPhoneSearch(""); }}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "none", background: c.iso === phoneCountry ? "rgba(61,140,64,0.08)" : "transparent", cursor: "pointer", fontSize: 14, textAlign: "left" }}>
                          <span>{c.flag}</span>
                          <span style={{ flex: 1 }}>{c.name}</span>
                          <span style={{ color: "#6b7280" }}>{c.code}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>

              {/* WhatsApp (optional, same as phone toggle) */}
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer mb-1">
                  <input type="checkbox" checked={sameAsPhone}
                    onChange={(e) => setSameAsPhone(e.target.checked)}
                    style={{ accentColor: C.green }} />
                  My WhatsApp number is the same as my phone number
                </label>
                {!sameAsPhone && (
                  <Field label="WhatsApp number" id="whatsapp_number" error={errors.whatsapp_number}
                    hint="Used for farm alerts and TIS AI messages">
                    <input id="whatsapp_number" type="tel" value={form.whatsapp_number}
                      onChange={(e) => update("whatsapp_number", e.target.value)}
                      placeholder="+6799123456" className={inputCls} style={inputStyle("whatsapp_number")} />
                  </Field>
                )}
              </div>

              {/* Date of Birth */}
              <Field label="Date of birth *" id="date_of_birth" error={errors.date_of_birth}
                hint="You must be 18 or older to register">
                <input id="date_of_birth" type="date"
                  max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split("T")[0]}
                  value={form.date_of_birth} onChange={(e) => update("date_of_birth", e.target.value)}
                  className={inputCls} style={inputStyle("date_of_birth")} />
              </Field>

              {/* Country */}
              <Field label="Country" id="country" error={errors.country}>
                <select id="country" value={form.country} onChange={(e) => update("country", e.target.value)}
                  className={inputCls} style={inputStyle("country")}>
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

              {/* Referral (optional) */}
              <Field label="How did you hear about Teivaka? (optional)" id="referral_source">
                <select id="referral_source" value={form.referral_source}
                  onChange={(e) => update("referral_source", e.target.value)}
                  className={inputCls} style={inputStyle("referral_source")}>
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

              {/* Invite code (optional) */}
              <Field label="Invite code (if you have one)" id="referral_code">
                <input id="referral_code" type="text" value={form.referral_code}
                  onChange={(e) => update("referral_code", e.target.value.toUpperCase())}
                  maxLength={16} placeholder="e.g. 7K2QH9XM" className={inputCls}
                  style={inputStyle("referral_code")} autoComplete="off" />
              </Field>

              {/* Policy acceptance — checkbox + links to full pages, no scroll-wall */}
              <div>
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border transition-colors"
                  style={{ borderColor: C.border, background: C.cream }}>
                  <input type="checkbox" checked={policyAccepted}
                    onChange={(e) => { setPolicyAccepted(e.target.checked); setErrors((er) => ({ ...er, policy: "" })); }}
                    className="mt-0.5 h-4 w-4" style={{ accentColor: C.green }} />
                  <span className="text-sm" style={{ color: C.soil }}>
                    I have read and agree to Teivaka's{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: C.green }}>Privacy Policy</a>{" "}
                    and{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: C.green }}>Terms of Service</a>.
                    I confirm I am at least 18 years old. My registration IP and device
                    info are logged for fraud prevention.
                  </span>
                </label>
                {errors.policy && (
                  <p className="text-xs mt-1" style={{ color: "#B91C1C" }} role="alert">⚠ {errors.policy}</p>
                )}
              </div>

              {/* Submit */}
              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50 mt-1"
                style={{ background: C.green }}>
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

            <p className="text-center text-sm text-gray-500 mt-6">
              Already have an account?{" "}
              <Link to="/login" className="font-medium hover:underline" style={{ color: C.green }}>Sign in</Link>
            </p>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            Connecting Pacific Island farmers 🌏
          </p>
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
      <div className="min-h-screen flex flex-col" style={{ background: C.cream, fontFamily: "'Lora', Georgia, serif" }}>
        <div className="text-center py-6" style={{ borderBottom: `1px solid ${C.border}` }}>
          <img src="/teivaka_logo.png" alt="Teivaka" style={{ height: 88, width: "auto", display: "block", margin: "0 auto" }} />
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-3xl shadow-sm p-8 text-center" style={{ border: `1px solid ${C.border}` }}>
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold" style={{ color: C.soil, fontFamily: "'Playfair Display', Georgia, serif" }}>
                Welcome to Teivaka!
              </h2>
              <p className="text-gray-500 mt-2">
                Hello <strong style={{ color: C.soil }}>{accountData.display_name}</strong> — your farm account is ready.
              </p>
              <div className="mt-4 rounded-xl p-3 text-sm text-left" style={{ background: C.cream, color: C.soil }}>
                <p>Your plan: <strong>{accountData.tier || "BASIC"}</strong> — 14-day trial</p>
                <p>TIS queries: <strong>{accountData.tis_daily_limit ?? 20} per day</strong></p>
              </div>
              {accountData.email_unverified && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 text-left">
                  📧 We've sent a verification link to <strong>{accountData.email}</strong>.
                  You can start now — please verify your email to keep full access.
                </div>
              )}
              {highTrust && (
                <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800 text-left">
                  🔒 Your <strong>{ACCOUNT_LABEL[accountData.account_type]}</strong> features
                  unlock after we verify your account. We'll be in touch shortly.
                </div>
              )}
              <a href="/home"
                className="mt-6 inline-block w-full py-3 text-white rounded-xl font-semibold"
                style={{ background: C.green }}>
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

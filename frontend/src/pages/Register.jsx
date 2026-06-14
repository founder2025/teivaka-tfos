/**
 * Register.jsx — Teivaka Agriculture Ecosystem onboarding gateway.
 *
 * Progressive onboarding (Google/LinkedIn method — one decision per card),
 * themed to the post-login .tfp system. Replaces the single long signup page
 * with a 4-step wizard, each step a small card with a progress indicator and
 * back navigation:
 *   Step 1 — Account: email + password (show/hide; Google slot reserved).
 *   Step 2 — Who are you?: account-kind toggle + profession grid + specialty.
 *   Step 3 — About you: name (by kind) + date of birth (18+) + country.
 *   Step 4 — Verify & finish: phone/WhatsApp (optional, for the verified badge)
 *            + verify channel + referral/invite + policy, then create account.
 *
 * Identity (profession) stays REQUIRED — lazy verification is about the email
 * link, not who you are. The submit payload is byte-identical to the old form
 * so the backend contract is unchanged. Partial answers persist (resume), the
 * password is never persisted.
 *
 * API: POST /api/v1/auth/register
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Sprout, ShoppingCart, Factory, Truck, Landmark, Building2,
  Ship, Package, Users, Eye, EyeOff, Mail, Check, ShieldCheck,
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
// Latest allowable DOB = exactly 18 years ago today (date input `max`), so the
// native picker can't offer an under-18 date. Age is re-checked in validate().
const MAX_DOB = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().slice(0, 10);
})();

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
// Google Identity Services button. Renders the real Google button when
// VITE_GOOGLE_CLIENT_ID is configured at build time; otherwise falls back to an
// honest "coming soon" placeholder so the slot is a clean drop-in.
// ---------------------------------------------------------------------------
function GoogleButton({ onCredential, busy }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const ref = useRef(null);
  const cbRef = useRef(onCredential);
  cbRef.current = onCredential;

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    function init() {
      if (cancelled || !window.google?.accounts?.id || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp) => { if (resp?.credential) cbRef.current(resp.credential); },
      });
      ref.current.innerHTML = "";
      window.google.accounts.id.renderButton(ref.current, {
        type: "standard", theme: "outline", size: "large",
        text: "continue_with", shape: "pill", width: 360, logo_alignment: "center",
      });
    }
    if (window.google?.accounts?.id) {
      init();
    } else {
      const existing = document.getElementById("gsi-script");
      if (existing) {
        existing.addEventListener("load", init);
      } else {
        const s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true; s.defer = true; s.id = "gsi-script";
        s.onload = init;
        document.head.appendChild(s);
      }
    }
    return () => { cancelled = true; };
  }, [clientId]);

  // Drop-in placeholder until the OAuth client id is provided.
  if (!clientId) {
    return (
      <div>
        <button type="button" disabled aria-disabled="true"
          className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
          style={{ background: T.paper, border: `1px solid ${T.line}`, color: T.muted, cursor: "not-allowed", opacity: 0.75 }}>
          <span style={{ fontWeight: 800, fontSize: 16 }}>G</span> Continue with Google
        </button>
        <p className="text-[11px] text-center mt-1" style={{ color: T.muted }}>Google sign-in coming soon</p>
      </div>
    );
  }

  return (
    <div ref={ref}
      style={{ display: "flex", justifyContent: "center", minHeight: 44, opacity: busy ? 0.6 : 1, pointerEvents: busy ? "none" : "auto" }} />
  );
}

// ---------------------------------------------------------------------------
// Registration Form — progressive 4-step wizard
// ---------------------------------------------------------------------------

const TOTAL_STEPS = 4;
const DRAFT_KEY = "teivaka_signup_draft";
const STEP_TITLES = ["Account", "Who you are", "About you", "Finish"];

function RegistrationForm({ onSuccess }) {
  const [step, setStep] = useState(1);
  const headingRef = useRef(null);

  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", password: "",
    phone_number: "", whatsapp_number: "",
    country: "FJ", referral_source: "", referral_code: "",
  });

  const [accountKind, setAccountKind] = useState("individual"); // "individual" | "company"
  const [businessName, setBusinessName] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [birthDate, setBirthDate] = useState(""); // full YYYY-MM-DD
  const [preferredChannel, setPreferredChannel] = useState(""); // "" = use CFO default
  const isCompany = accountKind === "company";

  const [selectedKey, setSelectedKey] = useState("PRIMARY_PRODUCER");
  const [subType, setSubType] = useState("");
  const [specialty, setSpecialty] = useState("");
  const selectedProfile = PROFILES.find((p) => p.key === selectedKey) || PROFILES[0];
  const resolvedType = selectedProfile.dropdown ? (subType || null) : selectedProfile.value;
  const isResolved = !!resolvedType;
  const effectiveChannel = preferredChannel || (resolvedType ? defaultChannel(resolvedType) : "email");
  const workspaceLabel = PROFILE_LABELS[resolvedType] || "";

  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [sameAsPhone, setSameAsPhone] = useState(true);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("FJ");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [phoneDropdownOpen, setPhoneDropdownOpen] = useState(false);
  const [phoneSearch, setPhoneSearch] = useState("");
  const phoneDropdownRef = useRef(null);

  // Google sign-in: when a returning user, we log them straight in; for a new
  // user we keep the verified credential and let them finish the wizard
  // (profession etc.) — identity is still captured, password is skipped.
  const [googleMode, setGoogleMode] = useState(false);
  const [googleCredential, setGoogleCredential] = useState("");
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState("");

  async function handleGoogleCredential(credential) {
    setGoogleBusy(true); setGoogleError(""); setServerError("");
    try {
      const res = await fetch("/api/v1/auth/google", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGoogleError(extractErrorMessage(data.detail) || "Google sign-in failed. Please try again.");
        return;
      }
      if (data.existing) {
        // Returning user — log in and go straight into the app.
        localStorage.setItem("tfos_access_token", data.access_token);
        localStorage.setItem("tfos_refresh_token", data.refresh_token);
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
        window.location.assign("/home");
        return;
      }
      // New user — carry the verified identity into the wizard (skip password).
      setGoogleCredential(credential);
      setGoogleMode(true);
      update("email", data.email || "");
      if (data.first_name) update("first_name", data.first_name);
      if (data.last_name) update("last_name", data.last_name);
      setStep(2); // account step is satisfied by Google
    } catch {
      setGoogleError("Couldn't reach Google. Please check your connection and try again.");
    } finally {
      setGoogleBusy(false);
    }
  }

  // referral code prefill from an invite link
  useEffect(() => {
    try {
      const ref = sessionStorage.getItem("teivaka_ref");
      if (ref) setForm((f) => (f.referral_code ? f : { ...f, referral_code: ref }));
    } catch { /* ignore */ }
  }, []);

  // resume a saved draft (everything except password, which is never persisted)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.form) setForm((f) => ({ ...f, ...d.form, password: "" }));
      if (d.accountKind) setAccountKind(d.accountKind);
      if (d.selectedKey) setSelectedKey(d.selectedKey);
      if (typeof d.subType === "string") setSubType(d.subType);
      if (typeof d.specialty === "string") setSpecialty(d.specialty);
      if (d.birthDate) setBirthDate(d.birthDate);
      if (d.phoneCountry) setPhoneCountry(d.phoneCountry);
      if (typeof d.phoneLocal === "string") setPhoneLocal(d.phoneLocal);
      if (d.preferredChannel) setPreferredChannel(d.preferredChannel);
      if (typeof d.sameAsPhone === "boolean") setSameAsPhone(d.sameAsPhone);
    } catch { /* ignore */ }
  }, []);

  // persist the draft as the user progresses (password excluded for security)
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        form: { ...form, password: "" },
        accountKind, selectedKey, subType, specialty, birthDate,
        phoneCountry, phoneLocal, preferredChannel, sameAsPhone,
      }));
    } catch { /* ignore */ }
  }, [form, accountKind, selectedKey, subType, specialty, birthDate,
    phoneCountry, phoneLocal, preferredChannel, sameAsPhone]);

  // a11y: focus the step heading + scroll to top whenever the step changes
  useEffect(() => {
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* ignore */ }
    if (headingRef.current) { try { headingRef.current.focus(); } catch { /* ignore */ } }
  }, [step]);

  // close the phone country dropdown on an outside click
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
  function selectProfile(key) { setSelectedKey(key); setSubType(""); clearErr("account_type"); }
  function selectSubType(value) { setSubType(value); clearErr("account_type"); }

  function dobError() {
    if (!birthDate) return "Please enter your date of birth";
    const dob = new Date(birthDate);
    if (Number.isNaN(dob.getTime())) return "Please enter a valid date of birth";
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    if (age < 18) return "You must be at least 18 years old to register";
    if (dob.getFullYear() < 1900) return "Please enter a valid date of birth";
    return null;
  }

  // per-step validation — only gate on the fields visible in that step
  function validateStep(n) {
    const e = {};
    if (n === 1) {
      if (!form.email.trim()) e.email = "Email address is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email address";
      if (!googleMode) {            // Google supplies the credential instead of a password
        const pwErr = passwordComplexityError(form.password);
        if (pwErr) e.password = pwErr;
      }
    } else if (n === 2) {
      if (!isResolved) {
        e.account_type = selectedProfile.dropdown
          ? "Please select your profile from the dropdown to continue"
          : "Please choose who you are";
      }
      if (selectedProfile.other && !specialty.trim()) e.specialty = "Please tell us what you do";
    } else if (n === 3) {
      if (isCompany) {
        if (businessName.trim().length < 2) e.business_name = "Registered business name is required";
        if (operatorName.trim().length < 2) e.operator_name = "Authorized operator name is required";
      } else {
        if (!form.first_name.trim()) e.first_name = "First name is required";
        if (!form.last_name.trim()) e.last_name = "Last name is required";
      }
      const de = dobError();
      if (de) e.birth_date = de;
    } else if (n === 4) {
      if (fullPhone && !/^\+[1-9]\d{6,14}$/.test(fullPhone)) e.phone_number = "Enter a valid phone number";
      if ((effectiveChannel === "whatsapp" || effectiveChannel === "sms") && !fullPhone)
        e.phone_number = "A mobile number is required for WhatsApp / SMS verification";
      if (!policyAccepted) e.policy = "Please accept the Privacy Policy and Terms of Service to continue";
    }
    return e;
  }

  function next() {
    const errs = validateStep(step);
    if (Object.keys(errs).length) {
      setErrors((p) => ({ ...p, ...errs }));
      setServerError("Please fix the highlighted fields to continue.");
      return;
    }
    setServerError("");
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }
  // In Google mode the account step is owned by Google — don't let Back land there.
  function back() { setServerError(""); setStep((s) => Math.max(googleMode ? 2 : 1, s - 1)); }

  // full safety net at submit (all steps combined)
  function validate() {
    return { ...validateStep(1), ...validateStep(2), ...validateStep(3), ...validateStep(4) };
  }

  function deriveNames() {
    if (!isCompany) return { first_name: form.first_name.trim(), last_name: form.last_name.trim() };
    const parts = operatorName.trim().split(/\s+/).filter(Boolean);
    const first = parts[0] || businessName.trim();
    const last = parts.slice(1).join(" ") || parts[0] || "Operator";
    return { first_name: first, last_name: last };
  }

  async function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const stepOf = (k) =>
        ["email", "password"].includes(k) ? 1 :
        ["account_type", "specialty"].includes(k) ? 2 :
        ["first_name", "last_name", "business_name", "operator_name", "birth_date"].includes(k) ? 3 : 4;
      setStep(Math.min(...Object.keys(errs).map(stepOf)));
      setServerError("Please fix the highlighted fields to continue.");
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
      // Google signups carry the verified credential instead of a password;
      // the server uses Google's email and generates the password.
      google_credential: googleMode ? googleCredential : null,
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
      date_of_birth: birthDate,
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
        return;
      }
      localStorage.setItem("tfos_access_token", data.access_token);
      localStorage.setItem("tfos_refresh_token", data.refresh_token);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
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

  // Enter / primary button: advance steps, submit on the last step.
  function onFormSubmit(e) {
    e.preventDefault();
    if (step < TOTAL_STEPS) next();
    else handleSubmit();
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
  const h1Cls = "text-2xl font-bold mb-1 outline-none";

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

            {/* progress indicator */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold" style={{ color: T.greenDk }}>Step {step} of {TOTAL_STEPS}</span>
                <span className="text-xs" style={{ color: T.muted }}>{STEP_TITLES[step - 1]}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.line }}
                role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={TOTAL_STEPS}>
                <div style={{ width: `${(step / TOTAL_STEPS) * 100}%`, height: "100%", background: T.green, borderRadius: 999, transition: "width .3s ease" }} />
              </div>
            </div>

            <form onSubmit={onFormSubmit} className="space-y-4">
              {serverError && (
                <div className="px-4 py-3 rounded-xl text-sm flex gap-2" role="alert"
                  style={{ background: "#FBEAEA", border: `1px solid ${T.red}33`, color: T.red }}>
                  <span>⚠</span><span>{serverError}</span>
                </div>
              )}

              {/* ---- Step 1 — Account ---- */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h1 ref={headingRef} tabIndex={-1} className={h1Cls} style={{ color: T.soil }}>Create your account</h1>
                    <p className="text-sm" style={{ color: T.muted }}>Join Fiji's verified farming network — takes under a minute.</p>
                  </div>

                  {/* Google sign-in — pre-verified email, no password (drop-in: live once VITE_GOOGLE_CLIENT_ID is set) */}
                  <GoogleButton onCredential={handleGoogleCredential} busy={googleBusy} />
                  {googleError && (
                    <p className="text-xs text-center" style={{ color: T.red }} role="alert">⚠ {googleError}</p>
                  )}

                  <div className="flex items-center gap-3">
                    <div style={{ flex: 1, height: 1, background: T.line }} />
                    <span className="text-xs" style={{ color: T.muted }}>or sign up with email</span>
                    <div style={{ flex: 1, height: 1, background: T.line }} />
                  </div>

                  <Field label="Email address" id="email" error={errors.email}
                    hint="Use a permanent email — disposable addresses are not accepted">
                    <input id="email" type="email" inputMode="email" autoComplete="email" value={form.email}
                      onChange={(e) => update("email", e.target.value.toLowerCase())} placeholder="you@example.com"
                      className={inputCls("email")} style={inputStyle} />
                  </Field>

                  <Field label="Password" id="password" error={errors.password}>
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
                </div>
              )}

              {/* ---- Step 2 — Who are you? ---- */}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h1 ref={headingRef} tabIndex={-1} className={h1Cls} style={{ color: T.soil }}>Who are you?</h1>
                    <p className="text-sm" style={{ color: T.muted }}>This sets up the right workspace for you.</p>
                  </div>

                  <Field label="Account type" id="account_kind">
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" aria-pressed={!isCompany} style={kindBtn(!isCompany)}
                        onClick={() => setAccountKind("individual")}>Individual / Personal</button>
                      <button type="button" aria-pressed={isCompany} style={kindBtn(isCompany)}
                        onClick={() => setAccountKind("company")}>Company / Agribusiness</button>
                    </div>
                  </Field>

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

                    {/* Stage-2 conditional dropdown (reserved for future fan-out profiles) */}
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
                </div>
              )}

              {/* ---- Step 3 — About you ---- */}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h1 ref={headingRef} tabIndex={-1} className={h1Cls} style={{ color: T.soil }}>Tell us about you</h1>
                    <p className="text-sm" style={{ color: T.muted }}>So we can personalise your account.</p>
                  </div>

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

                  {/* Date of birth — full date; 18+ enforced in validateStep */}
                  <Field label="Date of birth *" id="birth_date" error={errors.birth_date}
                    hint="You must be 18 or older to register">
                    <input type="date" id="birth_date" value={birthDate}
                      max={MAX_DOB} min="1900-01-01"
                      onChange={(e) => { setBirthDate(e.target.value); clearErr("birth_date"); }}
                      className={inputCls("birth_date")} style={inputStyle} />
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
                </div>
              )}

              {/* ---- Step 4 — Verify & finish ---- */}
              {step === 4 && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h1 ref={headingRef} tabIndex={-1} className={h1Cls} style={{ color: T.soil }}>Verify &amp; finish</h1>
                    <p className="text-sm" style={{ color: T.muted }}>
                      {workspaceLabel ? <>We'll set up your <strong style={{ color: T.soil }}>{workspaceLabel}</strong> workspace. </> : null}
                      Add a phone for a verified badge &amp; alerts — or skip for now.
                    </p>
                  </div>

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
                        <input type="tel" inputMode="tel" value={phoneLocal} onChange={e => setPhoneLocal(e.target.value)}
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
                </div>
              )}

              {/* ---- Navigation ---- */}
              <div className="flex gap-3 pt-1">
                {step > 1 && (
                  <button type="button" onClick={back}
                    className="py-3 px-5 rounded-xl font-semibold text-sm"
                    style={{ background: T.paper, border: `1px solid ${T.line}`, color: T.soil }}>
                    ← Back
                  </button>
                )}
                <button type="submit" disabled={loading}
                  className="flex-1 py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50"
                  style={{ background: T.green }}>
                  {step < TOTAL_STEPS ? "Continue →" : (loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Creating your account…
                    </span>
                  ) : "Create my account →")}
                </button>
              </div>
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
  if (accountData) return <AccountCreated data={accountData} />;
  return <RegistrationForm onSuccess={(data) => setAccountData(data)} />;
}

// ---------------------------------------------------------------------------
// Post-signup success — lazy verification: the user enters the app immediately;
// the email link is a nudge, not a gate. Resend is the secondary action.
// ---------------------------------------------------------------------------
function AccountCreated({ data }) {
  const highTrust = HIGH_TRUST.has(data.account_type);
  const profileLabel = PROFILE_LABELS[data.account_type] || data.account_type;
  const needsVerify = data.email_unverified !== false; // Google accounts arrive verified
  const firstName = (data.display_name || "").trim().split(/\s+/)[0] || "there";

  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [msg, setMsg] = useState("");
  const [cooldown, setCooldown] = useState(0); // seconds until resend is allowed again

  // tick the cooldown down to zero
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function resend() {
    if (cooldown > 0 || state === "sending") return;
    setState("sending"); setMsg("");
    try {
      const res = await fetch("/api/v1/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      });
      const d = await res.json().catch(() => ({}));
      const retry = parseInt(res.headers.get("Retry-After") || "0", 10);
      if (res.status === 429) {
        setState("error");
        setMsg(d.detail || "Please wait a little before requesting another email.");
        setCooldown(retry > 0 ? retry : 60);
        return;
      }
      setState("sent");
      setMsg("Sent — check your inbox, plus spam/promotions.");
      setCooldown(retry > 0 ? retry : 30);
    } catch {
      setState("error");
      setMsg("Couldn't send right now. Please try again in a moment.");
    }
  }

  const resendDisabled = state === "sending" || cooldown > 0;
  const resendLabel =
    state === "sending" ? "Sending…"
    : cooldown > 0 ? `Resend available in ${cooldown}s`
    : state === "sent" ? "Resend again"
    : "Resend verification email";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: T.cream, fontFamily: FONT }}>
      <div className="text-center py-5" style={{ borderBottom: `1px solid ${T.line}` }}>
        <img src="/teivaka_logo.png" alt="Teivaka" style={{ height: 72, width: "auto", display: "block", margin: "0 auto" }} />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="rounded-2xl p-8" style={{ background: T.paper, border: `1px solid ${T.line}`, boxShadow: "0 4px 16px rgba(92,64,51,0.10)" }}>

            {/* header: icon + headline */}
            <div className="text-center">
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: T.greenTint, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <Check size={30} strokeWidth={2.75} color={T.greenDk} aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-bold" style={{ color: T.soil }}>You're in, {firstName}!</h2>
              <p className="mt-1.5" style={{ color: T.muted, fontSize: 14.5 }}>Your Teivaka account is ready.</p>
            </div>

            {/* primary action — straight into the app (lazy verification) */}
            <Link to="/home" className="mt-6 flex items-center justify-center w-full py-3.5 rounded-xl font-semibold"
              style={{ background: T.green, color: "#fff", fontSize: 15.5 }}>
              Continue to Teivaka →
            </Link>

            {/* verify section — secondary; or a confirmation for Google accounts */}
            {needsVerify ? (
              <div className="mt-6 rounded-xl p-4" style={{ background: T.cream, border: `1px solid ${T.line}` }}>
                <div className="flex items-center gap-2.5">
                  <Mail size={18} strokeWidth={2} color={T.greenDk} />
                  <p style={{ color: T.soil, fontWeight: 700, fontSize: 14.5 }}>Verify your email</p>
                </div>
                <p className="mt-2" style={{ color: T.soil2, fontSize: 13, lineHeight: 1.55 }}>
                  Sent to <strong style={{ color: T.soil }}>{data.email}</strong>. Optional now — it secures your
                  account and unlocks Bank Evidence &amp; selling later.
                </p>

                <button
                  type="button"
                  onClick={resend}
                  disabled={resendDisabled}
                  className="mt-3 w-full py-2.5 rounded-xl font-medium"
                  style={{
                    background: resendDisabled ? T.cream : T.paper,
                    color: resendDisabled ? T.muted : T.greenDk,
                    border: `1px solid ${T.line}`,
                    cursor: resendDisabled ? "default" : "pointer",
                    fontSize: 14,
                  }}
                >
                  {resendLabel}
                </button>

                {msg && (
                  <div className="mt-2.5 flex items-start gap-1.5" style={{ fontSize: 12.5, color: state === "error" ? T.red : T.greenDk }}>
                    {state === "sent" && <Check size={14} strokeWidth={3} style={{ marginTop: 1, flexShrink: 0 }} />}
                    <span>{msg}</span>
                  </div>
                )}

                <p className="mt-2.5" style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
                  Didn't get it? Check spam/promotions — you can also verify anytime from your account.
                </p>
              </div>
            ) : (
              <div className="mt-6 rounded-xl p-4 flex items-center gap-2.5" style={{ background: T.greenTint, border: `1px solid ${T.green}` }}>
                <ShieldCheck size={20} strokeWidth={2} color={T.greenDk} style={{ flexShrink: 0 }} />
                <p style={{ color: T.soil, fontSize: 13.5, lineHeight: 1.5 }}>
                  <strong style={{ color: T.greenDk }}>Email verified via Google.</strong> {data.email} is confirmed — you're all set.
                </p>
              </div>
            )}

            {highTrust && (
              <div className="mt-4 rounded-xl p-3 flex items-start gap-2 text-left" style={{ background: "var(--muted-bg)", border: `1px solid ${T.line}` }}>
                <ShieldCheck size={16} strokeWidth={2} color={T.soil2} style={{ marginTop: 1, flexShrink: 0 }} />
                <p style={{ fontSize: 12.5, color: T.soil, lineHeight: 1.5 }}>
                  Your <strong>{profileLabel}</strong> features unlock after we verify your account. We'll be in touch shortly.
                </p>
              </div>
            )}

            <div className="mt-6 pt-5 text-center" style={{ borderTop: `1px solid ${T.line}` }}>
              <p style={{ fontSize: 13.5, color: T.muted }}>
                Already verified?{" "}
                <Link to="/login" className="font-medium hover:underline" style={{ color: T.greenDk }}>Sign in</Link>
              </p>
            </div>
          </div>
          <p className="text-center text-xs mt-5" style={{ color: T.muted }}>Connecting Pacific Island farmers 🌏</p>
        </div>
      </div>
    </div>
  );
}

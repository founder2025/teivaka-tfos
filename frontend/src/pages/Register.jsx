/**
 * Register.jsx — Teivaka Farm OS Registration Page
 *
 * Two-step flow:
 *   Step 1: Privacy Policy & Terms of Service acceptance (hard gate)
 *   Step 2: Full registration form with fraud-prevention fields
 *
 * Features:
 *   - Privacy acceptance required before form is shown
 *   - Password field hidden by default, eye-icon toggle to reveal
 *   - Strong password indicator (visual strength bar)
 *   - E.164 phone number formatting hint
 *   - Real-time field validation with clear error messages
 *   - Account type selector (Farmer / Supplier / Buyer / Other)
 *   - Date of birth with age gate messaging
 *   - Fully responsive — optimised for mobile field workers
 *
 * API: POST /api/v1/auth/register
 */

import { useState, useEffect, useRef } from "react";

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
// Constants
// ---------------------------------------------------------------------------

const ACCOUNT_TYPES = [
  { value: "FARMER",   label: "Farmer",   icon: "🌱" },
  { value: "SUPPLIER", label: "Supplier", icon: "🏭" },
  { value: "BUYER",    label: "Buyer",    icon: "🛒" },
  { value: "OTHER",    label: "Other",    icon: "👤" },
];

const PRIVACY_POLICY_VERSION = "1.0";

// ---------------------------------------------------------------------------
// Password complexity check (kept simple — no strength meter)
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

// ---------------------------------------------------------------------------
// Field — module-scope wrapper. MUST stay outside RegistrationForm to keep
// React component identity stable across renders (otherwise inputs unmount
// + remount on every keystroke and lose focus).
// ---------------------------------------------------------------------------

function Field({ label, id, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-500 mt-1">⚠ {error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Eye icon (show/hide password)
// ---------------------------------------------------------------------------

function EyeIcon({ open }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7
           -1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7
           a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243
           M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29
           M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7
           a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Privacy Policy Gate
// ---------------------------------------------------------------------------

function PrivacyGate({ onAccept }) {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [accepted, setAccepted] = useState(false);

  function handleScroll(e) {
    const el = e.target;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 40;
    if (atBottom) setScrolledToBottom(true);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="bg-emerald-600 rounded-t-2xl px-6 py-5 text-white text-center">
          <div className="text-3xl mb-1">🌿</div>
          <h1 className="text-xl font-bold">Welcome to Teivaka Farm OS</h1>
          <p className="text-emerald-100 text-sm mt-1">
            Please read and accept our policies before continuing
          </p>
        </div>

        {/* Policy text */}
        <div
          className="mx-6 mt-5 h-64 overflow-y-auto border border-gray-200 rounded-lg p-4 text-sm text-gray-600 leading-relaxed bg-gray-50"
          onScroll={handleScroll}
        >
          <h2 className="font-bold text-gray-800 mb-2">Privacy Policy — Version {PRIVACY_POLICY_VERSION}</h2>
          <p className="mb-3">
            Teivaka Limited ("Teivaka", "we", "us") operates the Teivaka Farm Operating System
            (TFOS). This policy explains how we collect, use, and protect your personal information.
          </p>

          <h3 className="font-semibold text-gray-700 mb-1">1. Information We Collect</h3>
          <p className="mb-3">
            When you register, we collect your full name, email address, phone number,
            date of birth, country of residence, and account type. We also record your
            IP address and device information at registration to prevent fraud and protect
            the platform community.
          </p>

          <h3 className="font-semibold text-gray-700 mb-1">2. How We Use Your Information</h3>
          <p className="mb-3">
            Your data is used to operate your farm account, send operational alerts via
            WhatsApp, provide AI-assisted farming intelligence (TIS), and improve our
            platform. We do not sell your data to third parties.
          </p>

          <h3 className="font-semibold text-gray-700 mb-1">3. Data Security</h3>
          <p className="mb-3">
            All data is encrypted in transit (TLS 1.3) and at rest. Passwords are hashed
            using bcrypt and are never stored in plain text. Access to your data is
            protected by row-level security — no other tenant can access your farm data.
          </p>

          <h3 className="font-semibold text-gray-700 mb-1">4. Fraud Prevention</h3>
          <p className="mb-3">
            To protect all platform users, we log registration attempts, IP addresses,
            and device fingerprints. Accounts found to be fraudulent or spam will be
            permanently suspended without refund.
          </p>

          <h3 className="font-semibold text-gray-700 mb-1">5. Your Rights</h3>
          <p className="mb-3">
            You may request access to, correction of, or deletion of your personal data
            at any time by contacting support@teivaka.com. Data deletion requests will be
            processed within 30 days.
          </p>

          <h3 className="font-semibold text-gray-700 mb-1">6. Age Requirement</h3>
          <p className="mb-3">
            You must be at least 18 years old to register. By providing your date of birth,
            you confirm you meet this requirement.
          </p>

          <h2 className="font-bold text-gray-800 mb-2 mt-4">Terms of Service</h2>
          <p className="mb-3">
            By registering, you agree to use Teivaka Farm OS only for lawful agricultural
            business purposes. You are responsible for all activity under your account.
            Misuse, including spam, false information, or unauthorised access attempts,
            will result in immediate account termination.
          </p>

          <p className="text-xs text-gray-400 mt-4 text-center">
            — End of Policy — Scroll to the bottom to accept
          </p>
        </div>

        {/* Acceptance checkbox */}
        <div className="px-6 mt-4">
          <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-lg border transition-colors ${
            scrolledToBottom
              ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
              : "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"
          }`}>
            <input
              type="checkbox"
              disabled={!scrolledToBottom}
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-emerald-600"
            />
            <span className="text-sm text-gray-700">
              I have read and agree to Teivaka's{" "}
              <span className="font-semibold text-emerald-700">Privacy Policy</span>{" "}
              and{" "}
              <span className="font-semibold text-emerald-700">Terms of Service</span>.
              I confirm I am at least 18 years old.
            </span>
          </label>
          {!scrolledToBottom && (
            <p className="text-xs text-gray-400 mt-1 ml-1">
              ↑ Please scroll through the full policy above to enable this checkbox.
            </p>
          )}
        </div>

        {/* CTA */}
        <div className="px-6 pb-6 mt-4">
          <button
            disabled={!accepted}
            onClick={() => onAccept(true)}
            className={`w-full py-3 rounded-xl font-semibold text-white transition-all ${
              accepted
                ? "bg-emerald-600 hover:bg-emerald-700 shadow-md hover:shadow-lg"
                : "bg-gray-300 cursor-not-allowed"
            }`}
          >
            Accept & Continue to Registration
          </button>
          <p className="text-center text-xs text-gray-400 mt-3">
            Already have an account?{" "}
            <a href="/login" className="text-emerald-600 hover:underline font-medium">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Registration Form
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

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: "" }));
    setServerError("");
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
        setServerError(data.detail || "Registration failed. Please try again.");
        return;
      }

      // Store tokens
      localStorage.setItem("tfos_access_token", data.access_token);
      localStorage.setItem("tfos_refresh_token", data.refresh_token);

      onSuccess(data);
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = (field) =>
    `w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-colors ${
      errors[field] ? "border-red-400 bg-red-50" : "border-gray-300 bg-white"
    }`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="bg-emerald-600 rounded-t-2xl px-6 py-5 text-white text-center">
          <div className="text-3xl mb-1">🌿</div>
          <h1 className="text-xl font-bold">Create Your Teivaka Account</h1>
          <p className="text-emerald-100 text-sm mt-1">
            Your farm management platform starts here
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Server error banner */}
          {serverError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex gap-2">
              <span>⚠</span>
              <span>{serverError}</span>
            </div>
          )}

          {/* Account Type */}
          <Field label="I am a..." id="account_type" error={errors.account_type}>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {ACCOUNT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => update("account_type", t.value)}
                  className={`flex flex-col items-center py-2 px-1 rounded-lg border text-xs font-medium transition-all ${
                    form.account_type === t.value
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 text-gray-600 hover:border-emerald-300"
                  }`}
                >
                  <span className="text-lg mb-0.5">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </Field>

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name *" id="first_name" error={errors.first_name}>
              <input
                id="first_name"
                type="text"
                autoComplete="given-name"
                value={form.first_name}
                onChange={(e) => update("first_name", e.target.value)}
                placeholder="e.g. Cody"
                className={inputCls("first_name")}
              />
            </Field>
            <Field label="Last Name *" id="last_name" error={errors.last_name}>
              <input
                id="last_name"
                type="text"
                autoComplete="family-name"
                value={form.last_name}
                onChange={(e) => update("last_name", e.target.value)}
                placeholder="e.g. Viliami"
                className={inputCls("last_name")}
              />
            </Field>
          </div>

          {/* Email */}
          <Field
            label="Email Address *"
            id="email"
            error={errors.email}
            hint="Use a permanent email — disposable addresses are not accepted"
          >
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value.toLowerCase())}
              placeholder="you@example.com"
              className={inputCls("email")}
            />
          </Field>

          {/* Password */}
          <Field label="Password *" id="password" error={errors.password}>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="Min 8 chars — uppercase, number & symbol"
                className={`${inputCls("password")} pr-10`}
              />
              {/* Toggle button */}
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </Field>

          {/* Confirm Password */}
          <Field label="Confirm Password *" id="confirm_password" error={errors.confirmPw}>
            <div className="relative">
              <input
                id="confirm_password"
                type={showConfirmPw ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPw}
                onChange={(e) => { setConfirmPw(e.target.value); setErrors((er) => ({ ...er, confirmPw: "" })); }}
                placeholder="Re-enter your password"
                className={`${inputCls("confirmPw")} pr-10`}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowConfirmPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                aria-label={showConfirmPw ? "Hide password" : "Show password"}
              >
                <EyeIcon open={showConfirmPw} />
              </button>
            </div>
          </Field>

          {/* Phone */}
          <Field
            label="Phone Number"
            id="phone_number"
            error={errors.phone_number}
            hint="Optional — used for WhatsApp alerts and two-factor login."
          >
            <div ref={phoneDropdownRef} style={{ position: "relative" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button"
                  onClick={() => { setPhoneDropdownOpen(v => !v); setPhoneSearch(""); }}
                  style={{ flexShrink: 0, border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 12px", background: "#fff", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                  {selectedCountry.flag} {selectedCountry.code} ▾
                </button>
                <input type="tel" value={phoneLocal}
                  onChange={e => setPhoneLocal(e.target.value)}
                  placeholder="9123456"
                  autoComplete="tel-national"
                  style={{ flex: 1, border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 12px", fontSize: 15, outline: "none" }} />
              </div>
              {phoneDropdownOpen && (
                <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, width: 260, maxHeight: 240, overflowY: "auto", marginTop: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
                  <input type="text" value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)}
                    placeholder="Search country..."
                    autoFocus
                    style={{ width: "100%", border: "none", borderBottom: "1px solid #e5e7eb", padding: "10px 12px", fontSize: 14, outline: "none" }} />
                  {filteredCountries.map(c => (
                    <button key={c.iso} type="button"
                      onClick={() => { setPhoneCountry(c.iso); setPhoneDropdownOpen(false); setPhoneSearch(""); }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "none", background: c.iso === phoneCountry ? "#f0fdf4" : "transparent", cursor: "pointer", fontSize: 14, textAlign: "left" }}>
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
              <input
                type="checkbox"
                checked={sameAsPhone}
                onChange={(e) => setSameAsPhone(e.target.checked)}
                className="accent-emerald-600"
              />
              My WhatsApp number is the same as my phone number
            </label>
            {!sameAsPhone && (
              <Field label="WhatsApp Number" id="whatsapp_number" error={errors.whatsapp_number}
                hint="Used for farm alerts and TIS AI messages">
                <input
                  id="whatsapp_number"
                  type="tel"
                  value={form.whatsapp_number}
                  onChange={(e) => update("whatsapp_number", e.target.value)}
                  placeholder="+6799123456"
                  className={inputCls("whatsapp_number")}
                />
              </Field>
            )}
          </div>

          {/* Date of Birth */}
          <Field
            label="Date of Birth *"
            id="date_of_birth"
            error={errors.date_of_birth}
            hint="You must be 18 or older to register"
          >
            <input
              id="date_of_birth"
              type="date"
              max={new Date(new Date().setFullYear(new Date().getFullYear() - 18))
                .toISOString().split("T")[0]}
              value={form.date_of_birth}
              onChange={(e) => update("date_of_birth", e.target.value)}
              className={inputCls("date_of_birth")}
            />
          </Field>

          {/* Country */}
          <Field label="Country" id="country" error={errors.country}>
            <select
              id="country"
              value={form.country}
              onChange={(e) => update("country", e.target.value)}
              className={inputCls("country")}
            >
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
            <select
              id="referral_source"
              value={form.referral_source}
              onChange={(e) => update("referral_source", e.target.value)}
              className={inputCls("referral_source")}
            >
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
            <input
              id="referral_code"
              type="text"
              value={form.referral_code}
              onChange={(e) => update("referral_code", e.target.value.toUpperCase())}
              maxLength={16}
              placeholder="e.g. 7K2QH9XM"
              className={inputCls("referral_code")}
              autoComplete="off"
            />
          </Field>

          {/* Privacy reminder */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-700">
            ✅ You accepted our Privacy Policy and Terms of Service (v{PRIVACY_POLICY_VERSION}).
            Your registration IP and device info are logged for fraud prevention.
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 rounded-xl font-semibold text-white transition-all mt-2 ${
              loading
                ? "bg-emerald-400 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-700 shadow-md hover:shadow-lg"
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Creating your account...
              </span>
            ) : "Create My Account →"}
          </button>

          <p className="text-center text-xs text-gray-400">
            Already have an account?{" "}
            <a href="/login" className="text-emerald-600 hover:underline font-medium">Sign in</a>
          </p>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export — orchestrates the two-step flow
// ---------------------------------------------------------------------------

export default function Register() {
  const [step, setStep] = useState("privacy");  // "privacy" | "form" | "success"
  const [accountData, setAccountData] = useState(null);

  if (step === "privacy") {
    return <PrivacyGate onAccept={() => setStep("form")} />;
  }

  if (step === "success" && accountData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md text-center p-8">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-800">Welcome to Teivaka!</h2>
          <p className="text-gray-500 mt-2">
            Hello <strong>{accountData.display_name}</strong> — your farm account is ready.
          </p>
          <div className="mt-4 bg-emerald-50 rounded-lg p-3 text-sm text-emerald-700">
            <p>Your plan: <strong>FREE</strong></p>
            <p>TIS queries: <strong>5 per day</strong></p>
          </div>
          <a
            href="/dashboard"
            className="mt-6 inline-block w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-colors"
          >
            Go to My Dashboard →
          </a>
        </div>
      </div>
    );
  }

  return (
    <RegistrationForm
      onSuccess={(data) => {
        setAccountData(data);
        setStep("success");
      }}
    />
  );
}

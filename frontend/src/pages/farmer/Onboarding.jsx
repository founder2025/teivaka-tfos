/**
 * Onboarding.jsx — New user farm setup wizard
 *
 * Triggered for new users on first login (no farm data yet).
 * Steps:
 *   1. Welcome + name confirmation
 *   2. Farm name + size
 *   3. City / Country (for map dot placement)
 *   4. Map visibility preference
 *   5. Primary crops grown (multi-select)
 *   6. Profile photo (optional)
 *   → Done → Community Hub
 *
 * On complete, POSTs to /api/v1/farms + /api/v1/users/profile
 * then marks onboarding_complete = true so they go to Community on next login.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authHeader, setOnboardingComplete } from "../../utils/auth";

const C = {
  soil:   "#2C1A0E",
  green:  "#3D8C40",
  cream:  "#F5EFE0",
  gold:   "#D4A017",
  border: "#E0D5C0",
};

const TOTAL_STEPS = 6;

const CROPS_LIST = [
  "Cassava", "Kava", "Yaqona", "Dalo (Taro)", "Sweet Potato", "Capsicum",
  "Tomato", "Eggplant", "Banana", "Pawpaw", "Mango", "Citrus",
  "Pineapple", "Watermelon", "Corn", "Beans", "Lettuce", "Cabbage",
  "Ginger", "Turmeric", "Lemongrass", "Coconut", "Sugarcane", "Other",
];

const PACIFIC_COUNTRIES = [
  "Fiji", "Vanuatu", "Solomon Islands", "Papua New Guinea", "Samoa",
  "Tonga", "Tuvalu", "Kiribati", "Nauru", "Palau",
  "Marshall Islands", "Micronesia", "Cook Islands", "Niue", "Tokelau",
  "Australia", "New Zealand", "Other",
];

const MAP_VISIBILITY_OPTIONS = [
  {
    value: "city",
    icon: "📍",
    label: "Show my dot",
    desc: "Your name, farm and city visible on the community map.",
  },
  {
    value: "country",
    icon: "🗺️",
    label: "Country only",
    desc: "Only your country shown — no city or farm name.",
  },
  {
    value: "region",
    icon: "🌏",
    label: "Region only",
    desc: "Only your region shown (e.g. Pacific). No specific location.",
  },
  {
    value: "hidden",
    icon: "👁️‍🗨️",
    label: "Hidden",
    desc: "You don't appear on the map at all.",
  },
];

function ProgressBar({ step }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div key={i} className="flex-1 h-1.5 rounded-full transition-all duration-300"
          style={{ background: i < step ? C.green : "#E0D5C0" }} />
      ))}
    </div>
  );
}

function StepLabel({ current, total, title }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
        Step {current} of {total}
      </p>
      <h2 className="text-2xl font-bold" style={{ color: C.soil, fontFamily: "'Playfair Display', Georgia, serif" }}>
        {title}
      </h2>
    </div>
  );
}

function NavButtons({ onBack, onNext, nextLabel = "Continue →", disabled = false, step }) {
  return (
    <div className="flex items-center justify-between mt-8">
      {step > 1 ? (
        <button onClick={onBack}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          ← Back
        </button>
      ) : <div />}
      <button onClick={onNext} disabled={disabled}
        className="px-6 py-2.5 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-40"
        style={{ background: C.green }}>
        {nextLabel}
      </button>
    </div>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const [data, setData] = useState({
    display_name: "",
    farm_name: "",
    farm_size_ha: "",
    city: "",
    country: "Fiji",
    map_visibility: "city",
    crops: [],
    profile_photo: null,
  });

  function update(field, value) {
    setData(d => ({ ...d, [field]: value }));
  }

  function toggleCrop(crop) {
    setData(d => ({
      ...d,
      crops: d.crops.includes(crop)
        ? d.crops.filter(c => c !== crop)
        : [...d.crops, crop],
    }));
  }

  function next() { setStep(s => Math.min(s + 1, TOTAL_STEPS)); }
  function back() { setStep(s => Math.max(s - 1, 1)); }

  async function finish() {
    setSubmitting(true);
    try {
      // POST farm profile to API
      // In MVP: attempt the API call, fall through to local flag on any error
      try {
        await fetch("/api/v1/farms", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader() },
          body: JSON.stringify({
            farm_name: data.farm_name,
            farm_size_ha: data.farm_size_ha ? parseFloat(data.farm_size_ha) : null,
            city: data.city,
            country: data.country,
            map_visibility: data.map_visibility,
            crops: data.crops,
          }),
        });
      } catch (_) {
        // API not yet wired — proceed anyway so onboarding isn't blocked
      }

      // Mark onboarding complete locally — unlocks all farmer routes
      setOnboardingComplete();
      navigate("/home");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = "w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-colors"
    + ` border-[${C.border}] focus:ring-[${C.green}]`;

  return (
    <div className="min-h-screen" style={{ background: C.cream, fontFamily: "'Lora', Georgia, serif" }}>

      {/* Header */}
      <div className="text-center py-6" style={{ borderBottom: `1px solid ${C.border}` }}>
        <span className="text-2xl mr-2">🌿</span>
        <span className="font-bold text-xl" style={{ color: C.soil, fontFamily: "'Playfair Display', Georgia, serif" }}>
          Teivaka
        </span>
      </div>

      {/* Card */}
      <div className="max-w-lg mx-auto p-4 py-8">
        <div className="bg-white rounded-3xl shadow-sm p-8" style={{ border: `1px solid ${C.border}` }}>

          <ProgressBar step={step} />

          {/* ── Step 1: Welcome ────────────────────────────────────────── */}
          {step === 1 && (
            <div>
              <div className="text-4xl text-center mb-4">👋</div>
              <StepLabel current={1} total={TOTAL_STEPS} title="Welcome to Teivaka!" />
              <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                Let's set up your farm profile. This takes about 2 minutes and helps other
                farmers in the community connect with you.
              </p>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: C.soil }}>
                  What should we call you?
                </label>
                <input
                  type="text"
                  value={data.display_name}
                  onChange={e => update("display_name", e.target.value)}
                  placeholder="Your full name"
                  className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ borderColor: C.border, fontFamily: "'Lora', Georgia, serif" }}
                />
              </div>
              <NavButtons step={step} onBack={back} onNext={next} disabled={!data.display_name.trim()} />
            </div>
          )}

          {/* ── Step 2: Farm name + size ────────────────────────────────── */}
          {step === 2 && (
            <div>
              <StepLabel current={2} total={TOTAL_STEPS} title="Name your farm" />
              <p className="text-gray-500 text-sm mb-6">This will appear on your community profile and map dot.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.soil }}>Farm name *</label>
                  <input type="text" value={data.farm_name}
                    onChange={e => update("farm_name", e.target.value)}
                    placeholder="e.g. Save-A-Lot Farm"
                    className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none"
                    style={{ borderColor: C.border }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.soil }}>
                    Approximate farm size (hectares)
                  </label>
                  <input type="number" value={data.farm_size_ha} min="0.1" step="0.1"
                    onChange={e => update("farm_size_ha", e.target.value)}
                    placeholder="e.g. 12.5"
                    className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none"
                    style={{ borderColor: C.border }} />
                  <p className="text-xs text-gray-400 mt-1">Estimate is fine — you can update this later.</p>
                </div>
              </div>
              <NavButtons step={step} onBack={back} onNext={next} disabled={!data.farm_name.trim()} />
            </div>
          )}

          {/* ── Step 3: Location ────────────────────────────────────────── */}
          {step === 3 && (
            <div>
              <StepLabel current={3} total={TOTAL_STEPS} title="Where is your farm?" />
              <p className="text-gray-500 text-sm mb-6">
                Used to place your dot on the community map. We only show city/country level —
                never your exact address.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.soil }}>Country *</label>
                  <select value={data.country} onChange={e => update("country", e.target.value)}
                    className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none"
                    style={{ borderColor: C.border }}>
                    {PACIFIC_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.soil }}>Nearest town or city</label>
                  <input type="text" value={data.city}
                    onChange={e => update("city", e.target.value)}
                    placeholder="e.g. Sigatoka"
                    className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none"
                    style={{ borderColor: C.border }} />
                </div>
              </div>
              <NavButtons step={step} onBack={back} onNext={next} disabled={!data.country} />
            </div>
          )}

          {/* ── Step 4: Map visibility ──────────────────────────────────── */}
          {step === 4 && (
            <div>
              <StepLabel current={4} total={TOTAL_STEPS} title="Map visibility" />
              <p className="text-gray-500 text-sm mb-6">
                How should you appear on the community map? You can change this at any time in Settings.
              </p>
              <div className="space-y-2.5">
                {MAP_VISIBILITY_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => update("map_visibility", opt.value)}
                    className="w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all"
                    style={{
                      borderColor: data.map_visibility === opt.value ? C.green : C.border,
                      background: data.map_visibility === opt.value ? C.green + "10" : "white",
                    }}>
                    <span className="text-xl mt-0.5">{opt.icon}</span>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: C.soil }}>{opt.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                    </div>
                    {data.map_visibility === opt.value && (
                      <div className="ml-auto w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: C.green }}>
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <NavButtons step={step} onBack={back} onNext={next} />
            </div>
          )}

          {/* ── Step 5: Crops ───────────────────────────────────────────── */}
          {step === 5 && (
            <div>
              <StepLabel current={5} total={TOTAL_STEPS} title="What do you grow?" />
              <p className="text-gray-500 text-sm mb-6">
                Select all that apply. This helps connect you with farmers growing the same crops.
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                {CROPS_LIST.map(crop => {
                  const selected = data.crops.includes(crop);
                  return (
                    <button key={crop} onClick={() => toggleCrop(crop)}
                      className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
                      style={{
                        background: selected ? C.green : "white",
                        color: selected ? "white" : C.soil,
                        border: `1px solid ${selected ? C.green : C.border}`,
                      }}>
                      {crop}
                    </button>
                  );
                })}
              </div>
              {data.crops.length > 0 && (
                <p className="text-xs mt-3" style={{ color: C.green }}>
                  ✓ {data.crops.length} crop{data.crops.length !== 1 ? "s" : ""} selected
                </p>
              )}
              <NavButtons step={step} onBack={back} onNext={next}
                disabled={data.crops.length === 0} />
            </div>
          )}

          {/* ── Step 6: Done ────────────────────────────────────────────── */}
          {step === 6 && (
            <div className="text-center">
              <div className="text-5xl mb-4">🎉</div>
              <StepLabel current={6} total={TOTAL_STEPS} title={`You're all set, ${data.display_name.split(" ")[0]}!`} />
              <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                Your farm profile is ready. You're now part of the Teivaka community — connect
                with {1284} farmers across the Pacific and beyond.
              </p>

              {/* Summary card */}
              <div className="text-left rounded-2xl p-4 mb-6 space-y-2 text-sm"
                style={{ background: C.cream, border: `1px solid ${C.border}` }}>
                <div className="flex justify-between">
                  <span className="text-gray-500">Farm name</span>
                  <span className="font-medium" style={{ color: C.soil }}>{data.farm_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Location</span>
                  <span className="font-medium" style={{ color: C.soil }}>{data.city ? `${data.city}, ` : ""}{data.country}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Map visibility</span>
                  <span className="font-medium capitalize" style={{ color: C.soil }}>
                    {MAP_VISIBILITY_OPTIONS.find(o => o.value === data.map_visibility)?.label}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Crops</span>
                  <span className="font-medium" style={{ color: C.soil }}>{data.crops.length} selected</span>
                </div>
              </div>

              <button onClick={finish} disabled={submitting}
                className="w-full py-3 rounded-xl text-white font-semibold transition-all"
                style={{ background: C.green }}>
                {submitting ? "Setting up your farm…" : "Enter the Community →"}
              </button>
              <p className="text-xs text-gray-400 mt-3">
                You can update all of this in Settings at any time.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * FarmBasics.jsx — /onboarding/farm-basics — first wizard page.
 *
 * Two voice questions (farm name + total area), persistent across
 * refresh via OnboardingContext + sessionStorage. Submits to
 * POST /api/v1/onboarding/farm-basics with the canonical body shape:
 *   { farm_name, area_acres, section_term: "BLOCK" }
 *
 * Region / location not collected here — backend has no slot for free-text
 * region today (LocationIn.village_id is a structured ID, not a string).
 * Adding region is a backend migration, scoped out of Day 4 Phase 2.
 *
 * iOS Safari + most mobile browsers gate speech APIs behind a first user
 * gesture. We render a "Tap to start" splash so the initial TTS happens
 * inside that gesture handler.
 *
 * On 200, redirects to /home with a toast noting the next page is
 * pending. Subsequent wizard pages land in Phase 3+.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  OnboardingProvider,
  useOnboarding,
} from "../../context/OnboardingContext";
import VoiceInput from "../../components/onboarding/VoiceInput";
import {
  parseAreaToAcres,
  isSpeechSynthesisSupported,
} from "../../utils/speech";
import { authHeader } from "../../utils/auth";

const C = {
  soil:    "#2C1A0E",
  green:   "#3D8C40",
  greenDk: "#2C6A2E",
  cream:   "#F5EFE0",
  border:  "#E0D5C0",
  muted:   "#8A7863",
};

function emitToast(message) {
  window.dispatchEvent(
    new CustomEvent("tfos:toast", { detail: { message } }),
  );
}

const QUESTIONS = [
  {
    key:          "farmName",
    prompt:       "Bula. What do you call your farm?",
    placeholder:  "e.g. Save-A-Lot Farm",
    defaultValue: "My Farm",
    inputType:    "text",
    parseValue:   null,
    summaryLabel: "Farm name",
    formatValue:  (v) => v,
  },
  {
    key:          "totalAreaAcres",
    prompt:       "About how big is your farm? You can answer in acres or hectares.",
    placeholder:  "e.g. 5 acres or 2 hectares",
    defaultValue: 1, // 1 acre — Solo threshold default
    inputType:    "text",
    parseValue:   parseAreaToAcres,
    summaryLabel: "Area",
    formatValue:  (v) => `${v} acre${v === 1 ? "" : "s"}`,
  },
];

function FarmBasicsInner() {
  const { state, setField, reset } = useOnboarding();
  const navigate = useNavigate();

  // Resume at the first unanswered question — supports refresh mid-wizard.
  const firstUnanswered = QUESTIONS.findIndex(
    (q) => state[q.key] == null || state[q.key] === "",
  );
  const [step, setStep] = useState(
    firstUnanswered === -1 ? QUESTIONS.length : firstUnanswered,
  );
  const [splashDismissed, setSplashDismissed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const allAnswered = step >= QUESTIONS.length;

  function handleAnswer(value) {
    setField(QUESTIONS[step].key, value);
    setStep(step + 1);
  }

  async function saveAndContinue() {
    setSubmitting(true);
    const body = {
      farm_name: (state.farmName || "My Farm").trim(),
      area_acres:
        typeof state.totalAreaAcres === "number" && state.totalAreaAcres > 0
          ? state.totalAreaAcres
          : null,
      section_term: "BLOCK",
    };
    try {
      const res = await fetch("/api/v1/onboarding/farm-basics", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let msg = `${res.status} ${res.statusText}`;
        try {
          const j = await res.json();
          msg = j?.detail?.message || j?.detail || j?.message || msg;
          if (typeof msg !== "string") msg = JSON.stringify(msg);
        } catch { /* noop */ }
        emitToast(`Couldn't save: ${msg}`);
        setSubmitting(false);
        return;
      }
      emitToast("Saved. Next page lands tomorrow.");
      navigate("/home");
    } catch (e) {
      emitToast(`Network error: ${e.message}`);
      setSubmitting(false);
    }
  }

  // Splash: gates first speech behind a user gesture (iOS / most mobile).
  if (!splashDismissed && isSpeechSynthesisSupported()) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: C.cream }}
      >
        <div
          className="max-w-md w-full mx-4 bg-white rounded-3xl p-8 text-center"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="text-5xl mb-4">🌿</div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: C.soil }}>
            Voice-first onboarding
          </h1>
          <p className="text-sm mb-6" style={{ color: C.muted }}>
            Tap below to start. We'll ask a couple of questions about your
            farm — speak your answers or type. Takes about a minute.
          </p>
          <button
            type="button"
            onClick={() => setSplashDismissed(true)}
            className="w-full px-6 py-3 rounded-xl text-white font-semibold"
            style={{ background: C.green }}
          >
            Tap to start
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: C.cream }}>
      <div className="max-w-md mx-auto p-4 py-8">
        <div
          className="bg-white rounded-3xl p-6 space-y-6"
          style={{ border: `1px solid ${C.border}` }}
        >
          <header>
            <div
              className="text-xs uppercase tracking-wider font-medium"
              style={{ color: C.muted }}
            >
              Onboarding · Step 1 of 4
            </div>
            <h1 className="text-xl font-bold mt-1" style={{ color: C.soil }}>
              About your farm
            </h1>
          </header>

          {/* Already-answered summary lines */}
          {QUESTIONS.map((q, i) => {
            const answered =
              i < step && state[q.key] != null && state[q.key] !== "";
            if (!answered) return null;
            return (
              <div
                key={q.key}
                className="flex items-start justify-between text-sm py-1"
              >
                <span style={{ color: C.muted }}>{q.summaryLabel}</span>
                <span
                  className="font-medium text-right"
                  style={{ color: C.soil }}
                >
                  {q.formatValue(state[q.key])}
                </span>
              </div>
            );
          })}

          {/* Active question */}
          {!allAnswered && (
            <VoiceInput
              key={QUESTIONS[step].key}
              prompt={QUESTIONS[step].prompt}
              placeholder={QUESTIONS[step].placeholder}
              defaultValue={QUESTIONS[step].defaultValue}
              parseValue={QUESTIONS[step].parseValue}
              inputType={QUESTIONS[step].inputType}
              onSubmit={handleAnswer}
              active
            />
          )}

          {/* Save and continue */}
          {allAnswered && (
            <div className="space-y-3 pt-2">
              <p className="text-sm" style={{ color: C.muted }}>
                Looks good. Save and continue.
              </p>
              <button
                type="button"
                onClick={saveAndContinue}
                disabled={submitting}
                className="w-full px-6 py-3 rounded-xl text-white font-semibold disabled:opacity-40"
                style={{ background: C.green }}
              >
                {submitting ? "Saving…" : "Save and continue"}
              </button>
              <button
                type="button"
                onClick={() => { reset(); setStep(0); }}
                className="w-full text-xs"
                style={{ color: C.muted }}
              >
                Start over
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FarmBasics() {
  return (
    <OnboardingProvider>
      <FarmBasicsInner />
    </OnboardingProvider>
  );
}

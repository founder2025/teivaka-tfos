/**
 * VoiceInput — reusable voice + typed-text + skip primitive.
 *
 * Stages:
 *   idle       — three big buttons: Hold to speak / Type instead / Skip
 *   listening  — mic active (held)
 *   confirming — heard transcript, waiting for Yes / Try again / Edit
 *   typing     — text input fallback
 *
 * Auto-speaks the prompt on mount when `active`. Mic button hidden
 * automatically when the browser lacks SpeechRecognition (Firefox).
 *
 * If `parseValue` is provided (e.g., parseAreaToAcres), it transforms
 * the transcript before submit. A null parse result triggers a retry
 * prompt instead of submitting garbage.
 */
import { useEffect, useRef, useState } from "react";
import {
  Mic,
  Keyboard,
  SkipForward,
  Check,
  RefreshCw,
  Edit3,
} from "lucide-react";

import {
  speak,
  listen,
  detectUnit,
  isSpeechRecognitionSupported,
} from "../../utils/speech";

const ACRES_PER_HECTARE = 2.47105;

const C = {
  soil:    "#2C1A0E",
  green:   "#3D8C40",
  greenDk: "#2C6A2E",
  red:     "#D4442E",
  cream:   "#F5EFE0",
  border:  "#E0D5C0",
  muted:   "#8A7863",
};

export default function VoiceInput({
  prompt,
  placeholder,
  defaultValue,
  parseValue,         // optional: transcript → typed value
  inputType = "text", // "text" | "number"
  onSubmit,
  active = true,
}) {
  const [stage, setStage] = useState("idle");
  const [heard, setHeard] = useState("");
  const [parsed, setParsed] = useState(null);
  const [pendingNumber, setPendingNumber] = useState(null); // for needsUnit stage
  const [typed, setTyped] = useState("");
  const stopRef = useRef(null);
  const sttSupported = isSpeechRecognitionSupported();

  function finalizeWithUnit(value, unit) {
    const acres = unit === "hectare"
      ? +(value * ACRES_PER_HECTARE).toFixed(2)
      : value;
    setHeard(`${value} ${unit}${value === 1 ? "" : "s"}`);
    setParsed(acres);
    setPendingNumber(null);
    setStage("confirming");
    speak(`Got it. ${acres} acres. Right?`);
  }

  function listenForUnit() {
    if (!sttSupported || pendingNumber == null) return;
    stopRef.current = listen({
      onResult: ({ transcript }) => {
        const unit = detectUnit(transcript || "");
        if (unit) {
          finalizeWithUnit(pendingNumber, unit);
        } else {
          // Stay in needsUnit stage, prompt again.
          speak("Please say acres or hectares.");
        }
      },
      onError: () => { /* leave buttons visible */ },
      onEnd: () => { /* state already handled */ },
    });
  }

  // Auto-speak on mount (or when prompt changes for an active instance).
  useEffect(() => {
    if (active && prompt) speak(prompt);
    return () => {
      try { stopRef.current?.(); } catch { /* noop */ }
    };
  }, [active, prompt]);

  function startListening() {
    if (!sttSupported) return;
    setStage("listening");
    setHeard("");
    setParsed(null);
    stopRef.current = listen({
      onResult: ({ transcript }) => {
        const text = (transcript || "").trim();
        setHeard(text);

        if (!parseValue) {
          setParsed(text);
          setStage("confirming");
          speak(`Got it. ${text}. Right?`);
          return;
        }

        const val = parseValue(text);
        if (val == null) {
          // Truly unparseable — re-prompt the whole question.
          speak("I didn't catch that. Please try again.");
          setStage("idle");
          return;
        }
        if (typeof val === "object" && val.needsUnit) {
          // Number heard, unit missing — prompt only for the unit.
          setPendingNumber(val.value);
          setStage("needsUnit");
          speak(`I heard ${val.value}. Acres or hectares?`);
          // Auto-listen for the unit answer after the prompt finishes.
          setTimeout(() => listenForUnit(), 1500);
          return;
        }
        // Numeric result — full parse.
        setParsed(val);
        setStage("confirming");
        speak(`Got it. ${val} acres. Right?`);
      },
      onError: () => setStage("idle"),
      onEnd: () => { /* state already handled */ },
    });
  }

  function stopListening() {
    try { stopRef.current?.(); } catch { /* noop */ }
  }

  function confirmYes() {
    onSubmit(parseValue ? parsed : heard);
  }

  function tryAgain() {
    setHeard("");
    setParsed(null);
    setStage("idle");
    speak("Try again.");
    setTimeout(() => startListening(), 600);
  }

  function switchToTyping(prefill = "") {
    setTyped(prefill);
    setStage("typing");
  }

  function submitTyped() {
    const v = typed.trim();
    if (!v) return;
    let val = v;
    if (parseValue) {
      val = parseValue(v);
      if (val == null) {
        // Bare number typed in without unit — assume the parser's target
        // unit (acres for area). Caller can still reject downstream.
        const f = parseFloat(v);
        if (!Number.isNaN(f) && f > 0) val = +f.toFixed(2);
      }
    }
    if (val == null || val === "") return;
    onSubmit(val);
  }

  function skip() {
    onSubmit(defaultValue);
  }

  // ── Confirming stage ───────────────────────────────────────────────
  if (stage === "confirming") {
    const display = parseValue ? `${parsed}` : heard;
    return (
      <div className="space-y-3">
        <p className="text-base font-semibold" style={{ color: C.soil }}>
          {prompt}
        </p>
        <div
          className="px-4 py-3 rounded-xl"
          style={{ background: C.cream, border: `1px solid ${C.border}` }}
        >
          <div className="text-xs uppercase tracking-wider" style={{ color: C.muted }}>
            We heard
          </div>
          <div className="text-lg font-semibold mt-0.5" style={{ color: C.soil }}>
            {display || "—"}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={confirmYes}
            className="flex flex-col items-center gap-1 px-3 py-3 rounded-xl text-white font-semibold"
            style={{ background: C.green }}
          >
            <Check size={20} />
            <span className="text-xs">Yes</span>
          </button>
          <button
            type="button"
            onClick={tryAgain}
            className="flex flex-col items-center gap-1 px-3 py-3 rounded-xl"
            style={{
              background: "white",
              border: `1px solid ${C.border}`,
              color: C.soil,
            }}
          >
            <RefreshCw size={20} />
            <span className="text-xs">Try again</span>
          </button>
          <button
            type="button"
            onClick={() => switchToTyping(parseValue ? `${parsed}` : heard)}
            className="flex flex-col items-center gap-1 px-3 py-3 rounded-xl"
            style={{
              background: "white",
              border: `1px solid ${C.border}`,
              color: C.soil,
            }}
          >
            <Edit3 size={20} />
            <span className="text-xs">Edit</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Unit-clarification stage ──────────────────────────────────────
  if (stage === "needsUnit") {
    return (
      <div className="space-y-3">
        <p className="text-base font-semibold" style={{ color: C.soil }}>
          {prompt}
        </p>
        <div
          className="px-4 py-3 rounded-xl"
          style={{ background: C.cream, border: `1px solid ${C.border}` }}
        >
          <div className="text-xs uppercase tracking-wider" style={{ color: C.muted }}>
            We heard
          </div>
          <div className="text-lg font-semibold mt-0.5" style={{ color: C.soil }}>
            {pendingNumber} — acres or hectares?
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => finalizeWithUnit(pendingNumber, "acre")}
            className="px-4 py-3 rounded-xl text-white font-semibold"
            style={{ background: C.green }}
          >
            Acres
          </button>
          <button
            type="button"
            onClick={() => finalizeWithUnit(pendingNumber, "hectare")}
            className="px-4 py-3 rounded-xl text-white font-semibold"
            style={{ background: C.green }}
          >
            Hectares
          </button>
        </div>
      </div>
    );
  }

  // ── Typing stage ──────────────────────────────────────────────────
  if (stage === "typing") {
    return (
      <div className="space-y-3">
        <p className="text-base font-semibold" style={{ color: C.soil }}>
          {prompt}
        </p>
        <input
          type={inputType}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={placeholder}
          autoFocus
          className="w-full px-4 py-3 rounded-xl text-base focus:outline-none"
          style={{
            background: "white",
            border: `1px solid ${C.border}`,
            color: C.soil,
          }}
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={submitTyped}
            disabled={!typed.trim()}
            className="px-4 py-3 rounded-xl text-white font-semibold disabled:opacity-40"
            style={{ background: C.green }}
          >
            Continue
          </button>
          <button
            type="button"
            onClick={skip}
            className="px-4 py-3 rounded-xl"
            style={{
              background: "white",
              border: `1px solid ${C.border}`,
              color: C.soil,
            }}
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  // ── Idle / listening ──────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <p className="text-base font-semibold" style={{ color: C.soil }}>
        {prompt}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {sttSupported && (
          <button
            type="button"
            onPointerDown={startListening}
            onPointerUp={stopListening}
            onPointerLeave={() => stage === "listening" && stopListening()}
            className="flex flex-col items-center gap-1 px-3 py-4 rounded-xl text-white font-semibold transition-all"
            style={{
              background: stage === "listening" ? C.red : C.green,
              transform: stage === "listening" ? "scale(0.98)" : "scale(1)",
              touchAction: "manipulation",
            }}
          >
            <Mic size={22} />
            <span className="text-xs">
              {stage === "listening" ? "Listening…" : "Hold to speak"}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => switchToTyping("")}
          className={`flex flex-col items-center gap-1 px-3 py-4 rounded-xl ${
            sttSupported ? "" : "col-span-2"
          }`}
          style={{
            background: "white",
            border: `1px solid ${C.border}`,
            color: C.soil,
          }}
        >
          <Keyboard size={22} />
          <span className="text-xs">Type instead</span>
        </button>
        <button
          type="button"
          onClick={skip}
          className="flex flex-col items-center gap-1 px-3 py-4 rounded-xl"
          style={{
            background: "white",
            border: `1px solid ${C.border}`,
            color: C.soil,
          }}
        >
          <SkipForward size={22} />
          <span className="text-xs">Skip</span>
        </button>
      </div>
    </div>
  );
}

/**
 * speech.js — Web Speech API wrappers for TFOS onboarding voice flow.
 *
 * No side effects on import. All speech is gated behind explicit calls.
 * Feature detection helpers let consumers gracefully degrade to typed
 * fallbacks on browsers that lack SpeechRecognition (Firefox today).
 */

const SR =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export function isSpeechSynthesisSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isSpeechRecognitionSupported() {
  return SR != null;
}

// iOS Safari, plus most browsers, gate speech APIs behind a first user
// gesture. Cheaper than UA-sniffing per platform: always render a
// "Tap to start" splash on first wizard mount and the rest cascades
// without further gating.
export function requireUserGestureForRecognition() {
  return true;
}

/**
 * speak(text, opts?) — Promise that resolves on utterance end / error.
 * Cancels any in-flight utterance first so prompts don't pile up.
 */
export function speak(text, opts = {}) {
  if (!isSpeechSynthesisSupported() || !text) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = opts.rate ?? 1.0;
      u.pitch = opts.pitch ?? 1.0;
      u.lang = opts.lang ?? "en-US";
      if (opts.voice) u.voice = opts.voice;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    } catch {
      resolve();
    }
  });
}

/**
 * listen({ onResult, onError, onEnd, lang }) — start one phrase capture.
 * Returns a stop() function. continuous=false, interimResults=false.
 * onResult receives { transcript, confidence }.
 */
export function listen({ onResult, onError, onEnd, lang = "en-US" } = {}) {
  if (!SR) {
    onError?.(new Error("SpeechRecognition not supported"));
    onEnd?.();
    return () => {};
  }
  const rec = new SR();
  rec.lang = lang;
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onresult = (e) => {
    const r = e.results[0]?.[0];
    if (r && onResult) {
      onResult({
        transcript: r.transcript || "",
        confidence: r.confidence ?? 0,
      });
    }
  };
  rec.onerror = (e) => {
    onError?.(new Error(e.error || "speech_recognition_error"));
  };
  rec.onend = () => onEnd?.();

  try {
    rec.start();
  } catch (err) {
    onError?.(err);
    onEnd?.();
  }
  return () => {
    try { rec.stop(); } catch { /* noop */ }
  };
}

// ---------------------------------------------------------------------
// parseAreaToAcres(transcript)
//
// "five acres"        → 5
// "five hectares"     → 12.36   (5 × 2.47105)
// "half a hectare"    → 1.24    (0.5 × 2.47105)
// "one acre"          → 1
// "about an acre"     → 1
// "two and a half ha" → 6.18
// "two"               → null    (no unit; ambiguous)
// ---------------------------------------------------------------------

const ACRES_PER_HECTARE = 2.47105;

const WORD_NUMBERS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50,
  half: 0.5, quarter: 0.25, third: 0.333,
  // "an acre" / "a hectare" → 1 in agricultural-area context
  an: 1, a: 1,
};

function wordsToNumber(s) {
  const tokens = s
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;

  // "two and a half" / "one and a quarter" — split on "and" and recurse.
  const andIdx = tokens.indexOf("and");
  if (andIdx > 0 && andIdx < tokens.length - 1) {
    const left = wordsToNumber(tokens.slice(0, andIdx).join(" "));
    const right = wordsToNumber(tokens.slice(andIdx + 1).join(" "));
    if (left != null && right != null) return left + right;
  }

  let total = 0;
  let matched = false;
  for (const tok of tokens) {
    if (/^[0-9.]+$/.test(tok)) {
      const n = parseFloat(tok);
      if (!Number.isNaN(n)) { total += n; matched = true; continue; }
    }
    if (tok in WORD_NUMBERS) {
      total += WORD_NUMBERS[tok];
      matched = true;
    }
  }
  return matched ? total : null;
}

export function parseAreaToAcres(transcript) {
  if (!transcript || typeof transcript !== "string") return null;
  const lower = transcript.toLowerCase().trim();

  const hasAcre = /\bacres?\b/.test(lower);
  const hasHa = /\bhectares?\b|\bha\b/.test(lower);
  if (!hasAcre && !hasHa) return null;

  // Idiomatic fractions before tokenizing: "a half" → 0.5, etc.
  const stripped = lower
    .replace(/\bhectares?\b/g, " ")
    .replace(/\bacres?\b/g, " ")
    .replace(/\bha\b/g, " ")
    .replace(/\babout\b/g, " ")
    .replace(/\baround\b/g, " ")
    .replace(/\bof\b/g, " ")
    .replace(/\b(?:a|an)\s+half\b/g, " 0.5")
    .replace(/\b(?:a|an)\s+quarter\b/g, " 0.25")
    .replace(/\b(?:a|an)\s+third\b/g, " 0.333")
    .trim();

  const value = wordsToNumber(stripped);
  if (value == null || !Number.isFinite(value) || value <= 0) return null;

  return hasHa ? +(value * ACRES_PER_HECTARE).toFixed(2) : +value.toFixed(2);
}

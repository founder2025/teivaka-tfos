/**
 * voiceDraft.js — turn a spoken sentence into a DRAFT pre-fill for the chosen verb's form.
 *
 * AI-additive by construction, and not actually an LLM: the farmer has already picked the verb
 * (so event_type + the exact field set are known), and this maps the transcript ONLY onto those
 * known fields — numbers a farmer said, enum options a farmer named, library items already loaded.
 * It never invents a value, never produces agronomic advice (Inviolable #1), and never auto-submits.
 * Every drafted field renders in the form for the farmer to confirm or fix. If nothing matches, the
 * manual form is untouched. Works with on-device Web Speech (utils/speech.js) — no backend round-trip.
 *
 * Conservative on purpose: when a value can't be assigned with confidence (e.g. several number fields
 * and no nearby keyword), it is LEFT BLANK rather than guessed wrong.
 */

const STOP = new Set([
  "a", "an", "the", "how", "many", "much", "of", "in", "did", "you", "your", "per",
  "number", "no", "qty", "id", "amount", "total_qty", "to", "was", "were", "is", "are",
  "and", "or", "for", "with", "about", "around", "some", "this", "that", "it",
]);

const WORD_NUMBERS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
};

function norm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9.\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Significant keyword tokens for a field: its name (split on _) + its ask label, minus stopwords.
function fieldKeywords(f) {
  const toks = `${(f.name || "").replace(/_/g, " ")} ${f.ask || ""}`;
  return norm(toks).split(" ").filter((t) => t && !STOP.has(t) && t.length > 1);
}

// All numbers in the transcript with their token index. STT usually returns digits ("220"),
// but we also fold simple spelled groups ("two hundred", "twelve") so either works.
function extractNumbers(words) {
  const out = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    const digits = w.replace(/,/g, "");
    if (/^\d+(\.\d+)?$/.test(digits)) { out.push({ value: parseFloat(digits), idx: i, end: i }); i++; continue; }
    if (w in WORD_NUMBERS) {
      // Greedily consume a spelled run: "two hundred twenty" → 220, "twenty five" → 25.
      let total = 0, run = 0, consumed = 0, j = i;
      while (j < words.length && words[j] in WORD_NUMBERS) {
        const n = WORD_NUMBERS[words[j]];
        if (n === 100) { run = (run || 1) * 100; }
        else if (n === 1000) { total += (run || 1) * 1000; run = 0; }
        else { run += n; }
        consumed++; j++;
      }
      total += run;
      if (consumed) { out.push({ value: total, idx: i, end: j - 1 }); i = j; continue; }
    }
    i++;
  }
  return out;
}

// Distance from a keyword to a number = nearest edge of the number's span (so "220 eggs",
// where 220 spans several spoken tokens, still reads as adjacent to "eggs").
function distance(n, kwIdx) { return Math.min(Math.abs(n.idx - kwIdx), Math.abs((n.end ?? n.idx) - kwIdx)); }

/**
 * draftFromTranscript(transcript, spec, { libraries }) -> { values, heard, matched }
 *   values  — only fields we could fill from what was said (plus notes = full transcript)
 *   matched — count of event fields (excluding notes) filled
 */
export function draftFromTranscript(transcript, spec, { libraries = {} } = {}) {
  const heard = String(transcript || "").trim();
  const values = {};
  if (!heard || !spec?.capture) return { values, heard, matched: 0 };

  const lower = norm(heard);
  const words = lower.split(" ").filter(Boolean);
  const numbers = extractNumbers(words);
  const used = new Set();        // number indices already assigned
  let matched = 0;

  const numberFields = spec.capture.filter((f) => f.input === "number");
  const choiceFields = spec.capture.filter((f) => f.input === "choice" || f.input === "multichoice");
  const libFields = spec.capture.filter((f) => f.input === "library");

  // 1) Number fields by nearest keyword. A field whose keyword appears takes the closest
  //    unused number. Fields with no keyword hit are deferred to the single-leftover rule.
  const deferred = [];
  for (const f of numberFields) {
    const kws = fieldKeywords(f);
    let kwIdx = -1;
    for (let i = 0; i < words.length; i++) if (kws.includes(words[i])) { kwIdx = i; break; }
    if (kwIdx === -1) { deferred.push(f); continue; }
    let best = null;
    for (const n of numbers) if (!used.has(n.idx) && (best === null || distance(n, kwIdx) < distance(best, kwIdx))) best = n;
    if (best) { values[f.name] = String(best.value); used.add(best.idx); matched++; }
    else deferred.push(f);
  }
  // Single-leftover rule: exactly one unfilled number field + exactly one unused number → assign.
  const freeNums = numbers.filter((n) => !used.has(n.idx));
  if (deferred.length === 1 && freeNums.length === 1) {
    values[deferred[0].name] = String(freeNums[0].value); used.add(freeNums[0].idx); matched++;
  }

  // 2) Choice / multichoice: select options whose label OR value was spoken.
  for (const f of choiceFields) {
    const hits = [];
    for (const o of f.options || []) {
      const label = norm(o.label), val = norm(o.value).replace(/_/g, " ");
      if ((label && lower.includes(label)) || (val && lower.includes(val))) hits.push(o.value);
    }
    if (!hits.length) continue;
    if (f.input === "multichoice") { values[f.name] = hits; matched++; }
    else { values[f.name] = hits[0]; matched++; }   // single choice: first match
  }

  // 3) Library FK: only ever select from items ALREADY loaded (real UUIDs) whose name was spoken.
  for (const f of libFields) {
    const list = libraries[f.libraryType] || [];
    const hit = list.find((x) => x.name && lower.includes(norm(x.name)));
    if (hit) { values[f.name] = hit.library_id; matched++; }
  }

  // 4) Never lose what was said: seed Notes with the full transcript (farmer trims).
  values.notes = heard;

  return { values, heard, matched };
}

export default draftFromTranscript;

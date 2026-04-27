/**
 * ThemedCombobox — searchable dropdown input with palette-aware styling.
 *
 * Faithful generic port of the chemical-name combobox in
 * pages/farmer/FieldEventNew.jsx (the only existing custom combobox in
 * the codebase). Behavior preserved verbatim except colors come from the
 * `palette` prop instead of an inline `const C`.
 *
 * Selection contract: option.value is the canonical key returned via
 * onChange; option.label is what renders in the input + dropdown row;
 * option.sublabel (optional) renders below the label inside the dropdown.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { PALETTE_FARM } from "../../styles/palette";

let _idSeq = 0;
function uid(prefix) {
  _idSeq += 1;
  return `${prefix}-${_idSeq}`;
}

export default function ThemedCombobox({
  value,
  onChange,
  options = [],
  placeholder = "",
  palette = PALETTE_FARM,
  id,
  name,
  disabled = false,
  required = false,
  loading = false,
  emptyMessage = "No matches",
  noResultsHint = "",
  className = "",
}) {
  const [open, setOpen]                   = useState(false);
  const [highlightIdx, setHighlightIdx]   = useState(0);
  const [query, setQuery]                 = useState("");
  const inputRef    = useRef(null);
  const dropdownRef = useRef(null);
  const listboxId   = useMemo(() => uid("combobox-listbox"), []);

  // Sync the visible query with the externally controlled `value`. When the
  // parent passes a new value (e.g. selection from another path), reflect
  // its label in the input.
  useEffect(() => {
    const match = options.find((o) => o.value === value);
    setQuery(match ? match.label : (value || ""));
  }, [value, options]);

  const filtered = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Click-outside closes
  useEffect(() => {
    function onDocMouseDown(e) {
      if (!open) return;
      const insideInput    = inputRef.current && inputRef.current.contains(e.target);
      const insideDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!insideInput && !insideDropdown) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function selectOption(opt) {
    if (opt.disabled) return;
    onChange?.(opt.value);
    setQuery(opt.label);
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlightIdx((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[highlightIdx]) {
        e.preventDefault();
        selectOption(filtered[highlightIdx]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  const focusRing = `0 0 0 2px ${palette.accent}40`;
  const inputStyle = {
    background: palette.bg,
    border:     `1px solid ${palette.border}`,
    color:      palette.text,
  };
  const showEmpty   = open && !loading && filtered.length === 0 && (query || "").length > 0;
  const showResults = open && !loading && filtered.length > 0;

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-required={required || undefined}
        onFocus={() => !disabled && setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlightIdx(0);
          // Free-text mode: as the user types, propagate the raw string up so
          // forms can validate against it. When the user picks an option,
          // selectOption() overrides with option.value.
          onChange?.(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
        style={inputStyle}
        onFocusCapture={(e) => { e.target.style.boxShadow = focusRing; }}
        onBlurCapture={(e)  => { e.target.style.boxShadow = "none"; }}
      />

      {open && loading && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full px-3 py-2 rounded-lg shadow-lg text-xs"
          style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.textMuted }}
        >
          Loading…
        </div>
      )}

      {showResults && (
        <ul
          ref={dropdownRef}
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg shadow-lg"
          style={{ background: palette.bg, border: `1px solid ${palette.border}` }}
        >
          {filtered.map((opt, idx) => {
            const highlighted = idx === highlightIdx;
            const isLast      = idx === filtered.length - 1;
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={highlighted}
                onClick={() => selectOption(opt)}
                onMouseEnter={() => setHighlightIdx(idx)}
                className={`px-3 py-2 ${opt.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                style={{
                  background:   highlighted ? palette.accentTint : "transparent",
                  borderBottom: isLast ? "none" : `1px solid ${palette.border}`,
                }}
              >
                <div className="font-medium text-sm" style={{ color: palette.text }}>
                  {opt.label}
                </div>
                {opt.sublabel && (
                  <div className="text-xs mt-0.5" style={{ color: palette.textMuted }}>
                    {opt.sublabel}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showEmpty && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full px-3 py-2 rounded-lg shadow-lg text-xs"
          style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.textMuted }}
        >
          {emptyMessage}{noResultsHint ? ` ${noResultsHint}` : ""}
        </div>
      )}
    </div>
  );
}

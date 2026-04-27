/**
 * ThemedSelect — closed-list dropdown, palette-aware, no typing.
 *
 * Sibling of ThemedCombobox for cases where the option list is small/static
 * and a search box would be visual noise. Click to open, click to choose.
 * Single-keystroke jump-to-first-match preserves keyboard usability without
 * a visible input.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PALETTE_FARM } from "../../styles/palette";

let _idSeq = 0;
function uid(prefix) {
  _idSeq += 1;
  return `${prefix}-${_idSeq}`;
}

export default function ThemedSelect({
  value,
  onChange,
  options = [],
  placeholder = "Select…",
  palette = PALETTE_FARM,
  id,
  name,
  disabled = false,
  required = false,
  className = "",
}) {
  const [open, setOpen]                 = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const buttonRef   = useRef(null);
  const dropdownRef = useRef(null);
  const listboxId   = useMemo(() => uid("select-listbox"), []);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === value);
    setHighlightIdx(idx >= 0 ? idx : 0);
  }, [open, options, value]);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!open) return;
      const insideButton   = buttonRef.current   && buttonRef.current.contains(e.target);
      const insideDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!insideButton && !insideDropdown) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function selectOption(opt) {
    if (opt.disabled) return;
    onChange?.(opt.value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function handleKeyDown(e) {
    // Single-keystroke jump-to-first-match (any printable letter/digit)
    if (!disabled && e.key.length === 1 && /^[a-z0-9]$/i.test(e.key)) {
      const ch = e.key.toLowerCase();
      const idx = options.findIndex((o) => o.label.toLowerCase().startsWith(ch));
      if (idx >= 0) {
        if (!open) setOpen(true);
        setHighlightIdx(idx);
        e.preventDefault();
        return;
      }
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlightIdx((i) => Math.min(i + 1, Math.max(0, options.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      const opt = options[highlightIdx];
      if (opt) selectOption(opt);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  const focusRing = `0 0 0 2px ${palette.accent}40`;
  const buttonStyle = {
    background: palette.bg,
    border:     `1px solid ${palette.border}`,
    color:      selected ? palette.text : palette.textMuted,
  };

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        id={id}
        name={name}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        onFocusCapture={(e) => { e.currentTarget.style.boxShadow = focusRing; }}
        onBlurCapture={(e)  => { e.currentTarget.style.boxShadow = "none"; }}
        className="w-full px-3 py-2 rounded-lg text-sm text-left flex items-center justify-between focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        style={buttonStyle}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronDown
          size={16}
          style={{
            color: palette.text,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
            flexShrink: 0,
            marginLeft: 8,
          }}
        />
      </button>

      {open && (
        <ul
          ref={dropdownRef}
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg shadow-lg"
          style={{ background: palette.bg, border: `1px solid ${palette.border}` }}
        >
          {options.map((opt, idx) => {
            const highlighted = idx === highlightIdx;
            const isSelected  = opt.value === value;
            const isLast      = idx === options.length - 1;
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => selectOption(opt)}
                onMouseEnter={() => setHighlightIdx(idx)}
                className={`px-3 py-2 ${opt.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                style={{
                  background:   highlighted ? palette.accentTint : "transparent",
                  borderBottom: isLast ? "none" : `1px solid ${palette.border}`,
                  fontWeight:   isSelected ? 600 : 400,
                }}
              >
                <div className="text-sm" style={{ color: palette.text }}>
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
    </div>
  );
}

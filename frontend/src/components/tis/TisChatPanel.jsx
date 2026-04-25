/**
 * TisChatPanel — floating side-panel TIS chat.
 *
 * Anchors bottom-right above the FAB. Persists across route changes because
 * its state (open flag, messages, sending) lives in FarmerShell and is
 * passed in as props here. Local state is limited to the input buffer and
 * the sticky-to-bottom scroll effect.
 *
 * Backend: POST /tis/chat via tis-bridge. Caller owns the fetch; this
 * component just calls props.onSend(text).
 */
import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";

const STARTER_CHIPS = [
  "Chemical WHD check",
  "Kava dieback",
  "Nayans grade",
  "Cash runway",
];

const C = {
  cream:    "#F8F3E9",
  white:    "#FFFFFF",
  soil:     "#5C4033",
  soilDk:   "#2D2016",
  green:    "#6AA84F",
  greenDk:  "#3E7B1F",
  borderLt: "#E8E2D4",
  borderMd: "#D4CFC3",
  muted:    "#8A7B6F",
};

function UserBubble({ content }) {
  return (
    <div className="flex justify-end">
      <div
        style={{
          background: C.green,
          color: "#FFFFFF",
          borderRadius: 12,
          padding: "8px 12px",
          maxWidth: "80%",
          fontSize: 13,
          lineHeight: 1.45,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {content}
      </div>
    </div>
  );
}

function AssistantBubble({ content, footer }) {
  return (
    <div className="flex justify-start">
      <div
        style={{
          background: C.white,
          border: `1px solid ${C.borderLt}`,
          borderRadius: 12,
          padding: "12px 16px",
          maxWidth: "85%",
        }}
      >
        <div
          style={{
            fontSize: 13,
            color: C.soilDk,
            lineHeight: 1.45,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {content}
        </div>
        {footer && (
          <div
            style={{
              fontSize: 10,
              fontStyle: "italic",
              color: C.muted,
              marginTop: 6,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TisChatPanel({
  open,
  onClose,
  onClear,
  messages,
  sending,
  onSend,
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending, open]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  if (!open) return null;

  const hasUserMessage = messages.some((m) => m.role === "user");
  const showChips = !hasUserMessage;
  const sendDisabled = sending || !input.trim();

  function submit() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    onSend(text);
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function onChipClick(text) {
    setInput(text);
    inputRef.current?.focus();
  }

  return (
    <aside
      role="dialog"
      aria-label="TIS chat"
      className="fixed flex flex-col"
      style={{
        right: 24,
        bottom: 96,
        width: 380,
        maxWidth: "calc(100vw - 48px)",
        height: "min(560px, 70vh)",
        background: C.white,
        borderRadius: 16,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        overflow: "hidden",
        zIndex: 999,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{
          height: 44,
          padding: "0 12px 0 16px",
          background: C.green,
          color: "#FFFFFF",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>TIS — Farm Intelligence</span>
        <div className="flex items-center" style={{ gap: 8 }}>
          <button
            type="button"
            onClick={onClear}
            title="Clear conversation"
            style={{
              background: "transparent",
              border: "none",
              color: "#FFFFFF",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              padding: "4px 6px",
              opacity: 0.9,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
            onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
          >
            Clear chat
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close TIS chat"
            className="flex items-center justify-center"
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              background: "transparent",
              border: "none",
              color: "#FFFFFF",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          background: C.cream,
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.map((m, i) => {
          if (m.role === "user") return <UserBubble key={i} content={m.content} />;
          const footer = m.isOpener
            ? "Fiji Intelligence Layer · Layer 2"
            : m.layer && m.responseTimeMs
              ? `${m.layer} · ${m.responseTimeMs}ms`
              : null;
          return <AssistantBubble key={i} content={m.content} footer={footer} />;
        })}

        {showChips && (
          <div className="flex flex-wrap" style={{ gap: 6, marginTop: 2 }}>
            {STARTER_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChipClick(c)}
                style={{
                  background: C.cream,
                  border: `1px solid ${C.green}`,
                  borderRadius: 16,
                  height: 26,
                  padding: "4px 10px",
                  fontSize: 11,
                  color: C.greenDk,
                  cursor: "pointer",
                  transition: "background 120ms ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(106,168,79,0.08)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = C.cream; }}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {sending && (
          <div className="flex justify-start">
            <div
              style={{
                background: C.white,
                border: `1px solid ${C.borderLt}`,
                borderRadius: 12,
                padding: "10px 14px",
                color: C.muted,
                fontSize: 13,
                fontStyle: "italic",
              }}
            >
              TIS is thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="flex items-center"
        style={{
          background: C.white,
          borderTop: `1px solid ${C.borderLt}`,
          padding: "8px 12px",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          disabled={sending}
          placeholder="Ask TIS anything..."
          aria-label="Ask TIS"
          style={{
            flex: 1,
            border: `1px solid ${C.borderMd}`,
            borderRadius: 18,
            padding: "6px 12px",
            fontSize: 13,
            color: C.soilDk,
            background: "#FFFFFF",
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={sendDisabled}
          aria-label="Send"
          className="flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: C.green,
            color: "#FFFFFF",
            border: "none",
            cursor: sendDisabled ? "not-allowed" : "pointer",
            opacity: sendDisabled ? 0.5 : 1,
            transition: "opacity 150ms ease, background 150ms ease",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { if (!sendDisabled) e.currentTarget.style.background = C.greenDk; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = C.green; }}
        >
          <Send size={14} strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  );
}

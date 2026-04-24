/**
 * TIS.jsx — TIS Chat page (cream-light variant, Day 3b locked 2026-04-25).
 *
 * Sacred §280 dispensation: dark layout → cream-light prototype rewrite.
 * Backend integration (POST /tis/chat via tis-bridge) is preserved
 * byte-for-byte; only visuals, chips, and metadata rendering are new.
 */
import { useEffect, useRef, useState } from "react";
import { Plus, Send } from "lucide-react";

const TIS_ENDPOINT = import.meta.env.VITE_TIS_ENDPOINT || "/tis/chat";
const TIS_TOKEN = import.meta.env.VITE_TIS_BRIDGE_TOKEN || "";

const USER_ID = "U-CODY";
const FARM_ID = "F001";
const SESSION_ID = `tfos-web-${USER_ID}`;

const STARTER_CHIPS = [
  "Why are my kava leaves yellow?",
  "When can I harvest eggplant after Karate Zeon?",
  "What's the Nayans Grade A spec?",
  "13-week cashflow please",
];

const LAYER_LABEL = {
  1: "Validated KB",
  2: "Fiji Intelligence",
  3: "General agronomy",
};

const OPENER = {
  role: "assistant",
  isOpener: true,
  content:
    "Bula Boss. I can answer chemical, crop, livestock, and financial questions. I cite my sources: Layer 1 (validated KB), Layer 2 (Fiji Intelligence), Layer 3 (general agronomy — last resort).",
};

const C = {
  cream:     "#F8F3E9",
  white:     "#FFFFFF",
  soil:      "#5C4033",
  soilDk:    "#2D2016",
  green:     "#6AA84F",
  greenDk:   "#3E7B1F",
  borderLt:  "#E8E2D4",
  borderMd:  "#D4CFC3",
  muted:     "#8A7B6F",
};

function parseReply(data) {
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return String(data ?? "");
  return (
    data.text ||
    data.response?.text ||
    data.response?.result?.payloads?.[0]?.text ||
    JSON.stringify(data.response || data)
  );
}

function parseLayer(data) {
  const raw = data?.layer ?? data?.response?.layer;
  if (typeof raw === "number" && LAYER_LABEL[raw]) return LAYER_LABEL[raw];
  if (typeof raw === "string" && raw.trim()) return raw;
  return LAYER_LABEL[2];
}

function NewSessionButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center transition-colors"
      style={{
        background: C.cream,
        border: `1px solid ${C.borderMd}`,
        color: C.soil,
        padding: "8px 14px",
        borderRadius: 8,
        height: 36,
        fontSize: 13,
        gap: 6,
        flexShrink: 0,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.green; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.borderMd; }}
    >
      <Plus size={14} strokeWidth={1.75} />
      <span>New session</span>
    </button>
  );
}

function StarterChip({ text, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(text)}
      style={{
        background: C.cream,
        border: `1px solid ${C.borderMd}`,
        borderRadius: 18,
        height: 32,
        padding: "6px 14px",
        fontSize: 13,
        color: C.soil,
        cursor: "pointer",
        transition: "border-color 120ms ease, color 120ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = C.green;
        e.currentTarget.style.color = C.greenDk;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = C.borderMd;
        e.currentTarget.style.color = C.soil;
      }}
    >
      {text}
    </button>
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
          padding: "16px 20px",
          maxWidth: 680,
        }}
      >
        <div
          style={{
            fontSize: 14,
            color: C.soilDk,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}
        >
          {content}
        </div>
        <div
          style={{
            fontSize: 11,
            fontStyle: "italic",
            color: C.muted,
            marginTop: 8,
          }}
        >
          {footer}
        </div>
      </div>
    </div>
  );
}

function UserBubble({ content }) {
  return (
    <div className="flex justify-end">
      <div
        style={{
          background: C.green,
          color: "#FFFFFF",
          borderRadius: 12,
          padding: "12px 16px",
          maxWidth: 680,
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
        }}
      >
        {content}
      </div>
    </div>
  );
}

export default function TIS() {
  const [messages, setMessages] = useState([OPENER]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  const showChips = messages.length === 1 && messages[0].isOpener;
  const sendDisabled = loading || !input.trim();

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    const start = performance.now();
    try {
      const headers = { "Content-Type": "application/json" };
      if (TIS_TOKEN) headers.Authorization = `Bearer ${TIS_TOKEN}`;
      const res = await fetch(TIS_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: text,
          user_id: USER_ID,
          farm_id: FARM_ID,
          session_id: SESSION_ID,
        }),
      });
      if (!res.ok) throw new Error(`TIS ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const ms = Math.max(1, Math.round(performance.now() - start));
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: parseReply(data),
          layer: parseLayer(data),
          responseTimeMs: ms,
        },
      ]);
    } catch (err) {
      const ms = Math.max(1, Math.round(performance.now() - start));
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Something broke: ${err.message}`,
          layer: LAYER_LABEL[2],
          responseTimeMs: ms,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onChipClick(text) {
    setInput(text);
    inputRef.current?.focus();
  }

  function onNewSession() {
    // Day 4: POST /api/v1/tis/sessions to mint a fresh conversation id.
    console.log("TODO: new session");
  }

  return (
    <div
      className="flex flex-col"
      style={{ gap: 20, paddingBottom: 8 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: C.soilDk,
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            TIS Chat
          </h1>
          <p style={{ fontSize: 13, color: C.soil, margin: "4px 0 0 0" }}>
            Grounded agricultural intelligence · KB Layer 1 · Fiji Intelligence Layer 2
          </p>
        </div>
        <NewSessionButton onClick={onNewSession} />
      </div>

      {/* Starter chips (empty state only) */}
      {showChips && (
        <div className="flex flex-wrap" style={{ gap: 12 }}>
          {STARTER_CHIPS.map((c) => (
            <StarterChip key={c} text={c} onClick={onChipClick} />
          ))}
        </div>
      )}

      {/* Message thread */}
      <div className="flex flex-col" style={{ gap: 12 }}>
        {messages.map((m, i) => {
          if (m.role === "user") return <UserBubble key={i} content={m.content} />;
          const footer = m.isOpener
            ? "TIS · Fiji Intelligence Layer · ready"
            : `TIS · ${m.layer || LAYER_LABEL[2]} · ${m.responseTimeMs ?? "—"}ms`;
          return <AssistantBubble key={i} content={m.content} footer={footer} />;
        })}
        {loading && (
          <div className="flex justify-start">
            <div
              style={{
                background: C.white,
                border: `1px solid ${C.borderLt}`,
                borderRadius: 12,
                padding: "16px 20px",
                maxWidth: 680,
                fontSize: 14,
                color: C.muted,
                fontStyle: "italic",
              }}
            >
              TIS is thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Sticky input */}
      <div
        style={{
          position: "sticky",
          bottom: 16,
          background: C.white,
          border: `1px solid ${C.borderLt}`,
          borderRadius: 12,
          padding: 12,
          marginBottom: 16,
          marginTop: "auto",
          display: "flex",
          alignItems: "center",
          gap: 8,
          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          disabled={loading}
          placeholder="Ask TIS..."
          aria-label="Ask TIS"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            fontSize: 14,
            color: C.soilDk,
            background: "transparent",
            padding: "8px 6px",
          }}
        />
        <button
          type="button"
          onClick={send}
          disabled={sendDisabled}
          className="flex items-center justify-center"
          style={{
            background: C.green,
            color: "#FFFFFF",
            borderRadius: 8,
            height: 40,
            padding: "0 16px",
            gap: 6,
            fontSize: 14,
            fontWeight: 500,
            cursor: sendDisabled ? "not-allowed" : "pointer",
            opacity: sendDisabled ? 0.5 : 1,
            transition: "opacity 150ms ease, background 150ms ease",
            border: "none",
          }}
          onMouseEnter={(e) => { if (!sendDisabled) e.currentTarget.style.background = C.greenDk; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = C.green; }}
        >
          <Send size={16} strokeWidth={1.75} />
          <span>Send</span>
        </button>
      </div>
    </div>
  );
}

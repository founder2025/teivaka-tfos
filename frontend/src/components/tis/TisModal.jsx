/**
 * TisModal — "Ask TIS" chat modal.
 *
 * Mobile: slides up from bottom (max-h 80vh).
 * Desktop: centered modal (max-w 520px, max-h 600px).
 *
 * Hits POST /tis/chat (same endpoint as /tis page) with a distinct session_id
 * (`tfos-fab-${userId}`) so FAB conversation is tracked separately from the
 * full-page TIS tab.
 *
 * Conversation state is local — resets when the component unmounts (e.g. on
 * logout, since FarmerShell unmounts on auth-redirect).
 *
 * Sub-components stay at module scope (focus-stability rule).
 */
import { useState, useRef, useEffect } from "react";
import { getCurrentUser } from "../../utils/auth";

const TIS_ENDPOINT = import.meta.env.VITE_TIS_ENDPOINT || "/tis/chat";
const TIS_TOKEN = import.meta.env.VITE_TIS_BRIDGE_TOKEN || "";

const C = {
  soil:   "#5C4033",
  green:  "#6AA84F",
  amber:  "#BF9000",
  cream:  "#F8F3E9",
  border: "#E6DED0",
  muted:  "#8A7863",
};

const GREETING = {
  role: "assistant",
  content: "Bula. I am TIS — your farm assistant. Ask me anything.",
};

function CloseIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function SendIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function TypingDots() {
  const dot = {
    width: 6,
    height: 6,
    borderRadius: 9999,
    background: C.muted,
    display: "inline-block",
    animation: "tisbounce 1.2s infinite ease-in-out",
  };
  return (
    <span className="inline-flex items-center gap-1" aria-label="TIS is typing">
      <style>{`@keyframes tisbounce {
        0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
        40% { transform: translateY(-4px); opacity: 1; }
      }`}</style>
      <span style={{ ...dot, animationDelay: "0s" }} />
      <span style={{ ...dot, animationDelay: "0.15s" }} />
      <span style={{ ...dot, animationDelay: "0.3s" }} />
    </span>
  );
}

function MessageBubble({ role, content }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words"
        style={
          isUser
            ? { background: C.green, color: "white", borderBottomRightRadius: 4 }
            : { background: C.cream, color: C.soil, border: `1px solid ${C.border}`, borderBottomLeftRadius: 4 }
        }
      >
        {content}
      </div>
    </div>
  );
}

function ErrorCard() {
  return (
    <div className="flex justify-start">
      <div
        className="px-3 py-2 rounded-2xl text-sm"
        style={{ background: "#FEE2E2", color: "#991B1B", border: "1px solid #FCA5A5" }}
      >
        TIS is unavailable — try again
      </div>
    </div>
  );
}

function parseTisResponse(data) {
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return String(data ?? "");
  if (typeof data.text === "string") return data.text;
  if (typeof data.message === "string") return data.message;
  if (typeof data.response === "string") return data.response;
  if (typeof data.response?.text === "string") return data.response.text;
  if (typeof data.response?.result?.payloads?.[0]?.text === "string") {
    return data.response.result.payloads[0].text;
  }
  return JSON.stringify(data);
}

export default function TisModal({ open, onClose }) {
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const sendingRef = useRef(false);

  const user = getCurrentUser();
  const userId = user?.sub || user?.user_id || "anon";
  const sessionId = `tfos-fab-${userId}`;

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, errored, open]);

  useEffect(() => {
    if (open && inputRef.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function send() {
    if (sendingRef.current) return;
    const text = input.trim();
    if (!text || loading) return;
    sendingRef.current = true;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    setErrored(false);
    try {
      const headers = { "Content-Type": "application/json" };
      if (TIS_TOKEN) headers.Authorization = `Bearer ${TIS_TOKEN}`;
      const res = await fetch(TIS_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: text,
          user_id: userId,
          farm_id: "F001",
          session_id: sessionId,
        }),
      });
      if (!res.ok) {
        if (res.status >= 500) { setErrored(true); return; }
        throw new Error(`TIS ${res.status}`);
      }
      const data = await res.json();
      const reply = parseTisResponse(data);
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setErrored(true);
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  }

  function onInputKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-[1100] ${open ? "" : "pointer-events-none"}`}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        style={{ background: "rgba(92, 64, 51, 0.4)" }}
      />

      {/* Mobile sheet (< md) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ask TIS"
        className={`md:hidden absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl flex flex-col transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{
          maxHeight: "80vh",
          height: "80vh",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
          border: `1px solid ${C.border}`,
        }}
      >
        <ModalChrome
          messages={messages}
          loading={loading}
          errored={errored}
          input={input}
          setInput={setInput}
          onSend={send}
          onClose={onClose}
          onInputKey={onInputKey}
          scrollRef={scrollRef}
          inputRef={inputRef}
        />
      </div>

      {/* Desktop centered modal (md+) */}
      <div className="hidden md:flex absolute inset-0 items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ask TIS"
          className={`pointer-events-auto bg-white rounded-2xl flex flex-col w-full transition-all duration-200 ${
            open ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
          style={{
            maxWidth: 520,
            maxHeight: 600,
            height: 600,
            boxShadow: "0 12px 48px rgba(0,0,0,0.24)",
            border: `1px solid ${C.border}`,
          }}
        >
          <ModalChrome
            messages={messages}
            loading={loading}
            errored={errored}
            input={input}
            setInput={setInput}
            onSend={send}
            onClose={onClose}
            onInputKey={onInputKey}
            scrollRef={scrollRef}
            inputRef={inputRef}
          />
        </div>
      </div>
    </div>
  );
}

function ModalChrome({
  messages, loading, errored,
  input, setInput, onSend, onClose, onInputKey,
  scrollRef, inputRef,
}) {
  const sendDisabled = loading || !input.trim();
  return (
    <>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: `1px solid ${C.border}` }}
      >
        <h2 className="text-base font-semibold" style={{ color: C.soil }}>Ask TIS</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors"
          style={{ color: C.soil }}
        >
          <CloseIcon />
        </button>
      </div>

      {/* Body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
        style={{ background: "#FAFAF7" }}
      >
        {messages.map((m, i) => (
          <MessageBubble key={i} role={m.role} content={m.content} />
        ))}
        {loading && (
          <div className="flex justify-start">
            <div
              className="px-3 py-2 rounded-2xl"
              style={{ background: C.cream, border: `1px solid ${C.border}` }}
            >
              <TypingDots />
            </div>
          </div>
        )}
        {errored && <ErrorCard />}
      </div>

      {/* Footer */}
      <div
        className="flex items-end gap-2 p-3 shrink-0"
        style={{ borderTop: `1px solid ${C.border}`, background: "white" }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onInputKey}
          placeholder="Ask TIS…"
          className="flex-1 resize-none border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
          style={{ borderColor: C.border, color: C.soil, maxHeight: 120, outlineColor: C.green }}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={sendDisabled}
          aria-label="Send"
          className="w-10 h-10 rounded-xl text-white flex items-center justify-center transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: C.green }}
        >
          <SendIcon />
        </button>
      </div>
    </>
  );
}

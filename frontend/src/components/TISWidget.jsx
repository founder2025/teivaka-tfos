/**
 * TISWidget — Floating bottom-right Tei chat, available on every farmer page.
 *
 * Closed: 56px green circle. Open: 380×540 panel (full-screen on mobile).
 * History persists in sessionStorage. Mirrors /pages/farmer/TIS.jsx call shape.
 */
import { useState, useEffect, useRef, useCallback } from "react";

const TIS_ENDPOINT = import.meta.env.VITE_TIS_ENDPOINT || "/tis/chat";
const TIS_TOKEN = import.meta.env.VITE_TIS_BRIDGE_TOKEN || "";
const STORAGE_KEY = "teivaka_tis_chat_history";
const GREETING = {
  role: "assistant",
  content: "Bula. I am Tei — your farm assistant. Ask me anything.",
  timestamp: Date.now(),
};

const C = { green: "#3D8C40", soil: "#2C1A0E", cream: "#F5EFE0", border: "#E0D5C0" };

function loadState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { messages: [GREETING], isOpen: false };
    const parsed = JSON.parse(raw);
    return {
      messages: Array.isArray(parsed.messages) && parsed.messages.length ? parsed.messages : [GREETING],
      isOpen: !!parsed.isOpen,
    };
  } catch {
    return { messages: [GREETING], isOpen: false };
  }
}

function saveState(state) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* full quota — ignore */ }
}

export default function TISWidget() {
  const [{ messages, isOpen }, setState] = useState(loadState);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { saveState({ messages, isOpen }); }, [messages, isOpen]);
  useEffect(() => {
    if (isOpen && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading, isOpen]);
  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  const setMessages = useCallback((updater) => {
    setState((s) => ({ ...s, messages: typeof updater === "function" ? updater(s.messages) : updater }));
  }, []);
  const open = useCallback(() => setState((s) => ({ ...s, isOpen: true })), []);
  const close = useCallback(() => setState((s) => ({ ...s, isOpen: false })), []);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const now = Date.now();
    setMessages((m) => [...m, { role: "user", content: text, timestamp: now }]);
    setInput("");
    setLoading(true);
    setRateLimited(false);
    try {
      const headers = { "Content-Type": "application/json" };
      if (TIS_TOKEN) headers.Authorization = `Bearer ${TIS_TOKEN}`;
      const res = await fetch(TIS_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({ message: text, user_id: "U-CODY", farm_id: "F001" }),
      });
      if (res.status === 429) {
        setRateLimited(true);
        setMessages((m) => [...m, {
          role: "assistant",
          content: "You've used your free Tei queries today. Upgrade to BASIC for 20/day.",
          timestamp: Date.now(),
          rateLimited: true,
        }]);
        return;
      }
      if (!res.ok) throw new Error(`TIS ${res.status}`);
      const data = await res.json();
      const response =
        data.text ||
        data.response?.text ||
        data.response?.result?.payloads?.[0]?.text ||
        JSON.stringify(data.response || data);
      setMessages((m) => [...m, { role: "assistant", content: response, timestamp: Date.now() }]);
    } catch {
      setMessages((m) => [...m, {
        role: "assistant",
        content: "Something broke, try again.",
        timestamp: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  if (!isOpen) {
    return (
      <button
        onClick={open}
        aria-label="Open Tei chat"
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full text-white flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        style={{ background: C.green, boxShadow: "0 4px 16px rgba(0,0,0,0.15)", zIndex: 1000 }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    );
  }

  return (
    <div
      className="fixed bg-white flex flex-col overflow-hidden sm:rounded-2xl"
      style={{
        bottom: typeof window !== "undefined" && window.innerWidth < 640 ? 0 : 24,
        right:  typeof window !== "undefined" && window.innerWidth < 640 ? 0 : 24,
        left:   typeof window !== "undefined" && window.innerWidth < 640 ? 0 : "auto",
        top:    typeof window !== "undefined" && window.innerWidth < 640 ? 0 : "auto",
        width:  typeof window !== "undefined" && window.innerWidth < 640 ? "100%" : 380,
        height: typeof window !== "undefined" && window.innerWidth < 640 ? "100%" : 540,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        border: `1px solid ${C.border}`,
        zIndex: 1000,
        fontFamily: "'Lora', Georgia, serif",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ background: C.cream, borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: C.green }}>T</span>
          <div className="leading-tight">
            <div className="text-sm font-semibold" style={{ color: C.soil, fontFamily: "'Playfair Display', Georgia, serif" }}>Tei</div>
            <div className="text-xs text-gray-500">Farm Assistant</div>
          </div>
        </div>
        <button
          onClick={close}
          aria-label="Minimize"
          className="w-8 h-8 rounded-full text-gray-600 hover:bg-black/10 flex items-center justify-center text-lg leading-none"
        >
          –
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2" style={{ background: "#FAFAF7" }}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words"
              style={
                m.role === "user"
                  ? { background: C.green, color: "white", borderBottomRightRadius: 4 }
                  : { background: "white", color: C.soil, border: `1px solid ${C.border}`, borderBottomLeftRadius: 4 }
              }
            >
              {m.content}
              {m.rateLimited && (
                <a href="/settings" className="block mt-2 text-xs font-semibold underline" style={{ color: C.green }}>
                  Upgrade →
                </a>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-2xl text-sm italic text-gray-500" style={{ background: "white", border: `1px solid ${C.border}` }}>
              Tei is thinking…
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 p-3" style={{ borderTop: `1px solid ${C.border}`, background: "white" }}>
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          disabled={rateLimited}
          placeholder={rateLimited ? "Daily limit reached" : "Ask Tei…"}
          className="flex-1 resize-none border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:bg-gray-100 disabled:text-gray-400"
          style={{ borderColor: C.border, maxHeight: 100 }}
        />
        <button
          onClick={send}
          disabled={loading || rateLimited || !input.trim()}
          className="px-3 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: C.green }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

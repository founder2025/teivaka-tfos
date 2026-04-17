import { useState, useRef, useEffect } from "react";

const TIS_ENDPOINT = import.meta.env.VITE_TIS_ENDPOINT || "/tis/chat";
const TIS_TOKEN = import.meta.env.VITE_TIS_BRIDGE_TOKEN || "";

export default function TIS() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Bula. I am Tei — your farm assistant. Ask me anything about F001, F002, crops, alerts, or just talk." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    try {
      const headers = { "Content-Type": "application/json" };
      if (TIS_TOKEN) headers.Authorization = `Bearer ${TIS_TOKEN}`;
      const res = await fetch(TIS_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({ message: text, user_id: "U-CODY", farm_id: "F001" }),
      });
      if (!res.ok) throw new Error(`TIS ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const response =
        data.text ||
        data.response?.text ||
        data.response?.result?.payloads?.[0]?.text ||
        JSON.stringify(data.response || data);
      setMessages((m) => [...m, { role: "assistant", content: response }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: `Something broke: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div className="flex flex-col h-screen bg-[#0A0F1C] text-white">
      <div className="px-6 py-4 border-b border-white/10">
        <h1 className="text-xl font-semibold">Tei — Farm Assistant</h1>
        <p className="text-xs text-white/50">Same brain as your WhatsApp bot. Powered by OpenClaw.</p>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 whitespace-pre-wrap ${m.role === "user" ? "bg-emerald-600 text-white" : "bg-white/5 text-white/90 border border-white/10"}`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-white/60">Tei is thinking…</div>
          </div>
        )}
      </div>
      <div className="border-t border-white/10 p-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            placeholder="Ask Tei anything about your farm…"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 resize-none focus:outline-none focus:border-emerald-500"
            disabled={loading}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-white/10 disabled:text-white/40 px-6 py-2 rounded-xl font-medium"
          >Send</button>
        </div>
      </div>
    </div>
  );
}

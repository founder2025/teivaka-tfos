/**
 * AvatarCropper — lightweight in-house cropper (no 3rd-party dep, CSP-clean).
 * Circular crop preview with a zoom slider + drag-to-reposition; exports the
 * cropped square as a compressed JPEG so the saved avatar is neatly framed
 * instead of a raw, zoomed-in photo. Works with mouse (desktop) and touch
 * (phone: drag to move, slider to zoom).
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { X } from "lucide-react";

const C = { soil: "#5C4033", green: "#6AA84F", line: "#E8E2D4", muted: "#8A7B6F" };
const BOX = 280;   // on-screen crop viewport (square)
const OUT = 512;   // exported avatar resolution

export default function AvatarCropper({ file, onCancel, onCropped }) {
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });   // image top-left offset within BOX
  const [busy, setBusy] = useState(false);
  const drag = useRef(null);
  const canvasRef = useRef(null);

  // Load the chosen file into an Image, then fit it to cover the box.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const base = Math.max(BOX / im.width, BOX / im.height); // cover
      setImg(im); setMinZoom(base); setZoom(base);
      setOff({ x: (BOX - im.width * base) / 2, y: (BOX - im.height * base) / 2 });
      URL.revokeObjectURL(url);
    };
    im.src = url;
  }, [file]);

  const clamp = useCallback((o, z) => {
    if (!img) return o;
    const w = img.width * z, h = img.height * z;
    return {
      x: Math.min(0, Math.max(BOX - w, o.x)),
      y: Math.min(0, Math.max(BOX - h, o.y)),
    };
  }, [img]);

  // Repaint the live preview
  useEffect(() => {
    const cv = canvasRef.current; if (!cv || !img) return;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, BOX, BOX);
    ctx.drawImage(img, off.x, off.y, img.width * zoom, img.height * zoom);
  }, [img, zoom, off]);

  const onZoom = (z) => {
    if (!img) return;
    // keep the center anchored while zooming
    const cx = BOX / 2, cy = BOX / 2;
    const k = z / zoom;
    setOff((o) => clamp({ x: cx - (cx - o.x) * k, y: cy - (cy - o.y) * k }, z));
    setZoom(z);
  };

  const ptr = (e) => (e.touches ? e.touches[0] : e);
  const onDown = (e) => { const p = ptr(e); drag.current = { x: p.clientX, y: p.clientY, ox: off.x, oy: off.y }; };
  const onMove = (e) => {
    if (!drag.current) return;
    const p = ptr(e);
    setOff(clamp({ x: drag.current.ox + (p.clientX - drag.current.x), y: drag.current.oy + (p.clientY - drag.current.y) }, zoom));
  };
  const onUp = () => { drag.current = null; };

  const apply = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const out = document.createElement("canvas");
      out.width = OUT; out.height = OUT;
      const s = OUT / BOX;
      const ctx = out.getContext("2d");
      ctx.drawImage(img, off.x * s, off.y * s, img.width * zoom * s, img.height * zoom * s);
      const blob = await new Promise((r) => out.toBlob(r, "image/jpeg", 0.9));
      onCropped(new File([blob], "avatar.jpeg", { type: "image/jpeg" }));
    } finally { setBusy(false); }
  };

  return (
    <div onMouseUp={onUp} onMouseLeave={onUp} style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(40,30,20,.55)", display: "flex", justifyContent: "center", alignItems: "center", padding: 16 }}>
      <div style={{ width: "min(360px, 100%)", background: "#fff", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${C.line}` }}>
          <strong style={{ color: C.soil }}>Position your photo</strong>
          <button onClick={onCancel} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted }}><X size={18} /></button>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div
            onMouseDown={onDown} onMouseMove={onMove}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
            style={{ position: "relative", width: BOX, height: BOX, maxWidth: "100%", cursor: "grab", touchAction: "none", borderRadius: 8, overflow: "hidden", background: "#000" }}>
            <canvas ref={canvasRef} width={BOX} height={BOX} style={{ display: "block", width: "100%", height: "100%" }} />
            {/* circular mask overlay */}
            <div style={{ position: "absolute", inset: 0, boxShadow: `0 0 0 999px rgba(0,0,0,0.45)`, borderRadius: "50%", pointerEvents: "none" }} />
          </div>
          <input type="range" min={minZoom} max={minZoom * 4} step={0.01} value={zoom} onChange={(e) => onZoom(parseFloat(e.target.value))} style={{ width: "100%", accentColor: C.green }} />
          <div style={{ fontSize: 11.5, color: C.muted }}>Drag to move · slide to zoom</div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: `1px solid ${C.line}` }}>
          <button onClick={onCancel} disabled={busy} style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 8, padding: "9px 14px", cursor: "pointer", minHeight: 44 }}>Cancel</button>
          <button onClick={apply} disabled={busy || !img} style={{ border: "none", background: C.green, color: "#fff", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600, minHeight: 44 }}>{busy ? "…" : "Use photo"}</button>
        </div>
      </div>
    </div>
  );
}

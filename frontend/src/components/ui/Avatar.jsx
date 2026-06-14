/**
 * Avatar.jsx — one avatar renderer used across the platform so a user's photo
 * shows everywhere and falls back to the initials circle when there's none (or
 * the image fails). Cache-busts on a changed URL so an updated photo never gets
 * stuck on the old cached file.
 */
import { useState, useEffect } from "react";

const initials = (n) => (n || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

export default function Avatar({ src, name, size = 36, fontScale = 0.36, bg = "var(--green)", style }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);
  const base = { width: size, height: size, borderRadius: "50%", flexShrink: 0, ...style };
  if (src && !broken) {
    return <img src={src} alt="" onError={() => setBroken(true)} style={{ ...base, objectFit: "cover" }} />;
  }
  return (
    <span style={{ ...base, background: bg, color: "#fff", fontWeight: 700, fontSize: size * fontScale, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {initials(name)}
    </span>
  );
}

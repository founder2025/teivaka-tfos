import { Link } from "react-router-dom";

export default function Privacy() {
  return <LegalStub title="Privacy Policy" kind="Privacy Policy" />;
}

export function LegalStub({ title, kind }) {
  return (
    <div style={S.page}>
      <header style={S.header}>
        <Link to="/" style={S.wordmark}>
          Teivaka<span style={S.dot}>.</span>
        </Link>
      </header>
      <main style={S.main}>
        <h1 style={S.h1}>{title}</h1>
        <p style={S.body}>
          Placeholder — full {kind} coming soon. Contact{" "}
          <a href="mailto:hello@teivaka.com" style={S.link}>hello@teivaka.com</a>{" "}
          with questions.
        </p>
        <Link to="/" style={S.back}>← Back to home</Link>
      </main>
    </div>
  );
}

const C = { soil: "#2C1A0E", green: "#3D8C40", cream: "#F5EFE0", ink: "#1A1410" };

const S = {
  page: { minHeight: "100vh", background: C.cream, color: C.ink, fontFamily: "'Lora', Georgia, serif", lineHeight: 1.6 },
  header: { padding: "28px 48px", borderBottom: "1px solid rgba(44,26,14,0.08)" },
  wordmark: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 26, fontWeight: 600, color: C.soil, textDecoration: "none", letterSpacing: "-0.02em" },
  dot: { color: C.green },
  main: { maxWidth: 720, margin: "0 auto", padding: "80px 24px" },
  h1: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 44, color: C.soil, margin: "0 0 24px", fontWeight: 600 },
  body: { fontSize: 17, color: C.ink, opacity: 0.82, margin: "0 0 40px" },
  link: { color: C.green, textDecoration: "none", borderBottom: `1px solid ${C.green}` },
  back: { color: C.soil, fontSize: 15, textDecoration: "none", borderBottom: `1px solid ${C.soil}`, paddingBottom: 2 },
};

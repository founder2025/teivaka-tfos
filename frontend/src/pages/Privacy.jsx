import { Link } from "react-router-dom";

export default function Privacy() {
  const ps = {
    effective: { fontSize: 14, color: C.soil, opacity: 0.6, margin: "0 0 40px" },
    h2: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 24, color: C.soil, fontWeight: 600, margin: "40px 0 12px" },
    p: { fontSize: 17, color: C.ink, opacity: 0.82, margin: "0 0 16px" },
    ul: { fontSize: 17, color: C.ink, opacity: 0.82, margin: "0 0 16px", paddingLeft: 24 },
    li: { margin: "0 0 8px" },
    footer: { marginTop: 56, paddingTop: 20, borderTop: "1px solid rgba(44,26,14,0.08)", fontSize: 14, color: C.soil, opacity: 0.6 },
  };
  return (
    <div style={S.page}>
      <header style={S.header}>
        <Link to="/" style={S.wordmark}>
          Teivaka<span style={S.dot}>.</span>
        </Link>
      </header>
      <main style={S.main}>
        <h1 style={S.h1}>Privacy Notice</h1>
        <p style={ps.effective}>Effective 22 May 2026</p>

        <h2 style={ps.h2}>Who we are</h2>
        <p style={ps.p}>
          Teivaka PTE LTD is a company registered in Fiji. We operate this website
          and the products described on it. For questions about this notice you can
          reach us through the contact form on the site, or via the WhatsApp button
          shown in the chat assistant.
        </p>

        <h2 style={ps.h2}>What we collect when you use the chat assistant</h2>
        <p style={ps.p}>
          The chat assistant on this site is provided to help visitors learn about
          Teivaka. When you send a message to the assistant, we record:
        </p>
        <ul style={ps.ul}>
          <li style={ps.li}>The text of the question you asked.</li>
          <li style={ps.li}>The text of the answer the assistant gave.</li>
          <li style={ps.li}>A randomly generated session identifier so we can group multi-message conversations.</li>
          <li style={ps.li}>Your IP address and browser identifier, stored only after one-way hashing. We cannot reverse the hashed values to identify you.</li>
          <li style={ps.li}>Technical metadata: response time, confidence score of the retrieval, which content sources were referenced.</li>
        </ul>

        <h2 style={ps.h2}>How we use it</h2>
        <p style={ps.p}>We use the collected data only to:</p>
        <ul style={ps.ul}>
          <li style={ps.li}>Improve the accuracy and safety of the assistant.</li>
          <li style={ps.li}>Detect and prevent abuse of the chat endpoint.</li>
          <li style={ps.li}>Investigate technical issues reported to us.</li>
        </ul>
        <p style={ps.p}>
          We do not sell this data. We do not use it for advertising. We do not share
          it with third parties except as required to provide the service itself
          (described below).
        </p>

        <h2 style={ps.h2}>Service providers we rely on</h2>
        <p style={ps.p}>
          The chat assistant uses third-party language model and embedding services
          provided by OpenAI and Anthropic. When you send a question, the text of
          that question is transmitted to these providers as part of generating the
          response. Your IP address and browser identifier are not shared with them.
        </p>

        <h2 style={ps.h2}>What the assistant answers</h2>
        <p style={ps.p}>
          The assistant answers only from material we have published on this site.
          For questions specific to your own situation, for sensitive matters, or
          for anything that requires a direct human response, the assistant will
          decline and direct you to the founder via WhatsApp.
        </p>

        <h2 style={ps.h2}>Cookies and tracking</h2>
        <p style={ps.p}>
          This site does not set tracking cookies for advertising purposes. We use
          only the minimum cookies required for the site to function.
        </p>

        <h2 style={ps.h2}>Changes to this notice</h2>
        <p style={ps.p}>
          We may update this notice. The effective date at the top of the page will
          reflect the most recent change.
        </p>

        <Link to="/" style={S.back}>← Back to home</Link>

        <div style={ps.footer}>Teivaka PTE LTD · Korovou, Tailevu, Fiji</div>
      </main>
    </div>
  );
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

import { Link } from "react-router-dom";

// In-app (.tfp) palette — mirrors prototype.css light theme.
const T = {
  cream: "#F8F3E9", paper: "#FFFFFF", green: "#6AA84F", greenDk: "#4F8A37",
  soil: "#5C4033", line: "#E2D8C3", ink: "#2A2118", muted: "#7A6E5C",
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const CONTACT = "hello@teivaka.com";

export const PRIVACY_VERSION = "1.0";

// Shared legal-document layout (used by Privacy + Terms).
export function LegalDoc({ title, version, updated, children }) {
  return (
    <div style={{ minHeight: "100vh", background: T.cream, color: T.ink, fontFamily: FONT, lineHeight: 1.65 }}>
      <header style={{ padding: "18px 24px", borderBottom: `1px solid ${T.line}`, background: T.paper, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link to="/" style={{ display: "inline-flex", alignItems: "center" }}>
            <img src="/teivaka_logo.png" alt="Teivaka" style={{ height: 44, width: "auto" }} />
          </Link>
          <Link to="/register" style={{ color: T.greenDk, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
            Create account →
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 80px" }}>
        <h1 style={{ fontSize: 34, fontWeight: 700, color: T.soil, margin: "0 0 8px" }}>{title}</h1>
        <p style={{ fontSize: 13, color: T.muted, margin: "0 0 36px" }}>
          Version {version} · Last updated {updated}
        </p>
        <div style={{ fontSize: 16 }}>{children}</div>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: `1px solid ${T.line}`, display: "flex", gap: 20, fontSize: 14 }}>
          <Link to="/privacy" style={{ color: T.greenDk, textDecoration: "none" }}>Privacy Policy</Link>
          <Link to="/terms" style={{ color: T.greenDk, textDecoration: "none" }}>Terms of Service</Link>
          <Link to="/" style={{ color: T.muted, textDecoration: "none", marginLeft: "auto" }}>← Back to home</Link>
        </div>
      </main>
    </div>
  );
}

// Section + paragraph helpers for consistent typography.
export function H2({ children }) {
  return <h2 style={{ fontSize: 20, fontWeight: 700, color: T.soil, margin: "32px 0 10px" }}>{children}</h2>;
}
export function P({ children }) {
  return <p style={{ margin: "0 0 14px", color: T.ink }}>{children}</p>;
}
export function Mail() {
  return <a href={`mailto:${CONTACT}`} style={{ color: T.greenDk, textDecoration: "underline" }}>{CONTACT}</a>;
}

export default function Privacy() {
  return (
    <LegalDoc title="Privacy Policy" version={PRIVACY_VERSION} updated="June 2026">
      <P>
        Teivaka PTE Limited ("Teivaka", "we", "us") operates the Teivaka Farm Operating
        System (TFOS). This policy explains what personal information we collect, how we
        use and protect it, and the choices you have. By creating an account you agree to
        this policy.
      </P>

      <H2>1. Information we collect</H2>
      <P>
        When you register we collect your name, email address, phone/WhatsApp number (if
        provided), date of birth, country, and the account type you select. We record the
        IP address and device/browser information of your registration to prevent fraud
        and abuse. As you use the platform we store the farm, crop, livestock, financial
        and activity records you enter.
      </P>

      <H2>2. How we use your information</H2>
      <P>
        We use your data to operate your account, deliver operational alerts (including via
        WhatsApp where you opt in), provide AI-assisted farming intelligence (TIS), generate
        the reports and bank-evidence documents you request, and improve the platform.
      </P>

      <H2>3. Data security</H2>
      <P>
        Data is encrypted in transit (TLS) and at rest. Passwords are hashed with bcrypt and
        are never stored in plain text. Access to your records is isolated per account using
        row-level security, so no other tenant can read your farm data.
      </P>

      <H2>4. Fraud prevention</H2>
      <P>
        To protect the community we log registration attempts, IP addresses and device
        fingerprints, and apply rate limits. Accounts found to be fraudulent, automated, or
        abusive may be suspended.
      </P>

      <H2>5. Sharing and disclosure</H2>
      <P>
        We do not sell your personal data. We share it only with service providers that help
        us run the platform (such as messaging and email delivery), when you explicitly direct
        us to (for example, generating a bank-evidence document you choose to share), or where
        required by law. Aggregated, de-identified insights may be used to improve services and
        are only ever combined across accounts with your separate, optional consent.
      </P>

      <H2>6. Your rights</H2>
      <P>
        You may request access to, correction of, or deletion of your personal data at any
        time by contacting <Mail />. Verified deletion requests are processed within 30 days,
        except where we must retain certain records to meet legal or audit-integrity obligations.
      </P>

      <H2>7. Data retention</H2>
      <P>
        We keep your information for as long as your account is active and as needed to provide
        the service. Audit and compliance records that underpin bank-evidence integrity may be
        retained for longer where required.
      </P>

      <H2>8. Age requirement</H2>
      <P>You must be at least 18 years old to register. By providing your date of birth you confirm you meet this requirement.</P>

      <H2>9. Changes to this policy</H2>
      <P>
        We may update this policy from time to time. Material changes will be notified in-app or
        by email, and the version and date above will be revised.
      </P>

      <H2>10. Contact</H2>
      <P>Questions about this policy or your data? Email us at <Mail />.</P>
    </LegalDoc>
  );
}

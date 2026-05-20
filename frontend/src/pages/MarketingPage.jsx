// ── src/pages/MarketingPage.jsx ───────────────────────────────────────────────
// Single component renders all 10 marketing pages (About, What We Do, Impact,
// Team, Partner, Contact, TIS public, TFOS public, Our Farms, Farms).
//
// Each page shares the same shell (header with logo+Login, footer) and pulls
// its content from the PAGE_CONTENT map below.
//
// Content drafted from Teivaka project docs (TFOS_Master_Build_Instruction.md,
// TFOS_Platform_Architecture.md). BOSS: edit any text you want to refine — look
// for "BOSS:" comments to find soft spots that especially need your voice.
//
// Created: 2026-05-20 in Phase 2 nav-completion sprint.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// ── Design tokens (matches Landing.l3.html) ───────────────────────────────────
const COLORS = {
  cream:    "#F8F3E9",
  cream2:   "#EFE8D8",
  paper:    "#FFFFFF",
  green:    "#6AA84F",
  greenDk:  "#4F8A37",
  soil:     "#5C4033",
  soil2:    "#7A5C4E",
  amber:    "#BF9000",
  red:      "#A32D2D",
  line:     "#E2D8C3",
  ink:      "#2A2118",
  muted:    "#7A6E5C",
  inkOnDark:"#F8F3E9",
};

const FONTS = {
  display: "'IBM Plex Serif', Georgia, serif",
  body:    "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  mono:    "'IBM Plex Mono', 'SF Mono', Menlo, monospace",
};

// ── Content map ───────────────────────────────────────────────────────────────
// Each entry: { title, tagline, sections: [{ heading, body, list? }] }
// "body" is a paragraph string; "list" is an optional bulleted list.
// Markdown not parsed — keep it plain or use the basic inline tags supported.

const PAGE_CONTENT = {
  about: {
    title: "About Teivaka",
    tagline: "A Fiji agricultural company building the system for every Pacific smallholder.",
    sections: [
      {
        heading: "Who we are",
        body: "Teivaka PTE LTD is a Fiji-incorporated agricultural company (Co. No. 2025RC001894) building TFOS — the Teivaka Farm Operating System. We are headquartered in Fiji, with active pilot farms in Korovou (Serua Province, mainland) and on Kadavu Island.",
      },
      {
        heading: "Why we exist",
        body: "Smallholder farmers across the Pacific have been told for decades that software wasn't built for them. The interfaces were too cluttered, the language too technical, the connectivity assumptions too generous, the workflows imported from continental agribusiness that has nothing to do with island reality. Teivaka exists to end that. We are building the operational nervous system that turns smallholder farmers — starting in the Pacific, expanding globally — from uncertain traditional practitioners into systemized, data-driven operators. Without abandoning what already works for them.",
      },
      {
        heading: "What guides us",
        body: "Three commitments shape every decision we make:",
        list: [
          "The farmer opens the app, sees one task, does it, closes the app. If a feature does not serve that loop, it is debt.",
          "The reference user is a Kadavu Island farmer on a flaky 3G connection — not an edge case. If it breaks there, it is broken everywhere.",
          "Every line we ship must work for a farmer in Sigatoka, a farmer in Solomon Islands, and eventually a farmer in Kenya. Pacific first. Global by design.",
        ],
      },
    ],
  },

  "what-we-do": {
    title: "What we do",
    tagline: "We build the operational backbone for Pacific smallholder agriculture.",
    sections: [
      {
        heading: "The platform",
        body: "TFOS is a full-stack agricultural intelligence platform. Farmers use it daily to log what happened on their farm — the harvest, the irrigation, the chemical application, the cash sale, the worker hours, the goat that died. Each event is captured, anchored to the farm, block, crop, and operator, and chained into an audit record that cannot be altered after the fact.",
      },
      {
        heading: "How farmers use it",
        body: "TFOS adapts to the farmer. A subsistence smallholder sees a single task card with voice playback and three buttons. A growing operation sees a five-pillar navigation across Home, Classroom, Farm, TIS, and Me. A commercial operator with multiple farms and many hectares sees analytics, multi-farm rollup, and the full operational depth. The same database. The same audit chain. Three different surfaces.",
      },
      {
        heading: "What it produces",
        body: "Three byproducts emerge from farmers doing what they were going to do anyway:",
        list: [
          "A complete operational record of the farm — what was planted, when, how it performed, what it cost, what it earned.",
          "A bank-grade evidence trail (audit-anchored, hash-chained, publicly verifiable) that opens credit access for farmers who have used the system long enough to accumulate verifiable record.",
          "A continuous AI mentor (TIS) grounded in the farmer's actual operation — not a generic chatbot, but an assistant that knows the farm and gives advice that fits it.",
        ],
      },
      {
        heading: "What it does not do",
        body: "TFOS is not a marketplace. It is not a payments rail. It is not a co-op management system. It is the operational layer underneath farming itself. Other things may sit on top of it later; the core remains the farmer's daily execution.",
      },
    ],
  },

  impact: {
    title: "Impact",
    tagline: "Built so that a Pacific smallholder can walk into a bank with a QR code and get a loan.",
    sections: [
      {
        heading: "The credit access problem",
        body: "A smallholder farmer in Fiji, Tonga, or Solomon Islands typically has no verifiable production record. Banks cannot underwrite them, so they cannot access the working capital that would let them buy inputs, scale their operation, or recover from a bad season. The result is that capital flows to large operators while smallholders stay locked out — even when the smallholder is the more reliable, more sustainable producer.",
      },
      {
        heading: "How TFOS changes that",
        body: "Every event a farmer logs on TFOS is hash-chained into an immutable audit record. After a season or two of consistent use, that record is no longer a story the farmer tells the bank; it is mathematics the bank can verify in seconds via a public verification endpoint. The farmer scans a QR code from their phone. The banker scans it on the other side of the desk. Both see the same provable production history.",
      },
      {
        heading: "Who benefits",
        body: "The platform is being built first for two pilot farms — Save-A-Lot in Korovou and Viyasiyasi on Kadavu Island — to harden every workflow against real Pacific conditions. From there it opens to:",
        list: [
          "Phase 1: Fijian smallholders across all 14 provinces.",
          "Phase 2: Smallholders in Tonga, Samoa, Vanuatu, Solomon Islands, Papua New Guinea, Cook Islands, Kiribati, Tuvalu, Niue, Tokelau, Wallis and Futuna, Marshall Islands, FSM, and Palau.",
          "Phase 3: Global smallholder agriculture — Southeast Asia, Sub-Saharan Africa, Latin America, the Caribbean.",
        ],
      },
      {
        heading: "Why this is more than software",
        body: "Smallholder agriculture feeds a disproportionate share of the developing world. When smallholders can borrow, they invest. When they invest, they produce more — and they produce more sustainably than industrial alternatives. The unlock is not a new agronomic technique. The unlock is verifiable record. That is what Teivaka is building.",
      },
    ],
  },

  team: {
    title: "Team",
    tagline: "Founder-led. Built from a working Fiji farm.",
    sections: [
      {
        heading: "Founder",
        body: "Teivaka is led by Uraia Koroi Kama (Cody), a Fijian agricultural operator and the founder of Teivaka PTE LTD. Cody operates Save-A-Lot Farm in Korovou (eggplant, cassava, pineapple, kava, apiculture) and Viyasiyasi Farm on Kadavu Island (goats). The platform is being built on top of the daily reality of running those two farms.",
      },
      {
        heading: "How we build",
        body: "Teivaka follows an income-funded build discipline. Every feature is funded by farm revenue. There is no growth-at-all-costs runway. Every line of code has to justify itself against either making the next task clearer for a farmer or making the farm more legible to the farmer themselves.",
      },
      {
        heading: "Joining the team",
        body: "We are not actively hiring at the moment. As we open up, roles will be posted here. If you are an engineer, agronomist, designer, or Pacific-language educator who wants to know when we are hiring, the best path is to email the founder directly — that is the only inbox we monitor.",
      },
    ],
  },

  partner: {
    title: "Partner with Teivaka",
    tagline: "We work with banks, exporters, donors, and agricultural agencies who want to reach Pacific smallholders.",
    sections: [
      {
        heading: "Lenders and credit providers",
        body: "TFOS produces auditable, hash-chained production records that can be verified by any third party with a public verification endpoint. If you are a bank, microfinance institution, or rural credit provider trying to underwrite smallholder loans without a paper trail to underwrite against, the audit chain is the asset you have been missing.",
      },
      {
        heading: "Buyers, exporters, and supermarket groups",
        body: "TFOS captures harvest events, grading, and delivery confirmations at the farm level. Buyers can verify chemical compliance windows, harvest provenance, and supply consistency from real data, not paper claims. If you procure from Pacific smallholders and want better data on what you are buying, partner with us.",
      },
      {
        heading: "Donors and development agencies",
        body: "Teivaka measures its own impact in farmers onboarded, credit unlocked, and verifiable revenue captured — not in vanity metrics. If your mandate is Pacific food security, rural credit access, or smallholder digital adoption, the platform is the most measurable intervention you can fund.",
      },
      {
        heading: "Government and agricultural ministries",
        body: "TFOS can serve as the operational layer underneath extension services, subsidy programmes, and biosecurity reporting — without imposing a single new workflow on farmers, because the data is already being captured.",
      },
      {
        heading: "How to start the conversation",
        body: "Email the founder directly at founder@teivaka.com. Tell us who you are, what you are trying to reach Pacific smallholders to do, and the time horizon you are working on. We will respond with whether the platform is in a state where it can serve that partnership today, or when it will be.",
      },
    ],
  },

  contact: {
    title: "Contact",
    tagline: "One inbox. The founder reads it.",
    sections: [
      {
        heading: "Email",
        body: "founder@teivaka.com — this is the only inbox we monitor. Whether you are a farmer wanting to onboard, a partner exploring collaboration, a journalist, an investor, or someone reporting a bug on the platform, this is the right address.",
      },
      {
        heading: "Company details",
        body: "Teivaka PTE LTD. Company Number: 2025RC001894. Registered in Fiji. Currency for pilot operations: FJD. Working timezone: Pacific/Fiji (UTC+12).",
      },
      {
        heading: "Where we are",
        body: "Headquarters in Fiji. Pilot operations at Save-A-Lot Farm (Korovou, Serua Province) and Viyasiyasi Farm (Kadavu Island).",
      },
      {
        heading: "Response time",
        body: "We aim to respond within two business days. We are a small team and we run two working farms — sometimes there is a ferry to catch or a harvest to coordinate, and we will be slower than we would like. Thank you for your patience.",
      },
    ],
  },

  tis: {
    title: "TIS — Teivaka Intelligence System",
    tagline: "The AI mentor that knows your farm.",
    sections: [
      {
        heading: "What it is",
        body: "TIS is the AI assistant inside Teivaka. Unlike generic chatbots, TIS is anchored to each individual farmer's actual operation. When a farmer asks it a question — by voice through WhatsApp, by tap in the app, or by typing — TIS answers grounded in three layers: what is happening on the farmer's farm right now, what is happening across the region (weather, market prices, peer signal), and general agronomy.",
      },
      {
        heading: "How it works",
        body: "TIS is built on Claude — currently the strongest reasoning AI publicly available — accessed via the OpenClaw gateway that lets Teivaka serve TIS to farmers at zero per-message cost. That economics is what makes a continuous AI mentor possible at smallholder pricing. The same architecture would be impossible to sustain at the per-token rates that other AI assistants are billed at.",
      },
      {
        heading: "How farmers use it",
        body: "TIS responds in the farmer's own language and idiom. A farmer in Kadavu can ask in iTaukei or Fiji Hindi or English why their eggplants are wilting, and TIS will give them an answer based on what the farmer logged about that block over the past three weeks — not a generic 'eggplants need water' response. TIS will also cite which layer the answer came from, so the farmer knows whether it is reading their own data, regional intelligence, or general knowledge.",
      },
      {
        heading: "What it does not do",
        body: "TIS does not pretend to be a person. TIS does not make claims it cannot ground. When TIS doesn't know, TIS says so and offers to escalate to the founder. The farmer is always in control of what gets logged, what gets acted on, and what stays private.",
      },
    ],
  },

  tfos: {
    title: "TFOS — Teivaka Farm Operating System",
    tagline: "The full agricultural management platform underneath everything else.",
    sections: [
      {
        heading: "What it is",
        body: "TFOS is the heart of Teivaka. It is where the farm becomes data. Every event — every planting, every harvest, every chemical application, every cash transaction, every worker check-in, every dead animal — is captured as a structured, time-stamped, audit-anchored record. There is no parallel data entry. There are no spreadsheets running in the background. TFOS is the system of record.",
      },
      {
        heading: "What it tracks",
        body: "Seven verticals, every operation type:",
        list: [
          "Crops — planting, irrigation, fertilizer, chemical application, harvest, post-harvest loss, grading, sales.",
          "Horticulture — protected agriculture, propagation, nursery management, transplant.",
          "Livestock — poultry, cattle, goats, pigs, sheep, apiculture. Group-level and individual.",
          "Aquaculture — pond management, stocking, feed, harvest.",
          "Forestry — long-rotation crops, timber, replanting.",
          "Floriculture — ornamental and cut-flower production.",
          "Integrated Systems — operations that cross verticals (worker time, cash, equipment, observations).",
        ],
      },
      {
        heading: "How it adapts",
        body: "TFOS recognizes three modes — Solo, Growth, and Commercial — derived from how the farm is operating (size, active cycles, tenure). A subsistence farmer never sees the commercial interface. A commercial operator never sees the simplified single-task surface. The same data flows underneath all three.",
      },
      {
        heading: "Why this matters",
        body: "Smallholder agriculture has been data-poor not because farmers do not have data, but because no one has built a tool that fits how they actually work. TFOS is built farm-up, not boardroom-down. It is being hardened on two real Fiji farms before it is offered to anyone else.",
      },
    ],
  },

  "our-farms": {
    title: "Our farms",
    tagline: "Two working Fiji farms where TFOS is being hardened against reality.",
    sections: [
      {
        heading: "Save-A-Lot Farm (F001)",
        body: "Approximately 83 acres in Korovou, Serua Province on Fiji's main island, Viti Levu. Held under iTaukei (NLTB) lease. Active production includes eggplant, cassava, pineapple, and kava. Apiculture operation of four beehives. Primary buyer relationship with the Nayans supermarket group. One permanent worker (Laisenia Waqa) plus casuals as the cycles demand.",
      },
      {
        heading: "Viyasiyasi Farm (F002)",
        body: "Located on Kadavu Island, accessible only by ferry. Eight goats. F002 is the reference user for offline-first design — if a TFOS feature breaks on a flaky 3G connection on Kadavu, it is broken everywhere. Every architectural decision is tested against this constraint before it ships.",
      },
      {
        heading: "Why two farms, not one",
        body: "Save-A-Lot is the data-dense, road-accessible, multi-crop, multi-buyer farm. Viyasiyasi is the constrained, remote, single-vertical, intermittent-connectivity farm. Building the platform across both means TFOS hardens against the full range of conditions a Pacific smallholder might operate under — not just the easy ones.",
      },
      {
        heading: "Real, not theatre",
        body: "These are operating farms, not demo installations. They earn real revenue, employ real people, and ship to real buyers. The data that flows into TFOS is the data the farms are generating in their normal course of business. That is the only way to build a tool that other farms will trust.",
      },
    ],
  },

  // "farms" is the header nav button — point it to the same content as our-farms
  // It's the marketing alias for /our-farms.
  farms: null, // resolves to "our-farms" via the alias map below
};

// Aliases — the header "FARMS" button and footer "Our Farms" button hit the same page.
PAGE_CONTENT.farms = PAGE_CONTENT["our-farms"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function MarketingPage({ pageKey }) {
  // --- Email handoff: copy-to-clipboard + Gmail fallback (mailto-independent) ---
  const [emailCopied, setEmailCopied] = useState(false);
  const copyEmail = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const addr = "founder@teivaka.com";
    const showToast = () => {
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(addr).then(showToast).catch(() => {
        window.prompt("Copy this email address:", addr);
      });
    } else {
      window.prompt("Copy this email address:", addr);
    }
  };
  const openGmail = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    window.open(
      "https://mail.google.com/mail/?view=cm&fs=1&to=founder@teivaka.com",
      "_blank",
      "noopener,noreferrer"
    );
  };
  const emailActionsStyle = {
    display: "inline-flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 10,
  };
  const emailBtnStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: 6,
    border: "1px solid #6AA84F",
    background: "#fff",
    color: "#6AA84F",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
    fontFamily: "inherit",
  };
  const emailBtnPrimaryStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: 6,
    border: "1px solid #6AA84F",
    background: "#6AA84F",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
    fontFamily: "inherit",
  };
  const EmailBlock = () => (
    <span style={emailActionsStyle}>
      <button type="button" onClick={copyEmail} style={emailBtnPrimaryStyle}>
        {emailCopied ? "Copied!" : "Copy founder@teivaka.com"}
      </button>
      <button type="button" onClick={openGmail} style={emailBtnStyle}>
        Open in Gmail
      </button>
      <a href="mailto:founder@teivaka.com" style={emailBtnStyle}>
        Mail app
      </a>
    </span>
  );

  const navigate = useNavigate();
  const content = PAGE_CONTENT[pageKey];

  // Set page title for SEO/sharing
  useEffect(() => {
    if (content) {
      document.title = `${content.title} — Teivaka`;
    }
    // Scroll to top on page load
    window.scrollTo(0, 0);
  }, [content, pageKey]);

  if (!content) {
    return (
      <div style={shellStyle}>
        <Header navigate={navigate} />
        <main style={{ ...mainStyle, textAlign: "center", padding: "80px 24px" }}>
          <h1 style={h1Style}>Page not found</h1>
          <p style={pBodyStyle}>
            That page doesn't exist on Teivaka. Try{" "}
            <a href="#" onClick={(e) => { e.preventDefault(); navigate("/"); }} style={linkStyle}>
              going back home
            </a>.
          </p>
        </main>
        <Footer navigate={navigate} copyEmail={copyEmail} openGmail={openGmail} emailCopied={emailCopied} />
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <Header navigate={navigate} />
      <main style={mainStyle}>
        <h1 style={h1Style}>{content.title}</h1>
        <p style={taglineStyle}>{content.tagline}</p>

        {content.sections.map((section, idx) => (
          <section key={idx} style={sectionStyle}>
            <h2 style={h2Style}>{section.heading}</h2>
            <p style={pBodyStyle}>{section.body}</p>
            {section.body && section.body.indexOf("founder@teivaka.com") !== -1 && <EmailBlock />}
            {section.list && (
              <ul style={ulStyle}>
                {section.list.map((item, i) => (
                  <li key={i} style={liStyle}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <div style={ctaBlockStyle}>
          <p style={ctaTextStyle}>Ready to see what Teivaka does for a farmer?</p>
          <button
            onClick={() => navigate("/login")}
            style={ctaButtonStyle}
            onMouseOver={(e) => e.currentTarget.style.background = COLORS.greenDk}
            onMouseOut={(e) => e.currentTarget.style.background = COLORS.green}
          >
            Login to the platform
          </button>
        </div>
      </main>
      <Footer navigate={navigate} copyEmail={copyEmail} openGmail={openGmail} emailCopied={emailCopied} />
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────
function Header({ navigate }) {
  const go = (path) => (e) => { e.preventDefault(); navigate(path); };
  return (
    <header style={headerStyle}>
      <div style={headerInnerStyle}>
        <a href="#" onClick={go("/")} style={brandLinkStyle}>
          <img src="/teivaka-logo.png" alt="Teivaka" style={brandImgStyle} />
        </a>
        <nav style={headerNavStyle}>
          <a href="#" onClick={go("/about")} style={navLinkStyle}>About</a>
          <a href="#" onClick={go("/what-we-do")} style={navLinkStyle}>What We Do</a>
          <a href="#" onClick={go("/tis")} style={navLinkStyle}>TIS</a>
          <a href="#" onClick={go("/tfos")} style={navLinkStyle}>TFOS</a>
          <a href="#" onClick={go("/our-farms")} style={navLinkStyle}>Farms</a>
          <a href="#" onClick={go("/impact")} style={navLinkStyle}>Impact</a>
          <a href="#" onClick={go("/partner")} style={navLinkStyle}>Partner</a>
          <a href="#" onClick={go("/contact")} style={navLinkStyle}>Contact</a>
          <button onClick={() => navigate("/login")} style={loginButtonStyle}>Login</button>
        </nav>
      </div>
    </header>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer({ navigate, copyEmail, openGmail, emailCopied }) {
  const go = (path) => (e) => { e.preventDefault(); navigate(path); };
  return (
    <footer style={footerStyle}>
      <div style={footerInnerStyle}>
        <div style={footerColStyle}>
          <a href="#" onClick={go("/")} style={footerBrandLinkStyle}>
            <img src="/teivaka-logo.png" alt="Teivaka" style={footerBrandImgStyle} />
          </a>
          <p style={footerTaglineStyle}>
            Generate wealth from idle lands. A Fiji agricultural company building the system for every Pacific smallholder.
          </p>
        </div>
        <div style={footerColStyle}>
          <h4 style={footerHeadingStyle}>Company</h4>
          <a href="#" onClick={go("/about")} style={footerLinkStyle}>About</a>
          <a href="#" onClick={go("/what-we-do")} style={footerLinkStyle}>What We Do</a>
          <a href="#" onClick={go("/impact")} style={footerLinkStyle}>Impact</a>
          <a href="#" onClick={go("/team")} style={footerLinkStyle}>Team</a>
        </div>
        <div style={footerColStyle}>
          <h4 style={footerHeadingStyle}>Platform</h4>
          <a href="#" onClick={go("/tis")} style={footerLinkStyle}>TIS</a>
          <a href="#" onClick={go("/tfos")} style={footerLinkStyle}>TFOS</a>
          <a href="#" onClick={go("/our-farms")} style={footerLinkStyle}>Our Farms</a>
          <a href="#" onClick={go("/login")} style={footerLinkStyle}>Login</a>
        </div>
        <div style={footerColStyle}>
          <h4 style={footerHeadingStyle}>Connect</h4>
          <a href="#" onClick={go("/partner")} style={footerLinkStyle}>Partner</a>
          <a href="#" onClick={go("/contact")} style={footerLinkStyle}>Contact</a>
          <a href="#" onClick={copyEmail} style={footerLinkStyle} title="Click to copy">
            {emailCopied ? "Copied!" : "founder@teivaka.com"}
          </a>
          <a href="#" onClick={openGmail} style={footerLinkStyle}>Open in Gmail</a>
        </div>
      </div>
      <div style={footerBottomStyle}>
        <p style={footerCopyStyle}>© 2026 Teivaka PTE LTD · Fiji · Co. No. 2025RC001894</p>
      </div>
    </footer>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const shellStyle = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  background: COLORS.cream,
  color: COLORS.ink,
  fontFamily: FONTS.body,
  fontSize: "16px",
  lineHeight: 1.6,
};

const headerStyle = {
  background: COLORS.cream2,
  borderBottom: `1px solid ${COLORS.line}`,
  position: "sticky",
  top: 0,
  zIndex: 100,
};

const headerInnerStyle = {
  maxWidth: 1200,
  margin: "0 auto",
  padding: "16px 24px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 16,
};

const brandLinkStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  textDecoration: "none",
  color: COLORS.soil,
};

const brandMarkStyle = {
  width: 32,
  height: 32,
  borderRadius: 6,
  background: COLORS.green,
  color: "#fff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: FONTS.display,
  fontWeight: 700,
  fontSize: 18,
};



  const brandImgStyle = {
  height: 36,
  width: "auto",
  display: "block",
};

const footerBrandImgStyle = {
  height: 38,
  width: "auto",
  display: "block",
  marginBottom: 4,
};

const brandTextStyle = {
  fontFamily: FONTS.display,
  fontWeight: 700,
  fontSize: 20,
  letterSpacing: "0.5px",
};

const headerNavStyle = {
  display: "flex",
  alignItems: "center",
  gap: 24,
  flexWrap: "wrap",
};

const navLinkStyle = {
  fontFamily: FONTS.body,
  fontSize: 12,
  fontWeight: 500,
  color: COLORS.soil,
  textDecoration: "none",
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  cursor: "pointer",
};

const loginButtonStyle = {
  background: COLORS.green,
  color: "#fff",
  border: "none",
  padding: "10px 22px",
  borderRadius: 999,
  fontFamily: FONTS.body,
  fontWeight: 600,
  fontSize: 13,
  letterSpacing: "0.5px",
  cursor: "pointer",
};

const mainStyle = {
  flex: 1,
  maxWidth: 800,
  margin: "0 auto",
  padding: "48px 24px 64px",
  width: "100%",
};

const h1Style = {
  fontFamily: FONTS.display,
  fontWeight: 700,
  fontSize: "44px",
  lineHeight: 1.15,
  margin: "0 0 12px",
  color: COLORS.soil,
};

const taglineStyle = {
  fontFamily: FONTS.display,
  fontSize: "20px",
  fontStyle: "italic",
  color: COLORS.soil2,
  margin: "0 0 40px",
  lineHeight: 1.4,
};

const sectionStyle = {
  marginBottom: 36,
};

const h2Style = {
  fontFamily: FONTS.display,
  fontWeight: 600,
  fontSize: "22px",
  color: COLORS.soil,
  margin: "0 0 12px",
};

const pBodyStyle = {
  margin: "0 0 14px",
  color: COLORS.ink,
};

const ulStyle = {
  margin: "8px 0 14px 0",
  padding: "0 0 0 22px",
};

const liStyle = {
  margin: "0 0 8px",
  color: COLORS.ink,
};

const linkStyle = {
  color: COLORS.greenDk,
  textDecoration: "underline",
};

const ctaBlockStyle = {
  marginTop: 48,
  padding: 32,
  background: COLORS.cream2,
  borderRadius: 12,
  textAlign: "center",
};

const ctaTextStyle = {
  fontFamily: FONTS.display,
  fontSize: 20,
  color: COLORS.soil,
  margin: "0 0 18px",
};

const ctaButtonStyle = {
  background: COLORS.green,
  color: "#fff",
  border: "none",
  padding: "14px 32px",
  borderRadius: 999,
  fontFamily: FONTS.body,
  fontWeight: 600,
  fontSize: 15,
  letterSpacing: "0.5px",
  cursor: "pointer",
};

const footerStyle = {
  background: COLORS.soil,
  color: COLORS.inkOnDark,
  padding: "56px 0 24px",
  marginTop: 64,
};

const footerInnerStyle = {
  maxWidth: 1200,
  margin: "0 auto",
  padding: "0 24px",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 40,
};

const footerColStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const footerBrandLinkStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  textDecoration: "none",
  color: COLORS.inkOnDark,
  marginBottom: 12,
};

const footerBrandTextStyle = {
  fontFamily: FONTS.display,
  fontWeight: 700,
  fontSize: 20,
  color: COLORS.cream,
};

const footerTaglineStyle = {
  fontSize: 13,
  color: COLORS.cream2,
  lineHeight: 1.6,
  margin: 0,
};

const footerHeadingStyle = {
  fontFamily: FONTS.mono,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "1.5px",
  color: COLORS.green,
  margin: "0 0 8px",
};

const footerLinkStyle = {
  color: COLORS.cream,
  textDecoration: "none",
  fontSize: 14,
  cursor: "pointer",
};

const footerBottomStyle = {
  maxWidth: 1200,
  margin: "32px auto 0",
  padding: "20px 24px 0",
  borderTop: `1px solid ${COLORS.soil2}`,
};

const footerCopyStyle = {
  fontSize: 12,
  color: COLORS.cream2,
  margin: 0,
};

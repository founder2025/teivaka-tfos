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
import { Facebook, Instagram, Youtube } from "lucide-react";

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

// ── Social channels ───────────────────────────────────────────────────────────
// Five real Teivaka channels (confirmed by Boss 2026-05-20). No LinkedIn / X —
// those accounts don't exist yet; per Doctrine 39.7 we don't show dormant
// channels. lucide-react covers Facebook/Instagram/Youtube. TikTok + WhatsApp
// have no lucide equivalent, so single-color inline brand marks are defined here
// with fill="currentColor" so the surrounding CSS color drives them.
const TikTokIcon = (props) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" {...props}>
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
  </svg>
);
const WhatsAppIcon = (props) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" {...props}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.36.101 11.946c0 2.105.549 4.16 1.595 5.973L0 24l6.335-1.652a11.96 11.96 0 005.71 1.454h.005c6.582 0 11.946-5.36 11.949-11.946A11.86 11.86 0 0020.52 3.449z"/>
  </svg>
);
const SOCIAL_LINKS = [
  { label: "Facebook",  href: "https://www.facebook.com/profile.php?id=61586061599745", Icon: Facebook },
  { label: "Instagram", href: "https://www.instagram.com/teivakaa",                      Icon: Instagram },
  { label: "YouTube",   href: "https://www.youtube.com/@TeivakaFarm",                     Icon: Youtube },
  { label: "TikTok",    href: "https://www.tiktok.com/@teivaka",                          Icon: TikTokIcon },
  { label: "WhatsApp",  href: "https://wa.me/6797336211",                                 Icon: WhatsAppIcon },
];
// Renders the five external social <a> links. The caller wraps these in a
// container with the appropriate scoped class (.ct-social-row / .tvf-social),
// which controls layout + color/hover for that surface.
const SocialIconLinks = () => (
  <>
    {SOCIAL_LINKS.map(({ label, href, Icon }) => (
      <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
        <Icon aria-hidden="true" />
      </a>
    ))}
  </>
);

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
        body: "Teivaka PTE LTD is a Fiji-incorporated agricultural company (Co. No. 2025RC001894) building TFOS — the Teivaka Farm Operating System. We are headquartered in Fiji, with active pilot farms in Korovou (Tailevu Province, mainland) and on Kadavu Island.",
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
    tagline: "One company. Three honest layers.",
    sections: [
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
    tagline: "Two people running two farms while building the platform.",
    sections: [],
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
        heading: "Phone — Company (WhatsApp Business)",
        body: "+679 7336211 — the Teivaka company line, reachable on WhatsApp Business.",
      },
      {
        heading: "Phone — Founder (direct)",
        body: "+679 8730866 — the founder's direct line, also on WhatsApp.",
      },
      {
        heading: "Company details",
        body: "Teivaka PTE LTD. Company Number: 2025RC001894. Registered in Fiji. Currency for pilot operations: FJD. Working timezone: Pacific/Fiji (UTC+12).",
      },
      {
        heading: "Where we are",
        body: "Headquarters in Fiji. Pilot operations at Save-A-Lot Farm (Korovou, Tailevu Province) and Viyasiyasi Farm (Kadavu Island).",
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
        heading: "Save-A-Lot Farm",
        body: "Approximately 83 acres in Korovou, Tailevu Province on Fiji's main island, Viti Levu. Held under iTaukei (NLTB) lease. Active production includes eggplant, cassava, pineapple, and kava. Apiculture operation of four beehives. Primary buyer relationship with the Nayans supermarket group. One permanent worker plus casuals as the cycles demand.",
      },
      {
        heading: "Viyasiyasi Farm",
        body: "Located on Kadavu Island, accessible only by ferry. Eight goats. Viyasiyasi is the reference user for offline-first design — if a TFOS feature breaks on a flaky 3G connection on Kadavu, it is broken everywhere. Every architectural decision is tested against this constraint before it ships.",
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
        <TeivakaFooter navigate={navigate} copyEmail={copyEmail} openGmail={openGmail} emailCopied={emailCopied} />
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <Header navigate={navigate} />
      <main style={mainStyle}>
        <h1 style={h1Style}>{content.title}</h1>
        <p style={taglineStyle}>{content.tagline}</p>

        {pageKey === "about" && (
          <section className="fdr-quote">
            <style>{`
.fdr-quote{max-width:760px;margin:0 auto;padding:48px 0 40px;border-bottom:1px solid rgba(92,64,51,0.12);background:#F8F3E9}
.fdr-quote .fdr-label{font-family:'IBM Plex Mono','SF Mono',Menlo,monospace;font-size:11px;letter-spacing:0.13em;text-transform:uppercase;color:#6AA84F;margin:0 0 18px}
.fdr-quote .fdr-bq{font-family:'IBM Plex Serif',Georgia,serif;font-style:italic;font-size:19px;line-height:1.65;color:#5C4033;margin:0;border-left:3px solid #6AA84F;padding-left:24px}
.fdr-quote .fdr-attr{font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;font-weight:600;color:#5C4033;margin-top:24px;padding-left:24px;text-align:left}
@media (max-width:640px){
  .fdr-quote .fdr-bq{font-size:17px}
}
`}</style>
            <p className="fdr-label">Founder</p>
            <blockquote className="fdr-bq">
              {"“I left a Science Degree and came home to Kadavu to farm — and in one season I learned what every Pacific farmer carries but no one says out loud: we work harder than farmers anywhere in the world, on land we cannot prove, with numbers we never had, for buyers who decide our worth in silence. Our grandfathers farmed by memory. We have been farming by memory too — and calling it tradition. It is not tradition. It is the reason a banker can look at a man with twenty years of harvest behind him and see nothing. The land is not the problem. The farmer is not the problem. The absence of a system that respects what we do — that is the problem. So I built one. On my own farms first. Before I asked a single other farmer to trust it with their season.”"}
            </blockquote>
            <p className="fdr-attr">{"— Uraia Koroi Kama, Founder"}</p>
          </section>
        )}

        {pageKey === "what-we-do" && (
          <div className="wwd">
            <style>{`
.wwd .wwd-lead{max-width:800px;margin:0 0 0;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:19px;line-height:1.5;color:#5C4033}
.wwd .wwd-descriptor{max-width:800px;margin:18px 0 36px;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:17px;line-height:1.65;color:#241910;opacity:0.85}
.wwd .wwd-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-bottom:8px}
.wwd .wwd-card{background:#FBF8F1;border:1px solid rgba(92,64,51,0.16);border-radius:4px;padding:34px 30px}
.wwd .wwd-card .wwd-lt{font-family:'IBM Plex Mono','SF Mono',Menlo,monospace;font-size:11px;color:#4F8A37;letter-spacing:0.12em;text-transform:uppercase;font-weight:500}
.wwd .wwd-card h3{font-family:'IBM Plex Serif',Georgia,serif;font-size:23px;font-weight:600;line-height:1.08;margin:12px 0;color:#241910}
.wwd .wwd-card .wwd-pill{display:inline-flex;align-items:center;gap:7px;font-family:'IBM Plex Mono','SF Mono',Menlo,monospace;font-size:11px;font-weight:600;color:#fff;padding:5px 13px;border-radius:30px;margin-bottom:14px}
.wwd .wwd-card .wwd-dot{width:7px;height:7px;border-radius:50%;background:#fff;display:inline-block}
.wwd .wwd-pill-live{background:#6AA84F}
.wwd .wwd-pill-build{background:#BF9000}
.wwd .wwd-card p{font-size:15px;color:#5C4033;line-height:1.6;margin:0}
@media (max-width:768px){
  .wwd .wwd-cards{grid-template-columns:1fr}
}
`}</style>
            <p className="wwd-lead">We are transparent about the stage of each part of Teivaka — because trust is the product.</p>
            <p className="wwd-descriptor">Farmers use Teivaka daily to log what actually happens on their farm — the harvest, the irrigation, the chemical application, the cash sale, the worker hours, the goat that died. Each event is anchored to farm, block, crop, and operator. Each is chained into a verified record that cannot be altered after the fact.</p>
            <div className="wwd-cards">
              <div className="wwd-card">
                <div className="wwd-lt">Layer 01</div>
                <h3>The Operator</h3>
                <div className="wwd-pill wwd-pill-live"><span className="wwd-dot"></span>Earning today</div>
                <p>A working Fiji farm business that activates idle land through profit-share partnerships, manages it end-to-end, and sells to confirmed buyers. Real, and generating revenue now.</p>
              </div>
              <div className="wwd-card">
                <div className="wwd-lt">Layer 02</div>
                <h3>TIS — Live Pillar</h3>
                <div className="wwd-pill wwd-pill-live"><span className="wwd-dot"></span>Live on WhatsApp</div>
                <p>Teivaka Intelligent System — the live pillar of TFOS — turns Fiji's field-tested production systems into operational guidance on WhatsApp today, in the farmer's own language. No app to download.</p>
              </div>
              <div className="wwd-card">
                <div className="wwd-lt">Layer 03</div>
                <h3>TFOS — Platform</h3>
                <div className="wwd-pill wwd-pill-build"><span className="wwd-dot"></span>In active build</div>
                <p>The full agricultural operating system around four pillars — built on a disciplined, income-funded plan. It turns our proven method into a system every farmer can use.</p>
              </div>
            </div>
          </div>
        )}

        {pageKey === "team" && (
          <div className="tm">
            <style>{`
.tm .tm-sec{margin-bottom:40px}
.tm .tm-h2{font-family:'IBM Plex Serif',Georgia,serif;font-weight:600;font-size:22px;color:#5C4033;margin:0 0 14px}
.tm .tm-name{font-family:'IBM Plex Serif',Georgia,serif;font-weight:600;font-size:20px;color:#241910;margin:0 0 2px}
.tm .tm-role{font-family:'IBM Plex Mono','SF Mono',Menlo,monospace;font-size:12px;letter-spacing:0.04em;color:#6AA84F;margin:0 0 12px}
.tm .tm-bio{margin:0 0 14px;color:#2A2118;line-height:1.6}
.tm .tm-link{display:inline-block;color:#4F8A37;text-decoration:underline;font-size:15px;cursor:pointer;background:none;border:none;padding:0;font-family:inherit}
`}</style>
            <section className="tm-sec">
              <h2 className="tm-h2">Founder</h2>
              <p className="tm-name">Uraia Koroi Kama</p>
              <p className="tm-role">Founder, Teivaka PTE LTD</p>
              <p className="tm-bio">Uraia Koroi Kama (Cody) founded Teivaka and operates both pilot farms — Save-A-Lot Farm (eggplant, cassava, pineapple, kava, four beehives) and Viyasiyasi Farm on Kadavu Island (goats). He builds the platform against the daily reality of running them: a workflow that does not survive a season on his own farms does not ship to anyone else's.</p>
              <a href="#" className="tm-link" onClick={(e) => { e.preventDefault(); navigate("/about"); }}>Read the founder's story →</a>
            </section>
            <section className="tm-sec">
              <h2 className="tm-h2">On the farm</h2>
              <p className="tm-bio">One permanent farm worker on Save-A-Lot — sole daily operator across all production blocks plus the apiculture work. Casual hands as cycles demand.</p>
            </section>
            <section className="tm-sec">
              <h2 className="tm-h2">What's next</h2>
              <p className="tm-bio">Teivaka is hiring as the work demands — not before. The platform is income-funded, built on our own farms first. Roles will be posted here as they open.</p>
            </section>
          </div>
        )}

        {pageKey === "contact" && (
          <section style={sectionStyle} className="ct-social">
            <style>{`
.ct-social .ct-social-row{display:flex;align-items:center;gap:18px;margin-top:14px}
.ct-social .ct-social-row a{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;color:#5C4033;transition:color .2s;text-decoration:none}
.ct-social .ct-social-row a:hover{color:#6AA84F}
.ct-social .ct-social-row svg{width:24px;height:24px;display:block}
`}</style>
            <h2 style={h2Style}>Connect</h2>
            <p style={pBodyStyle}>Find us on Pacific channels and beyond.</p>
            <div className="ct-social-row">
              <SocialIconLinks />
            </div>
          </section>
        )}

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
      <TeivakaFooter navigate={navigate} copyEmail={copyEmail} openGmail={openGmail} emailCopied={emailCopied} />
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────
function Header({ navigate }) {
  const go = (path) => (e) => { e.preventDefault(); navigate(path); };
  return (
    <header style={headerStyle}>
      <div style={headerInnerStyle}>
        <style>{`
.mkt-brand{display:inline-flex;align-items:center;text-decoration:none;cursor:pointer}
.mkt-brand img{height:32px;width:auto;display:block}
`}</style>
        <a href="#" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="mkt-brand">
          <img src="/teivaka-lockup-dark.png" alt="Teivaka" />
        </a>
        <nav style={headerNavStyle}>
          <a href="#" onClick={go("/about")} style={navLinkStyle}>About</a>
          <a href="#" onClick={go("/what-we-do")} style={navLinkStyle}>What We Do</a>
          <a href="#" onClick={go("/tis")} style={navLinkStyle}>TIS</a>
          <a href="#" onClick={go("/tfos")} style={navLinkStyle}>TFOS</a>
          <a href="#" onClick={go("/our-farms")} style={navLinkStyle}>Farms</a>
          <a href="#" onClick={go("/partner")} style={navLinkStyle}>Partner</a>
          <a href="#" onClick={go("/contact")} style={navLinkStyle}>Contact</a>
          <button onClick={() => navigate("/login")} style={loginButtonStyle}>Login</button>
        </nav>
      </div>
    </header>
  );
}

// ── Footer (TeivakaFooter — visually matches the landing homepage footer) ────────
// Scoped <style> (all selectors under .tvf-footer) so it cannot bleed into the
// rest of the inline-styled marketing pages. Inline style objects can't express
// :hover or media queries, which the landing footer relies on.
const TVF_CSS = `
.tvf-footer{background:#241910;color:rgba(248,243,233,0.6);padding:64px 0 44px;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px}
.tvf-footer .tvf-wrap{max-width:1180px;margin:0 auto;padding:0 30px}
.tvf-footer .tvf-grid{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:44px;padding-bottom:42px;border-bottom:1px solid rgba(255,255,255,0.08)}
.tvf-footer .tvf-brand{display:inline-flex;align-items:center;gap:11px;margin-bottom:16px;text-decoration:none;cursor:pointer}
.tvf-footer .tvf-brand img{height:32px;width:auto;display:block}
.tvf-footer .tvf-tagline{max-width:300px;line-height:1.6;margin:0;color:rgba(248,243,233,0.6)}
.tvf-footer .tvf-col h4{font-family:'IBM Plex Mono','SF Mono',Menlo,monospace;font-size:11px;letter-spacing:0.13em;text-transform:uppercase;color:#6AA84F;margin:0 0 16px;font-weight:500}
.tvf-footer .tvf-col a{display:block;color:rgba(248,243,233,0.6);padding:5px 0;font-size:14px;cursor:pointer;text-decoration:none}
.tvf-footer .tvf-col a:hover{color:#F8F3E9}
.tvf-footer .tvf-legal{display:flex;flex-wrap:wrap;gap:24px;padding-top:26px;font-family:'IBM Plex Mono','SF Mono',Menlo,monospace;font-size:12px}
.tvf-footer .tvf-legal a{color:rgba(248,243,233,0.6);text-decoration:none;letter-spacing:0.03em;transition:color .2s;cursor:pointer}
.tvf-footer .tvf-legal a:hover{color:#6AA84F}
.tvf-footer .tvf-bottom{display:flex;justify-content:space-between;padding-top:28px;font-family:'IBM Plex Mono','SF Mono',Menlo,monospace;font-size:12px;color:rgba(248,243,233,0.45);flex-wrap:wrap;gap:12px}
@media (max-width:768px){
  .tvf-footer .tvf-grid{grid-template-columns:1fr}
  .tvf-footer .tvf-bottom{flex-direction:column}
}
.tvf-footer .tvf-social{display:flex;align-items:center;gap:16px;margin-top:16px;padding-top:16px;border-top:1px solid rgba(248,243,233,0.28)}
.tvf-footer .tvf-social a{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;color:rgba(248,243,233,0.6);transition:color .2s;cursor:pointer}
.tvf-footer .tvf-social a:hover{color:#6AA84F}
.tvf-footer .tvf-social svg{width:20px;height:20px;display:block}
`;

function TeivakaFooter({ navigate, copyEmail, openGmail, emailCopied }) {
  const go = (path) => (e) => { e.preventDefault(); navigate(path); };
  return (
    <footer className="tvf-footer">
      <style>{TVF_CSS}</style>
      <div className="tvf-wrap">
        <div className="tvf-grid">
          <div>
            <a href="#" onClick={go("/")} className="tvf-brand">
              <img src="/teivaka-lockup.png" alt="Teivaka" />
            </a>
            <p className="tvf-tagline">
              Generate wealth from idle lands. A Fiji agricultural company building the system for every Pacific smallholder.
            </p>
          </div>
          <div className="tvf-col">
            <h4>Company</h4>
            <a href="#" onClick={go("/about")}>About</a>
            <a href="#" onClick={go("/what-we-do")}>What We Do</a>
            <a href="#" onClick={go("/team")}>Team</a>
          </div>
          <div className="tvf-col">
            <h4>Platform</h4>
            <a href="#" onClick={go("/tis-public")}>TIS</a>
            <a href="#" onClick={go("/tfos")}>TFOS</a>
            <a href="#" onClick={go("/our-farms")}>Our Farms</a>
            <a href="#" onClick={(e) => { e.preventDefault(); navigate("/login"); }}>Login</a>
          </div>
          <div className="tvf-col">
            <h4>Connect</h4>
            <a href="#" onClick={go("/partner")}>Partner</a>
            <a href="#" onClick={go("/contact")}>Contact</a>
            <a href="#" onClick={copyEmail} title="Click to copy">
              {emailCopied ? "Copied!" : "founder@teivaka.com"}
            </a>
            <a href="#" onClick={openGmail}>Open in Gmail</a>
            <div className="tvf-social">
              <SocialIconLinks />
            </div>
          </div>
        </div>
        <div className="tvf-legal">
          <a href="#">Privacy Statement</a>
          <a href="#">Terms of Service</a>
          <a href="#">Agricultural Advisory Notice</a>
          <a href="#">AI Use Policy</a>
        </div>
        <div className="tvf-bottom">
          <span>© 2026 Teivaka PTE LTD · Fiji</span>
          <span>Generate Wealth from Idle Lands</span>
        </div>
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

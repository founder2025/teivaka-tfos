// ── src/pages/MarketingPage.jsx ───────────────────────────────────────────────
// Single component renders all 10 marketing pages (About, What We Do, Impact,
// Team, Partner, Contact, TIS public, TAE public, Our Farms, Farms).
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
  muted:    "var(--muted)",
  inkOnDark:"#F8F3E9",
};

const FONTS = {
  display: "'IBM Plex Serif', Georgia, serif",
  body:    "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  mono:    "'IBM Plex Mono', 'SF Mono', Menlo, monospace",
};

// ── Outbound contact endpoints (declared once, reused everywhere) ──────────────
// WA_FOUNDER  — Cody's direct line (+679 8730866), the human-first door.
// WA_TIS      — the TIS WhatsApp bot line (+679 7336211), farmer advisory only.
// GMAIL_COMPOSE — Gmail web compose (mailto-independent; see EmailBlock).
// wa(base,text) builds a prefilled wa.me link; gmail(su) adds a subject.
const WA_FOUNDER = "https://wa.me/6798730866";
const WA_TIS = "https://wa.me/6797336211";
const GMAIL_COMPOSE = "https://mail.google.com/mail/?view=cm&fs=1&to=founder@teivaka.com";
const wa = (base, text) => `${base}?text=${encodeURIComponent(text)}`;
const gmail = (su) => `${GMAIL_COMPOSE}&su=${encodeURIComponent(su)}`;
// Marketing TIS page lives at /tis-public (pageKey "tis"); bare /tis is the
// authenticated farmer tab. Internal "go to TIS" nav must use /tis-public.
const TIS_MARKETING_PATH = "/tis-public";

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
        body: "Teivaka PTE LTD is a Fiji-incorporated agricultural company (Co. No. 2025RC001894) building the Teivaka Agriculture Ecosystem. We are headquartered in Fiji, with active pilot farms in Korovou (Tailevu Province, mainland) and on Kadavu Island.",
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
        body: "TAE adapts to the farmer. A subsistence smallholder sees a single task card with voice playback and three buttons. A growing operation sees a five-pillar navigation across Home, Classroom, Farm, TIS, and Me. A commercial operator with multiple farms and many hectares sees analytics, multi-farm rollup, and the full operational depth. The same database. The same audit chain. Three different surfaces.",
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
        body: "TAE is not a marketplace. It is not a payments rail. It is not a co-op management system. It is the operational layer underneath farming itself. Other things may sit on top of it later; the core remains the farmer's daily execution.",
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
        heading: "How TAE changes that",
        body: "Every event a farmer logs on TAE is hash-chained into an immutable audit record. After a season or two of consistent use, that record is no longer a story the farmer tells the bank; it is mathematics the bank can verify in seconds via a public verification endpoint. The farmer scans a QR code from their phone. The banker scans it on the other side of the desk. Both see the same provable production history.",
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
        body: "TAE produces auditable, hash-chained production records that can be verified by any third party with a public verification endpoint. If you are a bank, microfinance institution, or rural credit provider trying to underwrite smallholder loans without a paper trail to underwrite against, the audit chain is the asset you have been missing.",
      },
      {
        heading: "Buyers, exporters, and supermarket groups",
        body: "TAE captures harvest events, grading, and delivery confirmations at the farm level. Buyers can verify chemical compliance windows, harvest provenance, and supply consistency from real data, not paper claims. If you procure from Pacific smallholders and want better data on what you are buying, partner with us.",
      },
      {
        heading: "Donors and development agencies",
        body: "Teivaka measures its own impact in farmers onboarded, credit unlocked, and verifiable revenue captured — not in vanity metrics. If your mandate is Pacific food security, rural credit access, or smallholder digital adoption, the platform is the most measurable intervention you can fund.",
      },
      {
        heading: "Government and agricultural ministries",
        body: "TAE can serve as the operational layer underneath extension services, subsidy programmes, and biosecurity reporting — without imposing a single new workflow on farmers, because the data is already being captured.",
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
    title: "Teivaka Agriculture Ecosystem",
    tagline: "The full agricultural management platform underneath everything else.",
    sections: [
      {
        heading: "What it is",
        body: "TAE is the heart of Teivaka. It is where the farm becomes data. Every event — every planting, every harvest, every chemical application, every cash transaction, every worker check-in, every dead animal — is captured as a structured, time-stamped, audit-anchored record. There is no parallel data entry. There are no spreadsheets running in the background. TAE is the system of record.",
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
        body: "TAE recognizes three modes — Solo, Growth, and Commercial — derived from how the farm is operating (size, active cycles, tenure). A subsistence farmer never sees the commercial interface. A commercial operator never sees the simplified single-task surface. The same data flows underneath all three.",
      },
      {
        heading: "Why this matters",
        body: "Smallholder agriculture has been data-poor not because farmers do not have data, but because no one has built a tool that fits how they actually work. TAE is built farm-up, not boardroom-down. It is being hardened on two real Fiji farms before it is offered to anyone else.",
      },
    ],
  },

  "our-farms": {
    title: "Our farms",
    tagline: "Two working Fiji farms where TAE is being hardened against reality.",
    sections: [
      {
        heading: "Save-A-Lot Farm",
        body: "Approximately 83 acres in Korovou, Tailevu Province on Fiji's main island, Viti Levu. Held under iTaukei (NLTB) lease. Active production includes eggplant, cassava, pineapple, and kava. Apiculture operation of four beehives. Primary buyer relationship with the Nayans supermarket group. One permanent worker plus casuals as the cycles demand.",
      },
      {
        heading: "Viyasiyasi Farm",
        body: "Located on Kadavu Island, accessible only by ferry. Eight goats. Viyasiyasi is the reference user for offline-first design — if a TAE feature breaks on a flaky 3G connection on Kadavu, it is broken everywhere. Every architectural decision is tested against this constraint before it ships.",
      },
      {
        heading: "Why two farms, not one",
        body: "Save-A-Lot is the data-dense, road-accessible, multi-crop, multi-buyer farm. Viyasiyasi is the constrained, remote, single-vertical, intermittent-connectivity farm. Building the platform across both means TAE hardens against the full range of conditions a Pacific smallholder might operate under — not just the easy ones.",
      },
      {
        heading: "Real, not theatre",
        body: "These are operating farms, not demo installations. They earn real revenue, employ real people, and ship to real buyers. The data that flows into TAE is the data the farms are generating in their normal course of business. That is the only way to build a tool that other farms will trust.",
      },
    ],
  },

  // "farms" is the header nav button — point it to the same content as our-farms
  // It's the marketing alias for /our-farms.
  farms: null, // resolves to "our-farms" via the alias map below
};

// Aliases — the header "FARMS" button and footer "Our Farms" button hit the same page.
PAGE_CONTENT.farms = PAGE_CONTENT["our-farms"];

// ── Our Farms: bespoke card + modal page ──────────────────────────────────────
// Renders for pageKey "our-farms" / "farms" in place of the default sections loop.
// PAGE_CONTENT["our-farms"] above is left intact as the fallback content block.
// All icons are inline flat SVG (1.5px stroke, currentColor) — no emoji, no deps.

const FARMS = {
  "save-a-lot": {
    name: "Save-A-Lot",
    location: "Korovou, Tailevu — Viti Levu",
    blurb: "Road-accessible, data-dense, multi-buyer. The mainland farm where TAE gets its high-frequency operational data.",
    tags: [
      { icon: "wheat", label: "Crops" },
      { icon: "leaf", label: "Vegetables" },
      { icon: "hive", label: "Apiculture" },
    ],
    whatsappPrefill: "Bula Cody, I want to know more about Save-A-Lot.",
    facts: [
      ["Location", "Korovou, Tailevu Province, Viti Levu (Fiji's main island)"],
      ["Tenure", "iTaukei (NLTB) lease"],
      ["Access", "Road, year-round"],
      ["Buyers", "Nayans supermarket group + four other institutional buyers"],
      ["Workers", "1 permanent + casuals as cycles demand"],
      ["Role in TAE", "Data-dense reference for multi-buyer, multi-crop workflows"],
    ],
    verticals: [
      { icon: "wheat", name: "Crops" },
      { icon: "leaf", name: "Vegetables" },
      { icon: "hive", name: "Apiculture" },
    ],
  },
  "viyasiyasi": {
    name: "Viyasiyasi",
    location: "Kadavu Island — ferry only",
    blurb: "Eleven verticals across one island. The constrained, offline-first farm that every TAE workflow gets tested against before it ships.",
    tags: [
      { icon: "livestock", label: "Livestock" },
      { icon: "honey", label: "Honey" },
      { icon: "sandalwood", label: "Sandalwood" },
      { icon: "agarwood", label: "Agarwood" },
      { icon: "leaf", label: "Kava" },
      { icon: null, label: "+6 more" },
    ],
    whatsappPrefill: "Bula Cody, I want to know more about Viyasiyasi.",
    facts: [
      ["Location", "Kadavu Island, Fiji"],
      ["Access", "Ferry only — no road shortcuts"],
      ["Connectivity", "Intermittent 3G — every architectural decision is tested here first"],
      ["Role in TAE", "Offline-first reference site. If a feature breaks on Kadavu, it's broken everywhere."],
    ],
    verticals: [
      { icon: "goat", name: "Goats" },
      { icon: "pig", name: "Pigs" },
      { icon: "egg", name: "Layer birds" },
      { icon: "duck", name: "Ducks" },
      { icon: "leaf", name: "Kava" },
      { icon: "sandalwood", name: "Sandalwood" },
      { icon: "agarwood", name: "Agarwood" },
      { icon: "pineapple", name: "Pineapple" },
      { icon: "honey", name: "Honey" },
      { icon: "wheat", name: "Crops" },
      { icon: "leaf", name: "Vegetables" },
    ],
  },
};

// Inline flat SVG icon set. Each entry is the inner geometry; the <svg> wrapper
// (viewBox, 1.5px stroke, round caps/joins, currentColor) is applied by <Icon>.
const ICON_PATHS = {
  pin: (
    <>
      <path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  close: <path d="M18 6 6 18M6 6l12 12" />,
  arrowRight: <path d="M5 12h14M13 5l7 7-7 7" />,
  camera: (
    <>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3" />
    </>
  ),
  wheat: (
    <>
      <path d="M2 22 16 8" />
      <path d="M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z" />
      <path d="M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z" />
      <path d="M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z" />
      <path d="M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z" />
      <path d="M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z" />
      <path d="M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z" />
    </>
  ),
  leaf: (
    <>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4-.93 2.43-.46 2.79.65.74 2.27.55 8.42-1.55 11.94-2.1 3.52-6.46 5.41-9.44 4.45Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6" />
    </>
  ),
  hive: (
    <>
      <path d="M5 22h14" />
      <path d="M5 18h14" />
      <path d="M5 14h14" />
      <path d="M7 22V8a5 5 0 0 1 10 0v14" />
      <circle cx="12" cy="6" r="2" />
      <path d="M10 2c0 1 .5 2 2 2s2-1 2-2" />
    </>
  ),
  goat: (
    <>
      <path d="M7 6 5 3M17 6l2-3" />
      <path d="M9 8c0-2 1-4 3-4s3 2 3 4" />
      <path d="M5 12c0-3 3-4 7-4s7 1 7 4v3a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4v-3Z" />
      <path d="M10 14h.01M14 14h.01" />
      <path d="M11 19v3M13 19v3M7 19l-1 3M17 19l1 3" />
      <path d="M9 11c.5-.5 1-.5 1.5 0" />
    </>
  ),
  pig: (
    <>
      <path d="M4 12c0-4 4-6 8-6s8 2 8 6v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3Z" />
      <circle cx="13" cy="11" r="1.5" />
      <path d="M11 11h.5" />
      <circle cx="9" cy="11" r=".5" />
      <circle cx="11" cy="13.5" r=".4" />
      <circle cx="13.5" cy="13.5" r=".4" />
      <path d="M7 7c-.5-1-.5-2 0-3M17 7c.5-1 .5-2 0-3" />
      <path d="M7 19v2M11 19v2M13 19v2M17 19v2" />
    </>
  ),
  egg: <path d="M12 22c-4 0-7-3.5-7-8 0-5.5 3-12 7-12s7 6.5 7 12c0 4.5-3 8-7 8Z" />,
  duck: (
    <>
      <path d="M16 6c0-2-2-3-4-3-3 0-5 2-5 5v2c0 1-1 2-2 2s-2-1-2-2" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="16.5" cy="5.5" r=".4" fill="currentColor" />
      <path d="M18 6h3l-2 2" />
      <path d="M7 10c-2 0-4 2-4 5s3 6 8 6 9-3 9-7c0-2-1-4-3-5" />
    </>
  ),
  honey: (
    <>
      <path d="M8 3h8v3H8z" />
      <path d="M7 6h10l-1 14a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2L7 6Z" />
      <path d="M10 11c1 0 1 2 2 2s1-2 2-2" />
      <path d="M10 15c1 0 1 2 2 2s1-2 2-2" />
    </>
  ),
  pineapple: (
    <>
      <path d="M10 4c0-1-1-2-2-2M12 3c0-1.5 1-2 1-2M14 4c0-1 1-2 2-2M12 5V2" />
      <ellipse cx="12" cy="14" rx="6" ry="8" />
      <path d="M8 9l2 2M12 8l-2 2M14 8l2 2M10 12l2 2M14 11l-2 2M8 14l2 2M14 14l2 2M11 16l1 2" />
    </>
  ),
  sandalwood: (
    <>
      <path d="M12 2 7 9h3l-3 5h3l-2 4h8l-2-4h3l-3-5h3L12 2Z" />
      <path d="M11 18v3h2v-3" />
    </>
  ),
  agarwood: (
    <>
      <path d="M12 2c-3 4-4 7-4 10 0 2 1 3 2 3v2c0 2 1 4 2 4s2-2 2-4v-2c1 0 2-1 2-3 0-3-1-6-4-10Z" />
      <path d="M10 14c.5.5 3 .5 4 0" />
      <path d="M9 10c.5.5 5 .5 6 0" />
    </>
  ),
  livestock: (
    <>
      <path d="M4 12c0-3 3-5 8-5s8 2 8 5v3a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-3Z" />
      <circle cx="9" cy="11" r=".5" fill="currentColor" />
      <circle cx="15" cy="11" r=".5" fill="currentColor" />
      <path d="M7 18l-1 3M17 18l1 3M11 18v3M13 18v3" />
      <path d="M6 8 4 4M18 8l2-4" />
    </>
  ),
  // ── Added for the full marketing rebuild (NetworkSignup + 6 pages) ──────────
  check: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  checkPlain: <polyline points="20 6 9 17 4 12" />,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 6-10 7L2 6" />
    </>
  ),
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
  users: (
    <>
      <circle cx="9" cy="7" r="3" />
      <circle cx="17" cy="7" r="2.5" />
      <path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
      <path d="M15 14a3.5 3.5 0 0 1 3 3.5V20" />
    </>
  ),
  gift: (
    <>
      <path d="M20 12v10H4V12" />
      <rect x="2" y="7" width="20" height="5" />
      <path d="M12 22V7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </>
  ),
  student: (
    <>
      <path d="M2 7L12 3l10 4-10 4-10-4Z" />
      <path d="M6 9v6c0 1.5 3 3 6 3s6-1.5 6-3V9" />
      <path d="M22 7v6" />
    </>
  ),
  buyer: (
    <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </>
  ),
  partner: (
    <>
      <path d="m11 17 2 2a1 1 0 1 0 3-3" />
      <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
    </>
  ),
  supporter: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />,
  farmmgmt: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </>
  ),
  tis: (
    <>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  fish: (
    <>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
      <circle cx="17" cy="12" r="1" fill="currentColor" />
      <path d="M2 12c1-1 3-2 6-2" />
    </>
  ),
  tree: <path d="M12 2 6 10h3v4H7l5 7 5-7h-2v-4h3L12 2Z" />,
  flower: (
    <>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2c-1.5 0-2 3-2 5s.5 3 2 3 2-1 2-3-.5-5-2-5Z" />
      <path d="M12 22c-1.5 0-2-3-2-5s.5-3 2-3 2 1 2 3-.5 5-2 5Z" />
      <path d="M2 12c0-1.5 3-2 5-2s3 .5 3 2-1 2-3 2-5-.5-5-2Z" />
      <path d="M22 12c0-1.5-3-2-5-2s-3 .5-3 2 1 2 3 2 5-.5 5-2Z" />
    </>
  ),
  integrated: (
    <>
      <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
      <path d="M10 6.5h4M10 17.5h4M6.5 10v4M17.5 10v4" />
    </>
  ),
  event: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  hash: <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />,
  chain: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72" />
    </>
  ),
  doc: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h6" />
    </>
  ),
  bank: (
    <>
      <path d="M3 10 12 3l9 7" />
      <path d="M5 10v9h14v-9" />
      <path d="M9 13v4M12 13v4M15 13v4" />
      <path d="M3 21h18" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),
};

// Aliases requested by the rebuild spec — point at existing geometry.
ICON_PATHS.community = ICON_PATHS.users;
ICON_PATHS.classroom = ICON_PATHS.student;

function Icon({ name, style, className }) {
  const inner = ICON_PATHS[name];
  if (!inner) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {inner}
    </svg>
  );
}

// Scoped styles — every selector is under .ofp so it cannot bleed into the
// inline-styled marketing shell. Tokens declared once as CSS custom properties.
const OFP_CSS = `
.ofp{
  --cream:#F8F3E9;--green:#6AA84F;--green-deep:#3F6B2C;
  --soil:#5C4033;--soil-ink:#3A2820;--cream-deep:#EFE6D4;--sand:#C2A878;
  --serif:'DM Serif Display','IBM Plex Serif',Georgia,serif;
  --mono:'IBM Plex Mono','SF Mono',Menlo,monospace;
  flex:1;width:100%;
  font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;
}
.ofp *{box-sizing:border-box}
.ofp-eyebrow{display:inline-flex;align-items:center;font-family:var(--mono);font-size:12px;letter-spacing:0.16em;text-transform:uppercase;font-weight:600;color:var(--green-deep);margin:0 0 20px}
.ofp-eyebrow::before{content:"";display:inline-block;width:32px;height:2px;background:var(--green);margin-right:12px}

.ofp-hero{max-width:1100px;margin:0 auto;padding:64px 24px 40px}
.ofp-hero h1{font-family:var(--serif);font-weight:400;font-size:clamp(2.5rem,6vw,4rem);line-height:1.08;color:var(--soil-ink);margin:0 0 20px}
.ofp-hero .ofp-sub{max-width:640px;font-size:1.05rem;line-height:1.6;color:var(--soil);margin:0}

.ofp-cards{max-width:1100px;margin:0 auto;padding:24px;display:grid;grid-template-columns:1fr 1fr;gap:28px}
@media (max-width:768px){.ofp-cards{grid-template-columns:1fr}}
.ofp-card{display:block;width:100%;text-align:left;padding:0;background:#fff;border:1px solid rgba(92,64,51,0.12);border-radius:16px;overflow:hidden;cursor:pointer;font-family:inherit;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}
.ofp-card:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(92,64,51,0.12);border-color:var(--green)}
.ofp-card-cover{position:relative;aspect-ratio:16/9;background:linear-gradient(135deg,var(--soil) 0%,var(--green-deep) 50%,var(--cream-deep) 100%);display:flex;align-items:flex-end;padding:20px}
.ofp-card-cover::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(58,40,32,0.45),rgba(58,40,32,0) 60%);pointer-events:none}
.ofp-card-name{position:relative;z-index:1;font-family:var(--serif);font-weight:400;font-size:2.25rem;line-height:1;color:#fff;margin:0;text-shadow:0 2px 12px rgba(0,0,0,0.35)}
.ofp-pill-soon{position:absolute;top:14px;right:14px;z-index:2;font-family:var(--mono);font-size:10px;letter-spacing:0.07em;text-transform:uppercase;background:rgba(248,243,233,0.95);color:var(--soil);padding:5px 10px;border-radius:999px}
.ofp-card-body{padding:24px}
.ofp-card-loc{display:flex;align-items:center;gap:6px;font-family:var(--mono);font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:var(--green-deep);margin:0 0 12px}
.ofp-card-loc svg{width:14px;height:14px;flex:none}
.ofp-card-blurb{font-size:0.95rem;line-height:1.6;color:var(--soil);margin:0 0 16px}
.ofp-tags{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px}
.ofp-tag{display:inline-flex;align-items:center;gap:5px;font-family:var(--mono);font-size:11px;background:rgba(106,168,79,0.1);color:var(--green-deep);padding:4px 10px;border-radius:999px}
.ofp-tag svg{width:13px;height:13px;flex:none}
.ofp-tour{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11px;letter-spacing:0.05em;text-transform:uppercase;font-weight:600;color:var(--green-deep);border:2px solid var(--green);padding:10px 20px;border-radius:999px}
.ofp-tour svg{width:14px;height:14px;transition:transform .2s ease}
.ofp-card:hover .ofp-tour svg{transform:translateX(4px)}

.ofp-prose{max-width:720px;margin:0 auto;padding:56px 24px;border-top:1px solid rgba(92,64,51,0.08)}
.ofp-prose h2{font-family:var(--serif);font-weight:400;font-size:2rem;line-height:1.15;color:var(--soil-ink);margin:0 0 18px}
.ofp-prose p{max-width:640px;font-size:1.02rem;line-height:1.7;color:var(--soil);margin:0}

.ofp-closing{max-width:720px;margin:0 auto;padding:64px 24px 80px;text-align:center;border-top:1px solid rgba(92,64,51,0.08)}
.ofp-closing h2{font-family:var(--serif);font-weight:400;font-size:1.75rem;line-height:1.2;color:var(--soil-ink);margin:0 0 24px}
.ofp-cta-row{display:inline-flex;flex-wrap:wrap;gap:14px;justify-content:center}
.ofp-pill-primary{display:inline-flex;align-items:center;gap:8px;background:var(--green);color:#fff;border:2px solid var(--green);padding:14px 26px;border-radius:999px;font-family:var(--mono);font-size:12px;letter-spacing:0.04em;font-weight:600;text-decoration:none;cursor:pointer;transition:background .2s ease,border-color .2s ease}
.ofp-pill-primary:hover{background:var(--green-deep);border-color:var(--green-deep)}
.ofp-pill-primary svg{width:15px;height:15px}
.ofp-pill-secondary{display:inline-flex;align-items:center;gap:8px;background:transparent;color:var(--green-deep);border:2px solid var(--green);padding:14px 26px;border-radius:999px;font-family:var(--mono);font-size:12px;letter-spacing:0.04em;font-weight:600;text-decoration:none;cursor:pointer;transition:background .2s ease}
.ofp-pill-secondary:hover{background:rgba(106,168,79,0.1)}
.ofp-pill-secondary svg{width:15px;height:15px}

.ofp-overlay{position:fixed;inset:0;background:rgba(58,40,32,0.75);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:100;padding:40px 20px;overflow-y:auto;display:flex;align-items:flex-start;justify-content:center}
.ofp-modal{position:relative;background:var(--cream);border-radius:18px;max-width:720px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,0.4)}
.ofp-modal-close{position:absolute;top:14px;right:14px;z-index:3;width:36px;height:36px;border-radius:999px;background:rgba(248,243,233,0.95);border:1px solid rgba(92,64,51,0.3);color:var(--soil-ink);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .2s ease}
.ofp-modal-close:hover{background:#fff}
.ofp-modal-close svg{width:18px;height:18px}
.ofp-modal-cover{position:relative;aspect-ratio:21/9;background:linear-gradient(135deg,var(--soil) 0%,var(--green-deep) 50%,var(--cream-deep) 100%);display:flex;align-items:flex-end;padding:24px;border-radius:18px 18px 0 0}
.ofp-modal-cover::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(58,40,32,0.45),rgba(58,40,32,0) 60%);border-radius:18px 18px 0 0;pointer-events:none}
.ofp-modal-name{position:relative;z-index:1;font-family:var(--serif);font-weight:400;font-size:2.5rem;line-height:1;color:#fff;margin:0;text-shadow:0 2px 12px rgba(0,0,0,0.35)}
.ofp-modal-body{padding:32px}
.ofp-facts{border-top:1px solid rgba(92,64,51,0.08);margin:0 0 8px}
.ofp-fact{display:grid;grid-template-columns:160px 1fr;gap:16px;padding:14px 0;border-bottom:1px solid rgba(92,64,51,0.08)}
.ofp-fact-k{font-family:var(--mono);font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:var(--green-deep)}
.ofp-fact-v{font-size:0.92rem;line-height:1.5;color:var(--soil-ink)}
@media (max-width:480px){.ofp-fact{grid-template-columns:1fr;gap:4px}}
.ofp-modal-title{display:flex;align-items:center;font-family:var(--mono);font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;color:var(--green-deep);margin:28px 0 16px}
.ofp-modal-title::before{content:"";display:inline-block;width:24px;height:2px;background:var(--green);margin-right:12px}
.ofp-verticals{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
@media (max-width:480px){.ofp-verticals{grid-template-columns:repeat(2,1fr)}}
.ofp-vtile{display:flex;flex-direction:column;align-items:center;gap:10px;background:#fff;border:1px solid rgba(92,64,51,0.1);border-radius:10px;padding:18px 12px;text-align:center;transition:transform .2s ease,border-color .2s ease}
.ofp-vtile:hover{border-color:var(--green);transform:translateY(-2px)}
.ofp-vtile svg{color:var(--green-deep)}
.ofp-vname{font-size:0.85rem;color:var(--soil-ink)}
.ofp-photo-ph{border:1px dashed rgba(92,64,51,0.2);border-radius:12px;padding:32px 20px;text-align:center;background:rgba(248,243,233,0.5)}
.ofp-photo-ph .ofp-cam{color:var(--sand)}
.ofp-photo-label{font-family:var(--mono);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:600;color:var(--soil);margin:12px 0 8px}
.ofp-photo-note{font-style:italic;font-size:0.9rem;line-height:1.5;color:var(--soil);max-width:420px;margin:0 auto}
.ofp-modal-cta{margin-top:24px;padding-top:16px;border-top:1px solid rgba(92,64,51,0.08);text-align:center}
`;

function FarmCard({ farmId, onOpen }) {
  const farm = FARMS[farmId];
  return (
    <button type="button" className="ofp-card" onClick={() => onOpen(farmId)}>
      <div className="ofp-card-cover">
        <span className="ofp-pill-soon">Photos coming soon</span>
        <h3 className="ofp-card-name">{farm.name}</h3>
      </div>
      <div className="ofp-card-body">
        <div className="ofp-card-loc"><Icon name="pin" />{farm.location}</div>
        <p className="ofp-card-blurb">{farm.blurb}</p>
        <div className="ofp-tags">
          {farm.tags.map((t, i) => (
            <span className="ofp-tag" key={i}>
              {t.icon ? <Icon name={t.icon} /> : null}
              {t.label}
            </span>
          ))}
        </div>
        <span className="ofp-tour">Tour the farm <Icon name="arrowRight" /></span>
      </div>
    </button>
  );
}

function FarmModal({ farm, onClose }) {
  const waHref = `https://wa.me/6798730866?text=${encodeURIComponent(farm.whatsappPrefill)}`;
  return (
    <div className="ofp-overlay" onClick={onClose}>
      <div className="ofp-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={farm.name}>
        <button type="button" className="ofp-modal-close" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
        <div className="ofp-modal-cover">
          <h2 className="ofp-modal-name">{farm.name}</h2>
        </div>
        <div className="ofp-modal-body">
          <div className="ofp-facts">
            {farm.facts.map(([k, v], i) => (
              <div className="ofp-fact" key={i}>
                <span className="ofp-fact-k">{k}</span>
                <span className="ofp-fact-v">{v}</span>
              </div>
            ))}
          </div>

          <h3 className="ofp-modal-title">What's growing here</h3>
          <div className="ofp-verticals">
            {farm.verticals.map((v, i) => (
              <div className="ofp-vtile" key={i}>
                <Icon name={v.icon} style={{ width: 28, height: 28 }} />
                <span className="ofp-vname">{v.name}</span>
              </div>
            ))}
          </div>

          <h3 className="ofp-modal-title">Photo gallery</h3>
          <div className="ofp-photo-ph">
            <Icon name="camera" className="ofp-cam" style={{ width: 24, height: 24 }} />
            <div className="ofp-photo-label">Photos coming soon</div>
            <p className="ofp-photo-note">Cody is shooting on the next ferry rotation — full gallery lands here.</p>
          </div>

          <div className="ofp-modal-cta">
            <a className="ofp-pill-primary" href={waHref} target="_blank" rel="noopener noreferrer">
              Talk to Cody on WhatsApp <Icon name="arrowRight" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function OurFarmsPage({ navigate }) {
  const [activeFarm, setActiveFarm] = useState(null);

  useEffect(() => {
    if (!activeFarm) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setActiveFarm(null); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [activeFarm]);

  const farm = activeFarm ? FARMS[activeFarm] : null;

  return (
    <main className="ofp">
      <style>{OFP_CSS}</style>

      <section className="ofp-hero">
        <p className="ofp-eyebrow">Where TAE is built</p>
        <h1>Two farms. Two islands. One thesis.</h1>
        <p className="ofp-sub">
          Save-A-Lot on Viti Levu's mainland. Viyasiyasi on Kadavu Island. Both operating today — both feeding TAE the data that makes Pacific smallholders bankable.
        </p>
      </section>

      <section className="ofp-cards">
        <FarmCard farmId="save-a-lot" onOpen={setActiveFarm} />
        <FarmCard farmId="viyasiyasi" onOpen={setActiveFarm} />
      </section>

      <section className="ofp-prose">
        <h2>Why two farms, not one</h2>
        <p>
          Save-A-Lot is the data-dense, road-accessible, multi-buyer farm. Viyasiyasi is the constrained, remote, offline-first farm. Building the platform across both means TAE hardens against the full range of conditions a Pacific smallholder might operate under — not just the easy ones.
        </p>
      </section>

      <section className="ofp-prose">
        <h2>Real, not theatre.</h2>
        <p>
          These are operating farms, not demo installations. They earn real revenue, employ real people, and ship to real buyers. The data that flows into TAE is the data the farms are generating in their normal course of business. That is the only way to build a tool that other farms will trust.
        </p>
      </section>

      <section className="ofp-closing">
        <p className="ofp-eyebrow">Want to see more?</p>
        <h2>Talk to us, or read where this started.</h2>
        <div className="ofp-cta-row">
          <a
            className="ofp-pill-primary"
            href="https://wa.me/6798730866?text=Bula%20Cody%2C%20I%20just%20read%20about%20your%20farms%20and%20wanted%20to%20reach%20out."
            target="_blank"
            rel="noopener noreferrer"
          >
            Talk to Cody on WhatsApp <Icon name="arrowRight" />
          </a>
          <button
            type="button"
            className="ofp-pill-secondary"
            onClick={() => navigate("/about")}
          >
            Read the founding story <Icon name="arrowRight" />
          </button>
        </div>
      </section>

      {farm ? <FarmModal farm={farm} onClose={() => setActiveFarm(null)} /> : null}
    </main>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FULL MARKETING REBUILD — 6 pages + Community Network module
// Scoped under .tvm (pages) and .nsg (network signup) so nothing bleeds into the
// inline-styled shell. Tokens declared once per namespace. All icons inline flat
// SVG via <Icon>; no emoji; no new deps.
// ══════════════════════════════════════════════════════════════════════════════

const TVM_CSS = `
.tvm{
  --cream:#F8F3E9;--green:#6AA84F;--green-deep:#3F6B2C;--soil:#5C4033;
  --soil-ink:#3A2820;--cream-deep:#EFE6D4;--green-mist:#C9DFB0;--amber:#BF9000;
  --serif:'DM Serif Display','IBM Plex Serif',Georgia,serif;
  --mono:'IBM Plex Mono','SF Mono',Menlo,monospace;
  flex:1;width:100%;background:var(--cream);
  font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;
}
.tvm *{box-sizing:border-box}
.tvm-eyebrow{display:inline-flex;align-items:center;font-family:var(--mono);font-size:12px;letter-spacing:0.16em;text-transform:uppercase;font-weight:600;color:var(--green-deep);margin:0 0 20px}
.tvm-eyebrow::before{content:"";display:inline-block;width:32px;height:2px;background:var(--green);margin-right:12px}
.tvm-eyebrow.light{color:var(--green-mist)}
.tvm-eyebrow.light::before{background:var(--green-mist)}
.tvm h1.tvm-h1{font-family:var(--serif);font-weight:400;font-size:clamp(2.3rem,5.5vw,3.6rem);line-height:1.08;color:var(--soil-ink);margin:0 0 20px}
.tvm h2.tvm-h2{font-family:var(--serif);font-weight:400;font-size:clamp(1.9rem,4vw,2.6rem);line-height:1.14;color:var(--soil-ink);margin:0 0 16px}
.tvm h3.tvm-h3{font-family:var(--serif);font-weight:400;font-size:1.5rem;line-height:1.2;color:var(--soil-ink);margin:0 0 12px}
.tvm-sub{font-size:1.08rem;line-height:1.65;color:var(--soil);margin:0}
.tvm-lead{font-size:1.12rem;line-height:1.7;color:var(--soil-ink);margin:0 0 20px}
.tvm-p{font-size:1.02rem;line-height:1.7;color:var(--soil);margin:0 0 18px}

.tvm-wrap{max-width:1100px;margin:0 auto;padding:0 24px}
.tvm-narrow{max-width:720px;margin:0 auto;padding:0 24px}
.tvm-section{padding:56px 0;border-top:1px solid rgba(92,64,51,0.08)}
.tvm-section.first{border-top:0;padding-top:64px}
.tvm-center{text-align:center}
.tvm-center .tvm-eyebrow{justify-content:center}
.tvm-center .tvm-sub{margin-left:auto;margin-right:auto;max-width:640px}

.tvm-hero2{display:grid;grid-template-columns:1.1fr 0.9fr;gap:48px;align-items:center;max-width:1100px;margin:0 auto;padding:64px 24px 40px}
@media (max-width:900px){.tvm-hero2{grid-template-columns:1fr;gap:36px}}

.tvm-cta-row{display:flex;flex-wrap:wrap;gap:14px;margin-top:30px}
.tvm-center .tvm-cta-row{justify-content:center}
.tvm-pill-primary{display:inline-flex;align-items:center;gap:8px;background:var(--green);color:#fff;border:2px solid var(--green);padding:14px 26px;border-radius:999px;font-family:var(--mono);font-size:12px;letter-spacing:0.04em;font-weight:600;text-decoration:none;cursor:pointer;transition:background .2s ease,transform .2s ease,box-shadow .2s ease}
.tvm-pill-primary:hover{background:var(--green-deep);border-color:var(--green-deep);transform:translateY(-2px);box-shadow:0 10px 24px rgba(63,107,44,0.25)}
.tvm-pill-primary svg{width:15px;height:15px}
.tvm-pill-secondary{display:inline-flex;align-items:center;gap:8px;background:transparent;color:var(--green-deep);border:2px solid var(--green);padding:14px 26px;border-radius:999px;font-family:var(--mono);font-size:12px;letter-spacing:0.04em;font-weight:600;text-decoration:none;cursor:pointer;transition:background .2s ease}
.tvm-pill-secondary:hover{background:rgba(106,168,79,0.1)}
.tvm-pill-secondary svg{width:15px;height:15px}
.tvm-pill-ondark{display:inline-flex;align-items:center;gap:8px;background:transparent;color:var(--cream);border:2px solid rgba(248,243,233,0.4);padding:13px 24px;border-radius:999px;font-family:var(--mono);font-size:12px;letter-spacing:0.04em;font-weight:600;text-decoration:none;cursor:pointer;transition:background .2s ease,border-color .2s ease}
.tvm-pill-ondark:hover{background:rgba(248,243,233,0.1);border-color:var(--cream)}

.tvm-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.tvm-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.tvm-grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}
@media (max-width:900px){.tvm-grid-3{grid-template-columns:1fr}.tvm-grid-4{grid-template-columns:repeat(2,1fr)}}
@media (max-width:640px){.tvm-grid-2{grid-template-columns:1fr}.tvm-grid-4{grid-template-columns:repeat(2,1fr)}}

.tvm-card{background:#fff;border:1px solid rgba(92,64,51,0.12);border-radius:16px;padding:28px;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}
.tvm-card.tappable{cursor:pointer;text-align:left;width:100%;font-family:inherit}
.tvm-card.tappable:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(92,64,51,0.12);border-color:var(--green)}
.tvm-isq{display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:12px;background:rgba(106,168,79,0.12);color:var(--green-deep);margin-bottom:16px}
.tvm-isq svg{width:24px;height:24px}
.tvm-tag{display:inline-block;font-family:var(--mono);font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--green-deep);background:rgba(106,168,79,0.1);padding:3px 10px;border-radius:999px;margin-bottom:12px}
.tvm-card h3{font-family:var(--serif);font-weight:400;font-size:1.4rem;line-height:1.15;color:var(--soil-ink);margin:0 0 6px}
.tvm-card p{font-size:0.96rem;line-height:1.6;color:var(--soil);margin:0}
.tvm-seeinside{display:inline-flex;align-items:center;gap:7px;margin-top:16px;font-family:var(--mono);font-size:11px;letter-spacing:0.05em;text-transform:uppercase;font-weight:600;color:var(--green-deep)}
.tvm-seeinside svg{width:13px;height:13px;transition:transform .2s ease}
.tvm-card.tappable:hover .tvm-seeinside svg{transform:translateX(4px)}

/* vertical tiles */
.tvm-vtile{display:flex;flex-direction:column;gap:10px;background:#fff;border:1px solid rgba(92,64,51,0.1);border-radius:12px;padding:20px 18px;transition:transform .2s ease,border-color .2s ease}
.tvm-vtile:hover{border-color:var(--green);transform:translateY(-2px)}
.tvm-vtile .tvm-isq{width:40px;height:40px;margin-bottom:4px}
.tvm-vtile h4{font-family:var(--serif);font-weight:400;font-size:1.15rem;color:var(--soil-ink);margin:0}
.tvm-vtile p{font-size:0.85rem;line-height:1.5;color:var(--soil);margin:0}

/* mode cards */
.tvm-mode{display:flex;flex-direction:column;align-items:center;gap:16px;background:#fff;border:1px solid rgba(92,64,51,0.12);border-radius:16px;padding:28px 22px;text-align:center}
.tvm-mode h4{font-family:var(--serif);font-weight:400;font-size:1.35rem;color:var(--soil-ink);margin:0}
.tvm-mode .tvm-modetag{font-family:var(--mono);font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--green-deep);margin:-8px 0 0}
.tvm-mode p{font-size:0.92rem;line-height:1.55;color:var(--soil);margin:0}

/* CSS mockups */
.tvm-phone{width:180px;height:320px;border:8px solid var(--soil-ink);border-radius:30px;background:var(--cream-deep);position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px;flex:none;box-shadow:0 16px 40px rgba(58,40,32,0.22)}
.tvm-phone.sm{width:150px;height:270px;border-width:7px;border-radius:26px;padding:12px}
.tvm-phone::before{content:"";position:absolute;top:8px;left:50%;transform:translateX(-50%);width:54px;height:7px;border-radius:999px;background:var(--soil-ink);opacity:0.85}
.tvm-taskcard{background:#fff;border:1px solid rgba(92,64,51,0.12);border-radius:14px;padding:16px 14px;width:100%;text-align:center;box-shadow:0 4px 14px rgba(92,64,51,0.1)}
.tvm-taskcard .tvm-tasktitle{font-family:var(--serif);font-size:1.05rem;line-height:1.25;color:var(--soil-ink);margin:0 0 14px}
.tvm-phone.sm .tvm-taskcard .tvm-tasktitle{font-size:0.92rem}
.tvm-taskbtns{display:flex;flex-direction:column;gap:7px}
.tvm-tb{font-family:var(--mono);font-size:11px;letter-spacing:0.08em;font-weight:600;padding:9px;border-radius:8px;border:1px solid transparent}
.tvm-tb.done{background:var(--green);color:#fff}
.tvm-tb.skip{background:#fff;color:var(--soil);border-color:rgba(92,64,51,0.25)}
.tvm-tb.help{background:#fff;color:var(--green-deep);border-color:var(--green)}
.tvm-phone-cap{font-family:var(--mono);font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:var(--soil);margin:16px 0 0;text-align:center}
/* growth phone interior */
.tvm-gscreen{width:100%;height:100%;display:flex;flex-direction:column;background:#fff;border-radius:14px;overflow:hidden;border:1px solid rgba(92,64,51,0.12)}
.tvm-ghead{background:var(--green-deep);height:34px;display:flex;align-items:center;padding:0 12px;flex:none}
.tvm-ghead span{height:6px;width:60px;border-radius:999px;background:rgba(248,243,233,0.7)}
.tvm-gbody{flex:1;padding:10px;display:flex;flex-direction:column;gap:8px}
.tvm-grow{height:30px;border-radius:8px;background:var(--cream-deep)}
.tvm-grow.big{height:48px}
.tvm-gnav{height:34px;display:flex;align-items:center;justify-content:space-around;border-top:1px solid rgba(92,64,51,0.12);flex:none;padding:0 6px}
.tvm-gnav i{width:14px;height:14px;border-radius:4px;background:rgba(92,64,51,0.25);display:block}
.tvm-gnav i.on{background:var(--green)}
/* commercial desktop */
.tvm-desk{width:230px;height:160px;border:2px solid var(--soil-ink);border-radius:10px;background:#fff;overflow:hidden;display:flex;flex:none;box-shadow:0 14px 34px rgba(58,40,32,0.18)}
.tvm-desk-side{width:46px;background:var(--soil-ink);display:flex;flex-direction:column;gap:8px;padding:12px 8px;flex:none}
.tvm-desk-side i{height:8px;border-radius:3px;background:rgba(248,243,233,0.35);display:block}
.tvm-desk-side i.on{background:var(--green-mist)}
.tvm-desk-main{flex:1;padding:12px;display:flex;flex-direction:column;gap:8px}
.tvm-desk-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.tvm-desk-tiles div{height:26px;border-radius:6px;background:var(--cream-deep)}
.tvm-spark{flex:1;background:rgba(106,168,79,0.12);border-radius:6px;position:relative;overflow:hidden;min-height:42px}
.tvm-spark::after{content:"";position:absolute;left:0;bottom:0;width:100%;height:100%;background:var(--green);opacity:0.55;clip-path:polygon(0 80%,15% 60%,30% 70%,45% 40%,60% 55%,75% 25%,90% 38%,100% 15%,100% 100%,0 100%)}

/* pillar / four-up */
.tvm-pillar-name{display:flex;align-items:center;gap:10px}

/* dark moat section */
.tvm-dark{background:var(--soil-ink);color:var(--cream)}
.tvm-dark .tvm-h2{color:var(--cream)}
.tvm-dark .tvm-sub{color:rgba(248,243,233,0.78)}
.tvm-darkcard{background:rgba(248,243,233,0.05);border:1px solid rgba(248,243,233,0.12);border-radius:16px;padding:32px}
/* audit chain diagram */
.tvm-chain{display:flex;align-items:stretch;gap:10px;flex-wrap:wrap;justify-content:center}
.tvm-cnode{flex:1;min-width:130px;background:rgba(248,243,233,0.04);border:1px solid rgba(248,243,233,0.14);border-radius:12px;padding:18px 14px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px}
.tvm-cnode.terminal{background:rgba(106,168,79,0.18);border-color:var(--green)}
.tvm-cnode .tvm-isq{background:rgba(201,223,176,0.15);color:var(--green-mist);margin-bottom:0}
.tvm-cnode.terminal .tvm-isq{background:rgba(106,168,79,0.3);color:#fff}
.tvm-cnode .tvm-cname{font-family:var(--mono);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:600;color:var(--cream)}
.tvm-cnode .tvm-cdesc{font-size:0.78rem;line-height:1.45;color:rgba(248,243,233,0.6)}
.tvm-carrow{display:flex;align-items:center;color:var(--green-mist)}
.tvm-carrow svg{width:18px;height:18px}
@media (max-width:760px){.tvm-carrow{transform:rotate(90deg)}.tvm-chain{flex-direction:column;align-items:stretch}}
.tvm-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-top:36px}
@media (max-width:760px){.tvm-stats{grid-template-columns:repeat(2,1fr)}}
.tvm-stat .tvm-statk{font-family:var(--mono);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:600;color:var(--green-mist);margin:0 0 8px}
.tvm-stat p{font-size:0.9rem;line-height:1.55;color:rgba(248,243,233,0.72);margin:0}

/* team cards */
.tvm-team{background:#fff;border:1px solid rgba(92,64,51,0.12);border-radius:16px;padding:28px}
.tvm-team .tvm-tname{font-family:var(--serif);font-size:1.4rem;color:var(--soil-ink);margin:0 0 2px}
.tvm-team .tvm-trole{font-family:var(--mono);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--green-deep);margin:0 0 14px}
.tvm-team p{font-size:0.96rem;line-height:1.65;color:var(--soil);margin:0}
.tvm-sig{font-family:var(--serif);font-style:italic;font-size:1.05rem;color:var(--soil-ink);margin:20px 0 0}

/* partner / tier cards */
.tvm-partner{background:#fff;border:1px solid rgba(92,64,51,0.12);border-radius:16px;padding:30px;display:flex;flex-direction:column}
.tvm-partner .tvm-eyebrow{margin-bottom:14px}
.tvm-partner h3{font-family:var(--serif);font-weight:400;font-size:1.55rem;color:var(--soil-ink);margin:0 0 12px}
.tvm-partner p{font-size:0.98rem;line-height:1.65;color:var(--soil);margin:0 0 22px;flex:1}
.tvm-tier{background:#fff;border:1px solid rgba(92,64,51,0.12);border-left:3px solid var(--green);border-radius:12px;padding:26px 22px;display:flex;flex-direction:column}
.tvm-tier h3{font-family:var(--serif);font-weight:400;font-size:1.5rem;color:var(--soil-ink);margin:0 0 12px}
.tvm-tier .tvm-tdesc{font-size:0.94rem;line-height:1.6;color:var(--soil);margin:0 0 16px}
.tvm-tier .tvm-twho{font-family:var(--mono);font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:var(--green-deep);margin:0 0 22px;flex:1}
.tvm-fullpill{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px 18px;border-radius:999px;font-family:var(--mono);font-size:11px;letter-spacing:0.04em;font-weight:600;text-decoration:none;cursor:pointer;transition:background .2s ease,transform .2s ease}
.tvm-fullpill.filled{background:var(--green);color:#fff;border:2px solid var(--green)}
.tvm-fullpill.filled:hover{background:var(--green-deep);border-color:var(--green-deep)}
.tvm-fullpill.outline{background:transparent;color:var(--green-deep);border:2px solid var(--green)}
.tvm-fullpill.outline:hover{background:rgba(106,168,79,0.1)}
.tvm-fullpill svg{width:14px;height:14px}
.tvm-footnote{font-family:var(--serif);font-style:italic;font-size:1.05rem;line-height:1.6;color:var(--soil);text-align:center;max-width:620px;margin:36px auto 0}
.tvm-footnote a{color:var(--green-deep);text-decoration:underline}

/* contact */
.tvm-contact-list{margin:8px 0 0}
.tvm-cline{display:flex;flex-direction:column;gap:4px;padding:18px 0;border-bottom:1px dashed rgba(92,64,51,0.22)}
.tvm-cline:first-child{border-top:1px dashed rgba(92,64,51,0.22)}
.tvm-cline .tvm-ck{font-family:var(--mono);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:var(--green-deep)}
.tvm-cline .tvm-cv{font-size:1.05rem;color:var(--soil-ink)}
.tvm-cline .tvm-cv a{color:var(--green-deep);text-decoration:none}
.tvm-cline .tvm-cv a:hover{text-decoration:underline}
.tvm-contactcard{background:var(--soil-ink);color:var(--cream);border-radius:18px;padding:36px}
.tvm-contactcard h2{font-family:var(--serif);font-weight:400;font-size:1.7rem;color:var(--cream);margin:0 0 14px}
.tvm-contactcard p{font-size:1rem;line-height:1.65;color:rgba(248,243,233,0.78);margin:0 0 24px}
.tvm-contactcard .tvm-cta-row{margin-top:0}

/* chat demo (TIS) */
.tvm-chat{background:#fff;border:1px solid rgba(92,64,51,0.14);border-radius:18px;padding:18px;box-shadow:0 16px 40px rgba(58,40,32,0.12)}
.tvm-chat-head{display:flex;align-items:center;gap:10px;padding-bottom:14px;border-bottom:1px solid rgba(92,64,51,0.1);margin-bottom:14px}
.tvm-chat-av{width:38px;height:38px;border-radius:999px;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-size:1.1rem;flex:none}
.tvm-chat-name{font-weight:600;color:var(--soil-ink);font-size:0.95rem}
.tvm-chat-status{font-family:var(--mono);font-size:10px;letter-spacing:0.04em;color:var(--green-deep)}
.tvm-bubbles{display:flex;flex-direction:column;gap:10px}
.tvm-bub{max-width:84%;padding:11px 14px;border-radius:14px;font-size:0.9rem;line-height:1.5}
.tvm-bub.them{align-self:flex-start;background:rgba(92,64,51,0.08);color:var(--soil-ink);border-bottom-left-radius:4px}
.tvm-bub.tis{align-self:flex-end;background:rgba(106,168,79,0.16);color:var(--soil-ink);border-bottom-right-radius:4px}
.tvm-bub.photos{align-self:flex-start;font-style:italic;color:var(--soil);background:transparent;padding:2px 4px}

/* dashed get-strip already covered in NSG; trust strip generic */
.tvm-trust{display:flex;flex-wrap:wrap;gap:18px;justify-content:center;margin:0 0 26px}
.tvm-trust span{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:var(--soil)}
.tvm-trust svg{width:14px;height:14px;color:var(--green-deep)}
`;

// ── Pillar modal content (TAE page) ──────────────────────────────────────────
const TFOS_PILLARS = [
  {
    key: "community",
    icon: "community",
    name: "Community",
    tag: "Pillar 1",
    blurb: "Farmer-to-farmer knowledge, neighbours within ferry-reach, ratings on buyers, marketplace for inputs and outputs.",
    what: "The social and market layer of TAE — the part that makes a farmer feel less alone. Connect with neighbours close enough to share a truckload or a ferry run, see how others rate the buyers you both sell to, and trade inputs and produce without a middleman skimming the margin.",
    features: [
      "Farmer-to-farmer knowledge sharing, grounded in what actually worked nearby.",
      "Neighbour discovery within practical ferry-and-road reach.",
      "Honest buyer ratings — so a bad payer can't keep surprising people.",
      "A marketplace for inputs and outputs, farmer to farmer.",
    ],
  },
  {
    key: "classroom",
    icon: "classroom",
    name: "Classroom",
    tag: "Pillar 2",
    blurb: "Verified curriculum drawn from our knowledge base. Lessons unlock as cycles progress. Pacific-specific.",
    what: "Learning that arrives when you need it, not as a 200-page manual you'll never open. Lessons are drawn from the same verified knowledge base that grounds TIS, and they unlock in step with your own cycles — so the planting lesson shows up when you're planting.",
    features: [
      "Verified curriculum, not internet hearsay.",
      "Lessons unlock as your cycles progress — timed to the work.",
      "Pacific-specific crops, conditions, and calendars.",
      "Short, plain-language, voice-friendly.",
    ],
  },
  {
    key: "farm",
    icon: "farmmgmt",
    name: "Farm Management",
    tag: "Pillar 3 — System of record",
    blurb: "Every cycle. Every event. Every cash row. Every worker check-in. Captured as a structured, time-stamped record.",
    what: "The system of record. This is where the farm becomes data — every cycle, every planting and harvest, every chemical application, every cash row, every worker check-in, captured once as a structured, time-stamped, audit-anchored record. No spreadsheets running in the background. No double entry.",
    features: [
      "Every cycle and every event captured once, structured.",
      "Cash in and cash out, tied to the work that earned or cost it.",
      "Worker check-ins and labour tracked against blocks.",
      "Chemical compliance windows enforced, not just noted.",
    ],
  },
  {
    key: "tis",
    icon: "tis",
    name: "TIS",
    tag: "Pillar 4 — AI advisor",
    blurb: "Voice and chat AI advisor, grounded in your farm's own data plus the Teivaka knowledge base. On WhatsApp today.",
    what: "The advisor that actually knows your farm. TIS answers by voice or chat, grounded in your own cycles, buyers, and weather plus the Teivaka knowledge base — never a generic chatbot guess. It runs on WhatsApp today, in the language you already speak.",
    features: [
      "Voice and chat — answer how you'd answer a neighbour.",
      "Grounded in your farm's own data, not invented.",
      "Fijian, Hindi, English.",
      "Live on WhatsApp now; in-app coming soon.",
    ],
  },
];

const TFOS_VERTICALS = [
  { icon: "wheat", name: "Crops", desc: "Planting through harvest, grading, sales. Chemical compliance enforced." },
  { icon: "leaf", name: "Horticulture", desc: "Protected agriculture, propagation, nursery management." },
  { icon: "livestock", name: "Livestock", desc: "Poultry, cattle, goats, pigs, sheep, apiculture." },
  { icon: "fish", name: "Aquaculture", desc: "Pond management, stocking, feed, harvest." },
  { icon: "tree", name: "Forestry", desc: "Long-rotation crops, timber, replanting. Sandalwood, agarwood." },
  { icon: "flower", name: "Floriculture", desc: "Ornamental and cut-flower production." },
  { icon: "integrated", name: "Integrated", desc: "Worker time, cash, equipment, observations." },
];

// ── Reusable phone mockup (hero + Solo mode) ──────────────────────────────────
function TaskPhone({ small }) {
  return (
    <div className={small ? "tvm-phone sm" : "tvm-phone"}>
      <div className="tvm-taskcard">
        <p className="tvm-tasktitle">Pick eggplant in Block 3 today</p>
        <div className="tvm-taskbtns">
          <span className="tvm-tb done">DONE</span>
          <span className="tvm-tb skip">SKIP</span>
          <span className="tvm-tb help">HELP</span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT 1 — <NetworkSignup /> : Community Network lead capture
// Embedded on every non-landing, non-home page.
// ══════════════════════════════════════════════════════════════════════════════
const NSG_CSS = `
.nsg{position:relative;overflow:hidden;padding:80px 24px;margin-top:8px;
  background:
    radial-gradient(circle at 12% 18%, rgba(106,168,79,0.16), transparent 42%),
    radial-gradient(circle at 88% 82%, rgba(191,144,0,0.14), transparent 44%),
    #F8F3E9;
  font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;
  --cream:#F8F3E9;--green:#6AA84F;--green-deep:#3F6B2C;--soil:#5C4033;
  --soil-ink:#3A2820;--cream-deep:#EFE6D4;--green-mist:#C9DFB0;--amber:#BF9000;
  --serif:'DM Serif Display','IBM Plex Serif',Georgia,serif;
  --mono:'IBM Plex Mono','SF Mono',Menlo,monospace;
}
.nsg *{box-sizing:border-box}
.nsg-decor{position:absolute;pointer-events:none;color:var(--green-deep);opacity:0.06;z-index:0}
.nsg-decor.tl{top:-30px;left:-30px;transform:rotate(-18deg)}
.nsg-decor.br{bottom:-40px;right:-30px;transform:rotate(150deg);color:var(--amber)}
.nsg-decor svg{width:240px;height:240px}
.nsg-inner{position:relative;z-index:1;max-width:940px;margin:0 auto}
.nsg-head{text-align:center;margin-bottom:34px}
.nsg-pill{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;color:var(--green-deep);background:rgba(106,168,79,0.14);padding:7px 16px;border-radius:999px;margin-bottom:22px}
.nsg-pill svg{width:15px;height:15px}
.nsg-head h2{font-family:var(--serif);font-weight:400;font-size:clamp(2rem,4vw,3rem);line-height:1.12;color:var(--soil-ink);margin:0 0 16px}
.nsg-head .nsg-sub{max-width:600px;margin:0 auto;font-size:1.04rem;line-height:1.65;color:var(--soil)}
.nsg-card{position:relative;background:#fff;border-radius:22px;padding:44px 40px;box-shadow:0 20px 50px rgba(58,40,32,0.12);overflow:hidden}
@media (max-width:640px){.nsg-card{padding:32px 24px}.nsg{padding:60px 16px}}
.nsg-card::before{content:"";position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--green),var(--amber),var(--soil))}
.nsg-trust{display:flex;flex-wrap:wrap;gap:22px;justify-content:center;margin-bottom:28px}
.nsg-trust span{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:var(--soil)}
.nsg-trust svg{width:14px;height:14px;color:var(--green-deep);flex:none}
.nsg-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
@media (max-width:560px){.nsg-row{grid-template-columns:1fr}}
.nsg-field label{display:block;font-family:var(--mono);font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:var(--green-deep);margin-bottom:7px}
.nsg-field input{width:100%;padding:13px 14px;border:1px solid rgba(92,64,51,0.22);border-radius:10px;font-size:0.98rem;color:var(--soil-ink);background:var(--cream);font-family:inherit;transition:border-color .2s ease,box-shadow .2s ease}
.nsg-field input:focus{outline:none;border-color:var(--green);box-shadow:0 0 0 3px rgba(106,168,79,0.18)}
.nsg-field input.err{border-color:#A32D2D;box-shadow:0 0 0 3px rgba(163,45,45,0.14)}
.nsg-telwrap{display:flex;align-items:center;border:1px solid rgba(92,64,51,0.22);border-radius:10px;background:var(--cream);overflow:hidden;transition:border-color .2s ease,box-shadow .2s ease}
.nsg-telwrap:focus-within{border-color:var(--green);box-shadow:0 0 0 3px rgba(106,168,79,0.18)}
.nsg-telwrap .nsg-tel-prefix{padding:13px 4px 13px 14px;color:var(--soil);font-size:0.98rem}
.nsg-telwrap input{border:0;background:transparent;box-shadow:none !important;padding-left:4px}
.nsg-err-inline{color:#A32D2D;font-size:0.8rem;margin:6px 0 0;font-family:var(--mono)}
.nsg-rolelabel{font-family:var(--mono);font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:var(--green-deep);margin:22px 0 10px}
.nsg-roles{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
@media (max-width:760px){.nsg-roles{grid-template-columns:repeat(3,1fr)}}
@media (max-width:480px){.nsg-roles{grid-template-columns:repeat(2,1fr)}}
.nsg-role{display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 8px;border:1px solid rgba(92,64,51,0.18);border-radius:12px;background:#fff;cursor:pointer;font-family:inherit;transition:all .15s ease}
.nsg-role svg{width:22px;height:22px;color:var(--soil)}
.nsg-role span{font-size:0.85rem;color:var(--soil-ink)}
.nsg-role:hover{border-color:var(--green)}
.nsg-role.on{background:rgba(106,168,79,0.12);border-color:var(--green);box-shadow:0 0 0 3px rgba(106,168,79,0.16)}
.nsg-role.on svg{color:var(--green-deep)}
.nsg-get{border:1px dashed var(--green);border-radius:14px;padding:22px 22px;margin:24px 0 0;background:rgba(106,168,79,0.05)}
.nsg-get-h{font-family:var(--mono);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:var(--green-deep);margin:0 0 14px}
.nsg-get-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 22px}
@media (max-width:560px){.nsg-get-grid{grid-template-columns:1fr}}
.nsg-get-grid li{display:flex;align-items:flex-start;gap:9px;font-size:0.92rem;color:var(--soil-ink);line-height:1.4;list-style:none}
.nsg-get-grid svg{width:15px;height:15px;color:var(--green);flex:none;margin-top:3px}
.nsg-submit{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:28px;flex-wrap:wrap}
.nsg-privacy{display:flex;align-items:flex-start;gap:10px;max-width:480px;font-size:0.82rem;line-height:1.5;color:var(--soil)}
.nsg-privacy svg{width:16px;height:16px;color:var(--green-deep);flex:none;margin-top:2px}
.nsg-privacy b{color:var(--soil-ink)}
.nsg-btn{display:inline-flex;align-items:center;gap:9px;background:var(--green);color:#fff;border:none;padding:15px 30px;border-radius:999px;font-family:var(--mono);font-size:12px;letter-spacing:0.04em;font-weight:600;cursor:pointer;box-shadow:0 8px 20px rgba(63,107,44,0.28);transition:transform .2s ease,background .2s ease,box-shadow .2s ease;white-space:nowrap}
.nsg-btn:hover{background:var(--green-deep);transform:translateY(-2px);box-shadow:0 12px 26px rgba(63,107,44,0.34)}
.nsg-btn svg{width:15px;height:15px}
.nsg-success{text-align:center;padding:14px 0}
.nsg-check{width:64px;height:64px;border-radius:999px;background:rgba(106,168,79,0.16);color:var(--green-deep);display:inline-flex;align-items:center;justify-content:center;margin-bottom:20px}
.nsg-check svg{width:32px;height:32px}
.nsg-success h3{font-family:var(--serif);font-weight:400;font-size:1.7rem;color:var(--soil-ink);margin:0 0 12px}
.nsg-success p{max-width:520px;margin:0 auto;font-size:1rem;line-height:1.65;color:var(--soil)}
.nsg-foot{text-align:center;margin-top:30px}
.nsg-foot .nsg-foot-q{font-family:var(--serif);font-style:italic;font-size:1.08rem;line-height:1.55;color:var(--soil-ink);max-width:560px;margin:0 auto}
.nsg-foot .nsg-foot-sig{font-family:var(--mono);font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:var(--green-deep);margin:14px 0 0}
`;

const NSG_ROLES = [
  { key: "farmer", label: "Farmer", icon: "wheat" },
  { key: "student", label: "Student", icon: "student" },
  { key: "buyer", label: "Buyer", icon: "buyer" },
  { key: "partner", label: "Partner", icon: "partner" },
  { key: "supporter", label: "Supporter", icon: "supporter" },
];

const NSG_GET = [
  "Practical lessons from the field",
  "TAE progress updates",
  "Pilot programme opportunities",
  "Pacific community stories",
  "Honest farming insights",
  "Motivation when the work gets hard",
];

function NetworkSignup() {
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [role, setRole] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email so we can reach you.");
      return;
    }
    setError("");
    // Apps Script signup endpoint — sends notification email to founder@teivaka.com.
    // Memory #28 partially closed via this catch. Sheet logging + welcome sequence
    // next-session (full Apps Script extension). Fire-and-forget: show success state
    // regardless of network result so the visitor never sees an error.
    const ENDPOINT = "https://script.google.com/macros/s/AKfycbxnpw4m9N3fyRm4aRGfd5eLEWReJ2k70HDzNZziL0tV5u3-JcHkjkdjxofsPqsgIvjH/exec";
    const payload = {
      email: email,
      name: name,
      whatsapp: whatsapp,
      location: location,
      role: role,
      source: window.location.pathname,
    };
    // no-cors mode: Apps Script returns CORS-blocked redirects on browser POST,
    // but the script still runs and sends the email. Response is opaque, but the
    // signup succeeds. Browser won't error out.
    fetch(ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    }).catch(function(err) {
      console.log("Network signup fetch issue (signup may still have succeeded):", err);
    });
    setSubmitted(true);
  }

  return (
    <section className="nsg" aria-label="Teivaka Community and Farmer Network">
      <style>{NSG_CSS}</style>
      <div className="nsg-decor tl"><Icon name="wheat" /></div>
      <div className="nsg-decor br"><Icon name="leaf" /></div>

      <div className="nsg-inner">
        <div className="nsg-head">
          <span className="nsg-pill"><Icon name="users" /> Teivaka Community &amp; Farmer Network</span>
          <h2>Stay close to the farmers shaping the future of Pacific agriculture.</h2>
          <p className="nsg-sub">
            A small but growing network — farmers, students, buyers, partners, and supporters — staying connected through real lessons from the field, TAE progress, and the work being done across Fiji and the wider Pacific.
          </p>
        </div>

        <div className="nsg-card">
          {submitted ? (
            <div className="nsg-success">
              <span className="nsg-check"><Icon name="checkPlain" /></span>
              <h3>Bula and welcome to the network.</h3>
              <p>
                You'll hear from us soon — and never more often than you'd want. If you gave us a WhatsApp number, expect a short hello message from Cody within a day or two.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className="nsg-trust">
                <span><Icon name="shield" /> No spam. Ever.</span>
                <span><Icon name="lock" /> We never share your details</span>
                <span><Icon name="checkPlain" /> Leave anytime, in one click</span>
              </div>

              <div className="nsg-row">
                <div className="nsg-field">
                  <label htmlFor="nsg-email">Email (required)</label>
                  <input
                    id="nsg-email"
                    type="email"
                    className={error ? "err" : ""}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  {error ? <p className="nsg-err-inline">{error}</p> : null}
                </div>
                <div className="nsg-field">
                  <label htmlFor="nsg-wa">WhatsApp (optional)</label>
                  <div className="nsg-telwrap">
                    <span className="nsg-tel-prefix">+</span>
                    <input
                      id="nsg-wa"
                      type="tel"
                      placeholder="679 XXX XXXX"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="nsg-row">
                <div className="nsg-field">
                  <label htmlFor="nsg-name">Name (optional)</label>
                  <input
                    id="nsg-name"
                    type="text"
                    placeholder="Bula, what should we call you?"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="nsg-field">
                  <label htmlFor="nsg-loc">Location (optional)</label>
                  <input
                    id="nsg-loc"
                    type="text"
                    placeholder="e.g. Kadavu, Suva, Sydney"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
              </div>

              <p className="nsg-rolelabel">I am a…</p>
              <div className="nsg-roles">
                {NSG_ROLES.map((r) => (
                  <button
                    type="button"
                    key={r.key}
                    className={role === r.key ? "nsg-role on" : "nsg-role"}
                    onClick={() => setRole(r.key)}
                    aria-pressed={role === r.key}
                  >
                    <Icon name={r.icon} />
                    <span>{r.label}</span>
                  </button>
                ))}
              </div>

              <div className="nsg-get">
                <p className="nsg-get-h">What you'll get</p>
                <ul className="nsg-get-grid">
                  {NSG_GET.map((g, i) => (
                    <li key={i}><Icon name="checkPlain" /> {g}</li>
                  ))}
                </ul>
              </div>

              <div className="nsg-submit">
                <p className="nsg-privacy">
                  <Icon name="lock" />
                  <span><b>Your details stay with us.</b> We use them only to send you what you signed up for. Never sold, never shared, never spammed.</span>
                </p>
                <button type="submit" className="nsg-btn">
                  Join the network <Icon name="arrowRight" />
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="nsg-foot">
          <p className="nsg-foot-q">This isn't a mailing list. It's the group of people I want close as we build this thing.</p>
          <p className="nsg-foot-sig">— Cody, Founder</p>
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT 2 — <AboutPage />
// ══════════════════════════════════════════════════════════════════════════════
function AboutPage({ navigate }) {
  return (
    <main className="tvm">
      <style>{TVM_CSS}</style>

      <section className="tvm-section first">
        <div className="tvm-narrow tvm-center">
          <p className="tvm-eyebrow">About Teivaka</p>
          <h1 className="tvm-h1">A Fiji company redefining farming as a business, not a risk.</h1>
          <p className="tvm-sub">Built on two operational farms before it touches any other. Pacific-built, Pacific-owned, Pacific-led.</p>
        </div>
      </section>

      <section className="tvm-section">
        <div className="tvm-narrow">
          <p className="tvm-lead">Teivaka PTE LTD is a Fiji agricultural company. We activate idle customary land, equip Fijian farmers with proven, field-tested systems, and build resilient, profitable farm businesses that deliver predictable income.</p>
          <p className="tvm-p">We don't just advise — we operate. Our own farms generate real revenue today. That is what earns us the right to turn the system into software for every Pacific smallholder: the knowledge in our platform is proven in the field, not theorised.</p>
        </div>
      </section>

      <section className="tvm-section">
        <div className="tvm-wrap">
          <p className="tvm-eyebrow">The team</p>
          <h2 className="tvm-h2">Small team, full ownership of every part.</h2>
          <div className="tvm-grid-2" style={{ marginTop: 28 }}>
            <div className="tvm-team">
              <p className="tvm-tname">Uraia Koroi Kama (Cody)</p>
              <p className="tvm-trole">Founder</p>
              <p>Founded Teivaka and operates both pilot farms — Save-A-Lot (crops, vegetables, apiculture) and Viyasiyasi on Kadavu Island (eleven verticals). Builds the platform against the daily reality of running them.</p>
            </div>
            <div className="tvm-team">
              <p className="tvm-tname">Kinisimere Wati</p>
              <p className="tvm-trole">Finance &amp; Operations</p>
              <p>Bookkeeping, payroll, revenue. Every figure tight and transparent.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="tvm-section">
        <div className="tvm-narrow">
          <p className="tvm-eyebrow">Why Teivaka exists</p>
          <h2 className="tvm-h2">From the founder.</h2>
          <p className="tvm-p">I left a Science Degree and came home to Kadavu to farm — and in one season I learned what every Pacific farmer carries but no one says out loud: we work harder than farmers anywhere in the world, on land we cannot prove, with numbers we never had, for buyers who decide our worth in silence.</p>
          <p className="tvm-p">Our grandfathers farmed by memory. We have been farming by memory too — and calling it tradition. It is not tradition. It is the reason a banker can look at a man with twenty years of harvest behind him and see nothing. The land is not the problem. The farmer is not the problem. The absence of a system that respects what we do — that is the problem.</p>
          <p className="tvm-p">So I built one. On my own farms first. Before I asked a single other farmer to trust it with their season.</p>
          <p className="tvm-sig">— Uraia Koroi Kama, Founder</p>
        </div>
      </section>

      <section className="tvm-section tvm-center">
        <div className="tvm-narrow">
          <button type="button" className="tvm-pill-secondary" onClick={() => navigate("/our-farms")}>
            See the farms <Icon name="arrowRight" />
          </button>
        </div>
      </section>

      <NetworkSignup />
    </main>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT 3 — <TFOSPage /> : farmer-first positioning
// ══════════════════════════════════════════════════════════════════════════════
function PillarModal({ pillar, onClose }) {
  return (
    <div className="ofp-overlay" onClick={onClose}>
      <div className="ofp-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={pillar.name}>
        <button type="button" className="ofp-modal-close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        <div className="ofp-modal-body" style={{ paddingTop: 40 }}>
          <div className="tvm-isq" style={{ width: 56, height: 56 }}><Icon name={pillar.icon} /></div>
          <span className="tvm-tag">{pillar.tag}</span>
          <h2 className="ofp-modal-name" style={{ color: "var(--soil-ink)", fontSize: "2rem", textShadow: "none", margin: "4px 0 18px" }}>{pillar.name}</h2>
          <h3 className="ofp-modal-title">What it is</h3>
          <p style={{ fontSize: "1rem", lineHeight: 1.7, color: "var(--soil)", margin: "0 0 8px" }}>{pillar.what}</p>
          <h3 className="ofp-modal-title">What's in it</h3>
          <ul style={{ margin: 0, padding: "0 0 0 4px", listStyle: "none" }}>
            {pillar.features.map((f, i) => (
              <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "0 0 12px", fontSize: "0.96rem", lineHeight: 1.55, color: "var(--soil-ink)" }}>
                <span style={{ color: "var(--green-deep)", flex: "none", marginTop: 2 }}><Icon name="checkPlain" /></span>{f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function TFOSPage({ navigate }) {
  const [activePillar, setActivePillar] = useState(null);

  useEffect(() => {
    if (!activePillar) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setActivePillar(null); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [activePillar]);

  const pillar = activePillar ? TFOS_PILLARS.find((p) => p.key === activePillar) : null;

  return (
    <main className="tvm">
      <style>{TVM_CSS}</style>
      <style>{OFP_CSS}</style>

      {/* 1. Hero */}
      <section className="tvm-hero2">
        <div>
          <p className="tvm-eyebrow">The Agriculture Ecosystem</p>
          <h1 className="tvm-h1">Built so Pacific farms finally have a record.</h1>
          <p className="tvm-sub">TAE guides your daily work, keeps your harvest, cash, and labour straight, and grows with you — from one task at a time to full commercial operations. Built in Fiji, on two working farms, before it touches any other farm.</p>
          <div className="tvm-cta-row">
            <button type="button" className="tvm-pill-primary" onClick={() => navigate("/contact")}>Start with TAE <Icon name="arrowRight" /></button>
            <button type="button" className="tvm-pill-secondary" onClick={() => navigate("/partner")}>Explore partnership <Icon name="arrowRight" /></button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <TaskPhone />
          <p className="tvm-phone-cap">What a farmer sees, every day</p>
        </div>
      </section>

      {/* 2. Four pillars */}
      <section className="tvm-section">
        <div className="tvm-wrap">
          <p className="tvm-eyebrow">Four pillars, one farmer login</p>
          <h2 className="tvm-h2">Everything a farm needs, in one place.</h2>
          <p className="tvm-sub" style={{ maxWidth: 680 }}>Pacific farmers don't need four apps. They need one place where knowledge, neighbours, daily work, and an AI advisor live together.</p>
          <div className="tvm-grid-2" style={{ marginTop: 30 }}>
            {TFOS_PILLARS.map((p) => (
              <button type="button" key={p.key} className="tvm-card tappable" onClick={() => setActivePillar(p.key)}>
                <div className="tvm-isq"><Icon name={p.icon} /></div>
                <span className="tvm-tag">{p.tag}</span>
                <h3>{p.name}</h3>
                <p>{p.blurb}</p>
                <span className="tvm-seeinside">See inside <Icon name="arrowRight" /></span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Three modes */}
      <section className="tvm-section">
        <div className="tvm-wrap">
          <p className="tvm-eyebrow">Three modes, derived not chosen</p>
          <h2 className="tvm-h2">One platform that meets every farmer where they are.</h2>
          <p className="tvm-sub" style={{ maxWidth: 680 }}>TAE adapts to how your farm is operating — size, active cycles, tenure. A subsistence grower never sees what a commercial operator sees.</p>
          <div className="tvm-grid-3" style={{ marginTop: 30 }}>
            <div className="tvm-mode">
              <TaskPhone small />
              <h4>Solo</h4>
              <p className="tvm-modetag">Subsistence</p>
              <p>One task at a time. Voice playback, three buttons, nothing to learn.</p>
            </div>
            <div className="tvm-mode">
              <div className="tvm-phone sm">
                <div className="tvm-gscreen">
                  <div className="tvm-ghead"><span /></div>
                  <div className="tvm-gbody">
                    <div className="tvm-grow big" />
                    <div className="tvm-grow" />
                    <div className="tvm-grow" />
                  </div>
                  <div className="tvm-gnav"><i /><i className="on" /><i /><i /><i /></div>
                </div>
              </div>
              <h4>Growth</h4>
              <p className="tvm-modetag">Mid-tier</p>
              <p>Five pillars across Home, Classroom, Farm, TIS, and Me. More depth as you grow.</p>
            </div>
            <div className="tvm-mode">
              <div className="tvm-desk">
                <div className="tvm-desk-side"><i className="on" /><i /><i /><i /></div>
                <div className="tvm-desk-main">
                  <div className="tvm-desk-tiles"><div /><div /><div /></div>
                  <div className="tvm-spark" />
                </div>
              </div>
              <h4>Commercial</h4>
              <p className="tvm-modetag">Multi-block</p>
              <p>Analytics, multi-farm rollup, full operational depth for serious operations.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Seven verticals */}
      <section className="tvm-section">
        <div className="tvm-wrap">
          <p className="tvm-eyebrow">The seven verticals</p>
          <h2 className="tvm-h2">Seven verticals. One system.</h2>
          <p className="tvm-sub" style={{ maxWidth: 560 }}>Pacific farms aren't monoculture. TAE isn't either.</p>
          <div className="tvm-grid-4" style={{ marginTop: 30 }}>
            {TFOS_VERTICALS.map((v) => (
              <div className="tvm-vtile" key={v.name}>
                <div className="tvm-isq"><Icon name={v.icon} /></div>
                <h4>{v.name}</h4>
                <p>{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Moat (dark) */}
      <section className="tvm-section tvm-dark">
        <div className="tvm-wrap">
          <p className="tvm-eyebrow light">Why this matters long-term</p>
          <h2 className="tvm-h2">Your farm history, finally something you can prove.</h2>
          <p className="tvm-sub" style={{ maxWidth: 760, marginBottom: 36 }}>Every action on a TAE farm becomes one structured record. Over a season, that record is useful. Over years, it becomes something a buyer can trust, a lender can lend against, a government can build programmes on.</p>
          <div className="tvm-darkcard">
            <div className="tvm-chain">
              {[
                { icon: "event", name: "Action", desc: "A farmer logs what they did." },
                { icon: "doc", name: "Record", desc: "Captured as one structured row." },
                { icon: "chain", name: "Chain", desc: "Hash-linked to the row before." },
                { icon: "hash", name: "Evidence", desc: "A tamper-evident history." },
                { icon: "bank", name: "Trust", desc: "A lender can lend against it.", terminal: true },
              ].map((n, i, arr) => (
                <React.Fragment key={n.name}>
                  <div className={n.terminal ? "tvm-cnode terminal" : "tvm-cnode"}>
                    <div className="tvm-isq"><Icon name={n.icon} /></div>
                    <span className="tvm-cname">{n.name}</span>
                    <span className="tvm-cdesc">{n.desc}</span>
                  </div>
                  {i < arr.length - 1 ? <span className="tvm-carrow"><Icon name="arrowRight" /></span> : null}
                </React.Fragment>
              ))}
            </div>
          </div>
          <div className="tvm-stats">
            <div className="tvm-stat"><p className="tvm-statk">Immutable</p><p>Records are not editable. Corrections create new linked records.</p></div>
            <div className="tvm-stat"><p className="tvm-statk">Chain-linked</p><p>Every record cryptographically links to the one before it.</p></div>
            <div className="tvm-stat"><p className="tvm-statk">Publicly verifiable</p><p>Open verification endpoint. Anyone can validate the chain.</p></div>
            <div className="tvm-stat"><p className="tvm-statk">Banker-ready</p><p>Monthly evidence PDF via WhatsApp. QR-scannable. No translation layer.</p></div>
          </div>
        </div>
      </section>

      {/* 6. Closing CTAs */}
      <section className="tvm-section tvm-center">
        <div className="tvm-narrow">
          <p className="tvm-eyebrow">See it in action</p>
          <h2 className="tvm-h2">Want to walk through it?</h2>
          <div className="tvm-cta-row">
            <a className="tvm-pill-primary" href={wa(WA_FOUNDER, "Bula Cody, I want to see TAE in action.")} target="_blank" rel="noopener noreferrer">Talk to Cody on WhatsApp <Icon name="arrowRight" /></a>
            <button type="button" className="tvm-pill-secondary" onClick={() => navigate("/our-farms")}>See the farms TAE runs on <Icon name="arrowRight" /></button>
          </div>
        </div>
      </section>

      <NetworkSignup />

      {pillar ? <PillarModal pillar={pillar} onClose={() => setActivePillar(null)} /> : null}
    </main>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT 4 — <TISPage />
// ══════════════════════════════════════════════════════════════════════════════
function TISPage({ navigate }) {
  const tisLink = wa(WA_TIS, "Bula, I want to get connected to TIS.");
  return (
    <main className="tvm">
      <style>{TVM_CSS}</style>

      {/* 1. Hero */}
      <section className="tvm-hero2">
        <div>
          <p className="tvm-eyebrow">TIS — Teivaka Intelligence System</p>
          <h1 className="tvm-h1">The advisor every Pacific farmer should have, on WhatsApp.</h1>
          <p className="tvm-sub">Send a message. Get an answer. Voice or text. Your language. About your farm specifically — TIS knows your cycles, your buyers, your weather. Live today.</p>
          <div className="tvm-cta-row">
            <a className="tvm-pill-primary" href={tisLink} target="_blank" rel="noopener noreferrer">Get connected to TIS <Icon name="arrowRight" /></a>
          </div>
        </div>
        <div className="tvm-chat">
          <div className="tvm-chat-head">
            <span className="tvm-chat-av">T</span>
            <div>
              <div className="tvm-chat-name">TIS</div>
              <div className="tvm-chat-status">● Online — Replies in seconds</div>
            </div>
          </div>
          <div className="tvm-bubbles">
            <div className="tvm-bub them">Bula TIS, my eggplants in Block 3 have white spots on the leaves. What should I do?</div>
            <div className="tvm-bub tis">Bula! White spots on eggplant leaves usually means powdery mildew, especially this time of year. Don't spray anything yet — first take 3 photos of an affected leaf, top and underside, and send them back. I'll confirm before recommending treatment.</div>
            <div className="tvm-bub photos">[3 photos sent]</div>
            <div className="tvm-bub tis">Confirmed — powdery mildew. Your last chemical application on Block 3 was 18 days ago (acceptable). I recommend a sulphur-based spray within 48 hours, evening application only. Remember 7-day withholding before harvest. Want me to add this to your task list?</div>
          </div>
        </div>
      </section>

      {/* 2. What makes TIS different */}
      <section className="tvm-section">
        <div className="tvm-wrap">
          <p className="tvm-eyebrow">What makes TIS different</p>
          <h2 className="tvm-h2">Grounded. Honest. In your language.</h2>
          <div className="tvm-grid-3" style={{ marginTop: 30 }}>
            <div className="tvm-card">
              <div className="tvm-isq"><Icon name="shield" /></div>
              <h3>Grounded, never invented</h3>
              <p>TIS only answers from your farm's data and the Teivaka knowledge base. It never guesses a price, a date, or a yield. If it doesn't know, it says so.</p>
            </div>
            <div className="tvm-card">
              <div className="tvm-isq"><Icon name="globe" /></div>
              <h3>Fijian, Hindi, English</h3>
              <p>Speak the language you actually speak. TIS adapts. Voice notes welcome.</p>
            </div>
            <div className="tvm-card">
              <div className="tvm-isq"><Icon name="tis" /></div>
              <h3>On WhatsApp today</h3>
              <p>No new app to learn. The phone you already use, the number you already have. In-app coming soon.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Closing CTAs */}
      <section className="tvm-section tvm-center">
        <div className="tvm-narrow">
          <p className="tvm-eyebrow">Try it</p>
          <h2 className="tvm-h2">Send a message. See what it can do.</h2>
          <div className="tvm-cta-row">
            <a className="tvm-pill-primary" href={tisLink} target="_blank" rel="noopener noreferrer">Get connected to TIS <Icon name="arrowRight" /></a>
            <button type="button" className="tvm-pill-secondary" onClick={() => navigate("/tfos")}>See the rest of TAE <Icon name="arrowRight" /></button>
          </div>
        </div>
      </section>

      <NetworkSignup />
    </main>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT 5 — <PartnerPage />
// ══════════════════════════════════════════════════════════════════════════════
function PartnerPage({ navigate }) {
  return (
    <main className="tvm">
      <style>{TVM_CSS}</style>

      <section className="tvm-section first">
        <div className="tvm-narrow tvm-center">
          <p className="tvm-eyebrow">Work with Teivaka</p>
          <h1 className="tvm-h1">However you reach us, there's a path.</h1>
          <p className="tvm-sub">Teivaka partners with landowners, buyers, institutions, and farmers. Pick the door that fits — we'll meet you there.</p>
        </div>
      </section>

      <section className="tvm-section" style={{ paddingTop: 0, borderTop: 0 }}>
        <div className="tvm-wrap">
          <div className="tvm-grid-2">
            <div className="tvm-partner">
              <p className="tvm-eyebrow">For landowners</p>
              <h3>Activate idle land.</h3>
              <p>You have land. We have the system. We bring the team, the platform, and the buyer relationships. You keep ownership, we share what it earns. Pacific-grounded partnership, not a Silicon Valley land grab.</p>
              <a className="tvm-pill-secondary" href={wa(WA_FOUNDER, "Bula Cody, I have land I'd like to talk about activating.")} target="_blank" rel="noopener noreferrer">Talk about your land <Icon name="arrowRight" /></a>
            </div>
            <div className="tvm-partner">
              <p className="tvm-eyebrow">For buyers</p>
              <h3>Reliable Pacific supply.</h3>
              <p>Supermarkets, hotels, exporters. We supply consistently from farms we operate to a standard we control. Chemical compliance windows verified. Delivery confirmations recorded. A dependable local supply, not a one-off.</p>
              <a className="tvm-pill-secondary" href={wa(WA_FOUNDER, "Bula Cody, I'm interested in supply from Teivaka.")} target="_blank" rel="noopener noreferrer">Discuss supply <Icon name="arrowRight" /></a>
            </div>
            <div className="tvm-partner">
              <p className="tvm-eyebrow">For institutions</p>
              <h3>Pacific-built infrastructure.</h3>
              <p>NGOs, agribusinesses, government, development partners. Teivaka's model and TIS scale via per-farmer partnerships for outgrower networks. Pacific-built, programme-ready, evidence-backed.</p>
              <a className="tvm-pill-secondary" href={gmail("Institutional partnership inquiry")} target="_blank" rel="noopener noreferrer">Explore partnership <Icon name="arrowRight" /></a>
            </div>
            <div className="tvm-partner">
              <p className="tvm-eyebrow">For farmers</p>
              <h3>Start with TIS today.</h3>
              <p>Live advice on WhatsApp, today, in your language. Free for every Fijian farmer. The fastest, lowest-commitment way to start with Teivaka — no app, no signup, just a message.</p>
              <button type="button" className="tvm-pill-secondary" onClick={() => navigate(TIS_MARKETING_PATH)}>Get connected to TIS <Icon name="arrowRight" /></button>
            </div>
          </div>
        </div>
      </section>

      <NetworkSignup />
    </main>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT 6 — <PricingPage />
// ══════════════════════════════════════════════════════════════════════════════
function PricingPage({ navigate }) {
  return (
    <main className="tvm">
      <style>{TVM_CSS}</style>

      <section className="tvm-section first">
        <div className="tvm-narrow tvm-center">
          <p className="tvm-eyebrow">Pricing</p>
          <h1 className="tvm-h1">Start free. Grow into it.</h1>
          <p className="tvm-sub">Every Fijian farmer starts free. Paid tiers add deeper farm management as your operation grows. We discuss numbers in conversation — talk to Cody for specifics.</p>
        </div>
      </section>

      <section className="tvm-section" style={{ paddingTop: 0, borderTop: 0 }}>
        <div className="tvm-wrap">
          <div className="tvm-grid-4">
            <div className="tvm-tier">
              <h3>Free</h3>
              <p className="tvm-tdesc">Full Community, Classroom and TIS. Limited Farm Management.</p>
              <p className="tvm-twho">Every Fijian farmer — the starting point.</p>
              <button type="button" className="tvm-fullpill filled" onClick={() => navigate("/contact")}>Sign up free <Icon name="arrowRight" /></button>
            </div>
            <div className="tvm-tier">
              <h3>Basic</h3>
              <p className="tvm-tdesc">The Free tier plus extended Farm Management access. Cash ledger, deeper records, basic reports.</p>
              <p className="tvm-twho">Farmers taking the first step up.</p>
              <a className="tvm-fullpill outline" href={wa(WA_FOUNDER, "Bula Cody, I'd like to talk about the Basic tier.")} target="_blank" rel="noopener noreferrer">Talk to Cody <Icon name="arrowRight" /></a>
            </div>
            <div className="tvm-tier">
              <h3>Premium</h3>
              <p className="tvm-tdesc">Full access to all four pillars across seven verticals. Multi-block, multi-buyer support.</p>
              <p className="tvm-twho">Farmers operating full TAE on their own farm.</p>
              <a className="tvm-fullpill outline" href={wa(WA_FOUNDER, "Bula Cody, I'd like to talk about the Premium tier.")} target="_blank" rel="noopener noreferrer">Talk to Cody <Icon name="arrowRight" /></a>
            </div>
            <div className="tvm-tier">
              <h3>Custom</h3>
              <p className="tvm-tdesc">Profit-share plus full TAE plus Teivaka's network — input suppliers, mechanization, market access, operational management.</p>
              <p className="tvm-twho">Landowners, communities and institutions.</p>
              <a className="tvm-fullpill outline" href={wa(WA_FOUNDER, "Bula Cody, I'd like to talk about the Custom tier.")} target="_blank" rel="noopener noreferrer">Talk to Cody <Icon name="arrowRight" /></a>
            </div>
          </div>
          <p className="tvm-footnote">Not sure which tier fits? <a href={wa(WA_FOUNDER, "Bula Cody, can you help me pick the right Teivaka tier?")} target="_blank" rel="noopener noreferrer">Talk to Cody on WhatsApp</a> — he'll walk you through it.</p>
        </div>
      </section>

      <NetworkSignup />
    </main>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT 7 — <ContactPage /> : replaces the default contact rendering
// Founder direct line only (+679 8730866). The +679 7336211 TIS line is omitted.
// ══════════════════════════════════════════════════════════════════════════════
function ContactPage({ navigate }) {
  return (
    <main className="tvm">
      <style>{TVM_CSS}</style>

      <section className="tvm-section first" style={{ paddingBottom: 0, borderTop: 0 }}>
        <div className="tvm-wrap">
          <div className="tvm-hero2" style={{ padding: 0 }}>
            <div>
              <p className="tvm-eyebrow">Contact</p>
              <h1 className="tvm-h1">Let's turn idle land into wealth — together.</h1>
              <div className="tvm-contact-list">
                <div className="tvm-cline">
                  <span className="tvm-ck">Email</span>
                  <span className="tvm-cv"><a href={GMAIL_COMPOSE} target="_blank" rel="noopener noreferrer">founder@teivaka.com</a></span>
                </div>
                <div className="tvm-cline">
                  <span className="tvm-ck">Founder (direct)</span>
                  <span className="tvm-cv"><a href={wa(WA_FOUNDER, "Bula Cody, I'd like to get in touch.")} target="_blank" rel="noopener noreferrer">+679 8730866</a></span>
                </div>
                <div className="tvm-cline">
                  <span className="tvm-ck">Based in</span>
                  <span className="tvm-cv">Fiji — Korovou &amp; Kadavu</span>
                </div>
                <div className="tvm-cline">
                  <span className="tvm-ck">Platform</span>
                  <span className="tvm-cv">teivaka.com</span>
                </div>
              </div>
            </div>
            <div className="tvm-contactcard">
              <p className="tvm-eyebrow light">Get going</p>
              <h2>Already a member? Or new to TAE?</h2>
              <p>Both doors open from the top nav. If you want to talk to a human first — Cody answers WhatsApp.</p>
              <div className="tvm-cta-row">
                <a className="tvm-pill-primary" href={wa(WA_FOUNDER, "Bula Cody, I'd like to get in touch.")} target="_blank" rel="noopener noreferrer">Message Cody <Icon name="arrowRight" /></a>
                <button type="button" className="tvm-pill-ondark" onClick={() => navigate("/login")}>Login</button>
                <button type="button" className="tvm-pill-ondark" onClick={() => navigate("/login")}>Sign up free</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <NetworkSignup />
    </main>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT 8 — <TheWorkPage /> : transparent "what's live vs what's being built"
// Calm, honest, founder-voice. Single source of truth for current status.
// Status vocabulary: LIVE / IN BUILD / NEXT / PLANNED. No hype, no future
// promises stated as present tense. Reuses .tvm tokens + .nsg NetworkSignup.
// ══════════════════════════════════════════════════════════════════════════════
const TWK_CSS = `
.twk{--sand:#C2A878}
.twk *{box-sizing:border-box}

/* hero */
.twk-hero{max-width:820px;margin:0 auto;padding:64px 32px 8px;text-align:center}
.twk-hero .tvm-eyebrow{justify-content:center}
.twk-h1{font-family:var(--serif);font-weight:400;font-size:clamp(2.5rem,5vw,4rem);line-height:1.08;color:var(--soil-ink);margin:0 auto 20px;max-width:820px}
.twk-subhead{max-width:620px;margin:0 auto;font-size:1.08rem;line-height:1.65;color:var(--soil)}
.twk-stamp{font-family:var(--mono);font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:var(--sand);margin:22px 0 0}

/* shared status pill */
.twk-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-family:var(--mono);font-size:10px;letter-spacing:0.12em;font-weight:600;text-transform:uppercase;flex-shrink:0;white-space:nowrap}
.twk-pill::before{content:'';width:8px;height:8px;border-radius:50%}
.twk-pill.live{background:rgba(106,168,79,0.14);color:var(--green-deep)}
.twk-pill.live::before{background:var(--green)}
.twk-pill.build{background:rgba(191,144,0,0.14);color:#8a6800}
.twk-pill.build::before{background:var(--amber)}
.twk-pill.next{background:rgba(92,64,51,0.1);color:var(--soil)}
.twk-pill.next::before{background:var(--soil)}
.twk-pill.planned{background:rgba(92,64,51,0.05);color:var(--sand)}
.twk-pill.planned::before{background:rgba(92,64,51,0.4)}

/* block wrapper (legend + pillars) */
.twk-block{max-width:1100px;margin:0 auto;padding:32px 32px 64px}

/* legend */
.twk-legend{background:#fff;border-radius:16px;border:1px solid rgba(92,64,51,0.1);padding:24px 28px;display:flex;flex-wrap:wrap;gap:20px}
.twk-legitem{display:flex;align-items:flex-start;gap:10px;flex:1;min-width:240px}
.twk-legtext{font-size:0.9rem;line-height:1.5;color:var(--soil)}

/* status list (shared by pillars + moat) */
.twk-slist{display:flex;flex-direction:column;gap:14px}
.twk-sitem{display:flex;align-items:flex-start;gap:12px;padding-bottom:14px;border-bottom:1px solid rgba(92,64,51,0.06)}
.twk-sitem:last-child{padding-bottom:0;border-bottom:0}
.twk-stext{flex:1;font-size:0.92rem;line-height:1.55;color:var(--soil);padding-top:2px}

/* pillar grid */
.twk-pillars{display:grid;grid-template-columns:1fr 1fr;gap:24px}
@media (max-width:768px){.twk-pillars{grid-template-columns:1fr}}
.twk-pcard{background:#fff;border:1px solid rgba(92,64,51,0.12);border-radius:16px;padding:32px 28px}
.twk-pcard h3{font-family:var(--serif);font-weight:400;font-size:1.5rem;line-height:1.12;color:var(--soil-ink);margin:0 0 6px}
.twk-psub{font-family:var(--mono);font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--green-deep);margin:0 0 22px;padding-bottom:18px;border-bottom:1px solid rgba(92,64,51,0.1)}

/* moat (dark) */
.twk-moat{background:var(--soil-ink);color:var(--cream);margin-top:60px;padding:80px 32px}
.twk-moat-inner{max-width:1100px;margin:0 auto}
.twk-moat-head{max-width:720px;margin-bottom:36px}
.twk-moat-head h2{font-family:var(--serif);font-weight:400;font-size:clamp(1.75rem,3.5vw,2.5rem);line-height:1.14;color:var(--cream);margin:0 0 16px}
.twk-moat-sub{color:rgba(248,243,233,0.78);font-size:1.05rem;line-height:1.6;max-width:640px;margin:0}
.twk-moat-list{background:rgba(248,243,233,0.04);border:1px solid rgba(248,243,233,0.1);border-radius:16px;padding:28px 32px}
.twk-moat .twk-sitem{border-bottom:1px solid rgba(248,243,233,0.08)}
.twk-moat .twk-sitem:last-child{border-bottom:0}
.twk-moat .twk-stext{color:rgba(248,243,233,0.85)}
.twk-moat .twk-pill.live{background:rgba(106,168,79,0.2);color:#C9DFB0}
.twk-moat .twk-pill.live::before{background:var(--green)}
.twk-moat .twk-pill.build{background:rgba(191,144,0,0.2);color:#E8C977}
.twk-moat .twk-pill.build::before{background:var(--amber)}
.twk-moat .twk-pill.next{background:rgba(248,243,233,0.1);color:rgba(248,243,233,0.85)}
.twk-moat .twk-pill.next::before{background:rgba(248,243,233,0.7)}
.twk-moat .twk-pill.planned{background:rgba(248,243,233,0.05);color:rgba(248,243,233,0.55)}
.twk-moat .twk-pill.planned::before{background:rgba(248,243,233,0.4)}

/* farms proof */
.twk-farms{max-width:1100px;margin:0 auto;padding:80px 32px 64px}
.twk-farms .twk-head{max-width:720px;margin-bottom:30px}
.twk-farmgrid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
@media (max-width:768px){.twk-farmgrid{grid-template-columns:1fr}}
.twk-farmcard{background:#fff;border:1px solid rgba(92,64,51,0.12);border-radius:16px;padding:32px 28px}
.twk-farmcard .twk-pill{margin-bottom:18px}
.twk-farmcard h3{font-family:var(--serif);font-weight:400;font-size:1.75rem;line-height:1.1;color:var(--soil-ink);margin:0}
.twk-farmloc{display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:var(--green-deep);margin:8px 0 22px;padding-bottom:18px;border-bottom:1px solid rgba(92,64,51,0.1)}
.twk-farmloc svg{width:14px;height:14px;flex:none}
.twk-points{display:flex;flex-direction:column;gap:12px}
.twk-bullet{position:relative;padding-left:18px;font-size:0.96rem;line-height:1.6;color:var(--soil);margin:0}
.twk-bullet::before{content:'';position:absolute;left:0;top:9px;width:6px;height:6px;border-radius:50%;background:var(--green)}

/* commitment prose */
.twk-commit{max-width:640px;margin:0 auto;padding:80px 32px;text-align:center}
.twk-commit .tvm-eyebrow{justify-content:center}
.twk-commit h2{font-family:var(--serif);font-weight:400;font-size:1.75rem;line-height:1.15;color:var(--soil-ink);margin:0 0 24px}
.twk-commit p{font-size:1rem;line-height:1.75;color:var(--soil);margin:0 0 18px}
.twk-close{font-style:italic;color:var(--soil);opacity:0.78;margin-top:28px;font-size:0.95rem}
.twk-sig{font-family:var(--mono);font-size:0.78rem;letter-spacing:0.06em;color:var(--green-deep);font-weight:600;text-transform:uppercase;margin-top:8px}

/* closing CTA */
.twk-closing{max-width:720px;margin:0 auto;padding:64px 32px 80px;text-align:center}
.twk-closing .tvm-eyebrow{justify-content:center}
.twk-closing h2{font-family:var(--serif);font-weight:400;font-size:1.75rem;line-height:1.15;color:var(--soil-ink);margin:0 0 28px}
.twk-cta-row{display:inline-flex;gap:14px;flex-wrap:wrap;justify-content:center}
`;

// LIVE = running today · IN BUILD = active now · NEXT = queued · PLANNED = roadmap
const TWK_PILL_CLASS = { "LIVE": "live", "IN BUILD": "build", "NEXT": "next", "PLANNED": "planned" };
const StatusPill = ({ status }) => <span className={`twk-pill ${TWK_PILL_CLASS[status]}`}>{status}</span>;

const TWK_LEGEND = [
  ["LIVE", "Running in production, used daily on the farms."],
  ["IN BUILD", "Actively being built right now. Days or weeks away from live."],
  ["NEXT", "Designed and queued. The build starts when current work ships."],
  ["PLANNED", "In the roadmap. Months out, not weeks."],
];

const TWK_PILLARS = [
  {
    name: "Community",
    subtitle: "Pillar 1 — The social spine",
    items: [
      ["LIVE", "Direct community of farmers Cody works with across Korovou and Kadavu"],
      ["PLANNED", "Farmer-to-farmer feed inside the platform"],
      ["PLANNED", "Buyer ratings and reviews"],
      ["PLANNED", "Neighbour network within ferry-reach"],
    ],
  },
  {
    name: "Classroom",
    subtitle: "Pillar 2 — Verified knowledge",
    items: [
      ["LIVE", "Working knowledge base grounding TIS responses"],
      ["IN BUILD", "Per-crop curriculum drawn from Save-A-Lot and Viyasiyasi operations"],
      ["IN BUILD", "Lesson-unlock tied to cycle progression"],
      ["NEXT", "Fijian-language lessons"],
      ["NEXT", "Hindi-language lessons"],
    ],
  },
  {
    name: "Farm Management",
    subtitle: "Pillar 3 — The system of record",
    items: [
      ["LIVE", "Production cycles tracked end-to-end on both farms"],
      ["LIVE", "Cash ledger anchored to farm, block, crop, and operator on every entry"],
      ["LIVE", "Chemical compliance enforcement (dual-layer — API check plus database trigger)"],
      ["LIVE", "Worker check-in and labour tracking"],
      ["LIVE", "Harvest logging with weight and grade"],
      ["IN BUILD", "In-app farmer surface for self-signup (currently Cody operates the system directly)"],
      ["NEXT", "Solo mode (one task at a time, voice-first, for subsistence growers)"],
      ["NEXT", "Multi-buyer dispatch tracking"],
      ["PLANNED", "Full Analytics layer for Commercial mode"],
    ],
  },
  {
    name: "TIS",
    subtitle: "Pillar 4 — Teivaka Intelligence System",
    items: [
      ["LIVE", "TIS on WhatsApp for farmers Cody onboards directly"],
      ["LIVE", "TIS-Public chatbot on teivaka.com"],
      ["LIVE", "Grounded responses (TIS will not guess prices, dates, or yields)"],
      ["LIVE", "Trilingual capability (Fijian, Hindi, English)"],
      ["IN BUILD", "TIS embedded inside the TAE app surface"],
      ["NEXT", "Voice messages (audio in, audio out)"],
      ["PLANNED", "Proactive task suggestions from TIS based on live farm data"],
    ],
  },
];

const TWK_MOAT = [
  ["LIVE", "Every farm action emits one structured, time-stamped event"],
  ["LIVE", "Audit events stored in a database table that cannot be edited or deleted"],
  ["LIVE", "Hash-chain linking between events using SHA-256"],
  ["LIVE", "Chain integrity check on every deploy"],
  ["IN BUILD", "Public verification endpoint at /verify (the moment a banker can scan a QR code)"],
  ["IN BUILD", "Monthly Bank Evidence PDF generation"],
  ["NEXT", "WhatsApp dispatch of Bank Evidence PDFs to farmers"],
  ["NEXT", "FICO-analog credit score computation"],
  ["PLANNED", "Lender-facing portal at /lender"],
];

const TWK_FARMS = [
  {
    name: "Save-A-Lot",
    location: "Korovou, Tailevu — Viti Levu",
    points: [
      "Operating today, generating revenue",
      "Three verticals: crops, vegetables, apiculture",
      "TAE tracking: production cycles, cash ledger, labour, harvest, sales",
    ],
  },
  {
    name: "Viyasiyasi",
    location: "Kadavu Island",
    points: [
      "Operating today, generating revenue",
      "Eleven verticals across livestock, kava, sandalwood, pineapple, honey, crops, vegetables",
      "TAE tracking: same as Save-A-Lot, tested against offline-first constraints",
    ],
  },
];

const StatusList = ({ items }) => (
  <div className="twk-slist">
    {items.map(([status, text], i) => (
      <div className="twk-sitem" key={i}>
        <StatusPill status={status} />
        <span className="twk-stext">{text}</span>
      </div>
    ))}
  </div>
);

function TheWorkPage({ navigate }) {
  useEffect(() => {
    document.title = "The work — Teivaka";
  }, []);

  const scrollToNetwork = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const el = document.getElementById("network");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="tvm twk">
      <style>{TVM_CSS}</style>
      <style>{TWK_CSS}</style>

      {/* 1. Hero */}
      <section className="twk-hero">
        <p className="tvm-eyebrow">Transparency</p>
        <h1 className="twk-h1">The work, where we are.</h1>
        <p className="twk-subhead">Teivaka is built farm-up, not pitch-down. Here's exactly what's running today, what's being built right now, and what's coming next. This page updates as the work progresses.</p>
        <p className="twk-stamp">LAST UPDATED: 26 MAY 2026</p>
      </section>

      {/* 2. Legend */}
      <section className="twk-block">
        <div className="twk-legend">
          {TWK_LEGEND.map(([status, text]) => (
            <div className="twk-legitem" key={status}>
              <StatusPill status={status} />
              <span className="twk-legtext">{text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Status by pillar */}
      <section className="twk-block" style={{ paddingTop: 0 }}>
        <div className="twk-pillars">
          {TWK_PILLARS.map((p) => (
            <div className="twk-pcard" key={p.name}>
              <h3>{p.name}</h3>
              <p className="twk-psub">{p.subtitle}</p>
              <StatusList items={p.items} />
            </div>
          ))}
        </div>
      </section>

      {/* 4. The moat — dark */}
      <section className="twk-moat">
        <div className="twk-moat-inner">
          <div className="twk-moat-head">
            <p className="tvm-eyebrow light">THE MOAT — AUDIT CHAIN STATUS</p>
            <h2>What's verifiable today, what's coming next.</h2>
            <p className="twk-moat-sub">The audit chain is what makes Teivaka eventually bankable. Here is exactly where that build is.</p>
          </div>
          <div className="twk-moat-list">
            <StatusList items={TWK_MOAT} />
          </div>
        </div>
      </section>

      {/* 5. The farms — proof */}
      <section className="twk-farms">
        <div className="twk-head">
          <p className="tvm-eyebrow">Operating today</p>
          <h2 className="tvm-h2">Two farms. Two islands. Real revenue.</h2>
          <p className="tvm-sub" style={{ maxWidth: 720 }}>Every claim above is built and tested against these two operating farms first. Not demo installations. Not pilot trials. Working farms with real workers, real harvests, real buyers.</p>
        </div>
        <div className="twk-farmgrid">
          {TWK_FARMS.map((f) => (
            <div className="twk-farmcard" key={f.name}>
              <StatusPill status="LIVE" />
              <h3>{f.name}</h3>
              <p className="twk-farmloc"><Icon name="pin" /> {f.location}</p>
              <div className="twk-points">
                {f.points.map((pt, i) => (
                  <p className="twk-bullet" key={i}>{pt}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. The commitment — prose */}
      <section className="twk-commit">
        <p className="tvm-eyebrow">The commitment</p>
        <h2>Why this page exists.</h2>
        <p>Pacific farmers have been promised too many platforms that never shipped. Apps that arrived once and were never updated. AI tools that didn't speak the language. Software built far from the field by people who never farmed.</p>
        <p>Teivaka is built farm-up. The system runs on my own two farms before it ever asks another farmer to trust it. This page exists so anyone — farmer, banker, partner, supporter — knows exactly what is running today and exactly what is still being built.</p>
        <p>If something here says LIVE, it means I am using it on my farms today. If something says IN BUILD, it is being worked on right now and you can ask me about it on WhatsApp. If something says NEXT or PLANNED, it is in the roadmap but not promised on a timeline.</p>
        <p className="twk-close">No false promises. Just the work.</p>
        <p className="twk-sig">— Cody, Founder</p>
      </section>

      {/* 7. Closing CTAs */}
      <section className="twk-closing">
        <p className="tvm-eyebrow">Stay close</p>
        <h2>Want to follow as it ships?</h2>
        <div className="twk-cta-row">
          <button type="button" className="tvm-pill-primary" onClick={scrollToNetwork}>Join the network <Icon name="arrowRight" /></button>
          <a className="tvm-pill-secondary" href={wa(WA_FOUNDER, "Bula Cody, I'd like to understand more about where Teivaka is.")} target="_blank" rel="noopener noreferrer">Talk to Cody on WhatsApp <Icon name="arrowRight" /></a>
        </div>
      </section>

      {/* 8. Network signup (scroll target for Section 7 primary CTA) */}
      <div id="network">
        <NetworkSignup />
      </div>
    </main>
  );
}

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
      <a href="https://mail.google.com/mail/?view=cm&fs=1&to=founder@teivaka.com" target="_blank" rel="noopener noreferrer" style={emailBtnStyle}>
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

  // Our Farms gets a bespoke card+modal layout instead of the sections loop.
  // Shares the marketing shell (Header + footer); PAGE_CONTENT["our-farms"]
  // remains as the fallback data block.
  if (pageKey === "our-farms" || pageKey === "farms") {
    return (
      <div style={shellStyle}>
        <Header navigate={navigate} />
        <OurFarmsPage navigate={navigate} />
        <TeivakaFooter navigate={navigate} copyEmail={copyEmail} openGmail={openGmail} emailCopied={emailCopied} />
      </div>
    );
  }

  // ── Full-rebuild pages (each shares the shell; each embeds <NetworkSignup />) ──
  const REBUILT_PAGES = {
    about: AboutPage,
    tfos: TFOSPage,
    tis: TISPage,
    partner: PartnerPage,
    pricing: PricingPage,
    contact: ContactPage,
    "the-work": TheWorkPage,
  };
  const RebuiltPage = REBUILT_PAGES[pageKey];
  if (RebuiltPage) {
    return (
      <div style={shellStyle}>
        <Header navigate={navigate} />
        <RebuiltPage navigate={navigate} />
        <TeivakaFooter navigate={navigate} copyEmail={copyEmail} openGmail={openGmail} emailCopied={emailCopied} />
      </div>
    );
  }

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
                <p>Teivaka Intelligent System — the live pillar of TAE — turns Fiji's field-tested production systems into operational guidance on WhatsApp today, in the farmer's own language. No app to download.</p>
              </div>
              <div className="wwd-card">
                <div className="wwd-lt">Layer 03</div>
                <h3>TAE — Platform</h3>
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
          <a href="#" onClick={go("/tis-public")} style={navLinkStyle}>TIS</a>
          <a href="#" onClick={go("/tfos")} style={navLinkStyle}>TAE</a>
          <a href="#" onClick={go("/the-work")} style={navLinkStyle}>The Work</a>
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
.tvf-footer .tvf-col a.tvf-thework{color:#C9DFB0;font-weight:500}
.tvf-footer .tvf-col a.tvf-thework:hover{color:#E0EFCB}
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
            <a href="#" className="tvf-thework" onClick={go("/the-work")}>The Work</a>
            <a href="#" onClick={go("/what-we-do")}>What We Do</a>
            <a href="#" onClick={go("/team")}>Team</a>
          </div>
          <div className="tvf-col">
            <h4>Platform</h4>
            <a href="#" onClick={go("/tis-public")}>TIS</a>
            <a href="#" onClick={go("/tfos")}>TAE</a>
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
  maxWidth: 1200,
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
  maxWidth: 760,
  margin: "0 0 14px 0",
  color: COLORS.ink,
};

const ulStyle = {
  maxWidth: 760,
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

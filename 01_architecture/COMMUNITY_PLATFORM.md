# TFOS Community Platform — Architecture and Design

## 1. Vision: Pacific Islands Farmer Marketplace

The Teivaka Community Platform is a farmer-to-farmer and farmer-to-buyer marketplace built into the TFOS product. It addresses a structural gap in Fiji's agricultural economy: farmers in Serua, Ba, Nadroga, and outer islands have no efficient mechanism to discover buyers, compare market prices, or share agronomic knowledge with peers.

**Phase 1 (current): Fiji-only**

The Phase 1 Community Platform is scoped exclusively to Fiji. It is integrated within the TFOS application — every farmer who signs up for Teivaka automatically has access to the Community Platform. There is no separate registration. The platform uses TFOS authentication and tenant data.

**Core design principles:**
- Zero new accounts: existing TFOS login grants community access
- Transparent pricing: all market price data is visible to all farmers
- WhatsApp-first: no in-app payments or messaging in Phase 1 — buyers contact farmers directly via WhatsApp
- Moderated knowledge: posts require review before appearing to prevent misinformation
- Island-aware: all listings and posts tagged with island for geographic filtering

**Problem being solved:**
A Kadavu farmer growing dalo has no way to know that Suva resort hotels are paying FJD 2.80/kg while Suva Municipal Market vendors are only offering FJD 1.80/kg. A Serua tomato farmer overproduced this season and cannot find buyers beyond their regular vendor. A first-year farmer in Ba wants to know what pest is destroying their eggplant shoots. The Community Platform solves all three with a single integrated system.

---

## 2. Four Core Features

### Feature 1: Produce Listings

Farmers publish what they have available — crop type, quantity, grade, island, price, and WhatsApp contact. Buyers (hotels, supermarkets, market vendors) browse listings to discover new suppliers.

**What a listing contains:**
- Crop name and variety (linked to shared.productions)
- Quantity available in kg
- Price per kg (or "negotiable")
- Grade (A, B, C, Organic)
- Island and pickup location
- Available from/until dates
- WhatsApp contact number
- Optional photos

**Listing lifecycle:**
1. Farmer creates listing (requires BASIC+ subscription)
2. Listing appears immediately as ACTIVE (no moderation for listings — commercial data)
3. Listing auto-expires at `available_until` date
4. Farmer manually closes listing when sold out
5. Old listings (>30 days, no activity) auto-archived to ARCHIVED status

### Feature 2: Buyer Discovery (Market Price Reports)

Farmers and buyers submit crowdsourced market price observations. "I saw tomatoes selling at FJD 3.50/kg at Suva Municipal Market today." These observations are aggregated by week and island to give a real-time price intelligence feed.

Price reports require validation by a Teivaka FOUNDER before appearing in aggregates. This prevents price manipulation and ensures data quality. Validated reports feed the `community.market_price_reports` table.

The price intelligence is directly integrated with TIS: when a farmer asks "What should I sell my tomatoes for?", TIS queries the last 30 days of market price observations for their island alongside their CoKG to give a profit-margin-aware recommendation.

### Feature 3: Knowledge Feed

A moderated social feed where farmers share: growing tips, success stories, questions, pest alerts, and weather observations. This is not a general social network — all posts must be tagged to a crop type or farming topic.

**Post types:**
- `KNOWLEDGE`: Tips, techniques, recommendations ("I found that raising nursery beds 40cm prevents Phytophthora in Serua clay")
- `QUESTION`: Farmer seeking help ("My tomato leaves have brown spots with yellow halo — what is this?")
- `WEATHER_REPORT`: Hyperlocal weather observation ("Heavy rain past 3 days in Kadavu — streams flooding, check dalo paddocks")
- `SUCCESS_STORY`: Performance highlights ("Got FJD 3.20/kg for tomatoes at Nadi hotel this week — record high")

All posts go through moderation (PENDING_REVIEW → APPROVED or REJECTED). The moderation workflow is described in Section 8.

### Feature 4: Weather Feed

Farmers can log their local weather observations in TFOS (via the `/weather` endpoint). These observations are optionally shared to the Community weather feed for their island. This creates a distributed hyperlocal weather network — far more granular than BOM or NIWA weather data, which has limited stations in Fiji's outer islands.

The Community weather feed shows recent observations by island, helping farmers in adjacent areas make planting and spray decisions: "Kadavu recorded 80mm rainfall in 48 hours — do not spray fungicides, fields too wet."

---

## 3. Full SQL for Community Tables

```sql
-- Run after 01_shared_schema.sql and 02_tenant_schema.sql
-- Community schema: shared across all tenants

CREATE SCHEMA IF NOT EXISTS community;

-- Produce availability listings
CREATE TABLE IF NOT EXISTS community.listings (
    listing_id              VARCHAR(20) PRIMARY KEY,
    tenant_id               UUID NOT NULL REFERENCES tenant.tenants(tenant_id),
    farm_id                 VARCHAR(30) NOT NULL,
    production_id           VARCHAR(20) REFERENCES shared.productions(production_id),
    listing_title           VARCHAR(200) NOT NULL,
    listing_description     TEXT,
    quantity_available_kg   NUMERIC(10,2),
    price_per_kg_fjd        NUMERIC(8,2),
    negotiable              BOOLEAN DEFAULT true,
    grade                   VARCHAR(20) DEFAULT 'A' CHECK (grade IN ('A', 'B', 'C', 'ORGANIC', 'MIXED')),
    island                  VARCHAR(50) NOT NULL,
    pickup_location         VARCHAR(200),
    available_from          TIMESTAMPTZ,
    available_until         TIMESTAMPTZ,
    contact_whatsapp        VARCHAR(20),
    photos                  TEXT[],
    notes                   TEXT,
    listing_status          VARCHAR(20) DEFAULT 'ACTIVE' CHECK (listing_status IN ('ACTIVE', 'SOLD', 'CLOSED', 'ARCHIVED', 'EXPIRED')),
    view_count              INTEGER DEFAULT 0,
    inquiry_count           INTEGER DEFAULT 0,
    created_by              UUID NOT NULL,
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_community_listings_production ON community.listings(production_id);
CREATE INDEX idx_community_listings_island ON community.listings(island);
CREATE INDEX idx_community_listings_status ON community.listings(listing_status);
CREATE INDEX idx_community_listings_created ON community.listings(created_at DESC);

-- Knowledge feed posts
CREATE TABLE IF NOT EXISTS community.posts (
    post_id                 VARCHAR(20) PRIMARY KEY,
    tenant_id               UUID NOT NULL REFERENCES tenant.tenants(tenant_id),
    post_type               VARCHAR(30) NOT NULL CHECK (post_type IN ('KNOWLEDGE', 'QUESTION', 'WEATHER_REPORT', 'SUCCESS_STORY')),
    title                   VARCHAR(300) NOT NULL,
    body                    TEXT NOT NULL,
    production_id           VARCHAR(20) REFERENCES shared.productions(production_id),
    island                  VARCHAR(50),
    photos                  TEXT[],
    tags                    TEXT[],
    upvotes                 INTEGER DEFAULT 0,
    moderation_status       VARCHAR(20) DEFAULT 'PENDING_REVIEW' CHECK (moderation_status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'FLAGGED')),
    moderation_notes        TEXT,
    moderated_by            UUID REFERENCES tenant.users(user_id),
    moderated_at            TIMESTAMPTZ,
    created_by              UUID NOT NULL,
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_community_posts_type ON community.posts(post_type);
CREATE INDEX idx_community_posts_production ON community.posts(production_id);
CREATE INDEX idx_community_posts_island ON community.posts(island);
CREATE INDEX idx_community_posts_status ON community.posts(moderation_status);
CREATE INDEX idx_community_posts_created ON community.posts(created_at DESC);

-- Post comments
CREATE TABLE IF NOT EXISTS community.post_comments (
    comment_id              VARCHAR(20) PRIMARY KEY,
    post_id                 VARCHAR(20) NOT NULL REFERENCES community.posts(post_id),
    tenant_id               UUID NOT NULL REFERENCES tenant.tenants(tenant_id),
    body                    TEXT NOT NULL,
    moderation_status       VARCHAR(20) DEFAULT 'PENDING_REVIEW',
    upvotes                 INTEGER DEFAULT 0,
    created_by              UUID NOT NULL,
    created_at              TIMESTAMPTZ DEFAULT now()
);

-- Crowdsourced market price reports
CREATE TABLE IF NOT EXISTS community.market_price_reports (
    report_id               VARCHAR(20) PRIMARY KEY,
    tenant_id               UUID NOT NULL REFERENCES tenant.tenants(tenant_id),
    reporter_user_id        UUID NOT NULL REFERENCES tenant.users(user_id),
    production_id           VARCHAR(20) NOT NULL REFERENCES shared.productions(production_id),
    market_name             VARCHAR(100) NOT NULL,
    island                  VARCHAR(50) NOT NULL,
    grade                   VARCHAR(20) DEFAULT 'A',
    price_per_kg_fjd        NUMERIC(8,2) NOT NULL,
    quantity_seen_kg        NUMERIC(10,2),
    observation_date        TIMESTAMPTZ NOT NULL,
    source                  VARCHAR(30) DEFAULT 'FARMER_REPORT' CHECK (source IN ('FARMER_REPORT', 'BUYER_REPORT', 'MINISTRY_DATA', 'TEIVAKA_TEAM')),
    notes                   TEXT,
    is_validated            BOOLEAN DEFAULT false,
    validated_by            UUID REFERENCES tenant.users(user_id),
    validated_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mpr_production ON community.market_price_reports(production_id);
CREATE INDEX idx_mpr_island ON community.market_price_reports(island);
CREATE INDEX idx_mpr_observation ON community.market_price_reports(observation_date DESC);
CREATE INDEX idx_mpr_validated ON community.market_price_reports(is_validated);

-- Post upvotes (to prevent double-voting)
CREATE TABLE IF NOT EXISTS community.post_upvotes (
    post_id                 VARCHAR(20) NOT NULL REFERENCES community.posts(post_id),
    user_id                 UUID NOT NULL REFERENCES tenant.users(user_id),
    created_at              TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);

-- Listing inquiries log (WhatsApp contact clicks tracked)
CREATE TABLE IF NOT EXISTS community.listing_inquiries (
    inquiry_id              VARCHAR(20) PRIMARY KEY,
    listing_id              VARCHAR(20) NOT NULL REFERENCES community.listings(listing_id),
    inquirer_tenant_id      UUID,
    contact_method          VARCHAR(20) DEFAULT 'WHATSAPP',
    created_at              TIMESTAMPTZ DEFAULT now()
);
```

---

## 4. API Endpoints Specification

All endpoints are implemented in `app/routers/community.py` and `app/routers/marketplace.py`.

### Community Endpoints

| Method | Path | Auth Required | Description |
|---|---|---|---|
| GET | `/community/listings` | No | List active produce listings. Filter by `production_id`, `island`, `grade`. Public endpoint. |
| POST | `/community/listings` | Yes (BASIC+) | Create a produce listing. Validates subscription tier. |
| PATCH | `/community/listings/{listing_id}/close` | Yes (owner) | Close a listing (mark as SOLD or CLOSED). |
| GET | `/community/posts` | No | List approved knowledge feed posts. Filter by `post_type`, `production_id`, `island`. |
| POST | `/community/posts` | Yes (BASIC+) | Submit a knowledge post. Goes to PENDING_REVIEW. |

### Marketplace Endpoints

| Method | Path | Auth Required | Description |
|---|---|---|---|
| GET | `/marketplace/market-prices/{production_id}` | Yes | Get validated price observations for a crop. Filter by `island`, `days`. Returns stats (min/max/avg). |
| POST | `/marketplace/market-prices` | Yes | Submit a market price observation. Validated by FOUNDER before appearing in aggregates. |
| GET | `/marketplace/market-prices/{production_id}/trend` | Yes | Weekly average price trend for the last N days. Useful for TIS price recommendations. |

### Request/Response Examples

**GET /community/listings?island=Kadavu&production_id=CRP-DAL**
```json
{
  "data": [
    {
      "listing_id": "LST-A1B2C3",
      "listing_title": "Fresh Dalo — Kadavu Dryland",
      "production_name": "Dalo (Taro)",
      "quantity_available_kg": 400.00,
      "price_per_kg_fjd": 1.80,
      "negotiable": true,
      "grade": "A",
      "island": "Kadavu",
      "pickup_location": "Vunisea Jetty",
      "contact_whatsapp": "+679812XXXX",
      "available_until": "2026-04-30T00:00:00Z",
      "listing_status": "ACTIVE"
    }
  ]
}
```

**POST /marketplace/market-prices**
```json
{
  "production_id": "CRP-TOM",
  "market_name": "Suva Municipal Market",
  "island": "Viti Levu",
  "grade": "A",
  "price_per_kg_fjd": 3.20,
  "quantity_seen_kg": 500,
  "observation_date": "2026-04-07T08:00:00Z",
  "source": "FARMER_REPORT"
}
```

---

## 5. Phase 1 Limitations

The following features are intentionally excluded from Phase 1 based on technical complexity, regulatory requirements, and the Pacific agricultural market context.

**No In-App Payments:** All transactions between farmers and buyers happen outside TFOS. The Community Platform facilitates discovery and contact only. Buyers contact farmers via WhatsApp. This is intentional — Fiji's informal agricultural market operates on trust, personal relationships, and cash. Introducing online payments in Phase 1 creates compliance burden (FNPF, FRA, Fiji Financial Intelligence Unit reporting) and UX friction for farmers who are not accustomed to digital payments.

**No In-App Messaging:** Farmers and buyers communicate via WhatsApp directly. The listing shows the farmer's WhatsApp number. TFOS tracks "inquiry clicks" (when a buyer taps the WhatsApp contact button) for analytics, but does not broker the conversation.

**No Payment Escrow:** Because there are no in-app payments, there is no need for dispute resolution, escrow, or refund mechanisms. Farmers and buyers agree on terms independently.

**No Buyer Registration:** Buyers (hotels, supermarkets, market vendors) do not need a TFOS account to browse listings in Phase 1. The listing page is publicly accessible without authentication. This maximizes reach for farmer listings while keeping the system simple.

**No Delivery Arrangement:** TFOS does not arrange transportation in Phase 1. Farmers and buyers agree on pickup/delivery terms via WhatsApp.

**Fiji-Only Content:** All listings and posts are Fiji-specific. No cross-country marketplace in Phase 1.

---

## 6. Phase 2 Roadmap

Phase 2 targets 18–24 months post-Phase 1 launch, subject to user adoption metrics and funding.

### FijiPay and M-PAiSA Integration
The two dominant mobile money platforms in Fiji — FijiPay (Post Fiji) and M-PAiSA (Vodafone Fiji) — will be integrated as payment methods. A farmer can receive payment directly to their M-PAiSA wallet when a buyer confirms order. This solves the trust problem: payment is released when buyer confirms receipt, protecting both parties.

Implementation requires:
- Partnership agreement with Vodafone Fiji (M-PAiSA API) and Post Fiji (FijiPay API)
- Integration with Fiji Financial Intelligence Unit (FIU) for KYC requirements
- Escrow wallet management

### Multi-Currency Support
Phase 2 will support FJD (primary), AUD (for New Zealand/Australia-based buyers), and USD (for export trade). Currency conversion at moment of transaction using Reserve Bank of Fiji exchange rates.

### In-App Chat
Replace WhatsApp contact with native in-app messaging. This allows TFOS to:
- Keep a record of buyer-seller communications
- Facilitate TIS-assisted negotiations ("Is this a fair price for tomatoes?")
- Provide dispute resolution evidence

Technical requirement: WebSocket server (FastAPI WebSocket or separate chat microservice), message encryption at rest.

### Multi-Island Supply Chain Coordination
Phase 2 will allow buyers (e.g. a Nadi resort) to place standing orders that are fulfilled by a coordinated network of island farms. A Kadavu dalo farmer, a Taveuni ginger farmer, and a Serua tomato farmer all contribute to a single weekly resort order. TFOS manages the aggregation, delivery coordination, and payment split.

### Buyer Accounts and Verified Buyer Badges
Hotels, supermarkets, and export agents register as verified buyers. Verified buyers see advanced listing data (historical supply volumes, farm certification status, compliance score). Farmers see verified buyer badge and buyer credit rating.

---

## 7. Community Integration with TFOS

The Community Platform is not a separate product — it is fully integrated with TFOS tenant data.

### Shared Authentication
The Community Platform uses the same JWT tokens as the core TFOS application. There is no separate login. The `subscription_tier` field in the JWT payload determines Community access level:
- `FREE`: Can view listings and posts (read-only community access)
- `BASIC`, `PROFESSIONAL`, `ENTERPRISE`: Can create listings, posts, and price reports

### Listing Data from TFOS
When a farmer creates a produce listing, the listing form pre-fills from TFOS data:
- Available crops: pulled from active cycles (`tenant.cycles WHERE cycle_status = 'HARVESTING'`)
- Island and pickup location: pulled from farm profile (`tenant.farms.island`, `tenant.farms.address`)
- Suggested price: populated from price_master (`shared.price_master WHERE production_id = X`)
- Estimated quantity: from the cycle's projected harvest weight (if logged)

This means creating a listing takes 30 seconds for a logged-in farmer — not 5 minutes of manual entry.

### Price Intelligence in TIS
The TIS system queries `community.market_price_reports` when answering pricing questions:

```python
# In tis_service.py — price context enrichment
async def get_price_context(production_id: str, island: str, session: AsyncSession) -> dict:
    result = await session.execute(text("""
        SELECT
            ROUND(AVG(price_per_kg_fjd)::numeric, 2) AS avg_market_price,
            MIN(price_per_kg_fjd) AS min_price,
            MAX(price_per_kg_fjd) AS max_price,
            COUNT(*) AS observation_count,
            MAX(observation_date) AS latest_observation
        FROM community.market_price_reports
        WHERE production_id = :pid
          AND island = :island
          AND observation_date >= now() - interval '30 days'
          AND is_validated = true
    """), {"pid": production_id, "island": island})
    return dict(result.mappings().first() or {})
```

TIS uses this data in the system prompt context: "Current market price for tomatoes on Viti Levu: avg FJD 3.10/kg (last 30 days, 12 observations)."

### CoKG + Market Price = Profit Guidance
When a farmer asks TIS "Should I sell my tomatoes now?", TIS combines:
1. Farm's current tomato CoKG (from `financials` endpoint)
2. Current market price (from `community.market_price_reports`)
3. Cycle days remaining and harvest window (from `cycles` data)

Response: "Your tomato CoKG this cycle is FJD 2.10/kg. Current Suva market average is FJD 3.20/kg — a margin of FJD 1.10/kg. Based on your cycle timeline, you have 10 days of harvest window. Consider selling 40% now at current prices and waiting to see if prices improve mid-week."

---

## 8. Moderation Workflow for Knowledge Posts

All community posts require moderation before appearing in the public Knowledge Feed. This prevents spread of agronomically harmful advice (e.g. incorrect pesticide recommendations), spam, and inappropriate content.

### Moderation States

```
PENDING_REVIEW → APPROVED (appears in feed)
PENDING_REVIEW → REJECTED (farmer notified, can resubmit)
APPROVED → FLAGGED (community report triggers review)
FLAGGED → APPROVED (flag dismissed by moderator)
FLAGGED → REJECTED (post removed)
```

### Moderation Queue

Teivaka FOUNDER role users see a moderation dashboard showing all `PENDING_REVIEW` posts. The dashboard displays:
- Post content and author (anonymized to "Farmer, [Island]" for reviewers to reduce bias)
- Crop tag and post type
- Any similar existing posts (to detect duplicates)
- Quick action buttons: APPROVE, REJECT, REQUEST_EDIT

### Moderation Guidelines

**Auto-approve categories (future Phase 2 feature):**
- Weather reports with numerical data (rainfall mm, temp °C) — factual, low misinformation risk
- SUCCESS_STORY posts tagged to production + containing price per kg — verifiable data

**Require human review:**
- KNOWLEDGE posts with pesticide recommendations (check against registered Fiji pesticide list)
- QUESTION posts (approve for community engagement)
- Posts flagged by 3+ community members

**Reject criteria:**
- Pesticide recommendations for unregistered products
- Claims about specific buyer names/prices without verification
- Duplicate posts (same farmer, same content within 7 days)
- Promotional content from agri-input suppliers (conflict of interest)
- Content promoting illegal chemical imports

### Moderator Response Time SLA
- BASIC subscription farmer posts: reviewed within 48 hours
- PROFESSIONAL/ENTERPRISE subscription farmer posts: reviewed within 12 hours
- Flagged posts (community report): reviewed within 4 hours

### Notification on Moderation Decision
When a post is approved or rejected, the submitting farmer receives a WhatsApp notification via the TIS notification service:
- **Approved**: "Your post '[Title]' has been approved and is now visible in the Community Knowledge Feed."
- **Rejected**: "Your post '[Title]' was not approved. Reason: [moderation_notes]. You may resubmit with corrections."

The `moderation_notes` field is always required when rejecting — moderators cannot reject without explaining why.

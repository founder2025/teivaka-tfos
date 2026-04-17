# FILE: 09_knowledge_base/TIS_KNOWLEDGE_BASE_ARCHITECTURE.md

# Teivaka Intelligence System (TIS) — Knowledge Base Architecture
**System:** TIS Knowledge Broker + EdTech Layer
**Schema:** shared.kb_articles, shared.kb_stage_links
**AI Stack:** Claude API (claude-sonnet-4-20250514) + OpenAI text-embedding-3-small + pgvector
**Last Updated:** 2026-04-07

---

## Overview

The Teivaka Intelligence System (TIS) has three modules:
1. **Knowledge Broker** — answers crop management questions from the KB (this document)
2. **Command Executor** — executes structured commands (LOG_HARVEST, CHECK_FINANCIALS, etc.)
3. **Analytics Advisor** — interprets Decision Engine signals and suggests actions

This document covers the Knowledge Broker and the KB content architecture that backs it. The KB is an expert-validated, RAG-powered library of agricultural protocols for all 49 Teivaka productions, linked directly to the TFOS production stage system.

**Core design principle:** TIS does NOT answer agricultural questions from Claude's general training knowledge. All crop management responses must be sourced from `shared.kb_articles` (expert-validated, Fiji-specific content). If the KB does not have a relevant article (cosine similarity < 0.65), TIS responds: "I don't have a specific protocol for that in our knowledge base yet. Ask Cody or contact the agriculture extension office."

This constraint is enforced in code — not just by prompt engineering. The hard cosine threshold (0.65) makes it a programmatic guardrail, not a soft suggestion.

---

## Section 1 — KB Schema

### Table: shared.kb_articles

```sql
CREATE TABLE shared.kb_articles (
  article_id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Production linkage (nullable — allows general articles not tied to a specific crop)
  production_id     VARCHAR(10) REFERENCES shared.productions(production_id) ON DELETE SET NULL,

  -- Stage linkage (nullable — some articles are general, not stage-specific)
  stage_id          INTEGER REFERENCES shared.production_stages(stage_id) ON DELETE SET NULL,

  -- Article classification
  article_type      VARCHAR(30) NOT NULL
    CHECK (article_type IN (
      'crop_guide',         -- General growing guide for the production
      'pest_guide',         -- Specific pest identification and management
      'disease_guide',      -- Specific disease identification and management
      'fertilization_guide', -- Nutrient management protocol
      'harvest_guide',      -- Harvest timing, grading, post-harvest handling
      'post_harvest',       -- Storage, transport, market preparation
      'general'             -- KB articles not tied to a specific crop or stage
    )),

  -- Content
  title             VARCHAR(255) NOT NULL,
  content_md        TEXT NOT NULL,             -- Full markdown content (no length limit)
  content_summary   VARCHAR(500) NOT NULL,     -- ≤500 chars, used for RAG retrieval display

  -- Vector embedding (OpenAI text-embedding-3-small, 1536 dimensions)
  embedding_vector  vector(1536),              -- NULL until generate-embedding endpoint called

  -- Validation and publishing
  validated_by      VARCHAR(100),              -- Expert name (e.g., "Dr. Jone Dakuvula, MoA Fiji")
  validated_date    DATE,
  published         BOOLEAN NOT NULL DEFAULT false,  -- Must be true to serve in TIS
  review_notes      TEXT,                      -- Internal notes from expert reviewer

  -- Audit
  created_by        UUID,                      -- Staff member who created draft
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Partial index: only index published articles with embeddings (for performance)
CREATE INDEX kb_articles_published_idx
  ON shared.kb_articles (production_id, article_type)
  WHERE published = true;

-- Vector search index (ivfflat for approximate nearest-neighbor search)
-- Build with lists=100 initially (Phase 1, <200 articles)
-- Rebuild with lists=200 at Phase 2 (200-1000 articles)
-- Rebuild with lists=500 at Phase 3 (>1000 articles)
CREATE INDEX kb_articles_embedding_idx
  ON shared.kb_articles
  USING ivfflat (embedding_vector vector_cosine_ops)
  WITH (lists = 100);
-- NOTE: This index requires embedding_vector to be NOT NULL
-- Only run after batch embedding generation (migration step)
```

### Table: shared.kb_stage_links

```sql
CREATE TABLE shared.kb_stage_links (
  link_id     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_id    INTEGER NOT NULL REFERENCES shared.production_stages(stage_id) ON DELETE CASCADE,
  article_id  UUID NOT NULL REFERENCES shared.kb_articles(article_id) ON DELETE CASCADE,

  -- Link classification
  link_type   VARCHAR(20) NOT NULL
    CHECK (link_type IN (
      'primary',        -- The definitive protocol for this stage — one per stage
      'supplementary',  -- Additional reference for this stage (pests, disease, etc.)
      'reference'       -- Background reading — not surfaced automatically, searchable only
    )),

  display_order  INTEGER DEFAULT 0,  -- For ordering supplementary articles
  created_at     TIMESTAMPTZ DEFAULT NOW(),

  -- Enforce one primary article per stage
  UNIQUE (stage_id, link_type) WHERE link_type = 'primary'
);

-- Index for fast stage → article lookup (the GET_PROTOCOL command's core query)
CREATE INDEX kb_stage_links_stage_idx
  ON shared.kb_stage_links (stage_id, link_type);
```

### Table: shared.production_stages (reference)

```sql
-- This table is the source of stage IDs used in kb_stage_links
-- Structure (from 02_database/SCHEMA_OVERVIEW.md):
CREATE TABLE shared.production_stages (
  stage_id          SERIAL PRIMARY KEY,
  production_id     VARCHAR(10) REFERENCES shared.productions(production_id),
  stage_name        VARCHAR(100) NOT NULL,
  stage_order       INTEGER NOT NULL,
  days_from_planting_min  INTEGER,
  days_from_planting_max  INTEGER,
  description       TEXT,
  key_activities    TEXT[]  -- Array of key tasks for this stage
);
-- ~370 rows at seed time (avg ~7.5 stages per production × 49 productions)
```

---

## Section 2 — Stage Link Mechanism: KB↔TFOS Integration

This is the core integration that makes TIS context-aware. When a TFOS farm enters a new production stage, the relevant KB protocol is automatically surfaced — the farmer doesn't have to search for it.

### How It Works

**Step 1 — TFOS records a stage transition:**
```python
# Example: F001-PU002 (CRP-EGG) transitions from 'vegetative' to 'fruiting'
await update_cycle_stage(
    cycle_id="CYC-F001-PU002-001",
    new_stage_id=142,  # CRP-EGG Fruiting stage
    db=db
)
# This emits a stage_transition event (WebSocket or Redis pub/sub)
```

**Step 2 — TIS Knowledge Broker receives the stage change:**
```python
async def on_stage_transition(cycle_id: str, new_stage_id: int, db: AsyncSession):
    # Look up the primary KB article for this stage
    primary_article = await get_primary_article_for_stage(new_stage_id, db)

    if primary_article and primary_article.published:
        # Surface the protocol to the farm dashboard
        await create_kb_surface_notification(
            cycle_id=cycle_id,
            article_id=primary_article.article_id,
            message=f"New protocol available: {primary_article.title}",
            db=db
        )
```

**Step 3 — GET_PROTOCOL TIS Command:**
```python
# When farmer asks: "What should I do now on PU002?"
# Or uses TIS command: GET_PROTOCOL PU002
async def execute_get_protocol(pu_id: str, db: AsyncSession) -> str:
    # Get current cycle and stage for this PU
    current_cycle = await get_active_cycle(pu_id, db)
    current_stage_id = current_cycle.current_stage_id

    # Look up primary article via stage link
    article = await db.execute(
        select(KbArticle)
        .join(KbStageLink, KbArticle.article_id == KbStageLink.article_id)
        .where(
            KbStageLink.stage_id == current_stage_id,
            KbStageLink.link_type == 'primary',
            KbArticle.published == True
        )
    )

    if not article:
        return f"No protocol available for current stage of {current_cycle.production_name}. " \
               f"Contact Cody or agriculture extension for guidance."

    # Format article for TIS response
    return format_kb_response(article, include_source_citation=True)
```

### Stage Link Population Example

For CRP-EGG (Eggplant), the stage link table would have entries like:

| stage_id | stage_name | link_type | article_title |
|----------|-----------|-----------|---------------|
| 138 | Seedbed Preparation | primary | Eggplant Seedbed Preparation Protocol — Fiji |
| 139 | Nursery | primary | Eggplant Nursery Management — Fiji Conditions |
| 140 | Transplanting | primary | Eggplant Transplanting Guide — Spacing and Hardening |
| 141 | Vegetative Growth | primary | Eggplant Vegetative Stage — Fertilization and Pest Control |
| 141 | Vegetative Growth | supplementary | Eggplant Fruit Borer (Leucinodes orbonalis) — ID and Control |
| 141 | Vegetative Growth | supplementary | NPK Fertilization Schedule — Eggplant, Fiji Conditions |
| 142 | Fruiting | primary | Eggplant Fruiting Stage — Fruit Set, Irrigation, and Monitoring |
| 143 | Harvesting | primary | Eggplant Harvest — Grading, Timing, and Market Preparation |
| 143 | Harvesting | supplementary | Post-Harvest Handling of Eggplant for Suva Municipal Market |
| 144 | Post-Harvest Rest | primary | Eggplant PU Rest Period — Soil Management Before Next Cycle |

---

## Section 3 — RAG Implementation Details

### Embedding Generation

**Model:** OpenAI `text-embedding-3-small`
- Dimensions: 1,536
- Cost: $0.02 per 1 million tokens (~$0.02 to embed all Phase 1 articles)
- Speed: fast (100-500ms per article)

**When to generate embeddings:**

1. **On article publish** (real-time):
```python
@router.post("/knowledge/articles/{article_id}/publish")
async def publish_article(article_id: UUID, db: AsyncSession):
    article = await get_article(article_id, db)
    # Generate embedding from title + content_summary + content_md[:1000]
    embedding_text = f"{article.title}\n{article.content_summary}\n{article.content_md[:1000]}"
    embedding = await generate_embedding(embedding_text)
    await update_article_embedding(article_id, embedding, db)
    await set_published(article_id, True, db)
```

2. **Batch embedding** (migration / re-embed):
```python
# migration_scripts/generate_embeddings.py
async def batch_generate_embeddings():
    articles = await get_articles_without_embeddings()
    for article in articles:
        embedding_text = f"{article.title}\n{article.content_summary}\n{article.content_md[:1000]}"
        embedding = await generate_embedding(embedding_text)
        await update_article_embedding(article.article_id, embedding)
        await asyncio.sleep(0.1)  # Rate limit: 10 requests/second
    print(f"Embedded {len(articles)} articles.")
```

**Embedding text composition:** Title + summary + first 1,000 chars of content. This gives the embedding model enough context to understand the article's topic without being overwhelmed by full markdown content. The summary (≤500 chars) is crafted specifically to be semantically rich.

### Vector Search Query

The core RAG retrieval query used by TIS Knowledge Broker:

```sql
-- Full RAG search with cosine similarity
SELECT
  article_id,
  title,
  content_summary,
  content_md,
  production_id,
  stage_id,
  article_type,
  validated_by,
  validated_date,
  1 - (embedding_vector <=> $1::vector) AS cosine_similarity
FROM shared.kb_articles
WHERE published = true
  AND embedding_vector IS NOT NULL
ORDER BY cosine_similarity DESC
LIMIT 3;

-- $1 = the query_vector (user's question embedded with same model)
```

**Python implementation:**
```python
async def search_kb(query: str, db: AsyncSession, top_k: int = 3) -> List[KbSearchResult]:
    # Step 1: Embed the user's query
    query_vector = await generate_embedding(query)

    # Step 2: Vector search
    results = await db.execute(
        text("""
            SELECT article_id, title, content_summary, content_md,
                   production_id, stage_id, article_type,
                   validated_by, validated_date,
                   1 - (embedding_vector <=> :query_vector::vector) AS cosine_similarity
            FROM shared.kb_articles
            WHERE published = true
              AND embedding_vector IS NOT NULL
            ORDER BY cosine_similarity DESC
            LIMIT :top_k
        """),
        {"query_vector": query_vector, "top_k": top_k}
    )

    # Step 3: Apply confidence threshold
    articles = results.fetchall()
    if not articles or articles[0].cosine_similarity < 0.65:
        return []  # Hard constraint: no results below threshold

    return [KbSearchResult(**row) for row in articles if row.cosine_similarity >= 0.65]
```

### Confidence Threshold Enforcement

```python
COSINE_SIMILARITY_THRESHOLD = 0.65  # Hard constraint — never lower this without expert review

async def knowledge_broker_respond(query: str, db: AsyncSession) -> TISResponse:
    search_results = await search_kb(query, db)

    if not search_results:
        # Hard "not found" response — do NOT use Claude's general knowledge
        return TISResponse(
            answer="I don't have a specific protocol for that in our knowledge base yet. "
                   "For crop-specific guidance, contact the Fiji Ministry of Agriculture "
                   "extension office or ask Cody directly.",
            source="NOT_FOUND",
            confidence=None,
            articles_cited=[]
        )

    # Build context from top results
    context = "\n\n---\n\n".join([
        f"ARTICLE: {r.title}\nSOURCE: KB-{r.article_id[:8]}\nVALIDATED BY: {r.validated_by}\n\n{r.content_md}"
        for r in search_results
    ])

    # Now call Claude with only KB content as context
    claude_prompt = f"""You are TIS, the Teivaka farm intelligence assistant.
Answer the farmer's question using ONLY the knowledge base articles provided below.
Do not add information from outside these articles. Cite the article title in your response.
If the articles do not directly answer the question, say so clearly.

KNOWLEDGE BASE ARTICLES:
{context}

FARMER'S QUESTION: {query}

Answer (in simple, clear English suitable for a field worker):"""

    response = await claude_client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=500,
        messages=[{"role": "user", "content": claude_prompt}]
    )

    return TISResponse(
        answer=response.content[0].text,
        source="KB",
        confidence=search_results[0].cosine_similarity,
        articles_cited=[r.article_id for r in search_results]
    )
```

### ivfflat Index Sizing Guide

| Phase | KB Article Count | Recommended lists | Rebuild Command |
|-------|-----------------|-------------------|-----------------|
| 1 | < 200 | 100 | `CREATE INDEX ... WITH (lists = 100)` |
| 2 | 200–1,000 | 200 | `DROP INDEX; CREATE INDEX ... WITH (lists = 200)` |
| 3 | 1,000–5,000 | 500 | `DROP INDEX; CREATE INDEX ... WITH (lists = 500)` |
| 4 | > 5,000 | Consider HNSW | `CREATE INDEX ... USING hnsw (vector_cosine_ops)` |

The ivfflat index requires training data. Build it AFTER at least 100 articles are embedded:
```sql
-- Only run after sufficient articles are embedded
CREATE INDEX kb_articles_embedding_idx
ON shared.kb_articles
USING ivfflat (embedding_vector vector_cosine_ops)
WITH (lists = 100);

-- Set ivfflat probe count for query accuracy/speed tradeoff
-- (10% of lists is a good default)
SET ivfflat.probes = 10;
```

---

## Section 4 — Content Validation Workflow

### Who Creates KB Content

KB content in Teivaka is a curated expert resource — not crowdsourced, not generated by AI alone.

**Content creation flow:**
```
1. Identify knowledge gap
   (from: unanswered TIS queries, new crop added, stage protocol missing)
        │
2. Draft created by: Teivaka agronomy team
   (Cody + contracted agronomist)
   published = false → article not visible to farmers yet
        │
3. Expert review
   (Fiji Ministry of Agriculture, SPC Pacific Community, or USP agriculture faculty)
   Reviewer edits content_md, adds review_notes, confirms accuracy
        │
4. Mark validated_by = "[Reviewer Name], [Institution]"
   Set validated_date = review date
        │
5. Admin publishes: PATCH /knowledge/articles/{id}/publish
   System generates embedding_vector
   published = true → article now served by TIS Knowledge Broker
```

### Publication Rules

| Condition | TIS serves the article? | Notes |
|-----------|------------------------|-------|
| published = false | NO | Draft or under review |
| published = true, embedding_vector IS NULL | NO | Must generate embedding first |
| published = true, embedding_vector IS NOT NULL | YES | Fully live |
| published = true, cosine_similarity < 0.65 | NO | Below confidence threshold for this query |

### Expert Validator Organizations

1. **Fiji Ministry of Agriculture** — Primary validator for all Fiji-specific protocols. Extension officers in Serua Province (close to F001) are accessible.
2. **SPC — Pacific Community** (Noumea, New Caledonia) — Pacific-regional expertise, especially for indigenous crops (kava, taro, breadfruit) and island farming systems.
3. **University of the South Pacific (USP)** — Agriculture faculty in Suva. Strong on research-backed protocols. Good for pest and disease articles.
4. **Independent agronomist consultants** — For urgent content needs when institutional validators are slow. Must be accredited by Fiji Agriculture Ministry.

**No crowdsourced content — ever.** This is a hard rule. Farmer feedback can flag gaps or inaccuracies (→ triggers review), but farmers cannot directly edit or publish articles. The quality of TIS depends entirely on the quality of the KB.

### Article Quality Checklist (Before Publishing)

```
□ Title is specific (e.g., "Eggplant Fruiting Stage — Fertilization, Fiji Conditions"
    NOT "Eggplant Fertilizer Tips")
□ content_summary is ≤ 500 characters and captures the key point of the article
□ content_md uses simple language (Grade 8 reading level — field workers are the audience)
□ All chemical recommendations reference the shared.chemical_library (chemical_id, not free text)
□ Withholding periods are stated explicitly for any chemical mentioned
□ Local Fijian crop names are included where applicable
□ Protocol is validated for Fiji conditions (not just generic tropical farming)
□ validated_by is a named, credentialed expert (not "Teivaka team")
□ validated_date is within the last 2 years
```

---

## Section 5 — KB Content Expansion Roadmap

### Phase 1 — MVP: 49 Articles

One crop guide per production — the minimum viable KB that allows TIS to respond to basic "how do I grow X?" questions for all 49 productions.

**Priority order for Phase 1 article creation:**
1. CRP-EGG (Eggplant) — actively growing at F001-PU002, PU003 — URGENT
2. CRP-CAS (Cassava) — actively growing at F001-PU001 — URGENT
3. FRT-PIN (Pineapple) — actively growing at F002-PU004 — URGENT
4. CRP-KAV (Kava) — actively growing at F002-PU006, PU007 — URGENT
5. LIV-API (Apiculture) — 4 active hives at F001-PU011 — URGENT
6. LIV-GOA (Goat) — 8 goats at F002-PU003 — URGENT
7. Remaining 43 productions — Phase 1 completion target

**Phase 1 article count target: 49 articles**

### Phase 2 — Stage-Specific Protocols: +370 Articles

One article per stage per production. Linked via kb_stage_links with link_type='primary'. This is what enables the stage-aware GET_PROTOCOL command to return specific, actionable instructions for each farming stage.

Average stages per production: ~7.5 (range: 3 for simple crops to 12 for complex perennials)
49 productions × 7.5 average stages = ~370 stage protocol articles

**Phase 2 article count target: 49 + 370 = ~419 articles**

### Phase 3 — Pest and Disease Visual ID Guides: +100 Articles

Articles for the most common Fiji agricultural pests and diseases, with:
- Visual identification criteria (photo descriptions since photos stored in Supabase Storage)
- Damage symptom descriptions
- Integrated pest management (IPM) options
- Registered chemical options (linked to chemical_library)
- Biological control options

**Target pests (43 articles):**
The most economically damaging pests in Fiji: fruit borer, fruit fly, mealybug, whitefly, leaf miner, diamondback moth, red spider mite, thrips, aphids, root-knot nematode, cutworm, armyworm, and Fiji-specific agricultural pests.

**Target diseases (30 articles + more as needed):**
Bacterial wilt, Fusarium wilt, late blight, early blight, powdery mildew, downy mildew, Phytophthora root rot, cassava mosaic virus, taro leaf blight, dasheen mosaic virus, and major fungal diseases.

**Phase 3 article count target: ~519 articles**

### Phase 4 — Video Guides and Market Intelligence

**Video guides (~50 videos):**
Short-form (2–4 minute) field-shot videos demonstrating key practices:
- How to identify fruit borer damage (eggplant)
- How to harvest kava roots correctly
- How to grade eggplant (Grade A vs Grade B vs reject)
- How to inspect a beehive safely
- Voice command demonstration (how to use TIS)

Videos hosted on Supabase Storage (or Cloudflare Stream for global delivery). KB articles link to video metadata but not the binary. The kb_articles table supports this via a `media_urls` JSONB column (add in Phase 4 migration).

**Market intelligence articles (~30 articles):**
Updated quarterly, these articles inform farmers about:
- Current price trends for Fiji's key crops
- Buyer requirements (quality, packaging, volume minimums)
- Export opportunities (kava to USA, premium produce to resort hotels)
- Cooperative marketing options in Fiji

Market data is sourced from the Community platform's price_index table (once Community module is built in Phase 2).

### Article Count Summary

| Phase | New Articles | Cumulative Total | Primary Use |
|-------|-------------|-----------------|-------------|
| 1 | 49 | 49 | Basic crop guides for all 49 productions |
| 2 | ~370 | ~419 | Stage-specific protocols for GET_PROTOCOL command |
| 3 | ~100 | ~519 | Pest/disease ID and management guides |
| 4 | ~80 | ~600 | Video guides + market intelligence |

---

## Section 6 — KB↔Community Feedback Loop

### Unanswered Questions → New Articles

TIS logs all queries that return empty results (cosine_similarity < 0.65) to a `tis_knowledge_gaps` table:

```sql
CREATE TABLE tis_knowledge_gaps (
  gap_id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  farm_id         VARCHAR(10),
  query_text      TEXT NOT NULL,
  query_timestamp TIMESTAMPTZ DEFAULT NOW(),
  production_id   VARCHAR(10),  -- inferred from context if available
  resolved        BOOLEAN DEFAULT false,
  resolved_by_article_id  UUID REFERENCES shared.kb_articles(article_id)
);
```

**Workflow:**
1. Weekly review of tis_knowledge_gaps by Teivaka agronomy team
2. Top repeated unanswered questions → prioritized for new article creation
3. When article is published: resolved = true, resolved_by_article_id = new article

This creates a continuous improvement loop: farmer questions drive KB content, KB content improves TIS answer quality.

### Community Price Index → TIS Financial Responses

When the Community module is built (Phase 2):

```python
# Community platform collects real market prices from buyers and farmers
# These are aggregated into community_price_index table

# TIS CHECK_FINANCIALS command uses this for price recommendations:
async def check_financials(cycle_id: str, db: AsyncSession) -> str:
    # Get current CoKG
    cokg = await get_cycle_cokg(cycle_id, db)

    # Get current market price from Community price index
    market_price = await get_community_price(production_id, db)

    if cokg is None or market_price is None:
        return f"CoKG: FJD{cokg:.2f}/kg. No market price data available yet."

    margin_pct = ((market_price - cokg) / market_price) * 100

    return (f"CoKG: FJD{cokg:.2f}/kg | Market price: FJD{market_price:.2f}/kg | "
            f"Gross margin: {margin_pct:.1f}%. "
            f"{'Healthy margin.' if margin_pct > 40 else 'Low margin — review costs.'}")
```

### Community Buyer Directory → Crop Recommendations

When Community is live, the buyer directory shows which buyers are actively purchasing which crops and at what volumes. TIS can then factor buyer demand into crop rotation recommendations:

```
"Long bean (CRP-LBN) is currently in demand from 3 registered buyers in your region.
 Market price: FJD 2.20/kg. Rotation status from your last eggplant crop: PREF.
 Recommend: start Long Bean on PU002 after 60-day Solanaceae rest period completes."
```

This represents the full integration of KB + Community + TFOS rotation data — the most valuable TIS capability at Phase 2 and beyond.

---

## Section 7 — TIS Knowledge Broker API Endpoints

```
POST /api/v1/tis/chat
  Body: { "message": "string", "farm_id": "string", "pu_id": "string (optional)" }
  Response: { "answer": "string", "source": "KB|NOT_FOUND", "articles_cited": [...] }
  Auth: Bearer JWT (all subscription tiers)
  Rate limit: FREE=5/day, BASIC=20/day, PREMIUM=unlimited

GET /api/v1/tis/protocol/{pu_id}
  Response: Primary KB article for current stage of active cycle on this PU
  Auth: Bearer JWT
  Cache: 1 hour (KB content changes rarely)

GET /api/v1/knowledge/articles
  Query params: production_id, article_type, published
  Response: Paginated list of articles
  Auth: ADMIN only (published=false articles), any (published=true)

GET /api/v1/knowledge/articles/{article_id}
  Response: Full article content
  Auth: Bearer JWT

POST /api/v1/knowledge/articles
  Body: { title, content_md, production_id, stage_id, article_type, ... }
  Response: Created article (published=false)
  Auth: ADMIN only

PATCH /api/v1/knowledge/articles/{article_id}/publish
  Body: { validated_by, validated_date }
  Response: Article with published=true, embedding_vector generated
  Auth: ADMIN only
  Side effect: Generates and stores embedding_vector

POST /api/v1/knowledge/articles/{article_id}/generate-embedding
  Response: Updated article with embedding_vector
  Auth: ADMIN only
  Use: Manual re-embedding (if content updated)

GET /api/v1/knowledge/search
  Query params: q (search query), production_id (filter), top_k (default 3)
  Response: Ranked articles with cosine_similarity
  Auth: Bearer JWT
  Note: Returns empty list if best match < 0.65 cosine similarity
```

---

## Section 8 — Implementation Sequencing

### Build Order (within KB module)

1. **Schema migration:** Create shared.kb_articles and shared.kb_stage_links tables (with indexes)
2. **API CRUD endpoints:** POST/GET/PATCH articles (admin-only)
3. **Embedding generation:** POST /publish endpoint with OpenAI embeddings call
4. **RAG search:** GET /knowledge/search with pgvector cosine search
5. **Knowledge Broker:** POST /tis/chat with hard cosine threshold (0.65)
6. **Stage link mechanism:** kb_stage_links population + GET /tis/protocol/{pu_id}
7. **Rate limiting:** Per-subscription-tier limit on TIS chat endpoint
8. **Knowledge gap logging:** tis_knowledge_gaps table + logging on empty results

### Dependencies

The Knowledge Broker depends on:
- `shared.productions` table populated (49 rows) — required for production_id FK
- `shared.production_stages` table populated (~370 rows) — required for stage_id FK
- OpenAI API key configured in .env (OPENAI_API_KEY)
- pgvector extension installed (`CREATE EXTENSION vector;`)
- At least 1 published article with embedding for TIS to return results

The stage link mechanism additionally depends on:
- `production_cycles.current_stage_id` being maintained correctly as cycles progress
- Stage transition events being published (Redis pub/sub or direct function call)

---

## Section 9 — Security and Privacy Considerations

### Tenant Isolation for KB

`shared.kb_articles` is in the `shared` schema — it is NOT tenant-partitioned. This means all tenants see the same KB content. This is intentional:
- Crop agronomic knowledge is universal — it is not commercially sensitive
- A shared KB is higher quality than per-tenant KB (pooled expert validation effort)
- Farmer queries (tis_conversations, tis_voice_logs) ARE tenant-isolated via RLS

```sql
-- tis_conversations is in the operational schema with RLS
ALTER TABLE tis_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tis_conversations
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### No PII in KB Articles

KB articles MUST NOT contain:
- Farmer names or contact information
- Specific farm names or locations
- Pricing from specific customers
- Financial information

KB articles ARE general protocol documents. If a protocol references "Teivaka farms," that is acceptable for internal Phase 1 articles, but Phase 2 articles should be written for any Fiji farmer (no Teivaka-specific references).

### Embedding Security

The embedding_vector column stores a mathematical representation of the article content. This vector is:
- Not human-readable
- Cannot be used to reconstruct the article text
- Safe to store in the database alongside article content

No special security measures are needed for the embedding_vector column beyond standard DB access controls.

# TIS — Grounded Intelligence Architecture
**Document Type:** Architecture Decision Record + Implementation Specification  
**Supersedes:** The hard "KB-only" constraint in TIS_SPECIFICATION.md Section 3  
**Date:** April 2026  
**Decision Owner:** Uraia Koroi Kama (Cody), Teivaka PTE LTD  
**Status:** ADOPTED — implement this model for Phase 1 MVP  

---

## Why This Document Exists

The original TIS Knowledge Broker design had one hard constraint: **answer only from validated KB articles**. If no validated article existed, TIS returned NOT_FOUND. This was architecturally clean but had a fatal flaw — it made TIS useless at MVP launch because no validated KB articles existed yet, and finding an agronomist validator takes time.

This document replaces that constraint with a better model: **Grounded Intelligence**. TIS now answers every agronomic question using deep, Fiji-specific context that is baked into the system — while KB articles, when they exist, elevate the answer with expert-validated authority.

The result: TIS works on Day 1. It gives answers that pass the "experienced Fiji farmer test." And as KB articles are validated over time, the quality of TIS answers increases automatically — without any architectural rebuild.

---

## The Grounded Intelligence Model

### Core Principle

> TIS does not refuse to answer. TIS answers from the best available source, clearly labeled, every time.

### Three-Layer Knowledge Hierarchy

```
LAYER 1 — VALIDATED KB ARTICLES (Highest Authority)
  ↓ When published KB article exists with cosine similarity ≥ 0.65
  → Answer cites article by name; labeled "Teivaka Validated Protocol"
  → This is the gold standard; build toward this for all 49 productions

LAYER 2 — FIJI AGRICULTURAL INTELLIGENCE (Operating Standard)
  ↓ When no validated KB article exists (or similarity < 0.65)
  → Answer drawn from FIJI_FARM_INTELLIGENCE.md context layer
  → Labeled "Based on Fiji agricultural practice"
  → Covers all 49 productions with Fiji-specific depth from Day 1

LAYER 3 — GENERAL AGRONOMY (Last Resort)
  ↓ Only when query falls completely outside Fiji context scope
  → Claude's general agronomic knowledge, explicitly framed
  → Labeled "General agronomic practice — verify with Fiji conditions"
  → Rare; most Fiji farming questions are covered by Layer 1 or 2
```

**The old NOT_FOUND response is retired.** TIS no longer returns "I cannot find a validated answer." TIS always provides the best available answer with transparent source labeling.

---

## Implementation: Modified Knowledge Broker

### Step 1 — Input (Unchanged)
Receive `query_text` from TIS Router. Same as before.

### Step 2 — Generate Query Embedding (Unchanged)
```python
embedding_response = await client.embeddings.create(
    model="text-embedding-3-small",
    input=query_text
)
query_vector = embedding_response.data[0].embedding
```

### Step 3 — Vector Search for KB Articles (Unchanged)
```sql
SELECT
    article_id,
    title,
    content_md,
    content_summary,
    crop_ids,
    1 - (embedding_vector <=> $1::vector) AS similarity
FROM shared.kb_articles
WHERE published = true
ORDER BY similarity DESC
LIMIT 3;
```

### Step 4 — Determine Knowledge Layer (CHANGED)

```python
async def determine_knowledge_layer(
    articles: list[KBArticle],
    query_text: str,
    farm_id: str
) -> tuple[str, str, list[KBArticle]]:
    """
    Returns: (layer_name, source_label, relevant_articles)
    """
    SIMILARITY_THRESHOLD = 0.65

    if articles and articles[0].similarity >= SIMILARITY_THRESHOLD:
        # Layer 1: Validated KB article exists
        return (
            "VALIDATED_KB",
            "Teivaka Validated Protocol",
            articles
        )
    else:
        # Layer 2: Use Fiji Agricultural Intelligence context
        # Log this as a KB candidate (see Step 7)
        await log_kb_candidate(query_text, farm_id, nearest_article=articles[0] if articles else None)
        return (
            "FIJI_INTELLIGENCE",
            "Based on Fiji agricultural practice",
            articles  # Pass as supplementary context even if below threshold
        )
```

### Step 5 — Load Fiji Agricultural Intelligence Context

```python
import os

def load_fiji_intelligence() -> str:
    """
    Load the FIJI_FARM_INTELLIGENCE.md document.
    This is the base knowledge layer always injected into Knowledge Broker calls.
    Cache in memory at startup — this file is static between deployments.
    """
    fiji_intel_path = settings.FIJI_INTELLIGENCE_PATH  
    # = "09_knowledge_base/FIJI_FARM_INTELLIGENCE.md"
    with open(fiji_intel_path, "r", encoding="utf-8") as f:
        return f.read()

# Cache at startup
FIJI_INTELLIGENCE_CONTEXT = load_fiji_intelligence()
```

### Step 6 — Build System Prompt (CHANGED — This Is the Core)

```python
def build_knowledge_broker_system_prompt(
    knowledge_layer: str,
    farm_id: str,
    farm_context: dict  # From TFOS API: active cycles, alerts, recent chemicals
) -> str:
    """
    Build the Knowledge Broker system prompt.
    The Fiji Agricultural Intelligence is ALWAYS injected.
    KB articles are injected ON TOP when available (Layer 1).
    """

    base_prompt = f"""
You are TIS — the Teivaka Intelligence System. You are the agricultural advisor for Teivaka farms in Fiji.

## YOUR KNOWLEDGE STANDARD

You have deep expertise in Fiji agriculture. Every answer you give must pass this test:
an experienced Fijian farmer who has worked Serua Province or Kadavu Island soil for 20 years
must recognize your advice as correct for their conditions.

## FARM CONTEXT
Farm: {farm_id}
Active crops: {farm_context.get('active_cycles', 'see system')}
Recent chemical applications: {farm_context.get('last_chemical', 'none recorded')}
Chemical WHD expires: {farm_context.get('whd_expires', 'N/A')}

## FIJI AGRICULTURAL INTELLIGENCE (Your Base Knowledge)

{FIJI_INTELLIGENCE_CONTEXT}

## ANSWER RULES

1. Lead with the direct answer — farmers are in the field, on their phones
2. Back it up with ONE specific Fiji reason (season, soil type, local pest, local chemical)
3. Use local Fijian names alongside English (yaqona not just kava; baigan or eggplant; tavioka not just cassava)
4. Reference only chemicals available in Fiji by their local trade names
5. All prices in FJD — never USD
6. For F002 (Kadavu): always factor in ferry logistics and stock availability
7. Keep responses under 200 words — short enough for WhatsApp
8. End with ONE clear action step

## SOURCE LABELING
"""

    if knowledge_layer == "VALIDATED_KB":
        source_section = """
## YOUR ANSWER SOURCE
A validated Teivaka Knowledge Base article has been found for this query (provided below).
Use it as your PRIMARY reference. Cite it by name in your answer.
Label your answer: "According to our [article title]..."
The KB article supersedes your general Fiji knowledge for this specific topic.
"""
    else:
        source_section = """
## YOUR ANSWER SOURCE  
No validated KB article exists yet for this specific query.
Answer from the Fiji Agricultural Intelligence above — it is your authoritative source.
Label your answer: "Based on Fiji agricultural practice..."
Your answer will be logged as a candidate for future KB article creation.
Do NOT say "I don't know" or "I cannot find a validated answer."
Give the best Fiji-grounded answer available.
"""

    return base_prompt + source_section
```

### Step 7 — Build User Message (CHANGED)

```python
def build_user_message(
    query_text: str,
    knowledge_layer: str,
    articles: list[KBArticle]
) -> str:

    if knowledge_layer == "VALIDATED_KB":
        context_blocks = []
        for i, article in enumerate(articles, 1):
            context_blocks.append(
                f"--- Validated KB Article {i}: {article.article_id} ---\n"
                f"Title: {article.title}\n"
                f"Similarity score: {article.similarity:.2f}\n"
                f"Summary: {article.content_summary}\n"
                f"Content:\n{article.content_md}\n"
            )
        kb_context = "\n".join(context_blocks)
        return (
            f"Farmer question: {query_text}\n\n"
            f"Validated KB Articles (use as primary source):\n\n"
            f"{kb_context}"
        )
    else:
        # Layer 2: Fiji Intelligence only
        # Still pass nearest article as supplementary if it exists
        supplementary = ""
        if articles:
            supplementary = (
                f"\n\nNearest (unvalidated) KB article for reference: "
                f"{articles[0].article_id} — {articles[0].title} "
                f"(similarity: {articles[0].similarity:.2f} — below validation threshold)"
            )
        return (
            f"Farmer question: {query_text}"
            f"{supplementary}"
        )
```

### Step 8 — Claude API Call (Minor Change: Remove max_tokens Hard Cap)

```python
response = await client.messages.create(
    model=settings.CLAUDE_MODEL,   # claude-sonnet-4-20250514
    max_tokens=800,   # Increased from 600 — Fiji context sometimes warrants slightly longer answers
    system=system_prompt,
    messages=[
        {"role": "user", "content": user_message}
    ]
)
```

### Step 9 — Post-Processing Citation Check (CHANGED)

```python
response_text = response.content[0].text

if knowledge_layer == "VALIDATED_KB":
    # Verify KB citation present (same as before)
    citation_found = any(
        article.article_id in response_text or article.title[:20] in response_text
        for article in articles
    )
    if not citation_found:
        # Claude answered without citing KB — log as anomaly but still return answer
        # (Don't discard a potentially good Fiji-grounded answer just because citation format varies)
        await log_citation_anomaly(query_text, response_text)
        # Prepend KB reference manually
        response_text = f"According to our {articles[0].title}: {response_text}"

# No citation check needed for Layer 2 — it's self-declared as "Fiji agricultural practice"
```

### Step 10 — Build Response and Log KB Candidate

```python
async def log_kb_candidate(
    query_text: str,
    farm_id: str,
    nearest_article: KBArticle | None
) -> None:
    """
    Every Layer 2 answer is a signal that a KB article is needed.
    Log to kb_article_candidates table for the agronomist to review.
    This is how the KB self-populates over time.
    """
    await db.execute(
        """
        INSERT INTO shared.kb_article_candidates 
            (query_text, farm_id, nearest_article_id, nearest_similarity, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (query_text_hash) DO UPDATE SET
            query_count = kb_article_candidates.query_count + 1,
            last_asked = NOW()
        """,
        query_text,
        farm_id,
        nearest_article.article_id if nearest_article else None,
        nearest_article.similarity if nearest_article else 0.0
    )


return TISResponse(
    module_used="KNOWLEDGE_BROKER",
    response_text=response_text,
    cited_articles=[
        {
            "article_id": a.article_id,
            "title": a.title,
            "similarity": a.similarity,
            "source_layer": knowledge_layer
        }
        for a in articles
    ],
    knowledge_layer=knowledge_layer,   # New field: "VALIDATED_KB" | "FIJI_INTELLIGENCE"
    confidence_score=articles[0].similarity if articles else 0.0,
    tokens_used=response.usage.input_tokens + response.usage.output_tokens,
    processing_time_ms=int((time.time() - start_time) * 1000),
    status="success"
)
```

---

## Database Change: kb_article_candidates Table

Add this table to the shared schema. It is the KB self-population pipeline.

```sql
-- 09_knowledge_base/KB_CANDIDATE_PIPELINE.sql
CREATE TABLE IF NOT EXISTS shared.kb_article_candidates (
    id                  SERIAL PRIMARY KEY,
    query_text          TEXT NOT NULL,
    query_text_hash     TEXT GENERATED ALWAYS AS (md5(lower(trim(query_text)))) STORED,
    farm_id             VARCHAR(10),
    nearest_article_id  VARCHAR(50),
    nearest_similarity  FLOAT,
    query_count         INTEGER DEFAULT 1,
    first_asked         TIMESTAMPTZ DEFAULT NOW(),
    last_asked          TIMESTAMPTZ DEFAULT NOW(),
    status              VARCHAR(20) DEFAULT 'PENDING',
    -- PENDING = not yet reviewed
    -- ARTICLE_CREATED = KB article drafted from this candidate
    -- DISMISSED = not worth creating an article for
    notes               TEXT,
    UNIQUE (query_text_hash)
);

CREATE INDEX idx_kb_candidates_status ON shared.kb_article_candidates(status);
CREATE INDEX idx_kb_candidates_count ON shared.kb_article_candidates(query_count DESC);
```

**Why this table matters:** When you eventually bring in an agronomist validator, you show them this table sorted by `query_count DESC`. The top 10 most-asked questions that have no KB article — those are the 10 articles to write first. The KB builds itself from real farmer questions, not from an agronomist guessing what articles to write.

---

## New API Endpoint: KB Candidate Dashboard

```python
# Add to app/routers/kb.py

@router.get("/knowledge/candidates", response_model=list[KBCandidateResponse])
async def list_kb_candidates(
    status: str = "PENDING",
    limit: int = 20,
    current_user: User = Depends(require_founder_or_admin)
):
    """
    List KB article candidates sorted by query frequency.
    Used by agronomist to prioritize which articles to write next.
    Founder/Admin access only.
    """
    candidates = await db.fetch_all(
        """
        SELECT query_text, query_count, nearest_article_id, 
               nearest_similarity, first_asked, last_asked
        FROM shared.kb_article_candidates
        WHERE status = $1
        ORDER BY query_count DESC
        LIMIT $2
        """,
        status, limit
    )
    return candidates
```

---

## The Self-Populating KB Pipeline

This is how the KB fills itself over time with zero wasted effort:

```
1. Farmer asks TIS a question (Layer 2 — no KB article)
   ↓
2. TIS answers from Fiji Intelligence (good answer, right now)
   ↓
3. Query logged in kb_article_candidates with query_count = 1
   ↓
4. Same question asked again by any farmer → query_count increments
   ↓
5. Weekly: Cody or developer reviews GET /knowledge/candidates
   → Sees top 10 most-asked questions with no KB article
   ↓
6. Agronomist writes KB article for top questions
   → Draft article created from FIJI_FARM_INTELLIGENCE.md context + expert additions
   ↓
7. Agronomist validates and signs off → article published = true
   ↓
8. Next time same question is asked → Layer 1 (Validated KB) fires
   → Answer now carries expert-validated authority
   ↓
9. Query removed from candidates or marked ARTICLE_CREATED
```

**Result:** The KB grows from real usage. Every question farmers actually ask becomes a KB article. Zero wasted agronomist time writing articles nobody reads.

---

## System Prompt Changes for OpenClaw (WhatsApp Mode)

Update `11_application_code/openclaw/system_prompt.md` — the farm-facing system prompt:

Replace:
```
For agronomy questions, call `tis_query` to search the KB rather than answering from memory
```

With:
```
For agronomy questions, call `tis_query`. TIS will answer from either:
(a) a validated Teivaka protocol — in which case the answer is expert-verified, cite it
(b) Fiji agricultural practice — a Fiji-grounded answer from the system's knowledge layer
Either way, TIS gives a real answer. Never say "I don't know" to an agronomy question unless 
the question is genuinely outside the scope of Fiji agriculture.
```

---

## Configuration: Environment Variables to Add

Add to `.env` and `04_environment/.env.example`:

```env
# Fiji Agricultural Intelligence
FIJI_INTELLIGENCE_PATH=09_knowledge_base/FIJI_FARM_INTELLIGENCE.md
KB_SIMILARITY_THRESHOLD=0.65
# Lower this if too many Layer 2 fallbacks; raise if too many poor-quality KB hits
# Start at 0.65; tune after 30 days of real usage data

TIS_KNOWLEDGE_LAYER_LOGGING=true
# Logs every knowledge layer decision for monitoring and tuning
```

---

## Monitoring: What to Watch After Launch

Add these to the Decision Engine or a simple daily report:

```sql
-- Daily KB health check
SELECT 
    SUM(CASE WHEN knowledge_layer = 'VALIDATED_KB' THEN 1 ELSE 0 END) AS layer1_answers,
    SUM(CASE WHEN knowledge_layer = 'FIJI_INTELLIGENCE' THEN 1 ELSE 0 END) AS layer2_answers,
    ROUND(
        100.0 * SUM(CASE WHEN knowledge_layer = 'VALIDATED_KB' THEN 1 ELSE 0 END) 
        / COUNT(*), 1
    ) AS kb_coverage_pct
FROM ai_commands
WHERE command_type = 'KB_QUERY'
AND created_at >= NOW() - INTERVAL '30 days';
```

**Target:** Start at 0% KB coverage (expected — no published articles at MVP launch). Track weekly. As articles get validated and published, this number climbs. When it hits 60%+, TIS is primarily KB-driven. 80%+ is the long-term target.

---

## Migration: Existing KB Articles (If Any)

If any KB articles were written and published before this architecture change:
- They remain valid and are still used as Layer 1 sources
- No migration needed — the new system is backwards-compatible
- The only change is: Layer 2 now fires instead of NOT_FOUND when Layer 1 fails

---

## Phase 2: Web Search Augmentation (Plan Ahead)

When web search is added to TIS (Phase 2 capability):

```python
# Layer 2.5 — Web-augmented Fiji Intelligence (Phase 2)
if knowledge_layer == "FIJI_INTELLIGENCE" and query_requires_current_info(query_text):
    # Triggers on: "current price", "price today", "latest outbreak", "new disease"
    web_results = await search_fiji_agricultural_sources(query_text)
    # Prioritize: Fiji Ministry of Agriculture bulletins, SPC Pacific Community,
    # Fiji Farmers Cooperative, Pacific Agri product availability
    # Inject web results into system prompt alongside Fiji Intelligence context
```

This adds real-time awareness (current market prices, current disease outbreak alerts) without compromising the base Fiji-grounded intelligence.

---

## Summary: What Changed, What Didn't

| Component | Old Behavior | New Behavior |
|---|---|---|
| KB article found (similarity ≥ 0.65) | Answer from KB | ✅ Same — KB article is primary source |
| No KB article found | Return NOT_FOUND | ✅ Answer from Fiji Intelligence; log as KB candidate |
| System prompt | KB-only instruction | Fiji Intelligence context always injected |
| Response when no KB | "I cannot find..." | Fiji-grounded answer with source label |
| KB growth mechanism | Manual article writing | Self-populating from real farmer questions |
| Agronomist validator required for Day 1 | YES (blocking) | NO — validator improves quality, not gate |
| Answer quality Day 1 | Zero (no articles) | High (Fiji Intelligence layer) |
| Answer quality after validation | High | Higher (expert-verified Layer 1) |

---

*This architecture is the long-term correct design for TFOS. It removes the Day 1 validation bottleneck while preserving the path to expert-validated KB excellence. The Fiji Agricultural Intelligence layer in FIJI_FARM_INTELLIGENCE.md is a living document — update it as market prices change, new pests emerge, new chemicals become available, and real field learnings accumulate from F001 and F002.*

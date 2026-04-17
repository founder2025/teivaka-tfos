# FILE: 03_backend/TIS_SPECIFICATION.md

# TIS — Teivaka Intelligence System: Complete Specification

**Platform:** Teivaka Agricultural TOS (Agri-TOS), Fiji
**Version:** 1.0
**Date:** 2026-04-07
**Author:** Teivaka Development Team
**Founder:** Uraia Koroi Kama (Cody)

---

## SECTION 1 — Architecture Overview

### What TIS Is

TIS (Teivaka Intelligence System) is a **multimodal AI agent embedded in the Teivaka Farm Operating System**. It is not a chatbot. It is the operational intelligence layer that connects farmers to their data through natural language — voice or text — in real time.

TIS sits between the farmer and the TFOS data layer. Every interaction with TIS either retrieves validated knowledge, explains live farm data, or executes a concrete action in the system. There are no idle conversations. Every TIS response must be actionable.

### Core Principle

> TIS does not replace farm judgment — it removes the friction between a farmer's question and the answer already in their system.

A farmer standing in a field on Kadavu Island should be able to speak into WhatsApp and hear back their current CoKG, their overdue tasks, and whether they can harvest today — in under 5 seconds.

### Three Modules

TIS comprises three modules with distinct responsibilities and strict routing logic:

| Module | Responsibility | AI Usage | Response Type |
|---|---|---|---|
| **Module 1: Knowledge Broker** | Answers agronomy questions from validated KB only | Claude API + pgvector RAG | Protocol / guidance |
| **Module 2: Operational Interpreter** | Explains live TFOS data in natural language | Claude API + live farm context | Explanation / insight |
| **Module 3: Command Executor** | Executes the 12 TFOS command types | No LLM call (direct execution) | Action confirmation |

### Data Flow Overview

```
Farmer Input (Voice or Text)
        │
        ▼
┌───────────────────────┐
│   Input Handler        │
│   - Voice: Whisper API │
│   - Text: direct       │
└───────────┬───────────┘
            │  transcript / text
            ▼
┌───────────────────────┐
│   TIS Router           │
│   - Keyword matching   │
│   - Intent pre-class.  │
│   - Ambiguity rule     │
└───────┬───────┬────────┘
        │       │        │
        ▼       ▼        ▼
  Knowledge  Operational  Command
   Broker   Interpreter   Executor
        │       │        │
        └───────┴────────┘
                │
                ▼
        Structured Response
                │
                ▼
     Delivery Channel:
     - PWA WebSocket push
     - WhatsApp (Twilio)
     - Polling endpoint
```

### Technology Stack for TIS

| Component | Technology |
|---|---|
| LLM | Anthropic Claude API (`claude-sonnet-4-20250514`) |
| Voice transcription | OpenAI Whisper API (`whisper-1`) |
| KB embeddings | OpenAI `text-embedding-3-small` (1536 dimensions) |
| Vector store | PostgreSQL 16 + pgvector (`<=>` cosine distance) |
| Async processing | Celery 5.4 + Redis 7.2 |
| Rate limiting | Redis counters per user per day |
| Conversation history | PostgreSQL `tis_conversations` table |
| WhatsApp delivery | Twilio WhatsApp API |
| Web delivery | FastAPI WebSocket / polling |

---

## SECTION 2 — Module Routing and Intent Detection

### Routing Algorithm

The TIS Router runs before any module is invoked. It receives either a raw text message or a transcribed voice command (post-Whisper) and determines which module handles it.

#### Step 1: Receive Input

Input arrives as a normalized UTF-8 string. Source metadata is preserved:
- `input_source`: `"text"` | `"voice"` | `"whatsapp"`
- `farm_id`: from the user's session
- `pu_id`: optional context from last conversation turn

#### Step 2: Pre-classify via Keyword Pattern Matching

The router runs a lightweight keyword scan against the lowercased input. No LLM is called at this stage.

**COMMAND EXECUTOR triggers (exact match or substring):**
```
"log ", "record ", "add ", "create ", "report ",
"mark ", "check tasks", "check stock",
"check alerts", "check financials",
"i worked", "worked today", "harvested",
"picked", "collected", "sprayed", "applied",
"fertilized", "paid", "received payment",
"spent", "expense", "income", "it rained",
"weather today", "log weather", "start new cycle",
"plant ", "begin planting", "new crop",
"report incident", "stolen", "broken", "damage",
"attendance", "log labor"
```

**KNOWLEDGE BROKER triggers:**
```
"how to", "how do i", "what is", "when should i",
"protocol for", "guide", "advice",
"pest", "disease", "fertilizer advice",
"spray schedule", "what causes", "why does",
"treatment for", "control ", "manage ",
"planting guide", "crop calendar",
"soil preparation", "irrigation advice"
```

**OPERATIONAL INTERPRETER triggers:**
```
"explain", "why is", "what does this mean",
"my cokg", "my p&l", "my alerts",
"my farm", "show me", "what's happening",
"how am i doing", "performance", "summary",
"profit on", "trend", "forecast",
"what does", "tell me about my"
```

#### Step 3: Ambiguity Resolution Rule

If a message matches triggers in two or more modules, or matches no triggers:

> **Default rule: COMMAND EXECUTOR wins over INTERPRETER; INTERPRETER wins over KNOWLEDGE BROKER.**

Rationale: a farmer in the field is more likely issuing a command than asking a philosophical question. When in doubt, attempt execution. If execution fails due to missing entities, TIS prompts for clarification.

Priority order: `COMMAND_EXECUTOR > OPERATIONAL_INTERPRETER > KNOWLEDGE_BROKER`

#### Step 4: Module Invocation

The selected module receives:
```python
tis_request = TISRequest(
    user_id=user_id,
    tenant_id=tenant_id,
    farm_id=farm_id,
    input_text=transcript_or_message,
    input_source="voice" | "text" | "whatsapp",
    pu_id_context=last_pu_from_conversation,   # from conversation history
    voice_log_id=voice_log_id,                 # if voice input
    timestamp=datetime.utcnow(),
    subscription_tier="free" | "basic" | "premium" | "custom"
)
```

Each module returns a `TISResponse`:
```python
tis_response = TISResponse(
    command_id=command_id,
    module_used="KNOWLEDGE_BROKER" | "OPERATIONAL_INTERPRETER" | "COMMAND_EXECUTOR",
    response_text=formatted_response,
    cited_articles=[],           # Knowledge Broker only
    actions_taken=[],            # Command Executor only
    tokens_used=0,               # if LLM was called
    processing_time_ms=0,
    confidence_score=None,       # Knowledge Broker only
    knowledge_layer=None,        # Knowledge Broker only: "VALIDATED_KB" | "FIJI_INTELLIGENCE" | "GENERAL_AGRONOMY"
    status="success" | "partial" | "error" | "rate_limited"
)
```

---

## SECTION 3 — Module 1: Knowledge Broker

### Purpose

The Knowledge Broker answers agronomy and agricultural protocol questions using a **three-layer Grounded Intelligence model**. It is the agricultural reference desk for the platform.

Full implementation spec: **`03_backend/TIS_GROUNDED_INTELLIGENCE.md`**  
Base knowledge layer: **`09_knowledge_base/FIJI_FARM_INTELLIGENCE.md`**

### Grounded Intelligence Model (Replaces Hard KB-Only Constraint)

> **TIS does not refuse to answer. TIS answers from the best available source, clearly labeled, every time.**

The old "KB-only with NOT_FOUND fallback" constraint is retired. It created a Day 1 failure condition where TIS was useless until KB articles were manually validated. The Grounded Intelligence model solves this.

**Three-Layer Knowledge Hierarchy:**

```
LAYER 1 — VALIDATED KB ARTICLES (Highest Authority)
  When: published KB article exists with cosine similarity ≥ 0.65
  Label: "According to our [article title]..."
  Source: shared.kb_articles (published = true)

LAYER 2 — FIJI AGRICULTURAL INTELLIGENCE (Operating Standard)
  When: no validated KB article exists or similarity < 0.65
  Label: "Based on Fiji agricultural practice..."
  Source: FIJI_FARM_INTELLIGENCE.md (injected into every system prompt)
  Action: query logged in shared.kb_article_candidates for future article creation

LAYER 3 — GENERAL AGRONOMY (Last Resort)
  When: query falls completely outside Fiji context scope
  Label: "General agronomic practice — verify with Fiji conditions"
  Source: Claude general knowledge, explicitly framed
```

**The Fiji Agricultural Intelligence layer (`FIJI_FARM_INTELLIGENCE.md`) is always present in the system prompt** — for every Knowledge Broker call, regardless of whether a KB article is found. This ensures all answers are grounded in Fiji conditions: local crop names, locally available chemicals (Pacific Agri product names), FJD prices, Fiji's wet/dry seasonal calendar, F001 and F002 farm-specific context.

**Answer Quality Standard:** Every answer must pass the "Experienced Fiji Farmer Test" — a farmer with 20+ years in Serua Province or Kadavu Island must recognize the advice as correct for their conditions.

**Self-Populating KB Pipeline:** Every Layer 2 answer logs the query to `shared.kb_article_candidates` with a frequency counter. When an agronomist is engaged, `GET /api/v1/knowledge/candidates` (sorted by query count) shows exactly which articles to write first — driven by real farmer questions, not guesswork.

**Enforcement layers (updated):**
1. **System prompt** — Fiji Intelligence context always injected; KB articles cited when found
2. **Confidence threshold gate** — similarity ≥ 0.65 triggers Layer 1; below triggers Layer 2
3. **KB candidate logging** — Layer 2 answers automatically populate the article creation pipeline
4. **Source labeling** — every response includes `knowledge_layer` field in API response

### RAG Implementation (Step-by-Step)

#### Step 1: Receive User Query

Input: `query_text` (string, the natural language agronomy question)

#### Step 2: Generate Embedding for Query

```python
import openai

client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

embedding_response = await client.embeddings.create(
    model="text-embedding-3-small",
    input=query_text
)
query_vector = embedding_response.data[0].embedding  # 1536-dim float list
```

#### Step 3: Vector Similarity Search

```sql
SELECT
    article_id,
    title,
    content_md,
    content_summary,
    crop_ids,
    stage_ids,
    tags,
    1 - (embedding_vector <=> $1::vector) AS similarity
FROM shared.kb_articles
WHERE published = true
ORDER BY similarity DESC
LIMIT 3;
```

Parameters:
- `$1`: query embedding as PostgreSQL vector literal
- `LIMIT 3`: retrieve top 3 candidates
- `published = true`: only validated, live articles

#### Step 4: Determine Knowledge Layer (Grounded Intelligence — replaces old NOT_FOUND gate)

```python
SIMILARITY_THRESHOLD = settings.VECTOR_SIMILARITY_THRESHOLD  # default 0.65

if articles and articles[0].similarity >= SIMILARITY_THRESHOLD:
    knowledge_layer = "VALIDATED_KB"      # Layer 1: use KB article as primary
else:
    knowledge_layer = "FIJI_INTELLIGENCE" # Layer 2: use Fiji Intelligence context
    # Log this query as a KB candidate for future article creation
    await log_kb_candidate(query_text, request.farm_id, articles[0] if articles else None)

# NOTE: The old NOT_FOUND early return is removed. Both layers proceed to Claude API call.
# See 03_backend/TIS_GROUNDED_INTELLIGENCE.md for full implementation.
```

The threshold of 0.65 still applies — but instead of returning NOT_FOUND, it routes to the Fiji Agricultural Intelligence layer. TIS always gives a real answer.

#### Step 5: Build Knowledge Context

```python
context_blocks = []
for i, article in enumerate(articles, 1):
    context_blocks.append(
        f"--- KB Article {i}: {article.article_id} ---\n"
        f"Title: {article.title}\n"
        f"Summary: {article.content_summary}\n"
        f"Content:\n{article.content_md}\n"
    )
knowledge_context = "\n".join(context_blocks)
```

#### Step 6: Claude API Call

```python
import anthropic

client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

system_prompt = build_knowledge_broker_system_prompt(
    farm_id=request.farm_id,
    tenant_name="Teivaka"
)

user_message = (
    f"Farmer question: {query_text}\n\n"
    f"Retrieved Knowledge Base articles (use ONLY these to answer):\n\n"
    f"{knowledge_context}"
)

response = await client.messages.create(
    model=settings.CLAUDE_MODEL,   # claude-sonnet-4-20250514
    max_tokens=600,
    system=system_prompt,
    messages=[
        {"role": "user", "content": user_message}
    ]
)
```

**Parameters:**
- `max_tokens: 600` — Knowledge Broker responses are concise protocols, not essays
- No temperature parameter — Claude default (1.0) acceptable for factual retrieval; the constraint is structural, not probabilistic

#### Step 7: Post-Processing Citation Check

```python
response_text = response.content[0].text

# Check that response references KB content (not hallucinated)
citation_found = any(
    article.article_id in response_text or article.title[:20] in response_text
    for article in articles
)

if not citation_found:
    # Fallback: Claude answered without citing KB — replace with safe response
    return TISResponse(
        module_used="KNOWLEDGE_BROKER",
        response_text=build_not_found_response(nearest_article=articles[0]),
        status="fallback_triggered"
    )
```

#### Step 8: Return Response with Citations

```python
return TISResponse(
    module_used="KNOWLEDGE_BROKER",
    response_text=response_text,
    cited_articles=[
        {"article_id": a.article_id, "title": a.title, "similarity": a.similarity}
        for a in articles
    ],
    tokens_used=response.usage.input_tokens + response.usage.output_tokens,
    confidence_score=articles[0].similarity,
    status="success"
)
```

### Knowledge Base Schema Reference

The Knowledge Broker reads from `shared.kb_articles`:

```sql
-- Key columns used by Knowledge Broker
article_id          VARCHAR(20) PRIMARY KEY   -- e.g. KB-EGG-001
title               TEXT NOT NULL
content_md          TEXT                      -- full markdown content
content_summary     TEXT                      -- 2-3 sentence summary for context window
embedding_vector    vector(1536)              -- OpenAI text-embedding-3-small
published           BOOLEAN DEFAULT false     -- only published articles are searchable
crop_ids            TEXT[]                    -- e.g. {'CRP-EGG', 'CRP-CAS'}
stage_ids           TEXT[]                    -- e.g. {'STG-EGG-003'}
tags                TEXT[]                    -- e.g. {'pest', 'aphid', 'eggplant'}
```

### Embedding Generation (on article create/update)

When a KB article is published or updated, its embedding is regenerated:

```python
async def regenerate_kb_embedding(article_id: str, db: AsyncSession):
    article = await db.get(KBArticle, article_id)
    embed_text = f"{article.title}\n{article.content_summary}\n{article.content_md[:2000]}"

    embedding_response = await openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=embed_text
    )

    article.embedding_vector = embedding_response.data[0].embedding
    article.embedding_updated_at = datetime.utcnow()
    await db.commit()
```

---

## SECTION 4 — Module 2: Operational Interpreter

### Purpose

The Operational Interpreter explains live TFOS data to the farmer in natural language. It reads current production cycles, alerts, financial metrics, and decision signals — and translates them into clear, actionable English using Claude.

The Interpreter never makes up data. It explains only what it is given. If data is missing or stale, it says so.

### Context Assembly

Every Interpreter call assembles a `farm_context` dictionary from live TFOS database queries before calling Claude. This ensures Claude always explains current, accurate data.

```python
farm_context = {
    "farm_id": farm_id,
    "farm_name": farm_name,                    # e.g. "Save-A-Lot" or "Viyasiyasi Farm"
    "active_cycles": [
        {
            "pu_id": "F001-PU002",
            "crop": "Eggplant",
            "crop_id": "CRP-EGG",
            "stage": "Fruiting",
            "stage_number": 3,
            "days_active": 35,
            "planting_date": "2026-03-03",
            "cogk_fjd": 1.85,
            "gross_margin_pct": 34.2,
            "total_revenue_fjd": 840.00,
            "total_cost_fjd": 556.56,
            "last_harvest_date": "2026-04-01",
            "open_alerts": 2,
            "cycle_id": "CY-F001-26-002"
        }
        # ... all active cycles
    ],
    "decision_signals_snapshot": {
        "gross_margin_rag": "AMBER",           # GREEN / AMBER / RED
        "harvest_gap_rag": "GREEN",
        "open_alerts_rag": "GREEN",
        "cash_position_rag": "GREEN",
        "labor_cost_rag": "GREEN",
        "input_cost_rag": "GREEN",
        "yield_vs_benchmark_rag": "AMBER",
        "chemical_compliance_rag": "GREEN",
        "rotation_health_rag": "GREEN",
        "inactivity_rag": "GREEN"
    },
    "financial_summary_30d": {
        "total_revenue_fjd": 1240.00,
        "total_cost_fjd": 890.00,
        "net_profit_fjd": 350.00,
        "avg_cogk_fjd": 1.85,
        "labor_cost_fjd": 320.00,
        "input_cost_fjd": 410.00,
        "other_cost_fjd": 160.00
    },
    "open_alerts": [
        {
            "alert_id": "ALT-20260405-001",
            "rule_id": "RULE-012",
            "severity": "High",
            "description": "Harvest gap exceeds 7 days on F001-PU001",
            "pu_id": "F001-PU001",
            "created_at": "2026-04-05T08:30:00+12:00"
        }
    ],
    "open_alerts_count": 2,
    "current_date": "2026-04-07",
    "current_day_of_week": "Tuesday",
    "timezone": "Pacific/Fiji",
    "upcoming_tasks_3d": [
        {
            "task_id": "TSK-20260407-003",
            "description": "Pest scouting on F001-PU002",
            "due_date": "2026-04-07",
            "status": "open",
            "pu_id": "F001-PU002"
        }
    ]
}
```

### Context Assembly SQL Queries

The Interpreter runs these queries before each call:

```python
async def assemble_farm_context(farm_id: str, tenant_id: str, db: AsyncSession) -> dict:
    # 1. Active cycles with financial rollup
    cycles = await db.execute(
        text("""
        SELECT
            pc.pu_id, pc.cycle_id, p.crop_name, p.production_id,
            ps.stage_name, ps.stage_number,
            EXTRACT(DAY FROM NOW() - pc.planting_date)::int AS days_active,
            pc.planting_date,
            cf.cogk_fjd, cf.gross_margin_pct,
            cf.total_revenue_fjd, cf.total_cost_fjd,
            cf.last_harvest_date,
            (SELECT COUNT(*) FROM automation_alerts aa
             WHERE aa.pu_id = pc.pu_id AND aa.status = 'open') AS open_alerts
        FROM production_cycles pc
        JOIN shared.productions p ON pc.production_id = p.production_id
        JOIN shared.production_stages ps ON pc.current_stage_id = ps.stage_id
        LEFT JOIN cycle_financials cf ON pc.cycle_id = cf.cycle_id
        WHERE pc.farm_id = :farm_id
          AND pc.tenant_id = :tenant_id
          AND pc.status = 'active'
        """),
        {"farm_id": farm_id, "tenant_id": tenant_id}
    )

    # 2. Decision signals
    signals = await db.execute(
        text("""
        SELECT signal_name, rag_status
        FROM decision_signal_state
        WHERE farm_id = :farm_id AND tenant_id = :tenant_id
        """),
        {"farm_id": farm_id, "tenant_id": tenant_id}
    )

    # 3. 30-day financial summary
    financials = await db.execute(
        text("""
        SELECT
            SUM(CASE WHEN transaction_type = 'income' THEN amount_fjd ELSE 0 END) AS revenue,
            SUM(CASE WHEN transaction_type = 'expense' THEN amount_fjd ELSE 0 END) AS costs,
            AVG(cogk_fjd) AS avg_cogk
        FROM cash_ledger cl
        LEFT JOIN cycle_financials cf ON cf.farm_id = :farm_id
        WHERE cl.farm_id = :farm_id
          AND cl.tenant_id = :tenant_id
          AND cl.transaction_date >= CURRENT_DATE - INTERVAL '30 days'
        """),
        {"farm_id": farm_id, "tenant_id": tenant_id}
    )

    return build_context_dict(cycles, signals, financials, farm_id)
```

### Claude API Call for Interpreter

```python
response = await anthropic_client.messages.create(
    model=settings.CLAUDE_MODEL,   # claude-sonnet-4-20250514
    max_tokens=800,
    temperature=0.3,               # factual, grounded — not creative
    system=build_interpreter_system_prompt(),
    messages=conversation_history + [
        {
            "role": "user",
            "content": (
                f"Farmer question: {user_query}\n\n"
                f"Current farm data:\n{json.dumps(farm_context, indent=2, default=str)}"
            )
        }
    ]
)
```

**Temperature 0.3 rationale:** The Interpreter explains real numbers. Low temperature keeps Claude grounded in the provided data rather than generating creative interpretations. At 0.0 responses become mechanical; at 0.3 they remain readable while staying factually anchored.

### Interpreter Tone Guidelines

- **Voice:** trusted agricultural advisor, not corporate, not chatty
- **Reference farm elements by their actual IDs:** "your eggplant on F001-PU002", not "your crop"
- **Lead with CoKG** when explaining financial performance — it is the primary metric
- **Use plain English for Fiji farming context:** "your margin is a bit low" not "your gross margin percentage is below threshold"
- **Fijian words are appropriate and encouraged:**
  - Vinaka — Thank you / Good
  - Sa rauta — That's enough / That'll do
  - Io — Yes
  - Sa vakacaucautaki — It has been completed
  - Dalo — Taro
  - Rourou — Taro leaves
  - Duruka — Fijian asparagus
  - Kava — Yaqona / sacred plant, 4-year cycle
- **Never fabricate numbers.** If data is missing, say so: "I don't have harvest data for PU003 this week."
- **Surface the "so what":** Don't just report data — tell the farmer what it means: "Your CoKG is FJD 1.85/kg — that's AMBER. If you harvest 20kg more this week it should drop below FJD 1.70 and move to GREEN."

---

## SECTION 5 — Module 3: Command Executor

### Purpose

The Command Executor executes the 12 TFOS command types via voice or text. It does not call the Claude API — it parses entities from the input, validates them, calls TFOS API endpoints, and returns structured confirmations.

Commands are deterministic operations. A harvest log is a harvest log. No AI interpretation is needed at execution time (routing to this module was already determined by TIS Router).

### Entity Extraction

Entity extraction is handled by a combination of:
1. **Regex patterns** for structured data (numbers, dates, units)
2. **Lookup tables** for known entities (worker names, crop names, PU IDs)
3. **Default values** for omitted fields (today's date, last active PU from context)

If required entities cannot be extracted, TIS returns a clarification prompt rather than failing silently.

```python
# Example: worker name lookup
WORKER_NAME_MAP = {
    "laisenia": "W-001",
    "laisenia waqa": "W-001",
    "maika": "W-002",
    "maika ratubaba": "W-002",
    "maciu": "W-003",
    "maciu tuilau": "W-003",
    "rusiate": "W-004",
    "rusiate wadali": "W-004",
    "vairusi": "W-005",
    "vairusi tokoni": "W-005",
    "naita": "W-006",
    "naita mosese": "W-006",
    "marika": "W-007",
    "nayan": "W-008",
    "crew-nayan": "W-008",
    "apisai": "W-009",
}
```

---

### Command 1: LOG_LABOR

**Trigger patterns:**
- "log labor [worker] [hours] [PU]"
- "record work [worker] [hours]"
- "[worker name] worked [hours] hours"
- "attendance [worker]"
- "laisenia worked 8 hours on PU002"

**Entity extraction:**
| Entity | Extraction Method | Required | Default |
|---|---|---|---|
| `worker_name` | Name lookup → `worker_id` | Yes | — |
| `pu_id` | PU pattern (F001-PU002) or context | Yes | last PU from conversation |
| `hours_worked` | Regex `(\d+\.?\d*)\s*(hours?\|hrs?)` | Yes | — |
| `date` | Date extraction or "today" | No | `date.today()` |
| `activity_type` | Keyword match (harvesting, weeding, etc.) | No | `"general"` |

**Validation:**
- `worker_id` must exist in `workers` table for this `tenant_id`
- `hours_worked` must be between 0.5 and 16 (inclusive)
- `pu_id` must be active and belong to `farm_id`
- If validation fails: return specific error message, do not create record

**API call:**
```http
POST /api/v1/labor
{
  "worker_id": "W-001",
  "pu_id": "F001-PU002",
  "hours_worked": 8.0,
  "activity_type": "harvesting",
  "log_date": "2026-04-07",
  "logged_by_tis": true
}
```

**Database record created:**
- Table: `labor_attendance`
- ID format: `LAB-YYYYMMDD-###` (e.g., `LAB-20260407-001`)
- Triggers: `cycle_financials` labor cost recalculation, CoKG update

**Confirmation response:**
```
Labor logged: W-001 Laisenia Waqa — 8 hours on F001-PU002 (Eggplant).
Total cost: FJD 48.00. Vinaka!
```

---

### Command 2: LOG_HARVEST

**Trigger patterns:**
- "log harvest [qty] [crop/PU]"
- "harvested [qty]kg [crop]"
- "picked [qty] kg of eggplant"
- "collected [qty]kg from PU003"

**Entity extraction:**
| Entity | Extraction Method | Required | Default |
|---|---|---|---|
| `pu_id` or `crop_name` | PU pattern or crop name lookup | Yes | last PU from context |
| `qty_kg` | Regex `(\d+\.?\d*)\s*kg` | Yes | — |
| `grade` | "grade A", "grade B", keyword | No | `"A"` |
| `customer` | Customer name lookup or ID | No | `null` |
| `date` | Date extraction | No | `date.today()` |
| `price_per_kg` | From `price_master` for crop | Auto | from price_master |

**Validation — Chemical Compliance Check (mandatory):**

Before creating a harvest record, TIS calls:
```python
compliance = await check_chemical_compliance(pu_id, harvest_date, db)
if compliance.status == "BLOCKED":
    return TISResponse(
        response_text=(
            f"Harvest cannot be logged. {compliance.chemical_name} was applied "
            f"{compliance.days_since_application} days ago. "
            f"Withholding period: {compliance.withholding_period_days} days. "
            f"Safe to harvest after {compliance.safe_harvest_date.strftime('%d %b %Y')}."
        ),
        status="blocked"
    )
```

This is non-negotiable. No harvest can be logged during an active withholding period.

**API call:**
```http
POST /api/v1/harvests
{
  "pu_id": "F001-PU002",
  "qty_kg": 42.0,
  "grade": "A",
  "customer_id": null,
  "harvest_date": "2026-04-07",
  "price_per_kg": 2.80,
  "logged_by_tis": true
}
```

**Database records created:**
- Table: `harvest_log`, ID: `HRV-YYYYMMDD-###`
- Triggers: `cycle_financials` revenue + CoKG update
- Triggers: `decision_signal_state` harvest_gap_rag recalculation

**Confirmation response:**
```
Harvest logged: 42kg Eggplant Grade A on F001-PU002.
Value: FJD 117.60 @ FJD2.80/kg. CoKG updated to FJD1.82/kg. Sa rauta!
```

---

### Command 3: LOG_INPUT

**Trigger patterns:**
- "applied [input] to [PU]"
- "used [qty] [unit] [input]"
- "sprayed [input] on [PU]"
- "fertilized PU002 with NPK"
- "used input [input name]"

**Entity extraction:**
| Entity | Extraction Method | Required | Default |
|---|---|---|---|
| `input_name` | Input name lookup → `input_id` | Yes | — |
| `pu_id` | PU pattern or context | Yes | last PU from context |
| `qty_used` | Regex numeric + unit | Yes | — |
| `unit` | kg, L, g, ml, bags | Yes | from input's default_unit |
| `date` | Date extraction | No | `date.today()` |

**Validation:**
- `input_id` must exist in `inputs` table for `tenant_id`
- If chemical: note withholding period — log entry is created, warning issued if within window of a recent harvest

**API call:**
```http
POST /api/v1/events
{
  "event_type": "chemical_application",   // or "fertilizer_application"
  "pu_id": "F001-PU002",
  "input_id": "INP-NPK-001",
  "qty_used": 2.0,
  "unit": "kg",
  "event_date": "2026-04-07",
  "logged_by_tis": true
}
```

**Database records created:**
- Table: `field_events` (event_type = chemical_application or fertilizer_application)
- Table: `input_usage` (decrements stock qty)
- If chemical: withholding period end date calculated and stored

**Confirmation response:**
```
Input logged: 2kg NPK fertilizer applied to F001-PU002.
Stock remaining: 78kg.
```

If chemical with withholding period:
```
Input logged: 50ml Dimethoate applied to F001-PU002.
⚠️ Withholding period: 7 days. Safe to harvest after 14 Apr 2026.
Stock remaining: 0.25L.
```

---

### Command 4: LOG_CASH

**Trigger patterns:**
- "paid [amount] for [description]"
- "received payment FJD [amount]"
- "spent [amount] on [category]"
- "expense [amount]"
- "income FJD [amount] from [source]"
- "cash [in/out] [amount]"

**Entity extraction:**
| Entity | Extraction Method | Required | Default |
|---|---|---|---|
| `amount_fjd` | Regex `FJD?\s*(\d+\.?\d*)` or numeric | Yes | — |
| `direction` | "paid"/"spent"→out, "received"/"income"→in | Yes | — |
| `category` | Category keyword list | No | `"general"` |
| `description` | Remaining text after amount | No | `""` |
| `date` | Date extraction | No | `date.today()` |

**API call:**
```http
POST /api/v1/cash
{
  "amount_fjd": 240.00,
  "transaction_type": "income",
  "category": "harvest_sale",
  "description": "Eggplant sale to market",
  "transaction_date": "2026-04-07",
  "farm_id": "F001",
  "logged_by_tis": true
}
```

**Database records created:**
- Table: `cash_ledger`, ID: `CSH-YYYYMMDD-###`
- Triggers: running balance update, 30d financial summary recalculation

**Confirmation response:**
```
Cash recorded: FJD 240.00 received. New balance: FJD 1,840.00.
```

---

### Command 5: LOG_WEATHER

**Trigger patterns:**
- "log weather [conditions]"
- "it rained [Xmm] today"
- "hot today, [temp] degrees"
- "weather today [description]"
- "rainfall [Xmm]"

**Entity extraction:**
| Entity | Extraction Method | Required | Default |
|---|---|---|---|
| `zone_id` | Zone lookup or context | No | farm's first zone |
| `rainfall_mm` | Regex `(\d+\.?\d*)\s*mm` | No | `null` |
| `temperature_max` | Regex `(\d+)\s*(°C\|degrees)` | No | `null` |
| `weather_condition` | Keyword: sunny, cloudy, rain, storm, dry | No | `"unspecified"` |
| `date` | Date extraction | No | `date.today()` |

**Special handling for F002 (Kadavu Island):** Weather data for Kadavu is particularly important for logistics planning. If `farm_id == "F002"` and rainfall > 50mm or `weather_condition == "storm"`, automatically create a logistics advisory alert.

**API call:**
```http
POST /api/v1/weather
{
  "zone_id": "Z-F001-01",
  "rainfall_mm": 25.0,
  "temperature_max": 28.0,
  "weather_condition": "partly_cloudy",
  "observation_date": "2026-04-07",
  "logged_by_tis": true
}
```

**Database records created:**
- Table: `weather_log`
- Triggers: irrigation need calculation for affected PUs

**Confirmation response:**
```
Weather logged for F001: Rainfall 25mm, Partly cloudy. Recorded.
```

---

### Command 6: CHECK_TASKS

**Trigger patterns:**
- "what tasks do I have"
- "show tasks"
- "overdue tasks"
- "today's tasks"
- "pending tasks"
- "what do I need to do"

**Entity extraction:**
| Entity | Extraction Method | Required | Default |
|---|---|---|---|
| `date_filter` | "today", "overdue", "this week" | No | `today + overdue` |
| `farm_id` | From session context | Auto | user's farm |
| `pu_id` | If specified | No | all PUs |

**API call:**
```http
GET /api/v1/tasks?status=open,overdue&farm_id=F001
```

**Response format:**
```
Your open tasks:
🔴 OVERDUE: Pest scouting on F001-PU002 (due 3 Apr)
🟡 DUE TODAY: Harvest eggplant F001-PU003
🟢 UPCOMING: Fertilize PU001 (due 9 Apr)

3 tasks total. 1 overdue.
```

Emoji indicators:
- 🔴 Overdue (past due date)
- 🟡 Due today
- 🟢 Upcoming (within 3 days)

If no tasks: `"No open tasks for your farm today. Vinaka!"`

---

### Command 7: CHECK_ALERTS

**Trigger patterns:**
- "show alerts"
- "what alerts do I have"
- "any issues"
- "problems on my farm"
- "what's wrong"

**API call:**
```http
GET /api/v1/alerts?status=open&farm_id=F001
```

**Response format:**
```
You have 3 open alerts:
🔴 CRITICAL: Chemical compliance on F001-PU002 — Dimethoate withholding active until 14 Apr
🟠 HIGH: Harvest gap >7 days on F001-PU001
🟡 MEDIUM: Equipment maintenance due — Tractor service overdue

Action needed on 2 HIGH/CRITICAL alerts.
```

Severity emoji mapping:
- 🔴 Critical
- 🟠 High
- 🟡 Medium
- 🔵 Low

If no alerts: `"No open alerts. Your farm is looking good! Sa rauta."`

---

### Command 8: CHECK_FINANCIALS

**Trigger patterns:**
- "my CoKG"
- "how is my P&L"
- "cost per kilogram"
- "profit on [PU/crop]"
- "financials for [PU]"
- "show me my numbers"

**Entity extraction:**
| Entity | Extraction Method | Required | Default |
|---|---|---|---|
| `pu_id` | PU pattern or crop lookup | No | all active cycles |
| `cycle_id` | Cycle ID pattern | No | active cycle for PU |
| `period` | "this week", "this month", "30 days" | No | current cycle to date |

**API call:**
```http
GET /api/v1/cycles/CY-F001-26-002/financials
```

**Response format (single PU):**
```
F001-PU002 Eggplant Cycle CY-F001-26-002:
💰 CoKG: FJD 1.85/kg
📈 Revenue: FJD 840.00
📊 Margin: 34.2%
💼 Total Cost: FJD 556.56 (Labor: FJD 220.00 | Inputs: FJD 280.00 | Other: FJD 56.56)
🌾 Total Harvest: 452kg over 35 days

Status: AMBER — close to target. Increase harvest volume to improve CoKG.
Target CoKG: FJD 1.60/kg.
```

**Response format (all cycles summary):**
```
Farm F001 — 30-day summary:
Total Revenue: FJD 1,240.00
Total Costs: FJD 890.00
Net Profit: FJD 350.00
Average CoKG: FJD 1.85/kg

Best performer: F001-PU003 Eggplant (CoKG FJD 1.62/kg ✅)
Needs attention: F001-PU002 Eggplant (CoKG FJD 1.85/kg ⚠️)
```

---

### Command 9: CREATE_CYCLE

**Trigger patterns:**
- "start new cycle on [PU]"
- "plant [crop] on [PU]"
- "begin planting [crop]"
- "new crop [crop] on [PU]"

**Entity extraction:**
| Entity | Extraction Method | Required | Default |
|---|---|---|---|
| `pu_id` | PU pattern or last context | Yes | — |
| `crop_name` | Crop name → `production_id` lookup | Yes | — |
| `planting_date` | Date extraction | No | `date.today()` |

**Validation — Rotation Check (mandatory):**

Before creating a cycle, TIS calls rotation validation:

```python
rotation_check = await validate_rotation(
    pu_id=pu_id,
    new_production_id=production_id,
    planned_date=planting_date,
    db=db
)

if rotation_check.status == "BLOCKED":
    alternatives = "\n".join([f"  • {a}" for a in rotation_check.alternatives])
    return TISResponse(
        response_text=(
            f"I cannot create this cycle. {rotation_check.crop_name} cannot follow "
            f"{rotation_check.previous_crop} on {pu_id} — minimum rest period is "
            f"{rotation_check.min_rest_days} days. "
            f"You have {rotation_check.days_remaining} days remaining.\n"
            f"Alternatives for this PU right now:\n{alternatives}\n"
            f"Contact Cody to override if urgent."
        ),
        status="blocked"
    )
```

**API call (if allowed):**
```http
POST /api/v1/rotation/validate
{
  "pu_id": "F001-PU004",
  "production_id": "CRP-TOM",
  "planned_date": "2026-04-08"
}

# If allowed:
POST /api/v1/cycles
{
  "pu_id": "F001-PU004",
  "production_id": "CRP-TOM",
  "planting_date": "2026-04-08",
  "created_by_tis": true
}
```

**Database records created:**
- Table: `production_cycles`, ID: `CY-FARM-YY-###` (e.g., `CY-F001-26-004`)
- Triggers: first stage task generation (Stage 1 tasks auto-assigned to active workers)
- Triggers: rotation registry update

**Confirmation response:**
```
New cycle created: CRP-TOM (Tomato) on F001-PU004.
Cycle ID: CY-F001-26-004. Planting date: 2026-04-08.
Stage 1: Land Preparation. First task assigned.
```

---

### Command 10: CHECK_STOCK

**Trigger patterns:**
- "stock level [input]"
- "how much [input] do we have"
- "do we have enough [input]"
- "inventory check"
- "check supply [input]"
- "what stock do we have" (no specific input — returns all low stock)

**Entity extraction:**
| Entity | Extraction Method | Required | Default |
|---|---|---|---|
| `input_name` | Input name lookup → `input_id` | No | return all low stock if omitted |

**API calls:**

If specific input named:
```http
GET /api/v1/inputs/{input_id}/stock-check
```

If no input specified:
```http
GET /api/v1/inputs/low-stock?farm_id=F001
```

**Response format (specific input):**
```
NPK Fertilizer stock:
✅ Current stock: 80kg
📦 Average usage: ~2.5kg/week
📅 Estimated days remaining: 32 days
Supplier: AgroChem Suva — Last order: 15 Mar 2026
```

**Response format (all low stock):**
```
Stock check:
✅ NPK Fertilizer: 80kg (>30 days supply)
⚠️ Eggplant Seed: 0.5kg (approx 10 days stock — order soon)
🔴 Dimethoate: 0.3L (LOW — reorder needed from Agchem Suva)

1 item needs urgent reorder.
```

Indicators:
- ✅ Sufficient (>21 days estimated)
- ⚠️ Low (7-21 days estimated)
- 🔴 Critical (<7 days estimated, or below reorder threshold)

---

### Command 11: GET_PROTOCOL

**Trigger patterns:**
- "what protocol for [crop/stage]"
- "what should I do on [PU]"
- "crop guide for [crop]"
- "stage protocol for [PU]"
- "how do I [activity] for [crop]"

**Entity extraction:**
| Entity | Extraction Method | Required | Default |
|---|---|---|---|
| `pu_id` | PU pattern or context | No | last PU from context |
| `crop_name` | Crop name | No | derived from pu_id's active cycle |
| `stage_name` | Stage keyword or explicit | No | current stage of active cycle |

**Flow:**
1. If `pu_id` provided: look up active cycle → get current stage
2. Find `production_stage_protocol` linking stage to KB article
3. Retrieve KB article content from `shared.kb_articles`
4. Return formatted protocol from article content

This command routes through the **Knowledge Broker** RAG path for article retrieval, but the entry point is TFOS stage data rather than a free-form query.

```python
# Step 1: Get current stage for PU
cycle = await get_active_cycle(pu_id, db)
current_stage = cycle.current_stage

# Step 2: Get KB article linked to this stage
protocol_link = await db.execute(
    text("""
    SELECT kb_article_id FROM shared.production_stage_protocols
    WHERE production_id = :prod_id AND stage_id = :stage_id
    """),
    {"prod_id": cycle.production_id, "stage_id": current_stage.stage_id}
)

# Step 3: Retrieve article
if protocol_link:
    article = await db.get(KBArticle, protocol_link.kb_article_id)
    # Return article content directly — no vector search needed
    # Article is pre-linked so no similarity threshold applies
```

**Response format:**
```
Protocol for F001-PU002 — Eggplant, Stage 3: Fruiting
[KB-EGG-003]

Key tasks this stage:
1. Pest scouting every 5 days — check for eggplant fruit borer
2. Harvest mature fruit every 3-4 days to maintain plant vigor
3. Avoid waterlogging — reduce irrigation if rainfall > 20mm/day
4. Apply NPK top-dressing at 50g per plant if yellowing observed

Spray protocol (if required):
- Aphids: Imidacloprid 0.3ml/L — wait 7 days before harvest
- Fruit borer: Chlorpyrifos 1ml/L — wait 14 days before harvest

Source: KB-EGG-003 — Eggplant Stage 3 Fruiting Protocol
```

---

### Command 12: REPORT_INCIDENT

**Trigger patterns:**
- "report incident [description]"
- "something was stolen"
- "equipment broken"
- "damage to [PU/equipment]"
- "problem happened on [date]"

**Entity extraction:**
| Entity | Extraction Method | Required | Default |
|---|---|---|---|
| `incident_type` | Keyword: theft, equipment_damage, crop_damage, weather_damage, worker_injury | Yes | `"other"` |
| `pu_id` | PU pattern or context | No | `null` |
| `severity` | "critical", "high", "medium", "low" + keywords | No | `"medium"` |
| `description` | Remaining text | Yes | — |
| `estimated_loss_fjd` | Regex FJD amount | No | `null` |

**API call:**
```http
POST /api/v1/incidents
{
  "incident_type": "theft",
  "pu_id": "F001-PU002",
  "severity": "high",
  "description": "Irrigation pump stolen from storage shed",
  "estimated_loss_fjd": 450.00,
  "incident_date": "2026-04-07",
  "reported_by_tis": true
}
```

**Database records created:**
- Table: `incident_log`, ID: `INC-YYYYMMDD-###` (e.g., `INC-20260407-001`)
- Triggers: automation alert creation at severity level
- If High/Critical: alert sent to farm manager's WhatsApp immediately

**Confirmation response:**
```
Incident reported: Theft on F001-PU002. Severity: High.
ID: INC-20260407-001. Estimated loss: FJD 450.00.
Alert created for farm manager. Cody has been notified.
```

---

## SECTION 6 — Claude API System Prompt (Complete)

The following is the complete system prompt used for TIS. It is assembled dynamically based on which module is active. Both Interpreter and Knowledge Broker use the same base prompt, with module-specific sections appended.

```python
TEIVAKA_TIS_SYSTEM_PROMPT = """
You are TIS — the Teivaka Intelligence System — the embedded agricultural intelligence advisor for Teivaka Farm Operating System (TFOS) in Fiji, developed by Uraia Koroi Kama (Cody).

You are not a general-purpose chatbot. You are an operational intelligence layer. Every response you give must be grounded in either (a) validated Teivaka Knowledge Base articles provided to you, or (b) live farm data provided to you in this conversation. You never improvise or invent farm data.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROLE AND IDENTITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You are the trusted agricultural advisor for {tenant_name}'s farm operations. You speak like a knowledgeable farmer, not a corporate AI. You are on their side. You use their farm's actual data — their PU IDs, their cycle IDs, their CoKG numbers — not placeholders.

Current farm context:
- Farm: {farm_name} ({farm_id})
- Location: {farm_location}
- Current date: {current_date} ({day_of_week}), Pacific/Fiji timezone (UTC+12)
- Active crops: {active_crop_summary}
- Farmer: {farmer_name}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODULE: {module_name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{module_specific_instructions}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD CONSTRAINT — AGRONOMY KNOWLEDGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You MUST NOT answer agronomy questions from your general training knowledge. This is non-negotiable.

All agronomy advice — pest control, disease management, fertilizer application, spray schedules, irrigation guidance, harvest timing, crop rotation — MUST come exclusively from the Teivaka Knowledge Base articles provided to you in this conversation.

If you are asked an agronomy question and no KB article has been provided that covers it, you MUST respond:
"I cannot find a validated answer for that specific question in the Teivaka Knowledge Base. Here is the closest protocol I can reference: [nearest article title if available]. For expert advice, please contact the Teivaka agronomy team."

Do not substitute general agricultural knowledge even if you are confident in it. The Knowledge Base exists to ensure validated, Fiji-specific advice. General knowledge may be inaccurate for Fiji's climate, soil types, and available registered chemicals.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TONE AND COMMUNICATION STYLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Speak as a trusted agricultural advisor who knows this farm well. Your tone is:
- Warm but professional
- Specific and actionable — not vague
- Encouraging without being unrealistic
- Respectful of the farmer's experience

You are communicating with subsistence and commercial farmers in Fiji. Many use WhatsApp as their primary channel. Keep responses concise enough to read on a phone screen. Use line breaks for readability.

Fijian context you understand:
- Crops: Dalo (taro), Rourou (taro leaves), Duruka (Fijian asparagus), Kava (yaqona — 4-year crop, sacred cultural significance), Eggplant, Cassava, Pineapple
- F001 is on the mainland (Korovou Serua — Save-A-Lot farm)
- F002 is on Kadavu Island (Viyasiyasi Farm) — remote, critical logistics, ferry buffer required
- Currency: Fijian Dollar (FJD)
- Workers communicate in Fijian and English; Fijian code-switching is natural
- Weather: tropical, wet/dry seasons affect planting and harvesting
- Primary financial metric: CoKG (Cost of Goods per Kilogram)

Fijian words you may use naturally in responses:
- Vinaka — Thank you / Well done
- Sa rauta — That's enough / That'll do / Good
- Io — Yes
- Sa vakacaucautaki — It has been completed
- Bula — Hello / greeting (use sparingly)
- Moce — Goodbye (use sparingly)
- Yaqona — Kava (formal name)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE FORMAT GUIDELINES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Always use the actual IDs from the data: "F001-PU002", "CY-F001-26-002", "W-001 Laisenia Waqa"
- Lead with the most important information (CoKG, critical alerts, compliance issues)
- Use FJD for all monetary values — always specify the currency
- Dates: use "7 Apr" or "7 Apr 2026" format (not ISO-8601 in responses)
- For financial data: show both the number and its status (GREEN/AMBER/RED)
- Keep responses under 150 words for simple commands, under 250 words for explanations
- Use emoji sparingly for status indicators: ✅ 🔴 ⚠️ 🟡 — not decoratively
- Never use markdown headers (##) in WhatsApp responses — use plain text with line breaks

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT TIS MUST NEVER DO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. NEVER hallucinate crop data, yields, prices, or financial figures not provided in this conversation
2. NEVER make up or invent prices per kilogram — always use data from price_master or explicitly say "price not available"
3. NEVER recommend chemicals not listed in the Teivaka Knowledge Base or shared.chemical_library
4. NEVER recommend pesticide brands, dosages, or application methods from general training knowledge
5. NEVER give medical advice, even if a worker health issue is mentioned — refer to medical professionals
6. NEVER give legal advice — refer to appropriate Fiji authorities
7. NEVER give financial investment advice beyond farm operational scope
8. NEVER discuss data from other tenants — each farm's data is strictly confidential
9. NEVER speculate about market prices, commodity trends, or future prices
10. NEVER override or minimize a chemical compliance warning — these protect human health and legal compliance
11. NEVER bypass a rotation block — these protect soil health and crop viability
12. NEVER tell a farmer to ignore an alert — explain it and recommend action instead

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIMARY FINANCIAL METRIC: CoKG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CoKG = (Total Labor Cost + Total Input Cost + Total Other Cost) / Total Harvest Quantity (kg)

This is the core health metric for every production cycle. When explaining farm performance:
- Always surface CoKG first
- Always compare to the target CoKG for that crop
- Explain what is driving CoKG (too much labor? low harvest volume? high input costs?)
- Suggest the specific action that would most improve CoKG

CoKG RAG status:
- GREEN: CoKG ≤ target
- AMBER: CoKG is 0-20% above target
- RED: CoKG > 20% above target

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE FARM DATA (injected per call)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{farm_context_json}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END OF SYSTEM PROMPT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

# Module-specific instruction blocks appended to the base prompt:

KNOWLEDGE_BROKER_MODULE_INSTRUCTIONS = """
You are operating as the KNOWLEDGE BROKER module.

Your job: Answer the farmer's agronomy question using ONLY the Knowledge Base articles provided below in this conversation.

Rules:
1. Cite the article ID (e.g., KB-EGG-003) in your response
2. If the provided articles do not clearly answer the question, return the not-found response
3. Do not supplement with general agricultural knowledge
4. Format your answer as actionable steps, not a lecture
5. If multiple articles are relevant, synthesize them but cite all
"""

OPERATIONAL_INTERPRETER_MODULE_INSTRUCTIONS = """
You are operating as the OPERATIONAL INTERPRETER module.

Your job: Explain the live farm data provided in this conversation to the farmer in clear, natural language.

Rules:
1. Use ONLY the data provided in the farm_context_json — do not invent figures
2. Reference specific PU IDs, cycle IDs, and worker IDs
3. Lead with CoKG — it is always the primary metric
4. Explain what the data means in practical terms — not just what it is
5. Recommend the single most impactful action the farmer can take right now
6. Surface any RED or CRITICAL items immediately, regardless of what was asked
7. If asked about data that is not in the context, say "I don't have that data available right now"
"""
```

---

## SECTION 7 — Conversation History Management

### Overview

TIS maintains conversational context across turns within a session. This allows the farmer to ask follow-up questions without repeating context ("what about PU003?" after discussing PU002).

### Storage

**Table: `tis_conversations`**

```sql
CREATE TABLE tis_conversations (
    conversation_id     VARCHAR(26) PRIMARY KEY,  -- ULID
    tenant_id           VARCHAR(10) NOT NULL,
    user_id             INTEGER NOT NULL,
    farm_id             VARCHAR(10) NOT NULL,
    started_at          TIMESTAMPTZ DEFAULT NOW(),
    last_activity_at    TIMESTAMPTZ DEFAULT NOW(),
    last_pu_context     VARCHAR(20),               -- last PU discussed
    turn_count          INTEGER DEFAULT 0,
    is_active           BOOLEAN DEFAULT true,
    CONSTRAINT fk_tis_conv_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
    CONSTRAINT fk_tis_conv_user FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE tis_conversation_turns (
    turn_id             VARCHAR(26) PRIMARY KEY,  -- ULID
    conversation_id     VARCHAR(26) NOT NULL REFERENCES tis_conversations(conversation_id),
    turn_number         INTEGER NOT NULL,
    role                VARCHAR(10) NOT NULL,      -- 'user' or 'assistant'
    content             TEXT NOT NULL,
    module_used         VARCHAR(30),               -- which TIS module handled this turn
    command_id          VARCHAR(26),               -- linked ai_commands record
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (conversation_id, turn_number)
);
```

### History Retrieval

```python
async def get_conversation_history(
    conversation_id: str,
    db: AsyncSession,
    max_turns: int = 10
) -> list[dict]:
    """
    Returns the last N turns of conversation in Claude API message format.
    Turns are ordered oldest-first (Claude requires chronological order).
    """
    turns = await db.execute(
        text("""
        SELECT role, content
        FROM tis_conversation_turns
        WHERE conversation_id = :conv_id
        ORDER BY turn_number DESC
        LIMIT :max_turns
        """),
        {"conv_id": conversation_id, "max_turns": max_turns * 2}  # *2 for user+assistant pairs
    )

    turns_list = turns.fetchall()
    # Reverse to chronological order for Claude
    return [{"role": t.role, "content": t.content} for t in reversed(turns_list)]
```

### Context Window Management

- **Maximum turns retained in API call:** 10 (5 user turns + 5 assistant turns)
- **Older turns:** stored in database but not sent to Claude API
- **Turn count enforcement:** oldest turns are dropped from the API call window when count > 10
- **Storage:** all turns stored permanently in `tis_conversation_turns` for audit and analytics
- **Context does not expire** during an active session (last activity < 30 minutes)
- **New session:** if `last_activity_at` > 30 minutes ago, a new `conversation_id` is created

### Context Reset

The farmer can explicitly reset conversation context:
- Command: "start fresh" | "reset" | "new conversation" | "forget that"
- Behavior: sets `is_active = false` on current conversation, starts new conversation
- Previous turns are preserved in database (not deleted), just no longer sent to Claude

### Contextual Awareness (Last PU Memory)

TIS remembers which PU was most recently discussed:

```python
async def update_pu_context(conversation_id: str, pu_id: str, db: AsyncSession):
    await db.execute(
        text("UPDATE tis_conversations SET last_pu_context = :pu_id WHERE conversation_id = :conv_id"),
        {"pu_id": pu_id, "conv_id": conversation_id}
    )
    await db.commit()
```

When a farmer says "what about that PU?" or "harvest it now" without specifying a PU, TIS uses `last_pu_context` as the implicit target. If no context exists, TIS asks: "Which PU are you referring to?"

---

## SECTION 8 — Rate Limiting Implementation

### Architecture

Rate limiting is enforced using Redis atomic increment counters. The counter is per user per calendar day (UTC+12, Pacific/Fiji).

### Implementation

```python
import redis.asyncio as redis
from datetime import date
from fastapi import HTTPException

class TISRateLimiter:

    DAILY_LIMITS = {
        "free":    5,
        "basic":   20,
        "premium": 999999,
        "custom":  999999,
    }

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

    async def check_and_increment(
        self,
        user_id: int,
        subscription_tier: str
    ) -> dict:
        """
        Checks if user is within daily limit. Increments counter if allowed.
        Returns dict with current count, limit, and remaining calls.
        Raises TISRateLimitError if limit exceeded.
        """
        # Use Fiji date for the counter key (UTC+12)
        fiji_today = get_fiji_date()
        key = f"tis:calls:{user_id}:{fiji_today.isoformat()}"

        # Atomic increment — returns new value after increment
        current_count = await self.redis.incr(key)

        # Set TTL on first increment (86400s = 24h; will naturally expire)
        if current_count == 1:
            await self.redis.expire(key, 86400)

        daily_limit = self.DAILY_LIMITS.get(subscription_tier, 5)

        if current_count > daily_limit:
            # Decrement back — don't charge a call that was rejected
            await self.redis.decr(key)
            raise TISRateLimitError(
                user_id=user_id,
                subscription_tier=subscription_tier,
                daily_limit=daily_limit,
                message=build_rate_limit_message(subscription_tier, daily_limit)
            )

        return {
            "calls_today": current_count,
            "daily_limit": daily_limit,
            "calls_remaining": daily_limit - current_count,
            "reset_at": "midnight Pacific/Fiji"
        }

    async def get_current_usage(self, user_id: int) -> int:
        fiji_today = get_fiji_date()
        key = f"tis:calls:{user_id}:{fiji_today.isoformat()}"
        count = await self.redis.get(key)
        return int(count) if count else 0


def build_rate_limit_message(tier: str, limit: int) -> str:
    upgrade_messages = {
        "free":  f"Daily TIS limit reached ({limit} queries/day on Free plan). Upgrade to BASIC for 20 queries/day.",
        "basic": f"Daily TIS limit reached ({limit} queries/day on Basic plan). Upgrade to PREMIUM for unlimited queries.",
    }
    return upgrade_messages.get(tier, f"Daily TIS limit of {limit} queries reached.")
```

### Rate Limit Response

When a rate limit is exceeded, TIS returns:
```
Daily TIS limit reached (5 queries/day on Free plan).
Upgrade to BASIC for 20 queries/day.
Your counter resets at midnight Fiji time.
Contact Cody to upgrade your plan.
```

### Rate Limit Headers

API responses include rate limit headers for PWA display:
```
X-TIS-Calls-Today: 4
X-TIS-Daily-Limit: 5
X-TIS-Calls-Remaining: 1
```

### Note on Command Executor

The Command Executor does not make Claude API calls — however, it still counts against the daily TIS limit. This is intentional: the limit governs TIS system usage, not just AI API costs. Rate limiting at the TIS entry point protects system resources broadly.

---

## SECTION 9 — Voice Pipeline (Complete Implementation)

### Overview

The voice pipeline converts a field worker's spoken command into a TFOS action in under 5 seconds. It runs asynchronously via Celery to avoid blocking the HTTP response.

### Step 1: PWA Audio Recording

The Progressive Web App records audio using the Web Audio API:

```javascript
// PWA voice recording (frontend)
const constraints = { audio: true };
const stream = await navigator.mediaDevices.getUserMedia(constraints);

// Prefer webm/opus for efficiency; fallback to mp4/aac for iOS Safari
const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/mp4';

const mediaRecorder = new MediaRecorder(stream, { mimeType });
const chunks = [];

mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
mediaRecorder.onstop = async () => {
    const audioBlob = new Blob(chunks, { type: mimeType });
    await submitVoiceCommand(audioBlob);
};

// Start recording — stop after 60 seconds max or when user releases button
mediaRecorder.start();
```

### Step 2: Submit to API

```javascript
async function submitVoiceCommand(audioBlob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'command.webm');
    formData.append('farm_id', currentFarmId);
    formData.append('pu_id', lastActivePuId || '');

    const response = await fetch('/api/v1/tis/command', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        body: formData
    });

    const { command_id } = await response.json();
    // Begin polling or await WebSocket push
    pollForResult(command_id);
}
```

### Step 3: FastAPI Endpoint — Save Audio

```python
@router.post("/api/v1/tis/command")
async def submit_tis_command(
    audio: Optional[UploadFile] = File(None),
    text_input: Optional[str] = Form(None),
    farm_id: str = Form(...),
    pu_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis_client: Redis = Depends(get_redis)
):
    # Rate limit check
    await tis_rate_limiter.check_and_increment(
        user_id=current_user.user_id,
        subscription_tier=current_user.subscription_tier
    )

    command_id = generate_ulid()

    if audio:
        # Save audio to Supabase Storage
        audio_bytes = await audio.read()

        # Validate size
        if len(audio_bytes) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
            raise HTTPException(400, "Audio file too large")

        storage_path = (
            f"voice-logs/{current_user.tenant_id}/"
            f"{date.today().isoformat()}/"
            f"{command_id}.webm"
        )

        audio_url = await supabase_storage.upload(
            bucket=settings.SUPABASE_BUCKET_NAME,
            path=storage_path,
            file_bytes=audio_bytes,
            content_type=audio.content_type
        )

        # Create voice log record
        voice_log = TISVoiceLog(
            voice_log_id=generate_ulid(),
            command_id=command_id,
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            farm_id=farm_id,
            audio_url=audio_url,
            storage_path=storage_path,
            status="pending_transcription"
        )
        db.add(voice_log)
        await db.commit()

        # Queue Celery task
        process_voice_command.delay(
            voice_log_id=str(voice_log.voice_log_id),
            farm_id=farm_id,
            pu_id_context=pu_id,
            user_id=current_user.user_id,
            tenant_id=current_user.tenant_id
        )

    elif text_input:
        # Text input — queue directly
        process_tis_command.delay(
            command_id=command_id,
            input_text=text_input,
            input_source="text",
            farm_id=farm_id,
            pu_id_context=pu_id,
            user_id=current_user.user_id,
            tenant_id=current_user.tenant_id
        )

    return {"command_id": command_id, "status": "processing"}
```

### Step 4: Celery Task — Voice Processing

```python
@celery_app.task(
    bind=True,
    queue='ai',
    max_retries=2,
    default_retry_delay=5
)
def process_voice_command(self, voice_log_id: str, farm_id: str, pu_id_context: str, user_id: int, tenant_id: str):
    """
    Downloads audio, transcribes with Whisper, routes to TIS pipeline.
    Runs on worker-ai queue (AI-dedicated Celery worker).
    """
    import asyncio
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(
        _async_process_voice_command(voice_log_id, farm_id, pu_id_context, user_id, tenant_id)
    )

async def _async_process_voice_command(voice_log_id, farm_id, pu_id_context, user_id, tenant_id):
    async with get_db_session() as db:
        voice_log = await db.get(TISVoiceLog, voice_log_id)
        voice_log.status = "transcribing"
        await db.commit()
```

### Step 5–6: Download Audio from Supabase

```python
        # Download audio from Supabase Storage
        audio_bytes = await supabase_storage.download(
            bucket=settings.SUPABASE_BUCKET_NAME,
            path=voice_log.storage_path
        )

        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = "command.webm"
```

### Step 7: Whisper API Transcription

```python
        openai_client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        transcript_response = await openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language="en",           # English — Whisper handles Fijian code-switching naturally
            temperature=0,           # Deterministic for commands
            prompt=(
                "Fiji farm operations. Crops: eggplant, cassava, pineapple, kava, dalo. "
                "Workers: Laisenia, Maika, Maciu, Rusiate, Vairusi, Naita, Marika, Apisai. "
                "Farm locations: Korovou Serua, Kadavu. "
                "Terms: harvest, labor, fertilizer, spray, NPK, CoKG, PU, cycle. "
                "Currency: FJD Fijian dollars."
            )
        )

        transcript = transcript_response.text.strip()
```

**Whisper parameters explained:**
- `model: "whisper-1"` — current production Whisper model
- `language: "en"` — primary language is English; Fijian words (Vinaka, yaqona, etc.) are handled naturally without switching to language detection mode
- `temperature: 0` — deterministic output critical for command parsing (no variation between identical inputs)
- `prompt` — provides agricultural vocabulary context to improve recognition of farm-specific terms; Whisper uses this as a prior for vocabulary

**Cost note:** Whisper costs approximately USD $0.006/minute ($0.0001/second). A typical 10-second farm command costs ~USD $0.001. At 100 voice commands/day across all users, monthly cost ≈ USD $3.00.

### Step 8: Store Transcript

```python
        voice_log.whisper_transcript = transcript
        voice_log.transcription_completed_at = datetime.utcnow()
        voice_log.status = "transcribed"
        await db.commit()
```

### Step 9: Confidence Check

```python
        # Basic quality check on transcript
        word_count = len(transcript.split())

        if not transcript or word_count < 3:
            voice_log.status = "transcription_failed"
            await db.commit()

            await deliver_tis_response(
                user_id=user_id,
                command_id=voice_log.command_id,
                response_text=(
                    "Could not understand audio. Please try again or type your message."
                ),
                status="error"
            )
            return
```

### Step 10–11: Route to TIS Processing

```python
        # Route to full TIS pipeline with transcribed text
        await process_tis_command_async(
            command_id=voice_log.command_id,
            input_text=transcript,
            input_source="voice",
            voice_log_id=voice_log_id,
            farm_id=farm_id,
            pu_id_context=pu_id_context,
            user_id=user_id,
            tenant_id=tenant_id
        )
```

### Step 12: Response Delivery

TIS delivers the response via the appropriate channel based on the request source:

```python
async def deliver_tis_response(
    user_id: int,
    command_id: str,
    response_text: str,
    status: str,
    input_source: str,
    db: AsyncSession
):
    # 1. Always store in ai_commands for polling
    await update_command_result(command_id, response_text, status, db)

    # 2. WebSocket push if user is online
    ws_delivered = await websocket_manager.send_to_user(
        user_id=user_id,
        message={
            "type": "tis_response",
            "command_id": command_id,
            "response": response_text,
            "status": status
        }
    )

    # 3. WhatsApp delivery if request came via WhatsApp
    if input_source == "whatsapp":
        user = await get_user(user_id, db)
        await twilio_client.messages.create_async(
            from_=settings.TWILIO_WHATSAPP_FROM,
            to=f"whatsapp:{user.phone_number}",
            body=response_text
        )

    # 4. If WebSocket delivery failed and not WhatsApp: response available via polling
    if not ws_delivered and input_source != "whatsapp":
        # Response stored in ai_commands — PWA polls GET /api/v1/tis/status/{command_id}
        pass
```

### Polling Endpoint

```python
@router.get("/api/v1/tis/status/{command_id}")
async def get_tis_command_status(
    command_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    command = await db.get(AICommand, command_id)
    if not command or command.user_id != current_user.user_id:
        raise HTTPException(404)

    return {
        "command_id": command_id,
        "status": command.status,      # "processing" | "complete" | "error"
        "response": command.response_text if command.status == "complete" else None,
        "module_used": command.module_used,
        "processing_time_ms": command.processing_time_ms
    }
```

---

## SECTION 10 — Cost Controls

### Per-Module Token Limits

| Module | Max Output Tokens | Reason |
|---|---|---|
| Knowledge Broker | 600 | Concise protocols — farmers need steps, not essays |
| Operational Interpreter | 800 | Explanations can be slightly longer but still mobile-friendly |
| Command Executor | 0 (no LLM call) | Pure execution — no AI needed |

Input tokens (prompt + context) are variable but controlled by:
- Farm context JSON is pre-filtered (only relevant cycle data, not full database dump)
- Conversation history capped at 10 turns
- KB context capped at 3 articles × ~500 words each

### Estimated Token Usage per Call

| Component | Approximate Tokens |
|---|---|
| System prompt | ~800 tokens |
| Farm context JSON | ~500-800 tokens |
| Conversation history (10 turns) | ~1,000-2,000 tokens |
| User query | ~20-50 tokens |
| KB articles (Knowledge Broker only) | ~1,000-1,500 tokens |
| **Total input per call** | ~2,500-5,000 tokens |
| **Output (max)** | 600-800 tokens |

At claude-sonnet-4-20250514 pricing, a typical TIS call costs approximately USD $0.01-0.02.

### Estimated Monthly Cost by Tier

| Tier | Call Volume | Estimated Monthly Cost (per farm) |
|---|---|---|
| FREE | ≤5 calls/day × ~20 active days = 100 calls/month | ~USD $1-2 / ~FJD 2/month |
| BASIC | ≤20 calls/day × ~25 active days = 500 calls/month | ~USD $7-10 / ~FJD 15/month |
| PREMIUM | ~50 calls/day × 30 days = 1,500 calls/month | ~USD $20-30 / ~FJD 50/month |
| CUSTOM | Variable | Negotiated |

These are operational AI API costs. Subscription pricing must cover these costs plus infrastructure and margin.

### AI Cost Reduction Strategies

1. **Command Executor makes no Claude API calls** — the highest-frequency user actions (log labor, log harvest) cost nothing in AI API fees

2. **Weekly batch insights** — the AI insights generation (farm health summaries, trend analysis) runs once per week as a Celery beat task, not on every query. This prevents the most expensive AI operation from running per-request.

3. **Aggressive token limits** — 600/800 token output caps prevent Claude from producing long responses that cost more but add less value for mobile users

4. **Confidence threshold gate** — Knowledge Broker returns fixed response (no Claude call) when similarity < 0.65, eliminating the API call for questions TIS cannot answer confidently

5. **Rate limits** — per-user daily limits prevent runaway costs from automated scripts or misbehaving clients

6. **Whisper cost control** — audio capped at 60 seconds maximum; typical farm command is 5-15 seconds. Audio stored in Supabase (not re-transcribed). Cost per voice command: ~USD $0.001.

### Weekly Batch Insight Generation

The weekly AI insights job runs every Sunday at 06:00 Fiji time (Celery beat schedule):

```python
@celery_app.task(queue='ai')
def generate_weekly_farm_insights():
    """
    Generates AI-powered insights for all active farms.
    Runs once per week — not per user query.
    Results stored in ai_insights table and surfaced in dashboard.
    """
    for tenant in get_active_tenants():
        for farm in tenant.farms:
            context = assemble_weekly_context(farm.farm_id)
            insights = call_claude_for_insights(context, max_tokens=1000)
            store_ai_insights(farm.farm_id, insights)
```

Insights stored in `ai_insights` are then served from the database on dashboard load — no real-time AI call needed.
"""

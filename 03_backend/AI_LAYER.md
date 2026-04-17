# FILE: 03_backend/AI_LAYER.md

# Teivaka AI Layer — Technical Implementation Reference

**Platform:** Teivaka Agricultural TOS (Agri-TOS), Fiji
**Version:** 1.0
**Date:** 2026-04-07

This document covers the complete technical implementation of the Teivaka AI layer: Claude API integration, system prompt templates, farm context assembly, Knowledge Base RAG with pgvector, AI insights storage, the FarmClaw WhatsApp bot, and all supporting infrastructure.

---

## 1. Claude API Integration

### SDK Setup

Teivaka uses the official Anthropic Python SDK with async support. All AI calls are async to avoid blocking FastAPI event loop.

```python
# app/services/ai/claude_client.py

import anthropic
from app.core.config import settings

# Single async client instance — reused across requests
anthropic_client = anthropic.AsyncAnthropic(
    api_key=settings.ANTHROPIC_API_KEY,
    timeout=30.0,           # 30-second timeout for all calls
    max_retries=2,          # built-in retry on transient errors
)

# Default model — configured via environment variable
CLAUDE_MODEL = settings.CLAUDE_MODEL   # claude-sonnet-4-20250514
```

### Core API Call Function

```python
# app/services/ai/claude_client.py

import json
import time
import logging
from typing import Optional
from anthropic import AsyncAnthropic, APITimeoutError, RateLimitError, APIStatusError

logger = logging.getLogger(__name__)


async def call_claude(
    system_prompt: str,
    messages: list[dict],
    max_tokens: int,
    temperature: float = 1.0,
    module: str = "unknown"
) -> tuple[str, dict]:
    """
    Calls Claude API with error handling, logging, and timing.

    Returns:
        tuple: (response_text: str, usage: dict with input_tokens, output_tokens)

    Raises:
        TISAPIError on unrecoverable errors
    """
    start_time = time.monotonic()

    try:
        response = await anthropic_client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=messages
        )

        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        response_text = response.content[0].text

        usage = {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
            "total_tokens": response.usage.input_tokens + response.usage.output_tokens,
            "processing_time_ms": elapsed_ms
        }

        logger.info(
            f"Claude API call | module={module} | "
            f"input={usage['input_tokens']} | output={usage['output_tokens']} | "
            f"time={elapsed_ms}ms"
        )

        return response_text, usage

    except APITimeoutError:
        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        logger.error(f"Claude API timeout after {elapsed_ms}ms | module={module}")
        raise TISAPIError(
            "AI response timed out. Please try again.",
            error_code="CLAUDE_TIMEOUT"
        )

    except RateLimitError as e:
        logger.warning(f"Claude API rate limit hit | module={module} | error={e}")
        # Retry with exponential backoff is handled by SDK max_retries=2
        # If we reach here, retries were exhausted
        raise TISAPIError(
            "AI service temporarily busy. Please try again in a moment.",
            error_code="CLAUDE_RATE_LIMIT"
        )

    except APIStatusError as e:
        if e.status_code == 529:  # Overloaded
            logger.warning(f"Claude API overloaded | module={module}")
            raise TISAPIError(
                "AI service is currently overloaded. Please try again shortly.",
                error_code="CLAUDE_OVERLOADED"
            )
        logger.error(f"Claude API error {e.status_code} | module={module} | {e.message}")
        raise TISAPIError(
            f"AI service error. Our team has been notified.",
            error_code=f"CLAUDE_{e.status_code}"
        )


class TISAPIError(Exception):
    def __init__(self, message: str, error_code: str = "UNKNOWN"):
        self.message = message
        self.error_code = error_code
        super().__init__(message)
```

---

## 2. Complete System Prompt Template

The full Python string for the TIS system prompt, with all variable placeholders. This is assembled at call time using `build_system_prompt()`.

```python
# app/services/ai/prompts.py

from datetime import datetime
import json
from typing import Optional


def build_system_prompt(
    module: str,          # "KNOWLEDGE_BROKER" | "OPERATIONAL_INTERPRETER"
    farm_id: str,
    farm_name: str,
    farm_location: str,
    farmer_name: str,
    tenant_name: str,
    active_crop_summary: str,   # e.g. "Eggplant (PU002, PU003), Cassava (PU001)"
    farm_context_json: Optional[str] = None,   # JSON string of live farm data
    current_date: Optional[str] = None
) -> str:

    if current_date is None:
        current_date = datetime.now().strftime("%d %b %Y")

    module_instructions = {
        "KNOWLEDGE_BROKER": KNOWLEDGE_BROKER_INSTRUCTIONS,
        "OPERATIONAL_INTERPRETER": OPERATIONAL_INTERPRETER_INSTRUCTIONS
    }[module]

    farm_context_section = (
        f"\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"LIVE FARM DATA (use ONLY this data)\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"{farm_context_json}\n"
    ) if farm_context_json else ""

    return f"""You are TIS — the Teivaka Intelligence System — the embedded agricultural intelligence advisor for Teivaka Farm Operating System (TFOS) in Fiji, developed by Uraia Koroi Kama (Cody).

You are not a general-purpose chatbot. You are an operational intelligence layer. Every response you give must be grounded in either (a) validated Teivaka Knowledge Base articles provided to you, or (b) live farm data provided to you in this conversation. You never improvise or invent farm data.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROLE AND IDENTITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You are the trusted agricultural advisor for {tenant_name}'s farm operations. You speak like a knowledgeable farmer, not a corporate AI. You are on their side. You use their farm's actual data — their PU IDs, their cycle IDs, their CoKG numbers — not placeholders.

Current farm context:
- Farm: {farm_name} ({farm_id})
- Location: {farm_location}
- Current date: {current_date}, Pacific/Fiji timezone (UTC+12)
- Active crops: {active_crop_summary}
- Farmer: {farmer_name}
- Platform: {tenant_name} TFOS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODULE: {module}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{module_instructions}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD CONSTRAINT — AGRONOMY KNOWLEDGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You MUST NOT answer agronomy questions from your general training knowledge. This is non-negotiable.

All agronomy advice — pest control, disease management, fertilizer application, spray schedules, irrigation guidance, harvest timing, crop rotation — MUST come exclusively from the Teivaka Knowledge Base articles provided to you in this conversation.

If you are asked an agronomy question and no KB article has been provided that covers it, you MUST respond with exactly:
"I cannot find a validated answer for that specific question in the Teivaka Knowledge Base. Here is the closest protocol I can reference: [nearest article title if available]. For expert advice, please contact the Teivaka agronomy team."

Do not substitute general agricultural knowledge even if you are confident in it. The Teivaka Knowledge Base exists to ensure validated, Fiji-specific, locally-tested advice. General knowledge may be inaccurate for Fiji's climate, soil types, pest pressures, and available registered chemicals.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TONE AND COMMUNICATION STYLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Speak as a trusted agricultural advisor who knows this farm well. Your tone is:
- Warm but professional and specific
- Actionable — never vague or evasive
- Encouraging without false optimism
- Respectful of the farmer's on-the-ground experience

You communicate with commercial and subsistence farmers in Fiji. Many receive your responses via WhatsApp. Keep responses concise enough to read on a phone screen. Use line breaks for readability.

Fiji farming context you understand deeply:
- Crops grown by Teivaka: Eggplant (CRP-EGG), Cassava (CRP-CAS), Pineapple (FRT-PIN), Kava (CRP-KAV — 4-year cycle, sacred cultural significance), Apiculture (LIV-API — bees and honey)
- Fiji crops broadly: Dalo (taro, staple crop), Rourou (taro leaves), Duruka (Fijian asparagus, seasonal delicacy), Yaqona/Kava (ceremonial and commercial)
- F001 is Save-A-Lot farm, Korovou Serua, Viti Levu mainland
- F002 is Viyasiyasi Farm, Kadavu Island — remote location, all supply logistics require ferry, minimum 7-day buffer required for any input orders
- Currency: Fijian Dollar (FJD). All monetary values in FJD unless specified.
- Workers: Laisenia Waqa (W-001), Maika Ratubaba (W-002), Maciu Tuilau (W-003), Rusiate Wadali (W-004), Vairusi Tokoni (W-005), Naita Mosese (W-006), Marika (W-007), Crew-Nayan Group (W-008), Apisai (W-009)
- Weather: Tropical maritime climate. Wet season (Nov-Apr) affects harvesting, disease pressure, and logistics. Dry season (May-Oct) is primary production season.
- Primary financial metric: CoKG (Cost of Goods per Kilogram) — the measure of production efficiency

Fijian words you may use naturally (never force them, they should feel genuine):
- Vinaka — Thank you / Well done
- Sa rauta — That's enough / That'll do / Good
- Io — Yes
- Sa vakacaucautaki — It has been completed
- Bula — Hello (use only as greeting, not in operational responses)
- Yaqona — Kava (traditional/formal name)
- Lovo — traditional earth oven (cultural context only)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE FORMAT GUIDELINES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Always use actual IDs from the data: "F001-PU002", not "your PU"
- Lead with the most important information (CoKG, critical alerts, compliance issues)
- All monetary values in FJD — always write "FJD" not "$"
- Dates in human format: "7 Apr" or "7 Apr 2026" — not ISO-8601 in responses
- For financial data: always pair the number with its status: "FJD 1.85/kg (AMBER)"
- Keep responses under 150 words for commands, under 250 words for explanations
- Use status emoji for visual scanning: ✅ 🔴 ⚠️ 🟡 🟢 — purposefully, not decoratively
- Do NOT use markdown headers (##, ###) in responses — farmers read these on WhatsApp
- Use plain line breaks and dashes for structure, not markdown formatting
- Never end a response without a clear next action or "sa rauta" if nothing is needed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIMARY FINANCIAL METRIC: CoKG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CoKG (Cost of Goods per Kilogram) = (Total Labor Cost + Total Input Cost + Total Other Cost) / Total Harvest Quantity in kg

This is the core health metric for every production cycle. When explaining farm performance:
- Always surface CoKG first
- Compare to the target CoKG for that crop
- Explain what is driving CoKG — too much labor? Low harvest volume? High input costs?
- Suggest the single most impactful action that would improve CoKG

CoKG RAG status thresholds:
- GREEN: CoKG is at or below target
- AMBER: CoKG is 0-20% above target — monitor and act
- RED: CoKG is more than 20% above target — urgent action required

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT TIS MUST NEVER DO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. NEVER hallucinate crop data, yields, prices, or financial figures not in this conversation
2. NEVER invent prices per kilogram — use price_master data or say "price not available"
3. NEVER recommend chemicals not in the Teivaka Knowledge Base or chemical_library
4. NEVER recommend pesticide brands, dosages, or application rates from general training knowledge
5. NEVER give medical advice — refer to medical professionals if a worker health issue is raised
6. NEVER give legal advice — refer to appropriate Fiji government authorities
7. NEVER give financial investment advice beyond farm operational scope
8. NEVER discuss or reveal data from other tenants or farms — strict data isolation
9. NEVER speculate on future market prices or commodity trends
10. NEVER override or downplay a chemical compliance warning — these protect human health
11. NEVER advise bypassing a rotation block — these protect soil health and crop viability
12. NEVER tell a farmer to ignore an alert — always explain it and recommend a response
13. NEVER fabricate worker names, IDs, or hours
14. NEVER suggest a planting date without checking rotation first
{farm_context_section}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END OF SYSTEM PROMPT — TIS v1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"""


KNOWLEDGE_BROKER_INSTRUCTIONS = """You are operating as the KNOWLEDGE BROKER module.

Your job: Answer the farmer's agronomy question using ONLY the Teivaka Knowledge Base articles provided in this conversation.

Rules:
1. ALWAYS cite the article ID (e.g., KB-EGG-003) in your response
2. If the provided articles do not clearly answer the question — return the standard not-found response. Do not attempt to answer anyway.
3. Do not supplement KB content with general agricultural knowledge
4. Format answers as actionable steps (1, 2, 3...) where possible — not essays
5. If multiple articles are relevant, synthesize them but cite all article IDs used
6. Keep responses under 150 words — farmers need protocol steps, not textbook explanations
7. If a chemical is mentioned in the KB article, include the withholding period prominently"""


OPERATIONAL_INTERPRETER_INSTRUCTIONS = """You are operating as the OPERATIONAL INTERPRETER module.

Your job: Explain the live farm data provided in this conversation to the farmer in clear, practical language.

Rules:
1. Use ONLY the data provided in the live farm data section — do not invent any figures
2. Reference specific PU IDs, cycle IDs, and worker IDs from the data
3. Lead with CoKG — it is always the primary metric in any financial explanation
4. Explain what the data MEANS in practical terms, not just what it is
5. Always recommend the single most impactful action the farmer can take right now
6. Surface any RED or CRITICAL items immediately, regardless of what was specifically asked
7. If asked about data that is not in the context, say clearly: "I don't have that data available right now — it may not have been logged yet."
8. Connect the dots: if CoKG is AMBER because harvest volume is low, say exactly that
9. Keep responses under 250 words"""
```

---

## 3. Farm Context Snapshot Assembly

The farm context is assembled fresh before every Interpreter call. It is a structured Python dictionary serialized to JSON and injected into the system prompt.

```python
# app/services/ai/context_builder.py

import json
from datetime import datetime, date, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


async def assemble_farm_context(
    farm_id: str,
    tenant_id: str,
    db: AsyncSession,
    include_full_alerts: bool = True
) -> dict:
    """
    Assembles all live TFOS data for a farm into a context dictionary.
    Called before every Operational Interpreter invocation.
    """

    # Query 1: Farm metadata
    farm_row = (await db.execute(
        text("SELECT farm_name, location_description, island_flag FROM farms WHERE farm_id = :fid AND tenant_id = :tid"),
        {"fid": farm_id, "tid": tenant_id}
    )).fetchone()

    # Query 2: Active production cycles with financials
    cycles_rows = (await db.execute(
        text("""
        SELECT
            pc.pu_id,
            pc.cycle_id,
            p.crop_name,
            p.production_id,
            ps.stage_name,
            ps.stage_number,
            EXTRACT(DAY FROM NOW() - pc.planting_date)::int AS days_active,
            pc.planting_date::date AS planting_date,
            COALESCE(cf.cogk_fjd, 0) AS cogk_fjd,
            COALESCE(cf.gross_margin_pct, 0) AS gross_margin_pct,
            COALESCE(cf.total_revenue_fjd, 0) AS total_revenue_fjd,
            COALESCE(cf.total_cost_fjd, 0) AS total_cost_fjd,
            COALESCE(cf.total_labor_cost_fjd, 0) AS total_labor_cost_fjd,
            COALESCE(cf.total_input_cost_fjd, 0) AS total_input_cost_fjd,
            cf.last_harvest_date::date AS last_harvest_date,
            COALESCE(cf.total_harvest_kg, 0) AS total_harvest_kg,
            (
                SELECT COUNT(*) FROM automation_alerts aa
                WHERE aa.pu_id = pc.pu_id
                  AND aa.tenant_id = pc.tenant_id
                  AND aa.status = 'open'
            ) AS open_alerts
        FROM production_cycles pc
        JOIN shared.productions p ON pc.production_id = p.production_id
        JOIN shared.production_stages ps ON pc.current_stage_id = ps.stage_id
        LEFT JOIN cycle_financials cf ON pc.cycle_id = cf.cycle_id
        WHERE pc.farm_id = :farm_id
          AND pc.tenant_id = :tenant_id
          AND pc.status = 'active'
        ORDER BY pc.pu_id
        """),
        {"farm_id": farm_id, "tenant_id": tenant_id}
    )).fetchall()

    # Query 3: Decision signal RAG status snapshot
    signals_rows = (await db.execute(
        text("""
        SELECT signal_name, rag_status, signal_value, signal_unit
        FROM decision_signal_state
        WHERE farm_id = :farm_id AND tenant_id = :tenant_id
        ORDER BY signal_name
        """),
        {"farm_id": farm_id, "tenant_id": tenant_id}
    )).fetchall()

    # Query 4: 30-day financial summary
    fin_row = (await db.execute(
        text("""
        SELECT
            COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount_fjd ELSE 0 END), 0) AS total_revenue,
            COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount_fjd ELSE 0 END), 0) AS total_cost,
            COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount_fjd ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount_fjd ELSE 0 END), 0) AS net_profit
        FROM cash_ledger
        WHERE farm_id = :farm_id
          AND tenant_id = :tenant_id
          AND transaction_date >= CURRENT_DATE - INTERVAL '30 days'
        """),
        {"farm_id": farm_id, "tenant_id": tenant_id}
    )).fetchone()

    # Query 5: Open alerts (top 5 by severity)
    alerts_rows = (await db.execute(
        text("""
        SELECT
            aa.alert_id,
            aa.rule_id,
            aa.severity,
            aa.description,
            aa.pu_id,
            aa.created_at::date AS created_date
        FROM automation_alerts aa
        WHERE aa.farm_id = :farm_id
          AND aa.tenant_id = :tenant_id
          AND aa.status = 'open'
        ORDER BY
            CASE aa.severity
                WHEN 'Critical' THEN 1
                WHEN 'High' THEN 2
                WHEN 'Medium' THEN 3
                WHEN 'Low' THEN 4
                ELSE 5
            END,
            aa.created_at ASC
        LIMIT 5
        """),
        {"farm_id": farm_id, "tenant_id": tenant_id}
    )).fetchall()

    # Query 6: Upcoming tasks (next 3 days + overdue)
    tasks_rows = (await db.execute(
        text("""
        SELECT
            task_id,
            description,
            due_date::date AS due_date,
            status,
            pu_id,
            assigned_worker_id
        FROM farm_tasks
        WHERE farm_id = :farm_id
          AND tenant_id = :tenant_id
          AND status IN ('open', 'overdue')
          AND due_date <= CURRENT_DATE + INTERVAL '3 days'
        ORDER BY due_date ASC
        LIMIT 10
        """),
        {"farm_id": farm_id, "tenant_id": tenant_id}
    )).fetchall()

    # Assemble context dictionary
    fiji_now = datetime.now(timezone.utc)
    fiji_date = date.today()

    farm_context = {
        "farm_id": farm_id,
        "farm_name": farm_row.farm_name if farm_row else farm_id,
        "farm_location": farm_row.location_description if farm_row else "Fiji",
        "is_island_farm": farm_row.island_flag if farm_row else False,
        "current_date": fiji_date.strftime("%d %b %Y"),
        "current_day_of_week": fiji_date.strftime("%A"),
        "timezone": "Pacific/Fiji",

        "active_cycles": [
            {
                "pu_id": row.pu_id,
                "cycle_id": row.cycle_id,
                "crop": row.crop_name,
                "crop_id": row.production_id,
                "stage": row.stage_name,
                "stage_number": row.stage_number,
                "days_active": row.days_active,
                "planting_date": str(row.planting_date),
                "cogk_fjd": float(row.cogk_fjd),
                "gross_margin_pct": float(row.gross_margin_pct),
                "total_revenue_fjd": float(row.total_revenue_fjd),
                "total_cost_fjd": float(row.total_cost_fjd),
                "total_labor_cost_fjd": float(row.total_labor_cost_fjd),
                "total_input_cost_fjd": float(row.total_input_cost_fjd),
                "last_harvest_date": str(row.last_harvest_date) if row.last_harvest_date else None,
                "total_harvest_kg": float(row.total_harvest_kg),
                "open_alerts": int(row.open_alerts)
            }
            for row in cycles_rows
        ],

        "decision_signals_snapshot": {
            row.signal_name: {
                "rag_status": row.rag_status,
                "value": float(row.signal_value) if row.signal_value else None,
                "unit": row.signal_unit
            }
            for row in signals_rows
        },

        "financial_summary_30d": {
            "total_revenue_fjd": float(fin_row.total_revenue) if fin_row else 0.0,
            "total_cost_fjd": float(fin_row.total_cost) if fin_row else 0.0,
            "net_profit_fjd": float(fin_row.net_profit) if fin_row else 0.0,
        },

        "open_alerts": [
            {
                "alert_id": row.alert_id,
                "rule_id": row.rule_id,
                "severity": row.severity,
                "description": row.description,
                "pu_id": row.pu_id,
                "created_date": str(row.created_date)
            }
            for row in alerts_rows
        ],
        "open_alerts_count": len(alerts_rows),

        "upcoming_tasks": [
            {
                "task_id": row.task_id,
                "description": row.description,
                "due_date": str(row.due_date),
                "status": row.status,
                "pu_id": row.pu_id
            }
            for row in tasks_rows
        ]
    }

    return farm_context


def serialize_context_for_prompt(context: dict) -> str:
    """Serializes farm context to compact JSON for prompt injection."""
    return json.dumps(context, indent=2, default=str)
```

---

## 4. KB Article Retrieval and Injection Logic

### pgvector Setup

```sql
-- Enable pgvector extension (run once during DB initialization)
CREATE EXTENSION IF NOT EXISTS vector;

-- KB articles table with embedding column
-- (Full schema in 02_database — this shows the AI-relevant columns)
ALTER TABLE shared.kb_articles
ADD COLUMN IF NOT EXISTS embedding_vector vector(1536);

-- IVFFlat index for approximate nearest neighbor search
-- lists = 100 is appropriate for up to ~100,000 articles
-- Re-create if article count grows significantly
CREATE INDEX IF NOT EXISTS idx_kb_articles_embedding
ON shared.kb_articles
USING ivfflat (embedding_vector vector_cosine_ops)
WITH (lists = 100);

-- Exact index for smaller datasets during early stage
-- Switch to ivfflat when > 1,000 articles
CREATE INDEX IF NOT EXISTS idx_kb_articles_embedding_exact
ON shared.kb_articles
USING hnsw (embedding_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

### Embedding Generation

```python
# app/services/ai/embeddings.py

import openai
from app.core.config import settings

openai_client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

EMBEDDING_MODEL = settings.EMBEDDING_MODEL  # text-embedding-3-small
EMBEDDING_DIMENSIONS = 1536


async def generate_embedding(text: str) -> list[float]:
    """
    Generates an embedding vector for the given text.
    Uses text-embedding-3-small (1536 dimensions, cost: $0.02/1M tokens).

    Args:
        text: Input text to embed (max ~8,191 tokens)

    Returns:
        List of 1536 floats representing the embedding vector
    """
    # Truncate if needed — embedding model has token limit
    text = text[:8000]   # Conservative truncation at char level

    response = await openai_client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text
    )

    return response.data[0].embedding


async def regenerate_kb_article_embedding(article_id: str, db: AsyncSession) -> None:
    """
    Regenerates embedding for a specific KB article.
    Called when article is published or content is updated.
    """
    article = await db.get(KBArticle, article_id)
    if not article:
        raise ValueError(f"KB article {article_id} not found")

    # Combine title + summary + first 2000 chars of content for embedding
    # This ensures the embedding captures both the topic and key content
    embed_text = (
        f"Title: {article.title}\n"
        f"Tags: {', '.join(article.tags or [])}\n"
        f"Summary: {article.content_summary or ''}\n"
        f"Content: {(article.content_md or '')[:2000]}"
    )

    article.embedding_vector = await generate_embedding(embed_text)
    article.embedding_updated_at = datetime.utcnow()
    await db.commit()

    logger.info(f"Regenerated embedding for KB article {article_id}")


async def batch_regenerate_all_embeddings(db: AsyncSession) -> int:
    """
    Regenerates embeddings for all published KB articles.
    Run during initial setup or after model change.
    Returns count of articles processed.
    """
    articles = (await db.execute(
        text("SELECT article_id FROM shared.kb_articles WHERE published = true")
    )).fetchall()

    count = 0
    for row in articles:
        await regenerate_kb_article_embedding(row.article_id, db)
        count += 1
        # Rate limit: OpenAI embeddings API has generous limits but be polite
        if count % 50 == 0:
            await asyncio.sleep(1)

    return count
```

### Vector Similarity Search

```python
# app/services/ai/knowledge_broker.py

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def search_kb_articles(
    query_text: str,
    db: AsyncSession,
    top_k: int = 3,
    min_similarity: float = 0.65,
    crop_filter: Optional[list[str]] = None
) -> list[dict]:
    """
    Searches KB articles by semantic similarity to query.

    Args:
        query_text: Natural language query from farmer
        db: Database session
        top_k: Number of articles to retrieve
        min_similarity: Minimum cosine similarity score (0-1)
        crop_filter: Optional list of crop IDs to filter results

    Returns:
        List of article dicts with similarity scores, sorted by similarity DESC
    """
    # Generate query embedding
    query_vector = await generate_embedding(query_text)

    # Format as PostgreSQL vector literal
    vector_literal = f"[{','.join(str(v) for v in query_vector)}]"

    # Build optional crop filter clause
    crop_filter_clause = ""
    if crop_filter:
        crop_ids_str = "ARRAY[" + ",".join(f"'{c}'" for c in crop_filter) + "]"
        crop_filter_clause = f"AND (crop_ids && {crop_ids_str} OR crop_ids IS NULL)"

    results = (await db.execute(
        text(f"""
        SELECT
            article_id,
            title,
            content_md,
            content_summary,
            crop_ids,
            stage_ids,
            tags,
            1 - (embedding_vector <=> :query_vector::vector) AS similarity
        FROM shared.kb_articles
        WHERE published = true
          AND embedding_vector IS NOT NULL
          {crop_filter_clause}
        ORDER BY similarity DESC
        LIMIT :top_k
        """),
        {
            "query_vector": vector_literal,
            "top_k": top_k
        }
    )).fetchall()

    articles = [
        {
            "article_id": row.article_id,
            "title": row.title,
            "content_md": row.content_md,
            "content_summary": row.content_summary,
            "crop_ids": row.crop_ids,
            "tags": row.tags,
            "similarity": float(row.similarity)
        }
        for row in results
    ]

    # Filter by minimum similarity
    qualified_articles = [a for a in articles if a["similarity"] >= min_similarity]

    return qualified_articles, articles  # Return both qualified and all (for fallback title)


def build_kb_context_block(articles: list[dict]) -> str:
    """
    Formats retrieved KB articles into a context block for Claude.
    """
    if not articles:
        return "No relevant Knowledge Base articles retrieved."

    blocks = []
    for i, article in enumerate(articles, 1):
        similarity_pct = int(article["similarity"] * 100)
        blocks.append(
            f"--- KB Article {i}: {article['article_id']} (similarity: {similarity_pct}%) ---\n"
            f"Title: {article['title']}\n"
            f"Summary: {article.get('content_summary', 'N/A')}\n"
            f"Content:\n{article['content_md']}\n"
        )

    return "\n".join(blocks)


def build_not_found_response(nearest_article: Optional[dict] = None) -> str:
    """
    Constructs the standard KB not-found response.
    """
    if nearest_article:
        return (
            f"I cannot find a validated answer for that specific question in the "
            f"Teivaka Knowledge Base. "
            f"Here is the closest protocol I can reference: {nearest_article['title']}. "
            f"For expert advice, please contact the Teivaka agronomy team."
        )
    else:
        return (
            "I cannot find a validated answer for that specific question in the "
            "Teivaka Knowledge Base. "
            "For expert advice, please contact the Teivaka agronomy team."
        )
```

---

## 5. AI Insights Storage Schema

### Overview

AI-generated farm insights are stored in the `ai_insights` table and surfaced in the dashboard without requiring a per-request AI call. Insights are generated weekly by a Celery beat task, or triggered by significant events (e.g., CoKG moving from AMBER to RED).

### Schema

```sql
CREATE TABLE ai_insights (
    insight_id          VARCHAR(26) PRIMARY KEY,          -- ULID
    tenant_id           VARCHAR(10) NOT NULL,
    farm_id             VARCHAR(10),                       -- NULL = tenant-level insight
    pu_id               VARCHAR(20),                       -- NULL = farm-level insight
    cycle_id            VARCHAR(20),                       -- linked cycle if applicable
    insight_type        VARCHAR(50) NOT NULL,              -- 'weekly_farm_summary' | 'cokg_trend' | 'alert_pattern' | 'harvest_forecast' | 'rotation_recommendation'
    title               TEXT NOT NULL,                     -- short insight title for dashboard card
    body_text           TEXT NOT NULL,                     -- full insight text (AI-generated)
    severity            VARCHAR(10),                       -- 'info' | 'warning' | 'critical'
    data_snapshot       JSONB,                             -- the farm_context that generated this insight
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until         TIMESTAMPTZ,                       -- insights expire — weekly insights valid 7 days
    is_read             BOOLEAN DEFAULT false,
    is_dismissed        BOOLEAN DEFAULT false,
    tokens_used         INTEGER,
    generation_trigger  VARCHAR(50),                       -- 'weekly_batch' | 'cokg_threshold' | 'alert_count' | 'manual'
    CONSTRAINT fk_ai_insights_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

CREATE INDEX idx_ai_insights_farm_unread
    ON ai_insights (farm_id, is_read, is_dismissed, generated_at DESC)
    WHERE is_dismissed = false;

CREATE INDEX idx_ai_insights_tenant_recent
    ON ai_insights (tenant_id, generated_at DESC);
```

### Insight Generation — Weekly Batch

```python
# app/workers/tasks/ai_tasks.py

from celery import shared_task
import logging

logger = logging.getLogger(__name__)


@shared_task(
    name="generate_weekly_farm_insights",
    queue="ai",
    max_retries=3,
    default_retry_delay=300
)
def generate_weekly_farm_insights_task():
    """
    Celery beat task: runs every Sunday at 06:00 Pacific/Fiji.
    Generates AI insights for all active farms.

    Beat schedule entry in celery_config.py:
    "generate-weekly-insights": {
        "task": "generate_weekly_farm_insights",
        "schedule": crontab(hour=6, minute=0, day_of_week="sunday"),
        "options": {"queue": "ai"}
    }
    """
    import asyncio
    asyncio.run(_generate_weekly_insights_async())


async def _generate_weekly_insights_async():
    async with get_db_session() as db:
        active_farms = (await db.execute(
            text("""
            SELECT f.farm_id, f.farm_name, f.tenant_id, f.location_description
            FROM farms f
            JOIN tenants t ON f.tenant_id = t.tenant_id
            WHERE t.subscription_status = 'active'
              AND f.is_active = true
            """)
        )).fetchall()

        for farm in active_farms:
            try:
                await generate_farm_insight(
                    farm_id=farm.farm_id,
                    farm_name=farm.farm_name,
                    tenant_id=farm.tenant_id,
                    trigger="weekly_batch",
                    db=db
                )
                logger.info(f"Weekly insight generated for {farm.farm_id}")
            except Exception as e:
                logger.error(f"Failed to generate insight for {farm.farm_id}: {e}")
                # Continue to next farm — don't let one failure block all


async def generate_farm_insight(
    farm_id: str,
    farm_name: str,
    tenant_id: str,
    trigger: str,
    db: AsyncSession,
    insight_type: str = "weekly_farm_summary"
) -> str:
    """
    Generates a single AI insight for a farm and stores it.
    Returns the insight_id.
    """
    # Assemble fresh farm context
    context = await assemble_farm_context(farm_id, tenant_id, db)
    context_json = serialize_context_for_prompt(context)

    system_prompt = build_system_prompt(
        module="OPERATIONAL_INTERPRETER",
        farm_id=farm_id,
        farm_name=farm_name,
        farm_location=context.get("farm_location", "Fiji"),
        farmer_name="Farm Manager",
        tenant_name="Teivaka",
        active_crop_summary=build_crop_summary(context["active_cycles"]),
        farm_context_json=context_json,
        current_date=context["current_date"]
    )

    user_message = (
        "Generate a weekly farm performance summary. Cover:\n"
        "1. Overall CoKG status for each active cycle\n"
        "2. The most important issue requiring attention this week\n"
        "3. One specific recommendation to improve performance\n"
        "4. Any compliance or rotation issues to be aware of\n"
        "Keep it under 200 words. Make it practical for a working farmer."
    )

    response_text, usage = await call_claude(
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": user_message}],
        max_tokens=400,      # Insights are concise
        temperature=0.4,
        module="INSIGHT_GENERATOR"
    )

    # Extract a short title from the first line
    title_line = response_text.split("\n")[0][:120]

    insight_id = generate_ulid()
    insight = AIInsight(
        insight_id=insight_id,
        tenant_id=tenant_id,
        farm_id=farm_id,
        insight_type=insight_type,
        title=title_line,
        body_text=response_text,
        severity=determine_insight_severity(context),
        data_snapshot=context,
        valid_until=datetime.utcnow() + timedelta(days=7),
        tokens_used=usage["total_tokens"],
        generation_trigger=trigger
    )
    db.add(insight)
    await db.commit()

    return insight_id


def determine_insight_severity(context: dict) -> str:
    """Determines insight severity from farm context signals."""
    signals = context.get("decision_signals_snapshot", {})

    red_count = sum(
        1 for s in signals.values()
        if isinstance(s, dict) and s.get("rag_status") == "RED"
    )
    critical_alerts = sum(
        1 for a in context.get("open_alerts", [])
        if a.get("severity") in ("Critical", "High")
    )

    if red_count > 0 or critical_alerts > 0:
        return "warning"
    return "info"
```

### Dashboard Surfacing

Insights are retrieved for the dashboard via a simple API endpoint — no real-time AI call:

```python
@router.get("/api/v1/farms/{farm_id}/insights")
async def get_farm_insights(
    farm_id: str,
    limit: int = 5,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns latest non-dismissed insights for a farm."""
    insights = (await db.execute(
        text("""
        SELECT insight_id, insight_type, title, body_text, severity,
               generated_at, is_read, valid_until
        FROM ai_insights
        WHERE farm_id = :farm_id
          AND tenant_id = :tenant_id
          AND is_dismissed = false
          AND (valid_until IS NULL OR valid_until > NOW())
        ORDER BY generated_at DESC
        LIMIT :limit
        """),
        {"farm_id": farm_id, "tenant_id": current_user.tenant_id, "limit": limit}
    )).fetchall()

    return [dict(row) for row in insights]
```

---

## 6. FarmClaw — TIS via WhatsApp

### Overview

FarmClaw is the WhatsApp interface for TIS. Farm workers (most of whom are primarily WhatsApp users) can log harvests, check tasks, ask agronomy questions, and get farm status updates — all from their WhatsApp phone number.

Workers at F002 (Kadavu Island) rely on FarmClaw as their primary interface since they may not have consistent access to the full PWA.

### WhatsApp Webhook Flow

```python
# app/api/webhooks/whatsapp.py
# Provider: Meta WhatsApp Cloud API (NOT Twilio)
# Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks

import hashlib
import hmac
from fastapi import APIRouter, Request, HTTPException, Header
from app.config import settings

router = APIRouter()


def _verify_meta_signature(payload: bytes, signature_header: Optional[str]) -> bool:
    """Verify X-Hub-Signature-256 from Meta webhook."""
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(
        settings.meta_app_secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header[7:])


@router.get("/webhooks/whatsapp")
async def verify_whatsapp_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """Meta webhook verification handshake (one-time setup)."""
    if hub_mode == "subscribe" and hub_verify_token == settings.meta_whatsapp_verify_token:
        return PlainTextResponse(hub_challenge)
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhooks/whatsapp")
async def receive_whatsapp_message(
    request: Request,
    x_hub_signature_256: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
    redis_client: Redis = Depends(get_redis)
):
    """
    Meta WhatsApp Cloud API webhook endpoint.
    Receives incoming WhatsApp messages and routes them to TIS.
    JSON payload — not form-encoded (Meta differs from Twilio here).
    """

    # Step 1: Verify Meta HMAC-SHA256 signature
    raw_body = await request.body()
    if not _verify_meta_signature(raw_body, x_hub_signature_256):
        logger.warning(f"Invalid Meta signature on WhatsApp webhook from {request.client.host}")
        raise HTTPException(status_code=403, detail="Invalid webhook signature")

    # Step 2: Parse Meta JSON payload
    data = await request.json()
    # Meta wraps messages in: data.entry[0].changes[0].value.messages[0]
    try:
        entry = data["entry"][0]["changes"][0]["value"]
        messages = entry.get("messages", [])
        if not messages:
            return {"status": "no_messages"}   # status updates, not incoming messages
        msg = messages[0]
    except (KeyError, IndexError):
        return {"status": "ignored"}

    from_number = msg["from"]                          # E.164 without '+', e.g. "6798730866"
    from_number_e164 = f"+{from_number}"               # normalise to +E.164 for DB lookup
    msg_type = msg.get("type", "text")
    body = msg.get("text", {}).get("body", "").strip() if msg_type == "text" else ""
    media_id = msg.get("audio", {}).get("id") if msg_type == "audio" else None

    # Step 3: Look up user by phone number
    user = (await db.execute(
        text("""
        SELECT u.user_id, u.tenant_id, u.full_name, u.default_farm_id,
               t.subscription_tier
        FROM tenant.users u
        JOIN tenant.tenants t ON t.tenant_id = u.tenant_id
        WHERE u.whatsapp_number = :phone
          AND u.is_active = true
        LIMIT 1
        """),
        {"phone": from_number_e164}
    )).fetchone()

    if not user:
        # Unknown number — check worker table
        worker = (await db.execute(
            text("""
            SELECT w.worker_id, w.full_name, w.tenant_id, f.farm_id
            FROM workers w
            JOIN farms f ON f.tenant_id = w.tenant_id
            WHERE w.phone_number = :phone
              AND w.is_active = true
            LIMIT 1
            """),
            {"phone": phone_number}
        )).fetchone()

        if not worker:
            await send_whatsapp_reply(
                to=from_number_e164,
                message=(
                    "Bula! I don't recognize this number in the Teivaka system. "
                    "Please contact your farm manager to register your WhatsApp number. "
                    "Vinaka!"
                )
            )
            return {"status": "unknown_number"}

        # Map worker to user context (simplified — workers can use TIS with limited access)
        user_id = None
        tenant_id = worker.tenant_id
        farm_id = worker.farm_id
        subscription_tier = "basic"    # Workers get basic tier access
    else:
        user_id = user.user_id
        tenant_id = user.tenant_id
        farm_id = user.default_farm_id
        subscription_tier = user.subscription_tier or "free"

    # Step 4: Handle audio message (voice note)
    if media_id:
        # Queue voice processing task with Meta media_id (fetched inside the worker)
        command_id = generate_ulid()
        process_whatsapp_voice.delay(
            command_id=command_id,
            media_id=media_id,           # Meta media ID — worker fetches URL + downloads
            from_number=from_number_e164,
            farm_id=farm_id,
            tenant_id=tenant_id,
            user_id=user_id
        )

        await send_whatsapp_reply(
            to=from_number_e164,
            message="Sa rauta! Processing your voice message..."
        )
        return {"status": "voice_queued", "command_id": command_id}

    # Step 5: Handle text message — route to TIS
    if not body:
        await send_whatsapp_reply(
            to=from_number_e164,
            message="I received your message but it appears to be empty. Please type or record your command."
        )
        return {"status": "empty_message"}

    # Step 6: Rate limit check
    try:
        await tis_rate_limiter.check_and_increment(
            user_id=user_id or -1,  # use negative int as placeholder for workers
            subscription_tier=subscription_tier
        )
    except TISRateLimitError as e:
        await send_whatsapp_reply(to=from_number, message=e.message)
        return {"status": "rate_limited"}

    # Step 7: Queue TIS text processing
    command_id = generate_ulid()
    process_tis_command.delay(
        command_id=command_id,
        input_text=body,
        input_source="whatsapp",
        farm_id=farm_id,
        pu_id_context=None,
        user_id=user_id,
        tenant_id=tenant_id,
        reply_to_whatsapp=from_number_e164
    )

    # Step 8: Acknowledge immediately — Meta requires 200 OK within 20s or retries
    return {"status": "queued", "command_id": command_id}


async def send_whatsapp_reply(to: str, message: str) -> None:
    """Sends a WhatsApp reply via Meta Cloud API (httpx, no SDK)."""
    import httpx
    clean_number = to.lstrip("+")
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": clean_number,
        "type": "text",
        "text": {"preview_url": False, "body": message},
    }
    url = f"https://graph.facebook.com/v19.0/{settings.meta_phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {settings.meta_whatsapp_token}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, json=payload, headers=headers)
    if resp.status_code != 200:
        logger.error(f"Meta API reply failed {resp.status_code}: {resp.text[:200]}")
```

### WhatsApp Voice Note Processing

```python
@celery_app.task(queue="ai")
def process_whatsapp_voice(
    command_id: str,
    media_url: str,
    media_type: str,
    from_number: str,
    farm_id: str,
    tenant_id: str,
    user_id: Optional[int]
):
    """
    Retrieves audio from Meta media ID, transcribes with Whisper,
    processes as TIS command, replies via WhatsApp.
    Meta audio flow: media_id → GET media URL → download bytes → Whisper
    """
    import asyncio
    asyncio.run(_async_process_whatsapp_voice(
        command_id, media_id, from_number, farm_id, tenant_id, user_id
    ))


async def _async_process_whatsapp_voice(command_id, media_id, from_number, farm_id, tenant_id, user_id):
    # Step A: Resolve Meta media ID to a download URL
    import httpx
    headers = {"Authorization": f"Bearer {settings.meta_whatsapp_token}"}
    async with httpx.AsyncClient(timeout=15.0) as http_client:
        meta_resp = await http_client.get(
            f"https://graph.facebook.com/v19.0/{media_id}",
            headers=headers
        )
        meta_resp.raise_for_status()
        media_url = meta_resp.json()["url"]

        # Step B: Download audio bytes (Meta requires the same Bearer token)
        dl_resp = await http_client.get(media_url, headers=headers)
        dl_resp.raise_for_status()
        audio_bytes = dl_resp.content

    # Transcribe with Whisper
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = "voice_note.ogg"   # WhatsApp sends audio as OGG/OPUS

    transcript_response = await openai_client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file,
        language="en",
        temperature=0,
        prompt=(
            "Fiji farm operations. Crops: eggplant, cassava, pineapple, kava, dalo. "
            "Workers: Laisenia, Maika, Maciu, Rusiate, Vairusi, Naita, Marika, Apisai. "
            "Currency: FJD Fijian dollars. Farm IDs: F001 F002."
        )
    )

    transcript = transcript_response.text.strip()

    if not transcript or len(transcript.split()) < 3:
        await send_whatsapp_reply(
            to=from_number,
            message="Could not understand the voice note. Please try again or type your message."
        )
        return

    # Process as TIS text command
    await process_tis_command_async(
        command_id=command_id,
        input_text=transcript,
        input_source="whatsapp",
        farm_id=farm_id,
        pu_id_context=None,
        user_id=user_id,
        tenant_id=tenant_id,
        reply_to_whatsapp=from_number
    )
```

### WhatsApp Rate Limiting

WhatsApp Business API has its own rate limits. TIS enforces an additional application-level limit:

```python
# Maximum outbound WhatsApp messages per hour (avoid Twilio rate limit)
WHATSAPP_RATE_LIMIT_PER_HOUR = settings.WHATSAPP_RATE_LIMIT_PER_HOUR  # default: 80

async def check_whatsapp_rate_limit(tenant_id: str, redis_client: Redis) -> bool:
    """Returns True if under limit, False if at limit."""
    key = f"whatsapp:outbound:{tenant_id}:{datetime.utcnow().strftime('%Y%m%d%H')}"
    count = await redis_client.incr(key)
    if count == 1:
        await redis_client.expire(key, 3600)
    return count <= WHATSAPP_RATE_LIMIT_PER_HOUR
```

---

## 7. pgvector Setup Reference

### Installation

pgvector is included in the `timescale/timescaledb:2.15.3-pg16` Docker image used by Teivaka. No separate installation required.

Verify availability:
```sql
SELECT * FROM pg_available_extensions WHERE name = 'vector';
-- Should return vector | 0.7.0 or later
```

Enable:
```sql
-- Run in teivaka_db as superuser (done in init script)
CREATE EXTENSION IF NOT EXISTS vector;
```

### Schema Configuration

```sql
-- Embedding column on kb_articles
-- 1536 dimensions = text-embedding-3-small output size
ALTER TABLE shared.kb_articles
ADD COLUMN embedding_vector vector(1536);

-- HNSW index (recommended for < 100K rows, better recall than IVFFlat)
CREATE INDEX idx_kb_embedding_hnsw
ON shared.kb_articles
USING hnsw (embedding_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- For larger datasets (> 100K articles in future), switch to IVFFlat:
-- CREATE INDEX idx_kb_embedding_ivfflat
-- ON shared.kb_articles
-- USING ivfflat (embedding_vector vector_cosine_ops)
-- WITH (lists = 100);
-- Note: run ANALYZE shared.kb_articles after building IVFFlat index
```

### Similarity Search Operators

```sql
-- Cosine distance (lower = more similar; range 0-2)
embedding_vector <=> query_vector

-- Cosine similarity (1 - distance; range -1 to 1; higher = more similar)
1 - (embedding_vector <=> query_vector) AS similarity

-- L2 distance (Euclidean — less appropriate for semantic similarity)
embedding_vector <-> query_vector

-- Inner product (for normalized vectors, equivalent to cosine similarity)
embedding_vector <#> query_vector
```

**Why cosine similarity for KB search:** Text embeddings from OpenAI are normalized to unit length. Cosine similarity (1 - cosine distance) is the standard metric for semantic similarity between text embeddings. A score of 1.0 means identical meaning; 0.65 is the Teivaka threshold for "sufficiently relevant."

### Performance Tuning

```sql
-- Increase ef_search for better recall at query time (at cost of speed)
-- Set before queries in high-accuracy scenarios
SET hnsw.ef_search = 100;   -- default is 40

-- Check index usage
EXPLAIN (ANALYZE, BUFFERS)
SELECT article_id, 1 - (embedding_vector <=> '[0.1, 0.2, ...]'::vector) AS sim
FROM shared.kb_articles
WHERE published = true
ORDER BY sim DESC LIMIT 3;
```

---

## 8. Anthropic SDK Usage Example (Async)

```python
# app/services/ai/example_usage.py
# Complete example showing how TIS calls Claude for the Operational Interpreter

import asyncio
import anthropic
import json
from app.core.config import settings
from app.services.ai.prompts import build_system_prompt
from app.services.ai.context_builder import assemble_farm_context, serialize_context_for_prompt


async def example_interpreter_call():
    """
    Complete example: Operational Interpreter call for F001.
    Shows the full flow from context assembly to Claude API call.
    """

    # 1. Assemble live farm context from database
    # (In production, db session is injected via FastAPI dependency)
    async with get_db_session() as db:
        context = await assemble_farm_context(
            farm_id="F001",
            tenant_id="TEN-001",
            db=db
        )

    context_json = serialize_context_for_prompt(context)

    # 2. Build active crop summary string
    crop_summary = ", ".join(
        f"{c['crop']} ({c['pu_id']})"
        for c in context["active_cycles"]
    )

    # 3. Build system prompt
    system_prompt = build_system_prompt(
        module="OPERATIONAL_INTERPRETER",
        farm_id="F001",
        farm_name="Save-A-Lot",
        farm_location="Korovou Serua, Viti Levu",
        farmer_name="Cody",
        tenant_name="Teivaka",
        active_crop_summary=crop_summary,
        farm_context_json=context_json,
        current_date="7 Apr 2026"
    )

    # 4. Conversation history (last 10 turns from tis_conversation_turns)
    conversation_history = [
        {"role": "user", "content": "How is my eggplant on PU002 doing?"},
        {"role": "assistant", "content": "Your eggplant on F001-PU002 is in Stage 3 (Fruiting), 35 days active. CoKG is FJD 1.85/kg — AMBER. You are about FJD 0.25/kg above target. The main driver is lower harvest volume than expected for this stage. If you harvest 20kg more this week you should move to GREEN."}
    ]

    # 5. Current user message
    current_message = "What's my biggest issue right now?"

    # 6. Call Claude API
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    response = await client.messages.create(
        model=settings.CLAUDE_MODEL,            # claude-sonnet-4-20250514
        max_tokens=800,
        temperature=0.3,
        system=system_prompt,
        messages=conversation_history + [
            {"role": "user", "content": current_message}
        ]
    )

    response_text = response.content[0].text
    input_tokens = response.usage.input_tokens
    output_tokens = response.usage.output_tokens

    print(f"Response: {response_text}")
    print(f"Tokens: {input_tokens} in, {output_tokens} out")
    print(f"Stop reason: {response.stop_reason}")

    return response_text


# Run example
if __name__ == "__main__":
    asyncio.run(example_interpreter_call())
```

### Stop Reason Handling

```python
# Handle different stop reasons from Claude API
if response.stop_reason == "end_turn":
    # Normal completion — response is complete
    pass
elif response.stop_reason == "max_tokens":
    # Response was truncated — add notice to farmer
    response_text += "\n[Response truncated — try a more specific question]"
elif response.stop_reason == "stop_sequence":
    # Custom stop sequence hit — treat as normal
    pass
```

---

## 9. Error Handling

### API Timeout (30 seconds)

```python
# Configured in AsyncAnthropic client initialization:
client = anthropic.AsyncAnthropic(
    api_key=settings.ANTHROPIC_API_KEY,
    timeout=30.0    # 30 second total timeout
)

# On timeout:
# - Raise TISAPIError("AI response timed out. Please try again.", "CLAUDE_TIMEOUT")
# - Log error with timing data
# - Return user-friendly message via WhatsApp or WebSocket
# - Do NOT retry timeouts automatically — they indicate system load
```

### Rate Limit (HTTP 429)

```python
# SDK handles retries automatically (max_retries=2 in client config)
# Uses exponential backoff: 1s, 2s
# If all retries exhausted:
# - Raise TISAPIError with user-friendly message
# - Log warning with retry count
# - Consider queuing request for retry after 60s (Celery retry)

@celery_app.task(bind=True, max_retries=3)
def process_tis_command(self, ...):
    try:
        result = await call_claude(...)
    except TISAPIError as e:
        if e.error_code == "CLAUDE_RATE_LIMIT":
            # Retry after 60 seconds
            raise self.retry(countdown=60, exc=e)
        raise
```

### Content Policy (Rare)

```python
# Anthropic content policy refusals are very rare for farm operations
# But handle gracefully:
if response.stop_reason == "content_filter":
    # Log for review — shouldn't happen in normal farm operations
    logger.warning(f"Claude content filter triggered | input={input_text[:100]}")
    return TISResponse(
        response_text=(
            "I wasn't able to process that request. "
            "Please rephrase your question or contact the Teivaka team."
        ),
        status="content_filtered"
    )
```

### Connection Error

```python
from anthropic import APIConnectionError

except APIConnectionError:
    logger.error("Cannot connect to Anthropic API")
    raise TISAPIError(
        "Cannot reach AI service. Please check your internet connection.",
        "CLAUDE_CONNECTION_ERROR"
    )
```

---

## 10. Logging — All TIS Calls to ai_commands

Every TIS interaction — whether it results in a Claude API call or not — is logged to the `ai_commands` table. This enables cost tracking, debugging, and usage analytics.

### Schema

```sql
CREATE TABLE ai_commands (
    command_id              VARCHAR(26) PRIMARY KEY,       -- ULID, set before processing
    tenant_id               VARCHAR(10) NOT NULL,
    user_id                 INTEGER,
    farm_id                 VARCHAR(10),
    voice_log_id            VARCHAR(26),                   -- linked voice log if from audio
    input_source            VARCHAR(20) NOT NULL,          -- 'text' | 'voice' | 'whatsapp'
    input_text              TEXT,                          -- original text or transcript
    module_used             VARCHAR(30),                   -- which TIS module handled it
    command_type            VARCHAR(30),                   -- e.g. LOG_HARVEST, KB_QUERY
    response_text           TEXT,
    status                  VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'processing' | 'complete' | 'error' | 'rate_limited'
    error_code              VARCHAR(50),
    error_message           TEXT,
    -- Token tracking
    input_tokens            INTEGER,
    output_tokens           INTEGER,
    total_tokens            INTEGER,
    -- Timing
    queued_at               TIMESTAMPTZ DEFAULT NOW(),
    processing_started_at   TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    processing_time_ms      INTEGER,
    -- Knowledge Broker specific
    confidence_score        NUMERIC(4,3),
    cited_articles          TEXT[],
    -- Rate limiting
    was_rate_limited        BOOLEAN DEFAULT false,
    -- Conversation context
    conversation_id         VARCHAR(26),
    CONSTRAINT fk_ai_cmd_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

-- Indexes for common queries
CREATE INDEX idx_ai_commands_user_date
    ON ai_commands (user_id, queued_at DESC);

CREATE INDEX idx_ai_commands_tenant_date
    ON ai_commands (tenant_id, queued_at DESC);

CREATE INDEX idx_ai_commands_status
    ON ai_commands (status)
    WHERE status = 'pending';

-- TimescaleDB hypertable for time-series analytics on AI usage
SELECT create_hypertable('ai_commands', 'queued_at', if_not_exists => true);
```

### Logging Function

```python
async def log_ai_command(
    command_id: str,
    tenant_id: str,
    user_id: Optional[int],
    farm_id: str,
    input_source: str,
    input_text: str,
    module_used: str,
    response_text: str,
    status: str,
    db: AsyncSession,
    usage: Optional[dict] = None,
    error_code: Optional[str] = None,
    confidence_score: Optional[float] = None,
    cited_articles: Optional[list] = None,
    conversation_id: Optional[str] = None,
    voice_log_id: Optional[str] = None
) -> None:
    """
    Logs a completed TIS command to ai_commands table.
    Called after every TIS processing attempt, regardless of outcome.
    """
    await db.execute(
        text("""
        INSERT INTO ai_commands (
            command_id, tenant_id, user_id, farm_id,
            input_source, input_text, module_used,
            response_text, status, error_code,
            input_tokens, output_tokens, total_tokens, processing_time_ms,
            confidence_score, cited_articles, conversation_id, voice_log_id,
            processing_completed_at
        ) VALUES (
            :command_id, :tenant_id, :user_id, :farm_id,
            :input_source, :input_text, :module_used,
            :response_text, :status, :error_code,
            :input_tokens, :output_tokens, :total_tokens, :processing_time_ms,
            :confidence_score, :cited_articles, :conversation_id, :voice_log_id,
            NOW()
        )
        ON CONFLICT (command_id) DO UPDATE SET
            response_text = EXCLUDED.response_text,
            status = EXCLUDED.status,
            input_tokens = EXCLUDED.input_tokens,
            output_tokens = EXCLUDED.output_tokens,
            total_tokens = EXCLUDED.total_tokens,
            processing_time_ms = EXCLUDED.processing_time_ms,
            processing_completed_at = EXCLUDED.processing_completed_at
        """),
        {
            "command_id": command_id,
            "tenant_id": tenant_id,
            "user_id": user_id,
            "farm_id": farm_id,
            "input_source": input_source,
            "input_text": input_text[:1000],   # Truncate long inputs for storage
            "module_used": module_used,
            "response_text": response_text,
            "status": status,
            "error_code": error_code,
            "input_tokens": usage.get("input_tokens") if usage else None,
            "output_tokens": usage.get("output_tokens") if usage else None,
            "total_tokens": usage.get("total_tokens") if usage else None,
            "processing_time_ms": usage.get("processing_time_ms") if usage else None,
            "confidence_score": confidence_score,
            "cited_articles": cited_articles,
            "conversation_id": conversation_id,
            "voice_log_id": voice_log_id
        }
    )
    await db.commit()
```

### Daily Cost Summary (Analytics Query)

```sql
-- Daily token usage and estimated cost
SELECT
    DATE(queued_at AT TIME ZONE 'Pacific/Fiji') AS fiji_date,
    tenant_id,
    module_used,
    COUNT(*) AS calls,
    SUM(input_tokens) AS total_input_tokens,
    SUM(output_tokens) AS total_output_tokens,
    -- claude-sonnet-4: ~$3/M input, ~$15/M output (approximate)
    ROUND((SUM(input_tokens) * 3.0 / 1000000)::numeric, 4) AS input_cost_usd,
    ROUND((SUM(output_tokens) * 15.0 / 1000000)::numeric, 4) AS output_cost_usd
FROM ai_commands
WHERE status = 'complete'
  AND queued_at >= NOW() - INTERVAL '30 days'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 5 DESC;
```

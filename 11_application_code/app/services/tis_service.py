from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import anthropic
import openai
import redis.asyncio as aioredis
import json
import logging
import time
from typing import Optional
from datetime import date, datetime

from app.config import settings

logger = logging.getLogger(__name__)

# Anthropic async client
anthropic_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

# TIS Module constants
MODULE_KNOWLEDGE_BROKER = "KNOWLEDGE_BROKER"
MODULE_OPERATIONAL = "OPERATIONAL_INTERPRETER"
MODULE_COMMAND = "COMMAND_EXECUTOR"

# The 12 command types
COMMAND_TYPES = {
    "LOG_HARVEST", "LOG_LABOR", "LOG_SPRAY", "LOG_FERTILIZE",
    "LOG_IRRIGATION", "LOG_PEST", "CHECK_TASKS", "CHECK_FINANCIALS",
    "CHECK_STOCK", "CREATE_CYCLE", "CLOSE_CYCLE", "SCHEDULE_TASK"
}

# Exact not-found message (never deviate from this)
KB_NOT_FOUND_MESSAGE = "I cannot find a validated answer for that specific question in the Teivaka Knowledge Base. Please consult your agronomist or contact the Teivaka team for guidance."

SYSTEM_PROMPT_TEMPLATE = """You are FarmClaw, Teivaka's agricultural intelligence assistant.

FARM CONTEXT:
{farm_context}

TODAY: {today}

RULES YOU MUST FOLLOW:
1. KNOWLEDGE BROKER MODE: Only answer from the provided KB excerpts below. If confidence < 0.65 or no relevant excerpt exists, respond EXACTLY: "I cannot find a validated answer for that specific question in the Teivaka Knowledge Base. Please consult your agronomist or contact the Teivaka team for guidance."
2. OPERATIONAL MODE: Only explain data from the farm context provided. Never invent numbers.
3. COMMAND MODE: Extract intent and entities from the user's message. Return structured JSON.
4. Never hallucinate crop science, chemical rates, or farm data.
5. Amounts always in FJD. Weights in kg. Dates in YYYY-MM-DD.
6. Respond concisely. Workers use WhatsApp on mobile -- keep responses under 150 words unless asked for detail.

KB EXCERPTS:
{kb_excerpts}
"""


async def check_tis_rate_limit(
    redis_client: aioredis.Redis,
    tenant_id: str,
    subscription_tier: str,
    tis_daily_limit: int,
) -> dict:
    """
    Redis-based rate limiting. Key: tis:rate:{tenant_id}:{date}
    Returns {"allowed": bool, "calls_today": int, "calls_remaining": int}
    """
    today = datetime.now().strftime("%Y-%m-%d")
    key = f"tis:rate:{tenant_id}:{today}"

    calls_today = await redis_client.incr(key)
    if calls_today == 1:
        await redis_client.expire(key, 86400)  # TTL = 1 day

    limit = settings.get_tis_limit(subscription_tier)
    allowed = tis_daily_limit == 0 or calls_today <= limit  # 0 = unlimited

    if not allowed:
        # Decrement since we pre-incremented
        await redis_client.decr(key)
        return {
            "allowed": False,
            "calls_today": calls_today - 1,
            "calls_remaining": 0,
            "limit": limit,
        }

    return {
        "allowed": True,
        "calls_today": calls_today,
        "calls_remaining": max(0, limit - calls_today),
        "limit": limit,
    }


async def classify_intent(user_message: str) -> str:
    """
    Classifies user intent to route to correct TIS module.
    Keyword-based first (fast), LLM fallback for ambiguous cases.
    """
    msg_lower = user_message.lower()

    # Command triggers (direct action words)
    command_keywords = [
        "log", "record", "add", "harvested", "sprayed", "fertilized",
        "worked", "create cycle", "close cycle", "schedule", "remind"
    ]
    if any(kw in msg_lower for kw in command_keywords):
        return MODULE_COMMAND

    # Knowledge broker triggers (question words + agronomy)
    kb_keywords = [
        "how to", "what is", "when should", "which fertilizer", "disease",
        "pest", "rotation", "spacing", "germination", "best practice",
        "recommend", "advise", "guide", "tip"
    ]
    if any(kw in msg_lower for kw in kb_keywords):
        return MODULE_KNOWLEDGE_BROKER

    # Operational interpreter (explain data)
    operational_keywords = [
        "why is", "explain", "what happened", "show me", "status",
        "cogk", "cost", "profit", "alert", "performance"
    ]
    if any(kw in msg_lower for kw in operational_keywords):
        return MODULE_OPERATIONAL

    # Default to operational
    return MODULE_OPERATIONAL


async def retrieve_kb_context(
    session: AsyncSession,
    user_message: str,
    tenant_id: str,
    limit: int = 3,
) -> list[dict]:
    """
    Performs pgvector similarity search against validated KB articles.
    Only searches rag_status = 'VALIDATED' articles.
    Returns articles with similarity scores.
    """
    # Generate query embedding
    openai_client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
    embed_response = await openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=user_message,
    )
    query_embedding = embed_response.data[0].embedding

    result = await session.execute(
        text("""
            SELECT
                kb_entry_id,
                title,
                content_chunk,
                1 - (embedding <=> :embedding::vector) AS similarity
            FROM tenant.kb_embeddings
            WHERE rag_status = 'VALIDATED'
              AND embedding IS NOT NULL
            ORDER BY embedding <=> :embedding::vector
            LIMIT :limit
        """),
        {"embedding": query_embedding, "limit": limit}
    )
    articles = [dict(row) for row in result.mappings().all()]

    # Filter by confidence threshold
    return [a for a in articles if a["similarity"] >= settings.tis_rag_confidence_threshold]


async def assemble_farm_context(
    session: AsyncSession,
    farm_id: str,
    tenant_id: str,
) -> str:
    """
    Assembles current farm state as text for Claude context.
    Reads active cycles, open alerts, current financials.
    """
    result = await session.execute(
        text("""
            SELECT
                f.farm_name,
                f.location_name,
                f.island_logistics,
                COUNT(DISTINCT pc.cycle_id) FILTER (WHERE pc.cycle_status = 'ACTIVE') AS active_cycles,
                COUNT(DISTINCT a.alert_id) FILTER (WHERE a.alert_status = 'ACTIVE' AND a.severity IN ('CRITICAL','HIGH')) AS critical_alerts,
                ROUND(AVG(cf.cogk_fjd_per_kg) FILTER (WHERE cf.cogk_fjd_per_kg IS NOT NULL), 4) AS avg_cogk,
                SUM(cf.total_revenue_fjd) FILTER (WHERE pc.cycle_status != 'FAILED') AS ytd_revenue
            FROM tenant.farms f
            LEFT JOIN tenant.production_cycles pc ON pc.farm_id = f.farm_id
            LEFT JOIN tenant.cycle_financials cf ON cf.cycle_id = pc.cycle_id
            LEFT JOIN tenant.alerts a ON a.farm_id = f.farm_id
            WHERE f.farm_id = :farm_id
            GROUP BY f.farm_name, f.location_name, f.island_logistics
        """),
        {"farm_id": farm_id}
    )
    row = result.mappings().first()

    if not row:
        return f"Farm {farm_id} -- no data available."

    context_parts = [
        f"Farm: {row['farm_name']} ({row['location_name']})",
        f"Active cycles: {row['active_cycles'] or 0}",
        f"Active critical/high alerts: {row['critical_alerts'] or 0}",
    ]
    if row["avg_cogk"]:
        context_parts.append(f"Average CoKG: FJD {row['avg_cogk']}/kg")
    if row["ytd_revenue"]:
        context_parts.append(f"YTD revenue: FJD {row['ytd_revenue']:,.2f}")
    if row["island_logistics"]:
        context_parts.append("Island logistics: Active (ferry-dependent supply chain)")

    return "\n".join(context_parts)


async def execute_tis_query(
    session: AsyncSession,
    redis_client: aioredis.Redis,
    user_message: str,
    farm_id: Optional[str],
    conversation_history: list[dict],
    user: dict,
    tenant_id: str,
) -> dict:
    """
    Main TIS entrypoint. Routes to correct module, calls Claude, returns response.
    """
    start_time = time.time()

    # Rate limiting
    rate = await check_tis_rate_limit(
        redis_client,
        tenant_id,
        user["subscription_tier"],
        user["tis_daily_limit"],
    )
    if not rate["allowed"]:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=429,
            detail={
                "error": "TIS_RATE_LIMIT_EXCEEDED",
                "message": f"Daily TIS limit of {rate['limit']} calls reached. Resets at midnight Fiji time.",
                "calls_today": rate["calls_today"],
                "calls_remaining": 0,
            }
        )

    # Classify intent
    tis_module = await classify_intent(user_message)

    # Assemble context
    farm_context = ""
    kb_excerpts = ""

    if farm_id:
        farm_context = await assemble_farm_context(session, farm_id, tenant_id)

    if tis_module == MODULE_KNOWLEDGE_BROKER:
        kb_articles = await retrieve_kb_context(session, user_message, tenant_id)
        if kb_articles:
            kb_excerpts = "\n\n".join([
                f"[{a['title']}] (confidence: {a['similarity']:.2f})\n{a['content_chunk']}"
                for a in kb_articles
            ])
        else:
            # No validated KB content found -- return hard not-found response
            return {
                "tis_module": MODULE_KNOWLEDGE_BROKER,
                "response": KB_NOT_FOUND_MESSAGE,
                "confidence": 0.0,
                "kb_articles_used": 0,
                "calls_today": rate["calls_today"],
                "calls_remaining": rate["calls_remaining"],
                "latency_ms": int((time.time() - start_time) * 1000),
            }

    # Build system prompt
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        farm_context=farm_context or "No farm selected.",
        today=date.today().isoformat(),
        kb_excerpts=kb_excerpts or "No KB articles loaded.",
    )

    # Build messages
    messages = list(conversation_history[-10:])  # Last 10 for context window
    messages.append({"role": "user", "content": user_message})

    # Call Claude
    response = await anthropic_client.messages.create(
        model=settings.anthropic_model,
        max_tokens=settings.anthropic_max_tokens,
        system=system_prompt,
        messages=messages,
    )

    assistant_message = response.content[0].text
    tokens_used = response.usage.input_tokens + response.usage.output_tokens
    latency_ms = int((time.time() - start_time) * 1000)

    # Log to ai_commands
    await log_ai_command(
        session=session,
        user_id=user["user_id"],
        farm_id=farm_id,
        tenant_id=tenant_id,
        tis_module=tis_module,
        user_message=user_message,
        response=assistant_message,
        tokens_used=tokens_used,
        latency_ms=latency_ms,
    )

    return {
        "tis_module": tis_module,
        "response": assistant_message,
        "tokens_used": tokens_used,
        "calls_today": rate["calls_today"],
        "calls_remaining": rate["calls_remaining"],
        "latency_ms": latency_ms,
    }


async def log_ai_command(
    session: AsyncSession,
    user_id: str,
    farm_id: Optional[str],
    tenant_id: str,
    tis_module: str,
    user_message: str,
    response: str,
    tokens_used: int,
    latency_ms: int,
) -> None:
    """Logs TIS interaction to ai_commands TimescaleDB hypertable."""
    import uuid
    command_id = f"CMD-{uuid.uuid4().hex[:12].upper()}"

    await session.execute(
        text("""
            INSERT INTO tenant.ai_commands
                (command_id, command_date, tenant_id, user_id, farm_id,
                 tis_module, raw_input, execution_status, result_summary,
                 tokens_used, latency_ms)
            VALUES
                (:command_id, NOW(), :tenant_id, :user_id, :farm_id,
                 :tis_module, :raw_input, 'SUCCESS', :result_summary,
                 :tokens_used, :latency_ms)
        """),
        {
            "command_id": command_id,
            "tenant_id": tenant_id,
            "user_id": user_id,
            "farm_id": farm_id,
            "tis_module": tis_module,
            "raw_input": user_message[:1000],
            "result_summary": response[:500],
            "tokens_used": tokens_used,
            "latency_ms": latency_ms,
        }
    )


async def process_voice(
    audio_bytes: bytes,
    user: dict,
    farm_id: Optional[str],
    session: AsyncSession,
    redis_client: aioredis.Redis,
    tenant_id: str,
) -> dict:
    """
    Full voice pipeline: audio -> Whisper -> TIS -> response.
    Target total latency: <5000ms.
    """
    import uuid
    pipeline_start = time.time()

    if not audio_bytes or len(audio_bytes) < 100:
        raise ValueError("Audio too short or empty. Please speak clearly and try again.")

    # Step 1: Whisper transcription
    whisper_start = time.time()
    openai_client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

    import io
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = "voice.webm"

    transcript_response = await openai_client.audio.transcriptions.create(
        model=settings.whisper_model,
        file=audio_file,
        prompt="Teivaka farm, Fiji. Crops: tomato, cassava, kava, pineapple. Workers: Laisenia, Jone, Timoci. CoKG, harvest, spray, fertilize.",
        language="en",
    )
    whisper_latency = int((time.time() - whisper_start) * 1000)
    transcript = transcript_response.text.strip()

    if not transcript:
        raise ValueError("Could not transcribe audio. Please speak more clearly.")

    # Step 2: TIS processing
    tis_result = await execute_tis_query(
        session=session,
        redis_client=redis_client,
        user_message=transcript,
        farm_id=farm_id,
        conversation_history=[],
        user=user,
        tenant_id=tenant_id,
    )

    total_latency = int((time.time() - pipeline_start) * 1000)

    # Log voice interaction
    voice_log_id = f"VCE-{uuid.uuid4().hex[:12].upper()}"
    await session.execute(
        text("""
            INSERT INTO tenant.tis_voice_logs
                (voice_log_id, log_date, tenant_id, user_id,
                 audio_size_bytes, whisper_transcript, whisper_latency_ms,
                 tis_latency_ms, total_latency_ms, tis_module, success)
            VALUES
                (:voice_log_id, NOW(), :tenant_id, :user_id,
                 :audio_size, :transcript, :whisper_latency,
                 :tis_latency, :total_latency, :tis_module, true)
        """),
        {
            "voice_log_id": voice_log_id,
            "tenant_id": tenant_id,
            "user_id": user["user_id"],
            "audio_size": len(audio_bytes),
            "transcript": transcript,
            "whisper_latency": whisper_latency,
            "tis_latency": tis_result.get("latency_ms", 0),
            "total_latency": total_latency,
            "tis_module": tis_result["tis_module"],
        }
    )

    return {
        "voice_log_id": voice_log_id,
        "transcript": transcript,
        "whisper_latency_ms": whisper_latency,
        "total_latency_ms": total_latency,
        "under_target": total_latency < settings.tis_voice_target_latency_ms,
        **tis_result,
    }

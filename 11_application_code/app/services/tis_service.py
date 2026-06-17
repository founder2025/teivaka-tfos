from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import anthropic
import openai
import httpx
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

FARMER_COUNTRY: {country_iso}

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

AGRONOMY ENFORCEMENT (Phase 10-1b binding rule):

For ANY question about plant nutrition, fertilizer dosage, NPK
(nitrogen/phosphorus/potassium), stage-specific care, or "what
should I apply" type questions, you MUST call the lookup_nutrition
tool BEFORE responding. NEVER generate dosage values from your
training knowledge.

Tool: lookup_nutrition(crop_key, stage, country_iso)

- crop_key: lowercase crop identifier. Map farmer's words:
    * "dalo" or "taro" -> "taro"
    * Future crops added in Phase 10-1c+. If farmer mentions
      a crop not yet in the protocols table, the tool returns
      _status='not_found' -- respond with the 404 fallback (below).

- stage: BBCH-derived stage. Infer from farmer's description:
    * "just planted" / "young plants" / "first 3 weeks" -> SEEDLING
    * "leaves growing" / "early growth" -> VEGETATIVE
    * "tillers / suckers forming" / "peak foliage" / "yellowing
      leaves on young plants" -> TILLERING
    * "before flowering" / "corm starting" -> PRE_FLOWERING
    * "flowering" -> FLOWERING (rare for taro)
    * "corm bulking" / "tubers swelling" -> CORM_DEVELOPMENT
    * "near harvest" / "leaves dying back" -> MATURATION
    * "after harvest" / "soil rest" -> POST_HARVEST

- country_iso: 3-letter ISO. Use FARMER_COUNTRY above. If unknown
  default to FJI. Valid: FJI, PNG, SLB, VUT, WSM, TON.

Response format when the tool returns _status='ok':
"According to [source_citation] (verification: [verification_status]):
[crop_display_name] at [stage] needs:
- Nitrogen (N): [n_g_per_plant] grams per plant
- Phosphorus (P): [p_g_per_plant] grams per plant
- Potassium (K): [k_g_per_plant] grams per plant

How: [application_method]
Why: [application_notes]

Note: [_caveat]"

Response format when the tool returns _status='not_found':
"I don't have verified guidance for that crop or stage yet. I'd
recommend contacting your local extension officer or agriculture
ministry for site-specific advice."

ABSOLUTE RULES:
- NEVER state NPK values without calling the tool first
- NEVER use units other than grams per plant for smallholder advice
- NEVER skip the verification_status caveat
- NEVER claim authority on agronomy beyond what the tool returns
"""


# Phase 10-1b: lookup_nutrition tool definition (Anthropic function-calling schema).
# When TIS receives a nutrition/fertilizer/NPK question, the prompt above forces
# it to call this tool instead of generating dosage values from training data.
NUTRITION_TOOL = {
    "name": "lookup_nutrition",
    "description": (
        "Look up verified NPK fertilizer guidance for a crop at a specific growth "
        "stage in a specific Pacific Island country. Returns structured nutrition "
        "data from the FAO Pacific Crop Nutrition Manual + SPC Technical Bulletin. "
        "ALWAYS call this for any nutrition/fertilizer question -- never generate "
        "dosage values from training knowledge."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "crop_key": {
                "type": "string",
                "description": (
                    "Lowercase crop identifier. Currently supports: 'taro' "
                    "(also accepts 'dalo' as common name; map to 'taro')."
                ),
            },
            "stage": {
                "type": "string",
                "enum": [
                    "SEEDLING", "VEGETATIVE", "TILLERING", "PRE_FLOWERING",
                    "FLOWERING", "CORM_DEVELOPMENT", "FRUIT_SET",
                    "MATURATION", "POST_HARVEST",
                ],
                "description": (
                    "BBCH-derived growth stage. Infer from farmer description "
                    "(e.g., 'yellowing leaves on young plants' -> TILLERING)."
                ),
            },
            "country_iso": {
                "type": "string",
                "enum": ["FJI", "PNG", "SLB", "VUT", "WSM", "TON"],
                "description": (
                    "3-letter ISO country code. Default to FJI if unknown. "
                    "FJI=Fiji, PNG=Papua New Guinea, SLB=Solomon Islands, "
                    "VUT=Vanuatu, WSM=Samoa, TON=Tonga."
                ),
            },
        },
        "required": ["crop_key", "stage", "country_iso"],
    },
}


# Hardcoded crop-name normalisation. Phase 10-1c+ will widen this set.
CROP_NORMALIZATION = {
    "dalo": "taro",
    "taro": "taro",
}


# Keyword surface for nutrition intent. When ANY of these appear we force the
# tool-enabled Claude path so the KB short-circuit cannot block the lookup.
NUTRITION_INTENT_KEYWORDS = (
    "fertilizer", "fertiliser", "fertilize", "fertilise",
    "npk", "nitrogen", "phosphorus", "potassium",
    "nutrient", "nutrition",
    "what should i apply", "what to apply",
    "dose", "dosage",
    "feed my", "feeding",
    "yellowing", "yellow leaves",
)


def is_nutrition_question(msg: str) -> bool:
    msg_lower = msg.lower()
    return any(kw in msg_lower for kw in NUTRITION_INTENT_KEYWORDS)


async def execute_lookup_nutrition(
    session: AsyncSession,
    crop_key: str,
    stage: str,
    country_iso: str,
) -> dict:
    """Look up the agronomy protocol and return a flat dict for Claude.

    Calls shared.crop_nutrition_protocols directly. Same fallback logic as the
    /api/v1/agronomy/nutrition/{crop}/{stage} HTTP endpoint: prefer country
    match, fall back to NULL country (global), 404 if neither.
    """
    crop_in = (crop_key or "").lower().strip()
    crop_normalized = CROP_NORMALIZATION.get(crop_in, crop_in)
    stage_upper = (stage or "").upper().strip()
    country_upper = (country_iso or "FJI").upper().strip()

    sql = """
        SELECT crop_display_name, stage_order, stage_window_text,
               country_iso, n_g_per_plant, p_g_per_plant, k_g_per_plant,
               application_method, application_notes,
               verification_status, source_citation
        FROM shared.crop_nutrition_protocols
        WHERE crop_key = :ck AND stage = :st
          AND (country_iso = :ci OR country_iso IS NULL)
        ORDER BY CASE WHEN country_iso = :ci THEN 1 ELSE 2 END
        LIMIT 1
    """
    result = await session.execute(
        text(sql),
        {"ck": crop_normalized, "st": stage_upper, "ci": country_upper},
    )
    row = result.first()
    if row is None:
        return {
            "_status": "not_found",
            "_message": (
                f"No verified guidance for {crop_normalized} at {stage_upper} "
                f"in {country_upper}."
            ),
        }

    return {
        "_status": "ok",
        "crop_key": crop_normalized,
        "crop_display_name": row.crop_display_name,
        "stage": stage_upper,
        "stage_window": row.stage_window_text,
        "country_iso": row.country_iso,
        "n_g_per_plant": float(row.n_g_per_plant),
        "p_g_per_plant": float(row.p_g_per_plant),
        "k_g_per_plant": float(row.k_g_per_plant),
        "application_method": row.application_method,
        "application_notes": row.application_notes,
        "verification_status": row.verification_status,
        "source_citation": row.source_citation,
        "_caveat": (
            "Values seeded from FAO Pacific Crop Nutrition Manual 2018. "
            "Marked SEED_FAO_UNVERIFIED. For site-specific guidance, "
            "consult local extension officer."
        ),
    }


async def resolve_farmer_country(session: AsyncSession, tenant_id: str) -> str:
    """Read tenant.tenants.country; default FJI on miss/error."""
    try:
        res = await session.execute(
            text("SELECT country FROM tenant.tenants WHERE tenant_id = :tid"),
            {"tid": tenant_id},
        )
        r = res.first()
        if r and r.country:
            c = str(r.country).upper().strip()
            if len(c) == 3 and c in {"FJI", "PNG", "SLB", "VUT", "WSM", "TON"}:
                return c
    except Exception as e:
        logger.warning("resolve_farmer_country failed: %s", e)
    return "FJI"


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

    # Phase 6: ground TIS in the farm's blocks + recent logged activity so it can
    # answer "what should I do on Block 1?" / "why is this field idle?" from real
    # data. Best-effort — must never break the chat (Inviolable #1: facts only).
    try:
        blocks = await session.execute(
            text("""
                SELECT pu.pu_name, c.cycle_status, p.production_name
                  FROM tenant.production_units pu
                  LEFT JOIN LATERAL (
                       SELECT pc.* FROM tenant.production_cycles pc
                        WHERE pc.pu_id = pu.pu_id
                        ORDER BY pc.planting_date DESC NULLS LAST, pc.created_at DESC LIMIT 1
                  ) c ON TRUE
                  LEFT JOIN shared.productions p ON p.production_id = c.production_id
                 WHERE pu.farm_id = :farm_id AND pu.is_active = true
                 ORDER BY pu.pu_id LIMIT 25
            """),
            {"farm_id": farm_id},
        )
        blines = []
        for b in blocks.mappings().all():
            if b["production_name"] and b["cycle_status"] in ("PLANNED", "ACTIVE", "HARVESTING", "CLOSING"):
                blines.append(f"{b['pu_name']}: {b['production_name']} ({b['cycle_status'].lower()})")
            else:
                blines.append(f"{b['pu_name']}: empty/resting")
        if blines:
            context_parts.append("\nBLOCKS (fields):\n- " + "\n- ".join(blines))
    except Exception:
        pass
    try:
        acts = await session.execute(
            text("""SELECT summary FROM tenant.farm_activity_context
                     WHERE farm_id = :farm_id ORDER BY occurred_at DESC LIMIT 12"""),
            {"farm_id": farm_id},
        )
        alines = [a[0] for a in acts.fetchall()]
        if alines:
            context_parts.append("\nRECENT FARM ACTIVITY (newest first):\n- " + "\n- ".join(alines))
    except Exception:
        pass

    return "\n".join(context_parts)


async def bridge_chat(message: str, user_id: str, farm_id: Optional[str]) -> str:
    """Call the OpenClaw/Max bridge /chat (the fast 'public' TIS agent). Returns the
    answer text. Raises on failure so the caller can surface a friendly message.
    This is the free (Claude-Max) path — no metered Anthropic API."""
    url = settings.tis_bridge_url.rstrip("/") + "/chat"
    headers = {"Content-Type": "application/json"}
    if settings.tis_bridge_token:
        headers["Authorization"] = f"Bearer {settings.tis_bridge_token}"
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, headers=headers, json={
            "message": message[:3900],          # bridge hard-caps at 4000
            "user_id": str(user_id),
            "farm_id": str(farm_id or "none"),
        })
    if resp.status_code != 200:
        raise RuntimeError(f"bridge HTTP {resp.status_code}: {resp.text[:200]}")
    txt = (resp.json() or {}).get("text")
    if not txt or not str(txt).strip():
        raise RuntimeError("bridge returned no text")
    return str(txt).strip()


async def _default_farm_id(session: AsyncSession, tenant_id: str) -> Optional[str]:
    """The farmer's farm, so TIS has real context even when the client sends none."""
    row = (await session.execute(
        text("SELECT farm_id FROM tenant.farms WHERE tenant_id = :tid ORDER BY farm_id LIMIT 1"),
        {"tid": tenant_id},
    )).first()
    return str(row[0]) if row else None


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

    # Phase 10-1b: detect nutrition intent. When true, force the tool-enabled
    # Claude path even if classify_intent routed to KB and the KB lookup
    # returned nothing -- otherwise the not-found short-circuit would block
    # the lookup_nutrition tool from ever firing.
    nutrition_question = is_nutrition_question(user_message)

    # Resolve the farmer's farm if the client didn't pass one, so TIS sees the farm.
    if not farm_id:
        farm_id = await _default_farm_id(session, tenant_id)

    # Assemble this farmer's real farm state + any validated KB reference.
    # Both are best-effort — a failure here must never break the chat.
    farm_context = ""
    kb_excerpts = ""
    if farm_id:
        try:
            farm_context = await assemble_farm_context(session, farm_id, tenant_id)
        except Exception as e:  # noqa: BLE001
            logger.warning("farm context assembly failed: %s", e)
    try:
        kb_articles = await retrieve_kb_context(session, user_message, tenant_id)
        if kb_articles:
            kb_excerpts = "\n\n".join([
                f"[{a['title']}] (confidence: {a['similarity']:.2f})\n{a['content_chunk']}"
                for a in kb_articles
            ])
    except Exception as e:  # noqa: BLE001 — OpenAI embedding/KB optional
        logger.warning("KB retrieval failed (continuing without it): %s", e)

    # Build the message for the OpenClaw/Max bridge ("public" TIS agent already
    # carries TIS's identity + grounding; we add this farm's real data + reference
    # and instruct it to stay grounded — no hallucinated agronomy, Inviolable #1).
    parts = []
    if farm_context:
        parts.append("THIS FARMER'S FARM (real data — answer for this farm):\n" + farm_context[:1400])
    if kb_excerpts:
        parts.append("VALIDATED REFERENCE (use these; cite them; don't go beyond them):\n" + kb_excerpts[:1500])
    parts.append("FARMER'S QUESTION:\n" + user_message.strip()[:700])
    parts.append(
        "Answer for THIS farm, in plain language. If you used the reference above, say so. "
        "If you don't have a verified figure (dosage, price, date, yield), say so honestly "
        "and point to the extension officer — never invent agronomy."
    )
    bridge_message = "\n\n".join(parts)[:3900]

    try:
        assistant_message = await bridge_chat(bridge_message, str(user["user_id"]), farm_id)
    except Exception as e:  # noqa: BLE001
        logger.warning("TIS bridge call failed: %s", e)
        assistant_message = "I couldn't reach the advisory service just now — please try again in a moment."

    latency_ms = int((time.time() - start_time) * 1000)

    # Log to ai_commands (powers Usage + History)
    await log_ai_command(
        session=session,
        user_id=user["user_id"],
        farm_id=farm_id,
        tenant_id=tenant_id,
        tis_module=tis_module,
        user_message=user_message,
        response=assistant_message,
        tokens_used=0,
        latency_ms=latency_ms,
    )

    return {
        "tis_module": tis_module,
        "response": assistant_message,
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
                 command_type, tis_module, raw_input, execution_status,
                 result_summary, tokens_used, latency_ms)
            VALUES
                (:command_id, NOW(), :tenant_id, :user_id, :farm_id,
                 'CHAT', :tis_module, :raw_input, 'SUCCESS',
                 :result_summary, :tokens_used, :latency_ms)
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

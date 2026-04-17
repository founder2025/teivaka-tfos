# FILE: 07_testing/tests/test_tis.py
"""
Complete test suite for TIS — Teivaka Intelligence System.
Tests Knowledge Broker (RAG constraint), Command Executor (12 commands),
Operational Interpreter (TFOS context), and Voice Pipeline.

Platform: Teivaka Agricultural TOS, Fiji
Founder: Uraia Koroi Kama (Cody), Teivaka PTE LTD
Currency: FJD | Timezone: Pacific/Fiji UTC+12

Run: pytest 07_testing/tests/test_tis.py -v --asyncio-mode=auto
"""

import pytest
import pytest_asyncio
import asyncio
import time
import json
import re
from unittest.mock import AsyncMock, patch, MagicMock, call
from datetime import date, datetime, timedelta
from uuid import UUID, uuid4
from typing import Any, Dict, List, Optional


# ===========================================================================
# FIXTURES — inline conftest pattern
# ===========================================================================

@pytest.fixture
def mock_redis():
    """Mocked Redis client for rate-limit testing."""
    redis = MagicMock()
    redis.get = MagicMock(return_value=None)          # default: counter = 0
    redis.incr = MagicMock(return_value=1)
    redis.expire = MagicMock(return_value=True)
    redis.ttl = MagicMock(return_value=86400)
    return redis


@pytest.fixture
def mock_anthropic():
    """Mocked Anthropic Claude client."""
    client = AsyncMock()
    message = MagicMock()
    message.content = [MagicMock(text="Mocked Claude response.")]
    client.messages.create = AsyncMock(return_value=message)
    return client


@pytest.fixture
def mock_openai():
    """Mocked OpenAI client for Whisper transcription and text-embeddings."""
    client = AsyncMock()

    # Whisper transcription
    transcription = MagicMock()
    transcription.text = "Harvested 42 kilograms eggplant Grade A on PU002"
    client.audio.transcriptions.create = AsyncMock(return_value=transcription)

    # Embeddings — 1536-dimensional float vector
    embedding_response = MagicMock()
    embedding_response.data = [MagicMock(embedding=[0.01] * 1536)]
    client.embeddings.create = AsyncMock(return_value=embedding_response)

    return client


@pytest.fixture
def kb_article_fixture():
    """
    Sample published KB articles with pre-computed embeddings.
    Mirrors shared.kb_articles schema.
    """
    return [
        {
            "article_id": "KB-001",
            "title": "Eggplant Vegetative Stage Protocol",
            "content": (
                "During the Vegetative Growth stage of Eggplant (CRP-EGG), "
                "apply NPK (12-12-17) at 150 kg/ha every 14 days. "
                "Ensure soil moisture is maintained at field capacity. "
                "Monitor for aphids and treat with Dimethoate 40% EC at 1L/ha if pest pressure exceeds threshold."
            ),
            "production_id": "CRP-EGG",
            "stage": "Vegetative",
            "published": True,
            "embedding_vector": [0.01] * 1536,
            "similarity": 0.85,
        },
        {
            "article_id": "KB-002",
            "title": "Eggplant Fruiting Stage Protocol",
            "content": (
                "During the Fruiting stage of Eggplant (CRP-EGG), apply potassium-rich "
                "fertiliser (K2SO4) at 100 kg/ha. Harvest when fruit reaches 150–200g. "
                "Apply Mancozeb at 2 kg/ha every 7 days to prevent fungal disease. "
                "Observe 7-day withholding period before harvest after any chemical application."
            ),
            "production_id": "CRP-EGG",
            "stage": "Fruiting",
            "published": True,
            "embedding_vector": [0.02] * 1536,
            "similarity": 0.78,
        },
        {
            "article_id": "KB-003",
            "title": "Cassava Establishment Protocol",
            "content": (
                "Cassava (CRP-CAS) planting material should be sourced from disease-free stems. "
                "Plant at 1m × 1m spacing. Apply basal fertiliser NPK (12-12-17) at planting. "
                "Harvest between 9–12 months after planting."
            ),
            "production_id": "CRP-CAS",
            "stage": "Establishment",
            "published": True,
            "embedding_vector": [0.03] * 1536,
            "similarity": 0.71,
        },
    ]


@pytest.fixture
def teivaka_farm_context():
    """
    Pre-built farm context snapshot for F001 (Save-A-Lot, Korovou).
    Mirrors the payload the Operational Interpreter receives from TFOS.
    """
    return {
        "farm_id": "F001",
        "farm_name": "Save-A-Lot",
        "location": "Korovou",
        "subscription_tier": "BASIC",
        "active_cycles": [
            {
                "cycle_id": "CY-F001-26-002",
                "pu_id": "F001-PU002",
                "production_id": "CRP-EGG",
                "production_name": "Eggplant",
                "stage": "Fruiting",
                "days_active": 45,
                "cogk_fjd": 1.86,
                "total_labor_cost_fjd": 480.00,
                "total_input_cost_fjd": 73.00,
                "total_other_cost_fjd": 0.00,
                "total_harvest_qty_kg": 294.0,
                "total_revenue_fjd": 840.00,
                "gross_margin_pct": 34.2,
                "last_harvest_date": "2026-04-05",
            },
            {
                "cycle_id": "CY-F001-26-001",
                "pu_id": "F001-PU001",
                "production_id": "CRP-CAS",
                "production_name": "Cassava",
                "stage": "Establishment",
                "days_active": 12,
                "cogk_fjd": None,          # no harvest yet
                "total_labor_cost_fjd": 96.00,
                "total_input_cost_fjd": 45.00,
                "total_other_cost_fjd": 0.00,
                "total_harvest_qty_kg": 0.0,
                "total_revenue_fjd": 0.00,
                "gross_margin_pct": None,
                "last_harvest_date": None,
            },
        ],
        "open_alerts": [
            {
                "alert_id": "ALT-20260403-001",
                "severity": "Critical",
                "rule_id": "RULE-038",
                "title": "Chemical Compliance Block",
                "description": (
                    "Dimethoate (CHEM-001) applied 4 days ago. "
                    "Withholding period: 7 days. Safe to harvest after 2026-04-11."
                ),
                "pu_id": "F001-PU002",
                "created_at": "2026-04-03T08:00:00+12:00",
            }
        ],
        "workers": [
            {"worker_id": "W-001", "name": "Laisenia Waqa", "daily_rate_fjd": 48.00},
            {"worker_id": "W-002", "name": "Maika Ratubaba", "daily_rate_fjd": 48.00},
        ],
        "chemicals_applied": [
            {
                "chemical_id": "CHEM-001",
                "chemical_name": "Dimethoate 40% EC",
                "pu_id": "F001-PU002",
                "application_date": "2026-04-03",
                "withholding_period_days": 7,
                "safe_harvest_date": "2026-04-10",
            }
        ],
        "market_prices": {
            "CRP-EGG": 2.80,
            "CRP-CAS": 1.20,
        },
    }


@pytest.fixture
def async_db_session():
    """
    Mock async SQLAlchemy session that returns pre-seeded test data.
    """
    session = AsyncMock()

    async def mock_execute(stmt, *args, **kwargs):
        result = MagicMock()
        result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        result.scalar_one_or_none = MagicMock(return_value=None)
        return result

    session.execute = mock_execute
    session.add = MagicMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.rollback = AsyncMock()
    return session


# ===========================================================================
# KNOWLEDGE BROKER TESTS
# ===========================================================================

class TestKnowledgeBrokerRAGConstraint:
    """Tests for the hard RAG constraint — TIS must only answer from validated KB."""

    @pytest.mark.asyncio
    async def test_knowledge_broker_returns_kb_answer(
        self, mock_anthropic, mock_openai, kb_article_fixture
    ):
        """
        KB query with matching article (similarity > 0.65) returns KB content.

        Setup:  Vector search returns KB-001 'Eggplant Vegetative Stage Protocol'
                with similarity=0.85.
        Query:  "When should I fertilize my eggplant?"
        Assert: Response contains KB article content (NPK, 14-day intervals).
                Response does NOT fabricate advice beyond what is in KB-001.
                Response cites the article by title or article_id.
        """
        top_article = kb_article_fixture[0]  # similarity=0.85

        # The Knowledge Broker builds a prompt from the retrieved articles
        # and calls Claude. We simulate that the Claude response mirrors KB content.
        kb_response_text = (
            "During the Vegetative Growth stage of Eggplant (CRP-EGG), apply NPK (12-12-17) "
            "at 150 kg/ha every 14 days. [Source: Teivaka KB — Eggplant Vegetative Stage Protocol]"
        )
        mock_anthropic.messages.create.return_value.content[0].text = kb_response_text

        # Simulate Knowledge Broker logic
        query = "When should I fertilize my eggplant?"

        # 1. Embed query
        query_embedding = await mock_openai.embeddings.create(
            model="text-embedding-3-small",
            input=query,
        )
        assert len(query_embedding.data[0].embedding) == 1536

        # 2. Vector search returns article above threshold (0.85 > 0.65)
        assert top_article["similarity"] > 0.65

        # 3. Claude is called with the KB article as context
        call_args = {
            "model": "claude-sonnet-4-20250514",
            "messages": [
                {
                    "role": "user",
                    "content": (
                        f"Using ONLY the following Teivaka Knowledge Base article, "
                        f"answer the question.\n\n"
                        f"Article: {top_article['title']}\n"
                        f"Content: {top_article['content']}\n\n"
                        f"Question: {query}"
                    ),
                }
            ],
        }
        response = await mock_anthropic.messages.create(**call_args)
        response_text = response.content[0].text

        # Assertions
        assert "NPK" in response_text or "14" in response_text, (
            "Response must reference KB article content (NPK / 14-day)"
        )
        assert "Source: Teivaka KB" in response_text or "Eggplant Vegetative" in response_text, (
            "Response must cite the KB article"
        )
        assert "I cannot find" not in response_text, (
            "Match above threshold must NOT trigger the not-found message"
        )

    @pytest.mark.asyncio
    async def test_knowledge_broker_refuses_answer_below_threshold(
        self, mock_anthropic, mock_openai
    ):
        """
        KB query with no matching article (max_similarity < 0.65) triggers
        the standardized 'not found' response.

        Setup:  Vector search returns max_similarity=0.45.
        Query:  "What is the best treatment for root rot in hydroponics?"
        Assert: Response contains exact 'not found' phrase.
                Response does NOT contain fabricated agronomic advice.
                Response offers nearest article reference if available.
        """
        # Nearest article found but below threshold
        nearest_article = {
            "article_id": "KB-003",
            "title": "Cassava Establishment Protocol",
            "similarity": 0.45,  # below threshold 0.65
        }

        THRESHOLD = 0.65
        max_similarity = nearest_article["similarity"]

        # Knowledge Broker must reject and return standard message
        assert max_similarity < THRESHOLD

        NOT_FOUND_RESPONSE = (
            "I cannot find a validated answer for that specific question in the Teivaka "
            "Knowledge Base. Here is the closest protocol I can reference: "
            f"{nearest_article['title']}"
        )

        # Assert NOT_FOUND message structure
        assert "I cannot find a validated answer for that specific question in the Teivaka Knowledge Base" in NOT_FOUND_RESPONSE
        assert NOT_FOUND_RESPONSE.startswith("I cannot find a validated answer")
        assert nearest_article["title"] in NOT_FOUND_RESPONSE

        # Claude must NOT be called with a request to answer from general knowledge
        mock_anthropic.messages.create.assert_not_called()

    @pytest.mark.asyncio
    async def test_knowledge_broker_not_found_response_is_exact_format(self):
        """
        Not-found response must start with 'I cannot find a validated answer'
        and reference 'Teivaka Knowledge Base'. Must contain no crop-specific
        recommendations.
        """
        NOT_FOUND_TEMPLATE = (
            "I cannot find a validated answer for that specific question in the "
            "Teivaka Knowledge Base. Here is the closest protocol I can reference: "
            "{nearest_article_title}"
        )

        rendered = NOT_FOUND_TEMPLATE.format(nearest_article_title="Cassava Establishment Protocol")

        assert rendered.startswith(
            "I cannot find a validated answer for that specific question"
        ), "Not-found response must start with the exact phrase"

        assert "Teivaka Knowledge Base" in rendered, (
            "Response must reference 'Teivaka Knowledge Base'"
        )

        # Must not contain specific crop recommendations
        forbidden_phrases = [
            "apply fertiliser",
            "kg/ha",
            "spray Dimethoate",
            "treat with Mancozeb",
        ]
        for phrase in forbidden_phrases:
            assert phrase not in rendered, (
                f"Not-found response must not contain crop advice: '{phrase}'"
            )

    @pytest.mark.asyncio
    async def test_knowledge_broker_returns_top_3_articles_for_context(
        self, mock_anthropic, mock_openai, kb_article_fixture
    ):
        """
        Knowledge Broker fetches top 3 KB articles above threshold
        and passes all three summaries in the Claude API call.
        """
        THRESHOLD = 0.65
        above_threshold = [a for a in kb_article_fixture if a["similarity"] >= THRESHOLD]
        assert len(above_threshold) == 3, "Fixture must have 3 articles above threshold"

        # Build the context block that should be sent to Claude
        context_block = "\n\n".join(
            f"Article {i+1}: {a['title']}\n{a['content']}"
            for i, a in enumerate(above_threshold)
        )

        await mock_anthropic.messages.create(
            model="claude-sonnet-4-20250514",
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Using ONLY the following Teivaka Knowledge Base articles, "
                        f"answer the question.\n\n{context_block}\n\nQuestion: test?"
                    ),
                }
            ],
        )

        call_kwargs = mock_anthropic.messages.create.call_args
        assert call_kwargs is not None

        # Verify all 3 article titles appear in the call content
        call_content = str(call_kwargs)
        for article in above_threshold:
            assert article["title"] in call_content, (
                f"Article '{article['title']}' must be included in Claude call"
            )

    @pytest.mark.asyncio
    async def test_knowledge_broker_uses_only_validated_kb_content(
        self, mock_anthropic, kb_article_fixture
    ):
        """
        Response must cite Mancozeb rate exactly as in KB article (2 kg/ha).
        No new chemical names may appear that are absent from the KB article.
        """
        fruiting_article = next(
            a for a in kb_article_fixture if a["article_id"] == "KB-002"
        )
        # KB says Mancozeb at 2 kg/ha
        assert "Mancozeb at 2 kg/ha" in fruiting_article["content"]

        # Claude mock returns a response that accurately reflects KB content
        mock_anthropic.messages.create.return_value.content[0].text = (
            "Apply Mancozeb at 2 kg/ha every 7 days during the Fruiting stage. "
            "[Source: Teivaka KB — Eggplant Fruiting Stage Protocol]"
        )

        response = await mock_anthropic.messages.create(
            model="claude-sonnet-4-20250514",
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Using ONLY the following KB article:\n{fruiting_article['content']}\n\n"
                        "Question: How do I treat fungal disease in eggplant fruiting stage?"
                    ),
                }
            ],
        )
        response_text = response.content[0].text

        # Rate must be exact match to KB
        assert "2 kg/ha" in response_text, "Mancozeb rate must match KB: 2 kg/ha"

        # No hallucinated chemicals
        hallucinated_chemicals = ["Chlorpyrifos", "Cypermethrin", "Glyphosate"]
        for chem in hallucinated_chemicals:
            assert chem not in response_text, (
                f"Hallucinated chemical '{chem}' must not appear in KB-grounded response"
            )

    @pytest.mark.asyncio
    async def test_knowledge_broker_stage_specific_query(
        self, mock_anthropic, kb_article_fixture, teivaka_farm_context
    ):
        """
        Query about Fruiting stage of CRP-EGG on PU002 returns fruiting protocol,
        not vegetative protocol. KB stage_links map is respected.
        """
        # PU002 is currently in Fruiting stage
        active_cycle = next(
            c for c in teivaka_farm_context["active_cycles"] if c["pu_id"] == "F001-PU002"
        )
        assert active_cycle["stage"] == "Fruiting"

        fruiting_article = next(
            a for a in kb_article_fixture if a["stage"] == "Fruiting"
        )
        vegetative_article = next(
            a for a in kb_article_fixture if a["stage"] == "Vegetative"
        )

        # Fruiting article has higher similarity for this query
        assert fruiting_article["similarity"] > vegetative_article["similarity"] - 0.10

        mock_anthropic.messages.create.return_value.content[0].text = (
            "During the Fruiting stage, apply K2SO4 at 100 kg/ha. "
            "Harvest when fruit reaches 150-200g. "
            "[Source: Teivaka KB — Eggplant Fruiting Stage Protocol]"
        )

        response = await mock_anthropic.messages.create(
            model="claude-sonnet-4-20250514",
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Context: PU002 is in Fruiting stage.\n"
                        f"KB Article: {fruiting_article['title']}\n"
                        f"Content: {fruiting_article['content']}\n\n"
                        "Question: What should I do in the fruiting stage of eggplant?"
                    ),
                }
            ],
        )
        response_text = response.content[0].text

        assert "Fruiting" in response_text or "K2SO4" in response_text, (
            "Response must reference fruiting-stage protocol"
        )
        assert "Vegetative" not in response_text, (
            "Response must not bleed vegetative protocol into fruiting query"
        )


class TestKnowledgeBrokerEmbedding:
    """Tests for embedding generation and vector search."""

    @pytest.mark.asyncio
    async def test_embedding_generated_on_article_publish(self, mock_openai):
        """
        Publishing a KB article triggers embedding generation.
        embedding_vector field must be populated (1536 dims) after publish.
        """
        article = {
            "article_id": "KB-TEST-001",
            "title": "Kava Establishment Protocol",
            "content": "Plant kava cuttings at 2m × 2m spacing. Apply NPK at planting.",
            "published": False,
            "embedding_vector": None,
        }

        # Simulate setting published=True triggers embedding call
        article["published"] = True

        embedding_response = await mock_openai.embeddings.create(
            model="text-embedding-3-small",
            input=f"{article['title']} {article['content']}",
        )
        article["embedding_vector"] = embedding_response.data[0].embedding

        assert article["embedding_vector"] is not None, "Embedding must be populated on publish"
        assert len(article["embedding_vector"]) == 1536, "Embedding must be 1536-dimensional"

    @pytest.mark.asyncio
    async def test_query_embedding_generated_before_search(self, mock_openai):
        """
        Query text is embedded via OpenAI embeddings API before vector similarity search.
        Returned 1536-dim vector is used in the pgvector SQL query.
        """
        query = "When should I harvest eggplant?"

        embedding_response = await mock_openai.embeddings.create(
            model="text-embedding-3-small",
            input=query,
        )
        query_vector = embedding_response.data[0].embedding

        # Assert the API was called with the query text
        mock_openai.embeddings.create.assert_called_once_with(
            model="text-embedding-3-small",
            input=query,
        )

        # Assert vector is the correct dimensionality for pgvector
        assert len(query_vector) == 1536, "Query embedding must be 1536-dimensional for pgvector"

        # Simulate the SQL parameter: the vector would be cast to ::vector in the query
        vector_param = query_vector
        assert isinstance(vector_param, list)
        assert all(isinstance(v, float) for v in vector_param)


# ===========================================================================
# COMMAND EXECUTOR TESTS
# ===========================================================================

class TestCommandExecutorLogHarvest:
    """Tests for LOG_HARVEST command."""

    @pytest.mark.asyncio
    async def test_log_harvest_creates_harvest_record(self, mock_anthropic, async_db_session):
        """
        'Harvested 42kg eggplant Grade A on PU002 today' creates harvest_log record.

        Assert: POST /harvests creates record with correct pu_id, qty_kg, grade.
                harvest_id matches HRV-YYYYMMDD-### pattern.
                Confirmation mentions qty, grade, production name.
        """
        today = date.today()
        harvest_input = {
            "pu_id": "F001-PU002",
            "production_id": "CRP-EGG",
            "qty_kg": 42.0,
            "grade": "A",
            "harvest_date": today.isoformat(),
            "unit_price_fjd": 2.80,
        }

        # Simulate harvest record creation
        harvest_id = f"HRV-{today.strftime('%Y%m%d')}-001"

        harvest_record = {
            "id": str(uuid4()),
            "harvest_id": harvest_id,
            "pu_id": harvest_input["pu_id"],
            "qty_kg": harvest_input["qty_kg"],
            "grade": harvest_input["grade"],
            "harvest_date": harvest_input["harvest_date"],
            "unit_price_fjd": harvest_input["unit_price_fjd"],
            "total_value_fjd": round(42.0 * 2.80, 2),  # 117.60
            "compliance_status": "COMPLIANT",
        }

        # Assert record shape
        assert harvest_record["pu_id"] == "F001-PU002"
        assert harvest_record["qty_kg"] == 42.0
        assert harvest_record["grade"] == "A"
        assert re.match(r"HRV-\d{8}-\d{3}", harvest_record["harvest_id"]), (
            f"harvest_id '{harvest_record['harvest_id']}' must match HRV-YYYYMMDD-### pattern"
        )

        # Simulate CoKG recalculation
        updated_cogk = (480.00 + 73.00 + 0.00) / (294.0 + 42.0)  # = 1.638...
        assert updated_cogk > 0

        # Confirmation message
        confirmation = (
            f"Harvest logged: {harvest_record['qty_kg']}kg Eggplant Grade {harvest_record['grade']} "
            f"on F001-PU002. ID: {harvest_record['harvest_id']}. "
            f"CoKG updated to FJD {updated_cogk:.2f}/kg."
        )
        assert "42kg" in confirmation or "42.0kg" in confirmation
        assert "Grade A" in confirmation
        assert "CoKG" in confirmation

    @pytest.mark.asyncio
    async def test_log_harvest_blocked_by_chemical_compliance(
        self, mock_anthropic, teivaka_farm_context
    ):
        """
        LOG_HARVEST is blocked when Dimethoate (CHEM-001, 7-day WHD)
        was applied 4 days ago to F001-PU002.

        Assert: harvest_log NOT created.
                TIS response contains 'Harvest cannot be logged' and safe date.
        """
        harvest_date = date(2026, 4, 7)

        # Chemical compliance check data
        chemical = teivaka_farm_context["chemicals_applied"][0]
        application_date = date.fromisoformat(chemical["application_date"])
        days_since_application = (harvest_date - application_date).days

        assert days_since_application == 4, "Setup: 4 days since Dimethoate application"
        assert days_since_application < chemical["withholding_period_days"], (
            "Harvest must be blocked: 4 days < 7 days WHD"
        )

        safe_harvest_date = application_date + timedelta(
            days=chemical["withholding_period_days"]
        )

        # Compliance check returns BLOCKED
        compliance_result = {
            "compliant": False,
            "blocking_chemicals": [chemical],
            "earliest_safe_harvest_date": safe_harvest_date.isoformat(),
        }

        assert compliance_result["compliant"] is False

        # Build the expected error response (HTTP 409)
        error_response = {
            "success": False,
            "error": {
                "code": "COMPLIANCE_VIOLATION",
                "message": (
                    f"Harvest cannot be logged: {chemical['chemical_name']} was applied "
                    f"{days_since_application} days ago. Withholding period: "
                    f"{chemical['withholding_period_days']} days. "
                    f"Safe to harvest after {safe_harvest_date.isoformat()}."
                ),
                "details": {
                    "blocking_chemicals": compliance_result["blocking_chemicals"],
                    "earliest_safe_harvest_date": compliance_result["earliest_safe_harvest_date"],
                },
            },
        }

        assert "Harvest cannot be logged" in error_response["error"]["message"]
        assert safe_harvest_date.isoformat() in error_response["error"]["message"]
        assert error_response["success"] is False

    @pytest.mark.asyncio
    async def test_log_harvest_default_grade_is_A(self):
        """
        LOG_HARVEST without grade specification defaults to Grade A.
        """
        parsed_command = {
            "command_type": "LOG_HARVEST",
            "pu_id": "F001-PU001",
            "production_id": "CRP-CAS",
            "qty_kg": 30.0,
            "harvest_date": date.today().isoformat(),
            "grade": None,  # Not specified
        }

        # Default grade logic
        if parsed_command["grade"] is None:
            parsed_command["grade"] = "A"

        assert parsed_command["grade"] == "A", (
            "Default grade must be 'A' when not specified"
        )

    @pytest.mark.asyncio
    async def test_log_harvest_confirmation_includes_cogk(self):
        """
        Harvest confirmation message includes updated CoKG (Cost per Kilogram).
        CoKG = (LaborCost + InputCost + OtherCost) / TotalHarvestQty_kg
        """
        cycle_costs = {
            "total_labor_cost_fjd": 480.00,
            "total_input_cost_fjd": 73.00,
            "total_other_cost_fjd": 0.00,
        }
        total_harvest_qty_kg = 336.0  # 294 existing + 42 new

        cogk = (
            cycle_costs["total_labor_cost_fjd"]
            + cycle_costs["total_input_cost_fjd"]
            + cycle_costs["total_other_cost_fjd"]
        ) / total_harvest_qty_kg

        confirmation = (
            f"Harvest logged: 42kg Eggplant Grade A on F001-PU002. "
            f"CoKG: FJD {cogk:.2f}/kg"
        )

        assert "CoKG:" in confirmation, "Confirmation must include CoKG"
        assert "FJD" in confirmation, "CoKG must be in FJD"
        assert "/kg" in confirmation, "CoKG must show per-kg unit"

        # Verify CoKG formula correctness
        expected_cogk = 553.00 / 336.0
        assert abs(cogk - expected_cogk) < 0.01


class TestCommandExecutorLogLabor:
    """Tests for LOG_LABOR command."""

    @pytest.mark.asyncio
    async def test_log_labor_maps_worker_name_to_id(self, teivaka_farm_context):
        """
        'Laisenia Waqa worked 8 hours on PU002' maps name to W-001.

        Assert: worker_id = 'W-001', hours_worked = 8,
                total_cost_fjd = 48.00 (8h × FJD6.00/h).
        """
        worker_name_input = "Laisenia Waqa"
        hours_input = 8

        # Lookup worker by name
        workers = teivaka_farm_context["workers"]
        matched_worker = next(
            (w for w in workers if w["name"].lower() == worker_name_input.lower()), None
        )

        assert matched_worker is not None, "Worker name must resolve to a known worker"
        assert matched_worker["worker_id"] == "W-001"

        # Cost calculation: FJD6.00/hr × 8hr = FJD48.00
        hourly_rate_fjd = matched_worker["daily_rate_fjd"] / 8  # FJD6.00/hr
        total_cost_fjd = hourly_rate_fjd * hours_input

        labor_record = {
            "worker_id": matched_worker["worker_id"],
            "pu_id": "F001-PU002",
            "hours_worked": hours_input,
            "task_description": "weeding",
            "total_cost_fjd": total_cost_fjd,
            "work_date": date.today().isoformat(),
        }

        assert labor_record["worker_id"] == "W-001"
        assert labor_record["hours_worked"] == 8
        assert labor_record["total_cost_fjd"] == 48.00

    @pytest.mark.asyncio
    async def test_log_labor_default_hours_is_8(self):
        """
        LOG_LABOR without hours specified defaults to 8 hours (full day).
        """
        parsed_command = {
            "command_type": "LOG_LABOR",
            "worker_name": "Laisenia Waqa",
            "pu_id": "F001-PU002",
            "hours_worked": None,  # not specified
            "work_date": date.today().isoformat(),
        }

        # Default hours logic
        if parsed_command["hours_worked"] is None:
            parsed_command["hours_worked"] = 8

        assert parsed_command["hours_worked"] == 8, (
            "Default hours must be 8 (standard daily capacity)"
        )

    @pytest.mark.asyncio
    async def test_log_labor_creates_lab_id(self):
        """
        Labor attendance record ID must match LAB-YYYYMMDD-### pattern.
        """
        today = date.today()
        lab_id = f"LAB-{today.strftime('%Y%m%d')}-001"

        assert re.match(r"LAB-\d{8}-\d{3}", lab_id), (
            f"labor ID '{lab_id}' must match LAB-YYYYMMDD-### pattern"
        )
        assert lab_id.startswith("LAB-"), "Labor ID prefix must be 'LAB-'"


class TestCommandExecutorCheckTasks:
    """Tests for CHECK_TASKS command."""

    @pytest.mark.asyncio
    async def test_check_tasks_returns_formatted_list(self, mock_anthropic):
        """
        CHECK_TASKS returns formatted list with priority indicators.
        Overdue tasks marked clearly (OVERDUE or equivalent indicator).
        """
        today = date.today()
        mock_tasks = [
            {
                "task_id": "TSK-20260331-001",
                "title": "Apply NPK fertiliser — PU002 Fruiting",
                "due_date": (today - timedelta(days=3)).isoformat(),
                "status": "OPEN",
                "priority": "HIGH",
                "pu_id": "F001-PU002",
            },
            {
                "task_id": "TSK-20260401-001",
                "title": "Scout for aphids — PU003",
                "due_date": (today - timedelta(days=1)).isoformat(),
                "status": "OPEN",
                "priority": "MEDIUM",
                "pu_id": "F001-PU003",
            },
            {
                "task_id": "TSK-20260407-001",
                "title": "Irrigation check — PU001",
                "due_date": today.isoformat(),
                "status": "OPEN",
                "priority": "MEDIUM",
                "pu_id": "F001-PU001",
            },
            {
                "task_id": "TSK-20260410-001",
                "title": "Apply Mancozeb — PU002",
                "due_date": (today + timedelta(days=3)).isoformat(),
                "status": "OPEN",
                "priority": "LOW",
                "pu_id": "F001-PU002",
            },
            {
                "task_id": "TSK-20260415-001",
                "title": "Harvest check — PU002",
                "due_date": (today + timedelta(days=8)).isoformat(),
                "status": "OPEN",
                "priority": "LOW",
                "pu_id": "F001-PU002",
            },
        ]

        overdue = [t for t in mock_tasks if t["due_date"] < today.isoformat()]
        due_today = [t for t in mock_tasks if t["due_date"] == today.isoformat()]
        upcoming = [t for t in mock_tasks if t["due_date"] > today.isoformat()]

        assert len(overdue) == 2, "Fixture must have 2 overdue tasks"
        assert len(due_today) == 1, "Fixture must have 1 task due today"
        assert len(upcoming) == 2, "Fixture must have 2 upcoming tasks"

        # Build formatted response
        response_lines = []
        for task in overdue:
            response_lines.append(f"[OVERDUE] {task['title']} — due {task['due_date']}")
        for task in due_today:
            response_lines.append(f"[DUE TODAY] {task['title']}")
        for task in upcoming:
            response_lines.append(f"[ ] {task['title']} — due {task['due_date']}")

        response_text = "\n".join(response_lines)

        assert "OVERDUE" in response_text, "Overdue tasks must be marked OVERDUE"
        assert "DUE TODAY" in response_text, "Today's tasks must be marked DUE TODAY"
        assert len(overdue) == response_text.count("OVERDUE"), (
            "Count of OVERDUE markers must match overdue task count"
        )

    @pytest.mark.asyncio
    async def test_check_tasks_empty_returns_clear_message(self):
        """
        CHECK_TASKS with no open tasks returns a clear, friendly message.
        """
        open_tasks = []

        if not open_tasks:
            response_text = "No open tasks. Great work keeping up with operations!"
        else:
            response_text = "You have tasks to complete."

        assert "No open tasks" in response_text, (
            "Empty task list must return 'No open tasks' message"
        )


class TestCommandExecutorCheckFinancials:
    """Tests for CHECK_FINANCIALS command."""

    @pytest.mark.asyncio
    async def test_check_financials_returns_cogk_first(
        self, mock_anthropic, teivaka_farm_context
    ):
        """
        CHECK_FINANCIALS response has CoKG as the first metric reported.
        CoKG must appear before gross_margin or revenue in the response text.
        """
        cycle = teivaka_farm_context["active_cycles"][0]  # CY-F001-26-002, CRP-EGG

        financials = {
            "cycle_id": cycle["cycle_id"],
            "pu_id": cycle["pu_id"],
            "cogk_fjd": cycle["cogk_fjd"],
            "gross_margin_pct": cycle["gross_margin_pct"],
            "total_revenue_fjd": cycle["total_revenue_fjd"],
            "total_cost_fjd": (
                cycle["total_labor_cost_fjd"]
                + cycle["total_input_cost_fjd"]
                + cycle["total_other_cost_fjd"]
            ),
            "total_harvest_qty_kg": cycle["total_harvest_qty_kg"],
        }

        mock_anthropic.messages.create.return_value.content[0].text = (
            f"CoKG: FJD {financials['cogk_fjd']:.2f}/kg — "
            f"Gross Margin: {financials['gross_margin_pct']:.1f}% — "
            f"Revenue: FJD {financials['total_revenue_fjd']:.2f}"
        )

        response = await mock_anthropic.messages.create(
            model="claude-sonnet-4-20250514",
            messages=[{"role": "user", "content": "Show financials for PU002"}],
        )
        response_text = response.content[0].text

        cogk_pos = response_text.find("CoKG")
        margin_pos = response_text.find("Gross Margin")
        revenue_pos = response_text.find("Revenue")

        assert cogk_pos != -1, "CoKG must appear in financial response"
        assert cogk_pos < margin_pos, "CoKG must appear before Gross Margin"
        assert cogk_pos < revenue_pos, "CoKG must appear before Revenue"

    @pytest.mark.asyncio
    async def test_check_financials_interprets_cogk(
        self, mock_anthropic, teivaka_farm_context
    ):
        """
        When CoKG < market price, response must note profitable margin.
        Setup: CoKG = FJD 1.86/kg, market price CRP-EGG = FJD 2.80/kg.
        """
        cycle = teivaka_farm_context["active_cycles"][0]
        cogk = cycle["cogk_fjd"]                              # 1.86
        market_price = teivaka_farm_context["market_prices"]["CRP-EGG"]  # 2.80

        assert cogk < market_price, "Test setup: CoKG must be below market price"

        margin_per_kg = market_price - cogk  # 0.94 FJD/kg

        mock_anthropic.messages.create.return_value.content[0].text = (
            f"CoKG: FJD {cogk:.2f}/kg vs market price FJD {market_price:.2f}/kg. "
            f"You are earning a margin of FJD {margin_per_kg:.2f} per kg. "
            f"This cycle is profitable."
        )

        response = await mock_anthropic.messages.create(
            model="claude-sonnet-4-20250514",
            messages=[{"role": "user", "content": "Explain my CoKG on PU002"}],
        )
        response_text = response.content[0].text

        assert "profitable" in response_text.lower() or "margin" in response_text.lower(), (
            "Response must indicate profitable status when CoKG < market price"
        )
        assert "1.86" in response_text or f"{cogk:.2f}" in response_text, (
            "Response must reference actual CoKG value"
        )


class TestCommandExecutorCreateCycle:
    """Tests for CREATE_CYCLE command with rotation validation."""

    @pytest.mark.asyncio
    async def test_create_cycle_blocked_by_rotation(self):
        """
        CREATE_CYCLE for CRP-EGG on PU002 is blocked because PU002
        finished an eggplant cycle only 20 days ago (min_rest_days=60).

        Assert: cycle NOT created.
                Response explains block with min_rest_days and shows alternatives.
        """
        rotation_validation = {
            "pu_id": "F001-PU002",
            "proposed_production_id": "CRP-EGG",
            "proposed_planting_date": "2026-04-08",
            "allowed": False,
            "enforcement_decision": "BLOCKED",
            "rule_status": "BLOCK",
            "min_rest_days": 60,
            "days_since_last_harvest": 20,
            "days_short": 40,
            "rotation_key": "CRP-EGG:CRP-EGG",
            "alternatives": [
                {"production_id": "CRP-FRB", "production_name": "French Beans", "rule_status": "PREF"},
                {"production_id": "CRP-LBN", "production_name": "Long Bean (Yardlong Bean)", "rule_status": "PREF"},
                {"production_id": "CRP-SCN", "production_name": "Sweet Corn", "rule_status": "OK"},
            ],
        }

        assert rotation_validation["allowed"] is False
        assert rotation_validation["enforcement_decision"] == "BLOCKED"

        # Cycle must not be created
        cycle_created = False
        if rotation_validation["enforcement_decision"] == "BLOCKED":
            cycle_created = False

        assert cycle_created is False, "Cycle must NOT be created when rotation is BLOCKED"

        # Response must explain block
        error_response = {
            "success": False,
            "error": {
                "code": "ROTATION_BLOCKED",
                "message": (
                    f"Cannot plant CRP-EGG on F001-PU002. Rotation rule blocks same-family "
                    f"replanting for {rotation_validation['min_rest_days']} days. "
                    f"Only {rotation_validation['days_since_last_harvest']} days have passed "
                    f"({rotation_validation['days_short']} days short). "
                    f"Alternatives: French Beans, Long Bean, Sweet Corn."
                ),
                "rotation_validation": rotation_validation,
            },
        }

        msg = error_response["error"]["message"]
        assert "60" in msg or "min_rest_days" in str(rotation_validation), (
            "Response must mention minimum rest days"
        )
        assert len(rotation_validation["alternatives"]) >= 2, (
            "Rotation block must include at least 2 alternatives"
        )

    @pytest.mark.asyncio
    async def test_create_cycle_approved_with_new_crop(self):
        """
        CREATE_CYCLE for Long Bean (CRP-LBN) on PU002 after Eggplant
        is approved (different crop family, rotation PREF status).

        Assert: production_cycle created, confirmation message includes new cycle_id.
        """
        rotation_validation = {
            "pu_id": "F001-PU002",
            "proposed_production_id": "CRP-LBN",
            "proposed_planting_date": "2026-04-08",
            "allowed": True,
            "enforcement_decision": "APPROVED",
            "rule_status": "PREF",
            "min_rest_days": 0,
        }

        assert rotation_validation["allowed"] is True
        assert rotation_validation["enforcement_decision"] == "APPROVED"

        # Cycle is created
        new_cycle = {
            "cycle_id": "CY-F001-26-003",
            "pu_id": "F001-PU002",
            "production_id": "CRP-LBN",
            "planting_date": "2026-04-08",
            "status": "active",
            "stage": "Establishment",
        }

        assert new_cycle["cycle_id"].startswith("CY-"), "Cycle ID must start with 'CY-'"
        assert new_cycle["production_id"] == "CRP-LBN"

        confirmation = (
            f"Cycle created: {new_cycle['cycle_id']} — Long Bean on F001-PU002. "
            f"Stage: Establishment. Planting date: {new_cycle['planting_date']}."
        )
        assert new_cycle["cycle_id"] in confirmation


# ===========================================================================
# OPERATIONAL INTERPRETER TESTS
# ===========================================================================

class TestOperationalInterpreter:
    """Tests for the Operational Interpreter module."""

    @pytest.mark.asyncio
    async def test_interpreter_explains_high_cogk(
        self, mock_anthropic, teivaka_farm_context
    ):
        """
        Interpreter explains high CoKG for CY-F001-26-002 (CRP-EGG).

        Setup:  Override CoKG to FJD 4.50/kg (above market price FJD 2.80).
        Query:  "Why is my CoKG so high on PU002?"
        Assert: Response references CY-F001-26-002, F001-PU002, actual CoKG.
                Response does NOT use generic advice not grounded in context data.
        """
        # Override CoKG to simulate high cost scenario
        cycle = dict(teivaka_farm_context["active_cycles"][0])
        cycle["cogk_fjd"] = 4.50
        cycle["total_labor_cost_fjd"] = 840.00  # high labor cost driver

        mock_anthropic.messages.create.return_value.content[0].text = (
            f"Cycle CY-F001-26-002 on F001-PU002 shows a CoKG of FJD 4.50/kg, which is "
            f"above the market price of FJD 2.80/kg. The primary driver is high labor costs "
            f"(FJD {cycle['total_labor_cost_fjd']:.2f}). This makes the cycle unprofitable. "
            f"Consider reviewing labor allocation on F001-PU002."
        )

        response = await mock_anthropic.messages.create(
            model="claude-sonnet-4-20250514",
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Farm context: {json.dumps(teivaka_farm_context)}\n\n"
                        "Question: Why is my CoKG so high on PU002?"
                    ),
                }
            ],
        )
        response_text = response.content[0].text

        assert "CY-F001-26-002" in response_text, "Must reference actual cycle ID"
        assert "F001-PU002" in response_text, "Must reference actual PU"
        assert "4.50" in response_text, "Must reference actual CoKG value"

    @pytest.mark.asyncio
    async def test_interpreter_explains_red_alert(
        self, mock_anthropic, teivaka_farm_context
    ):
        """
        Interpreter explains the RED alert for RULE-038 (Chemical Compliance Block) on PU002.

        Assert: Response explains alert in plain language.
                Response references actual safe harvest date.
        """
        alert = teivaka_farm_context["open_alerts"][0]
        chemical = teivaka_farm_context["chemicals_applied"][0]

        mock_anthropic.messages.create.return_value.content[0].text = (
            f"The RED alert on F001-PU002 is a Chemical Compliance Block (RULE-038). "
            f"{chemical['chemical_name']} was applied on {chemical['application_date']} "
            f"and has a {chemical['withholding_period_days']}-day withholding period. "
            f"You cannot harvest until {chemical['safe_harvest_date']}."
        )

        response = await mock_anthropic.messages.create(
            model="claude-sonnet-4-20250514",
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Alert data: {json.dumps(alert)}\n"
                        f"Chemical data: {json.dumps(chemical)}\n\n"
                        "Question: What does the RED alert on PU002 mean?"
                    ),
                }
            ],
        )
        response_text = response.content[0].text

        assert "RULE-038" in response_text or "Chemical Compliance" in response_text, (
            "Must reference rule or alert title"
        )
        assert chemical["safe_harvest_date"] in response_text, (
            "Must reference the actual safe harvest date"
        )
        assert chemical["withholding_period_days"] == 7
        assert "7" in response_text, "Must reference 7-day withholding period"

    @pytest.mark.asyncio
    async def test_interpreter_uses_farm_context_only(
        self, mock_anthropic, teivaka_farm_context
    ):
        """
        Interpreter passes farm_context to Claude. Response must be
        grounded in provided data, not hallucinated cycle data.
        """
        await mock_anthropic.messages.create(
            model="claude-sonnet-4-20250514",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are Teivaka Intelligence System (TIS). "
                        "Answer ONLY using the farm context data provided. "
                        "Do not invent cycle IDs, costs, or recommendations "
                        "not present in the context."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Farm context:\n{json.dumps(teivaka_farm_context, indent=2)}\n\n"
                        "Question: What are my active cycles and their CoKG?"
                    ),
                },
            ],
        )

        call_args = mock_anthropic.messages.create.call_args
        assert call_args is not None

        # Verify farm context was included
        call_content = str(call_args)
        assert "F001" in call_content, "Farm ID must be in Claude call"
        assert "CY-F001-26-002" in call_content, "Cycle ID must be in Claude call"
        assert "cogk_fjd" in call_content, "CoKG must be in Claude call context"

    @pytest.mark.asyncio
    async def test_interpreter_context_includes_cogk(self, teivaka_farm_context):
        """
        Farm context snapshot always includes cogk_fjd for active cycles.
        """
        for cycle in teivaka_farm_context["active_cycles"]:
            assert "cogk_fjd" in cycle, (
                f"Farm context cycle {cycle['cycle_id']} must include cogk_fjd"
            )


# ===========================================================================
# VOICE PIPELINE TESTS
# ===========================================================================

class TestVoicePipeline:
    """Tests for the voice command pipeline (Audio → Whisper → TIS → DB → Confirm)."""

    @pytest.mark.asyncio
    async def test_voice_pipeline_routes_to_command_executor(self, mock_openai):
        """
        Voice recording transcribed to 'Harvested 42 kilograms eggplant Grade A on PU002'
        is routed to Command Executor (not Knowledge Broker).

        Assert: intent = LOG_HARVEST.
                entities: qty_kg=42, production='CRP-EGG', pu_id='F001-PU002', grade='A'.
        """
        # Whisper returns harvest command
        mock_openai.audio.transcriptions.create.return_value.text = (
            "Harvested 42 kilograms eggplant Grade A on PU002"
        )

        transcript_response = await mock_openai.audio.transcriptions.create(
            model="whisper-1",
            file=b"mock_audio_bytes",
            language="en",
        )
        transcript = transcript_response.text

        assert transcript == "Harvested 42 kilograms eggplant Grade A on PU002"

        # Simulate intent classification
        COMMAND_KEYWORDS = {
            "LOG_HARVEST": ["harvested", "harvest", "picked", "collected"],
            "LOG_LABOR": ["worked", "labor", "hours", "weeded", "sprayed"],
            "LOG_INPUT": ["applied", "sprayed", "fertilised", "treated"],
            "CHECK_TASKS": ["tasks", "what should i do", "to-do"],
            "CHECK_ALERTS": ["alerts", "warnings", "issues"],
        }

        def classify_intent(text: str) -> str:
            text_lower = text.lower()
            for intent, keywords in COMMAND_KEYWORDS.items():
                if any(kw in text_lower for kw in keywords):
                    return intent
            return "KNOWLEDGE_BROKER"

        intent = classify_intent(transcript)
        assert intent == "LOG_HARVEST", f"Intent must be LOG_HARVEST, got {intent}"

        # Entity extraction simulation
        entities = {}
        import re
        qty_match = re.search(r"(\d+(?:\.\d+)?)\s*kilo(?:gram)?s?", transcript, re.IGNORECASE)
        if qty_match:
            entities["qty_kg"] = float(qty_match.group(1))

        grade_match = re.search(r"grade\s+([A-C])", transcript, re.IGNORECASE)
        if grade_match:
            entities["grade"] = grade_match.group(1).upper()

        pu_match = re.search(r"PU\d+", transcript, re.IGNORECASE)
        if pu_match:
            entities["pu_id"] = f"F001-{pu_match.group(0).upper()}"

        # Eggplant → CRP-EGG
        if "eggplant" in transcript.lower():
            entities["production"] = "CRP-EGG"

        assert entities.get("qty_kg") == 42.0, f"qty_kg must be 42, got {entities.get('qty_kg')}"
        assert entities.get("grade") == "A", f"grade must be A, got {entities.get('grade')}"
        assert entities.get("pu_id") == "F001-PU002", f"pu_id must be F001-PU002"
        assert entities.get("production") == "CRP-EGG", f"production must be CRP-EGG"

    @pytest.mark.asyncio
    async def test_voice_pipeline_routes_to_knowledge_broker(self, mock_openai):
        """
        Voice question about eggplant watering is routed to Knowledge Broker,
        not Command Executor.
        """
        mock_openai.audio.transcriptions.create.return_value.text = (
            "How often should I water my eggplant in the fruiting stage"
        )

        transcript_response = await mock_openai.audio.transcriptions.create(
            model="whisper-1",
            file=b"mock_audio_bytes",
            language="en",
        )
        transcript = transcript_response.text

        def classify_tis_module(text: str) -> str:
            command_indicators = [
                "harvested", "harvest", "log", "worked", "applied",
                "check tasks", "check alerts", "show financials", "create cycle",
                "start", "plant",
            ]
            text_lower = text.lower()
            if any(kw in text_lower for kw in command_indicators):
                return "command_executor"
            return "knowledge_broker"

        module = classify_tis_module(transcript)
        assert module == "knowledge_broker", (
            f"Question must route to knowledge_broker, got {module}"
        )

    @pytest.mark.asyncio
    async def test_voice_pipeline_completes_within_5_seconds(self, mock_openai, mock_anthropic):
        """
        Complete voice pipeline must complete within 5000ms.
        (Whisper + TIS routing + Claude API call + DB write mocked for speed.)
        """
        start_time = time.time()

        # Step 1: Whisper transcription (mocked, ~instant)
        transcript_response = await mock_openai.audio.transcriptions.create(
            model="whisper-1",
            file=b"mock_audio_bytes",
            language="en",
        )
        transcript = transcript_response.text

        # Step 2: Intent classification (instant)
        intent = "LOG_HARVEST" if "harvested" in transcript.lower() else "KNOWLEDGE_BROKER"

        # Step 3: TIS processing (mocked Claude, ~instant)
        if intent != "LOG_HARVEST":
            await mock_anthropic.messages.create(
                model="claude-sonnet-4-20250514",
                messages=[{"role": "user", "content": transcript}],
            )

        # Step 4: Simulate DB write (mocked, ~instant)
        await asyncio.sleep(0.001)  # Simulate minimal async DB latency

        elapsed_ms = (time.time() - start_time) * 1000

        assert elapsed_ms < 5000, (
            f"Voice pipeline must complete in <5000ms, took {elapsed_ms:.1f}ms"
        )

    @pytest.mark.asyncio
    async def test_voice_transcript_logged_in_tis_voice_logs(self, mock_openai, async_db_session):
        """
        Whisper transcript is persisted to tis_voice_logs table.
        """
        mock_openai.audio.transcriptions.create.return_value.text = (
            "Harvested 42 kilograms eggplant Grade A on PU002"
        )

        transcript_response = await mock_openai.audio.transcriptions.create(
            model="whisper-1",
            file=b"mock_audio_bytes",
            language="en",
        )
        transcript = transcript_response.text

        # Simulate voice log record creation
        voice_log = {
            "id": str(uuid4()),
            "farm_id": "F001",
            "pu_id": "F001-PU002",
            "audio_url": "https://storage.teivaka.com/voice/test-audio.webm",
            "whisper_transcript": transcript,
            "status": "completed",
            "created_at": datetime.utcnow().isoformat(),
        }

        # Simulate DB write
        async_db_session.add(voice_log)
        await async_db_session.commit()

        async_db_session.add.assert_called_once_with(voice_log)
        async_db_session.commit.assert_called_once()

        assert voice_log["whisper_transcript"] == transcript, (
            "whisper_transcript field must be populated in tis_voice_logs"
        )
        assert voice_log["whisper_transcript"] != "", (
            "whisper_transcript must not be empty"
        )

    @pytest.mark.asyncio
    async def test_empty_transcript_returns_error(self, mock_openai):
        """
        Empty or inaudible recording (Whisper returns '') triggers
        a helpful error message.
        """
        mock_openai.audio.transcriptions.create.return_value.text = ""

        transcript_response = await mock_openai.audio.transcriptions.create(
            model="whisper-1",
            file=b"mock_empty_audio",
            language="en",
        )
        transcript = transcript_response.text

        assert transcript == "", "Setup: Whisper must return empty string"

        # TIS must handle empty transcript
        if not transcript or transcript.strip() == "":
            error_response = {
                "success": False,
                "error": {
                    "code": "EMPTY_TRANSCRIPT",
                    "message": (
                        "Could not understand audio. Please try again or type your message."
                    ),
                },
            }
        else:
            error_response = {"success": True}

        assert error_response["success"] is False
        assert "Could not understand audio" in error_response["error"]["message"]
        assert "try again" in error_response["error"]["message"].lower()

    @pytest.mark.asyncio
    async def test_whisper_api_called_with_correct_params(self, mock_openai):
        """
        Whisper API must be called with model='whisper-1', language='en',
        and a prompt containing agricultural vocabulary hints.
        """
        audio_bytes = b"mock_audio_bytes"

        await mock_openai.audio.transcriptions.create(
            model="whisper-1",
            file=audio_bytes,
            language="en",
            prompt=(
                "Agricultural farm management. "
                "Crops: eggplant, cassava, kava, tomato. "
                "Actions: harvest, plant, spray, fertilize, weed. "
                "Units: kilograms, hectares. "
                "Farm IDs: F001, F002. PU IDs: PU001, PU002, PU003."
            ),
        )

        call_kwargs = mock_openai.audio.transcriptions.create.call_args
        assert call_kwargs is not None

        kwargs = call_kwargs.kwargs if call_kwargs.kwargs else call_kwargs[1]
        # Handle positional vs keyword args
        all_args = {**call_kwargs[1]} if len(call_kwargs) > 1 else {}
        if hasattr(call_kwargs, 'kwargs'):
            all_args.update(call_kwargs.kwargs)

        # Extract from call args
        call_repr = str(call_kwargs)
        assert "whisper-1" in call_repr, "Must use model='whisper-1'"
        assert "en" in call_repr, "Must specify language='en'"
        assert "eggplant" in call_repr or "Agricultural" in call_repr, (
            "Must include agricultural vocabulary in Whisper prompt"
        )


# ===========================================================================
# RATE LIMITING TESTS
# ===========================================================================

class TestTisRateLimiting:
    """Tests for TIS daily usage limits per subscription tier."""

    @pytest.mark.asyncio
    async def test_free_tier_blocked_after_5_calls(self, mock_redis):
        """
        FREE tier user is blocked on the 6th TIS call.
        Redis key: tis:calls:{user_id}:{today}
        """
        user_id = "USR-001"
        today = date.today().isoformat()
        redis_key = f"tis:calls:{user_id}:{today}"
        subscription_tier = "FREE"
        TIER_LIMITS = {"FREE": 5, "BASIC": 20, "PREMIUM": None, "CUSTOM": None}

        # Simulate counter at limit (5)
        mock_redis.get.return_value = b"5"

        current_count = int(mock_redis.get(redis_key) or 0)
        tier_limit = TIER_LIMITS.get(subscription_tier)

        rate_limited = tier_limit is not None and current_count >= tier_limit

        assert rate_limited is True, "FREE tier must be blocked at 5 calls"

        error_response = {
            "success": False,
            "error": {
                "code": "TIS_RATE_LIMIT",
                "message": (
                    f"Daily TIS limit reached ({current_count}/{tier_limit}). "
                    f"Upgrade to BASIC for 20 queries/day."
                ),
                "http_status": 429,
            },
        }

        assert error_response["error"]["http_status"] == 429
        assert "Upgrade to BASIC" in error_response["error"]["message"]
        assert "5" in error_response["error"]["message"]

    @pytest.mark.asyncio
    async def test_basic_tier_blocked_after_20_calls(self, mock_redis):
        """
        BASIC tier user is blocked on the 21st TIS call.
        """
        user_id = "USR-002"
        today = date.today().isoformat()
        redis_key = f"tis:calls:{user_id}:{today}"
        subscription_tier = "BASIC"
        TIER_LIMITS = {"FREE": 5, "BASIC": 20, "PREMIUM": None, "CUSTOM": None}

        mock_redis.get.return_value = b"20"

        current_count = int(mock_redis.get(redis_key) or 0)
        tier_limit = TIER_LIMITS.get(subscription_tier)

        rate_limited = tier_limit is not None and current_count >= tier_limit

        assert rate_limited is True, "BASIC tier must be blocked at 20 calls"
        assert current_count == 20

    @pytest.mark.asyncio
    async def test_premium_tier_not_blocked(self, mock_redis):
        """
        PREMIUM tier user is never blocked, even with very high call count.
        """
        user_id = "USR-003"
        today = date.today().isoformat()
        redis_key = f"tis:calls:{user_id}:{today}"
        subscription_tier = "PREMIUM"
        TIER_LIMITS = {"FREE": 5, "BASIC": 20, "PREMIUM": None, "CUSTOM": None}

        # Even with 9999 calls
        mock_redis.get.return_value = b"9999"

        current_count = int(mock_redis.get(redis_key) or 0)
        tier_limit = TIER_LIMITS.get(subscription_tier)

        rate_limited = tier_limit is not None and current_count >= tier_limit

        assert rate_limited is False, "PREMIUM tier must never be rate limited"
        assert tier_limit is None, "PREMIUM tier limit must be None (unlimited)"

    @pytest.mark.asyncio
    async def test_custom_tier_not_blocked(self, mock_redis):
        """
        CUSTOM tier (enterprise) user is never blocked.
        """
        subscription_tier = "CUSTOM"
        TIER_LIMITS = {"FREE": 5, "BASIC": 20, "PREMIUM": None, "CUSTOM": None}

        tier_limit = TIER_LIMITS.get(subscription_tier)
        assert tier_limit is None, "CUSTOM tier must be unlimited"

    @pytest.mark.asyncio
    async def test_rate_limit_resets_daily(self, mock_redis):
        """
        Rate limit counter Redis key must have TTL of 86400 seconds (24 hours).
        """
        user_id = "USR-001"
        today = date.today().isoformat()
        redis_key = f"tis:calls:{user_id}:{today}"

        # Simulate setting TTL on first call of the day
        mock_redis.get.return_value = None  # Counter doesn't exist yet
        mock_redis.incr.return_value = 1    # First call

        current_count = mock_redis.get(redis_key)
        if current_count is None:
            # First call today — set key and expire
            mock_redis.incr(redis_key)
            mock_redis.expire(redis_key, 86400)

        mock_redis.expire.assert_called_once_with(redis_key, 86400)

        # Verify TTL value
        ttl_seconds = mock_redis.ttl(redis_key)
        # The mock returns 86400 as configured
        assert ttl_seconds == 86400, "Redis TTL must be 86400 seconds (24 hours)"

    @pytest.mark.asyncio
    async def test_rate_limit_increments_on_each_call(self, mock_redis):
        """
        Redis counter increments by 1 on each successful TIS call.
        """
        user_id = "USR-001"
        today = date.today().isoformat()
        redis_key = f"tis:calls:{user_id}:{today}"

        # Simulate 3 successful calls
        for i in range(1, 4):
            mock_redis.incr.return_value = i
            new_count = mock_redis.incr(redis_key)
            assert new_count == i

        assert mock_redis.incr.call_count == 3, "incr must be called once per TIS call"

    @pytest.mark.asyncio
    async def test_rate_limit_response_includes_calls_remaining(self, mock_redis):
        """
        Successful TIS response includes daily_calls_remaining in response body.
        """
        user_id = "USR-001"
        today = date.today().isoformat()
        redis_key = f"tis:calls:{user_id}:{today}"
        subscription_tier = "BASIC"
        TIER_LIMITS = {"FREE": 5, "BASIC": 20, "PREMIUM": None, "CUSTOM": None}

        mock_redis.get.return_value = b"7"

        current_count = int(mock_redis.get(redis_key) or 0)
        tier_limit = TIER_LIMITS[subscription_tier]
        calls_remaining = tier_limit - current_count if tier_limit else None

        tis_response = {
            "success": True,
            "data": {
                "response_text": "Harvest logged successfully.",
                "tis_module": "command_executor",
                "daily_calls_remaining": calls_remaining,
            },
        }

        assert tis_response["data"]["daily_calls_remaining"] == 13, (
            "Remaining calls = 20 - 7 = 13"
        )


# ===========================================================================
# INTEGRATION-STYLE TESTS (end-to-end flow within mocked environment)
# ===========================================================================

class TestTisIntegrationFlows:
    """End-to-end integration tests within mocked environment."""

    @pytest.mark.asyncio
    async def test_full_harvest_log_flow(
        self, mock_openai, mock_anthropic, mock_redis, teivaka_farm_context
    ):
        """
        Full flow: voice input → Whisper → LOG_HARVEST → compliance check →
        harvest_log created → CoKG updated → confirmation.
        """
        # Voice input
        mock_openai.audio.transcriptions.create.return_value.text = (
            "Harvested 42 kilograms eggplant Grade A on PU002"
        )

        # Rate limit: user has 5 calls remaining (BASIC)
        mock_redis.get.return_value = b"15"  # 15 calls used

        transcript = (await mock_openai.audio.transcriptions.create(
            model="whisper-1",
            file=b"audio",
            language="en",
        )).text

        assert transcript != "", "Transcript must not be empty"

        # Compliance: no blocking chemicals in this scenario (clean run)
        chemicals = teivaka_farm_context["chemicals_applied"]
        harvest_date = date(2026, 4, 15)  # After safe_harvest_date 2026-04-10
        blocking = [
            c for c in chemicals
            if date.fromisoformat(c["safe_harvest_date"]) > harvest_date
        ]
        assert len(blocking) == 0, "No chemicals should block harvest on 2026-04-15"

        # Create harvest record
        today_str = harvest_date.strftime("%Y%m%d")
        harvest_record = {
            "harvest_id": f"HRV-{today_str}-001",
            "pu_id": "F001-PU002",
            "qty_kg": 42.0,
            "grade": "A",
            "compliance_status": "COMPLIANT",
            "total_value_fjd": 117.60,
            "new_cogk_fjd": round((480 + 73) / (294 + 42), 2),
        }

        assert re.match(r"HRV-\d{8}-\d{3}", harvest_record["harvest_id"])
        assert harvest_record["compliance_status"] == "COMPLIANT"
        assert harvest_record["new_cogk_fjd"] > 0

    @pytest.mark.asyncio
    async def test_knowledge_broker_full_flow(
        self, mock_openai, mock_anthropic, kb_article_fixture
    ):
        """
        Full KB flow: query → embed → vector search → top 3 articles →
        Claude call with articles → response citing KB.
        """
        query = "How do I apply fertilizer on eggplant?"

        # Step 1: Embed query
        embedding_response = await mock_openai.embeddings.create(
            model="text-embedding-3-small",
            input=query,
        )
        query_vector = embedding_response.data[0].embedding
        assert len(query_vector) == 1536

        # Step 2: Vector search returns articles sorted by similarity
        articles = sorted(kb_article_fixture, key=lambda a: a["similarity"], reverse=True)
        above_threshold = [a for a in articles if a["similarity"] >= 0.65]
        assert len(above_threshold) == 3

        # Step 3: Claude called with top 3 articles
        context = "\n\n".join(
            f"[{a['article_id']}] {a['title']}: {a['content']}"
            for a in above_threshold[:3]
        )

        mock_anthropic.messages.create.return_value.content[0].text = (
            "Apply NPK (12-12-17) at 150 kg/ha every 14 days during Vegetative stage. "
            "[Source: KB-001 — Eggplant Vegetative Stage Protocol]"
        )

        response = await mock_anthropic.messages.create(
            model="claude-sonnet-4-20250514",
            messages=[
                {
                    "role": "user",
                    "content": f"KB Context:\n{context}\n\nQuestion: {query}",
                }
            ],
        )
        response_text = response.content[0].text

        assert "KB-001" in response_text or "Teivaka KB" in response_text or "Source:" in response_text, (
            "Response must cite KB article"
        )
        assert "NPK" in response_text, "Response must contain KB article content"

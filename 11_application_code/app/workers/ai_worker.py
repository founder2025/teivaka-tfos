"""AI worker — KB embedding generation and weekly farm insights."""
import psycopg2
import psycopg2.extras
from app.workers.celery_app import app as celery_app
from app.config import settings
import logging
import uuid
from datetime import datetime

logger = logging.getLogger(__name__)


def get_sync_db():
    db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)


def generate_embedding(text: str) -> list:
    """Generates OpenAI text-embedding-3-small vector (1536 dims)."""
    import openai
    client = openai.OpenAI(api_key=settings.openai_api_key)
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    return response.data[0].embedding


@celery_app.task(
    name="app.workers.ai_worker.embed_kb_article",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    queue="ai",
)
def embed_kb_article(self, kb_entry_id: str, tenant_id: str):
    """
    Generates and stores embedding for a KB article.
    Called when an article is published (rag_status -> VALIDATED).
    Chunks long articles into 512-token segments.
    """
    conn = get_sync_db()
    try:
        cur = conn.cursor()

        # Get article from shared KB
        cur.execute("""
            SELECT kb_entry_id, title, content FROM shared.kb_articles
            WHERE kb_entry_id = %s AND rag_status = 'VALIDATED'
        """, (kb_entry_id,))
        article = cur.fetchone()
        if not article:
            logger.warning(f"KB article {kb_entry_id} not found or not VALIDATED")
            return

        # Simple chunking: 1500-char chunks with 200-char overlap
        content = article["content"]
        chunk_size = 1500
        overlap = 200
        chunks = []
        start = 0
        while start < len(content):
            end = start + chunk_size
            chunks.append(content[start:end])
            start = end - overlap

        # Get all tenants or specific tenant
        if tenant_id == "ALL":
            cur.execute("SELECT tenant_id::TEXT FROM tenant.tenants WHERE subscription_status = 'ACTIVE'")
            tenants = [r["tenant_id"] for r in cur.fetchall()]
        else:
            tenants = [tenant_id]

        for t_id in tenants:
            cur.execute("SET LOCAL app.tenant_id = %s", (t_id,))

            # Delete existing embeddings for this article
            cur.execute("""
                DELETE FROM tenant.kb_embeddings
                WHERE kb_entry_id = %s AND tenant_id = %s
            """, (kb_entry_id, t_id))

            for idx, chunk in enumerate(chunks):
                chunk_text = f"{article['title']}\n\n{chunk}"
                try:
                    embedding = generate_embedding(chunk_text)
                except Exception as e:
                    logger.error(f"Embedding generation failed for chunk {idx}: {e}")
                    raise self.retry(exc=e)

                embedding_id = f"EMB-{uuid.uuid4().hex[:12].upper()}"
                cur.execute("""
                    INSERT INTO tenant.kb_embeddings
                        (embedding_id, tenant_id, kb_entry_id, source_type,
                         title, content_chunk, chunk_index, embedding, rag_status)
                    VALUES (%s, %s, %s, 'SHARED_KB', %s, %s, %s, %s::vector, 'VALIDATED')
                """, (embedding_id, t_id, kb_entry_id, article["title"], chunk, idx,
                      str(embedding)))

        conn.commit()
        logger.info(f"Embedded KB article {kb_entry_id}: {len(chunks)} chunks for {len(tenants)} tenants")
        return {"kb_entry_id": kb_entry_id, "chunks": len(chunks), "tenants": len(tenants)}

    except Exception as e:
        conn.rollback()
        raise self.retry(exc=e)
    finally:
        conn.close()


@celery_app.task(
    name="app.workers.ai_worker.generate_weekly_insights",
    bind=True,
    max_retries=2,
    queue="ai",
)
def generate_weekly_insights(self):
    """
    Generates weekly AI farm insights for PREMIUM/CUSTOM tenants.
    Uses Claude to summarize the week's performance and flag key issues.
    Runs Saturday 18:00 UTC (Sunday 06:00 Fiji).
    """
    import anthropic
    conn = get_sync_db()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT t.tenant_id::TEXT, f.farm_id, f.farm_name
            FROM tenant.tenants t
            JOIN tenant.farms f ON f.tenant_id = t.tenant_id
            WHERE t.subscription_tier IN ('PREMIUM','CUSTOM')
              AND t.subscription_status = 'ACTIVE'
              AND f.is_active = true
        """)
        farms = cur.fetchall()

        for farm in farms:
            tenant_id = farm["tenant_id"]
            farm_id = farm["farm_id"]
            cur.execute("SET LOCAL app.tenant_id = %s", (tenant_id,))

            # Gather week summary data
            cur.execute("""
                SELECT
                    COUNT(DISTINCT hl.harvest_id) AS harvests_this_week,
                    COALESCE(SUM(hl.marketable_yield_kg), 0) AS total_yield_kg,
                    COALESCE(SUM(il.net_amount_fjd), 0) AS total_income_fjd,
                    COUNT(DISTINCT la.attendance_id) AS labor_days,
                    COUNT(DISTINCT a.alert_id) FILTER (WHERE a.severity IN ('CRITICAL','HIGH')) AS critical_alerts
                FROM tenant.farms f
                LEFT JOIN tenant.harvest_log hl ON hl.farm_id = f.farm_id
                    AND hl.harvest_date >= NOW() - INTERVAL '7 days'
                LEFT JOIN tenant.income_log il ON il.farm_id = f.farm_id
                    AND il.transaction_date >= NOW() - INTERVAL '7 days'
                LEFT JOIN tenant.labor_attendance la ON la.farm_id = f.farm_id
                    AND la.work_date >= NOW() - INTERVAL '7 days'
                LEFT JOIN tenant.alerts a ON a.farm_id = f.farm_id
                    AND a.triggered_at >= NOW() - INTERVAL '7 days'
                WHERE f.farm_id = %s
            """, (farm_id,))
            week_data = cur.fetchone()

            prompt = f"""
Weekly farm summary for {farm['farm_name']} (farm {farm_id}):
- Harvests this week: {week_data['harvests_this_week']}
- Total yield: {week_data['total_yield_kg']:.1f} kg
- Income: FJD {week_data['total_income_fjd']:.2f}
- Labor days: {week_data['labor_days']}
- Critical/High alerts: {week_data['critical_alerts']}

Provide a 3-sentence farm performance summary and 2 actionable recommendations for next week.
Keep it practical, specific to Fiji farming conditions. Be direct.
"""
            response = client.messages.create(
                model=settings.anthropic_model,
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}],
            )
            insight_text = response.content[0].text

            # Store as a community post / KB note
            logger.info(f"[AI INSIGHTS] {farm_id}: {insight_text[:100]}...")

        logger.info(f"[AI INSIGHTS] Generated insights for {len(farms)} farms")
        return {"farms_processed": len(farms)}

    except Exception as e:
        raise self.retry(exc=e)
    finally:
        conn.close()

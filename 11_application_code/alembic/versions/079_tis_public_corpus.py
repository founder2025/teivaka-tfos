"""tis_public_corpus + ops.tis_public_telemetry

Revision ID: 079_tis_public_corpus
Revises: 078_c1c_naming_backfill
Create Date: 2026-05-21

Creates two tables for the TIS-Public RAG harness:
  - shared.tis_public_corpus  — RAG content chunks + embeddings (read-mostly,
                                seeded via indexer, public/global, no tenant_id)
  - ops.tis_public_telemetry  — every Q&A turn logged for analysis (runtime-write,
                                operational, not tenant-scoped)

Telemetry lives in ops.* (not shared.*) to comply with MBI Inviolable #7
which restricts runtime writes on shared.* to two named tables only.

Embedding column: vector(1536) for OpenAI text-embedding-3-small.

Note on vector indexing:
  At v1 corpus size (~30-80 chunks) we deliberately use EXACT vector search
  (no ivfflat / hnsw index). A sequential scan over a corpus this small is
  sub-millisecond and gives guaranteed nearest-neighbour accuracy, which is
  required for the zero-hallucination retrieval gate.

  Add an ivfflat or hnsw index ONLY when corpus row count exceeds ~2000.
  At that point ivfflat lists ~= sqrt(rows) and the index must be built
  AFTER seeding (or REINDEX'd post-seed) to populate centroids correctly.
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision = '079_tis_public_corpus'
down_revision = '078_c1c_naming_backfill'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # shared.tis_public_corpus — RAG corpus with embeddings
    # Public, global, read-mostly. No tenant_id. No RLS.
    # No vector index at v1 scale; see module docstring.
    # ------------------------------------------------------------------
    op.create_table(
        'tis_public_corpus',
        sa.Column('chunk_id', sa.String(64), primary_key=True),
        sa.Column('source_file', sa.String(128), nullable=False),
        sa.Column('section', sa.String(256), nullable=True),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('embedding', Vector(1536), nullable=False),
        sa.Column('corpus_version', sa.String(32), nullable=False, server_default='v1'),
        sa.Column('token_count', sa.Integer, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.text('now()')),
        schema='shared',
    )

    op.create_index(
        'ix_tis_public_corpus_source_file',
        'tis_public_corpus',
        ['source_file'],
        schema='shared',
    )
    op.create_index(
        'ix_tis_public_corpus_corpus_version',
        'tis_public_corpus',
        ['corpus_version'],
        schema='shared',
    )

    # ------------------------------------------------------------------
    # ops.tis_public_telemetry — every Q&A turn logged
    # Runtime-write. Operational. Not tenant-scoped.
    # Lives in ops.* per MBI Inviolable #7.
    # ------------------------------------------------------------------
    op.create_table(
        'tis_public_telemetry',
        sa.Column('turn_id', sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column('session_id', sa.String(64), nullable=False),
        sa.Column('question', sa.Text, nullable=False),
        sa.Column('answer_text', sa.Text, nullable=True),
        sa.Column('refusal_category', sa.String(48), nullable=True),
        sa.Column('cited_chunk_ids', sa.ARRAY(sa.String(64)), nullable=True),
        sa.Column('confidence_score', sa.Numeric(5, 4), nullable=True),
        sa.Column('handoff_to_whatsapp', sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column('corpus_version', sa.String(32), nullable=True),
        sa.Column('latency_ms', sa.Integer, nullable=True),
        sa.Column('client_ip_hash', sa.String(64), nullable=True),
        sa.Column('user_agent_hash', sa.String(64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.text('now()')),
        schema='ops',
    )

    op.create_index(
        'ix_tis_public_telemetry_session_id',
        'tis_public_telemetry',
        ['session_id'],
        schema='ops',
    )
    op.create_index(
        'ix_tis_public_telemetry_created_at',
        'tis_public_telemetry',
        ['created_at'],
        schema='ops',
    )
    op.create_index(
        'ix_tis_public_telemetry_refusal_category',
        'tis_public_telemetry',
        ['refusal_category'],
        schema='ops',
        postgresql_where=sa.text('refusal_category IS NOT NULL'),
    )


def downgrade() -> None:
    # Telemetry first
    op.drop_index('ix_tis_public_telemetry_refusal_category',
                  table_name='tis_public_telemetry', schema='ops')
    op.drop_index('ix_tis_public_telemetry_created_at',
                  table_name='tis_public_telemetry', schema='ops')
    op.drop_index('ix_tis_public_telemetry_session_id',
                  table_name='tis_public_telemetry', schema='ops')
    op.drop_table('tis_public_telemetry', schema='ops')

    # Corpus
    op.drop_index('ix_tis_public_corpus_corpus_version',
                  table_name='tis_public_corpus', schema='shared')
    op.drop_index('ix_tis_public_corpus_source_file',
                  table_name='tis_public_corpus', schema='shared')
    op.drop_table('tis_public_corpus', schema='shared')

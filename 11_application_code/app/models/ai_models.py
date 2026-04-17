"""SQLAlchemy ORM models for TIS/AI tables."""
from sqlalchemy import String, Integer, Boolean, Text, ForeignKey, Index
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from pgvector.sqlalchemy import Vector
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
import uuid


class TenantBase(DeclarativeBase):
    pass


class AICommand(TenantBase):
    """TimescaleDB hypertable — composite PK (command_id, command_date)."""
    __tablename__ = "ai_commands"
    __table_args__ = (
        Index("idx_ai_commands_user", "user_id", "command_date"),
        Index("idx_ai_commands_type", "command_type", "command_date"),
        {"schema": "tenant"},
    )

    command_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    command_date: Mapped[datetime] = mapped_column(primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    farm_id: Mapped[Optional[str]] = mapped_column(String(20))
    command_type: Mapped[Optional[str]] = mapped_column(String(50))
    raw_input: Mapped[str] = mapped_column(Text, nullable=False)
    parsed_intent: Mapped[Optional[dict]] = mapped_column(JSONB)
    execution_status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING")
    result_summary: Mapped[Optional[str]] = mapped_column(Text)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    tis_module: Mapped[str] = mapped_column(String(30), nullable=False)
    tokens_used: Mapped[Optional[int]] = mapped_column(Integer)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<AICommand {self.command_id} [{self.tis_module}]>"


class TISConversation(TenantBase):
    __tablename__ = "tis_conversations"
    __table_args__ = (
        Index("idx_tis_conv_user", "user_id", "started_at"),
        {"schema": "tenant"},
    )

    conversation_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    farm_id: Mapped[Optional[str]] = mapped_column(String(20))
    started_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    last_message_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tis_module: Mapped[str] = mapped_column(String(30), nullable=False)
    conversation_history: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    total_tokens_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<TISConversation {self.conversation_id} [{self.tis_module}]>"


class TISVoiceLog(TenantBase):
    """TimescaleDB hypertable — composite PK (voice_log_id, log_date)."""
    __tablename__ = "tis_voice_logs"
    __table_args__ = {"schema": "tenant"}

    voice_log_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    log_date: Mapped[datetime] = mapped_column(primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    audio_duration_sec: Mapped[Optional[Decimal]] = mapped_column()
    audio_size_bytes: Mapped[Optional[int]] = mapped_column(Integer)
    whisper_transcript: Mapped[Optional[str]] = mapped_column(Text)
    whisper_latency_ms: Mapped[Optional[int]] = mapped_column(Integer)
    tis_latency_ms: Mapped[Optional[int]] = mapped_column(Integer)
    total_latency_ms: Mapped[Optional[int]] = mapped_column(Integer)
    detected_language: Mapped[str] = mapped_column(String(10), default="en")
    tis_module: Mapped[Optional[str]] = mapped_column(String(30))
    command_id: Mapped[Optional[str]] = mapped_column(String(50))
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    error_type: Mapped[Optional[str]] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<TISVoiceLog {self.voice_log_id} success={self.success}>"


class KBEmbedding(TenantBase):
    """Tenant-scoped KB chunks with pgvector embeddings."""
    __tablename__ = "kb_embeddings"
    __table_args__ = (
        Index("idx_kb_embeddings_status", "tenant_id", "rag_status"),
        {"schema": "tenant"},
    )

    embedding_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    kb_entry_id: Mapped[Optional[str]] = mapped_column(String(30))
    source_type: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content_chunk: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    embedding: Mapped[Optional[List[float]]] = mapped_column(Vector(1536))
    rag_status: Mapped[str] = mapped_column(String(20), nullable=False, default="VALIDATED")
    validated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    validated_at: Mapped[Optional[datetime]] = mapped_column()
    language: Mapped[str] = mapped_column(String(5), nullable=False, default="en")
    tags: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String))
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<KBEmbedding {self.embedding_id} [{self.rag_status}]>"

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import computed_field
from typing import Optional
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    # ── App ───────────────────────────────────────────────────────────────────
    app_name: str = "Teivaka Agri-TOS"
    app_version: str = "1.0.0"
    environment: str = "development"
    debug: bool = False
    secret_key: str = "change-me-in-production-use-32-chars-min"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1440   # 24 hours — field workers may be offline
    jwt_refresh_token_expire_days: int = 30

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://teivaka:password@localhost:5432/teivaka_db"
    database_pool_size: int = 10
    database_max_overflow: int = 20
    database_echo: bool = False

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"
    redis_cache_ttl_seconds: int = 300
    redis_rate_limit_window_seconds: int = 86400  # 24 hours for daily TIS limits

    # ── Supabase ──────────────────────────────────────────────────────────────
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = "your-supabase-jwt-secret"

    # ── Anthropic / Claude ────────────────────────────────────────────────────
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"
    anthropic_max_tokens: int = 2048
    anthropic_temperature: float = 0.3

    # ── OpenAI / Whisper ──────────────────────────────────────────────────────
    openai_api_key: str = ""
    whisper_model: str = "whisper-1"
    whisper_language: str = "en"

    # ── WhatsApp (Meta Cloud API — no Twilio) ─────────────────────────────────
    # Get these from: developers.facebook.com → your app → WhatsApp → API Setup
    meta_whatsapp_token: str = ""           # Permanent access token
    meta_phone_number_id: str = ""          # Phone Number ID (not the number itself)
    meta_whatsapp_verify_token: str = "teivaka-webhook-verify"  # For webhook setup
    # Your local Fiji number registered on WhatsApp Business
    # e.g. "+6799XXXXXXX" (Vodafone FJ) or "+6798XXXXXXX" (Digicel FJ)
    whatsapp_business_number: str = ""

    # ── Stripe ────────────────────────────────────────────────────────────────
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_id_basic: str = ""
    stripe_price_id_premium: str = ""
    stripe_price_id_custom: str = ""

    # ── Farm-specific business logic ──────────────────────────────────────────
    kava_inactivity_alert_days: int = 180
    default_inactivity_alert_days: int = 7
    f002_ferry_buffer_days: int = 14
    f002_ferry_supplier_id: str = "SUP-012"
    harvest_reconciliation_threshold_pct: float = 10.0
    max_cycles_per_zone: int = 3
    default_timezone: str = "Pacific/Fiji"

    # ── TIS (Teivaka Intelligence System) rate limits ─────────────────────────
    tis_daily_limit_free: int = 5
    tis_daily_limit_basic: int = 20
    tis_daily_limit_premium: int = 999999
    tis_rag_confidence_threshold: float = 0.65
    tis_voice_target_latency_ms: int = 5000
    tis_max_context_messages: int = 20
    tis_session_ttl_seconds: int = 1800  # 30 minutes

    # ── Knowledge Base / RAG ──────────────────────────────────────────────────
    kb_embedding_model: str = "text-embedding-3-small"
    kb_similarity_threshold: float = 0.70
    kb_max_results: int = 5

    # ── Vonage (SMS OTP verification) ─────────────────────────────────────────
    vonage_api_key: str = ""
    vonage_api_secret: str = ""
    vonage_brand_name: str = "Teivaka"
    phone_otp_expire_minutes: int = 5
    phone_otp_max_attempts: int = 3

    # ── SMTP / Transactional email ────────────────────────────────────────────
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@teivaka.com"
    frontend_url: str = "http://168.144.36.120"

    # ── Sentry ────────────────────────────────────────────────────────────────
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = 0.1

    # ── CORS ──────────────────────────────────────────────────────────────────
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:8080",
        "https://app.teivaka.com",
        "https://teivaka.com",
        "https://www.teivaka.com",
    ]

    # ── File storage / exports ────────────────────────────────────────────────
    export_tmp_dir: str = "/tmp/teivaka_exports"
    export_max_rows: int = 100000

    # ── Pagination defaults ───────────────────────────────────────────────────
    default_page_size: int = 50
    max_page_size: int = 500

    # ── Decision Engine ───────────────────────────────────────────────────────
    decision_signal_mv_refresh_interval_minutes: int = 15
    alert_auto_resolve_days: int = 30

    # ── Computed fields ───────────────────────────────────────────────────────

    @computed_field
    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @computed_field
    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @computed_field
    @property
    def async_database_url(self) -> str:
        """Ensure asyncpg driver is used."""
        url = self.database_url
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        return url

    # ── Tier helpers ──────────────────────────────────────────────────────────

    def get_tis_limit(self, tier: str) -> int:
        """Returns the daily TIS call limit for a given subscription tier."""
        limits = {
            "FREE": self.tis_daily_limit_free,
            "BASIC": self.tis_daily_limit_basic,
            "PREMIUM": self.tis_daily_limit_premium,
            "CUSTOM": self.tis_daily_limit_premium,
        }
        return limits.get(tier.upper(), self.tis_daily_limit_free)

    TIER_ORDER: dict = {"FREE": 0, "BASIC": 1, "PREMIUM": 2, "CUSTOM": 3}

    def tier_meets_minimum(self, user_tier: str, required_tier: str) -> bool:
        """Returns True if user_tier is >= required_tier."""
        return self.TIER_ORDER.get(user_tier, 0) >= self.TIER_ORDER.get(required_tier, 0)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

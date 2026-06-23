"""164 - User location sharing consent (opt-out) for the networking map

Slice 2 of the location/distance build. Adds the per-user consent flag that
governs whether a member's location may be shown to OTHER members on the
networking map (Slice 3).

- share_location BOOLEAN NOT NULL DEFAULT true — opt-out posture: participating
  members share by default, one toggle to hide (Operator-ratified 2026-06-23).
- location_share_ack_at TIMESTAMPTZ — stamped the first time the member makes an
  explicit choice. Slice 3 visibility requires BOTH share_location=true AND
  ack_at IS NOT NULL (AND verified), so NO existing user's pin can become visible
  until they have seen the notice and confirmed — default-true alone never
  exposes anyone silently.

Privacy posture (Operator decisions 2026-06-23): visible to VERIFIED members only;
exact distance with a fuzzed pin. Those are enforced in Slice 3 — this migration
only lays the consent rail.
"""
from alembic import op

revision = "164_user_location_sharing"
down_revision = "163_customer_geo"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS share_location BOOLEAN NOT NULL DEFAULT true")
    op.execute("ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS location_share_ack_at TIMESTAMPTZ")


def downgrade():
    op.execute("ALTER TABLE tenant.users DROP COLUMN IF EXISTS location_share_ack_at")
    op.execute("ALTER TABLE tenant.users DROP COLUMN IF EXISTS share_location")

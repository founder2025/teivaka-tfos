"""165 - User-level location coords for non-farm members on the network map

Slice (b) of the location build. A member's networking pin previously resolved
only via their farm (tenant.farms.gps_lat/gps_lng), so non-farm accounts (BUYER,
SERVICE_PROVIDER, BANKER, …) — who have no farm — could never appear. Adds a
per-user location so they can be plotted too.

tenant.users.gps_lat / gps_lng (nullable, NUMERIC(9,6) ≈ 0.1 m, matching the
farms convention). Captured when a member opts in to sharing (device geolocation
via PATCH /me). Farmers still pin at their farm; the network endpoint prefers
farm coords and falls back to these for non-farm members.
"""
from alembic import op

revision = "165_user_geo"
down_revision = "164_user_location_sharing"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS gps_lat NUMERIC(9,6)")
    op.execute("ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS gps_lng NUMERIC(9,6)")


def downgrade():
    op.execute("ALTER TABLE tenant.users DROP COLUMN IF EXISTS gps_lng")
    op.execute("ALTER TABLE tenant.users DROP COLUMN IF EXISTS gps_lat")

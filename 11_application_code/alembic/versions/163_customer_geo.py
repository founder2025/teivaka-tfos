"""163 - Buyer geo coordinates for real (computed) distance

Slice 1 of the location/distance build. The buyer card showed a hand-typed
`distance_km` — a static guess, never a measured figure, and identical no matter
who looked. To compute a REAL distance (haversine from the viewing farm's
gps_lat/gps_lng to the buyer), the buyer needs coordinates of its own.

Adds tenant.customers.gps_lat / gps_lng (nullable — a buyer may not be pinned
yet; the card stays honest-empty / falls back to the manual distance_km when
either end has no coords). NUMERIC(9,6) ≈ 0.1 m precision, matching the farms
gps_lat/gps_lng convention.
"""
from alembic import op

revision = "163_customer_geo"
down_revision = "162_capture_audit_events"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE tenant.customers ADD COLUMN IF NOT EXISTS gps_lat NUMERIC(9,6)")
    op.execute("ALTER TABLE tenant.customers ADD COLUMN IF NOT EXISTS gps_lng NUMERIC(9,6)")


def downgrade():
    op.execute("ALTER TABLE tenant.customers DROP COLUMN IF EXISTS gps_lng")
    op.execute("ALTER TABLE tenant.customers DROP COLUMN IF EXISTS gps_lat")

"""167 - geo indexes for the member network map (scale foundation)

The /farm-map/network query now does distance + ORDER BY + LIMIT in SQL with an
index-backed bounding box for radius. These composite btree indexes back the bbox
range scans so "members within N km" stays fast as membership grows to the tens/
hundreds of thousands without PostGIS.

  ix_farms_gps  ON tenant.farms (gps_lat, gps_lng)
  ix_users_gps  ON tenant.users (gps_lat, gps_lng)

Note: at very large table sizes, recreate these CONCURRENTLY (outside a txn) to
avoid a write lock — see the runbook. Apply as owner (Strike #123). PostGIS GiST +
KNN remains the eventual step for true global nearest-N + map clustering.
"""
from alembic import op

revision = "167_geo_indexes"
down_revision = "166_farms_rls_permissive"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE INDEX IF NOT EXISTS ix_farms_gps ON tenant.farms (gps_lat, gps_lng)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_gps ON tenant.users (gps_lat, gps_lng)")


def downgrade():
    op.execute("DROP INDEX IF EXISTS tenant.ix_users_gps")
    op.execute("DROP INDEX IF EXISTS tenant.ix_farms_gps")

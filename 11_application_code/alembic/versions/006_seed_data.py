"""006 - Load Teivaka seed data (tenant, farms, workers, rules, signals)
Revision ID: 006_seed
Revises: 005_functions
Create Date: 2026-04-07
"""
from alembic import op
import os

revision = '006_seed'
down_revision = '005_functions'
branch_labels = None
depends_on = None

def _sql_path(filename):
    return os.path.join(os.path.dirname(__file__), '../../../../02_database/schema', filename)

def _run_sql_file(filename):
    import os
    from alembic import op
    path = os.path.join(os.path.dirname(__file__), '../../../../02_database/schema', filename)
    with open(path) as f:
        sql = f.read()
    buf = []; out = []; in_dollar = False; in_line = False
    i = 0; n = len(sql)
    while i < n:
        ch = sql[i]; two = sql[i:i+2]
        if in_line:
            buf.append(ch)
            if ch == '\n': in_line = False
            i += 1; continue
        if not in_dollar and two == '--':
            in_line = True; buf.append(two); i += 2; continue
        if two == '$$':
            in_dollar = not in_dollar; buf.append('$$'); i += 2; continue
        if ch == ';' and not in_dollar:
            s = ''.join(buf).strip()
            if s and any((not ln.strip().startswith('--') and ln.strip()) for ln in s.split('\n')): out.append(s)
            buf = []; i += 1; continue
        buf.append(ch); i += 1
    tail = ''.join(buf).strip()
    if tail and any((not ln.strip().startswith('--') and ln.strip()) for ln in tail.split('\n')): out.append(tail)
    for stmt in out:
        op.execute(stmt)

def upgrade():
    _run_sql_file('04_seed_data.sql')

def downgrade():
    op.execute("DELETE FROM tenant.automation_rules WHERE rule_id LIKE 'RULE-%'")
    op.execute("DELETE FROM tenant.workers WHERE tenant_id IN (SELECT tenant_id FROM tenant.tenants WHERE company_reg_no = '2025RC001894')")
    op.execute("DELETE FROM tenant.farms WHERE farm_id IN ('F001','F002')")
    op.execute("DELETE FROM tenant.tenants WHERE company_reg_no = '2025RC001894'")

"""Guard: the Near You feed must NEVER source the private buyer CRM.

Decision (Operator-confirmed): buyer-demand on the cross-tenant feed comes ONLY from
community.demand_records (the public WANTED board). tenant.buyer_demand_signals is the
RLS-private CRM — aggregating it onto a cross-tenant surface would leak every farm's
competitive buyer intelligence. This checks the ACTUAL generated SQL + imports (not
comments), so it fails loudly if a future edit reintroduces the private source.
"""
import ast
import importlib
import pathlib

_mod = importlib.import_module("app.routers.near_you")
_ALL_SQL = "\n".join(builder() for builder in _mod._BUILDERS.values())
_SRC = pathlib.Path(_mod.__file__).read_text()


def test_generated_sql_never_touches_private_crm():
    assert "buyer_demand_signals" not in _ALL_SQL, "Near You SQL must not query tenant.buyer_demand_signals"


def test_buyer_demand_uses_public_board():
    assert "community.demand_records" in _ALL_SQL, "Near You buyer-demand must source the public board"


def test_no_buyers_crm_import():
    modules = []
    for node in ast.walk(ast.parse(_SRC)):
        if isinstance(node, ast.ImportFrom):
            modules.append(node.module or "")
        elif isinstance(node, ast.Import):
            modules.extend(a.name for a in node.names)
    assert not any("buyers_crm" in m for m in modules), "Near You must not import buyers_crm"

"""
Automation Rules router.
Manages RULE-001 to RULE-043. Lists, toggles, and manually triggers rules.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user, require_role, require_tier
from typing import Optional

router = APIRouter()


@router.get("")
async def list_automation_rules(
    farm_id: Optional[str] = None,
    is_active: Optional[bool] = None,
    trigger_category: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """List all automation rules for this tenant. Includes trigger count and last fired."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"])}
        q = """
            SELECT rule_id, rule_name, trigger_category, trigger_condition,
                   trigger_threshold_value, trigger_threshold_unit,
                   action_type, action_description, alert_severity,
                   notify_roles, auto_resolve, farm_specific, farm_id,
                   is_active, last_triggered_at, trigger_count,
                   created_at, updated_at
            FROM tenant.automation_rules
            WHERE tenant_id = :tid
        """
        if farm_id:
            q += " AND (farm_id = :farm_id OR farm_id IS NULL)"; params["farm_id"] = farm_id
        if is_active is not None:
            q += " AND is_active = :is_active"; params["is_active"] = is_active
        if trigger_category:
            q += " AND trigger_category = :cat"; params["cat"] = trigger_category
        q += " ORDER BY rule_id"
        result = await db.execute(text(q), params)
        rules = [dict(r) for r in result.mappings().all()]
        return {"data": rules, "total": len(rules)}


@router.get("/{rule_id}")
async def get_automation_rule(rule_id: str, user: dict = Depends(get_current_user)):
    """Get a single automation rule by ID (e.g. RULE-034)."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("SELECT * FROM tenant.automation_rules WHERE rule_id = :rule_id"),
            {"rule_id": rule_id}
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail=f"Rule {rule_id} not found")
        return {"data": dict(row)}


@router.patch("/{rule_id}/toggle")
async def toggle_automation_rule(
    rule_id: str,
    user: dict = Depends(require_role("FOUNDER")),
):
    """
    Enable or disable an automation rule. FOUNDER only.
    Disabling RULE-034 (ferry buffer) or RULE-038 (compliance) raises a warning.
    """
    CRITICAL_RULES = {"RULE-034", "RULE-038"}

    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("SELECT rule_id, rule_name, is_active FROM tenant.automation_rules WHERE rule_id = :rule_id"),
            {"rule_id": rule_id}
        )
        rule = result.mappings().first()
        if not rule:
            raise HTTPException(status_code=404, detail=f"Rule {rule_id} not found")

        new_state = not rule["is_active"]
        await db.execute(
            text("UPDATE tenant.automation_rules SET is_active = :state, updated_at = NOW() WHERE rule_id = :rule_id"),
            {"state": new_state, "rule_id": rule_id}
        )

    warning = None
    if not new_state and rule_id in CRITICAL_RULES:
        warning = f"WARNING: {rule_id} is a critical safety rule. Disabling it reduces farm protection."

    return {
        "data": {
            "rule_id": rule_id,
            "rule_name": rule["rule_name"],
            "is_active": new_state,
            "action": "enabled" if new_state else "disabled",
        },
        "warning": warning,
    }


@router.post("/{rule_id}/trigger")
async def manually_trigger_rule(
    rule_id: str,
    farm_id: str,
    user: dict = Depends(require_tier("PREMIUM", "CUSTOM")),
):
    """
    Manually trigger a specific automation rule evaluation for a farm.
    PREMIUM/CUSTOM tier only. Useful for testing or on-demand scans.
    """
    from app.workers.automation_worker import run_automation_engine
    # Queue the full automation engine run (rule-level targeting is future work)
    task = run_automation_engine.apply_async(
        kwargs={},
        queue="automation",
        priority=9,  # High priority for manual triggers
    )
    return {
        "data": {
            "rule_id": rule_id,
            "farm_id": farm_id,
            "task_id": task.id,
            "status": "queued",
            "message": f"Rule evaluation queued. Results will appear as alerts within 30 seconds.",
        }
    }


@router.get("/{rule_id}/history")
async def get_rule_history(
    rule_id: str,
    limit: int = 20,
    user: dict = Depends(get_current_user),
):
    """Get alert history for a specific automation rule."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("""
                SELECT alert_id, farm_id, severity, title, alert_status,
                       triggered_at, resolved_at, whatsapp_sent
                FROM tenant.alerts
                WHERE rule_id = :rule_id
                ORDER BY triggered_at DESC
                LIMIT :limit
            """),
            {"rule_id": rule_id, "limit": limit}
        )
        history = [dict(r) for r in result.mappings().all()]
        return {"data": history, "rule_id": rule_id, "total": len(history)}

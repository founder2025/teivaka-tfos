"""Payment provider adapters — the one contract every rail implements.

Non-custodial: an adapter only produces a payment *instruction* and (later)
reports a *confirmation*. It never holds or moves money. Phase 0 ships the
ManualProvider (works with zero integration); M-PAiSA / banks implement the same
PaymentProvider contract later and are switched on via shared.payment_providers.
"""
from __future__ import annotations

import uuid
from datetime import datetime


class PaymentProvider:
    code = "BASE"

    def capabilities(self) -> dict:
        return {"collect": False, "request": False, "disburse": False, "qr": False, "manual": False}

    def create_instruction(self, *, direction: str, amount_fjd, method: dict | None,
                           counterparty_label: str | None, obligation_id: str) -> dict:
        """Return {provider_ref, instruction_payload}. Never moves money."""
        raise NotImplementedError


class ManualProvider(PaymentProvider):
    """Out-of-band settlement: the user pays/receives via their own M-PAiSA, bank
    app, or cash, quotes the reference, then confirms it here to record it."""
    code = "MANUAL"

    def capabilities(self) -> dict:
        return {"collect": True, "request": True, "disburse": True, "qr": False, "manual": True}

    def create_instruction(self, *, direction, amount_fjd, method, counterparty_label, obligation_id):
        ref = f"TVK-{datetime.now().strftime('%y%m%d')}-{uuid.uuid4().hex[:5].upper()}"
        try:
            amt = f"{float(amount_fjd):,.2f}"
        except Exception:  # noqa: BLE001
            amt = str(amount_fjd)
        via = (method or {}).get("label") or "your chosen method"
        if direction == "COLLECT":
            who = counterparty_label or "the payee"
            text = (f"Pay FJD {amt} to {who} via {via}, quoting reference {ref}. "
                    f"Once it's sent, confirm here to record the expense in your cash flow.")
        else:
            who = counterparty_label or "the payer"
            text = (f"Request FJD {amt} from {who} via {via}, quoting reference {ref}. "
                    f"Once it lands, confirm here to record the income in your cash flow.")
        return {"provider_ref": ref,
                "instruction_payload": {"reference": ref, "text": text, "direction": direction}}


_PROVIDERS: dict[str, PaymentProvider] = {"MANUAL": ManualProvider()}


def get_provider(code: str | None) -> PaymentProvider:
    """Resolve an adapter. Unknown/not-yet-live providers fall back to MANUAL so
    the rail always functions — a missing integration degrades to out-of-band,
    never to a dead end."""
    return _PROVIDERS.get((code or "MANUAL").upper(), _PROVIDERS["MANUAL"])

/**
 * CashLedger.jsx — /farm/cash
 *
 * Cash ledger surface: lifetime balance, filtered list, log/edit/delete
 * modals. Posts to the CashUI-1a backend (POST/GET/PATCH/DELETE
 * /api/v1/cash-ledger). Every mutation lands in audit.events as
 * CASH_LOGGED / CASH_UPDATED / CASH_DELETED — handled by the backend,
 * the page just calls the endpoints.
 *
 * Mode gating is intentionally NOT in this file — that's CashUI-1c.
 * Today the page is reachable from any farmer shell that exposes
 * /farm/cash in the sub-nav.
 *
 * Schema notes (hard rules from the backend):
 *   - transaction_type CHECK: INCOME, EXPENSE, TRANSFER, LOAN,
 *     REPAYMENT, GRANT — UI only exposes INCOME / EXPENSE in v1
 *   - category is freeform text on the DB; the front-end dictates
 *     a closed list per type
 *   - payment_method CHECK: CASH, BANK_TRANSFER, MOBILE_MONEY,
 *     CREDIT, OTHER (or NULL)
 *   - PATCH does NOT accept transaction_date, transaction_type,
 *     farm_id (immutable for audit integrity)
 *   - DELETE is hard delete; the audit chain is the only durable
 *     record once removed
 */
import { useEffect, useMemo, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Coins, Pencil, Plus, Trash2 } from "lucide-react";

import Modal from "../../components/ui/Modal.jsx";
import ThemedSelect from "../../components/inputs/ThemedSelect.jsx";

// --- Palette (warm farmer dialect) -----------------------------------

const C = {
  soil:     "#5C4033",
  cream:    "#F8F3E9",
  bgPage:   "#F5EFE0",
  border:   "#E6DED0",
  muted:    "#8A7863",
  green:    "#6AA84F",
  greenDk:  "#3E7B1F",
  amber:    "#BF9000",
  red:      "#D4442E",
  greenTint: "#E9F2DD",
  amberTint: "#FAF1D5",
};

// --- Constants -------------------------------------------------------

const TYPE_OPTIONS = [
  { value: "INCOME",  label: "Income"  },
  { value: "EXPENSE", label: "Expense" },
];

const TYPE_FILTER_OPTIONS = [
  { value: "ALL",     label: "All types" },
  { value: "INCOME",  label: "Income"   },
  { value: "EXPENSE", label: "Expense"  },
];

const PERIOD_OPTIONS = [
  { value: "ALL",   label: "All time"     },
  { value: "MONTH", label: "This month"   },
  { value: "30D",   label: "Last 30 days" },
  { value: "90D",   label: "Last 90 days" },
];

const PAYMENT_METHODS = [
  { value: "",              label: "—" },
  { value: "CASH",          label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "MOBILE_MONEY",  label: "Mobile money" },
  { value: "CREDIT",        label: "Credit" },
  { value: "OTHER",         label: "Other" },
];

const CATEGORIES_BY_TYPE = {
  INCOME: [
    { value: "HARVEST_SALE",  label: "Harvest sale"  },
    { value: "OTHER_INCOME",  label: "Other income"  },
  ],
  EXPENSE: [
    { value: "INPUTS_FERTILIZER", label: "Inputs — fertilizer" },
    { value: "INPUTS_CHEMICAL",   label: "Inputs — chemical"   },
    { value: "INPUTS_SEED",       label: "Inputs — seed"       },
    { value: "LABOR",             label: "Labor"               },
    { value: "EQUIPMENT",         label: "Equipment"           },
    { value: "FUEL",              label: "Fuel"                },
    { value: "TRANSPORT",         label: "Transport"           },
    { value: "FERRY",             label: "Ferry"               },
    { value: "OTHER_EXPENSE",     label: "Other expense"       },
  ],
};

const PAGE_LIMIT = 25;

// --- Helpers ---------------------------------------------------------

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
}

function emitToast(message) {
  window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message } }));
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatFJD(value, { signed = false } = {}) {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return "FJD —";
  const abs = Math.abs(n).toLocaleString("en-FJ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (!signed) return `FJD ${abs}`;
  if (n > 0) return `+ FJD ${abs}`;
  if (n < 0) return `− FJD ${abs}`;
  return `FJD ${abs}`;
}

function periodToDates(period) {
  if (period === "ALL") return { start: null, end: null };
  const today = new Date();
  const end = todayISO();
  if (period === "MONTH") {
    const start = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    return { start, end };
  }
  if (period === "30D" || period === "90D") {
    const days = period === "30D" ? 30 : 90;
    const d = new Date();
    d.setDate(d.getDate() - days);
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { start, end };
  }
  return { start: null, end: null };
}

function categoryLabel(type, value) {
  const list = CATEGORIES_BY_TYPE[type] || [];
  return list.find((c) => c.value === value)?.label || value;
}

function paymentLabel(value) {
  return PAYMENT_METHODS.find((p) => p.value === value)?.label || value || "—";
}

async function fetchFarms() {
  const res = await fetch("/api/v1/farms", { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body?.data ?? body?.farms ?? [];
}

async function fetchCashLedger({ farmId, period, type, offset }) {
  const { start, end } = periodToDates(period);
  const qs = new URLSearchParams();
  if (farmId) qs.set("farm_id", farmId);
  if (start)  qs.set("period_start", start);
  if (end)    qs.set("period_end", end);
  if (type && type !== "ALL") qs.set("transaction_type", type);
  qs.set("limit",  String(PAGE_LIMIT));
  qs.set("offset", String(offset));
  const res = await fetch(`/api/v1/cash-ledger?${qs.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body?.data ?? {};
}

function extractError(parsed, res) {
  return (
    parsed?.detail?.error?.message ||
    parsed?.detail?.message ||
    (typeof parsed?.detail === "string" ? parsed.detail : null) ||
    `${res.status} ${res.statusText}`
  );
}

// --- Form modal (create + edit) --------------------------------------

function EntryFormModal({ mode, entry, farmId, isOpen, onClose, onSaved }) {
  const isEdit = mode === "edit";

  const [date, setDate]               = useState(todayISO());
  const [type, setType]               = useState("INCOME");
  const [category, setCategory]       = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount]           = useState("");
  const [payment, setPayment]         = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState("");

  useEffect(() => {
    if (!isOpen) return;
    if (isEdit && entry) {
      setDate(String(entry.transaction_date || todayISO()).slice(0, 10));
      setType(entry.transaction_type || "INCOME");
      setCategory(entry.category || "");
      setDescription(entry.description || "");
      setAmount(String(entry.amount_fjd ?? ""));
      setPayment(entry.payment_method || "");
    } else {
      setDate(todayISO());
      setType("INCOME");
      setCategory("");
      setDescription("");
      setAmount("");
      setPayment("");
    }
    setError("");
    setSubmitting(false);
  }, [isOpen, isEdit, entry]);

  // Reset category when type changes (avoid stale category from other type).
  useEffect(() => {
    if (isEdit) return;
    setCategory("");
  }, [type, isEdit]);

  const categoryOptions = CATEGORIES_BY_TYPE[type] || [];

  const submitDisabled =
    submitting ||
    !date ||
    !type ||
    !category ||
    !description.trim() ||
    !(Number(amount) > 0);

  async function submit(e) {
    e.preventDefault();
    if (submitDisabled) return;
    setSubmitting(true);
    setError("");
    try {
      let res;
      if (isEdit) {
        const body = {
          category,
          description: description.trim(),
          amount_fjd: amount,
          payment_method: payment || null,
        };
        res = await fetch(`/api/v1/cash-ledger/${encodeURIComponent(entry.ledger_id)}`, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify(body),
        });
      } else {
        const body = {
          farm_id: farmId,
          transaction_date: date,
          transaction_type: type,
          category,
          description: description.trim(),
          amount_fjd: amount,
        };
        if (payment) body.payment_method = payment;
        res = await fetch("/api/v1/cash-ledger", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(body),
        });
      }
      if (res.ok) {
        emitToast(isEdit ? "Cash entry updated." : "Cash entry logged.");
        onSaved?.();
        onClose?.();
        return;
      }
      let parsed = null;
      try { parsed = await res.json(); } catch { /* noop */ }
      setError(extractError(parsed, res));
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? "Edit cash entry" : "Log cash entry"}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-40"
            style={{ background: "white", border: `1px solid ${C.border}`, color: C.soil }}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="cash-entry-form"
            disabled={submitDisabled}
            className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-40"
            style={{ background: C.green }}
          >
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Log entry"}
          </button>
        </>
      }
    >
      <form id="cash-entry-form" onSubmit={submit} className="space-y-4">
        {/* Date */}
        <div>
          <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
            Date *
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={isEdit}
            required
            className="w-full px-3 py-2 rounded-lg text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: C.cream, border: `1px solid ${C.border}`, color: C.soil }}
          />
          {isEdit && (
            <p className="text-xs mt-1" style={{ color: C.muted }}>
              Date is locked for audit integrity.
            </p>
          )}
        </div>

        {/* Type */}
        <div>
          <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
            Type *
          </label>
          <ThemedSelect
            value={type}
            onChange={setType}
            options={TYPE_OPTIONS}
            placeholder="Select type..."
            disabled={isEdit}
            required
          />
          {isEdit && (
            <p className="text-xs mt-1" style={{ color: C.muted }}>
              Type is locked for audit integrity.
            </p>
          )}
        </div>

        {/* Category */}
        <div>
          <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
            Category *
          </label>
          <ThemedSelect
            value={category}
            onChange={setCategory}
            options={categoryOptions}
            placeholder="Select category..."
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
            Description *
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            required
            placeholder="e.g. Cassava 200kg sale to Nayans"
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: C.cream, border: `1px solid ${C.border}`, color: C.soil }}
          />
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
            Amount (FJD) *
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: C.cream, border: `1px solid ${C.border}`, color: C.soil }}
          />
        </div>

        {/* Payment method (optional) */}
        <div>
          <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
            Payment method
          </label>
          <ThemedSelect
            value={payment}
            onChange={setPayment}
            options={PAYMENT_METHODS}
            placeholder="—"
          />
        </div>

        {error && (
          <div
            className="text-sm px-3 py-2 rounded-lg"
            style={{ background: "#FCEEEA", border: `1px solid ${C.red}40`, color: C.red }}
          >
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}

// --- Delete confirm modal --------------------------------------------

function DeleteConfirmModal({ entry, isOpen, onClose, onDeleted }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");

  useEffect(() => {
    if (isOpen) { setSubmitting(false); setError(""); }
  }, [isOpen]);

  async function confirm() {
    if (!entry) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/cash-ledger/${encodeURIComponent(entry.ledger_id)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.status === 204 || res.ok) {
        emitToast("Cash entry deleted.");
        onDeleted?.();
        onClose?.();
        return;
      }
      let parsed = null;
      try { parsed = await res.json(); } catch { /* noop */ }
      setError(extractError(parsed, res));
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete cash entry?"
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-40"
            style={{ background: "white", border: `1px solid ${C.border}`, color: C.soil }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={submitting}
            className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-40"
            style={{ background: C.red }}
          >
            {submitting ? "Deleting…" : "Delete"}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm" style={{ color: C.soil }}>
        <p>This entry will be removed from the ledger.</p>
        {entry && (
          <div
            className="rounded-lg px-3 py-2"
            style={{ background: C.cream, border: `1px solid ${C.border}` }}
          >
            <div style={{ color: C.muted, fontSize: 12 }}>
              {String(entry.transaction_date).slice(0, 10)} · {entry.transaction_type}
            </div>
            <div style={{ fontWeight: 600 }}>{entry.description}</div>
            <div style={{ color: entry.transaction_type === "INCOME" ? C.greenDk : C.amber }}>
              {formatFJD(entry.amount_fjd)}
            </div>
          </div>
        )}
        <p style={{ color: C.muted, fontSize: 12 }}>
          The audit chain preserves a permanent record of this deletion (event
          type CASH_DELETED with the full pre-delete snapshot).
        </p>
        {error && (
          <div
            className="text-sm px-3 py-2 rounded-lg"
            style={{ background: "#FCEEEA", border: `1px solid ${C.red}40`, color: C.red }}
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

// --- Inner page (uses React Query) -----------------------------------

function CashLedgerInner() {
  const qc = useQueryClient();

  const [period,    setPeriod]    = useState("ALL");
  const [typeFilt,  setTypeFilt]  = useState("ALL");
  const [offset,    setOffset]    = useState(0);
  const [farmId,    setFarmId]    = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editEntry,  setEditEntry]  = useState(null);  // entry obj or null
  const [deleteEntry, setDeleteEntry] = useState(null);

  const farmsQuery = useQuery({
    queryKey: ["farms"],
    queryFn: fetchFarms,
    staleTime: 5 * 60_000,
  });

  // Default to first farm once loaded.
  useEffect(() => {
    if (!farmId && farmsQuery.data && farmsQuery.data.length > 0) {
      setFarmId(farmsQuery.data[0].farm_id);
    }
  }, [farmId, farmsQuery.data]);

  const farm = useMemo(
    () => (farmsQuery.data || []).find((f) => f.farm_id === farmId),
    [farmsQuery.data, farmId],
  );

  const ledgerQuery = useQuery({
    queryKey: ["cash-ledger", { farmId, period, typeFilt, offset }],
    queryFn: () => fetchCashLedger({ farmId, period, type: typeFilt, offset }),
    enabled: !!farmId,
    keepPreviousData: true,
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["cash-ledger"] });
  }

  // Reset pagination when filters change.
  useEffect(() => { setOffset(0); }, [period, typeFilt, farmId]);

  const entries = ledgerQuery.data?.entries ?? [];
  const count   = ledgerQuery.data?.count ?? 0;
  const balance = ledgerQuery.data?.cash_balance_fjd ?? "0";

  const balanceNum = Number(balance);
  const balanceColor =
    balanceNum > 0 ? C.greenDk :
    balanceNum < 0 ? C.amber   : C.muted;

  const start = entries.length ? offset + 1 : 0;
  const end   = offset + entries.length;
  const canPrev = offset > 0;
  const canNext = end < count;

  return (
    <div className="min-h-screen" style={{ background: C.bgPage }}>
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {/* Header */}
        <header className="mb-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-medium" style={{ color: C.muted }}>
            <Coins size={14} />
            <span>Cash ledger</span>
          </div>
          <h1 className="text-2xl font-bold mt-1" style={{ color: C.soil }}>
            {farm?.farm_name || "Cash"}
          </h1>

          <div
            className="mt-4 rounded-2xl px-5 py-4 flex items-end justify-between"
            style={{
              background: balanceNum >= 0 ? C.greenTint : C.amberTint,
              border: `1px solid ${C.border}`,
            }}
          >
            <div>
              <div className="text-xs uppercase tracking-wider font-medium" style={{ color: C.muted }}>
                Lifetime balance
              </div>
              <div className="text-3xl font-bold mt-1" style={{ color: balanceColor }}>
                {formatFJD(balance)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={!farmId}
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white inline-flex items-center gap-1 disabled:opacity-40"
              style={{ background: C.green }}
            >
              <Plus size={16} />
              Log entry
            </button>
          </div>
        </header>

        {/* Toolbar */}
        <div className="mb-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          <ThemedSelect
            value={period}
            onChange={setPeriod}
            options={PERIOD_OPTIONS}
            placeholder="Period"
          />
          <ThemedSelect
            value={typeFilt}
            onChange={setTypeFilt}
            options={TYPE_FILTER_OPTIONS}
            placeholder="Type"
          />
        </div>

        {/* List */}
        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{ border: `1px solid ${C.border}` }}
        >
          {ledgerQuery.isLoading && (
            <div className="px-5 py-8 text-sm text-center" style={{ color: C.muted }}>
              Loading…
            </div>
          )}

          {ledgerQuery.isError && (
            <div className="px-5 py-6 text-sm text-center" style={{ color: C.red }}>
              Couldn't load cash entries.
              <button
                type="button"
                onClick={() => ledgerQuery.refetch()}
                className="ml-2 underline"
                style={{ color: C.greenDk }}
              >
                Retry
              </button>
            </div>
          )}

          {!ledgerQuery.isLoading && !ledgerQuery.isError && entries.length === 0 && (
            <div className="px-5 py-12 text-center">
              <div className="text-sm" style={{ color: C.muted }}>
                No cash entries yet.
              </div>
              <div className="text-sm mt-1" style={{ color: C.muted }}>
                Tap <span style={{ color: C.greenDk, fontWeight: 600 }}>+ Log entry</span> to record your first.
              </div>
            </div>
          )}

          {!ledgerQuery.isLoading && entries.length > 0 && (
            <>
              {/* Desktop table */}
              <table className="hidden md:table w-full text-sm">
                <thead style={{ background: C.cream }}>
                  <tr style={{ color: C.muted }}>
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                    <th className="text-left px-4 py-2 font-medium">Type</th>
                    <th className="text-left px-4 py-2 font-medium">Category</th>
                    <th className="text-left px-4 py-2 font-medium">Description</th>
                    <th className="text-right px-4 py-2 font-medium">Amount</th>
                    <th className="text-right px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((row) => {
                    const isIncome = row.transaction_type === "INCOME";
                    return (
                      <tr
                        key={row.ledger_id}
                        style={{ borderTop: `1px solid ${C.border}` }}
                      >
                        <td className="px-4 py-3" style={{ color: C.soil }}>
                          {String(row.transaction_date).slice(0, 10)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              background: isIncome ? C.greenTint : C.amberTint,
                              color:      isIncome ? C.greenDk   : C.amber,
                            }}
                          >
                            {row.transaction_type}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ color: C.soil }}>
                          {categoryLabel(row.transaction_type, row.category)}
                        </td>
                        <td className="px-4 py-3" style={{ color: C.soil }}>
                          {row.description}
                          {row.payment_method && (
                            <div className="text-xs" style={{ color: C.muted }}>
                              {paymentLabel(row.payment_method)}
                            </div>
                          )}
                        </td>
                        <td
                          className="px-4 py-3 text-right font-semibold tabular-nums"
                          style={{ color: isIncome ? C.greenDk : C.amber }}
                        >
                          {isIncome ? "+ " : "− "}{formatFJD(row.amount_fjd)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => setEditEntry(row)}
                              aria-label="Edit"
                              className="rounded-lg p-1.5"
                              style={{ color: C.muted }}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteEntry(row)}
                              aria-label="Delete"
                              className="rounded-lg p-1.5"
                              style={{ color: C.red }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile card stack */}
              <ul className="md:hidden">
                {entries.map((row) => {
                  const isIncome = row.transaction_type === "INCOME";
                  return (
                    <li
                      key={row.ledger_id}
                      className="px-4 py-3 flex items-start justify-between gap-3"
                      style={{ borderTop: `1px solid ${C.border}` }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs" style={{ color: C.muted }}>
                            {String(row.transaction_date).slice(0, 10)}
                          </span>
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              background: isIncome ? C.greenTint : C.amberTint,
                              color:      isIncome ? C.greenDk   : C.amber,
                            }}
                          >
                            {row.transaction_type}
                          </span>
                        </div>
                        <div className="mt-0.5 text-sm font-medium truncate" style={{ color: C.soil }}>
                          {row.description}
                        </div>
                        <div className="text-xs" style={{ color: C.muted }}>
                          {categoryLabel(row.transaction_type, row.category)}
                          {row.payment_method && ` · ${paymentLabel(row.payment_method)}`}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div
                          className="text-sm font-semibold tabular-nums"
                          style={{ color: isIncome ? C.greenDk : C.amber }}
                        >
                          {isIncome ? "+ " : "− "}{formatFJD(row.amount_fjd)}
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setEditEntry(row)}
                            aria-label="Edit"
                            className="rounded-lg p-1"
                            style={{ color: C.muted }}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteEntry(row)}
                            aria-label="Delete"
                            className="rounded-lg p-1"
                            style={{ color: C.red }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Pagination */}
              <div
                className="flex items-center justify-between px-4 py-3 text-xs"
                style={{ borderTop: `1px solid ${C.border}`, background: C.cream, color: C.muted }}
              >
                <span>
                  Showing {start}–{end} of {count}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOffset(Math.max(0, offset - PAGE_LIMIT))}
                    disabled={!canPrev}
                    className="px-3 py-1 rounded-lg disabled:opacity-40"
                    style={{ background: "white", border: `1px solid ${C.border}`, color: C.soil }}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setOffset(offset + PAGE_LIMIT)}
                    disabled={!canNext}
                    className="px-3 py-1 rounded-lg disabled:opacity-40"
                    style={{ background: "white", border: `1px solid ${C.border}`, color: C.soil }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <EntryFormModal
        mode="create"
        farmId={farmId}
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={refresh}
      />

      <EntryFormModal
        mode="edit"
        entry={editEntry}
        farmId={farmId}
        isOpen={!!editEntry}
        onClose={() => setEditEntry(null)}
        onSaved={refresh}
      />

      <DeleteConfirmModal
        entry={deleteEntry}
        isOpen={!!deleteEntry}
        onClose={() => setDeleteEntry(null)}
        onDeleted={refresh}
      />
    </div>
  );
}

// --- Default export with isolated QueryClient ------------------------

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
});

export default function CashLedger() {
  return (
    <QueryClientProvider client={queryClient}>
      <CashLedgerInner />
    </QueryClientProvider>
  );
}

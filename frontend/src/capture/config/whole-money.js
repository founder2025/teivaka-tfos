/**
 * Universal Capture Engine — MONEY config (Whole-farm vertical).
 *
 * Money is the highest-frequency capture. Unlike crop/animal events (which post to
 * /events), money reuses the proven, already-audit-emitting POST /api/v1/cash-ledger
 * (writes tenant.cash_ledger + emits a CASH_LOGGED audit row) via the engine's submit
 * adapter. Farm-anchored. evidence:false because cash_ledger has no evidence columns
 * yet (honest — receipt-photo evidence on money is filed as a follow-up, B-item, not faked).
 *
 * COVERAGE: all 6 cash_ledger transaction types across 3 verbs + a labour link verb.
 * Every entry is one real cash_ledger row + one CASH_LOGGED audit row.
 */
const opts = (...vs) => vs.map((v) => (typeof v === "string" ? { value: v, label: v } : v));
const RAIL = opts(
  { value: "CASH", label: "Cash" }, { value: "MOBILE_MONEY", label: "M-PAiSA" },
  { value: "BANK_TRANSFER", label: "Bank" }, { value: "CREDIT", label: "Credit" }, { value: "OTHER", label: "Other" },
);
const AMOUNT = { name: "amount_fjd", ask: "Amount (FJD)", input: "number", tier: "quick" };
const NOTE = { name: "description", ask: "Note", input: "text", tier: "detail" };

export const moneyConfig = {
  vertical: "MONEY",
  evidence: false,
  context: {
    loader: "/api/v1/farms",
    extract: (body) => { let l = body?.data?.farms ?? body?.data ?? body?.farms ?? body; if (l && !Array.isArray(l)) l = l.farms || l.items || []; return l || []; },
    idKey: "farm_id",
    optionLabel: (f) => f.farm_name || f.name || f.farm_id,
    shortLabel: (f) => f.farm_name || f.name || f.farm_id,
    contextLabel: "Farm",
    loadingMsg: "Loading your farm…",
    emptyMsg: "No farm found — set up your farm first.",
    pickPrompt: "Select farm…",
    buildAnchors: (f) => ({ farm_id: f.farm_id }),
    injectPayload: () => ({}),
  },
  submit: {
    endpoint: "/api/v1/cash-ledger",
    buildBody: ({ values, spec, item, occurredDate }) => ({
      farm_id: item.farm_id,
      transaction_date: occurredDate,
      transaction_type: spec.transactionType,
      category: values.category || "General",
      description: values.description || values.category || spec.choiceLabel || spec.event_type || "Cash entry",
      amount_fjd: Number(values.amount_fjd) || 0,
      ...(values.payment_method ? { payment_method: values.payment_method } : {}),
    }),
    extractResult: (p) => ({ event_id: p?.data?.ledger_id || "", audit_hash: p?.meta?.audit_this_hash || "" }),
  },
  verbs: [
    {
      id: "in", label: "Money in", descriptor: "sales, income, received", icon: "HandCoins",
      resolve: { primary: { event_type: "CASH_IN", transactionType: "INCOME", capture: [
        AMOUNT,
        { name: "category", ask: "What for?", input: "choice", tier: "quick", options: opts("Crop sale", "Livestock sale", "Egg sale", "Milk sale", "Other") },
        { name: "payment_method", ask: "Received via", input: "choice", tier: "quick", options: RAIL },
        NOTE ] } },
    },
    {
      id: "out", label: "Money out", descriptor: "expenses, purchases, paid", icon: "Wallet",
      resolve: { primary: { event_type: "CASH_OUT", transactionType: "EXPENSE", capture: [
        AMOUNT,
        { name: "category", ask: "What for?", input: "choice", tier: "quick", options: opts("Seeds", "Feed", "Chemicals", "Labour", "Transport", "Fuel", "Equipment", "Other") },
        { name: "payment_method", ask: "Paid via", input: "choice", tier: "quick", options: RAIL },
        NOTE ] } },
    },
    {
      id: "finance", label: "Loan / grant / transfer", descriptor: "borrowed, granted, repaid, moved", icon: "Banknote",
      resolve: { branch: { prompt: "Which?", options: [
        { choiceLabel: "Loan received", event_type: "LOAN", transactionType: "LOAN", capture: [
          AMOUNT, { name: "category", ask: "From", input: "text", tier: "quick" }, { name: "payment_method", ask: "Via", input: "choice", tier: "detail", options: RAIL }, NOTE ] },
        { choiceLabel: "Grant received", event_type: "GRANT", transactionType: "GRANT", capture: [
          AMOUNT, { name: "category", ask: "From", input: "text", tier: "quick" }, { name: "payment_method", ask: "Via", input: "choice", tier: "detail", options: RAIL }, NOTE ] },
        { choiceLabel: "Loan repayment", event_type: "REPAYMENT", transactionType: "REPAYMENT", capture: [
          AMOUNT, { name: "category", ask: "To", input: "text", tier: "quick" }, { name: "payment_method", ask: "Via", input: "choice", tier: "detail", options: RAIL }, NOTE ] },
        { choiceLabel: "Transfer", event_type: "TRANSFER", transactionType: "TRANSFER", capture: [
          AMOUNT, { name: "category", ask: "What for?", input: "text", tier: "quick" }, { name: "payment_method", ask: "Via", input: "choice", tier: "detail", options: RAIL }, NOTE ] },
      ] } },
    },
    // Labour lives on its dedicated page; surface it here so Whole-farm needs no tile wall.
    { id: "labor", label: "Worker check-in", descriptor: "log farm labour", icon: "UserCheck", route: "/farm/labor" },
  ],
};

export default moneyConfig;

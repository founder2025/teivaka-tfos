/**
 * FormModalHost — renders a registered form PAGE inside a Modal card over the
 * current page (prototype-parity: forms are overlays, not full-page routes).
 *
 * The existing form pages are reused UNCHANGED — they keep their own fetch/submit
 * logic (HarvestNew's WHD gate included). They navigate on success/cancel; this host
 * watches the location and auto-closes the modal the moment the path changes, so the
 * overlay never lingers on a stale page. A local QueryClientProvider covers forms that
 * use react-query (nests harmlessly under any the page supplies itself).
 *
 * To add a form to the card system: register key → { title, Comp } here and open it
 * via useFormModal().openFormModal(key) (e.g. from the (+) catalog or a page Add btn).
 */
import { Suspense, lazy, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Modal from "../ui/Modal";
import { useFormModal } from "../../context/FormModalContext";
import CaptureEngine from "../../capture/CaptureEngine";
import moneyConfig from "../../capture/config/whole-money";

const CycleNew       = lazy(() => import("../../pages/farmer/CycleNew"));
const NurseryNew     = lazy(() => import("../../pages/farmer/NurseryNew"));
const HarvestNew     = lazy(() => import("../../pages/farmer/HarvestNew"));
const FlockPlacedNew = lazy(() => import("../../pages/farmer/poultry/FlockPlacedNew"));
const Labor          = lazy(() => import("../../pages/farmer/Labor"));

// formKey -> { title, Comp }. Keys are stable identifiers used by callers.
export const FORM_REGISTRY = {
  cycle_new:   { title: "Start a crop",        Comp: CycleNew },
  nursery_new: { title: "Nursery & seedlings", Comp: NurseryNew },
  harvest_new: { title: "Harvest",             Comp: HarvestNew },
  flock_new:   { title: "Place a flock",       Comp: FlockPlacedNew },
  labor:       { title: "Worker check-in",     Comp: Labor },
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

export default function FormModalHost() {
  const { formKey, params, closeFormModal } = useFormModal();
  const location = useLocation();
  const openPathRef = useRef(null);

  // Capture the path when the modal opens; auto-close as soon as the embedded form
  // navigates somewhere else (success/cancel) so the card never shows a stale page.
  useEffect(() => {
    if (!formKey) { openPathRef.current = null; return; }
    if (openPathRef.current == null) { openPathRef.current = location.pathname; return; }
    if (location.pathname !== openPathRef.current) { openPathRef.current = null; closeFormModal(); }
  }, [formKey, location.pathname, closeFormModal]);

  if (!formKey) return null;

  // Cash entry reuses the (+) money Capture Engine (writes cash_ledger + CASH_LOGGED),
  // pre-aimed at money-in / money-out from the caller's params.type.
  if (formKey === "cash") {
    const et = params?.type === "out" ? "CASH_OUT" : params?.type === "in" ? "CASH_IN" : undefined;
    return (
      <Modal isOpen onClose={closeFormModal} title="Money" size="lg">
        <CaptureEngine config={moneyConfig} preselect={et ? { eventType: et } : undefined} onBack={closeFormModal} onDone={closeFormModal} />
      </Modal>
    );
  }

  const entry = FORM_REGISTRY[formKey];
  if (!entry) return null;
  const { title, Comp } = entry;

  return (
    <Modal isOpen onClose={closeFormModal} title={title} size="lg">
      <QueryClientProvider client={qc}>
        <Suspense fallback={<div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>Loading…</div>}>
          <Comp />
        </Suspense>
      </QueryClientProvider>
    </Modal>
  );
}

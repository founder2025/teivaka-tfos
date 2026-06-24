/**
 * FormModalContext — shared state for opening any "page" form as a card overlay.
 *
 * Prototype parity: in the prototype every form is an overlay over the current page,
 * never a full-page navigation. The (+) catalog's CaptureEngine forms already render
 * in a Modal; this lets the (+)'s page-handoff cards (start crop, nursery, harvest,
 * place flock, labour) — and, in later batches, per-page "Add" buttons — open those
 * existing form PAGES inside a Modal too, with the current page visible behind.
 *
 * Mounted in FarmerShell so any farmer surface can call openFormModal(key). The host
 * (FormModalHost) renders the registered form and auto-closes when it navigates away.
 */
import { createContext, useCallback, useContext, useState } from "react";

const FormModalContext = createContext(null);

export function FormModalProvider({ children }) {
  const [state, setState] = useState({ formKey: null, params: null });

  const openFormModal  = useCallback((key, params = null) => setState({ formKey: key || null, params }), []);
  const closeFormModal = useCallback(() => setState({ formKey: null, params: null }), []);

  return (
    <FormModalContext.Provider value={{ formKey: state.formKey, params: state.params, openFormModal, closeFormModal }}>
      {children}
    </FormModalContext.Provider>
  );
}

export function useFormModal() {
  const ctx = useContext(FormModalContext);
  if (!ctx) throw new Error("useFormModal must be used inside FormModalProvider");
  return ctx;
}

/**
 * LibrarySettings — Phase 6.4 Library Management UI.
 *
 * Single page to manage breeds, feeds, vaccines, suppliers, buyers.
 * Globals (is_global=true): read-only with 'Built-in' badge.
 * Tenant rows: Add + Hide (soft-delete via is_active=false) + Restore.
 *
 * Per-page QueryClientProvider wrap (Strike #26).
 * extractList() defensive helper (Strike #27).
 *
 * API recon (Phase 6.4 STEP 0):
 * - Backend exposes `is_global: bool` rather than raw tenant_id.
 * - Backend PATCH v1 (LibraryPatchRequest) accepts ONLY `is_active`.
 *   Rename is deferred to Phase 6.1b-4 (LIBRARY_ROW_UPDATED event_type).
 *   Frontend therefore offers Hide/Restore but not rename.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { apiClient } from '../../utils/apiClient';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
});

const C = {
  soil:   'var(--soil)',
  cream:  'var(--cream)',
  green:  'var(--green)',
  amber:  'var(--amber)',
  red:    'var(--red)',
  border: '#E6DED0',
  muted:  'var(--muted)',
  white:  '#FFFFFF',
  globalBg: '#F4EFE3',
};

// Fallback if the catalog endpoint is unreachable; the live tabs come from
// GET /farm-library-types (Strike #80 — data-driven, no hardcoded type list).
const FALLBACK_TYPES = [
  { key: 'POULTRY_BREED',    label: 'Breeds',    singular: 'breed',    placeholder: 'e.g. ISA Brown' },
  { key: 'POULTRY_FEED',     label: 'Feeds',     singular: 'feed',     placeholder: 'e.g. Layer mash 16%' },
  { key: 'POULTRY_VACCINE',  label: 'Vaccines',  singular: 'vaccine',  placeholder: 'e.g. Newcastle' },
  { key: 'POULTRY_SUPPLIER', label: 'Suppliers', singular: 'supplier', placeholder: 'e.g. Pacific Feed Co' },
  { key: 'POULTRY_BUYER',    label: 'Buyers',    singular: 'buyer',    placeholder: 'e.g. Suva Market' },
];

const NameSchema = z.object({
  name: z.string().min(1).max(255),
});

function extractList(res, ...keyPaths) {
  if (!res) return [];
  for (const path of keyPaths) {
    const parts = path.split('.');
    let cur = res;
    for (const p of parts) {
      if (cur == null) break;
      cur = cur[p];
    }
    if (Array.isArray(cur)) return cur;
  }
  return [];
}

function LibrarySettingsInner() {
  const navigate = useNavigate();
  const [types, setTypes] = useState(FALLBACK_TYPES);
  const [activeType, setActiveType] = useState('POULTRY_BREED');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Add-row state
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNote, setNewNote] = useState('');
  const [addError, setAddError] = useState(null);

  // Inline-edit state
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editError, setEditError] = useState(null);

  // Confirm-deactivate state
  const [confirmingDelete, setConfirmingDelete] = useState(null);

  // Strike #80: drive the tabs from the catalog (no hardcoded type list).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get('/farm-library-types');
        const list = extractList(res, 'data.items', 'data');
        if (!cancelled && list.length) {
          setTypes(list.map((t) => ({
            key: t.library_type,
            label: t.label,
            singular: t.singular_label || (t.label || '').toLowerCase().replace(/s$/, ''),
            placeholder: t.placeholder || '',
          })));
        }
      } catch { /* keep fallback */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load list when type changes or after mutation
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await apiClient.get(`/farm-libraries?library_type=${activeType}`);
        if (cancelled) return;
        const list = extractList(res, 'data.items', 'data');
        // Sort: tenant rows first, then globals; within each group, alphabetical
        list.sort((a, b) => {
          const aGlobal = !!a.is_global;
          const bGlobal = !!b.is_global;
          if (aGlobal !== bGlobal) return aGlobal ? 1 : -1;
          return (a.name || '').localeCompare(b.name || '');
        });
        setItems(list);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Could not load library');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [activeType, refreshTick]);

  const addMutation = useMutation({
    mutationFn: async () => {
      const trimmed = newName.trim();
      const parsed = NameSchema.safeParse({ name: trimmed });
      if (!parsed.success) throw new Error('Name required (1-255 chars)');
      const note = newNote.trim();
      const result = await apiClient.post('/farm-libraries', {
        library_type: activeType,
        name: trimmed,
        ...(note ? { attributes: { note } } : {}),
      });
      return result?.data;
    },
    onSuccess: (data) => {
      window.dispatchEvent(new CustomEvent('tfos:toast', {
        detail: { message: 'Added ✓', type: 'success', hash: data?.audit_hash },
      }));
      setNewName('');
      setNewNote('');
      setShowAdd(false);
      setAddError(null);
      setRefreshTick((t) => t + 1);
    },
    onError: (err) => {
      setAddError(err.message || 'Could not add');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (libraryId) => {
      const result = await apiClient.patch(`/farm-libraries/${libraryId}`, { is_active: false });
      return result?.data;
    },
    onSuccess: (data) => {
      window.dispatchEvent(new CustomEvent('tfos:toast', {
        detail: { message: 'Removed ✓', type: 'success', hash: data?.audit_hash },
      }));
      setConfirmingDelete(null);
      setRefreshTick((t) => t + 1);
    },
    onError: (err) => {
      window.dispatchEvent(new CustomEvent('tfos:toast', {
        detail: { message: err.message || 'Remove failed', type: 'error' },
      }));
      setConfirmingDelete(null);
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (libraryId) => {
      const result = await apiClient.patch(`/farm-libraries/${libraryId}`, { is_active: true });
      return result?.data;
    },
    onSuccess: () => {
      window.dispatchEvent(new CustomEvent('tfos:toast', {
        detail: { message: 'Restored ✓', type: 'success' },
      }));
      setRefreshTick((t) => t + 1);
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ libraryId }) => {
      const trimmed = editName.trim();
      const parsed = NameSchema.safeParse({ name: trimmed });
      if (!parsed.success) throw new Error('Name required (1-255 chars)');
      const note = editNote.trim();
      const result = await apiClient.patch(`/farm-libraries/${libraryId}`, {
        name: trimmed,
        attributes: note ? { note } : {},
      });
      return result?.data;
    },
    onSuccess: (data) => {
      window.dispatchEvent(new CustomEvent('tfos:toast', {
        detail: { message: 'Saved ✓', type: 'success', hash: data?.audit_hash },
      }));
      setEditingId(null);
      setEditError(null);
      setRefreshTick((t) => t + 1);
    },
    onError: (err) => { setEditError(err.message || 'Could not save'); },
  });

  const startEdit = (item) => {
    setEditingId(item.library_id);
    setEditName(item.name || '');
    setEditNote((item.attributes && item.attributes.note) || '');
    setEditError(null);
  };

  const activeMeta = types.find((t) => t.key === activeType);

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/me')} className="text-sm" style={{ color: C.muted }}>
          ← Back
        </button>
        <h1 className="text-base font-semibold">My library</h1>
        <div className="w-12" />
      </div>

      <div className="px-4 py-4 max-w-md mx-auto space-y-4">
        {/* Type tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {types.map((t) => (
            <button
              key={t.key}
              onClick={() => { setActiveType(t.key); setShowAdd(false); setEditingId(null); }}
              className="px-3 py-2 rounded-md text-sm whitespace-nowrap"
              style={{
                background: t.key === activeType ? C.green : C.white,
                color: t.key === activeType ? C.white : C.soil,
                border: `1px solid ${t.key === activeType ? C.green : C.border}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Add row */}
        {!showAdd ? (
          <button
            onClick={() => setShowAdd(true)}
            className="w-full px-4 py-3 rounded-md text-base font-medium border-2 border-dashed"
            style={{ borderColor: C.green, color: C.green, background: C.white }}
          >
            + Add {activeMeta?.label.toLowerCase().replace(/s$/, '')}
          </button>
        ) : (
          <div className="px-3 py-3 rounded-md border" style={{ background: C.white, borderColor: C.border }}>
            <label className="block text-xs mb-1" style={{ color: C.muted }}>Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={255}
              placeholder={activeMeta?.placeholder}
              className="w-full px-3 py-2 rounded-md border text-sm mb-2"
              style={{ background: C.cream, borderColor: addError ? C.red : C.border }}
              autoFocus
            />
            <label className="block text-xs mb-1" style={{ color: C.muted }}>Note (optional)</label>
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              maxLength={255}
              placeholder="e.g. preferred supplier, price, reminder"
              className="w-full px-3 py-2 rounded-md border text-sm mb-2"
              style={{ background: C.cream, borderColor: C.border }}
            />
            {addError && (
              <div className="text-xs mb-2" style={{ color: C.red }}>{addError}</div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => addMutation.mutate()}
                disabled={addMutation.isPending || !newName.trim()}
                className="flex-1 px-3 py-2 rounded-md text-sm font-medium"
                style={{
                  background: (addMutation.isPending || !newName.trim()) ? '#A8C997' : C.green,
                  color: C.white,
                }}
              >
                {addMutation.isPending ? 'Adding…' : 'Add'}
              </button>
              <button
                onClick={() => { setShowAdd(false); setNewName(''); setNewNote(''); setAddError(null); }}
                className="px-3 py-2 rounded-md text-sm"
                style={{ color: C.muted }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Loading / error states */}
        {loading && (
          <div className="text-sm" style={{ color: C.muted }}>Loading…</div>
        )}
        {error && (
          <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>
            {error}
          </div>
        )}

        {/* Items list */}
        <div className="space-y-2">
          {items.length === 0 && !loading && (
            <div className="text-sm text-center py-6" style={{ color: C.muted }}>
              No {activeMeta?.label.toLowerCase()} yet. Tap + above to add one.
            </div>
          )}
          {items.map((item) => {
            const isGlobal = !!item.is_global;
            const isInactive = !item.is_active;
            const note = item.attributes && item.attributes.note;

            if (editingId === item.library_id) {
              return (
                <div key={item.library_id} className="px-3 py-3 rounded-md border" style={{ background: C.white, borderColor: C.border }}>
                  <label className="block text-xs mb-1" style={{ color: C.muted }}>Name</label>
                  <input
                    type="text" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={255}
                    className="w-full px-3 py-2 rounded-md border text-sm mb-2"
                    style={{ background: C.cream, borderColor: editError ? C.red : C.border }} autoFocus
                  />
                  <label className="block text-xs mb-1" style={{ color: C.muted }}>Note (optional)</label>
                  <input
                    type="text" value={editNote} onChange={(e) => setEditNote(e.target.value)} maxLength={255}
                    placeholder="e.g. preferred supplier, price, reminder"
                    className="w-full px-3 py-2 rounded-md border text-sm mb-2"
                    style={{ background: C.cream, borderColor: C.border }}
                  />
                  {editError && <div className="text-xs mb-2" style={{ color: C.red }}>{editError}</div>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => editMutation.mutate({ libraryId: item.library_id })}
                      disabled={editMutation.isPending || !editName.trim()}
                      className="flex-1 px-3 py-2 rounded-md text-sm font-medium"
                      style={{ background: (editMutation.isPending || !editName.trim()) ? '#A8C997' : C.green, color: C.white }}
                    >
                      {editMutation.isPending ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => { setEditingId(null); setEditError(null); }} className="px-3 py-2 rounded-md text-sm" style={{ color: C.muted }}>
                      Cancel
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={item.library_id}
                className="px-3 py-2 rounded-md border flex items-center justify-between gap-2"
                style={{
                  background: isGlobal ? C.globalBg : C.white,
                  borderColor: C.border,
                  opacity: isInactive ? 0.5 : 1,
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{item.name}</div>
                  {note && (
                    <div className="text-xs truncate" style={{ color: C.muted }}>{note}</div>
                  )}
                  {isGlobal && (
                    <div className="text-xs" style={{ color: C.muted }}>Built-in</div>
                  )}
                  {isInactive && (
                    <div className="text-xs" style={{ color: C.amber }}>Hidden</div>
                  )}
                </div>
                {!isInactive && !isGlobal && (
                  <>
                    <button
                      onClick={() => startEdit(item)}
                      className="text-sm px-2 py-1"
                      style={{ color: C.soil }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmingDelete(item)}
                      className="text-sm px-2 py-1"
                      style={{ color: C.red }}
                    >
                      Remove
                    </button>
                  </>
                )}
                {isInactive && (
                  <button
                    onClick={() => reactivateMutation.mutate(item.library_id)}
                    disabled={reactivateMutation.isPending}
                    className="text-sm px-2 py-1"
                    style={{ color: C.green }}
                  >
                    Restore
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirm delete modal */}
      {confirmingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setConfirmingDelete(null)}
        >
          <div
            className="w-full md:max-w-md p-4 rounded-t-lg md:rounded-lg space-y-3"
            style={{ background: C.cream }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold">Hide this from your lists?</h2>
            <p className="text-sm" style={{ color: C.muted }}>
              "{confirmingDelete.name}" will no longer appear in dropdowns. You can restore it later.
              No existing records will be affected.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => deactivateMutation.mutate(confirmingDelete.library_id)}
                disabled={deactivateMutation.isPending}
                className="flex-1 px-3 py-2 rounded-md text-sm font-medium"
                style={{ background: C.red, color: C.white }}
              >
                {deactivateMutation.isPending ? 'Hiding…' : 'Hide'}
              </button>
              <button
                onClick={() => setConfirmingDelete(null)}
                className="flex-1 px-3 py-2 rounded-md text-sm"
                style={{ background: C.white, color: C.soil, border: `1px solid ${C.border}` }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LibrarySettings() {
  return (
    <QueryClientProvider client={queryClient}>
      <LibrarySettingsInner />
    </QueryClientProvider>
  );
}

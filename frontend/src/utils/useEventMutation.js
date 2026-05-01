/**
 * useEventMutation — React Query hook for POSTing TFOS events.
 *
 * Wraps apiClient.post('/events', payload) and surfaces:
 *   - mutate(): triggers the POST
 *   - isPending: in-flight indicator
 *   - data: success response (event_id, audit_event_id, audit_hash)
 *   - error: structured error from backend
 *   - reset(): clears error/data state for retry
 *
 * On success, dispatches tfos:toast event with audit_hash badge.
 *
 * Phase 6.2-4: this hook is the standard mechanism for emitting any event
 * via the polymorphic /api/v1/events endpoint. EggsNew (6.2-5) and every
 * subsequent form should use it.
 */

import { useMutation } from '@tanstack/react-query';
import { apiClient } from './apiClient';

/**
 * @param {object} options
 * @param {string} options.eventType - e.g. 'EGGS_COLLECTED'
 * @param {string} [options.successMessage] - toast message on success (default: 'Logged ✓')
 * @param {function} [options.onSuccess] - additional callback on success
 * @param {function} [options.onError] - additional callback on error
 */
export function useEventMutation({ eventType, successMessage = 'Logged ✓', onSuccess, onError } = {}) {
  return useMutation({
    mutationFn: async ({ anchors, payload, occurred_at }) => {
      const body = { event_type: eventType, anchors, payload };
      if (occurred_at) body.occurred_at = occurred_at;
      const result = await apiClient.post('/events', body);
      return result.data;
    },
    onSuccess: (data) => {
      const hash = data?.audit_hash;
      window.dispatchEvent(new CustomEvent('tfos:toast', {
        detail: { message: successMessage, type: 'success', hash },
      }));
      if (onSuccess) onSuccess(data);
    },
    onError: (err) => {
      const msg = err?.message || 'Something went wrong';
      window.dispatchEvent(new CustomEvent('tfos:toast', {
        detail: { message: msg, type: 'error' },
      }));
      if (onError) onError(err);
    },
  });
}

export default useEventMutation;

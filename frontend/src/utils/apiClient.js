/**
 * apiClient — shared fetch wrapper for TFOS frontend.
 *
 * Replaces the per-page hand-rolled authHeaders() pattern.
 * Reads tfos_access_token from localStorage and attaches as Bearer header.
 * Returns parsed JSON response or throws structured error matching backend's
 * error_envelope shape: {status: 'error', error: {code, message}}.
 *
 * Phase 6.2-4: introduces this client for the new EggsNew form. Existing pages
 * (HarvestNew, FarmBasics, etc.) continue to use plain fetch until they're
 * migrated in their own phases.
 */

const API_BASE = '/api/v1';

function authHeaders() {
  const token = localStorage.getItem('tfos_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(method, path, body = null) {
  const url = path.startsWith('/api/') ? path : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders(),
  };
  const init = { method, headers };
  if (body !== null) init.body = JSON.stringify(body);

  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch (e) { /* non-json body */ }
  }

  if (!res.ok) {
    const error = (json && json.detail && json.detail.error)
      || { code: `http_${res.status}`, message: res.statusText || 'Request failed' };
    const err = new Error(error.message);
    err.code = error.code;
    err.status = res.status;
    err.body = json;
    throw err;
  }

  return json;
}

export const apiClient = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
};

export default apiClient;

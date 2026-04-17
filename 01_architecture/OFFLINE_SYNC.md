# TFOS Offline Sync Architecture

## 1. Why Offline is Non-Negotiable

Teivaka Agri-TOS is built for Fiji farmers. The F002 requirement (Kadavu island connectivity) reflects a hard operational reality: outer island farms — Kadavu, Taveuni, Ovalau, the Lau Group — have no 4G connectivity. Farmers on these islands rely on intermittent satellite connections (Kacific1 VSAT), 2G/EDGE mobile data available only near jetty areas, or no data connection at all during field operations.

The business consequence is concrete: a farmer logging eggplant harvest data during the day must not lose that data if connectivity drops. Labor attendance logged at 6am on a Kadavu farm cannot wait until the ferry arrives in Suva three days later to be saved. PHI compliance dates logged offline must sync reliably so TIS can issue correct harvest alerts.

The offline strategy does not attempt to replicate the full server-side capability offline. It provides exactly the functionality needed by a farmer with a mobile browser in the field: data entry, viewing recent data, and using cached knowledge. All AI inference (TIS), complex reporting, and billing remain online-only.

Connectivity tiers encountered by Teivaka users:
- **Good connectivity** (Suva, Nausori, Lautoka urban farms): standard online operation
- **Intermittent connectivity** (peri-urban, Sigatoka Valley, Ba area): occasional drops, fast reconnect
- **Very limited connectivity** (Kadavu, Taveuni outer areas): 2G, high latency, frequent disconnection
- **No connectivity** (Kadavu inland farms, Lau Group, some Yasawa areas): full offline mode required

---

## 2. Data Classification — Three-Tier Offline Model

### Tier 1 — Full Offline Read + Write (works with no connection)
These operations are essential field activities that cannot wait for connectivity.

| Data Type | Tables | Offline Capability |
|---|---|---|
| Weather observations | `weather_log` | Full create + local cache |
| Labor attendance | `labor_attendance` | Full create + local cache |
| Harvest records | `harvests` | Full create + local cache |
| Input applications | `input_transactions` (APPLICATION type) | Full create + local cache |
| Income logging | `income_log` | Full create + local cache |
| Task completion | `tasks` status updates | Full update + local cache |
| Nursery batch status | `nursery_batches` | Full update + local cache |
| Delivery status update | `deliveries` status | Update only + local cache |

All Tier 1 writes go into the **sync queue** (IndexedDB) with idempotency keys. They are processed when connectivity returns.

### Tier 2 — Cached Read-Only (available offline, cannot write)
Data that changes infrequently and is loaded from server cache when online.

| Data Type | Cache Duration | Notes |
|---|---|---|
| Farm profile and zones | 24 hours | User's own farm data |
| Production unit list | 24 hours | Rarely changes mid-cycle |
| Worker list with rates | 6 hours | Needed for labor logging |
| Active cycle list | 6 hours | Context for all data entry |
| Input inventory (inputs) | 6 hours | Needed for APPLICATION logging |
| KB articles | 72 hours | Agronomic guidance offline |
| Rotation rules (shared) | 7 days | Static reference data |
| Price master | 24 hours | Reference pricing |

### Tier 3 — Online Only (not available offline)
Features requiring live server computation or third-party APIs.

| Feature | Reason Online-Only |
|---|---|
| TIS chat (AI inference) | Requires Claude API + DB query |
| Voice transcription | Requires Whisper/Claude API |
| Financial reports (P&L, CoKG trend) | Live aggregation from multiple tables |
| Community marketplace | Shared data, moderation required |
| Subscription management | Stripe integration |
| Decision engine alerts | Live rotation + PHI computation |
| Export CSV generation | Live DB aggregation |

---

## 3. IndexedDB Schema — sync_queue Store

The frontend uses **Dexie.js** (IndexedDB wrapper) with the following store definitions.

```javascript
// db.js — Dexie database definition
import Dexie from 'dexie';

export const db = new Dexie('TFOSOfflineDB');

db.version(1).stores({
  // Primary sync queue — all pending writes go here
  sync_queue: [
    '++id',           // Auto-increment primary key
    'idempotency_key', // Unique per write, prevents duplicate submission
    'endpoint',       // e.g. "/labor", "/harvests", "/income"
    'method',         // "POST" | "PATCH" | "DELETE"
    'payload',        // JSON serialized request body
    'status',         // "PENDING" | "SYNCING" | "FAILED" | "SYNCED"
    'tenant_id',      // For multi-tenant validation
    'farm_id',        // Quick filter by farm
    'created_at',     // ISO timestamp of original capture
    'synced_at',      // ISO timestamp of successful sync
    'retry_count',    // Number of sync attempts
    'error_message',  // Last error from server
    'server_response' // JSON of successful server response
  ].join(','),

  // Cached entity stores (read-only when offline)
  farms:             'farm_id, tenant_id, cached_at',
  zones:             'zone_id, farm_id, tenant_id, cached_at',
  production_units:  'pu_id, farm_id, zone_id, cached_at',
  cycles:            'cycle_id, farm_id, tenant_id, cycle_status, cached_at',
  workers:           'worker_id, farm_id, tenant_id, cached_at',
  inputs:            'input_id, farm_id, tenant_id, cached_at',
  kb_articles:       'kb_entry_id, category, production_id, cached_at',

  // Locally created records before sync (optimistic writes)
  local_labor:       '++id, idempotency_key, farm_id, work_date, created_at',
  local_harvests:    '++id, idempotency_key, farm_id, harvest_date, created_at',
  local_weather:     '++id, idempotency_key, farm_id, observation_date, created_at',
  local_income:      '++id, idempotency_key, farm_id, transaction_date, created_at',
  local_input_txns:  '++id, idempotency_key, farm_id, transaction_date, created_at',
});

// Cache TTL constants (milliseconds)
export const CACHE_TTL = {
  FARMS:            24 * 60 * 60 * 1000,   // 24 hours
  CYCLES:           6  * 60 * 60 * 1000,   // 6 hours
  WORKERS:          6  * 60 * 60 * 1000,   // 6 hours
  INPUTS:           6  * 60 * 60 * 1000,   // 6 hours
  KB_ARTICLES:      72 * 60 * 60 * 1000,   // 72 hours
  ROTATION_RULES:   7  * 24 * 60 * 60 * 1000, // 7 days
};
```

---

## 4. Service Worker Strategy

The service worker (`sw.js`) implements three caching strategies based on resource type.

### Cache-First: Static Assets
App shell, fonts, icons, and bundled JavaScript are served from cache first. Network is only consulted on cache miss (initial load) or during background update checks.

```javascript
// Static assets: cache-first, update in background
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) {
          // Update cache in background (stale-while-revalidate)
          fetch(event.request).then(response => {
            if (response.ok) {
              caches.open('tfos-static-v1').then(cache => cache.put(event.request, response));
            }
          }).catch(() => {}); // Ignore network errors for update
          return cached;
        }
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open('tfos-static-v1').then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
  }
});

function isStaticAsset(pathname) {
  return /\.(js|css|woff2?|png|svg|ico)$/.test(pathname) ||
         pathname.startsWith('/assets/') ||
         pathname === '/';
}
```

### Network-First: API Reads
GET requests to the TFOS API are attempted network-first. On failure (offline), the cached response is returned if available and not expired.

```javascript
// API reads: network-first with cache fallback
if (url.hostname.includes('api.teivaka.com') && event.request.method === 'GET') {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open('tfos-api-cache-v1').then(cache => {
            // Tag response with timestamp for TTL checking
            const headers = new Headers(response.headers);
            headers.append('X-Cache-At', Date.now().toString());
            cache.put(event.request, new Response(clone.body, { headers }));
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          return new Response(JSON.stringify({ error: 'offline', data: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 503
          });
        });
      })
  );
}
```

### Queue Writes: POST/PATCH/DELETE
Mutating requests (POST, PATCH, DELETE) are never cached. When offline, they are intercepted and stored in IndexedDB sync_queue. The service worker broadcasts a "queued" event to the app UI.

```javascript
// API writes: queue when offline
if (url.hostname.includes('api.teivaka.com') && ['POST', 'PATCH', 'DELETE'].includes(event.request.method)) {
  event.respondWith(
    fetch(event.request.clone())
      .catch(async () => {
        // We are offline — save to sync queue via postMessage to SW client
        const body = await event.request.json();
        const channel = new BroadcastChannel('tfos-sync');
        channel.postMessage({
          type: 'QUEUE_WRITE',
          endpoint: url.pathname,
          method: event.request.method,
          payload: body,
        });
        // Return optimistic success to app
        return new Response(JSON.stringify({
          data: { ...body, _offline: true, _queued: true },
          status: 'queued',
        }), { headers: { 'Content-Type': 'application/json' }, status: 202 });
      })
  );
}
```

---

## 5. Conflict Resolution — Last-Write-Wins with Idempotency Keys

### Design Decision
TFOS uses **last-write-wins (LWW)** conflict resolution. This is the correct choice for an agricultural data system where:
- Multiple users rarely edit the same record (one farm, one farmer per field operation)
- Conflicts are almost always caused by the same user writing offline then reconnecting, not two users editing the same entity simultaneously
- The cost of merge complexity (CRDTs, operational transforms) is not justified by the conflict frequency

### Idempotency Key Algorithm

Every offline write is assigned a deterministic idempotency key:

```
idempotency_key = sha256(tenant_id + farm_id + endpoint + created_at_ms + random_4bytes)
```

Implemented in frontend:

```javascript
import { v4 as uuidv4 } from 'uuid';

export function generateIdempotencyKey(tenantId, farmId, endpoint) {
  const timestamp = Date.now().toString();
  const random = uuidv4().replace(/-/g, '').slice(0, 8);
  return `${tenantId.slice(0, 8)}-${farmId.slice(0, 8)}-${endpoint.replace(/\//g, '_').slice(0, 12)}-${timestamp}-${random}`;
}
// Example: "a1b2c3d4-e5f6g7h8-_labor-1717234567890-ab12cd34"
```

All Tier 1 write APIs accept `idempotency_key` in the request body. Server-side check:

```sql
-- Check before INSERT (example: labor_attendance)
SELECT attendance_id FROM tenant.labor_attendance
WHERE idempotency_key = :key LIMIT 1;
-- If row exists: return existing record (200 OK), do NOT insert duplicate
```

### LWW Resolution Algorithm

When the sync queue processes a write:

1. Generate `idempotency_key` at offline write time (client, before connectivity lost)
2. Store key with the payload in `sync_queue`
3. On connectivity restore, POST payload to API with `idempotency_key` in body
4. Server checks: `SELECT ... WHERE idempotency_key = :key`
5. If match found: return existing record with `duplicate: true` flag (no error)
6. If no match: INSERT normally
7. Client marks sync_queue item as `SYNCED`

**LWW for PATCH operations:** For status updates (order status, delivery status), the last-arriving PATCH wins. If a farmer updates order status to DELIVERED offline, and a manager updates to CANCELLED online before sync, the CANCELLED status wins (arrived at server first). When the farmer's sync arrives, the server returns the current state and the client updates local cache.

---

## 6. Conflict Scenarios Table

| # | Scenario | Resolution | Rationale |
|---|---|---|---|
| 1 | **Farmer logs labor offline; connectivity restores; same record POSTed twice** | Server detects matching `idempotency_key`, returns existing record. Client marks as SYNCED without duplicate insert. | Idempotency key is the primary defense against double-submission. |
| 2 | **Farmer updates harvest weight offline to 120kg. Manager updates same harvest to 95kg online before sync arrives.** | Manager's 95kg write wins (arrived at server first). Farmer's 120kg sync attempt receives server's current state. Client updates local cache to 95kg and logs a conflict notification to the farmer. | LWW by server-arrival time. Two users editing the same harvest is rare — log the conflict visibly. |
| 3 | **Farm data (zone area) updated on web dashboard while farmer is offline on mobile.** | When farmer reconnects, their read cache is invalidated for that entity (TTL expired or explicit invalidation on sync). Next read fetches fresh data from server. No write conflict — farmer was only reading. | Cache invalidation on sync handles stale reads. |
| 4 | **Farmer creates two income log entries offline. Both have unique idempotency keys.** | Both sync independently. Both are inserted as separate records. No conflict. | Distinct idempotency keys = distinct records = expected behavior. |
| 5 | **Order status changed to DISPATCHED offline. Same order cancelled by customer via phone (manager updates to CANCELLED online before sync arrives).** | CANCELLED wins. Farmer's DISPATCHED PATCH arrives at server and is rejected (business rule: CANCELLED orders cannot transition to DISPATCHED). Server returns 409 with current status. Client updates local cache to CANCELLED and shows conflict alert to farmer. | Domain-specific business rules enforce valid state transitions regardless of LWW. |

---

## 7. Sync Queue Processing Algorithm

The sync processor runs in the React app as a background effect triggered by online events.

```
SYNC ALGORITHM:
1. Listen for navigator.onLine = true event (or 'online' event listener)
2. Fetch all sync_queue items WHERE status = 'PENDING' ORDER BY created_at ASC
3. Set items to status = 'SYNCING'
4. For each item (sequential processing to preserve ordering):
   a. Build HTTP request: method = item.method, url = BASE_URL + item.endpoint, body = item.payload
   b. Add Authorization header (JWT from local storage)
   c. POST/PATCH to API with timeout = 15 seconds
   d. ON SUCCESS (2xx response):
      - Set item.status = 'SYNCED'
      - Set item.synced_at = now()
      - Set item.server_response = response body
      - Update corresponding local_* store with server-assigned ID
   e. ON IDEMPOTENCY DUPLICATE (server returns {duplicate: true}):
      - Set item.status = 'SYNCED' (treat as success — data is on server)
      - Log to console for debugging
   f. ON CLIENT ERROR (4xx):
      - Set item.status = 'FAILED'
      - Set item.error_message = response body detail
      - Do NOT retry (4xx means bad data, retrying won't help)
   g. ON SERVER ERROR or NETWORK ERROR (5xx, timeout):
      - Increment item.retry_count
      - If retry_count < 5: set status = 'PENDING', schedule retry with exponential backoff
        - Retry delays: 30s, 2min, 10min, 30min, 2h
      - If retry_count >= 5: set status = 'FAILED', alert user
5. After all items processed, emit 'sync:complete' event for UI refresh
6. Invalidate stale Tier 2 caches (set cached_at = 0 for entities touched by synced writes)
```

**Exponential Backoff Implementation:**
```javascript
const RETRY_DELAYS_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000];

function scheduleRetry(syncQueueItem) {
  const delay = RETRY_DELAYS_MS[Math.min(syncQueueItem.retry_count - 1, 4)];
  setTimeout(() => processSyncQueue(), delay);
}
```

---

## 8. React useOfflineSync Hook — Complete Implementation

```javascript
// hooks/useOfflineSync.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { db, CACHE_TTL } from '../db';
import { generateIdempotencyKey } from '../utils/idempotency';
import { apiClient } from '../services/api';

const RETRY_DELAYS_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000];

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const syncLockRef = useRef(false);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Count pending items for UI indicator
  useEffect(() => {
    const interval = setInterval(async () => {
      const count = await db.sync_queue
        .where('status').anyOf(['PENDING', 'SYNCING'])
        .count();
      setPendingCount(count);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const triggerSync = useCallback(async () => {
    if (syncLockRef.current || !navigator.onLine) return;
    syncLockRef.current = true;
    setIsSyncing(true);

    try {
      const pending = await db.sync_queue
        .where('status').anyOf(['PENDING'])
        .sortBy('created_at');

      for (const item of pending) {
        await db.sync_queue.update(item.id, { status: 'SYNCING' });

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15_000);

          const response = await apiClient.request({
            method: item.method,
            url: item.endpoint,
            data: item.payload,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (response.data?.duplicate) {
            // Idempotency match — treat as success
            await db.sync_queue.update(item.id, {
              status: 'SYNCED',
              synced_at: new Date().toISOString(),
              server_response: response.data,
            });
          } else {
            await db.sync_queue.update(item.id, {
              status: 'SYNCED',
              synced_at: new Date().toISOString(),
              server_response: response.data,
            });
          }
        } catch (err) {
          const status = err.response?.status;

          if (status >= 400 && status < 500) {
            // Client error — don't retry
            await db.sync_queue.update(item.id, {
              status: 'FAILED',
              error_message: err.response?.data?.detail || err.message,
            });
          } else {
            // Network or server error — retry with backoff
            const newRetryCount = (item.retry_count || 0) + 1;
            await db.sync_queue.update(item.id, {
              status: newRetryCount >= 5 ? 'FAILED' : 'PENDING',
              retry_count: newRetryCount,
              error_message: err.message,
            });
            if (newRetryCount < 5) {
              const delay = RETRY_DELAYS_MS[Math.min(newRetryCount - 1, 4)];
              setTimeout(triggerSync, delay);
            }
          }
        }
      }

      setLastSyncAt(new Date());
    } finally {
      syncLockRef.current = false;
      setIsSyncing(false);
      // Refresh pending count
      const count = await db.sync_queue.where('status').anyOf(['PENDING', 'SYNCING']).count();
      setPendingCount(count);
    }
  }, []);

  /**
   * Queue an offline write. Returns optimistic data immediately.
   * @param {string} endpoint - API path e.g. "/labor"
   * @param {string} method - "POST" | "PATCH"
   * @param {object} payload - Request body (must include idempotency_key)
   * @param {string} farmId - Farm ID for filtering
   * @param {string} tenantId - Tenant ID
   */
  const queueWrite = useCallback(async (endpoint, method, payload, farmId, tenantId) => {
    const idempotency_key = generateIdempotencyKey(tenantId, farmId, endpoint);
    const item = {
      idempotency_key,
      endpoint,
      method,
      payload: { ...payload, idempotency_key },
      status: 'PENDING',
      tenant_id: tenantId,
      farm_id: farmId,
      created_at: new Date().toISOString(),
      retry_count: 0,
    };

    if (isOnline) {
      // Try online first
      try {
        const response = await apiClient.request({
          method,
          url: endpoint,
          data: item.payload,
        });
        return { success: true, data: response.data, offline: false };
      } catch (err) {
        if (!navigator.onLine) {
          // Went offline during request — queue it
          await db.sync_queue.add(item);
          return { success: true, data: payload, offline: true, queued: true };
        }
        throw err;
      }
    } else {
      // Definitely offline — queue it
      await db.sync_queue.add(item);
      return { success: true, data: payload, offline: true, queued: true };
    }
  }, [isOnline]);

  const getFailedItems = useCallback(async () => {
    return db.sync_queue.where('status').equals('FAILED').toArray();
  }, []);

  const clearSyncedItems = useCallback(async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.sync_queue
      .where('status').equals('SYNCED')
      .and(item => item.synced_at < sevenDaysAgo)
      .delete();
  }, []);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    lastSyncAt,
    triggerSync,
    queueWrite,
    getFailedItems,
    clearSyncedItems,
  };
}
```

---

## 9. Adding idempotency_key to API Requests — Frontend Pattern

Every form that submits a Tier 1 write must generate and include an `idempotency_key`. The pattern is:

```javascript
// Example: LogLaborForm.jsx
import { useOfflineSync } from '../hooks/useOfflineSync';
import { generateIdempotencyKey } from '../utils/idempotency';
import { useAuth } from '../hooks/useAuth';
import { useFarm } from '../hooks/useFarm';

export function LogLaborForm() {
  const { queueWrite, isOnline } = useOfflineSync();
  const { user } = useAuth();
  const { selectedFarmId } = useFarm();

  const handleSubmit = async (formData) => {
    const payload = {
      worker_id: formData.workerId,
      farm_id: selectedFarmId,
      work_date: formData.workDate.toISOString(),
      hours_worked: formData.hoursWorked,
      daily_rate_fjd: formData.dailyRate,
      total_pay_fjd: formData.totalPay,
      task_description: formData.taskDescription,
      overtime_hours: formData.overtimeHours || 0,
      overtime_rate_fjd: formData.overtimeRate || null,
      // idempotency_key is added by queueWrite automatically
    };

    const result = await queueWrite(
      '/labor',
      'POST',
      payload,
      selectedFarmId,
      user.tenant_id
    );

    if (result.offline) {
      showToast('Labor logged offline — will sync when connected', 'warning');
    } else {
      showToast('Labor logged successfully', 'success');
    }
  };
}
```

**Key rules:**
1. Never reuse an idempotency key — generate a new one per form submission
2. The `generateIdempotencyKey` function includes timestamp + random bytes to ensure uniqueness even if the same endpoint is called twice within milliseconds
3. If the user refreshes the form and resubmits without completing, the new submission gets a new key — this is correct behavior
4. For retry scenarios (user explicitly retries a failed submission), use the original idempotency key from the failed sync_queue item

---

## 10. Testing Offline Mode — Chrome DevTools Instructions

Follow these steps to test TFOS offline behavior in development:

### Step 1 — Open Chrome DevTools
Press F12 → Go to **Network** tab

### Step 2 — Simulate Offline
In the Network tab throttling dropdown (top bar), select **Offline**. The browser icon will show a warning indicator.

### Step 3 — Test a Write Operation
Navigate to a Tier 1 form (e.g. Labor Log). Fill in the form and submit. Observe:
- Form should succeed immediately (optimistic response)
- Toast notification should say "Logged offline — will sync when connected"
- Check Application → IndexedDB → TFOSOfflineDB → sync_queue — you should see a new row with `status: "PENDING"`

### Step 4 — Simulate Reconnection
Change throttling dropdown from **Offline** back to **No throttling** (or set to your actual connection speed). Observe:
- The `navigator.onLine` event fires
- `useOfflineSync.triggerSync()` is called automatically
- The sync_queue item changes from `PENDING` → `SYNCING` → `SYNCED`
- The server receives the write (check the API logs or Network tab for the outgoing request)

### Step 5 — Test Idempotency
Simulate the same write being submitted twice:
1. Submit form offline → item added to sync_queue
2. Before sync: change throttling to **Slow 3G**, submit the same form again (simulate user double-tapping)
3. Both items sync — second one should return `{duplicate: true}` from server
4. Both sync_queue items should reach `SYNCED` status — no duplicate data on server

### Step 6 — Test Failed Sync
Set throttling to **Offline**. Submit a write. Change throttling to **Slow 3G** and observe sync attempt timing out. Change to **Offline** again to simulate the retry delay scenario. Verify `retry_count` increments in IndexedDB and that status eventually becomes `FAILED` after 5 attempts.

### Step 7 — Verify Cache Behavior
Go to Application → Cache Storage → `tfos-api-cache-v1`. After loading the app online, you should see cached GET responses. Go offline and reload — the app should still display farm data, workers, and cycle list from cache.

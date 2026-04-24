import { useEffect, useState, useCallback } from "react";

/**
 * useTisSse — subscribes to GET /api/v1/tis/stream (SSE) and exposes the
 * running advisory list + a markRead(id) action.
 *
 * EventSource cannot set Authorization headers, so we pass the token as
 * ?access_token=. The backend accepts either Bearer or the query param.
 */
export function useTisSse() {
  const [advisories, setAdvisories] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("tfos_access_token");
    if (!token) return undefined;

    const url = `/api/v1/tis/stream?access_token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener("advisory", (e) => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }
      setAdvisories((prev) => {
        if (prev.some((a) => a.advisory_id === data.advisory_id)) return prev;
        return [data, ...prev];
      });
    });

    es.addEventListener("ping", () => {});

    return () => es.close();
  }, []);

  const markRead = useCallback(async (advisory_id) => {
    const token = localStorage.getItem("tfos_access_token");
    try {
      await fetch(`/api/v1/tis/advisories/${advisory_id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      return;
    }
    setAdvisories((prev) =>
      prev.map((a) =>
        a.advisory_id === advisory_id
          ? { ...a, read_at: new Date().toISOString() }
          : a,
      ),
    );
  }, []);

  const unreadCount = advisories.filter((a) => !a.read_at).length;
  const hasCritical = advisories.some((a) => !a.read_at && a.priority === "CRITICAL");

  return { advisories, connected, markRead, unreadCount, hasCritical };
}

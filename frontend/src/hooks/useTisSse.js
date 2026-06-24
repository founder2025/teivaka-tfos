import { useEffect, useState, useCallback } from "react";
import { openTicketedStream } from "../utils/streamTicket";

/**
 * useTisSse — subscribes to GET /api/v1/tis/stream (SSE) and exposes the
 * running advisory list + a markRead(id) action.
 *
 * EventSource can't set Authorization headers, so the stream is authed with a
 * single-use ticket (no JWT in the URL — B93) via openTicketedStream.
 */
export function useTisSse() {
  const [advisories, setAdvisories] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("tfos_access_token");
    if (!token) return undefined;

    // SSE auth via single-use ticket (no JWT in the URL — B93). The helper owns
    // reconnection, minting a fresh ticket each time.
    const stream = openTicketedStream("/api/v1/tis/stream", {
      onOpen: () => setConnected(true),
      onError: () => setConnected(false),
      listeners: {
        advisory: (e) => {
          let data;
          try { data = JSON.parse(e.data); } catch { return; }
          setAdvisories((prev) => {
            if (prev.some((a) => a.advisory_id === data.advisory_id)) return prev;
            return [data, ...prev];
          });
        },
        ping: () => {},
      },
    });

    return () => stream.close();
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

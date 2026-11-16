'use client';
import { useEffect, useState, useRef } from 'react';

export interface SeatMapEvent {
  flightId: string;
  occupied: string[];
  /**
   * `mine` is computed BY THE SERVER: it says whether this lock belongs to the
   * browser that is watching.
   *
   * The server used to hand out `session_id` to every viewer, which leaked the
   * very credential that proves ownership — reading the SSE stream was enough
   * to steal somebody else's seat. It now sends a boolean instead, so the
   * credential never leaves the server.
   */
  locked: { seatId: string; expiresAt: string; mine: boolean }[];
  updatedAt: string;
}

export function useSeatMapSSE(flightId: string | null) {
  const [data, setData] = useState<SeatMapEvent | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!flightId || typeof window === 'undefined' || typeof EventSource === 'undefined') return;

    const es = new EventSource(`/api/sse/ghe-ngoi?flightId=${flightId}`);
    esRef.current = es;

    es.addEventListener('seats', (e) => {
      try {
        setData(JSON.parse(e.data));
      } catch {
        // malformed JSON — ignore
      }
    });

    es.onerror = () => {
      // silent reconnect; EventSource handles retry automatically
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [flightId]);

  return { data };
}

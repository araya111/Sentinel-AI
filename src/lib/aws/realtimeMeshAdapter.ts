import {
  SentinelEvent,
  PatrollingResponder,
  IncidentEventType,
} from '@/types/sentinel';
import { VICTIM_INITIAL_COORDS } from '@/lib/mockData';
import { awsConfig, normalizeHost } from './config';

export type MeshTransportStatus =
  | 'APPSYNC_LIVE'
  | 'SSE_FALLBACK'
  | 'connecting'
  | 'disconnected';

export interface IRealtimeMeshAdapter {
  publishEvent(
    event: Partial<SentinelEvent> & { type: IncidentEventType }
  ): Promise<SentinelEvent>;
  subscribe(
    onEvent: (event: SentinelEvent) => void,
    onStatusChange?: (status: MeshTransportStatus) => void
  ): () => void;
  dispatchResponder(responder: PatrollingResponder): Promise<SentinelEvent>;
  resetDemo(): Promise<SentinelEvent>;
}

/**
 * Universal browser-safe Base64URL string encoder (zero native Buffer dependency)
 */
function toBase64Url(str: string): string {
  try {
    const b64 =
      typeof window !== 'undefined'
        ? window.btoa(unescape(encodeURIComponent(str)))
        : Buffer.from(str, 'utf8').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

class RealtimeMeshAdapter implements IRealtimeMeshAdapter {
  private seenEventIds = new Set<string>();

  private markAndCheckDedup(id?: string): boolean {
    if (!id) return false;
    if (this.seenEventIds.has(id)) {
      return true; // Already processed
    }
    this.seenEventIds.add(id);
    if (this.seenEventIds.size > 100) {
      const oldest = this.seenEventIds.values().next().value;
      if (oldest) this.seenEventIds.delete(oldest);
    }
    return false;
  }

  /**
   * Broadcasts an incident event to the real-time mesh bus via /api/events.
   * The server route concurrently publishes to SSE, AppSync Events, and DynamoDB.
   */
  public async publishEvent(
    partialEvent: Partial<SentinelEvent> & { type: IncidentEventType }
  ): Promise<SentinelEvent> {
    const eventId =
      partialEvent.eventId ||
      partialEvent.id ||
      `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const incidentId =
      partialEvent.incidentId ||
      partialEvent.id?.replace(/^evt_/, '') ||
      eventId.replace(/^evt_/, '');

    const payload: SentinelEvent = {
      id: eventId,
      eventId,
      incidentId,
      type: partialEvent.type,
      timestamp: partialEvent.timestamp || Date.now(),
      location: partialEvent.location || {
        lat: VICTIM_INITIAL_COORDS.lat,
        lng: VICTIM_INITIAL_COORDS.lng,
      },
      threatLevel: partialEvent.threatLevel || 'MEDIUM',
      triggerSource: partialEvent.triggerSource || 'MANUAL',
      transcriptSnippet: partialEvent.transcriptSnippet,
      responder: partialEvent.responder,
      audioBufferPreview: partialEvent.audioBufferPreview,
      notes: partialEvent.notes,
      snsMessageId: partialEvent.snsMessageId,
    };

    this.markAndCheckDedup(eventId);

    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Failed to publish event: ${response.statusText}`);
      }

      const data = await response.json();
      return (data.event as SentinelEvent) || payload;
    } catch (err) {
      console.warn('[RealtimeMeshAdapter] Publish POST error:', err);
      return payload;
    }
  }

  /**
   * Subscribes to real-time events via native AWS AppSync Events WebSocket,
   * with automatic fallback to Server-Sent Events (SSE) and watchdog auto-reconnect.
   */
  public subscribe(
    onEvent: (event: SentinelEvent) => void,
    onStatusChange?: (status: MeshTransportStatus) => void
  ): () => void {
    if (typeof window === 'undefined') {
      return () => {};
    }

    let isDisposed = false;
    let ws: WebSocket | null = null;
    let sseSource: EventSource | null = null;
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let handshakeTimer: ReturnType<typeof setTimeout> | null = null;
    let retryBackoffMs = 3000;
    let currentStatus: MeshTransportStatus = 'connecting';

    const setStatus = (status: MeshTransportStatus) => {
      if (isDisposed || currentStatus === status) return;
      currentStatus = status;
      onStatusChange?.(status);
    };

    const clearTimers = () => {
      if (watchdogTimer) clearTimeout(watchdogTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (handshakeTimer) clearTimeout(handshakeTimer);
      watchdogTimer = null;
      reconnectTimer = null;
      handshakeTimer = null;
    };

    const resetWatchdog = (timeoutMs = 300000) => {
      if (watchdogTimer) clearTimeout(watchdogTimer);
      // If no 'ka' (keep-alive) or data arrives before connectionTimeoutMs, trigger reconnect
      watchdogTimer = setTimeout(() => {
        if (isDisposed) return;
        console.warn('[AppSync WebSocket] Keep-alive watchdog expired; closing socket to reconnect');
        try {
          ws?.close();
        } catch {
          // ignore
        }
      }, timeoutMs);
    };

    // --- SSE Fallback Sub-Routine ---
    const startSseFallback = () => {
      if (isDisposed || sseSource) return;
      setStatus('SSE_FALLBACK');
      try {
        sseSource = new EventSource('/api/events');

        sseSource.onmessage = (e) => {
          if (isDisposed) return;
          try {
            const parsed = JSON.parse(e.data) as SentinelEvent;
            const dedupeKey = parsed.eventId || parsed.id;
            if (dedupeKey && !this.markAndCheckDedup(dedupeKey)) {
              parsed.id = parsed.id || parsed.eventId;
              parsed.eventId = parsed.eventId || parsed.id;
              parsed.incidentId = parsed.incidentId || parsed.id;
              onEvent(parsed);
            }
          } catch {
            // Heartbeat non-JSON
          }
        };

        sseSource.onerror = () => {
          if (isDisposed) return;
          if (currentStatus === 'SSE_FALLBACK') {
            setStatus('disconnected');
          }
        };
      } catch (err) {
        console.warn('[RealtimeMeshAdapter] SSE fallback init warning:', err);
      }
    };

    const stopSseFallback = () => {
      if (sseSource) {
        try {
          sseSource.close();
        } catch {
          // ignore
        }
        sseSource = null;
      }
    };

    // --- AppSync WebSocket Connection Routine ---
    const connectAppSync = () => {
      if (isDisposed) return;
      clearTimers();
      stopSseFallback(); // Ensure NO background SSE connection while AppSync connects or runs

      const realtimeDomain =
        awsConfig.appSync.realtimeDomain ||
        normalizeHost(process.env.NEXT_PUBLIC_APPSYNC_EVENTS_REALTIME_DOMAIN);
      const httpDomain =
        awsConfig.appSync.httpDomain ||
        normalizeHost(process.env.NEXT_PUBLIC_APPSYNC_EVENTS_HTTP_DOMAIN);
      const apiKey =
        awsConfig.appSync.apiKey ||
        process.env.NEXT_PUBLIC_APPSYNC_EVENTS_API_KEY ||
        '';
      const channel =
        awsConfig.appSync.channel ||
        process.env.NEXT_PUBLIC_APPSYNC_EVENTS_CHANNEL ||
        '/sentinel/live';

      // If configuration is missing, fall back immediately to SSE
      if (!realtimeDomain || !httpDomain || !apiKey) {
        console.warn('[RealtimeMeshAdapter] AppSync Events domain or API key unconfigured; using SSE fallback');
        startSseFallback();
        return;
      }

      setStatus('connecting');

      // 5-second handshake watchdog: if AppSync does not reach subscribe_success in 5s, start SSE fallback
      handshakeTimer = setTimeout(() => {
        if (isDisposed) return;
        if (currentStatus !== 'APPSYNC_LIVE') {
          console.warn('[RealtimeMeshAdapter] AppSync WebSocket handshake timed out (5s); activating SSE fallback');
          startSseFallback();
        }
      }, 5000);

      try {
        const wsUrl = `wss://${realtimeDomain}/event/realtime`;
        const headerObj = {
          host: httpDomain,
          'x-api-key': apiKey,
        };
        const authHeaderSubprotocol = `header-${toBase64Url(JSON.stringify(headerObj))}`;

        ws = new WebSocket(wsUrl, ['aws-appsync-event-ws', authHeaderSubprotocol]);

        ws.onopen = () => {
          if (isDisposed) {
            ws?.close();
            return;
          }
          // Protocol step 1: connection_init
          ws?.send(JSON.stringify({ type: 'connection_init' }));
        };

        ws.onmessage = (event) => {
          if (isDisposed) return;
          try {
            const msg = JSON.parse(event.data);

            if (msg.type === 'connection_ack') {
              const timeoutMs = msg.payload?.connectionTimeoutMs || 300000;
              resetWatchdog(timeoutMs);

              // Protocol step 2: subscribe
              const subId = `sub_${Date.now().toString(36)}`;
              ws?.send(
                JSON.stringify({
                  type: 'subscribe',
                  id: subId,
                  channel,
                  authorization: {
                    'x-api-key': apiKey,
                    host: httpDomain,
                  },
                })
              );
            } else if (msg.type === 'subscribe_success') {
              if (handshakeTimer) clearTimeout(handshakeTimer);
              stopSseFallback();
              setStatus('APPSYNC_LIVE');
              retryBackoffMs = 3000;
            } else if (msg.type === 'ka') {
              resetWatchdog();
            } else if (msg.type === 'data') {
              resetWatchdog();
              if (msg.event) {
                try {
                  const eventObj =
                    typeof msg.event === 'string'
                      ? (JSON.parse(msg.event) as SentinelEvent)
                      : (msg.event as SentinelEvent);

                  const dedupeKey = eventObj.eventId || eventObj.id;
                  if (dedupeKey && !this.markAndCheckDedup(dedupeKey)) {
                    eventObj.id = eventObj.id || eventObj.eventId;
                    eventObj.eventId = eventObj.eventId || eventObj.id;
                    eventObj.incidentId = eventObj.incidentId || eventObj.id;
                    onEvent(eventObj);
                  }
                } catch (parseErr) {
                  console.warn('[AppSync WebSocket] Failed to parse event payload:', parseErr);
                }
              }
            } else if (
              msg.type === 'error' ||
              msg.type === 'subscribe_error' ||
              msg.type === 'connection_error'
            ) {
              console.warn('[AppSync WebSocket] Protocol error message:', msg);
              startSseFallback();
            }
          } catch (jsonErr) {
            console.warn('[AppSync WebSocket] Non-JSON message received:', jsonErr);
          }
        };

        ws.onerror = (err) => {
          if (isDisposed) return;
          console.warn('[AppSync WebSocket] Socket error:', err);
        };

        ws.onclose = () => {
          if (isDisposed) return;
          // Only start SSE fallback if AppSync is completely disconnected
          if (currentStatus !== 'APPSYNC_LIVE') {
            startSseFallback();
          }

          // Exponential backoff retry: 3s -> 6s -> 15s -> 30s
          reconnectTimer = setTimeout(() => {
            if (!isDisposed) {
              connectAppSync();
            }
          }, retryBackoffMs);

          retryBackoffMs =
            retryBackoffMs === 3000
              ? 6000
              : retryBackoffMs === 6000
              ? 15000
              : 30000;
        };
      } catch (wsErr) {
        console.warn('[RealtimeMeshAdapter] WebSocket construction error:', wsErr);
        startSseFallback();
      }
    };

    connectAppSync();

    return () => {
      isDisposed = true;
      clearTimers();
      stopSseFallback();
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
        ws = null;
      }
      setStatus('disconnected');
    };
  }

  public async dispatchResponder(
    responder: PatrollingResponder
  ): Promise<SentinelEvent> {
    return this.publishEvent({
      type: 'RESPONDER_DISPATCHED',
      threatLevel: 'HIGH',
      triggerSource: 'MANUAL',
      responder: {
        id: responder.id,
        name: responder.name,
        eta: responder.etaDisplay,
        contactPhone: responder.contactPhone,
      },
      notes: `Acknowledge & Dispatch executed. ${responder.name} dispatched with ETA ${responder.etaDisplay}.`,
    });
  }

  public async resetDemo(): Promise<SentinelEvent> {
    return this.publishEvent({
      type: 'INCIDENT_RESET',
      threatLevel: 'LOW',
      triggerSource: 'MANUAL',
      notes: 'Demo incident reset to nominal state.',
    });
  }
}

export const realtimeMeshAdapter: IRealtimeMeshAdapter = new RealtimeMeshAdapter();

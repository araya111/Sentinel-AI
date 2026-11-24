import { SentinelEvent, PatrollingResponder, IncidentEventType } from '@/types/sentinel';
import { PATROLLING_RESPONDERS, VICTIM_INITIAL_COORDS } from '@/lib/mockData';
import { awsConfig } from './config';

export interface IRealtimeMeshAdapter {
  publishEvent(
    event: Partial<SentinelEvent> & { type: IncidentEventType }
  ): Promise<SentinelEvent>;
  subscribe(
    onEvent: (event: SentinelEvent) => void,
    onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected') => void
  ): () => void;
  dispatchResponder(responder: PatrollingResponder): Promise<SentinelEvent>;
  resetDemo(): Promise<SentinelEvent>;
}

class RealtimeMeshAdapter implements IRealtimeMeshAdapter {
  /**
   * Broadcasts an incident event to the real-time mesh bus.
   */
  public async publishEvent(
    partialEvent: Partial<SentinelEvent> & { type: IncidentEventType }
  ): Promise<SentinelEvent> {
    const payload: SentinelEvent = {
      id: partialEvent.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: partialEvent.type,
      timestamp: partialEvent.timestamp || Date.now(),
      location: partialEvent.location || {
        lat: VICTIM_INITIAL_COORDS[1],
        lng: VICTIM_INITIAL_COORDS[0],
      },
      threatLevel: partialEvent.threatLevel || 'MEDIUM',
      triggerSource: partialEvent.triggerSource || 'MANUAL',
      transcriptSnippet: partialEvent.transcriptSnippet,
      responder: partialEvent.responder,
      audioBufferPreview: partialEvent.audioBufferPreview,
      notes: partialEvent.notes,
    };

    // In Phase 1 (mock mode) or local stage mode, POST to the Next.js API route
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
      return data.event as SentinelEvent;
    } catch (err) {
      console.error('[RealtimeMeshAdapter] Publish error:', err);
      return payload;
    }
  }

  /**
   * Subscribes to real-time events via Server-Sent Events (SSE) with auto-reconnect.
   */
  public subscribe(
    onEvent: (event: SentinelEvent) => void,
    onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected') => void
  ): () => void {
    if (typeof window === 'undefined') {
      return () => {};
    }

    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isDisposed = false;

    const connect = () => {
      if (isDisposed) return;
      onStatusChange?.('connecting');

      eventSource = new EventSource('/api/events');

      eventSource.onopen = () => {
        if (isDisposed) {
          eventSource?.close();
          return;
        }
        onStatusChange?.('connected');
      };

      eventSource.onmessage = (messageEvent) => {
        try {
          const parsed = JSON.parse(messageEvent.data) as SentinelEvent;
          onEvent(parsed);
        } catch {
          // Ignore comments / non-JSON heartbeats
        }
      };

      eventSource.onerror = () => {
        if (isDisposed) return;
        onStatusChange?.('disconnected');
        eventSource?.close();
        eventSource = null;

        // Auto-reconnect with 3s backoff
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      onStatusChange?.('disconnected');
    };
  }

  public async dispatchResponder(responder: PatrollingResponder): Promise<SentinelEvent> {
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

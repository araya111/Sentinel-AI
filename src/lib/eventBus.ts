import { SentinelEvent } from '@/types/sentinel';

type SSEController = ReadableStreamDefaultController<Uint8Array>;

interface GlobalSentinelState {
  subscribers: Set<SSEController>;
  recentEvents: SentinelEvent[];
  activeIncident: SentinelEvent | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __sentinel_bus__: GlobalSentinelState | undefined;
}

const encoder = new TextEncoder();

function getGlobalBus(): GlobalSentinelState {
  if (!globalThis.__sentinel_bus__) {
    globalThis.__sentinel_bus__ = {
      subscribers: new Set<SSEController>(),
      recentEvents: [],
      activeIncident: null,
    };
  }
  return globalThis.__sentinel_bus__;
}

export function subscribeSSE(controller: SSEController): () => void {
  const bus = getGlobalBus();
  bus.subscribers.add(controller);

  return () => {
    bus.subscribers.delete(controller);
  };
}

export function broadcastSSE(event: SentinelEvent): void {
  const bus = getGlobalBus();

  // Maintain circular buffer of latest 20 events
  bus.recentEvents.unshift(event);
  if (bus.recentEvents.length > 20) {
    bus.recentEvents.pop();
  }

  // Track active incident state
  if (event.type === 'INCIDENT_RESET') {
    bus.activeIncident = null;
  } else if (
    event.type === 'STEALTH_TRIGGERED' ||
    event.type === 'THREAT_ESCALATED' ||
    event.type === 'PHONE_DROP_DETECTED' ||
    event.type === 'RESPONDER_DISPATCHED'
  ) {
    bus.activeIncident = event;
  }

  const payload = `data: ${JSON.stringify(event)}\n\n`;
  const bytes = encoder.encode(payload);

  const deadControllers: SSEController[] = [];

  for (const controller of bus.subscribers) {
    try {
      controller.enqueue(bytes);
    } catch {
      deadControllers.push(controller);
    }
  }

  for (const dead of deadControllers) {
    bus.subscribers.delete(dead);
  }
}

export function sendHeartbeat(): void {
  const bus = getGlobalBus();
  const pingBytes = encoder.encode(': ping\n\n');
  const deadControllers: SSEController[] = [];

  for (const controller of bus.subscribers) {
    try {
      controller.enqueue(pingBytes);
    } catch {
      deadControllers.push(controller);
    }
  }

  for (const dead of deadControllers) {
    bus.subscribers.delete(dead);
  }
}

export function getRecentEvents(): SentinelEvent[] {
  return getGlobalBus().recentEvents;
}

export function getActiveIncident(): SentinelEvent | null {
  return getGlobalBus().activeIncident;
}

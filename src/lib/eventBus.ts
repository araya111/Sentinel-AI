import { SentinelEvent } from '@/types/sentinel';
import { sanitizeRoom } from './room';

type SSEController = ReadableStreamDefaultController<Uint8Array>;

interface SSESubscriber {
  controller: SSEController;
  room: string;
}

interface GlobalSentinelState {
  subscribers: Set<SSESubscriber>;
  recentEvents: SentinelEvent[];
  activeIncidentsByRoom: Map<string, SentinelEvent>;
}

declare global {
  // eslint-disable-next-line no-var
  var __sentinel_bus__: GlobalSentinelState | undefined;
}

const encoder = new TextEncoder();

function getGlobalBus(): GlobalSentinelState {
  if (!globalThis.__sentinel_bus__) {
    globalThis.__sentinel_bus__ = {
      subscribers: new Set<SSESubscriber>(),
      recentEvents: [],
      activeIncidentsByRoom: new Map<string, SentinelEvent>(),
    };
  }
  return globalThis.__sentinel_bus__;
}

export function subscribeSSE(
  controller: SSEController,
  rawRoom = 'live'
): () => void {
  const bus = getGlobalBus();
  const room = sanitizeRoom(rawRoom);
  const subscriber: SSESubscriber = { controller, room };
  bus.subscribers.add(subscriber);

  return () => {
    bus.subscribers.delete(subscriber);
  };
}

export function broadcastSSE(event: SentinelEvent): void {
  const bus = getGlobalBus();
  const eventRoom = sanitizeRoom(event.room);

  // Maintain circular buffer of latest 30 events
  bus.recentEvents.unshift(event);
  if (bus.recentEvents.length > 30) {
    bus.recentEvents.pop();
  }

  // Track active incident state per room
  if (event.type === 'INCIDENT_RESET') {
    bus.activeIncidentsByRoom.delete(eventRoom);
  } else if (
    event.type === 'STEALTH_TRIGGERED' ||
    event.type === 'THREAT_ESCALATED' ||
    event.type === 'PHONE_DROP_DETECTED' ||
    event.type === 'RESPONDER_DISPATCHED'
  ) {
    bus.activeIncidentsByRoom.set(eventRoom, event);
  }

  const payload = `data: ${JSON.stringify(event)}\n\n`;
  const bytes = encoder.encode(payload);

  const deadSubscribers: SSESubscriber[] = [];

  for (const sub of bus.subscribers) {
    // Only deliver event if subscriber is in the matching room
    if (sub.room === eventRoom) {
      try {
        sub.controller.enqueue(bytes);
      } catch {
        deadSubscribers.push(sub);
      }
    }
  }

  for (const dead of deadSubscribers) {
    bus.subscribers.delete(dead);
  }
}

export function sendHeartbeat(): void {
  const bus = getGlobalBus();
  const pingBytes = encoder.encode(': ping\n\n');
  const deadSubscribers: SSESubscriber[] = [];

  for (const sub of bus.subscribers) {
    try {
      sub.controller.enqueue(pingBytes);
    } catch {
      deadSubscribers.push(sub);
    }
  }

  for (const dead of deadSubscribers) {
    bus.subscribers.delete(dead);
  }
}

export function getRecentEvents(rawRoom?: string): SentinelEvent[] {
  const bus = getGlobalBus();
  if (!rawRoom) return bus.recentEvents;
  const room = sanitizeRoom(rawRoom);
  return bus.recentEvents.filter((e) => sanitizeRoom(e.room) === room);
}

export function getActiveIncident(rawRoom = 'live'): SentinelEvent | null {
  const bus = getGlobalBus();
  const room = sanitizeRoom(rawRoom);
  return bus.activeIncidentsByRoom.get(room) || null;
}

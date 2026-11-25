export interface QueuedSosBeacon {
  eventId: string;
  incidentId: string;
  room: string;
  triggerType: string;
  threatLevel: string;
  coordinates: { lat: number; lng: number };
  locationLabel: string;
  queuedAt: number;
}

const STORAGE_KEY = 'sentinel_offline_sos_queue_v1';

export function getQueuedSosBeacons(): QueuedSosBeacon[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineSos(beacon: QueuedSosBeacon): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getQueuedSosBeacons();
    current.push(beacon);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (err) {
    console.warn('[OfflineQueue] Failed to enqueue SOS beacon:', err);
  }
}

export function clearQueuedSosBeacons(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function removeQueuedSosBeacon(eventId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getQueuedSosBeacons();
    const updated = current.filter((b) => b.eventId !== eventId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

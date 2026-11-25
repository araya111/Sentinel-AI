export type IncidentEventType =
  | 'STEALTH_TRIGGERED'
  | 'THREAT_ESCALATED'
  | 'PHONE_DROP_DETECTED'
  | 'RESPONDER_DISPATCHED'
  | 'INCIDENT_RESET'
  | 'SOS_FALLBACK_SENT'
  | 'LOCATION_PING';

export type ThreatLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type TriggerSource =
  | 'STEALTH_PHRASE'
  | 'AI_AUDIO_ESCALATION'
  | 'ACCELEROMETER_DROP'
  | 'MANUAL';

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Universal helper guaranteeing [lng, lat] GeoJSON format.
 */
export function toLngLat(
  coord: Coordinates | [number, number]
): [number, number] {
  if (Array.isArray(coord)) {
    return coord;
  }
  return [coord.lng, coord.lat];
}

/**
 * Universal helper guaranteeing { lat, lng } object format.
 */
export function toLatLng(
  coord: Coordinates | [number, number]
): Coordinates {
  if (Array.isArray(coord)) {
    return { lat: coord[1], lng: coord[0] };
  }
  return coord;
}

export interface RouteOption {
  id: 'standard' | 'brightest';
  name: string;
  summary: string;
  lightingScore: number; // 0 - 100
  safetyScore?: number; // 0 - 100
  durationMinutes: number;
  distanceMeters: number;
  safeHavensCount: number;
  isRecommended: boolean;
  coordinates: [number, number][]; // [lng, lat] GeoJSON format
  geometry?: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

export interface SafeHaven {
  id: string;
  name: string;
  category: 'pharmacy' | 'cafe' | 'security_post' | 'station';
  address: string;
  coordinates: [number, number]; // [lng, lat]
  lat?: number;
  lng?: number;
  is24Seven: boolean;
  open24x7?: boolean;
  verified: boolean;
  phone: string;
  description: string;
  distanceMeters: number;
  lightingScore?: number;
}

export interface PatrollingResponder {
  id: string;
  name: string;
  role: string;
  coordinates: [number, number]; // [lng, lat]
  lat?: number;
  lng?: number;
  etaSeconds: number;
  etaDisplay: string;
  status: 'patrolling' | 'dispatched' | 'available';
  contactPhone: string;
}

export interface ResponderInfo {
  id: string;
  name: string;
  eta: string;
  contactPhone?: string;
}

export interface SentinelEvent {
  id: string; // compatibility alias (maps to eventId or incidentId)
  eventId: string;
  incidentId: string;
  type: IncidentEventType;
  timestamp: number;
  location: Coordinates;
  coordinates?: Coordinates;
  heading?: number;
  mode?: 'WALK_SIM' | 'DEVICE_GPS';
  room?: string;
  threatLevel: ThreatLevel;
  triggerSource: TriggerSource;
  transcriptSnippet?: string;
  responder?: ResponderInfo;
  audioBufferPreview?: number[];
  notes?: string;
  snsMessageId?: string;
}

export interface DispatchAck {
  responderId: string;
  responderName: string;
  eta: string;
  dispatchedAt: number;
  message: string;
}

export interface ActiveIncidentState {
  isActive: boolean;
  latestEvent: SentinelEvent | null;
  history: SentinelEvent[];
  dispatchedResponder: ResponderInfo | null;
}

export interface PersistedIncident {
  pk: string; // "INCIDENT"
  sk: string; // "INC#<id>"
  incidentId: string;
  room?: string;
  status: 'ACTIVE' | 'DISPATCHED' | 'RESOLVED';
  threatLevel: ThreatLevel;
  triggerSource: TriggerSource;
  location: Coordinates;
  transcript?: string;
  detectedCue?: string;
  dispatchedResponder?: ResponderInfo;
  snsMessageId?: string;
  createdAt: string;
  updatedAt: string;
}

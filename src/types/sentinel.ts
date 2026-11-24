export type IncidentEventType =
  | 'STEALTH_TRIGGERED'
  | 'THREAT_ESCALATED'
  | 'PHONE_DROP_DETECTED'
  | 'RESPONDER_DISPATCHED'
  | 'INCIDENT_RESET';

export type ThreatLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type TriggerSource =
  | 'STEALTH_PHRASE'
  | 'AI_AUDIO_ESCALATION'
  | 'ACCELEROMETER_DROP'
  | 'MANUAL';

export interface RouteOption {
  id: 'standard' | 'brightest';
  name: string;
  summary: string;
  lightingScore: number; // 0 - 100
  durationMinutes: number;
  distanceMeters: number;
  safeHavensCount: number;
  isRecommended: boolean;
  coordinates: [number, number][]; // [lng, lat] GeoJSON format
}

export interface SafeHaven {
  id: string;
  name: string;
  category: 'pharmacy' | 'cafe' | 'security_post' | 'station';
  address: string;
  coordinates: [number, number]; // [lng, lat]
  is24Seven: boolean;
  verified: boolean;
  phone: string;
  description: string;
  distanceMeters: number;
}

export interface PatrollingResponder {
  id: string;
  name: string;
  role: string;
  coordinates: [number, number]; // [lng, lat]
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
  id: string;
  type: IncidentEventType;
  timestamp: number;
  location: {
    lat: number;
    lng: number;
  };
  threatLevel: ThreatLevel;
  triggerSource: TriggerSource;
  transcriptSnippet?: string;
  responder?: ResponderInfo;
  audioBufferPreview?: number[];
  notes?: string;
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

import {
  RouteOption,
  SafeHaven,
  PatrollingResponder,
  Coordinates,
  toLngLat,
  toLatLng,
} from '@/types/sentinel';

export { toLngLat, toLatLng };

// Canonical Street-Routable Campus Corridor (UC Berkeley South to North Campus)
// Origin: Telegraph Ave & Dwight Way (Mapped pedestrian sidewalk)
export const CAMPUS_ORIGIN: Coordinates = { lat: 37.8652, lng: -122.2587 };
// Destination: Euclid Ave & Hearst Ave / North Gate
export const CAMPUS_DESTINATION: Coordinates = { lat: 37.8756, lng: -122.2601 };
// Initial Victim Coordinate on corridor
export const VICTIM_INITIAL_COORDS: Coordinates = { lat: 37.8702, lng: -122.2589 };

export const STANDARD_ROUTE: RouteOption = {
  id: 'standard',
  name: 'Standard Direct Shortcut',
  summary: 'Shortest unlit shortcut through poorly lit alleyways & grove',
  lightingScore: 42,
  safetyScore: 38,
  durationMinutes: 11,
  distanceMeters: 920,
  safeHavensCount: 0,
  isRecommended: false,
  coordinates: [
    [-122.2587, 37.8652],
    [-122.2588, 37.8675],
    [-122.2591, 37.8701],
    [-122.2596, 37.8724],
    [-122.2600, 37.8742],
    [-122.2601, 37.8756],
  ],
  geometry: {
    type: 'LineString',
    coordinates: [
      [-122.2587, 37.8652],
      [-122.2588, 37.8675],
      [-122.2591, 37.8701],
      [-122.2596, 37.8724],
      [-122.2600, 37.8742],
      [-122.2601, 37.8756],
    ],
  },
};

export const BRIGHTEST_ROUTE: RouteOption = {
  id: 'brightest',
  name: 'Brightest Protected Route',
  summary: 'LED-illuminated arterial corridor passing 3 verified 24/7 Safe Havens',
  lightingScore: 94,
  safetyScore: 96,
  durationMinutes: 13,
  distanceMeters: 1140,
  safeHavensCount: 3,
  isRecommended: true,
  coordinates: [
    [-122.2587, 37.8652],
    [-122.2575, 37.8672],
    [-122.2574, 37.8698],
    [-122.2575, 37.8722],
    [-122.2580, 37.8740],
    [-122.2592, 37.8752],
    [-122.2601, 37.8756],
  ],
  geometry: {
    type: 'LineString',
    coordinates: [
      [-122.2587, 37.8652],
      [-122.2575, 37.8672],
      [-122.2574, 37.8698],
      [-122.2575, 37.8722],
      [-122.2580, 37.8740],
      [-122.2592, 37.8752],
      [-122.2601, 37.8756],
    ],
  },
};

export const SAFE_HAVENS: SafeHaven[] = [
  {
    id: 'haven-pharmacy',
    name: '24/7 Campus Pharmacy',
    category: 'pharmacy',
    address: '2350 Telegraph Ave',
    coordinates: [-122.2574, 37.8698],
    lat: 37.8698,
    lng: -122.2574,
    is24Seven: true,
    open24x7: true,
    verified: true,
    phone: '+1 (510) 642-1000',
    description: 'Brightly lit retail haven with security vestibule and direct 911 dispatch button.',
    distanceMeters: 140,
    lightingScore: 95,
  },
  {
    id: 'haven-cafe',
    name: 'NightOwl Cafe & Student Study',
    category: 'cafe',
    address: '2490 Bancroft Way',
    coordinates: [-122.2575, 37.8722],
    lat: 37.8722,
    lng: -122.2575,
    is24Seven: true,
    open24x7: true,
    verified: true,
    phone: '+1 (510) 642-2000',
    description: 'Continuous student presence, CCTV monitoring, and certified safe haven partner.',
    distanceMeters: 310,
    lightingScore: 92,
  },
  {
    id: 'haven-security',
    name: 'North Gate Security Booth',
    category: 'security_post',
    address: 'Hearst Ave & Euclid Gate',
    coordinates: [-122.2601, 37.8756],
    lat: 37.8756,
    lng: -122.2601,
    is24Seven: true,
    open24x7: true,
    verified: true,
    phone: '+1 (510) 642-6765',
    description: 'Stationary university police kiosk staffed 24/7 with emergency beacon lights.',
    distanceMeters: 490,
    lightingScore: 98,
  },
];

export const PATROLLING_RESPONDERS: PatrollingResponder[] = [
  {
    id: 'resp-unit-04',
    name: 'Campus Security Unit 04',
    role: 'Patrol Vehicle (Mobile Patrol)',
    coordinates: [-122.2618, 37.8734],
    lat: 37.8734,
    lng: -122.2618,
    etaSeconds: 75,
    etaDisplay: '1m 15s',
    status: 'patrolling',
    contactPhone: '+1 (510) 555-0104',
  },
  {
    id: 'resp-volunteer-rohan',
    name: 'Peer Safety Volunteer — Rohan',
    role: 'Foot Escort & Certified First Responder',
    coordinates: [-122.2589, 37.8712],
    lat: 37.8712,
    lng: -122.2589,
    etaSeconds: 100,
    etaDisplay: '1m 40s',
    status: 'patrolling',
    contactPhone: '+1 (510) 555-0188',
  },
  {
    id: 'resp-haven-cafe',
    name: 'Safe Haven — NightOwl Staff Escort',
    role: 'Stationary Responder & Safe Haven Marshall',
    coordinates: [-122.2575, 37.8722],
    lat: 37.8722,
    lng: -122.2575,
    etaSeconds: 115,
    etaDisplay: '1m 55s',
    status: 'available',
    contactPhone: '+1 (510) 555-0199',
  },
];

export const VOICE_SCRIPTS = {
  stealthPhrase: 'blue keys on the table',
  calm: "Hey! Just saw your location—you're about two minutes past the pharmacy, right? Keep talking to me until you hit the main gate.",
  escalated: "Hey—who is that in the background? I have your live GPS right here and I'm patching campus security onto this line right now. Back off!",
  threatKeywords: [
    'hey stop',
    'give me',
    'who is there',
    'leave me alone',
    'stop following me',
    'get away',
    'back off',
    'what do you want',
    'stop',
    'help',
  ],
};

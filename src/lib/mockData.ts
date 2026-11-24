import { RouteOption, SafeHaven, PatrollingResponder } from '@/types/sentinel';

// Campus Reference Coordinates (UC Berkeley / Telegraph to North Gate Corridor)
export const CAMPUS_ORIGIN: [number, number] = [-122.2585, 37.8688]; // [lng, lat]
export const CAMPUS_DESTINATION: [number, number] = [-122.2612, 37.8762]; // [lng, lat]
export const VICTIM_INITIAL_COORDS: [number, number] = [-122.2598, 37.8722]; // [lng, lat]

export const STANDARD_ROUTE: RouteOption = {
  id: 'standard',
  name: 'Standard Direct Route',
  summary: 'Shortest path via Sather Lane & Eucalyptus Grove',
  lightingScore: 42,
  durationMinutes: 11,
  distanceMeters: 920,
  safeHavensCount: 0,
  isRecommended: false,
  coordinates: [
    [-122.2585, 37.8688],
    [-122.2588, 37.8701],
    [-122.2592, 37.8715],
    [-122.2599, 37.8728],
    [-122.2604, 37.8744],
    [-122.2612, 37.8762],
  ],
};

export const BRIGHTEST_ROUTE: RouteOption = {
  id: 'brightest',
  name: 'Brightest Protected Route',
  summary: 'LED-illuminated arterial corridor passing 3 verified 24/7 Safe Havens',
  lightingScore: 94,
  durationMinutes: 13,
  distanceMeters: 1140,
  safeHavensCount: 3,
  isRecommended: true,
  coordinates: [
    [-122.2585, 37.8688],
    [-122.2576, 37.8694],
    [-122.2574, 37.8708],
    [-122.2575, 37.8724],
    [-122.2582, 37.8739],
    [-122.2595, 37.8751],
    [-122.2612, 37.8762],
  ],
};

export const SAFE_HAVENS: SafeHaven[] = [
  {
    id: 'haven-pharmacy',
    name: '24/7 Campus Pharmacy',
    category: 'pharmacy',
    address: '2350 Telegraph Ave, Ste 101',
    coordinates: [-122.2575, 37.8708],
    is24Seven: true,
    verified: true,
    phone: '+1 (510) 642-1000',
    description: 'Brightly lit retail haven with security vestibule and direct 911 dispatch button.',
    distanceMeters: 140,
  },
  {
    id: 'haven-cafe',
    name: 'NightOwl Cafe & Student Study',
    category: 'cafe',
    address: '2490 Bancroft Way',
    coordinates: [-122.2578, 37.8731],
    is24Seven: true,
    verified: true,
    phone: '+1 (510) 642-2000',
    description: 'Continuous student presence, CCTV monitoring, and certified safe haven partner.',
    distanceMeters: 310,
  },
  {
    id: 'haven-security',
    name: 'North Gate Security Booth',
    category: 'security_post',
    address: 'Hearst Ave & Euclid Gate',
    coordinates: [-122.2608, 37.8758],
    is24Seven: true,
    verified: true,
    phone: '+1 (510) 642-6765',
    description: 'Stationary university police kiosk staffed 24/7 with emergency beacon lights.',
    distanceMeters: 490,
  },
];

export const PATROLLING_RESPONDERS: PatrollingResponder[] = [
  {
    id: 'resp-unit-04',
    name: 'Campus Security Unit 04',
    role: 'Patrol Vehicle (Mobile Patrol)',
    coordinates: [-122.2618, 37.8734],
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
    etaSeconds: 100,
    etaDisplay: '1m 40s',
    status: 'patrolling',
    contactPhone: '+1 (510) 555-0188',
  },
  {
    id: 'resp-haven-cafe',
    name: 'Safe Haven — NightOwl Staff Escort',
    role: 'Stationary Responder & Safe Haven Marshall',
    coordinates: [-122.2578, 37.8731],
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

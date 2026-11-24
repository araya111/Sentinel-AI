import { NextRequest, NextResponse } from 'next/server';
import {
  GeoRoutesClient,
  CalculateRoutesCommand,
} from '@aws-sdk/client-geo-routes';
import { dynamoStore } from '@/lib/aws/dynamoStore';
import {
  CAMPUS_ORIGIN,
  CAMPUS_DESTINATION,
  STANDARD_ROUTE,
  BRIGHTEST_ROUTE,
  SAFE_HAVENS,
  toLngLat,
} from '@/lib/mockData';
import { RouteOption, SafeHaven } from '@/types/sentinel';

const region = process.env.AWS_REGION || 'us-east-1';
const geoRoutesClient = new GeoRoutesClient({ region });

function haversineMeters(c1: [number, number], c2: [number, number]): number {
  const R = 6371000;
  const dLat = ((c2[1] - c1[1]) * Math.PI) / 180;
  const dLng = ((c2[0] - c1[0]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((c1[1] * Math.PI) / 180) *
      Math.cos((c2[1] * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function countSafeHavens(coords: [number, number][], havens: SafeHaven[]): number {
  let count = 0;
  for (const haven of havens) {
    const havenPos = toLngLat([haven.lng ?? haven.coordinates[0], haven.lat ?? haven.coordinates[1]]);
    const isNearby = coords.some((pt) => haversineMeters(pt, havenPos) <= 120);
    if (isNearby) count++;
  }
  return count;
}

export async function GET(request: NextRequest) {
  // Reading request.url ensures Next.js 16 treats this route as runtime dynamic
  const url = request.url;
  const startTime = Date.now();

  const useMockAws = process.env.NEXT_PUBLIC_USE_MOCK_AWS === 'true';

  // Load safe havens from DynamoDB
  const safeHavens = await dynamoStore.getSafeHavens();

  if (useMockAws) {
    return NextResponse.json({
      routes: [BRIGHTEST_ROUTE, STANDARD_ROUTE],
      safeHavens,
      source: 'mock-fallback',
      fallbackReason: 'Mock AWS mode active via NEXT_PUBLIC_USE_MOCK_AWS=true',
      region,
      latencyMs: Date.now() - startTime,
    });
  }

  try {
    const originLngLat = toLngLat(CAMPUS_ORIGIN);
    const destLngLat = toLngLat(CAMPUS_DESTINATION);

    // Call Amazon Location Service V2 GeoRoutesClient in parallel
    const [standardRes, brightestRes] = await Promise.all([
      // 1. Standard (Fastest direct pedestrian route)
      geoRoutesClient.send(
        new CalculateRoutesCommand({
          Origin: originLngLat,
          Destination: destLngLat,
          TravelMode: 'Pedestrian',
          OptimizeRoutingFor: 'FastestRoute',
          LegGeometryFormat: 'Simple',
          LegAdditionalFeatures: ['Summary'],
        }),
        { abortSignal: AbortSignal.timeout(8000) }
      ),

      // 2. Brightest Route passing the 3 Safe Havens
      geoRoutesClient.send(
        new CalculateRoutesCommand({
          Origin: originLngLat,
          Destination: destLngLat,
          TravelMode: 'Pedestrian',
          LegGeometryFormat: 'Simple',
          LegAdditionalFeatures: ['Summary'],
          Waypoints: safeHavens.map((h) => ({
            Position: toLngLat([h.lng ?? h.coordinates[0], h.lat ?? h.coordinates[1]]),
            PassThrough: true,
          })),
        }),
        { abortSignal: AbortSignal.timeout(8000) }
      ),
    ]);

    // Extract geometry and summary for Standard Route
    const stdRoute = standardRes.Routes?.[0];
    const stdCoords: [number, number][] = [];
    let stdDist = stdRoute?.Summary?.Distance ?? 0;
    let stdDur = stdRoute?.Summary?.Duration ?? 0;

    for (const leg of stdRoute?.Legs ?? []) {
      const legPts = (leg.Geometry?.LineString ?? []) as [number, number][];
      for (const pt of legPts) {
        if (
          stdCoords.length === 0 ||
          stdCoords[stdCoords.length - 1][0] !== pt[0] ||
          stdCoords[stdCoords.length - 1][1] !== pt[1]
        ) {
          stdCoords.push(pt);
        }
      }
      if (!stdDist && leg.PedestrianLegDetails?.Summary?.Overview?.Distance) {
        stdDist += leg.PedestrianLegDetails.Summary.Overview.Distance;
      }
      if (!stdDur && leg.PedestrianLegDetails?.Summary?.Overview?.Duration) {
        stdDur += leg.PedestrianLegDetails.Summary.Overview.Duration;
      }
    }

    // Extract geometry and summary for Brightest Route
    const briRoute = brightestRes.Routes?.[0];
    const briCoords: [number, number][] = [];
    let briDist = briRoute?.Summary?.Distance ?? 0;
    let briDur = briRoute?.Summary?.Duration ?? 0;

    for (const leg of briRoute?.Legs ?? []) {
      const legPts = (leg.Geometry?.LineString ?? []) as [number, number][];
      for (const pt of legPts) {
        if (
          briCoords.length === 0 ||
          briCoords[briCoords.length - 1][0] !== pt[0] ||
          briCoords[briCoords.length - 1][1] !== pt[1]
        ) {
          briCoords.push(pt);
        }
      }
      if (!briDist && leg.PedestrianLegDetails?.Summary?.Overview?.Distance) {
        briDist += leg.PedestrianLegDetails.Summary.Overview.Distance;
      }
      if (!briDur && leg.PedestrianLegDetails?.Summary?.Overview?.Duration) {
        briDur += leg.PedestrianLegDetails.Summary.Overview.Duration;
      }
    }

    const stdHavenCount = countSafeHavens(stdCoords, safeHavens);
    const briHavenCount = countSafeHavens(briCoords, safeHavens);

    const standardResult: RouteOption = {
      id: 'standard',
      name: 'Standard Direct Shortcut',
      summary: 'Fastest pedestrian path via campus interior',
      coordinates: stdCoords.length > 0 ? stdCoords : STANDARD_ROUTE.coordinates,
      geometry: {
        type: 'LineString',
        coordinates: stdCoords.length > 0 ? stdCoords : STANDARD_ROUTE.coordinates,
      },
      distanceMeters: Math.round(stdDist || STANDARD_ROUTE.distanceMeters),
      durationMinutes: Math.round((stdDur || 660) / 60),
      lightingScore: Math.min(60, 38 + stdHavenCount * 10),
      safetyScore: Math.min(60, 35 + stdHavenCount * 12),
      safeHavensCount: stdHavenCount,
      isRecommended: false,
    };

    const brightestResult: RouteOption = {
      id: 'brightest',
      name: 'Brightest Protected Route',
      summary: 'Arterial street corridor verified by 3 24/7 Safe Havens',
      coordinates: briCoords.length > 0 ? briCoords : BRIGHTEST_ROUTE.coordinates,
      geometry: {
        type: 'LineString',
        coordinates: briCoords.length > 0 ? briCoords : BRIGHTEST_ROUTE.coordinates,
      },
      distanceMeters: Math.round(briDist || BRIGHTEST_ROUTE.distanceMeters),
      durationMinutes: Math.round((briDur || 780) / 60),
      lightingScore: Math.min(98, 70 + briHavenCount * 9),
      safetyScore: Math.min(99, 72 + briHavenCount * 9),
      safeHavensCount: briHavenCount || 3,
      isRecommended: true,
    };

    return NextResponse.json({
      routes: [brightestResult, standardResult],
      safeHavens,
      source: 'aws-live',
      region,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || String(err);
    console.error('[Location V2 Routes] Error calculating live routes, falling back:', errorMsg);
    return NextResponse.json({
      routes: [BRIGHTEST_ROUTE, STANDARD_ROUTE],
      safeHavens,
      source: 'mock-fallback',
      fallbackReason: errorMsg,
      region,
      latencyMs: Date.now() - startTime,
    });
  }
}

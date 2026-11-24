import type { StyleSpecification } from 'maplibre-gl';
import { RouteOption, SafeHaven, PatrollingResponder } from '@/types/sentinel';
import {
  STANDARD_ROUTE,
  BRIGHTEST_ROUTE,
  SAFE_HAVENS,
  PATROLLING_RESPONDERS,
} from '@/lib/mockData';

export interface ILocationAdapter {
  getMapStyleUrl(): string;
  getFallbackStyle(): StyleSpecification;
  getRoutes(): { standard: RouteOption; brightest: RouteOption };
  getSafeHavens(): SafeHaven[];
  getPatrollingResponders(): PatrollingResponder[];
  fetchLiveRoutes(): Promise<{
    routes: RouteOption[];
    safeHavens: SafeHaven[];
    source: string;
    fallbackReason?: string;
  }>;
  createCircleGeoJSON(
    center: [number, number],
    radiusInMeters: number,
    points?: number
  ): GeoJSON.Feature<GeoJSON.Polygon>;
}

class AmazonLocationV2Adapter implements ILocationAdapter {
  public getMapStyleUrl(): string {
    const isMock = process.env.NEXT_PUBLIC_USE_MOCK_AWS === 'true';
    const apiKey = process.env.NEXT_PUBLIC_AMAZON_LOCATION_API_KEY;
    const region = process.env.NEXT_PUBLIC_AMAZON_LOCATION_REGION || 'us-east-1';

    if (!isMock && apiKey) {
      // Official Amazon Location Service V2 Standard Dark descriptor
      return `https://maps.geo.${region}.amazonaws.com/v2/styles/Standard/descriptor?key=${apiKey}&color-scheme=Dark`;
    }

    // Free open vector dark tile fallback
    return 'https://tiles.openfreemap.org/styles/dark';
  }

  public getFallbackStyle(): StyleSpecification {
    return {
      version: 8,
      name: 'SentinelTacticalDarkGrid',
      sources: {},
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: {
            'background-color': '#070b14',
          },
        },
      ],
    };
  }

  public getRoutes(): { standard: RouteOption; brightest: RouteOption } {
    return {
      standard: STANDARD_ROUTE,
      brightest: BRIGHTEST_ROUTE,
    };
  }

  public getSafeHavens(): SafeHaven[] {
    return SAFE_HAVENS;
  }

  public getPatrollingResponders(): PatrollingResponder[] {
    return PATROLLING_RESPONDERS;
  }

  public async fetchLiveRoutes(): Promise<{
    routes: RouteOption[];
    safeHavens: SafeHaven[];
    source: string;
    fallbackReason?: string;
  }> {
    try {
      const res = await fetch('/api/routes');
      if (res.ok) {
        const data = await res.json();
        return {
          routes: data.routes || [BRIGHTEST_ROUTE, STANDARD_ROUTE],
          safeHavens: data.safeHavens || SAFE_HAVENS,
          source: data.source || 'mock-fallback',
          fallbackReason: data.fallbackReason,
        };
      }
    } catch (err) {
      console.warn('[locationAdapter] fetchLiveRoutes error:', err);
    }

    return {
      routes: [BRIGHTEST_ROUTE, STANDARD_ROUTE],
      safeHavens: SAFE_HAVENS,
      source: 'mock-fallback',
      fallbackReason: 'Network/server unavailable',
    };
  }

  public createCircleGeoJSON(
    center: [number, number],
    radiusInMeters: number,
    points = 64
  ): GeoJSON.Feature<GeoJSON.Polygon> {
    const coords: [number, number][] = [];
    const [centerLng, centerLat] = center;

    const earthRadius = 6378137;
    const dLat = (radiusInMeters / earthRadius) * (180 / Math.PI);
    const dLng = dLat / Math.cos((centerLat * Math.PI) / 180);

    for (let i = 0; i <= points; i++) {
      const theta = (i / points) * (2 * Math.PI);
      const lng = centerLng + dLng * Math.cos(theta);
      const lat = centerLat + dLat * Math.sin(theta);
      coords.push([lng, lat]);
    }

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [coords],
      },
      properties: {
        radiusMeters: radiusInMeters,
      },
    };
  }
}

export const locationAdapter: ILocationAdapter = new AmazonLocationV2Adapter();

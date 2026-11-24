import type { StyleSpecification } from 'maplibre-gl';
import { RouteOption, SafeHaven, PatrollingResponder } from '@/types/sentinel';
import {
  STANDARD_ROUTE,
  BRIGHTEST_ROUTE,
  SAFE_HAVENS,
  PATROLLING_RESPONDERS,
} from '@/lib/mockData';
import { awsConfig } from './config';

export interface ILocationAdapter {
  getMapStyleUrl(): string;
  getFallbackStyle(): StyleSpecification;
  getRoutes(): { standard: RouteOption; brightest: RouteOption };
  getSafeHavens(): SafeHaven[];
  getPatrollingResponders(): PatrollingResponder[];
  createCircleGeoJSON(
    center: [number, number],
    radiusInMeters: number,
    points?: number
  ): GeoJSON.Feature<GeoJSON.Polygon>;
}

class AmazonLocationV2Adapter implements ILocationAdapter {
  public getMapStyleUrl(): string {
    if (awsConfig.useMockAws || !awsConfig.location.apiKey) {
      // Free open vector dark tile style (no API key required)
      return 'https://tiles.openfreemap.org/styles/dark';
    }

    // Official Amazon Location Service V2 Standard Descriptor endpoint
    return `https://maps.geo.${awsConfig.location.region}.amazonaws.com/v2/styles/Standard/descriptor?key=${awsConfig.location.apiKey}&color-scheme=Dark`;
  }

  /**
   * Ultra-resilient offline vector grid style JSON.
   * Ensures the map always renders with zero tile-server network dependency if external tiles fail.
   */
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

  /**
   * Generates a 64-vertex GeoJSON circle polygon around [lng, lat] for the 500m mesh radius ring.
   */
  public createCircleGeoJSON(
    center: [number, number],
    radiusInMeters: number,
    points = 64
  ): GeoJSON.Feature<GeoJSON.Polygon> {
    const coords: [number, number][] = [];
    const [centerLng, centerLat] = center;

    // Convert meters to approximate coordinate deltas (WGS84)
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

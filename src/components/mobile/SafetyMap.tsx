'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Map, Marker, Popup, LngLatBounds, ErrorEvent, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { RouteOption, SafeHaven } from '@/types/sentinel';
import { locationAdapter } from '@/lib/aws/locationAdapter';
import { ShieldCheck, Sparkles, AlertTriangle, Clock } from 'lucide-react';

interface SafetyMapProps {
  selectedRouteId: 'brightest' | 'standard';
  onSelectRoute: (routeId: 'brightest' | 'standard') => void;
  selectedSafeHaven: SafeHaven | null;
  onSelectSafeHaven: (haven: SafeHaven | null) => void;
}

export default function SafetyMap({
  selectedRouteId,
  onSelectRoute,
  selectedSafeHaven,
  onSelectSafeHaven,
}: SafetyMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const mapReadyRef = useRef(false);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<Popup | null>(null);

  const [routes, setRoutes] = useState<{ standard: RouteOption; brightest: RouteOption }>(
    locationAdapter.getRoutes()
  );
  const [safeHavens, setSafeHavens] = useState<SafeHaven[]>(locationAdapter.getSafeHavens());
  const [routingSource, setRoutingSource] = useState<string>('initializing');

  // Fetch live Amazon Location V2 Routes on mount
  useEffect(() => {
    let active = true;
    locationAdapter.fetchLiveRoutes().then((data) => {
      if (!active) return;
      const std = data.routes.find((r) => r.id === 'standard') || routes.standard;
      const bri = data.routes.find((r) => r.id === 'brightest') || routes.brightest;
      setRoutes({ standard: std, brightest: bri });
      if (data.safeHavens && data.safeHavens.length > 0) {
        setSafeHavens(data.safeHavens);
      }
      setRoutingSource(data.source);
    });
    return () => {
      active = false;
    };
  }, []);

  const { standard: standardRoute, brightest: brightestRoute } = routes;

  // Idempotent map synchronization helper
  const syncMapData = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    // 1. Update / Add Standard Route Source & Layer
    const stdSource = map.getSource('route-standard-source') as GeoJSONSource | undefined;
    const stdGeoJSON: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: standardRoute.coordinates,
      },
    };

    if (stdSource) {
      stdSource.setData(stdGeoJSON);
    } else {
      map.addSource('route-standard-source', {
        type: 'geojson',
        data: stdGeoJSON,
      });

      map.addLayer({
        id: 'route-standard-line',
        type: 'line',
        source: 'route-standard-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#f59e0b',
          'line-width': selectedRouteId === 'standard' ? 5 : 3,
          'line-opacity': selectedRouteId === 'standard' ? 0.95 : 0.3,
          'line-dasharray': [2, 2],
        },
      });
    }

    // 2. Update / Add Brightest Route Source & Layers (Glow + Core)
    const briSource = map.getSource('route-brightest-source') as GeoJSONSource | undefined;
    const briGeoJSON: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: brightestRoute.coordinates,
      },
    };

    if (briSource) {
      briSource.setData(briGeoJSON);
    } else {
      map.addSource('route-brightest-source', {
        type: 'geojson',
        data: briGeoJSON,
      });

      map.addLayer({
        id: 'route-brightest-glow',
        type: 'line',
        source: 'route-brightest-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#06b6d4',
          'line-width': 10,
          'line-opacity': selectedRouteId === 'brightest' ? 0.55 : 0.15,
          'line-blur': 4,
        },
      });

      map.addLayer({
        id: 'route-brightest-core',
        type: 'line',
        source: 'route-brightest-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#10b981',
          'line-width': selectedRouteId === 'brightest' ? 6 : 3,
          'line-opacity': selectedRouteId === 'brightest' ? 1.0 : 0.3,
        },
      });
    }

    // Update layer styles if layers already exist
    if (map.getLayer('route-standard-line')) {
      map.setPaintProperty(
        'route-standard-line',
        'line-opacity',
        selectedRouteId === 'standard' ? 0.95 : 0.3
      );
      map.setPaintProperty(
        'route-standard-line',
        'line-width',
        selectedRouteId === 'standard' ? 5 : 3
      );
    }

    if (map.getLayer('route-brightest-glow')) {
      map.setPaintProperty(
        'route-brightest-glow',
        'line-opacity',
        selectedRouteId === 'brightest' ? 0.55 : 0.15
      );
    }

    if (map.getLayer('route-brightest-core')) {
      map.setPaintProperty(
        'route-brightest-core',
        'line-opacity',
        selectedRouteId === 'brightest' ? 1.0 : 0.3
      );
      map.setPaintProperty(
        'route-brightest-core',
        'line-width',
        selectedRouteId === 'brightest' ? 6 : 3
      );
    }

    // 3. Clear and re-add Markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Origin Marker (User Location)
    const originEl = document.createElement('div');
    originEl.className = 'flex items-center justify-center';
    originEl.innerHTML = `
      <div class="relative flex items-center justify-center">
        <span class="absolute w-8 h-8 rounded-full bg-cyan-500/30 animate-ping"></span>
        <span class="relative flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500 border-2 border-white shadow-lg shadow-cyan-500/50">
          <span class="w-2 h-2 rounded-full bg-slate-950"></span>
        </span>
      </div>
    `;
    const originMarker = new Marker({ element: originEl })
      .setLngLat(brightestRoute.coordinates[0])
      .addTo(map);
    markersRef.current.push(originMarker);

    // Destination Marker
    const destEl = document.createElement('div');
    destEl.className = 'flex items-center justify-center';
    destEl.innerHTML = `
      <div class="relative flex items-center justify-center">
        <span class="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-600 border-2 border-white text-white shadow-lg shadow-emerald-500/40">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
        </span>
      </div>
    `;
    const destMarker = new Marker({ element: destEl })
      .setLngLat(brightestRoute.coordinates[brightestRoute.coordinates.length - 1])
      .addTo(map);
    markersRef.current.push(destMarker);

    // Safe Haven Markers
    safeHavens.forEach((haven) => {
      const el = document.createElement('div');
      el.className = 'cursor-pointer group';
      el.innerHTML = `
        <div class="relative flex items-center justify-center p-1.5 rounded-full bg-slate-900 border border-emerald-400 text-emerald-400 shadow-md shadow-emerald-950 hover:scale-110 transition-transform">
          <span class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
        </div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectSafeHaven(haven);
      });

      const havenLngLat: [number, number] = [
        haven.lng ?? haven.coordinates[0],
        haven.lat ?? haven.coordinates[1],
      ];
      const havenMarker = new Marker({ element: el })
        .setLngLat(havenLngLat)
        .addTo(map);
      markersRef.current.push(havenMarker);
    });

    // 4. Auto-frame active route
    const activeCoords =
      selectedRouteId === 'brightest' ? brightestRoute.coordinates : standardRoute.coordinates;
    if (activeCoords && activeCoords.length > 0) {
      const bounds = activeCoords.reduce(
        (b, coord) => b.extend(coord),
        new LngLatBounds(activeCoords[0], activeCoords[0])
      );
      map.fitBounds(bounds, { padding: 45, maxZoom: 16.5, duration: 800 });
    }
  }, [brightestRoute, standardRoute, safeHavens, selectedRouteId, onSelectSafeHaven]);

  // Initialize MapLibre Map with validateStyle: false
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    let isSubscribed = true;
    const styleUrl = locationAdapter.getMapStyleUrl();

    const map = new Map({
      container: mapContainerRef.current,
      style: styleUrl,
      center: [-122.2589, 37.871],
      zoom: 15.2,
      pitch: 35,
      bearing: -15,
      attributionControl: false,
      validateStyle: false,
    });

    mapRef.current = map;

    map.on('error', (e: ErrorEvent) => {
      if (e && e.error && e.error.message && isSubscribed) {
        console.warn('[SafetyMap] Tile warning intercepted. Applying fallback grid style.');
        try {
          map.setStyle(locationAdapter.getFallbackStyle());
        } catch {
          // ignore
        }
      }
    });

    // Track mapReadyRef inside map.once('load')
    map.once('load', () => {
      if (!isSubscribed) return;
      mapReadyRef.current = true;
      syncMapData();
    });

    return () => {
      isSubscribed = false;
      mapReadyRef.current = false;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (popupRef.current) popupRef.current.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [syncMapData]);

  // Reactive sync when route selection or data updates
  useEffect(() => {
    if (!mapReadyRef.current) return;
    syncMapData();
  }, [selectedRouteId, routes, safeHavens, syncMapData]);

  return (
    <div className="relative w-full h-full min-h-[380px] bg-[#070b14] overflow-hidden rounded-xl border border-slate-800">
      {/* Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[380px]" />

      {/* Floating Route Selector Card */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-col gap-2">
        <div className="bg-slate-950/85 backdrop-blur-md border border-slate-800/80 rounded-xl p-2.5 shadow-xl">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/60 mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              Proactive Route Intelligence
            </div>
            <span
              className={`text-[9px] font-mono px-2 py-0.5 rounded-full ${
                routingSource === 'aws-live'
                  ? 'bg-emerald-950/80 border border-emerald-500/80 text-emerald-300'
                  : 'bg-cyan-950/70 border border-cyan-800/50 text-cyan-300'
              }`}
            >
              {routingSource === 'aws-live' ? 'Location V2 Live' : 'Location V2'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Brightest Route Button */}
            <button
              type="button"
              onClick={() => onSelectRoute('brightest')}
              className={`flex flex-col text-left p-2.5 rounded-lg border transition-all ${
                selectedRouteId === 'brightest'
                  ? 'bg-emerald-950/40 border-emerald-500/80 ring-1 ring-emerald-500/40 shadow-sm shadow-emerald-900/30'
                  : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Brightest
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-900/60 text-emerald-200">
                  {brightestRoute.lightingScore}/100
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-300">
                <span>{brightestRoute.durationMinutes} min</span>
                <span className="text-[10px] text-emerald-400">
                  {brightestRoute.safeHavensCount || 3} Safe Havens
                </span>
              </div>
            </button>

            {/* Standard Route Button */}
            <button
              type="button"
              onClick={() => onSelectRoute('standard')}
              className={`flex flex-col text-left p-2.5 rounded-lg border transition-all ${
                selectedRouteId === 'standard'
                  ? 'bg-amber-950/40 border-amber-500/80 ring-1 ring-amber-500/40 shadow-sm shadow-amber-900/30'
                  : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-xs font-semibold text-amber-300 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  Standard
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-900/60 text-amber-200">
                  {standardRoute.lightingScore}/100
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-300">
                <span>{standardRoute.durationMinutes} min</span>
                <span className="text-[10px] text-rose-400">Direct</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Selected Safe Haven Detail Card Overlay */}
      {selectedSafeHaven && (
        <div className="absolute bottom-3 left-3 right-3 z-10">
          <div className="bg-slate-950/95 backdrop-blur-md border border-emerald-500/60 rounded-xl p-3 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="p-1 rounded-md bg-emerald-950 border border-emerald-700 text-emerald-400">
                    <ShieldCheck className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-white leading-tight">
                      {selectedSafeHaven.name}
                    </h4>
                    <p className="text-[10px] text-slate-400">{selectedSafeHaven.address}</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectSafeHaven(null)}
                className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-slate-800"
              >
                ✕
              </button>
            </div>

            <p className="mt-2 text-[11px] text-slate-300 leading-snug">
              {selectedSafeHaven.description}
            </p>

            <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <Clock className="w-3 h-3" /> 24/7 Verified Safe Haven
              </span>
              <span className="text-slate-300 font-mono">
                {selectedSafeHaven.distanceMeters}m away
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

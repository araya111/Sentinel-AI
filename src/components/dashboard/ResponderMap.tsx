'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Map, Marker, ErrorEvent, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SentinelEvent, PatrollingResponder, Coordinates } from '@/types/sentinel';
import { locationAdapter } from '@/lib/aws/locationAdapter';
import { VICTIM_INITIAL_COORDS } from '@/lib/mockData';

interface ResponderMapProps {
  activeIncident: SentinelEvent | null;
  onSelectResponder?: (responder: PatrollingResponder) => void;
  selectedResponderId?: string | null;
  respondersList?: PatrollingResponder[];
  liveCoords?: Coordinates | null;
}

export default function ResponderMap({
  activeIncident,
  onSelectResponder,
  selectedResponderId,
  respondersList,
  liveCoords,
}: ResponderMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const mapReadyRef = useRef(false);
  const respondersMarkersRef = useRef<Marker[]>([]);
  const victimMarkerRef = useRef<Marker | null>(null);

  const responders = respondersList || locationAdapter.getPatrollingResponders();

  // Smooth live ping marker tracking without fighting map camera zoom
  useEffect(() => {
    if (liveCoords && victimMarkerRef.current) {
      victimMarkerRef.current.setLngLat([liveCoords.lng, liveCoords.lat]);
    }
  }, [liveCoords]);

  // Idempotent map synchronization helper
  const syncMapData = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    const victimCenter: [number, number] = activeIncident
      ? [activeIncident.location.lng, activeIncident.location.lat]
      : [-122.2589, 37.871];

    const circleGeoJSON = locationAdapter.createCircleGeoJSON(victimCenter, 500);

    // 1. Sync 500m mesh radius circle source & layer
    const source = map.getSource('mesh-radius-circle-source') as GeoJSONSource | undefined;
    if (source) {
      source.setData(circleGeoJSON);
    } else {
      map.addSource('mesh-radius-circle-source', {
        type: 'geojson',
        data: circleGeoJSON,
      });

      map.addLayer({
        id: 'mesh-radius-circle-fill',
        type: 'fill',
        source: 'mesh-radius-circle-source',
        paint: {
          'fill-color': activeIncident ? '#ef4444' : '#06b6d4',
          'fill-opacity': activeIncident ? 0.16 : 0.08,
        },
      });

      map.addLayer({
        id: 'mesh-radius-circle-outline',
        type: 'line',
        source: 'mesh-radius-circle-source',
        paint: {
          'line-color': activeIncident ? '#f43f5e' : '#22d3ee',
          'line-width': 2.5,
          'line-dasharray': [3, 2],
        },
      });
    }

    if (map.getLayer('mesh-radius-circle-fill')) {
      map.setPaintProperty(
        'mesh-radius-circle-fill',
        'fill-color',
        activeIncident ? '#ef4444' : '#06b6d4'
      );
      map.setPaintProperty(
        'mesh-radius-circle-fill',
        'fill-opacity',
        activeIncident ? 0.16 : 0.08
      );
    }

    if (map.getLayer('mesh-radius-circle-outline')) {
      map.setPaintProperty(
        'mesh-radius-circle-outline',
        'line-color',
        activeIncident ? '#f43f5e' : '#22d3ee'
      );
    }

    // 2. Camera flyTo on incident trigger
    if (activeIncident) {
      map.flyTo({
        center: victimCenter,
        zoom: 15.6,
        pitch: 45,
        bearing: -15,
        speed: 1.2,
      });
    }

    // 3. Clear and re-render Responder Markers
    respondersMarkersRef.current.forEach((m) => m.remove());
    respondersMarkersRef.current = [];

    responders.forEach((responder) => {
      const isSelected = selectedResponderId === responder.id;
      const el = document.createElement('div');
      el.className = 'cursor-pointer group flex flex-col items-center';

      const iconSvg =
        responder.id === 'resp-unit-04'
          ? '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h8m-8 5h8m-4-10v3m0 14v3M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>'
          : responder.id === 'resp-volunteer-rohan'
          ? '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>'
          : '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>';

      el.innerHTML = `
        <div class="flex items-center gap-1.5 px-2 py-1 rounded-full border shadow-lg transition-transform group-hover:scale-105 ${
          isSelected
            ? 'bg-cyan-950 border-cyan-400 text-cyan-200 ring-2 ring-cyan-400/50'
            : 'bg-slate-900/90 border-slate-700 text-slate-200'
        }">
          <span class="p-0.5 rounded-full bg-cyan-900/80 text-cyan-400">${iconSvg}</span>
          <span class="text-[10px] font-bold tracking-tight">${responder.name.split('—')[0].trim()}</span>
          <span class="text-[9px] font-mono px-1 rounded bg-slate-800 text-emerald-400 font-semibold">${responder.etaDisplay}</span>
        </div>
        <div class="w-1.5 h-1.5 rotate-45 bg-slate-800 border-r border-b border-slate-700 -mt-1"></div>
      `;

      el.addEventListener('click', () => {
        onSelectResponder?.(responder);
      });

      const respLngLat: [number, number] = [
        responder.lng ?? responder.coordinates[0],
        responder.lat ?? responder.coordinates[1],
      ];
      const marker = new Marker({ element: el })
        .setLngLat(respLngLat)
        .addTo(map);

      respondersMarkersRef.current.push(marker);
    });

    // 4. Victim Beacon Marker
    if (victimMarkerRef.current) {
      victimMarkerRef.current.remove();
      victimMarkerRef.current = null;
    }

    if (activeIncident) {
      const vEl = document.createElement('div');
      vEl.className = 'relative flex items-center justify-center';
      vEl.innerHTML = `
        <span class="absolute w-12 h-12 rounded-full bg-rose-500/40 animate-ping"></span>
        <span class="absolute w-8 h-8 rounded-full bg-rose-500/60 animate-pulse"></span>
        <span class="relative flex items-center justify-center w-6 h-6 rounded-full bg-rose-600 border-2 border-white text-white shadow-xl shadow-rose-950">
          <svg class="w-3.5 h-3.5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        </span>
      `;

      victimMarkerRef.current = new Marker({ element: vEl })
        .setLngLat([activeIncident.location.lng, activeIncident.location.lat])
        .addTo(map);
    }
  }, [activeIncident, responders, selectedResponderId, onSelectResponder]);

  // Initialize MapLibre Map with validateStyle: false
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    let isSubscribed = true;
    const styleUrl = locationAdapter.getMapStyleUrl();

    const map = new Map({
      container: mapContainerRef.current,
      style: styleUrl,
      center: [-122.2589, 37.871],
      zoom: 15.0,
      pitch: 42,
      bearing: -20,
      attributionControl: false,
      validateStyle: false,
    });

    mapRef.current = map;

    map.on('error', (e: ErrorEvent) => {
      if (e && e.error && e.error.message && isSubscribed) {
        console.warn('[ResponderMap] Remote tile warning intercepted. Using fallback grid style.');
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
      respondersMarkersRef.current.forEach((m) => m.remove());
      respondersMarkersRef.current = [];
      if (victimMarkerRef.current) victimMarkerRef.current.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [syncMapData]);

  // Reactive sync when activeIncident or responders change
  useEffect(() => {
    if (!mapReadyRef.current) return;
    syncMapData();
  }, [activeIncident, responders, selectedResponderId, syncMapData]);

  return (
    <div className="relative w-full h-full min-h-[460px] bg-[#070b14] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
      {/* Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[460px]" />

      {/* Top Left Overlay: Tactical Radar Status */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-800 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              activeIncident ? 'bg-rose-500 animate-ping' : 'bg-cyan-400 animate-pulse'
            }`}
          />
          <span className="font-bold tracking-wider uppercase text-slate-200">
            {activeIncident ? 'TACTICAL INCIDENT BEACON' : 'CAMPUS MESH COVERAGE (500M)'}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
            {responders.length} Responders Active
          </span>
        </div>
      </div>

      {/* Legend / Status Overlay */}
      <div className="absolute bottom-3 left-3 z-10 hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-950/90 backdrop-blur-md border border-slate-800 text-[10px] text-slate-300">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span> Verified Responders
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full border border-dashed border-cyan-400"></span> 500m Mesh Perimeter
        </span>
        {activeIncident && (
          <span className="flex items-center gap-1.5 text-rose-400 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span> Victim Beacon
          </span>
        )}
      </div>
    </div>
  );
}

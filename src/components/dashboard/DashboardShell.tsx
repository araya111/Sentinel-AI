'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import {
  SentinelEvent,
  PatrollingResponder,
  ResponderInfo,
  PersistedIncident,
  Coordinates,
} from '@/types/sentinel';
import { PATROLLING_RESPONDERS } from '@/lib/mockData';
import { realtimeMeshAdapter, MeshTransportStatus } from '@/lib/aws/realtimeMeshAdapter';
import { sanitizeRoom } from '@/lib/room';
import IncidentFeed from './IncidentFeed';
import {
  Shield,
  Radio,
  Wifi,
  Navigation,
  Activity,
  AlertTriangle,
  RotateCcw,
  Database,
  Lock,
  Layers,
} from 'lucide-react';

// Dynamic import with SSR false for MapLibre map component
const ResponderMap = dynamic(() => import('./ResponderMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[460px] bg-[#070b14] flex flex-col items-center justify-center text-slate-500 rounded-2xl border border-slate-800 animate-pulse">
      <Navigation className="w-8 h-8 mb-2 text-cyan-500/50" />
      <span className="text-xs font-mono">Initializing Tactical Radar Canvas...</span>
    </div>
  ),
});

interface ServicePulse {
  name: string;
  key: string;
  latencyMs?: number;
  active: boolean;
}

export default function DashboardShell() {
  const searchParams = useSearchParams();
  const room = sanitizeRoom(searchParams.get('room'));

  const [activeIncident, setActiveIncident] = useState<SentinelEvent | null>(null);
  const [recentEvents, setRecentEvents] = useState<SentinelEvent[]>([]);
  const [dispatchedResponder, setDispatchedResponder] = useState<ResponderInfo | null>(null);
  const [selectedResponder, setSelectedResponder] = useState<PatrollingResponder | null>(null);
  const [meshStatus, setMeshStatus] = useState<MeshTransportStatus>('connecting');
  const [persistedIncidents, setPersistedIncidents] = useState<PersistedIncident[]>([]);
  const [respondersList, setRespondersList] = useState<PatrollingResponder[]>(PATROLLING_RESPONDERS);
  const [cloudSource, setCloudSource] = useState<string>('connecting');
  const [liveVictimCoords, setLiveVictimCoords] = useState<Coordinates | null>(null);

  // Live 9-Service Pipeline Pulse State
  const [servicePulses, setServicePulses] = useState<Record<string, { latencyMs: number; lastPulse: number }>>({
    bedrock: { latencyMs: 380, lastPulse: Date.now() },
    polly: { latencyMs: 140, lastPulse: Date.now() },
    transcribe: { latencyMs: 290, lastPulse: 0 },
    location: { latencyMs: 95, lastPulse: Date.now() },
    geofence: { latencyMs: 45, lastPulse: 0 },
    dynamodb: { latencyMs: 22, lastPulse: Date.now() },
    appsync: { latencyMs: 18, lastPulse: Date.now() },
    sns: { latencyMs: 110, lastPulse: 0 },
    s3: { latencyMs: 85, lastPulse: 0 },
  });

  const audioCtxRef = useRef<AudioContext | null>(null);

  // Hydrate incidents and responders from DynamoDB filtered to this room
  const fetchPersistedIncidents = useCallback(async () => {
    try {
      const res = await fetch(`/api/incidents?room=${encodeURIComponent(room)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.incidents)) {
        setPersistedIncidents(data.incidents);
      }
      if (Array.isArray(data.responders) && data.responders.length > 0) {
        setRespondersList(data.responders);
      }
      if (data.source) {
        setCloudSource(data.source);
      }
    } catch (err) {
      console.warn('[DashboardShell] Failed to hydrate incidents from DynamoDB:', err);
    }
  }, [room]);

  useEffect(() => {
    fetchPersistedIncidents();
  }, [fetchPersistedIncidents]);

  // Tactical alert ping tone via Web Audio API
  const playAlertSound = useCallback((frequency = 880, type: OscillatorType = 'sine') => {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }

      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }

      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // AudioContext autoplay restriction prior to user interaction
    }
  }, []);

  // Connect to SSE/AppSync real-time event bus with room scoping
  useEffect(() => {
    const unsubscribe = realtimeMeshAdapter.subscribe(
      (event: SentinelEvent) => {
        // Ephemeral LOCATION_PING telemetry
        if (event.type === 'LOCATION_PING') {
          if (event.coordinates) {
            setLiveVictimCoords(event.coordinates);
          }
          return;
        }

        // Pulse the relevant AWS service node
        setServicePulses((prev) => {
          const now = Date.now();
          const next = { ...prev };
          if (event.type === 'STEALTH_TRIGGERED' || event.type === 'THREAT_ESCALATED') {
            next.bedrock = { latencyMs: 340, lastPulse: now };
            next.polly = { latencyMs: 120, lastPulse: now };
            next.appsync = { latencyMs: 14, lastPulse: now };
            next.dynamodb = { latencyMs: 24, lastPulse: now };
          } else if (event.type === 'SOS_FALLBACK_SENT') {
            next.sns = { latencyMs: 105, lastPulse: now };
            next.appsync = { latencyMs: 12, lastPulse: now };
          }
          return next;
        });

        // Upsert by ID to prevent duplicate alert cards across turns
        setRecentEvents((prev) => {
          const idx = prev.findIndex((e) => e.id === event.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = event;
            return next;
          }
          return [event, ...prev.slice(0, 19)];
        });

        if (event.type === 'INCIDENT_RESET') {
          setActiveIncident(null);
          setDispatchedResponder(null);
          setLiveVictimCoords(null);
        } else if (event.type === 'RESPONDER_DISPATCHED') {
          if (event.responder) {
            setDispatchedResponder(event.responder);
          }
          playAlertSound(540, 'triangle');
        } else if (
          event.type === 'STEALTH_TRIGGERED' ||
          event.type === 'THREAT_ESCALATED' ||
          event.type === 'PHONE_DROP_DETECTED'
        ) {
          setActiveIncident(event);
          if (event.location) {
            setLiveVictimCoords(event.location);
          }
          playAlertSound(event.threatLevel === 'CRITICAL' ? 980 : 720, 'square');
        } else if (event.type === 'SOS_FALLBACK_SENT') {
          setActiveIncident((prev) => {
            if (!prev) return event;
            return {
              ...prev,
              snsMessageId: event.snsMessageId || prev.snsMessageId,
              notes: event.notes || prev.notes,
            };
          });
          playAlertSound(480, 'sine');
        }

        // Re-fetch persisted history to reflect DynamoDB state
        fetchPersistedIncidents();
      },
      (status) => {
        setMeshStatus(status);
      },
      room
    );

    return () => {
      unsubscribe();
    };
  }, [playAlertSound, fetchPersistedIncidents, room]);

  const handleDispatch = useCallback(
    async (responder: PatrollingResponder) => {
      const ackEvent = await realtimeMeshAdapter.dispatchResponder(responder, room);
      if (ackEvent.responder) {
        setDispatchedResponder(ackEvent.responder);
      }
      fetchPersistedIncidents();
    },
    [fetchPersistedIncidents, room]
  );

  const handleReset = useCallback(async () => {
    setActiveIncident(null);
    setDispatchedResponder(null);
    setLiveVictimCoords(null);
    await realtimeMeshAdapter.resetDemo(room);
    fetchPersistedIncidents();
  }, [fetchPersistedIncidents, room]);

  const pipelineNodes = [
    { key: 'bedrock', name: 'Bedrock Nova 2' },
    { key: 'polly', name: 'Polly Ruth' },
    { key: 'transcribe', name: 'Transcribe Stream' },
    { key: 'location', name: 'Location V2' },
    { key: 'geofence', name: 'Geofences' },
    { key: 'dynamodb', name: 'DynamoDB' },
    { key: 'appsync', name: 'AppSync Events' },
    { key: 'sns', name: 'SNS SOS' },
    { key: 's3', name: 'S3 Vault' },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#050811] text-slate-100">
      {/* Tactical Top Bar */}
      <header className="px-5 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-600 to-blue-700 text-slate-950 font-black shadow-lg shadow-cyan-900/40">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-extrabold tracking-tight text-white">
                SENTINEL AI — CAMPUS RESPONDER COMMAND
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-300">
                Room: {room}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Station Alpha • Real-Time Safety Perimeter &amp; Rapid Deterrence Grid
            </p>
          </div>
        </div>

        {/* Mesh pub/sub and Cloud Status badges */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs">
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span
              className={`w-2 h-2 rounded-full ${
                cloudSource === 'aws-live'
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-amber-400'
              }`}
            />
            <span className="font-mono text-slate-300 text-[11px]">
              {cloudSource === 'aws-live'
                ? 'AWS DynamoDB'
                : 'MOCK FALLBACK'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                meshStatus === 'APPSYNC_LIVE'
                  ? 'bg-emerald-400 animate-pulse'
                  : meshStatus === 'SSE_FALLBACK'
                  ? 'bg-amber-400 animate-pulse'
                  : meshStatus === 'connecting'
                  ? 'bg-cyan-400 animate-ping'
                  : 'bg-rose-500'
              }`}
            />
            <span className="font-mono text-slate-300 text-[11px]">
              {meshStatus === 'APPSYNC_LIVE'
                ? 'APPSYNC LIVE'
                : meshStatus === 'SSE_FALLBACK'
                ? 'SSE FALLBACK'
                : 'CONNECTING...'}
            </span>
          </div>

          {activeIncident && (
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-700 text-rose-200 text-xs font-semibold transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </header>

      {/* Live AWS Service Pipeline Strip */}
      <div className="px-5 py-1.5 bg-[#03060f] border-b border-slate-800/80 flex items-center justify-between overflow-x-auto text-[10px] font-mono">
        <span className="text-slate-500 shrink-0 mr-2 flex items-center gap-1">
          <Activity className="w-3 h-3 text-cyan-400" />
          AWS Service Pulse:
        </span>
        <div className="flex items-center gap-2">
          {pipelineNodes.map((n) => {
            const data = servicePulses[n.key];
            const isFresh = data && Date.now() - data.lastPulse < 12000;
            return (
              <div
                key={n.key}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border transition-all ${
                  isFresh
                    ? 'bg-emerald-950/80 border-emerald-500/70 text-emerald-300'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isFresh ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                  }`}
                />
                <span>{n.name}</span>
                {data?.latencyMs ? (
                  <span className="text-slate-500 text-[9px]">({data.latencyMs}ms)</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Tactical Grid: Left Map (65%), Right Feed (35%) */}
      <main className="flex-1 p-3 md:p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Tactical Responder Map Canvas */}
        <section className="lg:col-span-8 flex flex-col h-[520px] lg:h-auto min-h-[460px]">
          <ResponderMap
            activeIncident={activeIncident}
            onSelectResponder={setSelectedResponder}
            selectedResponderId={selectedResponder?.id}
            respondersList={respondersList}
            liveCoords={liveVictimCoords}
          />
        </section>

        {/* Right: Incident Feed & Audio Buffer Telemetry */}
        <section className="lg:col-span-4 flex flex-col h-full min-h-[460px]">
          <IncidentFeed
            activeIncident={activeIncident}
            recentEvents={recentEvents}
            dispatchedResponder={dispatchedResponder}
            onDispatchResponder={handleDispatch}
            onResetIncident={handleReset}
            selectedResponderId={selectedResponder?.id}
            onSelectResponder={setSelectedResponder}
            persistedIncidents={persistedIncidents}
            cloudSource={cloudSource}
            respondersList={respondersList}
          />
        </section>
      </main>
    </div>
  );
}

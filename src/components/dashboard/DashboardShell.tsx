'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  SentinelEvent,
  PatrollingResponder,
  ResponderInfo,
} from '@/types/sentinel';
import { realtimeMeshAdapter } from '@/lib/aws/realtimeMeshAdapter';
import IncidentFeed from './IncidentFeed';
import {
  Shield,
  Radio,
  Wifi,
  Navigation,
  Activity,
  AlertTriangle,
  RotateCcw,
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

export default function DashboardShell() {
  const [activeIncident, setActiveIncident] = useState<SentinelEvent | null>(null);
  const [recentEvents, setRecentEvents] = useState<SentinelEvent[]>([]);
  const [dispatchedResponder, setDispatchedResponder] = useState<ResponderInfo | null>(null);
  const [selectedResponder, setSelectedResponder] = useState<PatrollingResponder | null>(null);
  const [meshStatus, setMeshStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Play tactical alert ping tone via Web Audio API (browser safe, 0 external assets)
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

  // Connect to SSE real-time event bus with in-place incident upsert
  useEffect(() => {
    const unsubscribe = realtimeMeshAdapter.subscribe(
      (event: SentinelEvent) => {
        // Upsert by ID to prevent duplicate alert cards across conversational turns
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
          playAlertSound(event.threatLevel === 'CRITICAL' ? 980 : 720, 'square');
        }
      },
      (status) => {
        setMeshStatus(status);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [playAlertSound]);

  const handleDispatch = useCallback(async (responder: PatrollingResponder) => {
    const ackEvent = await realtimeMeshAdapter.dispatchResponder(responder);
    if (ackEvent.responder) {
      setDispatchedResponder(ackEvent.responder);
    }
  }, []);

  const handleReset = useCallback(async () => {
    setActiveIncident(null);
    setDispatchedResponder(null);
    await realtimeMeshAdapter.resetDemo();
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#050811] text-slate-100">
      {/* Tactical Top Bar */}
      <header className="px-6 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-600 to-blue-700 text-slate-950 font-black shadow-lg shadow-cyan-900/40">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold tracking-tight text-white">
                SENTINEL AI — CAMPUS RESPONDER COMMAND
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-300">
                AWS BUILDER CONNECT SHOWCASE
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Station Alpha • Real-Time Safety Perimeter & Rapid Deterrence Grid
            </p>
          </div>
        </div>

        {/* Mesh pub/sub status pill */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                meshStatus === 'connected'
                  ? 'bg-emerald-400 animate-pulse'
                  : meshStatus === 'connecting'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-rose-500'
              }`}
            />
            <span className="font-mono text-slate-300">
              {meshStatus === 'connected'
                ? 'LIVE MESH CONNECTED'
                : meshStatus === 'connecting'
                ? 'RECONNECTING MESH...'
                : 'DISCONNECTED'}
            </span>
          </div>

          {activeIncident && (
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-700 text-rose-200 text-xs font-semibold transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Incident</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Tactical Grid: Left Map (65%), Right Feed (35%) */}
      <main className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Tactical Responder Map Canvas */}
        <section className="lg:col-span-8 flex flex-col h-[520px] lg:h-auto min-h-[460px]">
          <ResponderMap
            activeIncident={activeIncident}
            onSelectResponder={setSelectedResponder}
            selectedResponderId={selectedResponder?.id}
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
          />
        </section>
      </main>
    </div>
  );
}

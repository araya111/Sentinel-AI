'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Shield,
  ShieldAlert,
  Radio,
  Navigation,
  CheckCircle2,
  AlertCircle,
  Wifi,
  Battery,
  MapPin,
} from 'lucide-react';
import { RouteOption, SafeHaven, SentinelEvent, ResponderInfo } from '@/types/sentinel';
import { realtimeMeshAdapter } from '@/lib/aws/realtimeMeshAdapter';
import StealthListener from './StealthListener';
import DeterrentCallUI from './DeterrentCallUI';
import { VICTIM_INITIAL_COORDS } from '@/lib/mockData';

// Dynamic import with SSR false for MapLibre map component
const SafetyMap = dynamic(() => import('./SafetyMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[380px] bg-[#070b14] flex flex-col items-center justify-center text-slate-500 rounded-xl border border-slate-800 animate-pulse">
      <Navigation className="w-8 h-8 mb-2 text-cyan-500/50" />
      <span className="text-xs font-mono">Initializing MapLibre GL Engine...</span>
    </div>
  ),
});

export default function MobileShell() {
  const [isArmed, setIsArmed] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<'brightest' | 'standard'>('brightest');
  const [selectedSafeHaven, setSelectedSafeHaven] = useState<SafeHaven | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isEscalated, setIsEscalated] = useState(false);
  const [dispatchedResponder, setDispatchedResponder] = useState<ResponderInfo | null>(null);
  const [speechSnippet, setSpeechSnippet] = useState<string>('');
  const [networkStatus, setNetworkStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connected');

  // Subscribe to real-time event bus (SSE)
  useEffect(() => {
    const unsubscribe = realtimeMeshAdapter.subscribe(
      (event: SentinelEvent) => {
        if (event.type === 'RESPONDER_DISPATCHED' && event.responder) {
          setDispatchedResponder(event.responder);
        } else if (event.type === 'INCIDENT_RESET') {
          setIsCallActive(false);
          setIsEscalated(false);
          setDispatchedResponder(null);
          setSpeechSnippet('');
        }
      },
      (status) => {
        setNetworkStatus(status);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Action: Trigger Stealth Cover Call
  const handleTriggerStealth = useCallback(async () => {
    setIsCallActive(true);
    setIsEscalated(false);
    await realtimeMeshAdapter.publishEvent({
      type: 'STEALTH_TRIGGERED',
      threatLevel: 'LOW',
      triggerSource: 'STEALTH_PHRASE',
      location: { lat: VICTIM_INITIAL_COORDS[1], lng: VICTIM_INITIAL_COORDS[0] },
      transcriptSnippet: speechSnippet || 'blue keys on the table',
      notes: 'Cover call initiated with Maya (Roommate). Calm navigation reassurance active.',
    });
  }, [speechSnippet]);

  // Action: Threat Escalation
  const handleTriggerEscalation = useCallback(async () => {
    setIsCallActive(true);
    setIsEscalated(true);
    await realtimeMeshAdapter.publishEvent({
      type: 'THREAT_ESCALATED',
      threatLevel: 'CRITICAL',
      triggerSource: 'AI_AUDIO_ESCALATION',
      location: { lat: VICTIM_INITIAL_COORDS[1], lng: VICTIM_INITIAL_COORDS[0] },
      transcriptSnippet: speechSnippet || 'Hey who is that back off!',
      notes: 'AI speech-to-speech deterrent escalated loudly. Real-time mesh broadcasted to Campus Security.',
    });
  }, [speechSnippet]);

  // Action: Phone Drop Detection
  const handleTriggerPhoneDrop = useCallback(async () => {
    await realtimeMeshAdapter.publishEvent({
      type: 'PHONE_DROP_DETECTED',
      threatLevel: 'CRITICAL',
      triggerSource: 'ACCELEROMETER_DROP',
      location: { lat: VICTIM_INITIAL_COORDS[1], lng: VICTIM_INITIAL_COORDS[0] },
      notes: 'Accelerometer freefall/impact detected! Immediate SOS mesh alert broadcasted.',
    });
  }, []);

  // Action: Reset Demo
  const handleResetDemo = useCallback(async () => {
    setIsCallActive(false);
    setIsEscalated(false);
    setDispatchedResponder(null);
    setSpeechSnippet('');
    await realtimeMeshAdapter.resetDemo();
  }, []);

  return (
    <div className="relative flex flex-col h-full min-h-[640px] max-w-[430px] mx-auto bg-[#070b14] text-slate-100 rounded-3xl shadow-2xl border border-slate-800/80 overflow-hidden select-none">
      {/* Phone Status Header */}
      <div className="flex items-center justify-between px-5 pt-3 pb-2 bg-[#070b14] border-b border-slate-800/60 z-20">
        <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-slate-300">
          <span>9:41</span>
        </div>
        {/* Dynamic Island / Speaker Notch Indicator */}
        <div className="h-4 w-28 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-slate-800 mr-2" />
          <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
        </div>
        <div className="flex items-center gap-2 text-slate-400 text-xs">
          <Wifi className={`w-3.5 h-3.5 ${networkStatus === 'connected' ? 'text-cyan-400' : 'text-slate-500'}`} />
          <Battery className="w-4 h-4 text-slate-300" />
        </div>
      </div>

      {/* App Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/70 backdrop-blur-md border-b border-slate-800/50 z-20">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-950 border border-cyan-800/80 text-cyan-400">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xs font-bold tracking-tight text-white">SENTINEL AI</h1>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-900/50 text-cyan-300 border border-cyan-700/50">
                PWA v1.0
              </span>
            </div>
            <p className="text-[10px] text-slate-400">UC Berkeley Campus Corridor</p>
          </div>
        </div>

        {/* Live Mesh Status Pill */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[10px]">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              networkStatus === 'connected' ? 'bg-cyan-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span className="text-slate-300 font-mono">
            {networkStatus === 'connected' ? 'MESH LIVE' : 'SYNCING'}
          </span>
        </div>
      </div>

      {/* Dispatched Responder Alert Confirmation Banner (Streaming from Dashboard) */}
      {dispatchedResponder && (
        <div className="bg-emerald-950/90 border-b border-emerald-500/80 px-4 py-2.5 z-20 animate-in slide-in-from-top duration-300">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-left">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>{dispatchedResponder.name}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-900 text-emerald-200 font-mono font-normal">
                  ETA {dispatchedResponder.eta}
                </span>
              </div>
              <p className="text-[11px] text-emerald-200/90 leading-tight mt-0.5">
                Campus security confirmed dispatch. Stay on the brightly lit path.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Map View Area (Flex Grow) */}
      <div className="relative flex-1 w-full min-h-[380px] p-2">
        <SafetyMap
          selectedRouteId={selectedRouteId}
          onSelectRoute={setSelectedRouteId}
          selectedSafeHaven={selectedSafeHaven}
          onSelectSafeHaven={setSelectedSafeHaven}
        />

        {/* Active Deterrent Call Overlay */}
        {isCallActive && (
          <DeterrentCallUI
            isEscalated={isEscalated}
            onEscalate={handleTriggerEscalation}
            onEndCall={() => setIsCallActive(false)}
            liveTranscriptSnippet={speechSnippet}
          />
        )}
      </div>

      {/* Bottom Controls & Activation Section */}
      <div className="p-3 bg-slate-950/90 backdrop-blur-md border-t border-slate-800/80 z-20">
        <StealthListener
          isArmed={isArmed}
          onToggleArmed={() => setIsArmed(!isArmed)}
          onTriggerStealth={handleTriggerStealth}
          onTriggerEscalation={handleTriggerEscalation}
          onTriggerPhoneDrop={handleTriggerPhoneDrop}
          onResetDemo={handleResetDemo}
          isCallActive={isCallActive}
          onSpeechRecognized={setSpeechSnippet}
        />
      </div>
    </div>
  );
}

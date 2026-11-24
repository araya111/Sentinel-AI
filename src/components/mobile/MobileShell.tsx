'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  Shield,
  CheckCircle2,
  Wifi,
  Battery,
  Navigation,
} from 'lucide-react';
import { SafeHaven, SentinelEvent, ResponderInfo } from '@/types/sentinel';
import { realtimeMeshAdapter, MeshTransportStatus } from '@/lib/aws/realtimeMeshAdapter';
import { deterrentVoiceAdapter } from '@/lib/aws/deterrentVoiceAdapter';
import StealthListener from './StealthListener';
import DeterrentCallUI from './DeterrentCallUI';
import { VICTIM_INITIAL_COORDS } from '@/lib/mockData';
import type { DeterrentResponse } from '@/app/api/deterrent/route';

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
  const [networkStatus, setNetworkStatus] = useState<MeshTransportStatus>('connecting');
  const [snsReceiptId, setSnsReceiptId] = useState<string | null>(null);

  // Phase 2 Live Engine States
  const [spokenReply, setSpokenReply] = useState<string>(
    "Hey! Just saw your location—you're about two minutes past the pharmacy, right? Keep talking to me until you hit the main gate."
  );
  const [detectedCue, setDetectedCue] = useState<string>('None');
  const [isLoadingTurn, setIsLoadingTurn] = useState(false);
  const [micSuspended, setMicSuspended] = useState(false);
  const [engineStatus, setEngineStatus] = useState<{
    source: 'aws-live' | 'mock-fallback';
    modelUsed?: string;
    latencyMs?: number;
    fallbackReason?: string;
  } | null>(null);
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ role: 'user' | 'assistant'; text: string }>
  >([]);

  // Refs for race-condition guards and unified incident sync
  const sessionIncidentIdRef = useRef<string | null>(null);
  const requestSeqRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

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
          setConversationHistory([]);
          sessionIncidentIdRef.current = null;
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

  /**
   * Core orchestrator for Bedrock + Polly turns with race condition prevention
   */
  const executeDeterrentTurn = useCallback(
    async (
      phase: 'START_CALL' | 'AMBIENT_TURN' | 'FORCE_ESCALATE',
      transcriptText = ''
    ) => {
      // Ensure single persistent incident ID for this session
      if (!sessionIncidentIdRef.current) {
        sessionIncidentIdRef.current = `inc_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .substring(2, 6)}`;
      }

      // Race Guard: Increment sequence and cancel previous in-flight requests
      requestSeqRef.current += 1;
      const currentSeq = requestSeqRef.current;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const ac = new AbortController();
      abortControllerRef.current = ac;

      // Immediately stop audio & suspend mic for zero-echo gating
      deterrentVoiceAdapter.stopAudio();
      setMicSuspended(true);
      setIsLoadingTurn(true);

      const locationLabel =
        selectedRouteId === 'brightest'
          ? 'Brightest Route (Passing 24/7 Campus Pharmacy)'
          : 'Standard Direct Route (Sather Lane)';

      try {
        const data: DeterrentResponse = await deterrentVoiceAdapter.requestDeterrentTurn(
          {
            phase,
            ambientTranscript: transcriptText,
            userLocationLabel: locationLabel,
            history: conversationHistory,
          },
          ac.signal
        );

        // Discard stale response if a newer action or turn fired
        if (currentSeq !== requestSeqRef.current) return;

        setSpokenReply(data.spokenReply);
        setDetectedCue(data.detectedCue);
        setEngineStatus({
          source: data.source,
          modelUsed: data.modelUsed,
          latencyMs: data.latencyMs,
          fallbackReason: data.fallbackReason,
        });
        setIsLoadingTurn(false);

        // Update conversation history
        setConversationHistory((prev) => [
          ...prev,
          { role: 'user', text: transcriptText || phase },
          { role: 'assistant', text: data.spokenReply },
        ]);

        // If Bedrock assesses a threat or escalation
        if (data.threatDetected || phase === 'FORCE_ESCALATE') {
          setIsEscalated(true);
          await realtimeMeshAdapter.publishEvent({
            id: sessionIncidentIdRef.current,
            type: 'THREAT_ESCALATED',
            threatLevel: data.threatLevel || 'CRITICAL',
            triggerSource:
              phase === 'FORCE_ESCALATE'
                ? 'AI_AUDIO_ESCALATION'
                : 'STEALTH_PHRASE',
            location: {
              lat: VICTIM_INITIAL_COORDS.lat,
              lng: VICTIM_INITIAL_COORDS.lng,
            },
            transcriptSnippet: data.spokenReply,
            notes: `Threat detected by Bedrock (${data.modelUsed || 'Nova 2'}). Cue: ${data.detectedCue}`,
          });
        }

        // Resume mic 500ms after audio playback ends (Echo Gating)
        const resumeMic = () => {
          setTimeout(() => {
            if (currentSeq === requestSeqRef.current) {
              setMicSuspended(false);
            }
          }, 500);
        };

        // Play audio: Polly MP3 binary if available, else speech synthesis
        if (data.audioBase64) {
          await deterrentVoiceAdapter.playPollyAudio(
            data.audioBase64,
            resumeMic,
            (err) => {
              console.warn('[MobileShell] Polly playback error, using speech synthesis:', err);
              deterrentVoiceAdapter.speakFallback(data.spokenReply, {
                onEnd: resumeMic,
              });
            }
          );
        } else {
          await deterrentVoiceAdapter.speakFallback(data.spokenReply, {
            onEnd: resumeMic,
          });
        }
      } catch (err: unknown) {
        if ((err as { name?: string }).name === 'AbortError') {
          return; // Expected abort on mid-sentence cutoff
        }
        console.error('[MobileShell] Deterrent turn error:', err);
        if (currentSeq === requestSeqRef.current) {
          setIsLoadingTurn(false);
          setMicSuspended(false);
        }
      }
    },
    [conversationHistory, selectedRouteId]
  );

  // Action: Trigger Stealth Cover Call [1]
  const handleTriggerStealth = useCallback(async () => {
    setIsCallActive(true);
    setIsEscalated(false);

    // Initial SSE broadcast
    await realtimeMeshAdapter.publishEvent({
      id: sessionIncidentIdRef.current || `inc_${Date.now().toString(36)}`,
      type: 'STEALTH_TRIGGERED',
      threatLevel: 'LOW',
      triggerSource: 'STEALTH_PHRASE',
      location: { lat: VICTIM_INITIAL_COORDS.lat, lng: VICTIM_INITIAL_COORDS.lng },
      transcriptSnippet: speechSnippet || 'blue keys on the table',
      notes: 'Cover call initiated with Maya (Roommate). Calm navigation reassurance active.',
    });

    // Fire Bedrock Live Turn
    await executeDeterrentTurn('START_CALL', speechSnippet || 'blue keys on the table');
  }, [speechSnippet, executeDeterrentTurn]);

  // Action: Threat Escalation [2]
  const handleTriggerEscalation = useCallback(async () => {
    setIsCallActive(true);
    setIsEscalated(true);
    await executeDeterrentTurn('FORCE_ESCALATE', speechSnippet || 'Hey who is that back off!');
  }, [speechSnippet, executeDeterrentTurn]);

  // Action: Phone Drop Detection [3]
  const handleTriggerPhoneDrop = useCallback(async () => {
    await realtimeMeshAdapter.publishEvent({
      id: sessionIncidentIdRef.current || `inc_${Date.now().toString(36)}`,
      type: 'PHONE_DROP_DETECTED',
      threatLevel: 'CRITICAL',
      triggerSource: 'ACCELEROMETER_DROP',
      location: { lat: VICTIM_INITIAL_COORDS.lat, lng: VICTIM_INITIAL_COORDS.lng },
      notes: 'Accelerometer freefall/impact detected! Immediate SOS mesh alert broadcasted.',
    });
  }, []);

  // Action: Trigger Offline SNS SOS Beacon [4]
  const handleTriggerSnsSos = useCallback(async () => {
    try {
      const res = await fetch('/api/sos-fallback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incidentId: sessionIncidentIdRef.current || `inc_${Date.now().toString(36)}`,
          triggerType: 'MANUAL_SOS_BEACON',
          threatLevel: 'CRITICAL',
          location: { lat: VICTIM_INITIAL_COORDS.lat, lng: VICTIM_INITIAL_COORDS.lng },
          notes: 'Manual offline emergency SOS beacon dispatched via SNS',
        }),
      });
      const data = await res.json();
      if (data.snsMessageId) {
        setSnsReceiptId(data.snsMessageId);
      }
    } catch (err) {
      console.warn('[MobileShell] SOS Fallback error:', err);
    }
  }, []);

  // Action: Reset Demo [0]
  const handleResetDemo = useCallback(async () => {
    requestSeqRef.current += 1;
    abortControllerRef.current?.abort();
    deterrentVoiceAdapter.stopAudio();
    setIsCallActive(false);
    setIsEscalated(false);
    setDispatchedResponder(null);
    setSpeechSnippet('');
    setConversationHistory([]);
    sessionIncidentIdRef.current = null;
    setMicSuspended(false);
    setIsLoadingTurn(false);
    setSnsReceiptId(null);
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
          <Wifi className={`w-3.5 h-3.5 ${networkStatus === 'APPSYNC_LIVE' || networkStatus === 'SSE_FALLBACK' ? 'text-cyan-400' : 'text-slate-500'}`} />
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
                PWA v2.0
              </span>
            </div>
            <p className="text-[10px] text-slate-400">UC Berkeley Campus Corridor</p>
          </div>
        </div>

        {/* Live Mesh Status Pill */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[10px]">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              networkStatus === 'APPSYNC_LIVE'
                ? 'bg-emerald-400 animate-pulse'
                : networkStatus === 'SSE_FALLBACK'
                ? 'bg-amber-400'
                : 'bg-cyan-400 animate-ping'
            }`}
          />
          <span className="text-slate-300 font-mono">
            {networkStatus === 'APPSYNC_LIVE'
              ? 'APPSYNC WS'
              : networkStatus === 'SSE_FALLBACK'
              ? 'SSE FALLBACK'
              : 'CONNECTING'}
          </span>
        </div>
      </div>

      {/* Unified Compact Cloud Services Status Pill Bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-slate-950/90 border-b border-slate-800/60 text-[9px] font-mono text-slate-400 z-20">
        <span className="flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-emerald-400" />
          Nova/Polly: {engineStatus?.source === 'aws-live' ? 'LIVE' : 'AUTO'}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-emerald-400" />
          Location+DDB: LIVE
        </span>
        <span className="flex items-center gap-1">
          <span className={`w-1 h-1 rounded-full ${networkStatus === 'APPSYNC_LIVE' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          AppSync: {networkStatus === 'APPSYNC_LIVE' ? 'LIVE' : 'SSE'}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-emerald-400" />
          SNS: {snsReceiptId ? 'SENT' : 'READY'}
        </span>
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
            onEndCall={() => {
              deterrentVoiceAdapter.stopAudio();
              setIsCallActive(false);
              setMicSuspended(false);
            }}
            liveTranscriptSnippet={speechSnippet}
            spokenReply={spokenReply}
            detectedCue={detectedCue}
            engineStatus={engineStatus}
            isLoadingTurn={isLoadingTurn}
          />
        )}
      </div>

      {/* Bottom Controls & Activation Section */}
      <div className="p-3 bg-slate-950/90 backdrop-blur-md border-t border-slate-800/80 z-20">
        <StealthListener
          isArmed={isArmed}
          onToggleArmed={() => {
            try {
              (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent?.requestPermission?.().catch(() => {});
            } catch {
              // ignore
            }
            setIsArmed(!isArmed);
          }}
          onTriggerStealth={handleTriggerStealth}
          onTriggerEscalation={handleTriggerEscalation}
          onTriggerPhoneDrop={handleTriggerPhoneDrop}
          onTriggerSnsSos={handleTriggerSnsSos}
          onResetDemo={handleResetDemo}
          isCallActive={isCallActive}
          snsReceiptId={snsReceiptId}
          onSpeechRecognized={(transcript) => {
            setSpeechSnippet(transcript);
            // If call is active and user is talking, trigger ambient turn
            if (isCallActive && transcript.length > 5 && !micSuspended) {
              executeDeterrentTurn('AMBIENT_TURN', transcript);
            }
          }}
          micSuspended={micSuspended}
          engineStatus={engineStatus}
        />
      </div>
    </div>
  );
}

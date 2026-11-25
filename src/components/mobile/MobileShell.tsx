'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import {
  Shield,
  CheckCircle2,
  Wifi,
  Battery,
  Navigation,
  Compass,
  Radio,
  WifiOff,
  AlertTriangle,
  Play,
  Square,
} from 'lucide-react';
import { SafeHaven, SentinelEvent, ResponderInfo, Coordinates } from '@/types/sentinel';
import { realtimeMeshAdapter, MeshTransportStatus } from '@/lib/aws/realtimeMeshAdapter';
import { deterrentVoiceAdapter } from '@/lib/aws/deterrentVoiceAdapter';
import { pcmRingBuffer } from '@/lib/audio/pcmRingBuffer';
import { sanitizeRoom } from '@/lib/room';
import {
  enqueueOfflineSos,
  getQueuedSosBeacons,
  clearQueuedSosBeacons,
  QueuedSosBeacon,
} from '@/lib/offlineQueue';
import StealthListener from './StealthListener';
import DeterrentCallUI from './DeterrentCallUI';
import { VICTIM_INITIAL_COORDS, BRIGHTEST_ROUTE } from '@/lib/mockData';
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
  const searchParams = useSearchParams();
  const room = sanitizeRoom(searchParams.get('room'));

  const [isArmed, setIsArmed] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<'brightest' | 'standard'>('brightest');
  const [selectedSafeHaven, setSelectedSafeHaven] = useState<SafeHaven | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isEscalated, setIsEscalated] = useState(false);
  const [dispatchedResponder, setDispatchedResponder] = useState<ResponderInfo | null>(null);
  const [speechSnippet, setSpeechSnippet] = useState<string>('');
  const [networkStatus, setNetworkStatus] = useState<MeshTransportStatus>('connecting');
  const [snsReceiptId, setSnsReceiptId] = useState<string | null>(null);

  // Live Location & Walk Simulation States
  const [userCoords, setUserCoords] = useState<Coordinates>(VICTIM_INITIAL_COORDS);
  const [isWalkSimActive, setIsWalkSimActive] = useState(false);
  const [isRealGpsActive, setIsRealGpsActive] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Transcribe State
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeResult, setTranscribeResult] = useState<{
    transcript: string;
    latencyMs: number;
  } | null>(null);

  // Offline Dead-Zone Simulator & Queue States
  const [isOfflineSim, setIsOfflineSim] = useState(false);
  const [queuedSosCount, setQueuedSosCount] = useState(0);
  const [offlineSyncedReceipt, setOfflineSyncedReceipt] = useState<string | null>(null);

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
  const walkStepRef = useRef<number>(0);
  const lastPingTimeRef = useRef<number>(0);

  // Initial check of queued beacons
  useEffect(() => {
    setQueuedSosCount(getQueuedSosBeacons().length);
  }, []);

  // Save last known coordinates to localStorage for offline HTML emergency page
  useEffect(() => {
    if (typeof window !== 'undefined' && userCoords) {
      try {
        localStorage.setItem(
          'sentinel_last_known_coords',
          JSON.stringify(userCoords)
        );
      } catch {
        // ignore
      }
    }
  }, [userCoords]);

  // Subscribe to real-time event bus (AppSync / SSE) scoped to active room
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
      },
      room
    );

    return () => {
      unsubscribe();
    };
  }, [room]);

  /**
   * Flush queued offline SOS beacons sequentially upon reconnection
   */
  const flushOfflineQueue = useCallback(async () => {
    const beacons = getQueuedSosBeacons();
    if (beacons.length === 0) return;

    for (const b of beacons) {
      try {
        const res = await fetch('/api/sos-fallback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            incidentId: b.incidentId,
            room: b.room,
            triggerType: b.triggerType,
            threatLevel: b.threatLevel,
            location: b.coordinates,
            locationLabel: b.locationLabel,
            summary: `Queued dead-zone SOS: ${b.triggerType}`,
          }),
        });
        const data = await res.json();
        if (data.snsMessageId) {
          setOfflineSyncedReceipt(data.snsMessageId);
          setTimeout(() => setOfflineSyncedReceipt(null), 8000);
        }
      } catch (err) {
        console.warn('[MobileShell] Queue flush item error:', err);
      }
    }

    clearQueuedSosBeacons();
    setQueuedSosCount(0);
  }, []);

  // Automatic online sync when connectivity is restored
  useEffect(() => {
    const handleOnline = () => {
      if (!isOfflineSim) {
        flushOfflineQueue();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [isOfflineSim, flushOfflineQueue]);

  /**
   * Core orchestrator for Bedrock + Polly turns with race condition prevention
   */
  const executeDeterrentTurn = useCallback(
    async (
      phase: 'START_CALL' | 'AMBIENT_TURN' | 'FORCE_ESCALATE',
      transcriptText = ''
    ) => {
      if (!sessionIncidentIdRef.current) {
        sessionIncidentIdRef.current = `inc_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .substring(2, 6)}`;
      }

      requestSeqRef.current += 1;
      const currentSeq = requestSeqRef.current;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const ac = new AbortController();
      abortControllerRef.current = ac;

      // Stop audio & suspend mic for zero-echo gating
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

        setConversationHistory((prev) => [
          ...prev,
          { role: 'user', text: transcriptText || phase },
          { role: 'assistant', text: data.spokenReply },
        ]);

        if (data.threatDetected || phase === 'FORCE_ESCALATE') {
          setIsEscalated(true);
          await realtimeMeshAdapter.publishEvent(
            {
              id: sessionIncidentIdRef.current,
              room,
              type: 'THREAT_ESCALATED',
              threatLevel: data.threatLevel || 'CRITICAL',
              triggerSource:
                phase === 'FORCE_ESCALATE'
                  ? 'AI_AUDIO_ESCALATION'
                  : 'STEALTH_PHRASE',
              location: userCoords,
              transcriptSnippet: data.spokenReply,
              notes: `Threat detected by Bedrock (${data.modelUsed || 'Nova 2'}). Cue: ${data.detectedCue}`,
            },
            room
          );
        }

        // Resume mic 500ms after audio playback ends (Echo Gating)
        const resumeMic = () => {
          setTimeout(() => {
            if (currentSeq === requestSeqRef.current) {
              setMicSuspended(false);
              pcmRingBuffer.notifyPollyEnded();
            }
          }, 500);
        };

        if (data.audioBase64) {
          await deterrentVoiceAdapter.playPollyAudio(
            data.audioBase64,
            resumeMic,
            (err) => {
              console.warn('[MobileShell] Polly playback warning, using speech synthesis:', err);
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
          return;
        }
        console.error('[MobileShell] Deterrent turn error:', err);
        if (currentSeq === requestSeqRef.current) {
          setIsLoadingTurn(false);
          setMicSuspended(false);
        }
      }
    },
    [conversationHistory, selectedRouteId, room, userCoords]
  );

  // Action: Trigger Stealth Cover Call [1]
  const handleTriggerStealth = useCallback(async () => {
    setIsCallActive(true);
    setIsEscalated(false);

    await realtimeMeshAdapter.publishEvent(
      {
        id: sessionIncidentIdRef.current || `inc_${Date.now().toString(36)}`,
        room,
        type: 'STEALTH_TRIGGERED',
        threatLevel: 'LOW',
        triggerSource: 'STEALTH_PHRASE',
        location: userCoords,
        transcriptSnippet: speechSnippet || 'blue keys on the table',
        notes: 'Cover call initiated with Maya (Roommate). Calm navigation reassurance active.',
      },
      room
    );

    await executeDeterrentTurn('START_CALL', speechSnippet || 'blue keys on the table');
  }, [speechSnippet, executeDeterrentTurn, room, userCoords]);

  // Action: Threat Escalation [2]
  const handleTriggerEscalation = useCallback(async () => {
    setIsCallActive(true);
    setIsEscalated(true);
    await executeDeterrentTurn('FORCE_ESCALATE', speechSnippet || 'Hey who is that back off!');
  }, [speechSnippet, executeDeterrentTurn]);

  // Action: Phone Drop Detection [3]
  const handleTriggerPhoneDrop = useCallback(async () => {
    await realtimeMeshAdapter.publishEvent(
      {
        id: sessionIncidentIdRef.current || `inc_${Date.now().toString(36)}`,
        room,
        type: 'PHONE_DROP_DETECTED',
        threatLevel: 'CRITICAL',
        triggerSource: 'ACCELEROMETER_DROP',
        location: userCoords,
        notes: 'Accelerometer freefall/impact detected! Immediate SOS mesh alert broadcasted.',
      },
      room
    );
  }, [room, userCoords]);

  // Action: Trigger Offline SNS SOS Beacon [4]
  const handleTriggerSnsSos = useCallback(async () => {
    const isEffectiveOffline = !navigator.onLine || isOfflineSim;

    if (isEffectiveOffline) {
      // Offline Outbox Enqueue
      const beacon: QueuedSosBeacon = {
        eventId: `evt_offline_${Date.now()}`,
        incidentId: sessionIncidentIdRef.current || `inc_${Date.now().toString(36)}`,
        room,
        triggerType: 'MANUAL_SOS_BEACON',
        threatLevel: 'CRITICAL',
        coordinates: userCoords,
        locationLabel: 'Campus Dead-Zone Corridor',
        queuedAt: Date.now(),
      };
      enqueueOfflineSos(beacon);
      setQueuedSosCount((prev) => prev + 1);
      return;
    }

    try {
      const res = await fetch('/api/sos-fallback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incidentId: sessionIncidentIdRef.current || `inc_${Date.now().toString(36)}`,
          room,
          triggerType: 'MANUAL_SOS_BEACON',
          threatLevel: 'CRITICAL',
          location: userCoords,
          locationLabel: 'Campus Corridor',
          notes: 'Manual emergency SOS beacon dispatched via SNS',
        }),
      });
      const data = await res.json();
      if (data.snsMessageId) {
        setSnsReceiptId(data.snsMessageId);
      }
    } catch (err) {
      console.warn('[MobileShell] SOS Fallback error:', err);
    }
  }, [isOfflineSim, room, userCoords]);

  // Action: Analyze Live Ambient Audio via Amazon Transcribe [6]
  const handleAnalyzeTranscribe = useCallback(async () => {
    if (isTranscribing) return;
    setIsTranscribing(true);

    try {
      const wavBytes = pcmRingBuffer.exportLastNSecondsWav(4);
      const blob = new Blob([wavBytes as BlobPart], { type: 'audio/wav' });

      const fd = new FormData();
      fd.append('audio', blob, 'ambient.wav');
      fd.append('room', room);

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: fd,
      });

      const data = await res.json();
      if (data.ok && data.transcript) {
        setTranscribeResult({
          transcript: data.transcript,
          latencyMs: data.latencyMs || 0,
        });
        setSpeechSnippet(data.transcript);

        // Forward to Bedrock if call is active or threat words detected
        const lower = data.transcript.toLowerCase();
        const hasThreat = ['stop', 'back off', 'give me', 'help', 'away'].some((kw) =>
          lower.includes(kw)
        );

        if (isCallActive || hasThreat) {
          executeDeterrentTurn(hasThreat ? 'FORCE_ESCALATE' : 'AMBIENT_TURN', data.transcript);
        }
      }
    } catch (err) {
      console.warn('[MobileShell] Transcribe API error:', err);
    } finally {
      setIsTranscribing(false);
    }
  }, [isTranscribing, room, isCallActive, executeDeterrentTurn]);

  // Action: Toggle Offline Dead-Zone Simulator [7]
  const handleToggleOffline = useCallback(() => {
    setIsOfflineSim((prev) => {
      const next = !prev;
      if (!next) {
        // Toggled back to online: flush queue
        setTimeout(() => flushOfflineQueue(), 200);
      }
      return next;
    });
  }, [flushOfflineQueue]);

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
    setTranscribeResult(null);
    setIsWalkSimActive(false);
    setIsOfflineSim(false);
    clearQueuedSosBeacons();
    setQueuedSosCount(0);
    setUserCoords(VICTIM_INITIAL_COORDS);
    walkStepRef.current = 0;
    await realtimeMeshAdapter.resetDemo(room);
  }, [room]);

  // Walk Simulator Routine: Interpolates user coordinates along Brightest Route polyline
  useEffect(() => {
    if (!isWalkSimActive) return;

    const coords = BRIGHTEST_ROUTE.coordinates;
    const interval = setInterval(() => {
      walkStepRef.current = (walkStepRef.current + 1) % coords.length;
      const [lng, lat] = coords[walkStepRef.current];
      const nextCoord = { lat, lng };
      setUserCoords(nextCoord);

      // Throttled LOCATION_PING broadcast every 3 seconds
      const now = Date.now();
      if (now - lastPingTimeRef.current >= 3000) {
        lastPingTimeRef.current = now;
        realtimeMeshAdapter
          .publishEvent(
            {
              type: 'LOCATION_PING',
              room,
              coordinates: nextCoord,
              location: nextCoord,
              mode: 'WALK_SIM',
            },
            room
          )
          .catch(() => {});
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isWalkSimActive, room]);

  // Real GPS Watcher
  useEffect(() => {
    if (!isRealGpsActive) return;
    if (!navigator.geolocation) {
      setGpsError('Geolocation API not supported on this browser');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError(null);
        const nextCoord = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setUserCoords(nextCoord);

        const now = Date.now();
        if (now - lastPingTimeRef.current >= 3000) {
          lastPingTimeRef.current = now;
          realtimeMeshAdapter
            .publishEvent(
              {
                type: 'LOCATION_PING',
                room,
                coordinates: nextCoord,
                location: nextCoord,
                mode: 'DEVICE_GPS',
              },
              room
            )
            .catch(() => {});
        }
      },
      (err) => {
        setGpsError(err.message || 'GPS permission denied');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isRealGpsActive, room]);

  const isEffectiveOffline = !navigator.onLine || isOfflineSim;

  return (
    <div className="relative flex flex-col h-full min-h-[640px] max-w-[430px] mx-auto bg-[#070b14] text-slate-100 rounded-3xl shadow-2xl border border-slate-800/80 overflow-hidden select-none">
      {/* Phone Status Header */}
      <div className="flex items-center justify-between px-5 pt-3 pb-2 bg-[#070b14] border-b border-slate-800/60 z-20">
        <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-slate-300">
          <span>9:41</span>
        </div>
        <div className="h-4 w-28 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-slate-800 mr-2" />
          <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
        </div>
        <div className="flex items-center gap-2 text-slate-400 text-xs">
          {isEffectiveOffline ? (
            <WifiOff className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <Wifi
              className={`w-3.5 h-3.5 ${
                networkStatus === 'APPSYNC_LIVE' || networkStatus === 'SSE_FALLBACK'
                  ? 'text-cyan-400'
                  : 'text-slate-500'
              }`}
            />
          )}
          <Battery className="w-4 h-4 text-slate-300" />
        </div>
      </div>

      {/* App Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950/70 backdrop-blur-md border-b border-slate-800/50 z-20">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-950 border border-cyan-800/80 text-cyan-400">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xs font-bold tracking-tight text-white">SENTINEL AI</h1>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-900/50 text-cyan-300 border border-cyan-700/50">
                Room: {room}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">UC Berkeley Safe Corridor</p>
          </div>
        </div>

        {/* Live Mesh Status Pill */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[10px]">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isEffectiveOffline
                ? 'bg-amber-400'
                : networkStatus === 'APPSYNC_LIVE'
                ? 'bg-emerald-400 animate-pulse'
                : 'bg-cyan-400 animate-ping'
            }`}
          />
          <span className="text-slate-300 font-mono">
            {isEffectiveOffline ? 'OFFLINE' : networkStatus === 'APPSYNC_LIVE' ? 'MESH LIVE' : 'SYNCING'}
          </span>
        </div>
      </div>

      {/* Walk Simulator & GPS Tracking Sub-Header */}
      <div className="flex items-center justify-between px-3 py-1 bg-slate-900/70 border-b border-slate-800/70 text-[10px] font-mono text-slate-300 z-20">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setIsWalkSimActive(!isWalkSimActive);
              if (isRealGpsActive) setIsRealGpsActive(false);
            }}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors ${
              isWalkSimActive
                ? 'bg-cyan-950 border-cyan-500 text-cyan-200 font-bold'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {isWalkSimActive ? <Square className="w-2.5 h-2.5 fill-current" /> : <Play className="w-2.5 h-2.5 fill-current" />}
            <span>Walk Sim {isWalkSimActive ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsRealGpsActive(!isRealGpsActive);
              if (isWalkSimActive) setIsWalkSimActive(false);
            }}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors ${
              isRealGpsActive
                ? 'bg-emerald-950 border-emerald-500 text-emerald-200 font-bold'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Compass className="w-2.5 h-2.5" />
            <span>Real GPS</span>
          </button>
        </div>

        <div className="flex items-center gap-1 text-[9px] text-slate-400">
          <span>{userCoords.lat.toFixed(4)}, {userCoords.lng.toFixed(4)}</span>
        </div>
      </div>

      {/* GPS Error Pill */}
      {gpsError && (
        <div className="px-3 py-1 bg-rose-950/80 border-b border-rose-800 text-[10px] text-rose-300 flex items-center gap-1 z-20">
          <AlertTriangle className="w-3 h-3 text-rose-400" />
          <span>{gpsError}</span>
        </div>
      )}

      {/* Offline Dead-Zone Alert Banner */}
      {isEffectiveOffline && (
        <div className="bg-amber-950/95 border-b border-amber-500/80 px-3 py-2 z-20 animate-in slide-in-from-top duration-200">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-200">
              <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
              <span>OFFLINE DEAD-ZONE — SMS &amp; QUEUE ARMED</span>
            </div>
            {queuedSosCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-amber-900 border border-amber-700 text-[10px] font-mono text-amber-200">
                {queuedSosCount} Queued
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <a
              href={`sms:?body=${encodeURIComponent(
                `🚨 SENTINEL SOS BEACON (DEAD-ZONE)\nROOM: ${room}\nGPS: https://maps.google.com/?q=${userCoords.lat.toFixed(5)},${userCoords.lng.toFixed(5)}\nThreat escalation detected offline.`
              )}`}
              className="flex-1 text-center py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] shadow-sm transition-colors"
            >
              📱 Tap for Native Carrier SMS SOS
            </a>
          </div>
        </div>
      )}

      {/* Queued SOS Synced Confirmation Pill */}
      {offlineSyncedReceipt && (
        <div className="bg-emerald-950/95 border-b border-emerald-500/80 px-3 py-1.5 text-[10px] font-mono text-emerald-300 flex items-center justify-between z-20 animate-in slide-in-from-top duration-300">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Queued SOS Synced &rarr; AWS SNS:
          </span>
          <span className="truncate max-w-[150px]">{offlineSyncedReceipt}</span>
        </div>
      )}

      {/* Dispatched Responder Alert Confirmation Banner */}
      {dispatchedResponder && (
        <div className="bg-emerald-950/90 border-b border-emerald-500/80 px-4 py-2 z-20 animate-in slide-in-from-top duration-300">
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
          userLocation={userCoords}
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
          onAnalyzeTranscribe={handleAnalyzeTranscribe}
          onToggleOffline={handleToggleOffline}
          onResetDemo={handleResetDemo}
          isCallActive={isCallActive}
          snsReceiptId={snsReceiptId}
          isOffline={isEffectiveOffline}
          isTranscribing={isTranscribing}
          transcribeResult={transcribeResult}
          onSpeechRecognized={(transcript) => {
            setSpeechSnippet(transcript);
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

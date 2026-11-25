'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Mic,
  MicOff,
  ShieldAlert,
  Zap,
  PhoneCall,
  RotateCcw,
  Volume2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Radio,
  WifiOff,
  Wifi,
} from 'lucide-react';
import { VOICE_SCRIPTS } from '@/lib/mockData';
import { pcmRingBuffer } from '@/lib/audio/pcmRingBuffer';

interface StealthListenerProps {
  isArmed: boolean;
  onToggleArmed: () => void;
  onTriggerStealth: () => void;
  onTriggerEscalation: () => void;
  onTriggerPhoneDrop: () => void;
  onTriggerSnsSos?: () => void;
  onAnalyzeTranscribe?: () => void;
  onToggleOffline?: () => void;
  onResetDemo: () => void;
  isCallActive: boolean;
  onSpeechRecognized: (transcript: string) => void;
  micSuspended?: boolean;
  snsReceiptId?: string | null;
  isOffline?: boolean;
  isTranscribing?: boolean;
  transcribeResult?: { transcript: string; latencyMs: number } | null;
  engineStatus?: {
    source: 'aws-live' | 'mock-fallback';
    modelUsed?: string;
    latencyMs?: number;
    fallbackReason?: string;
  } | null;
}

export default function StealthListener({
  isArmed,
  onToggleArmed,
  onTriggerStealth,
  onTriggerEscalation,
  onTriggerPhoneDrop,
  onTriggerSnsSos,
  onAnalyzeTranscribe,
  onToggleOffline,
  onResetDemo,
  isCallActive,
  onSpeechRecognized,
  micSuspended = false,
  snsReceiptId,
  isOffline = false,
  isTranscribing = false,
  transcribeResult,
  engineStatus,
}: StealthListenerProps) {
  const [speechSupported, setSpeechSupported] = useState<boolean>(true);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Initialize Web Speech API & Web Audio PCM ring buffer capture
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Web Speech API
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setSpeechSupported(false);
    } else {
      setSpeechSupported(true);
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        if (micSuspended) return; // Discard buffered speech during echo gate

        let current = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          current += event.results[i][0].transcript;
        }
        const lower = current.trim().toLowerCase();
        onSpeechRecognized(lower);

        // Check for zero-touch stealth activation phrase
        if (lower.includes(VOICE_SCRIPTS.stealthPhrase) && !isCallActive) {
          onTriggerStealth();
        }

        // Check for threat keywords during active call
        const hasThreatKeyword = VOICE_SCRIPTS.threatKeywords.some((kw) =>
          lower.includes(kw)
        );
        if (hasThreatKeyword && isCallActive) {
          onTriggerEscalation();
        }
      };

      recognition.onerror = () => {
        // restart silently if armed
        if (isArmed && !micSuspended) {
          try {
            recognition.start();
          } catch {
            // ignore
          }
        }
      };

      recognitionRef.current = recognition;
    }

    // 2. Continuous 16 kHz Audio Recording into pcmRingBuffer for Amazon Transcribe
    const startPcmMic = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return;
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        mediaStreamRef.current = stream;

        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx({ sampleRate: 16000 });
        audioContextRef.current = ctx;

        const sourceNode = ctx.createMediaStreamSource(stream);
        // ScriptProcessor with 4096 sample buffer size
        const processorNode = ctx.createScriptProcessor(4096, 1, 1);

        processorNode.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          const int16Array = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          pcmRingBuffer.write(int16Array);
        };

        sourceNode.connect(processorNode);
        processorNode.connect(ctx.destination);
      } catch (err) {
        console.warn('[StealthListener] Mic audio stream init note:', err);
      }
    };

    startPcmMic();

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [isCallActive, micSuspended, onSpeechRecognized, onTriggerEscalation, onTriggerStealth]);

  // Handle Arm/Disarm transitions
  useEffect(() => {
    if (!recognitionRef.current) return;

    if (isArmed && !micSuspended) {
      try {
        recognitionRef.current.start();
      } catch {
        // already started
      }
    } else {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
  }, [isArmed, micSuspended]);

  // Global Stage keyboard shortcuts (1, 2, 3, 4, 6, 7, 0)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      const isInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (isInput) return;

      if (e.key === '1') {
        e.preventDefault();
        onTriggerStealth();
      } else if (e.key === '2') {
        e.preventDefault();
        onTriggerEscalation();
      } else if (e.key === '3') {
        e.preventDefault();
        onTriggerPhoneDrop();
      } else if (e.key === '4') {
        e.preventDefault();
        onTriggerSnsSos?.();
      } else if (e.key === '6') {
        e.preventDefault();
        onAnalyzeTranscribe?.();
      } else if (e.key === '7') {
        e.preventDefault();
        onToggleOffline?.();
      } else if (e.key === '0') {
        e.preventDefault();
        onResetDemo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    onTriggerStealth,
    onTriggerEscalation,
    onTriggerPhoneDrop,
    onTriggerSnsSos,
    onAnalyzeTranscribe,
    onToggleOffline,
    onResetDemo,
  ]);

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Arm Sentinel Primary Activation Button */}
      <div className="w-full">
        <button
          type="button"
          onClick={onToggleArmed}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-300 font-medium ${
            isArmed
              ? 'bg-emerald-950/70 border-emerald-500/70 text-emerald-200 shadow-lg shadow-emerald-950/60 ring-1 ring-emerald-500/50'
              : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:border-slate-600 hover:bg-slate-800/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`p-2 rounded-lg ${
                isArmed
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/40'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {isArmed ? (
                <Mic className={`w-4 h-4 ${micSuspended ? 'opacity-40' : 'animate-pulse'}`} />
              ) : (
                <MicOff className="w-4 h-4" />
              )}
            </span>
            <div className="text-left">
              <div className="text-xs uppercase tracking-wider font-bold">
                {isArmed ? 'Sentinel Armed & Listening' : 'Sentinel Inactive'}
              </div>
              <div className="text-[11px] text-slate-400">
                {isArmed
                  ? micSuspended
                    ? 'Maya speaking (mic gated)'
                    : 'Zero-touch voice phrase active'
                  : 'Tap to arm passive protection'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {speechSupported ? (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                  isArmed
                    ? micSuspended
                      ? 'bg-amber-950 text-amber-300 border border-amber-700/50'
                      : 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {isArmed ? (micSuspended ? 'ECHO GATED' : 'MIC ACTIVE') : 'STANDBY'}
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                AWS TRANSCRIBE MIC
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Passive Phrase Indicator Bar */}
      {isArmed && (
        <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
            Stealth Cover Phrase:
          </span>
          <span className="font-mono text-cyan-300 font-medium">
            &ldquo;{VOICE_SCRIPTS.stealthPhrase}&rdquo;
          </span>
        </div>
      )}

      {/* Stage Demo Quick Controls Pill (Collapsible) */}
      <div className="mt-1 bg-slate-950/90 border border-slate-800/90 rounded-xl overflow-hidden shadow-xl">
        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/60 border-b border-slate-800/60">
          <button
            type="button"
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Stage Demo Hotkeys</span>
            {drawerOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>

          {/* Engine Status Badge */}
          {engineStatus?.source === 'aws-live' ? (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/90 border border-emerald-500/80 text-emerald-300 text-[9px] font-mono"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>AWS LIVE • Bedrock + Polly ({engineStatus.latencyMs}ms)</span>
            </div>
          ) : engineStatus?.source === 'mock-fallback' ? (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/90 border border-amber-600/80 text-amber-300 text-[9px] font-mono"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>MOCK FALLBACK</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 text-[9px] font-mono">
              <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
              <span>STAGE OPS READY</span>
            </div>
          )}
        </div>

        {drawerOpen && (
          <div className="p-2.5 grid grid-cols-2 gap-2 text-[11px]">
            {/* [1] Trigger Stealth Phrase */}
            <button
              type="button"
              onClick={onTriggerStealth}
              className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 text-slate-200 transition-all text-left"
            >
              <div className="flex items-center gap-1.5 truncate">
                <PhoneCall className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="truncate">Stealth Call</span>
              </div>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-cyan-300">
                1
              </kbd>
            </button>

            {/* [2] Threat Escalation */}
            <button
              type="button"
              onClick={onTriggerEscalation}
              className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 text-slate-200 transition-all text-left"
            >
              <div className="flex items-center gap-1.5 truncate">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">Escalate AI</span>
              </div>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-amber-300">
                2
              </kbd>
            </button>

            {/* [3] Phone Drop Simulation */}
            <button
              type="button"
              onClick={onTriggerPhoneDrop}
              className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-rose-500/50 text-slate-200 transition-all text-left"
            >
              <div className="flex items-center gap-1.5 truncate">
                <Zap className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span className="truncate">Phone Drop</span>
              </div>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-rose-300">
                3
              </kbd>
            </button>

            {/* [4] Trigger Offline SNS SOS Beacon */}
            <button
              type="button"
              onClick={onTriggerSnsSos}
              className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 text-slate-200 transition-all text-left"
            >
              <div className="flex items-center gap-1.5 truncate">
                <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">SNS SOS Beacon</span>
              </div>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-emerald-300">
                4
              </kbd>
            </button>

            {/* [6] Analyze Live Ambient Audio (Amazon Transcribe) */}
            <button
              type="button"
              onClick={onAnalyzeTranscribe}
              disabled={isTranscribing}
              className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-cyan-400 text-slate-200 transition-all text-left disabled:opacity-50"
            >
              <div className="flex items-center gap-1.5 truncate">
                <Radio className={`w-3.5 h-3.5 text-cyan-400 shrink-0 ${isTranscribing ? 'animate-spin' : ''}`} />
                <span className="truncate">{isTranscribing ? 'Transcribing...' : 'Transcribe Mic'}</span>
              </div>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-cyan-300">
                6
              </kbd>
            </button>

            {/* [7] Toggle Offline Dead-Zone Simulator */}
            <button
              type="button"
              onClick={onToggleOffline}
              className={`flex items-center justify-between p-2 rounded-lg border transition-all text-left ${
                isOffline
                  ? 'bg-amber-950/80 border-amber-500 text-amber-200 font-bold'
                  : 'bg-slate-900/80 hover:bg-slate-800 border-slate-800 text-slate-200'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                {isOffline ? (
                  <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                ) : (
                  <Wifi className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                )}
                <span className="truncate">{isOffline ? 'Dead-Zone ON' : 'Dead-Zone Sim'}</span>
              </div>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-amber-300">
                7
              </kbd>
            </button>

            {/* [0] Reset Demo State */}
            <button
              type="button"
              onClick={onResetDemo}
              className="col-span-2 flex items-center justify-between p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-slate-600 text-slate-300 transition-all text-left"
            >
              <div className="flex items-center gap-1.5 truncate">
                <RotateCcw className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">Reset Demo</span>
              </div>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-400">
                0
              </kbd>
            </button>
          </div>
        )}

        {/* Live Transcribe Analysis Result Strip */}
        {transcribeResult && (
          <div className="px-3 py-1.5 bg-cyan-950/60 border-t border-cyan-800/60 flex items-center justify-between text-[10px] font-mono text-cyan-300">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Transcribe ({transcribeResult.latencyMs}ms):
            </span>
            <span className="truncate max-w-[200px]" title={transcribeResult.transcript}>
              &ldquo;{transcribeResult.transcript}&rdquo;
            </span>
          </div>
        )}

        {/* SNS Message Receipt Badge */}
        {snsReceiptId && (
          <div className="px-3 py-1.5 bg-emerald-950/60 border-t border-emerald-800/60 flex items-center justify-between text-[10px] font-mono text-emerald-300">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              SNS Beacon Dispatched:
            </span>
            <span className="truncate max-w-[170px]" title={snsReceiptId}>
              {snsReceiptId}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

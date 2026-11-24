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
} from 'lucide-react';
import { VOICE_SCRIPTS } from '@/lib/mockData';

interface StealthListenerProps {
  isArmed: boolean;
  onToggleArmed: () => void;
  onTriggerStealth: () => void;
  onTriggerEscalation: () => void;
  onTriggerPhoneDrop: () => void;
  onResetDemo: () => void;
  isCallActive: boolean;
  onSpeechRecognized: (transcript: string) => void;
}

export default function StealthListener({
  isArmed,
  onToggleArmed,
  onTriggerStealth,
  onTriggerEscalation,
  onTriggerPhoneDrop,
  onResetDemo,
  isCallActive,
  onSpeechRecognized,
}: StealthListenerProps) {
  const [speechSupported, setSpeechSupported] = useState<boolean>(true);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(true);
  const [lastTranscript, setLastTranscript] = useState<string>('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Initialize Web Speech API & Passive Auto-Restart Loop
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setSpeechSupported(false);
      return;
    }

    setSpeechSupported(true);
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let current = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        current += event.results[i][0].transcript;
      }
      const lower = current.trim().toLowerCase();
      setLastTranscript(lower);
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

    recognition.onerror = (e) => {
      // Ignore routine 'no-speech' or 'aborted' errors; recognition will auto-restart
      if (e.error !== 'no-speech') {
        console.warn('[StealthListener] SpeechRecognition error:', e.error);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // Auto-restart if still armed
      if (isArmed && recognitionRef.current) {
        try {
          recognition.start();
        } catch {
          // May throw if restarting too rapidly
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    };
  }, [isArmed, isCallActive, onTriggerStealth, onTriggerEscalation, onSpeechRecognized]);

  // Handle Arm / Disarm Toggle
  const handleToggle = useCallback(async () => {
    // Unlock iOS DeviceMotionEvent permission if required
    if (
      typeof window !== 'undefined' &&
      window.DeviceMotionEvent &&
      typeof window.DeviceMotionEvent.requestPermission === 'function'
    ) {
      try {
        await window.DeviceMotionEvent.requestPermission();
      } catch {
        // user denied or ignored
      }
    }

    // Toggle arming state
    if (!isArmed) {
      onToggleArmed();
      try {
        recognitionRef.current?.start();
      } catch {
        // ignore if already started
      }
    } else {
      onToggleArmed();
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
    }
  }, [isArmed, onToggleArmed]);

  // Accelerometer Drop Listener
  useEffect(() => {
    if (!isArmed || typeof window === 'undefined') return;

    let lastMagnitude = 0;
    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity || event.acceleration;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
      // Sudden spike above 28 m/s² indicates impact or freefall drop
      if (magnitude > 28 && Math.abs(magnitude - lastMagnitude) > 18) {
        console.warn('[StealthListener] Hardware drop spike detected:', magnitude);
        onTriggerPhoneDrop();
      }
      lastMagnitude = magnitude;
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => {
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [isArmed, onTriggerPhoneDrop]);

  // Keyboard Shortcuts: [1], [2], [3], [0] with activeElement input guard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = document.activeElement;
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
      } else if (e.key === '0') {
        e.preventDefault();
        onResetDemo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onTriggerStealth, onTriggerEscalation, onTriggerPhoneDrop, onResetDemo]);

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Arm Sentinel Primary Activation Button */}
      <div className="w-full">
        <button
          type="button"
          onClick={handleToggle}
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
              {isArmed ? <Mic className="w-4 h-4 animate-pulse" /> : <MicOff className="w-4 h-4" />}
            </span>
            <div className="text-left">
              <div className="text-xs uppercase tracking-wider font-bold">
                {isArmed ? 'Sentinel Armed & Listening' : 'Sentinel Inactive'}
              </div>
              <div className="text-[11px] text-slate-400">
                {isArmed ? 'Zero-touch voice phrase active' : 'Tap to arm passive protection'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {speechSupported ? (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                  isArmed
                    ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {isArmed ? 'MIC ACTIVE' : 'STANDBY'}
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">
                MIC FALLBACK
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Passive Phrase Indicator Bar (Discreet appearance) */}
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
        <button
          type="button"
          onClick={() => setDrawerOpen(!drawerOpen)}
          className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-200 bg-slate-900/60 border-b border-slate-800/60 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            Stage Demo Hotkeys & Injections
          </span>
          {drawerOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>

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

            {/* [0] Reset Demo State */}
            <button
              type="button"
              onClick={onResetDemo}
              className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-slate-600 text-slate-300 transition-all text-left"
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
      </div>
    </div>
  );
}

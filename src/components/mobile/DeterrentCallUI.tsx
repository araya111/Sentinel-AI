'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
  ShieldAlert,
  Radio,
  User,
  Sparkles,
} from 'lucide-react';
import { deterrentVoiceAdapter } from '@/lib/aws/deterrentVoiceAdapter';
import { VOICE_SCRIPTS } from '@/lib/mockData';

interface DeterrentCallUIProps {
  isEscalated: boolean;
  onEscalate: () => void;
  onEndCall: () => void;
  liveTranscriptSnippet?: string;
}

export default function DeterrentCallUI({
  isEscalated,
  onEscalate,
  onEndCall,
  liveTranscriptSnippet,
}: DeterrentCallUIProps) {
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [transcriptStream, setTranscriptStream] = useState<string>('');
  const hasSpokenCalmRef = useRef(false);

  // Call duration counter
  useEffect(() => {
    const timer = setInterval(() => {
      setCallDurationSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format call timer (MM:SS)
  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Trigger spoken voice synthesis via deterrent voice adapter
  useEffect(() => {
    if (!isEscalated) {
      if (!hasSpokenCalmRef.current) {
        hasSpokenCalmRef.current = true;
        setTranscriptStream(VOICE_SCRIPTS.calm);
        deterrentVoiceAdapter.playCalmDeterrent();
      }
    } else {
      setTranscriptStream(VOICE_SCRIPTS.escalated);
      deterrentVoiceAdapter.playEscalatedDeterrent();
    }
  }, [isEscalated]);

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    deterrentVoiceAdapter.setMuted(nextMuted);
  };

  const handleEnd = () => {
    deterrentVoiceAdapter.cancel();
    onEndCall();
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-between p-6 bg-gradient-to-b from-slate-950/98 via-slate-900/98 to-slate-950/98 backdrop-blur-xl border border-cyan-500/30 rounded-2xl animate-in fade-in duration-300">
      {/* Top Bar: Call Status & Mode */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isEscalated ? 'bg-rose-500 animate-ping' : 'bg-emerald-400 animate-pulse'
            }`}
          />
          <span
            className={`text-xs font-semibold uppercase tracking-wider ${
              isEscalated ? 'text-rose-300' : 'text-emerald-300'
            }`}
          >
            {isEscalated ? 'CRITICAL DETERRENT ESCALATION' : 'ACTIVE DETERRENT CALL'}
          </span>
        </div>

        {/* Audio Mute / Unmute Toggle */}
        <button
          type="button"
          onClick={toggleMute}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
            isMuted
              ? 'bg-rose-950/60 border-rose-800 text-rose-300'
              : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
          }`}
          title="Toggle browser synthesized speech audio"
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          <span>{isMuted ? 'TTS Muted' : 'TTS Audio On'}</span>
        </button>
      </div>

      {/* Center Avatar & Caller Profile */}
      <div className="flex flex-col items-center text-center my-auto">
        <div className="relative mb-4">
          <div
            className={`absolute -inset-4 rounded-full filter blur-xl opacity-60 ${
              isEscalated ? 'bg-rose-600/40 animate-pulse' : 'bg-cyan-500/25 animate-pulse'
            }`}
          />
          <div
            className={`relative flex items-center justify-center w-24 h-24 rounded-full border-2 ${
              isEscalated
                ? 'bg-rose-950 border-rose-500 text-rose-300'
                : 'bg-slate-900 border-cyan-400 text-cyan-300'
            } shadow-2xl`}
          >
            <User className="w-12 h-12" />
          </div>
        </div>

        <h3 className="text-xl font-bold text-white tracking-tight">Maya (Roommate)</h3>
        <p className="text-xs font-medium text-slate-400 mt-0.5">Speakerphone ON • Direct Line</p>
        <p className="text-sm font-mono text-cyan-400 mt-1 font-semibold">
          {formatTimer(callDurationSeconds)}
        </p>

        {/* Dynamic Waveform Visualizer */}
        <div className="flex items-center justify-center gap-1.5 h-8 my-4">
          <span className={`w-1 rounded-full bg-cyan-400 animate-wave-1 ${isEscalated ? '!bg-rose-500' : ''}`} />
          <span className={`w-1 rounded-full bg-cyan-400 animate-wave-2 ${isEscalated ? '!bg-rose-500' : ''}`} />
          <span className={`w-1 rounded-full bg-cyan-400 animate-wave-3 ${isEscalated ? '!bg-rose-500' : ''}`} />
          <span className={`w-1 rounded-full bg-cyan-400 animate-wave-4 ${isEscalated ? '!bg-rose-500' : ''}`} />
          <span className={`w-1 rounded-full bg-cyan-400 animate-wave-5 ${isEscalated ? '!bg-rose-500' : ''}`} />
          <span className={`w-1 rounded-full bg-cyan-400 animate-wave-2 ${isEscalated ? '!bg-rose-500' : ''}`} />
          <span className={`w-1 rounded-full bg-cyan-400 animate-wave-4 ${isEscalated ? '!bg-rose-500' : ''}`} />
        </div>

        {/* Live Spoken Transcript Stream Box */}
        <div
          className={`w-full max-w-[340px] p-3.5 rounded-xl border text-left transition-all ${
            isEscalated
              ? 'bg-rose-950/40 border-rose-600/70 text-rose-100 shadow-lg shadow-rose-950/60'
              : 'bg-slate-900/80 border-slate-700/80 text-slate-200'
          }`}
        >
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-700/50 text-[10px] font-mono uppercase tracking-wider">
            <span className="flex items-center gap-1 text-cyan-400">
              <Sparkles className="w-3 h-3" />
              {isEscalated ? 'Bedrock Nova 2 Deterrent' : 'Bedrock Voice Synthesizer'}
            </span>
            <span className="text-slate-400">AWS Bedrock Mock</span>
          </div>
          <p className="text-xs italic leading-relaxed">&ldquo;{transcriptStream}&rdquo;</p>

          {liveTranscriptSnippet && (
            <div className="mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                Mic Ambient:
              </span>
              <span className="text-white">&ldquo;{liveTranscriptSnippet}&rdquo;</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls: Escalate & End Call */}
      <div className="flex items-center justify-between gap-3 mt-4">
        {!isEscalated ? (
          <button
            type="button"
            onClick={onEscalate}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-rose-900/50 transition-all active:scale-95"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Escalate Threat [2]</span>
          </button>
        ) : (
          <div className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-rose-950/90 border border-rose-600 text-rose-200 font-semibold text-xs animate-pulse">
            <Radio className="w-4 h-4 text-rose-400" />
            <span>Campus Security Alerted</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleEnd}
          className="flex items-center justify-center w-12 h-12 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/50 transition-all active:scale-95 shrink-0"
          title="End Call / Disarm"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import {
  SentinelEvent,
  PatrollingResponder,
  ResponderInfo,
  PersistedIncident,
} from '@/types/sentinel';
import { PATROLLING_RESPONDERS } from '@/lib/mockData';
import {
  ShieldAlert,
  Radio,
  Play,
  Square,
  Volume2,
  CheckCircle2,
  Send,
  Sparkles,
  RotateCcw,
  Database,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface IncidentFeedProps {
  activeIncident: SentinelEvent | null;
  recentEvents: SentinelEvent[];
  dispatchedResponder: ResponderInfo | null;
  onDispatchResponder: (responder: PatrollingResponder) => Promise<void>;
  onResetIncident: () => Promise<void>;
  selectedResponderId?: string | null;
  onSelectResponder?: (responder: PatrollingResponder) => void;
  persistedIncidents?: PersistedIncident[];
  cloudSource?: string;
  respondersList?: PatrollingResponder[];
}

export default function IncidentFeed({
  activeIncident,
  recentEvents,
  dispatchedResponder,
  onDispatchResponder,
  onResetIncident,
  selectedResponderId,
  onSelectResponder,
  persistedIncidents = [],
  cloudSource = 'aws-live',
  respondersList,
}: IncidentFeedProps) {
  const [isPlayingBuffer, setIsPlayingBuffer] = useState(false);
  const [bufferPlayhead, setBufferPlayhead] = useState(0);
  const [isDispatching, setIsDispatching] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const availableResponders = respondersList || PATROLLING_RESPONDERS;

  // Simulated 10-second acoustic buffer playback loop
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (isPlayingBuffer) {
      timer = setInterval(() => {
        setBufferPlayhead((prev) => {
          if (prev >= 10) {
            setIsPlayingBuffer(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      setBufferPlayhead(0);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlayingBuffer]);

  const handleDispatch = async (responder: PatrollingResponder) => {
    setIsDispatching(responder.id);
    try {
      await onDispatchResponder(responder);
    } finally {
      setIsDispatching(null);
    }
  };

  const bufferAmplitudes = [
    24, 32, 18, 45, 62, 85, 95, 90, 75, 40,
    35, 20, 50, 78, 92, 100, 88, 64, 30, 22,
    40, 55, 70, 85, 90, 95, 60, 45, 30, 20,
  ];

  return (
    <div className="flex flex-col h-full bg-[#080d1a] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Feed Header */}
      <div className="p-4 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-400">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight">
              INCIDENT COMMAND TELEMETRY
            </h2>
            <p className="text-[11px] text-slate-400 font-mono">
              Live Mesh • DynamoDB Persistence
            </p>
          </div>
        </div>

        {activeIncident && (
          <button
            type="button"
            onClick={onResetIncident}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] text-slate-300 font-medium transition-colors"
          >
            <RotateCcw className="w-3 h-3 text-slate-400" />
            <span>Reset Alert</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Active Incident Banner or Nominal Standby State */}
        {activeIncident ? (
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              activeIncident.threatLevel === 'CRITICAL'
                ? 'bg-rose-950/40 border-rose-600/80 shadow-lg shadow-rose-950/50'
                : 'bg-amber-950/30 border-amber-600/70 shadow-md shadow-amber-950/30'
            }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-rose-900/60 text-rose-300">
                  <ShieldAlert className="w-4 h-4 animate-bounce" />
                </span>
                <div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider block">
                    {activeIncident.type.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Trigger:{' '}
                    <strong className="text-rose-300">
                      {activeIncident.triggerSource}
                    </strong>
                  </span>
                </div>
              </div>

              <span
                className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                  activeIncident.threatLevel === 'CRITICAL'
                    ? 'bg-rose-600 text-white animate-pulse'
                    : 'bg-amber-500 text-slate-950'
                }`}
              >
                {activeIncident.threatLevel} THREAT
              </span>
            </div>

            {/* Victim Coordinates & Transcript Snippet */}
            <div className="mt-2.5 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                <span>GPS Telemetry:</span>
                <span className="text-cyan-300 font-semibold">
                  {activeIncident.location.lat.toFixed(5)}°N,{' '}
                  {activeIncident.location.lng.toFixed(5)}°W
                </span>
              </div>

              {activeIncident.transcriptSnippet && (
                <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px]">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                    Live Call Audio Transcript:
                  </span>
                  <p className="text-slate-200 italic">
                    &ldquo;{activeIncident.transcriptSnippet}&rdquo;
                  </p>
                </div>
              )}

              {/* Amazon SNS SOS Fallback Receipt */}
              {activeIncident.snsMessageId && (
                <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-700/60 flex items-center justify-between text-[11px] font-mono">
                  <div className="flex items-center gap-1.5 text-emerald-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-semibold">Amazon SNS SOS Receipt:</span>
                  </div>
                  <span className="text-emerald-200 text-[10px] truncate max-w-[180px]" title={activeIncident.snsMessageId}>
                    ID: {activeIncident.snsMessageId}
                  </span>
                </div>
              )}
            </div>

            {/* 10-Second Rolling Audio Buffer Visualizer */}
            <div className="mt-3 pt-3 border-t border-slate-800/80">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                  Pre-Trigger Audio Buffer (10s Ambient Window)
                </span>
                <button
                  type="button"
                  onClick={() => setIsPlayingBuffer(!isPlayingBuffer)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                    isPlayingBuffer
                      ? 'bg-rose-600 text-white'
                      : 'bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 border border-cyan-700/60'
                  }`}
                >
                  {isPlayingBuffer ? (
                    <>
                      <Square className="w-2.5 h-2.5 fill-current" /> Stop (0{bufferPlayhead}s)
                    </>
                  ) : (
                    <>
                      <Play className="w-2.5 h-2.5 fill-current" /> Play Buffer
                    </>
                  )}
                </button>
              </div>

              <div className="h-10 w-full flex items-end justify-between gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800/80">
                {bufferAmplitudes.map((amp, idx) => {
                  const isCurrent = Math.floor((bufferPlayhead / 10) * bufferAmplitudes.length) >= idx;
                  return (
                    <div
                      key={idx}
                      className="w-full rounded-xs transition-all duration-150"
                      style={{
                        height: `${Math.max(15, (amp / 100) * 100)}%`,
                        backgroundColor: isPlayingBuffer && isCurrent
                          ? '#06b6d4'
                          : amp > 70
                          ? '#f43f5e'
                          : '#334155',
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 text-center">
            <div className="w-8 h-8 mx-auto mb-2 rounded-full bg-cyan-950 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
              <Radio className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wide">
              Mesh Nominal & Listening
            </h3>
            <p className="text-[11px] text-slate-400 mt-1 max-w-[280px] mx-auto">
              Zero active alarms. {availableResponders.length} verified campus responders are currently positioned within the 500m safety perimeter.
            </p>
          </div>
        )}

        {/* Nearby Responders & Dispatch Actions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span className="uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              Available Mesh Responders (500m Perimeter)
            </span>
          </div>

          <div className="space-y-2">
            {availableResponders.map((responder) => {
              const isDispatched =
                dispatchedResponder && dispatchedResponder.id === responder.id;
              const isSelected = selectedResponderId === responder.id;

              return (
                <div
                  key={responder.id}
                  onClick={() => onSelectResponder?.(responder)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isDispatched
                      ? 'bg-emerald-950/40 border-emerald-500/80 ring-1 ring-emerald-500/40'
                      : isSelected
                      ? 'bg-slate-900 border-cyan-500/60'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-bold text-white">
                          {responder.name}
                        </h4>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-emerald-400 font-semibold">
                          ETA {responder.etaDisplay}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {responder.role}
                      </p>
                    </div>

                    <div>
                      {isDispatched ? (
                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-900/80 border border-emerald-700 text-emerald-200 text-xs font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          Dispatched
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isDispatching === responder.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDispatch(responder);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-cyan-900/50"
                        >
                          <Send className="w-3 h-3 fill-current" />
                          <span>
                            {isDispatching === responder.id
                              ? 'Routing...'
                              : 'Dispatch'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Collapsible Incident History (DynamoDB Persistence) */}
        <div className="pt-2 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-950/80 hover:bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <span>Incident History (DynamoDB Persistence)</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                {persistedIncidents.length}
              </span>
            </span>
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showHistory && (
            <div className="mt-2 space-y-2 max-h-[220px] overflow-y-auto">
              {persistedIncidents.length === 0 ? (
                <div className="text-[11px] text-slate-500 italic p-3 text-center bg-slate-950/40 rounded-lg">
                  No persisted incidents in DynamoDB yet. Trigger an alert to persist.
                </div>
              ) : (
                persistedIncidents.map((inc) => (
                  <div
                    key={inc.sk}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-cyan-300 font-semibold">
                        {inc.incidentId}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                          inc.status === 'ACTIVE'
                            ? 'bg-rose-900/60 text-rose-300 border border-rose-700/50'
                            : inc.status === 'DISPATCHED'
                            ? 'bg-amber-900/60 text-amber-300 border border-amber-700/50'
                            : 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                        }`}
                      >
                        {inc.status}
                      </span>
                    </div>

                    {inc.transcript && (
                      <p className="text-slate-300 italic text-[10px] line-clamp-2">
                        &ldquo;{inc.transcript}&rdquo;
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono pt-1 border-t border-slate-900">
                      <span>{inc.threatLevel} THREAT</span>
                      <span>
                        {new Date(inc.updatedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Live Event Timeline / Audit Trail */}
        <div className="pt-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Mesh Event Audit Trail
          </h4>

          <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
            {recentEvents.length === 0 ? (
              <div className="text-[11px] text-slate-500 italic py-2 text-center">
                Awaiting telemetry events...
              </div>
            ) : (
              recentEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/60 text-[11px]"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        evt.threatLevel === 'CRITICAL'
                          ? 'bg-rose-500'
                          : evt.threatLevel === 'HIGH'
                          ? 'bg-amber-400'
                          : 'bg-cyan-400'
                      }`}
                    />
                    <span className="font-semibold text-slate-200">
                      {evt.type}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400">
                    {new Date(evt.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

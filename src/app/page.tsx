'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Shield,
  Smartphone,
  LayoutDashboard,
  Columns,
  ExternalLink,
  Sparkles,
  Zap,
  Radio,
  MapPin,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export default function StageLauncherPage() {
  const [activeTab, setActiveTab] = useState<'split' | 'overview'>('split');
  const [isFullHeight, setIsFullHeight] = useState(false);

  return (
    <div className="min-h-screen bg-[#050811] text-slate-100 flex flex-col">
      {/* Top Navigation & Showcase Header */}
      <header className="px-5 py-3.5 bg-slate-950/95 border-b border-slate-800/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-slate-950 font-black shadow-lg shadow-cyan-950">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold tracking-tight text-white">
                SENTINEL AI
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-300">
                AWS BUILDER CONNECT SHOWCASE
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Proactive Navigation & Generative Deterrence PWA • Phase 1 Dual-Screen Stage Shell
            </p>
          </div>
        </div>

        {/* View Switcher & Direct Launchers */}
        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('split')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'split'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Split-Screen Stage Demo</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'overview'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Architecture & Guides</span>
            </button>
          </div>

          <div className="h-5 w-px bg-slate-800 hidden md:block" />

          {/* New Tab Direct Links */}
          <Link
            href="/mobile"
            target="_blank"
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-cyan-300 font-medium transition-colors"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile Screen</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </Link>

          <Link
            href="/dashboard"
            target="_blank"
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-emerald-300 font-medium transition-colors"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Command Center</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      {activeTab === 'split' ? (
        <div className="flex-1 p-3 md:p-4 flex flex-col">
          {/* Dual-Screen Stage Shell (Side-by-side iframes) */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-90px)] min-h-[700px]">
            {/* Left Screen: Mobile User PWA Frame (4.5 / 12 cols) */}
            <div className="lg:col-span-5 xl:col-span-4 flex flex-col bg-slate-950/70 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl">
              <div className="px-3.5 py-2 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                  <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                  Primary Screen: Student Mobile PWA (/mobile)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300">
                  Target: 430px
                </span>
              </div>
              <div className="flex-1 p-2 flex items-center justify-center bg-[#03060f]">
                <iframe
                  src="/mobile"
                  title="Sentinel AI Mobile PWA"
                  className="w-full h-full max-w-[430px] rounded-2xl border border-slate-800 shadow-2xl"
                />
              </div>
            </div>

            {/* Right Screen: Campus Security Command Center (/dashboard) */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col bg-slate-950/70 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl">
              <div className="px-3.5 py-2 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                  <LayoutDashboard className="w-3.5 h-3.5 text-emerald-400" />
                  Secondary Screen: Campus Command Center (/dashboard)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-300">
                  Real-time SSE Mesh
                </span>
              </div>
              <div className="flex-1 p-2 bg-[#03060f]">
                <iframe
                  src="/dashboard"
                  title="Sentinel AI Campus Responder Command"
                  className="w-full h-full rounded-2xl border border-slate-800 shadow-2xl"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Architecture & Overview Tab */
        <div className="flex-1 max-w-5xl mx-auto p-6 space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800/80">
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              AWS Builder Connect Stage Demo Architecture
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Sentinel AI solves late-night campus vulnerability through zero-touch ambient listening,
              proactive illumination routing, and multi-modal generative deterrence.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-xs font-mono font-bold text-cyan-400 uppercase">
                  Phase 2 (Target AWS)
                </span>
                <h4 className="text-sm font-bold text-white mt-1">Amazon Nova 2 Sonic</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Native speech-to-speech generative voice deterrent with interruptible escalation.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-xs font-mono font-bold text-emerald-400 uppercase">
                  Phase 3 (Target AWS)
                </span>
                <h4 className="text-sm font-bold text-white mt-1">Amazon Location Service V2</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Standard Dark descriptor with lighting scoring and verified 24/7 Safe Haven waypoints.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-xs font-mono font-bold text-amber-400 uppercase">
                  Phase 4 (Target AWS)
                </span>
                <h4 className="text-sm font-bold text-white mt-1">AWS AppSync Events</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Managed WebSocket pub/sub mesh synchronizing victim telemetry with campus security.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800/80">
            <h3 className="text-base font-bold text-white mb-3">
              Stage Demo Hotkey & Simulation Guide
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <kbd className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs font-mono text-cyan-300">
                  Key [1]
                </kbd>
                <h5 className="text-xs font-bold text-slate-200 mt-2">Stealth Phrase</h5>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Starts calm roommate cover call (&ldquo;blue keys on the table&rdquo;).
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <kbd className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs font-mono text-amber-300">
                  Key [2]
                </kbd>
                <h5 className="text-xs font-bold text-slate-200 mt-2">Threat Escalation</h5>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Interrupts call mid-sentence and warns off attacker loudly.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <kbd className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs font-mono text-rose-300">
                  Key [3]
                </kbd>
                <h5 className="text-xs font-bold text-slate-200 mt-2">Phone Drop</h5>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Simulates sudden accelerometer impact and freefall trigger.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <kbd className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs font-mono text-slate-400">
                  Key [0]
                </kbd>
                <h5 className="text-xs font-bold text-slate-200 mt-2">Reset State</h5>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Clears all active alarms across mobile and command screens.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

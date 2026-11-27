'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import {
  Shield,
  Smartphone,
  LayoutDashboard,
  Columns,
  ExternalLink,
  Sparkles,
  QrCode,
  Copy,
  Check,
  X,
  AlertTriangle,
  Lock,
  Users,
  Compass,
  Mic,
  Activity,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { sanitizeRoom, DEFAULT_ROOM } from '@/lib/room';

function StageLauncherPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const currentRoomParam = searchParams.get('room');
  const [room, setRoom] = useState<string>(sanitizeRoom(currentRoomParam));
  const [activeTab, setActiveTab] = useState<'split' | 'overview'>('split');
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [qrType, setQrType] = useState<'presenter' | 'audience'>('presenter');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [targetMobileUrl, setTargetMobileUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isLocalHttp, setIsLocalHttp] = useState<boolean>(false);
  const [showCueCard, setShowCueCard] = useState<boolean>(false);

  // Sync state if URL searchParam changes
  useEffect(() => {
    if (currentRoomParam) {
      setRoom(sanitizeRoom(currentRoomParam));
    }
  }, [currentRoomParam]);

  // Compute mobile URL for QR code based on tab selection
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isHttp =
        window.location.hostname === 'localhost' ||
        window.location.protocol === 'http:';
      setIsLocalHttp(isHttp);

      const targetRoom = qrType === 'presenter' ? room : 'audience-sandbox';
      const targetUrl = `${window.location.origin}/mobile?room=${targetRoom}`;
      setTargetMobileUrl(targetUrl);

      QRCode.toDataURL(targetUrl, { width: 220, margin: 2 })
        .then(setQrCodeDataUrl)
        .catch((err) => {
          console.warn('[QRCode] Generation error:', err);
        });
    }
  }, [room, qrType]);

  const handleLockPrivateRoom = () => {
    const newRoom = `stage-${Math.floor(1000 + Math.random() * 9000)}`;
    setRoom(newRoom);
    router.push(`/?room=${newRoom}`);
  };

  const handleResetToLiveRoom = () => {
    setRoom(DEFAULT_ROOM);
    router.push(`/?room=${DEFAULT_ROOM}`);
  };

  const handleCopy = () => {
    if (navigator?.clipboard && targetMobileUrl) {
      navigator.clipboard.writeText(targetMobileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#050811] text-slate-100 flex flex-col">
      {/* Top Navigation & Showcase Header */}
      <header className="px-5 py-3 bg-slate-950/95 border-b border-slate-800/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-slate-950 font-black shadow-lg shadow-cyan-950">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold tracking-tight text-white">
                SAFEHAVEN
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-300">
                AWS BUILDER CONNECT SHOWCASE
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Proactive Navigation, Generative Deterrence & Real-Time Mesh • Dual-Screen Stage Shell
            </p>
          </div>
        </div>

        {/* View Switcher, Cue Card & Direct Launchers */}
        <div className="flex items-center gap-2">
          {/* 90s Pitch Cue Card Toggle */}
          <button
            type="button"
            onClick={() => setShowCueCard(!showCueCard)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
              showCueCard
                ? 'bg-amber-950/80 border-amber-600 text-amber-300'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            <span>90s Stage Cue Card</span>
            {showCueCard ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

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

          {/* QR Code Trigger Button */}
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-amber-300 font-medium transition-colors"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Scan QR</span>
          </button>

          {/* New Tab Direct Links */}
          <Link
            href={`/mobile?room=${room}`}
            target="_blank"
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-cyan-300 font-medium transition-colors"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile Screen</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </Link>

          <Link
            href={`/dashboard?room=${room}`}
            target="_blank"
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-emerald-300 font-medium transition-colors"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Command Center</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </Link>
        </div>
      </header>

      {/* Stage Room Isolation Bar */}
      <div className="px-5 py-2 bg-slate-950/80 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-slate-400 font-medium">
            <Lock className="w-3.5 h-3.5 text-cyan-400" />
            Active Stage Mesh Room:
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-700/80 text-cyan-300 font-mono font-bold tracking-wide">
            {room}
          </span>
          {room === 'live' ? (
            <span className="text-[11px] text-slate-500 italic">
              (Public Default Channel)
            </span>
          ) : (
            <span className="text-[11px] text-emerald-400 font-medium">
              🔒 Private Presenter Channel Active
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {room === 'live' ? (
            <button
              type="button"
              onClick={handleLockPrivateRoom}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-700 text-cyan-200 text-xs font-semibold transition-colors"
            >
              <Lock className="w-3 h-3" />
              <span>Lock Private Stage Room</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleResetToLiveRoom}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              <span>Reset to Default (live)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setQrType('audience');
              setShowQrModal(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-700/80 text-indigo-200 text-xs font-medium transition-colors"
          >
            <Users className="w-3 h-3 text-indigo-400" />
            <span>Audience Try-It QR</span>
          </button>
        </div>
      </div>

      {/* 90s Stage Pitch Cue Card (Collapsible) */}
      {showCueCard && (
        <div className="bg-gradient-to-r from-amber-950/90 via-slate-950/95 to-slate-950/90 border-b border-amber-600/60 px-5 py-3 text-xs animate-in slide-in-from-top duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-amber-300 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-amber-400" />
              90-SECOND STAGE DEMO PLAYBOOK
            </span>
            <button
              type="button"
              onClick={() => setShowCueCard(false)}
              className="text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-slate-300">
            <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="font-bold text-amber-400 block mb-0.5">1. Room Lock</span>
              Lock Private Room & show Audience Sandbox QR for attendee testing.
            </div>
            <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="font-bold text-cyan-400 block mb-0.5">2. Safe Routes</span>
              Toggle Standard vs <b>Brightest Route</b> (Amazon Location V2 GeoRoutes).
            </div>
            <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="font-bold text-emerald-400 block mb-0.5">3. Voice Deterrent</span>
              Speak cover phrase or press <code>[1]</code> (Bedrock Nova 2 + Polly Neural).
            </div>
            <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="font-bold text-rose-400 block mb-0.5">4. Threat Escalation</span>
              Threat key <code>[2]</code> or Mic <code>[6]</code> (Transcribe Streaming + SNS).
            </div>
            <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="font-bold text-cyan-400 block mb-0.5">5. Bi-Directional Mesh</span>
              Click <b>Acknowledge & Dispatch</b> on dashboard (AppSync Events).
            </div>
            <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="font-bold text-amber-400 block mb-0.5">6. Offline Recovery</span>
              Toggle Dead-Zone <code>[7]</code> &rarr; SNS <code>[4]</code> &rarr; Reconnect <code>[7]</code>.
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {activeTab === 'split' ? (
        <div className="flex-1 p-3 md:p-4 flex flex-col">
          {/* Dual-Screen Stage Shell (Side-by-side iframes) */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-130px)] min-h-[700px]">
            {/* Left Screen: Mobile User PWA Frame (4.5 / 12 cols) */}
            <div className="lg:col-span-5 xl:col-span-4 flex flex-col bg-slate-950/70 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl">
              <div className="px-3.5 py-2 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                  <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                  Primary Screen: Student Mobile PWA
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300">
                  Room: {room}
                </span>
              </div>
              <div className="flex-1 p-2 flex items-center justify-center bg-[#03060f]">
                <iframe
                  key={`mobile-${room}`}
                  src={`/mobile?room=${encodeURIComponent(room)}`}
                  title="SafeHaven Mobile PWA"
                  className="w-full h-full max-w-[430px] rounded-2xl border border-slate-800 shadow-2xl"
                />
              </div>
            </div>

            {/* Right Screen: Campus Security Command Center (/dashboard) */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col bg-slate-950/70 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl">
              <div className="px-3.5 py-2 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                  <LayoutDashboard className="w-3.5 h-3.5 text-emerald-400" />
                  Secondary Screen: Campus Command Center
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-300">
                  AppSync Events Channel: /sentinel/{room}
                </span>
              </div>
              <div className="flex-1 p-2 bg-[#03060f]">
                <iframe
                  key={`dashboard-${room}`}
                  src={`/dashboard?room=${encodeURIComponent(room)}`}
                  title="SafeHaven Campus Responder Command"
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
              SafeHaven solves late-night campus vulnerability through zero-touch ambient listening,
              proactive illumination routing, and multi-modal generative deterrence across 9 AWS services.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-xs font-mono font-bold text-cyan-400 uppercase">
                  Generative Voice
                </span>
                <h4 className="text-sm font-bold text-white mt-1">Bedrock + Polly</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Amazon Nova 2 Lite with automatic cascade to Nova Lite & Micro, synthesized via Neural Ruth.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-xs font-mono font-bold text-emerald-400 uppercase">
                  Audio Streaming
                </span>
                <h4 className="text-sm font-bold text-white mt-1">Transcribe Streaming</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Chunked 16kHz PCM streaming over HTTP/2 with real-time acoustic RMS & peak dB analysis.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-xs font-mono font-bold text-amber-400 uppercase">
                  Navigation
                </span>
                <h4 className="text-sm font-bold text-white mt-1">Location V2 + DynamoDB</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Pedestrian GeoRoutes waypoint routing & Standard Dark tiles with DynamoDB audit persistence.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-xs font-mono font-bold text-indigo-400 uppercase">
                  Mesh Sync
                </span>
                <h4 className="text-sm font-bold text-white mt-1">AppSync Events + SNS</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Private room pub/sub on /sentinel/&lt;room&gt; with Amazon SNS emergency SMS beacon.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Scannable Modal (Presenter vs Audience Try-It) */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            {/* QR Tab Switcher */}
            <div className="flex items-center gap-1 p-1 mb-4 rounded-xl bg-slate-900 border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setQrType('presenter')}
                className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                  qrType === 'presenter'
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Presenter Phone
              </button>
              <button
                type="button"
                onClick={() => setQrType('audience')}
                className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                  qrType === 'audience'
                    ? 'bg-indigo-500 text-slate-950 shadow-md shadow-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Audience Sandbox
              </button>
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-white">
                {qrType === 'presenter' ? 'Presenter Phone QR' : 'Audience Try-It Sandbox QR'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {qrType === 'presenter'
                  ? `Drives the live stage dashboard (Room: ${room}).`
                  : 'Isolated sandbox for attendees with zero impact on stage demo.'}
              </p>
            </div>

            {/* QR Code Scannable Image */}
            <div className="my-4 flex items-center justify-center bg-white p-3 rounded-xl border border-slate-700 shadow-inner">
              {qrCodeDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrCodeDataUrl}
                  alt="Scan Sentinel AI Mobile PWA"
                  className="w-[200px] h-[200px] block"
                />
              ) : (
                <div className="w-[200px] h-[200px] flex items-center justify-center text-xs text-slate-500 font-mono">
                  Generating QR...
                </div>
              )}
            </div>

            {/* URL Override Input & Copy Button */}
            <div className="space-y-2">
              <label className="text-[11px] font-mono text-slate-400 block">
                Target URL:
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={targetMobileUrl}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 font-mono focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-2.5 py-1.5 rounded-lg bg-cyan-900/60 hover:bg-cyan-800 border border-cyan-700/60 text-cyan-200 text-xs flex items-center gap-1 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Localhost / HTTP Notice */}
            {isLocalHttp && (
              <div className="mt-3 p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 flex items-start gap-2 text-[11px] text-amber-200/90 leading-tight">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Phones require an HTTPS URL (Amplify or tunnel) for microphone & motion sensors.
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StageLauncherPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#050811] flex items-center justify-center text-slate-500 font-mono text-xs">
          Loading Sentinel Stage Launcher...
        </div>
      }
    >
      <StageLauncherPageContent />
    </Suspense>
  );
}

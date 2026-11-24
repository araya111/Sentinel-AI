'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  Shield,
  Smartphone,
  LayoutDashboard,
  Columns,
  ExternalLink,
  Sparkles,
  Zap,
  Radio,
  QrCode,
  Copy,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';

export default function StageLauncherPage() {
  const [activeTab, setActiveTab] = useState<'split' | 'overview'>('split');
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [targetMobileUrl, setTargetMobileUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isLocalHttp, setIsLocalHttp] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const defaultUrl = `${window.location.origin}/mobile`;
      setTargetMobileUrl(defaultUrl);
      const isHttp =
        window.location.hostname === 'localhost' ||
        window.location.protocol === 'http:';
      setIsLocalHttp(isHttp);

      QRCode.toDataURL(defaultUrl, { width: 220, margin: 2 })
        .then(setQrCodeDataUrl)
        .catch((err) => {
          console.warn('[QRCode] Generation error:', err);
        });
    }
  }, []);

  const handleUrlChange = (newUrl: string) => {
    setTargetMobileUrl(newUrl);
    if (newUrl.trim()) {
      QRCode.toDataURL(newUrl.trim(), { width: 220, margin: 2 })
        .then(setQrCodeDataUrl)
        .catch(() => {});
    }
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
              Proactive Navigation & Generative Deterrence PWA • Full Dual-Screen Stage Shell
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

          {/* QR Code Trigger Button */}
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-amber-300 font-medium transition-colors"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Scan on Phone</span>
          </button>

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
                  AppSync Events WebSocket
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

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-xs font-mono font-bold text-cyan-400 uppercase">
                  Phase 2 (Live AWS)
                </span>
                <h4 className="text-sm font-bold text-white mt-1">Bedrock + Polly</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Amazon Nova 2 Lite with automatic cascade to Nova Lite & Micro, synthesized via Neural Ruth.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-xs font-mono font-bold text-emerald-400 uppercase">
                  Phase 3 (Live AWS)
                </span>
                <h4 className="text-sm font-bold text-white mt-1">Location V2 + DynamoDB</h4>
                <p className="text-xs text-slate-400 mt-1">
                  GeoRoutes pedestrian waypoint corridor & Standard Dark tiles with DynamoDB incident ledger.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-xs font-mono font-bold text-amber-400 uppercase">
                  Phase 4 (Live AWS)
                </span>
                <h4 className="text-sm font-bold text-white mt-1">AppSync Events</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Native WebSocket pub/sub on channel /sentinel/live with automatic SSE fallback.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-xs font-mono font-bold text-rose-400 uppercase">
                  Phase 4 (Live AWS)
                </span>
                <h4 className="text-sm font-bold text-white mt-1">Amazon SNS SOS</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Emergency offline SMS-grade beacon with live GPS coordinates and Google Maps routing link.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800/80">
            <h3 className="text-base font-bold text-white mb-3">
              Stage Demo Hotkey & Simulation Guide
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
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
                <kbd className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs font-mono text-emerald-300">
                  Key [4]
                </kbd>
                <h5 className="text-xs font-bold text-slate-200 mt-2">SNS SOS Beacon</h5>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Publishes offline emergency SMS beacon to Amazon SNS topic.
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

      {/* Safe QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b101f] border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center">
              <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-800/80 text-cyan-400 mx-auto flex items-center justify-center mb-3">
                <QrCode className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Scan Mobile PWA
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Scan with your phone to open the live victim PWA.
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
                  value={targetMobileUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 font-mono focus:outline-hidden focus:border-cyan-500"
                  placeholder="https://..."
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
                  Phones require an HTTPS URL (Amplify or tunnel) for mic & motion sensors.
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

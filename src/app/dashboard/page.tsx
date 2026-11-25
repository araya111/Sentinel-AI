import { Suspense } from 'react';
import DashboardShell from '@/components/dashboard/DashboardShell';

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#050811] flex items-center justify-center text-slate-500 font-mono text-xs">
          Initializing Sentinel Tactical Radar...
        </div>
      }
    >
      <DashboardShell />
    </Suspense>
  );
}

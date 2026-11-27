import type { Metadata, Viewport } from 'next';
import './globals.css';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

export const metadata: Metadata = {
  title: 'SafeHaven — Proactive Navigation & Generative Deterrence',
  description:
    'Real-time proactive navigation, generative voice deterrence, and campus responder mesh built for AWS Builder Connect Showcase.',
  applicationName: 'SafeHaven',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SafeHaven',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#060913',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#060913] text-slate-100 antialiased min-h-screen selection:bg-cyan-500/30 selection:text-cyan-200">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}

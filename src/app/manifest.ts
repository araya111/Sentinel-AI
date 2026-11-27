import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SafeHaven — Proactive Navigation & Generative Deterrence',
    short_name: 'SafeHaven',
    description:
      'Zero-touch generative voice deterrence, illuminated brightest routes, and campus real-time mesh safety network.',
    start_url: '/mobile',
    display: 'standalone',
    background_color: '#060913',
    theme_color: '#060913',
    orientation: 'portrait',
    icons: [
      {
        src: '/favicon.ico',
        sizes: '64x64 32x32 24x24 16x16',
        type: 'image/x-icon',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sentinel AI — Proactive Navigation & Generative Deterrence',
    short_name: 'Sentinel AI',
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
    ],
  };
}

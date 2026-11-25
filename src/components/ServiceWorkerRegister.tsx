'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            reg.update().catch(() => {});
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker registration failed:', err);
          });
      } catch (err) {
        console.warn('[PWA] Service Worker error:', err);
      }
    }
  }, []);

  return null;
}

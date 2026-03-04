'use client';

import { useEffect, useRef } from 'react';

export default function LuminoLoader() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const script = document.createElement('script');
    script.src = process.env.NEXT_PUBLIC_LUMINO_SDK_URL || '/lumino/sdk/v1/lumino.js';
    script.onload = () => {
      const W = window as any;
      if (W.Lumino && typeof W.Lumino.init === 'function') {
        W.Lumino.init({
          appId: 'novapay-dashboard',
          auth: () => {
            const role = localStorage.getItem('lumino_demo_role') || 'customer';
            return fetch(`/api/lumino-token?role=${role}`)
              .then((r) => r.json())
              .then((d) => d.token);
          },
          environment: 'development',
          apiUrl: '/lumino',
          debug: true,
        }).catch((err: Error) => {
          console.error('[NovaPay] Lumino init FAILED:', err);
        });
      } else {
        console.error('[NovaPay] SDK script loaded but window.Lumino is missing');
      }
    };
    script.onerror = (e) => {
      console.error('[NovaPay] Failed to load SDK script:', e);
    };
    document.head.appendChild(script);
  }, []);

  return null;
}

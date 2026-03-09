'use client';

import { useEffect } from 'react';

const LUMINO_CONFIG = {
  'data-lumino-app-id': 'novapay-dashboard',
  'data-lumino-token-endpoint': '/api/lumino-token',
  'data-lumino-api-url': '/lumino',
  'data-lumino-environment': 'development',
  'data-lumino-debug': 'true',
  'data-lumino-role-storage-key': 'lumino_demo_role',
};

export default function LuminoLoader() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = '/lumino/sdk/v1/lumino.js?v=' + Date.now();
    for (const [key, value] of Object.entries(LUMINO_CONFIG)) {
      script.setAttribute(key, value);
    }
    document.body.appendChild(script);
  }, []);

  return null;
}

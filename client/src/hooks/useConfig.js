import { useEffect, useState } from 'react';
import { API_BASE } from '../lib/api.js';

// Server switches that change what the pages offer (sign-up on/off, payments on/off)
export function useConfig() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    fetch(`${API_BASE}/api/config`).then((r) => r.json()).then(setCfg).catch(() => setCfg({ hostSignup: false, paymentsEnabled: false, currency: 'ZMW' }));
  }, []);
  return cfg;
}

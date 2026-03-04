'use client';

import { useState, useEffect } from 'react';

const PERSONAS = [
  { key: 'author', label: 'Author', name: 'Alex Chen', initials: 'AC', color: '#E07A2F', desc: 'Can record walkthroughs' },
  { key: 'customer', label: 'Customer', name: 'Sarah Johnson', initials: 'SJ', color: '#2563EB', desc: 'Sees guides & notifications' },
] as const;

export default function PersonaSwitcher() {
  const [role, setRole] = useState('customer');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setRole(localStorage.getItem('lumino_demo_role') || 'customer');
  }, []);

  const current = PERSONAS.find(p => p.key === role) ?? PERSONAS[1];

  useEffect(() => {
    console.log('[PersonaSwitcher] Component mounted, role:', role);
  }, [role]);

  function switchRole(newRole: string) {
    console.log(`Switching role to: ${newRole}`);
    localStorage.setItem('lumino_demo_role', newRole);
    setRole(newRole);
    setOpen(false);
    // Destroy existing SDK instance and reload to re-init with new role
    if ((window as any).Lumino?.destroy) {
      (window as any).Lumino.destroy();
      console.log('Destroyed existing Lumino instance for role switch');
    }
    (window as any).__luminoLoading = false;
    (window as any).__luminoInitialized = false;
    window.location.reload();
  }

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: 16, zIndex: 2147483647,
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      {open && (
        <div style={{
          position: 'absolute', bottom: 52, left: 0, width: 240,
          background: '#1E1E36', borderRadius: 12, padding: 8,
          boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{
            padding: '8px 12px', fontSize: 10, fontWeight: 700,
            color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'uppercase',
          }}>Switch Persona</div>
          {PERSONAS.map(p => (
            <button
              key={p.key}
              onClick={() => switchRole(p.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 12px', border: 'none',
                background: role === p.key ? 'rgba(255,255,255,0.08)' : 'transparent',
                borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.15s',
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: p.color, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#FFF',
              }}>{p.initials}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#FFF' }}>{p.name}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{p.desc}</div>
              </div>
              {role === p.key && (
                <div style={{ marginLeft: 'auto', fontSize: 12, color: p.color }}>&#10003;</div>
              )}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => { console.log('[PersonaSwitcher] Toggle clicked, open:', !open); setOpen(!open); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 10,
          background: '#1E1E36', border: '1px solid rgba(255,255,255,0.1)',
          color: '#FFF', cursor: 'pointer', fontSize: 11, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: current.color, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#FFF',
        }}>{current.initials}</div>
        {current.name}
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginLeft: 2 }}>
          ({current.label})
        </span>
        <span style={{ fontSize: 8, marginLeft: 2 }}>{open ? '▼' : '▲'}</span>
      </button>
    </div>
  );
}

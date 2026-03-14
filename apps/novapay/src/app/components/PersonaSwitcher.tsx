'use client';

import { useState, useEffect } from 'react';

const PERSONAS = [
  { key: 'author', label: 'Author', name: 'Alex Chen', initials: 'AC', color: '#E07A2F', desc: 'Can record walkthroughs' },
  { key: 'customer', label: 'Customer', name: 'Sarah Johnson', initials: 'SJ', color: '#2563EB', desc: 'Sees guides & notifications' },
] as const;

export default function PersonaSwitcher() {
  const [role, setRole] = useState('customer');
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setRole(localStorage.getItem('lumino_demo_role') || 'customer');

    const onResize = () => setIsMobile(window.innerWidth < 1024);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const current = PERSONAS.find((p) => p.key === role) ?? PERSONAS[1];

  function switchRole(newRole: string) {
    localStorage.setItem('lumino_demo_role', newRole);
    setRole(newRole);
    setOpen(false);
    if ((window as any).Lumino?.destroy) {
      (window as any).Lumino.destroy();
    }
    (window as any).__luminoLoading = false;
    (window as any).__luminoInitialized = false;
    window.location.reload();
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: isMobile ? 10 : 16,
        left: isMobile ? 10 : 16,
        right: isMobile ? 10 : undefined,
        zIndex: 2147483647,
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: isMobile ? 50 : 52,
            left: 0,
            right: isMobile ? 0 : undefined,
            width: isMobile ? 'auto' : 240,
            background: '#1E1E36',
            borderRadius: 12,
            padding: 8,
            boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              fontSize: 10,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.3)',
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            Switch Persona
          </div>
          {PERSONAS.map((p) => (
            <button
              key={p.key}
              onClick={() => switchRole(p.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '10px 12px',
                border: 'none',
                background: role === p.key ? 'rgba(255,255,255,0.08)' : 'transparent',
                borderRadius: 8,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: p.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 800,
                  color: '#FFF',
                }}
              >
                {p.initials}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#FFF' }}>{p.name}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{p.desc}</div>
              </div>
              {role === p.key && <div style={{ marginLeft: 'auto', fontSize: 12, color: p.color }}>&#10003;</div>}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isMobile ? 'space-between' : 'flex-start',
          gap: 8,
          width: isMobile ? '100%' : 'auto',
          padding: '8px 14px',
          borderRadius: 10,
          background: '#1E1E36',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#FFF',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: current.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 8,
              fontWeight: 800,
              color: '#FFF',
            }}
          >
            {current.initials}
          </div>
          {current.name}
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginLeft: 2 }}>({current.label})</span>
        </div>
        <span style={{ fontSize: 8, marginLeft: 2 }}>{open ? '▼' : '▲'}</span>
      </button>
    </div>
  );
}

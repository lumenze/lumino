'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function CardSettings() {
  const [daily, setDaily] = useState('$1,000.00');
  const [monthly, setMonthly] = useState('$10,000.00');
  const [single, setSingle] = useState('$2,500.00');
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Sidebar (same as dashboard) */}
      <nav style={{
        width: 220, background: '#0F172A', display: 'flex',
        flexDirection: 'column', flexShrink: 0,
      }}>
        <div style={{
          padding: '24px 20px', fontSize: 18, fontWeight: 800,
          color: '#FFF', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #2563EB, #60A5FA)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800, color: '#FFF',
          }}>N</div>
          NovaPay
        </div>
        <div style={{ flex: 1, padding: '12px 0' }}>
          <NavItem href="/" label="Dashboard" icon="📊" />
          <NavItem href="#" label="Accounts" icon="💳" />
          <NavItem href="#" label="Payments" icon="↗️" />
          <NavItem href="#" label="Statements" icon="📄" />
          <NavItem href="/settings" label="Card Settings" icon="⚙️" active data-nav="card-settings" />
          <NavItem href="#" label="Security" icon="🔒" />
        </div>
      </nav>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        <header style={{
          padding: '16px 32px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', borderBottom: '1px solid #E5E7EB', background: '#FFF',
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>Card Settings</h1>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Home / Cards / Settings</div>
          </div>
        </header>

        <div style={{ padding: '24px 32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Purchase Limits */}
            <div id="section-limits" style={{
              background: '#FFF', borderRadius: 12, padding: 24,
              border: '1px solid #E5E7EB',
            }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Purchase Limits</h3>
              <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 16, lineHeight: 1.5 }}>
                Control your spending by setting daily and monthly purchase limits. You&apos;ll be notified when approaching these limits.
              </p>

              <FormField label="Daily Purchase Limit">
                <input
                  id="input-daily-limit"
                  name="dailyLimit"
                  aria-label="Daily Purchase Limit"
                  value={daily}
                  onChange={(e) => setDaily(e.target.value)}
                  style={inputStyle}
                />
              </FormField>

              <FormField label="Monthly Purchase Limit">
                <input
                  id="input-monthly-limit"
                  name="monthlyLimit"
                  aria-label="Monthly Purchase Limit"
                  value={monthly}
                  onChange={(e) => setMonthly(e.target.value)}
                  style={inputStyle}
                />
              </FormField>

              <FormField label="Single Transaction Limit">
                <input
                  id="input-single-limit"
                  name="singleLimit"
                  aria-label="Single Transaction Limit"
                  value={single}
                  onChange={(e) => setSingle(e.target.value)}
                  style={inputStyle}
                />
              </FormField>

              <button
                id="btn-save-limits"
                onClick={handleSave}
                style={{
                  padding: '10px 24px', borderRadius: 8,
                  background: '#2563EB', color: '#FFF', border: 'none',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 8,
                }}
              >
                Save Limits
              </button>
            </div>

            {/* Card Controls */}
            <div style={{
              background: '#FFF', borderRadius: 12, padding: 24,
              border: '1px solid #E5E7EB',
            }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Card Controls</h3>
              <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 16, lineHeight: 1.5 }}>
                Manage your card features and security settings.
              </p>
              <ToggleRow label="Online Purchases" desc="Allow online transactions" defaultOn />
              <ToggleRow label="International Transactions" desc="Allow purchases abroad" />
              <ToggleRow label="Contactless Payments" desc="Tap to pay enabled" defaultOn />
              <ToggleRow label="ATM Withdrawals" desc="Allow cash withdrawals" defaultOn />
            </div>
          </div>
        </div>

        {/* Toast */}
        {saved && (
          <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: '#10B981', color: '#FFF', padding: '10px 24px', borderRadius: 10,
            fontSize: 13, fontWeight: 600, zIndex: 200000,
            boxShadow: '0 8px 24px rgba(16,185,129,0.3)',
          }}>
            ✓ Limits saved successfully
          </div>
        )}
      </main>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px',
  border: '1.5px solid #E5E7EB', borderRadius: 8,
  fontSize: 14, color: '#1F2937', background: '#FFF',
};

function NavItem({ href, label, icon, active, ...rest }: {
  href: string; label: string; icon: string; active?: boolean;
  [key: string]: unknown;
}) {
  return (
    <Link
      href={href}
      {...rest}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
        fontSize: 13, fontWeight: active ? 600 : 500,
        color: active ? '#FFF' : '#94A3B8',
        background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
        borderLeft: `3px solid ${active ? '#2563EB' : 'transparent'}`,
        textDecoration: 'none',
      }}
    >
      <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{icon}</span>
      {label}
    </Link>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: 'block', fontSize: 12, fontWeight: 600, color: '#6B7280',
        marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
      }}>{label}</label>
      {children}
    </div>
  );
}

function ToggleRow({ label, desc, defaultOn }: { label: string; desc: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn ?? false);
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: '1px solid #E5E7EB',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11, color: '#6B7280' }}>{desc}</div>
      </div>
      <div
        onClick={() => setOn(!on)}
        style={{
          width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
          background: on ? '#2563EB' : '#D1D5DB', position: 'relative',
          transition: 'background 0.3s',
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: '50%', background: '#FFF',
          position: 'absolute', top: 2, left: on ? 20 : 2,
          transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }} />
      </div>
    </div>
  );
}

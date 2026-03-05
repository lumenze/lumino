'use client';

import Link from 'next/link';

export default function PayeesPage() {
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <aside style={{
        width: 236,
        background: '#0B1220',
        color: '#CBD5E1',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{
          padding: '22px 18px',
          fontWeight: 800,
          fontSize: 18,
          color: '#fff',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          NovaConnect
        </div>
        <div style={{ padding: '12px 0', flex: 1 }}>
          <Nav href="/" icon="📥" label="Queue" />
          <Nav href="/payees" icon="🧾" label="Payees" active data-nav="payees-nav" />
          <Nav href="#" icon="⚠️" label="Risk Alerts" />
        </div>
      </aside>

      <main style={{ flex: 1, overflow: 'auto' }}>
        <header style={{
          background: '#fff',
          borderBottom: '1px solid #E5E7EB',
          padding: '16px 28px',
          position: 'sticky',
          top: 0,
          zIndex: 5,
        }}>
          <div style={{ fontSize: 19, fontWeight: 700 }}>Payee Review</div>
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Operations / Payees</div>
        </header>
        <section style={{ padding: 24 }}>
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Global Freight Partners</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 14 }}>
              Country mismatch and unusual transfer pattern detected.
            </div>
            <button
              id="btn-escalate-review"
              style={{
                border: 'none',
                borderRadius: 10,
                background: '#DC2626',
                color: '#fff',
                fontWeight: 700,
                fontSize: 13,
                padding: '10px 12px',
                cursor: 'pointer',
              }}
            >
              Escalate for Manual Approval
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function Nav({ href, icon, label, active, ...rest }: {
  href: string;
  icon: string;
  label: string;
  active?: boolean;
  [key: string]: unknown;
}) {
  return (
    <Link
      href={href}
      {...rest}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 18px',
        color: active ? '#fff' : '#94A3B8',
        textDecoration: 'none',
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        background: active ? 'rgba(37,99,235,0.25)' : 'transparent',
        borderLeft: `3px solid ${active ? '#60A5FA' : 'transparent'}`,
      }}
    >
      <span style={{ width: 18, textAlign: 'center' }}>{icon}</span>
      {label}
    </Link>
  );
}

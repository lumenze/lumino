'use client';

import Link from 'next/link';

export default function NovaConnectPage() {
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
          <Nav href="/" icon="📥" label="Queue" active />
          <Nav href="/payees" icon="🧾" label="Payees" data-nav="payees-nav" />
          <Nav href="#" icon="⚠️" label="Risk Alerts" />
          <Nav href="#" icon="🧠" label="Rules Engine" />
          <Nav href="#" icon="📊" label="Reporting" />
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
          <div style={{ fontSize: 19, fontWeight: 700 }}>Payment Operations Portal</div>
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Operations / Queue</div>
        </header>

        <section style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12 }}>
              <div style={{ padding: 16, borderBottom: '1px solid #E5E7EB', fontWeight: 700 }}>Pending Reviews</div>
              <QueueRow merchant="Northline Logistics" amount="$48,920.00" risk="Medium" />
              <QueueRow merchant="Vector Imports LLC" amount="$12,340.00" risk="Low" />
              <QueueRow merchant="Blue Harbor Supply" amount="$92,100.00" risk="High" />
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              <div id="risk-snapshot" style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>Risk Snapshot</div>
                <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>72</div>
                <div style={{ color: '#D97706', fontSize: 12, fontWeight: 600 }}>Requires review before release</div>
              </div>

              <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>Action</div>
                <button
                  id="btn-review-payee"
                  style={{
                    marginTop: 10,
                    border: 'none',
                    borderRadius: 10,
                    background: '#2563EB',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 13,
                    padding: '10px 12px',
                    width: '100%',
                    cursor: 'pointer',
                  }}
                >
                  Review Payee
                </button>
              </div>
            </div>
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

function QueueRow({ merchant, amount, risk }: { merchant: string; amount: string; risk: string }) {
  const riskColor = risk === 'High' ? '#DC2626' : risk === 'Medium' ? '#D97706' : '#10B981';
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 16px',
      borderBottom: '1px solid #E5E7EB',
      fontSize: 13,
    }}>
      <div>
        <div style={{ fontWeight: 600 }}>{merchant}</div>
        <div style={{ color: '#6B7280', fontSize: 11 }}>Awaiting compliance decision</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 700 }}>{amount}</div>
        <div style={{ color: riskColor, fontSize: 11, fontWeight: 600 }}>{risk}</div>
      </div>
    </div>
  );
}

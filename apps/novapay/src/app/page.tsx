'use client';

import Link from 'next/link';

export default function Dashboard() {
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Sidebar */}
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
          <SidebarItem href="/" label="Dashboard" icon="📊" active />
          <SidebarItem href="#" label="Accounts" icon="💳" />
          <SidebarItem href="#" label="Payments" icon="↗️" />
          <SidebarItem href="#" label="Statements" icon="📄" />
          <SidebarItem href="/settings" label="Card Settings" icon="⚙️" data-nav="card-settings" />
          <SidebarItem href="#" label="Security" icon="🔒" />
        </div>
        <div style={{
          padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#FFF',
          }}>SJ</div>
          <div>
            <div style={{ fontSize: 12, color: '#CBD5E1', fontWeight: 600 }}>Sarah Johnson</div>
            <div style={{ fontSize: 10, color: '#94A3B8' }}>Platinum Member</div>
          </div>
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
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>Dashboard</h1>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Home / Dashboard</div>
          </div>
        </header>

        <div style={{ padding: '24px 32px' }}>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            <StatCard label="Available Balance" value="$24,850.00" change="+$2,340 this month" up color="#2563EB" />
            <StatCard label="Total Spent This Month" value="$3,247.50" change="↑ 12% vs last month" />
            <StatCard label="Rewards Points" value="42,180" change="+3,200 earned" up color="#8B5CF6" />
          </div>

          {/* Activity */}
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Recent Activity</h2>
          <div style={{ background: '#FFF', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <ActivityItem icon="🛒" bg="#FEF3C7" name="Amazon.com" date="Feb 27, 2026 · Online" amount="-$89.99" />
            <ActivityItem icon="🥑" bg="#FEF3C7" name="Whole Foods Market" date="Feb 26, 2026 · In-store" amount="-$156.20" />
            <ActivityItem icon="✈️" bg="#DBEAFE" name="Delta Airlines" date="Feb 25, 2026 · Online" amount="-$342.00" />
            <ActivityItem icon="💰" bg="#D1FAE5" name="Salary Deposit" date="Feb 24, 2026 · Direct Deposit" amount="+$5,200.00" positive />
            <ActivityItem icon="⛽" bg="#FEF3C7" name="Shell Gas Station" date="Feb 23, 2026 · In-store" amount="-$62.40" last />
          </div>
        </div>
      </main>
    </div>
  );
}

function SidebarItem({ href, label, icon, active, ...rest }: {
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
        textDecoration: 'none', transition: 'all 0.2s',
      }}
    >
      <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{icon}</span>
      {label}
    </Link>
  );
}

function StatCard({ label, value, change, up, color }: {
  label: string; value: string; change: string; up?: boolean; color?: string;
}) {
  return (
    <div style={{
      background: '#FFF', borderRadius: 12, padding: 20,
      border: '1px solid #E5E7EB',
    }}>
      <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, color: color ?? '#1F2937' }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4, color: up ? '#10B981' : '#6B7280' }}>
        {up ? '↑ ' : ''}{change}
      </div>
    </div>
  );
}

function ActivityItem({ icon, bg, name, date, amount, positive, last }: {
  icon: string; bg: string; name: string; date: string; amount: string;
  positive?: boolean; last?: boolean;
}) {
  return (
    <div style={{
      padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14,
      borderBottom: last ? 'none' : '1px solid #E5E7EB', fontSize: 13,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{name}</div>
        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>{date}</div>
      </div>
      <div style={{
        fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
        color: positive ? '#10B981' : '#1F2937',
      }}>{amount}</div>
    </div>
  );
}

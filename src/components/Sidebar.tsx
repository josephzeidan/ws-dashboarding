'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import WsStatusBadge from './WsStatusBadge'
import NotificationBell from './NotificationBell'

const NAV = [
  { section: 'Overview' },
  { href: '/',               label: 'Dashboard',        icon: '▦' },
  { href: '/holdings',       label: 'Holdings',         icon: '≡' },
  { href: '/insights',       label: 'Insights',         icon: '📊' },
  { href: '/activity',       label: 'Activity',         icon: '⚡' },
  { section: 'Analysis' },
  { href: '/news',           label: 'News',             icon: '📰' },
  { href: '/rate',           label: 'Rate a Stock',     icon: '🎯' },
  { href: '/sr',             label: 'Support/Resistance', icon: '📐' },
  { href: '/daytrade',       label: 'SPY Day Trade',    icon: '📈' },
  { href: '/recommendations',label: 'Recommendations',  icon: '◎' },
  { href: '/rebalancing',    label: 'Rebalancing',      icon: '⇄' },
  { href: '/trends',         label: 'Macro Trends',     icon: '↗' },
  { section: 'Tools' },
  { href: '/watchlist',      label: 'Watchlist',        icon: '★' },
  { href: '/journal',        label: 'Journal',          icon: '📓' },
  { href: '/settings',       label: 'Settings',         icon: '⚙' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <nav className="sidebar">
      {/* Logo */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #e5e5e5' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>TFSA Intelligence</div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Wealthsimple Portfolio</div>
      </div>

      {/* Nav items */}
      <div style={{ padding: '8px 0', flex: 1 }}>
        {NAV.map((item, i) => {
          if ('section' in item) {
            return (
              <div key={i} style={{ padding: '12px 16px 4px', fontSize: 10, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                {item.section}
              </div>
            )
          }
          const active = pathname === item.href
          return (
            <Link key={item.href} href={item.href} className={`nav-link${active ? ' active' : ''}`}>
              <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e5e5', fontSize: 11, color: '#aaa', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <NotificationBell />
        <WsStatusBadge />
        <span>Prices via Yahoo Finance</span>
      </div>
    </nav>
  )
}

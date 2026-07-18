import { useEffect, useRef, useState } from 'react'
import { BarChart3, Bike, ChefHat, ChevronDown, ClipboardCheck, ClipboardList, Funnel, LayoutDashboard, LogOut, PackageOpen, Settings, ShoppingBag, Users } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BrandMark } from './BrandMark.jsx'
import { hasAnySettingsPermission, hasPermission } from '../lib/permissions.js'

const navigation = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true, permission: 'dashboard' },
  { to: '/pos', label: 'New order', icon: ShoppingBag, permission: 'pos' },
  { to: '/kitchen', label: 'Kitchen', icon: ChefHat, permission: 'kitchen' },
  { to: '/deliveries', label: 'Deliveries', icon: Bike, permission: 'deliveries' },
  { to: '/orders', label: 'Orders', icon: ClipboardList, permission: 'orders' },
  { to: '/inventory', label: 'Inventory', icon: PackageOpen, permission: 'inventory' },
  { to: '/reports', label: 'Reports', icon: BarChart3, permission: 'reports' },
  { to: '/team', label: 'Team', icon: Users, permission: 'team' },
  { to: '/audit', label: 'Audit trail', icon: ClipboardCheck, permission: 'audit' },
  { to: '/settings', label: 'Settings', icon: Settings, settings: true }
]

export function AppShell({ profile, onSignOut }) {
  const [keepSidebarCollapsed, setKeepSidebarCollapsed] = useState(false)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const accountMenuRef = useRef(null)
  const allowedNavigation = navigation.filter((item) => item.settings ? hasAnySettingsPermission(profile) : hasPermission(profile, item.permission))
  const { pathname } = useLocation()
  const currentPage = navigation.find((item) => item.to === pathname)?.label || 'Point of sale'
  const hasFilters = pathname === '/orders' || pathname === '/audit' || pathname === '/reports'

  useEffect(() => { setShowAccountMenu(false) }, [pathname])
  useEffect(() => {
    if (!showAccountMenu) return undefined
    function closeMenu(event) {
      if (event.key === 'Escape' || (event.type === 'pointerdown' && !accountMenuRef.current?.contains(event.target))) setShowAccountMenu(false)
    }
    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeMenu)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeMenu)
    }
  }, [showAccountMenu])

  return (
    <div className="app-shell">
      <aside className={`sidebar ${keepSidebarCollapsed ? 'sidebar--locked-closed' : ''}`} onMouseLeave={() => setKeepSidebarCollapsed(false)}>
        <BrandMark compact />
        <nav className="sidebar__nav" aria-label="Primary navigation">
          {allowedNavigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={(event) => { setKeepSidebarCollapsed(true); event.currentTarget.blur() }} className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}>
              <Icon size={19} strokeWidth={2} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <header className="workspace-header">
          <div className="workspace-header__context"><span>KL Chicken Wings</span><strong>{currentPage}</strong></div>
          <div className="workspace-header__actions">
            {hasFilters && <button className="workspace-filter-button" type="button" onClick={() => window.dispatchEvent(new CustomEvent('kl:open-filters', { detail: { route: pathname } }))}><Funnel size={17} />Filters</button>}
            <div className="header-account-menu" ref={accountMenuRef}>
              <button className="workspace-header__user" type="button" onClick={() => setShowAccountMenu((current) => !current)} aria-expanded={showAccountMenu} aria-haspopup="menu"><div className="avatar">{profile.full_name?.slice(0, 2).toUpperCase() || 'KL'}</div><div className="workspace-header__user-copy"><strong>{profile.full_name}</strong><span>{profile.role.replaceAll('_', ' ')}</span></div><ChevronDown className="account-menu-chevron" size={16} /></button>
              {showAccountMenu && <div className="header-account-popover" role="menu"><button className="header-signout-button" type="button" role="menuitem" onClick={onSignOut}><LogOut size={17} /><span>Log out</span></button></div>}
            </div>
          </div>
        </header>
        <div className="main-content__body"><Outlet /></div>
      </main>
    </div>
  )
}

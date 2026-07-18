import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell.jsx'
import { useAuth } from './hooks/useAuth.js'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { PlaceholderPage } from './pages/PlaceholderPage.jsx'
import { PosPage } from './pages/PosPage.jsx'
import { TeamPage } from './pages/TeamPage.jsx'
import { KitchenPage } from './pages/KitchenPage.jsx'
import { DeliveriesPage } from './pages/DeliveriesPage.jsx'
import { OrdersPage } from './pages/OrdersPage.jsx'
import { InventoryPage } from './pages/InventoryPage.jsx'
import { ReportsPage } from './pages/ReportsPage.jsx'
import { SettingsPage } from './pages/SettingsPage.jsx'
import { AuditTrailPage } from './pages/AuditTrailPage.jsx'
import { hasAnySettingsPermission, hasPermission } from './lib/permissions.js'

const permissionRoutes = [['dashboard', '/'], ['pos', '/pos'], ['kitchen', '/kitchen'], ['deliveries', '/deliveries'], ['orders', '/orders'], ['inventory', '/inventory'], ['reports', '/reports'], ['team', '/team'], ['audit', '/audit']]

function homeFor(profile) {
  return permissionRoutes.find(([permission]) => hasPermission(profile, permission))?.[1] || (hasAnySettingsPermission(profile) ? '/settings' : '/login')
}

function ProtectedPage({ profile, permission, settings = false, children }) {
  const allowed = settings ? hasAnySettingsPermission(profile) : hasPermission(profile, permission)
  return allowed ? children : <Navigate to={homeFor(profile)} replace />
}

export default function App() {
  const auth = useAuth()

  if (auth.loading) return <div className="app-loading"><div className="spinner" /><span>Loading secure workspace...</span></div>

  if (!auth.session || !auth.profile) {
    return <LoginPage isConfigured={auth.isConfigured} authError={auth.error} onSignIn={auth.signIn} />
  }

  return (
    <Routes>
      <Route element={<AppShell profile={auth.profile} onSignOut={auth.signOut} />}>
        <Route index element={<ProtectedPage profile={auth.profile} permission="dashboard"><DashboardPage /></ProtectedPage>} />
        <Route path="pos" element={<ProtectedPage profile={auth.profile} permission="pos"><PosPage accessToken={auth.session.access_token} /></ProtectedPage>} />
        <Route path="kitchen" element={<ProtectedPage profile={auth.profile} permission="kitchen"><KitchenPage accessToken={auth.session.access_token} /></ProtectedPage>} />
        <Route path="deliveries" element={<ProtectedPage profile={auth.profile} permission="deliveries"><DeliveriesPage accessToken={auth.session.access_token} profile={auth.profile} /></ProtectedPage>} />
        <Route path="orders" element={<ProtectedPage profile={auth.profile} permission="orders"><OrdersPage accessToken={auth.session.access_token} /></ProtectedPage>} />
        <Route path="inventory" element={<ProtectedPage profile={auth.profile} permission="inventory"><InventoryPage accessToken={auth.session.access_token} profile={auth.profile} /></ProtectedPage>} />
        <Route path="reports" element={<ProtectedPage profile={auth.profile} permission="reports"><ReportsPage accessToken={auth.session.access_token} /></ProtectedPage>} />
        <Route path="team" element={<ProtectedPage profile={auth.profile} permission="team"><TeamPage accessToken={auth.session.access_token} profile={auth.profile} /></ProtectedPage>} />
        <Route path="audit" element={<ProtectedPage profile={auth.profile} permission="audit"><AuditTrailPage accessToken={auth.session.access_token} /></ProtectedPage>} />
        <Route path="settings" element={<ProtectedPage profile={auth.profile} settings><SettingsPage accessToken={auth.session.access_token} profile={auth.profile} /></ProtectedPage>} />
        <Route path="*" element={<Navigate to={homeFor(auth.profile)} replace />} />
      </Route>
    </Routes>
  )
}

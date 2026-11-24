import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ScanProvider } from './context/ScanProvider'
import './App.css'
import { readAccessToken } from './services/operatorSession'

const DashboardPage = lazy(() => import('./pages/Overview/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const InventoryPage = lazy(() => import('./pages/Inventory/InventoryPage').then((module) => ({ default: module.InventoryPage })))
const FindingsPage = lazy(() => import('./pages/Findings/FindingsPage').then((module) => ({ default: module.FindingsPage })))
const CostsPage = lazy(() => import('./pages/Costs/CostsPage').then((module) => ({ default: module.CostsPage })))
const RemediationPage = lazy(() => import('./pages/Remediation/RemediationPage').then((module) => ({ default: module.RemediationPage })))
const ScansPage = lazy(() => import('./pages/Scans/ScansPage').then((module) => ({ default: module.ScansPage })))
const SettingsPage = lazy(() => import('./pages/Settings/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const ProfilePage = lazy(() => import('./pages/Profile/ProfilePage').then((module) => ({ default: module.ProfilePage })))
const AuthenticationPage = lazy(() => import('./pages/Authentication/AuthenticationPage').then((module) => ({ default: module.AuthenticationPage })))

function ProtectedRoute() {
  const token = readAccessToken()
  return token ? <Outlet /> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <ScanProvider>
      <Suspense fallback={<div className="route-loading" role="status">Loading CloudSentry…</div>}>
        <Routes>
          <Route path="/login" element={<AuthenticationPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/findings" element={<FindingsPage />} />
            <Route path="/costs" element={<CostsPage />} />
            <Route path="/remediation" element={<RemediationPage />} />
            <Route path="/scans" element={<ScansPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </ScanProvider>
  )
}

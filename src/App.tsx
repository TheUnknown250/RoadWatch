import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'

const HomePage = lazy(() => import('@/pages/HomePage'))
const MapPage = lazy(() => import('@/pages/MapPage'))
const ScanPage = lazy(() => import('@/pages/ScanPage'))
const RoutesPage = lazy(() => import('@/pages/RoutesPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const CommunitiesPage = lazy(() => import('@/pages/CommunitiesPage'))
const CommunityPage = lazy(() => import('@/pages/CommunityPage'))
const SafetyPage = lazy(() => import('@/pages/SafetyPage'))
const SessionPage = lazy(() => import('@/pages/SessionPage'))
const DirectoryPage = lazy(() => import('@/pages/DirectoryPage'))
const IncidentPage = lazy(() => import('@/pages/IncidentPage'))
const ReportPage = lazy(() => import('@/pages/ReportPage'))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'))
const AccountPage = lazy(() => import('@/pages/AccountPage'))
const SignInPage = lazy(() => import('@/pages/SignInPage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))
const InsightsPage = lazy(() => import('@/pages/InsightsPage'))
const HelpPage = lazy(() => import('@/pages/HelpPage'))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage'))

export default function App() {
  return (
    <Suspense fallback={<p role="status" className="p-6 text-sm text-ink-soft">Loading</p>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="scan" element={<ScanPage />} />
          <Route path="routes" element={<RoutesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="communities" element={<CommunitiesPage />} />
          <Route path="communities/:id" element={<CommunityPage />} />
          <Route path="safety" element={<SafetyPage />} />
          <Route path="safety/:id" element={<SessionPage />} />
          <Route path="directory" element={<DirectoryPage />} />
          <Route path="incidents/:id" element={<IncidentPage />} />
          <Route path="report" element={<ReportPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="signin" element={<SignInPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route
            path="*"
            element={<p className="p-6 text-center text-ink-soft">That page does not exist.</p>}
          />
        </Route>
      </Routes>
    </Suspense>
  )
}

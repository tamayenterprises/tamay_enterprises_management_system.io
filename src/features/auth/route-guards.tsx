import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-hooks'
import { LoadingState } from '@/components/ui/loading-state'
import type { UserRole } from '@/types/database'
import { homePathForRole, isClientRole, isManagementRole } from '@/lib/utils'

export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading || (session && !profile)) {
    return <LoadingState label="Checking session..." />
  }

  if (!session) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />
  }

  if (!profile) {
    return <Navigate to="/sign-in" replace />
  }

  if (profile.approval_status !== 'approved' || !profile.is_active) {
    return <Navigate to="/pending-approval" replace />
  }

  if (roles && !roles.includes(profile.role)) {
    return <Navigate to={homePathForRole(profile.role)} replace />
  }

  return <Outlet />
}

export function GuestRoute() {
  const { session, profile, loading } = useAuth()
  const location = useLocation()
  const isPasswordRecovery =
    location.pathname === '/reset-password' ||
    location.hash.includes('type=recovery') ||
    new URLSearchParams(location.search).get('type') === 'recovery'

  if (loading || (session && !profile)) return <LoadingState />

  // Allow password recovery even if a session is present.
  if (isPasswordRecovery) return <Outlet />

  if (session && profile?.approval_status === 'approved' && profile.is_active) {
    return <Navigate to={homePathForRole(profile.role)} replace />
  }

  if (session && profile && (profile.approval_status !== 'approved' || !profile.is_active)) {
    return <Navigate to="/pending-approval" replace />
  }

  return <Outlet />
}

export function ManagementRoute() {
  const { profile, loading } = useAuth()
  if (loading) return <LoadingState />
  if (!isManagementRole(profile?.role)) return <Navigate to={homePathForRole(profile?.role)} replace />
  return <Outlet />
}

export function AdminRoute() {
  const { profile, loading } = useAuth()
  if (loading) return <LoadingState />
  if (profile?.role !== 'admin') return <Navigate to={homePathForRole(profile?.role)} replace />
  return <Outlet />
}

/** Staff app routes — clients are redirected to the portal. */
export function StaffRoute() {
  const { profile, loading } = useAuth()
  if (loading) return <LoadingState />
  if (isClientRole(profile?.role)) return <Navigate to="/portal" replace />
  return <Outlet />
}

/** Client portal routes — staff are redirected to the dashboard. */
export function ClientRoute() {
  const { profile, loading } = useAuth()
  if (loading) return <LoadingState />
  if (!isClientRole(profile?.role)) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

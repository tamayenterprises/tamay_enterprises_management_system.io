import { Navigate } from 'react-router-dom'
import { LoadingState } from '@/components/ui/loading-state'
import { EmployeeDashboard } from '@/features/dashboard/employee-dashboard'
import { useMyReadiness } from '@/features/subcontractors/hooks'
import { SubcontractorDashboard } from '@/features/subcontractors/subcontractor-dashboard'
import { canSeeWorkOrders } from '@/lib/subcontractor-requirements'

/**
 * Subcontractor landing: setup until documents are done, then the subcontractor dashboard.
 * Before the subcontractor migration is installed, keep the previous shared dashboard.
 */
export function SubcontractorHome() {
  const { readiness, isLoading, installed, isError } = useMyReadiness()

  if (isLoading) return <LoadingState label="Loading your dashboard..." />
  if (!installed || isError) return <EmployeeDashboard />
  if (!readiness || !canSeeWorkOrders(readiness.status)) return <Navigate to="/setup" replace />
  return <SubcontractorDashboard readiness={readiness} />
}

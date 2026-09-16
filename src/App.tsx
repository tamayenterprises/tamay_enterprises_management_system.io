import { lazy, Suspense, type ComponentType } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/features/auth/auth-context'
import {
  AdminRoute,
  ClientRoute,
  GuestRoute,
  ManagementRoute,
  ProtectedRoute,
  StaffRoute,
} from '@/features/auth/route-guards'
import { AppErrorBoundary } from '@/components/app-error-boundary'
import { AppShell } from '@/components/layout/app-shell'
import { ClientPortalShell } from '@/components/layout/client-portal-shell'
import { LoadingState } from '@/components/ui/loading-state'
import { SignInPage } from '@/pages/sign-in'
import { SignUpPage } from '@/pages/sign-up'
import { ClientSignUpPage } from '@/pages/client-sign-up'
import { ForgotPasswordPage, PendingApprovalPage, ResetPasswordPage } from '@/pages/auth-misc'
import { NotFoundPage } from '@/pages/not-found'

function lazyNamed<M extends Record<string, ComponentType>>(
  importer: () => Promise<M>,
  exportName: keyof M & string,
) {
  return lazy(async () => {
    const mod = await importer()
    return { default: mod[exportName] }
  })
}

const ChangePasswordPage = lazyNamed(() => import('@/pages/auth-misc'), 'ChangePasswordPage')
const DashboardPage = lazyNamed(() => import('@/pages/dashboard'), 'DashboardPage')
const EmployeesPage = lazyNamed(() => import('@/pages/employees'), 'EmployeesPage')
const SubcontractorsPage = lazyNamed(() => import('@/pages/subcontractors'), 'SubcontractorsPage')
const ProjectsPage = lazyNamed(() => import('@/pages/projects'), 'ProjectsPage')
const ProjectDetailPage = lazyNamed(() => import('@/pages/project-detail'), 'ProjectDetailPage')
const CertificationsPage = lazyNamed(() => import('@/pages/certifications'), 'CertificationsPage')
const DocumentsPage = lazyNamed(() => import('@/pages/documents'), 'DocumentsPage')
const NotificationsPage = lazyNamed(() => import('@/pages/notifications'), 'NotificationsPage')
const RecentActivityPage = lazyNamed(() => import('@/pages/activity'), 'RecentActivityPage')
const UpdatesPage = lazyNamed(() => import('@/pages/updates'), 'UpdatesPage')
const AdminPage = lazyNamed(() => import('@/pages/admin'), 'AdminPage')
const SearchPage = lazyNamed(() => import('@/pages/search'), 'SearchPage')
const TimesheetsPage = lazyNamed(() => import('@/pages/timesheets'), 'TimesheetsPage')
const DraftsPage = lazyNamed(() => import('@/pages/drafts'), 'DraftsPage')
const ClientPortalHomePage = lazyNamed(() => import('@/pages/client-portal-home'), 'ClientPortalHomePage')
const ClientRequestsPage = lazyNamed(() => import('@/pages/client-requests'), 'ClientRequestsPage')
const ClientProjectsPage = lazyNamed(() => import('@/pages/client-projects'), 'ClientProjectsPage')
const ClientProjectDetailPage = lazyNamed(() => import('@/pages/client-project-detail'), 'ClientProjectDetailPage')
const ClientDocumentsPage = lazyNamed(() => import('@/pages/client-documents'), 'ClientDocumentsPage')
const ClientNotificationsPage = lazyNamed(() => import('@/pages/client-notifications'), 'ClientNotificationsPage')
const ProjectRequestsAdminPage = lazyNamed(() => import('@/pages/project-requests-admin'), 'ProjectRequestsAdminPage')
const PaymentsPage = lazyNamed(() => import('@/pages/payments'), 'PaymentsPage')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function AuthenticatedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

function ClientPortalLayout() {
  return (
    <ClientPortalShell>
      <Outlet />
    </ClientPortalShell>
  )
}

export default function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<LoadingState label="Loading..." />}>
              <Routes>
                <Route element={<GuestRoute />}>
                  <Route path="/sign-in" element={<SignInPage />} />
                  <Route path="/sign-up" element={<SignUpPage />} />
                  <Route path="/client/sign-up" element={<ClientSignUpPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                </Route>

                <Route path="/pending-approval" element={<PendingApprovalPage />} />

                <Route element={<ProtectedRoute />}>
                  <Route path="/change-password" element={<ChangePasswordPage />} />

                  <Route element={<ClientRoute />}>
                    <Route element={<ClientPortalLayout />}>
                      <Route path="/portal" element={<ClientPortalHomePage />} />
                      <Route path="/portal/requests" element={<ClientRequestsPage />} />
                      <Route path="/portal/projects" element={<ClientProjectsPage />} />
                      <Route path="/portal/projects/:projectId" element={<ClientProjectDetailPage />} />
                      <Route path="/portal/documents" element={<ClientDocumentsPage />} />
                      <Route path="/portal/notifications" element={<ClientNotificationsPage />} />
                    </Route>
                  </Route>

                  <Route element={<StaffRoute />}>
                    <Route element={<AuthenticatedLayout />}>
                      <Route path="/" element={<Navigate to="/dashboard" replace />} />
                      <Route path="/dashboard" element={<DashboardPage />} />
                      <Route path="/projects" element={<ProjectsPage />} />
                      <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                      <Route path="/certifications" element={<CertificationsPage />} />
                      <Route path="/documents" element={<DocumentsPage />} />
                      <Route path="/notifications" element={<NotificationsPage />} />
                      <Route path="/activity" element={<RecentActivityPage />} />
                      <Route path="/updates" element={<UpdatesPage />} />
                      <Route path="/drafts" element={<DraftsPage />} />
                      <Route path="/search" element={<SearchPage />} />

                      <Route element={<ManagementRoute />}>
                        <Route path="/employees" element={<EmployeesPage />} />
                        <Route path="/subcontractors" element={<SubcontractorsPage />} />
                        <Route path="/timesheets" element={<TimesheetsPage />} />
                        <Route path="/client-requests" element={<ProjectRequestsAdminPage />} />
                        <Route path="/payments" element={<PaymentsPage />} />
                      </Route>

                      <Route element={<AdminRoute />}>
                        <Route path="/admin" element={<AdminPage />} />
                      </Route>
                    </Route>
                  </Route>
                </Route>

                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}

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
import { SignInPage } from '@/pages/sign-in'
import { SignUpPage } from '@/pages/sign-up'
import { ClientSignUpPage } from '@/pages/client-sign-up'
import { ChangePasswordPage, ForgotPasswordPage, PendingApprovalPage, ResetPasswordPage } from '@/pages/auth-misc'
import { DashboardPage } from '@/pages/dashboard'
import { EmployeesPage } from '@/pages/employees'
import { SubcontractorsPage } from '@/pages/subcontractors'
import { ProjectsPage } from '@/pages/projects'
import { ProjectDetailPage } from '@/pages/project-detail'
import { CertificationsPage } from '@/pages/certifications'
import { DocumentsPage } from '@/pages/documents'
import { NotificationsPage } from '@/pages/notifications'
import { RecentActivityPage } from '@/pages/activity'
import { UpdatesPage } from '@/pages/updates'
import { AdminPage } from '@/pages/admin'
import { SearchPage } from '@/pages/search'
import { TimesheetsPage } from '@/pages/timesheets'
import { DraftsPage } from '@/pages/drafts'
import { NotFoundPage } from '@/pages/not-found'
import { ClientPortalHomePage } from '@/pages/client-portal-home'
import { ClientRequestsPage } from '@/pages/client-requests'
import { ClientProjectsPage } from '@/pages/client-projects'
import { ClientProjectDetailPage } from '@/pages/client-project-detail'
import { ClientDocumentsPage } from '@/pages/client-documents'
import { ClientNotificationsPage } from '@/pages/client-notifications'
import { ProjectRequestsAdminPage } from '@/pages/project-requests-admin'

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
                    </Route>

                    <Route element={<AdminRoute />}>
                      <Route path="/admin" element={<AdminPage />} />
                    </Route>
                  </Route>
                </Route>
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </BrowserRouter>
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}

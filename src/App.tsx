import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/features/auth/auth-context'
import { AdminRoute, GuestRoute, ManagementRoute, ProtectedRoute } from '@/features/auth/route-guards'
import { AppShell } from '@/components/layout/app-shell'
import { SignInPage } from '@/pages/sign-in'
import { SignUpPage } from '@/pages/sign-up'
import { ChangePasswordPage, ForgotPasswordPage, PendingApprovalPage, ResetPasswordPage } from '@/pages/auth-misc'
import { DashboardPage } from '@/pages/dashboard'
import { EmployeesPage } from '@/pages/employees'
import { SubcontractorsPage } from '@/pages/subcontractors'
import { ProjectsPage } from '@/pages/projects'
import { ProjectDetailPage } from '@/pages/project-detail'
import { CertificationsPage } from '@/pages/certifications'
import { DocumentsPage } from '@/pages/documents'
import { NotificationsPage } from '@/pages/notifications'
import { AdminPage } from '@/pages/admin'
import { SearchPage } from '@/pages/search'
import { NotFoundPage } from '@/pages/not-found'

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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<GuestRoute />}>
              <Route path="/sign-in" element={<SignInPage />} />
              <Route path="/sign-up" element={<SignUpPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Route>

            <Route path="/pending-approval" element={<PendingApprovalPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AuthenticatedLayout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                <Route path="/certifications" element={<CertificationsPage />} />
                <Route path="/documents" element={<DocumentsPage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/change-password" element={<ChangePasswordPage />} />

                <Route element={<ManagementRoute />}>
                  <Route path="/employees" element={<EmployeesPage />} />
                  <Route path="/subcontractors" element={<SubcontractorsPage />} />
                </Route>

                <Route element={<AdminRoute />}>
                  <Route path="/admin" element={<AdminPage />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  )
}

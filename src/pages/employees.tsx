import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Textarea } from '@/components/ui/textarea'
import {
  useProfiles,
  useUpdateProfile,
  useAdminSetUserAccess,
  useSetWorkerStatus,
  useWorkerEligibility,
  useWorkerStatusHistory,
} from '@/features/data/hooks'
import { ProfileAvatar } from '@/features/profile/avatar'
import { deriveWorkerEligibility } from '@/lib/worker-eligibility'
import { formatDate, fullName, roleLabel } from '@/lib/utils'
import { confirmAction } from '@/lib/uploads'
import { profileSchema, type ProfileFormValues } from '@/lib/validations'
import type { Profile } from '@/types/database'

export function EmployeesPage() {
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const { data, isLoading, isError } = useProfiles({
    role: 'employee',
    search,
  })
  const updateProfile = useUpdateProfile()
  const setAccess = useAdminSetUserAccess()

  const employees = useMemo(() => {
    const rows = data ?? []
    return rows.filter((row) => (activeOnly ? row.is_active && !row.archived_at : true))
  }, [data, activeOnly])

  if (isLoading) return <LoadingState />
  if (isError) {
    return <EmptyState title="Unable to load employees" description="Verify Supabase access and try again." />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Employees</h1>
          <p className="text-sm text-muted-foreground">
            Edit, activate, and archive approved employees. Attendance eligibility follows Active worker
            status — project assignment alone is not enough.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <Button variant={activeOnly ? 'default' : 'outline'} onClick={() => setActiveOnly((v) => !v)}>
            {activeOnly ? 'Active only' : 'All statuses'}
          </Button>
        </div>
      </div>

      {employees.length === 0 ? (
        <EmptyState title="No employees found" description="Adjust filters or approve registrations to populate this list." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {employees.map((employee) => (
            <EmployeeCard
              key={employee.id}
              employee={employee}
              onSave={async (values) => {
                try {
                  await updateProfile.mutateAsync({ id: employee.id, values })
                  toast.success('Employee updated')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Update failed')
                }
              }}
              onArchive={async () => {
                if (!confirmAction(`Archive ${fullName(employee.first_name, employee.last_name)}?`)) return
                try {
                  await setAccess.mutateAsync({ id: employee.id, archived: true })
                  toast.success('Employee archived')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Archive failed')
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EmployeeCard({
  employee,
  onSave,
  onArchive,
}: {
  employee: Profile
  onSave: (values: ProfileFormValues) => Promise<void>
  onArchive: () => Promise<void>
}) {
  const setStatus = useSetWorkerStatus()
  const { data: eligibilityRpc } = useWorkerEligibility(employee.id)
  const { data: history = [] } = useWorkerStatusHistory(employee.id)
  const [statusReason, setStatusReason] = useState('')
  const [statusOpen, setStatusOpen] = useState(false)

  const eligibility = eligibilityRpc ?? deriveWorkerEligibility(employee)
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: employee.first_name,
      last_name: employee.last_name,
      phone: employee.phone,
      position: employee.position,
      hire_date: employee.hire_date,
      emergency_contact_name: employee.emergency_contact_name,
      emergency_contact_phone: employee.emergency_contact_phone,
      internal_notes: employee.internal_notes,
      is_active: employee.is_active,
    },
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex min-w-0 items-start gap-3">
          <ProfileAvatar
            firstName={employee.first_name}
            lastName={employee.last_name}
            avatarUrl={employee.avatar_url}
            className="mt-0.5 h-11 w-11"
            fallbackClassName="bg-muted text-sm"
          />
          <div className="min-w-0">
            <CardTitle className="text-xl">{fullName(employee.first_name, employee.last_name)}</CardTitle>
            <p className="text-sm text-muted-foreground">{employee.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge variant="secondary">{roleLabel(employee.role)}</Badge>
          <Badge variant={eligibility.derived_status === 'ACTIVE' ? 'success' : 'destructive'}>
            {eligibility.derived_status}
          </Badge>
          {employee.approval_status === 'pending' ? <Badge variant="outline">Pending Activation</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="rounded-md border border-border bg-[#fbfcff] px-3 py-2 text-xs space-y-1">
          <p>
            <span className="text-muted-foreground">Approval:</span> {employee.approval_status}
          </p>
          <p>
            <span className="text-muted-foreground">Worker profile:</span>{' '}
            {employee.is_active ? 'Active' : 'Inactive'}
          </p>
          <p>
            <span className="text-muted-foreground">Attendance eligibility:</span>{' '}
            {eligibility.can_submit_attendance ? 'Allowed' : 'Blocked'}
          </p>
          {eligibility.blocking_reason ? (
            <p className="text-amber-800">Reason: {eligibility.blocking_reason}</p>
          ) : null}
          {eligibility.required_administrative_action ? (
            <p className="text-muted-foreground">Action: {eligibility.required_administrative_action}</p>
          ) : null}
        </div>
        <p>Position: {employee.position || '—'}</p>
        <p>Hire date: {formatDate(employee.hire_date)}</p>
        <p>Phone: {employee.phone || '—'}</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">Edit profile</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit employee</DialogTitle>
              </DialogHeader>
              <form className="space-y-3" onSubmit={form.handleSubmit(onSave)}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>First name</Label>
                    <Input {...form.register('first_name')} />
                  </div>
                  <div className="space-y-1">
                    <Label>Last name</Label>
                    <Input {...form.register('last_name')} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input {...form.register('phone')} />
                </div>
                <div className="space-y-1">
                  <Label>Position</Label>
                  <Input {...form.register('position')} />
                </div>
                <div className="space-y-1">
                  <Label>Hire date</Label>
                  <Input type="date" {...form.register('hire_date')} />
                </div>
                <div className="space-y-1">
                  <Label>Emergency contact</Label>
                  <Input {...form.register('emergency_contact_name')} />
                </div>
                <div className="space-y-1">
                  <Label>Emergency phone</Label>
                  <Input {...form.register('emergency_contact_phone')} />
                </div>
                <div className="space-y-1">
                  <Label>Internal notes</Label>
                  <Textarea {...form.register('internal_notes')} />
                </div>
                <Button type="submit">Save changes</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                {employee.is_active ? 'Deactivate / Suspend' : 'Activate Worker'}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change worker status</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Activation alone does not create attendance. After activating, review any open exception and
                use Approve and Correct Attendance.
              </p>
              <div className="space-y-1">
                <Label>Reason (required)</Label>
                <Textarea
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="Why is this status changing?"
                  rows={3}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {!employee.is_active ? (
                  <Button
                    disabled={setStatus.isPending || statusReason.trim().length < 3}
                    onClick={async () => {
                      try {
                        await setStatus.mutateAsync({
                          workerId: employee.id,
                          action: 'activate',
                          reason: statusReason.trim(),
                        })
                        toast.success('Worker activated')
                        setStatusOpen(false)
                        setStatusReason('')
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Activation failed')
                      }
                    }}
                  >
                    Activate Worker
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      disabled={setStatus.isPending || statusReason.trim().length < 3}
                      onClick={async () => {
                        try {
                          await setStatus.mutateAsync({
                            workerId: employee.id,
                            action: 'deactivate',
                            reason: statusReason.trim(),
                          })
                          toast.success('Worker deactivated')
                          setStatusOpen(false)
                          setStatusReason('')
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Failed')
                        }
                      }}
                    >
                      Deactivate
                    </Button>
                    <Button
                      variant="outline"
                      disabled={setStatus.isPending || statusReason.trim().length < 3}
                      onClick={async () => {
                        try {
                          await setStatus.mutateAsync({
                            workerId: employee.id,
                            action: 'suspend',
                            reason: statusReason.trim(),
                          })
                          toast.success('Worker suspended')
                          setStatusOpen(false)
                          setStatusReason('')
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Failed')
                        }
                      }}
                    >
                      Suspend
                    </Button>
                  </>
                )}
                {employee.archived_at ? (
                  <Button
                    variant="secondary"
                    disabled={setStatus.isPending || statusReason.trim().length < 3}
                    onClick={async () => {
                      try {
                        await setStatus.mutateAsync({
                          workerId: employee.id,
                          action: 'restore',
                          reason: statusReason.trim(),
                        })
                        toast.success('Worker restored from archive')
                        setStatusOpen(false)
                        setStatusReason('')
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Failed')
                      }
                    }}
                  >
                    Restore
                  </Button>
                ) : null}
              </div>
              {history.length > 0 ? (
                <div className="space-y-1 border-t border-border pt-3">
                  <p className="text-sm font-medium">Status history</p>
                  {history.slice(0, 5).map((row: { id: string; action: string; reason: string; created_at: string }) => (
                    <div key={row.id} className="rounded-md border border-border px-2 py-1 text-xs">
                      <p>
                        {row.action} · {format(new Date(row.created_at), 'MMM d, h:mm a')}
                      </p>
                      <p className="text-muted-foreground">{row.reason}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </DialogContent>
          </Dialog>

          <Button size="sm" variant="destructive" onClick={onArchive}>
            Archive
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

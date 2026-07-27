import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
import { useProfiles, useUpdateProfile, useAdminSetUserAccess } from '@/features/data/hooks'
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
    return rows.filter((row) => (activeOnly ? row.is_active : true))
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
            Edit, activate, and archive approved employees. New accounts come from sign-up + admin approval.
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
              onToggleActive={async () => {
                try {
                  await updateProfile.mutateAsync({
                    id: employee.id,
                    values: {
                      first_name: employee.first_name,
                      last_name: employee.last_name,
                      is_active: !employee.is_active,
                    },
                  })
                  toast.success(employee.is_active ? 'Employee deactivated' : 'Employee activated')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Action failed')
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
  onToggleActive,
  onArchive,
}: {
  employee: Profile
  onSave: (values: ProfileFormValues) => Promise<void>
  onToggleActive: () => Promise<void>
  onArchive: () => Promise<void>
}) {
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
        <div>
          <CardTitle className="text-xl">{fullName(employee.first_name, employee.last_name)}</CardTitle>
          <p className="text-sm text-muted-foreground">{employee.email}</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">{roleLabel(employee.role)}</Badge>
          <Badge variant={employee.is_active ? 'success' : 'destructive'}>
            {employee.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>Position: {employee.position || '—'}</p>
        <p>Hire date: {formatDate(employee.hire_date)}</p>
        <p>Phone: {employee.phone || '—'}</p>
        <div className="flex gap-2 pt-2">
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
          <Button size="sm" variant="outline" onClick={onToggleActive}>
            {employee.is_active ? 'Deactivate' : 'Activate'}
          </Button>
          <Button size="sm" variant="destructive" onClick={onArchive}>
            Archive
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

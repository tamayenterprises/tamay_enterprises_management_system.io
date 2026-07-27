import { useMemo, useState } from 'react'
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
import { useProfiles, useUpdateProfile } from '@/features/data/hooks'
import { fullName } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { profileSchema, type ProfileFormValues } from '@/lib/validations'
import type { Profile } from '@/types/database'
import { supabase } from '@/lib/supabase'

export function SubcontractorsPage() {
  const [search, setSearch] = useState('')
  const { data, isLoading, isError } = useProfiles({ role: 'subcontractor', search })
  const updateProfile = useUpdateProfile()

  const subcontractors = useMemo(() => data ?? [], [data])

  if (isLoading) return <LoadingState />
  if (isError) return <EmptyState title="Unable to load subcontractors" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Subcontractors</h1>
          <p className="text-sm text-muted-foreground">
            Manage trade partners, insurance, licenses, and availability.
          </p>
        </div>
        <Input
          placeholder="Search subcontractors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72"
        />
      </div>

      {subcontractors.length === 0 ? (
        <EmptyState title="No subcontractors found" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {subcontractors.map((person) => (
            <SubcontractorCard
              key={person.id}
              person={person}
              onSave={async (values) => {
                try {
                  await updateProfile.mutateAsync({ id: person.id, values })
                  toast.success('Subcontractor updated')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Update failed')
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SubcontractorCard({
  person,
  onSave,
}: {
  person: Profile
  onSave: (values: ProfileFormValues) => Promise<void>
}) {
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: person.first_name,
      last_name: person.last_name,
      phone: person.phone,
      company_name: person.company_name,
      trade_specialization: person.trade_specialization,
      insurance_info: person.insurance_info,
      license_info: person.license_info,
      is_active: person.is_active,
    },
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-xl">{person.company_name || fullName(person.first_name, person.last_name)}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {fullName(person.first_name, person.last_name)} · {person.email}
          </p>
        </div>
        <Badge variant={person.is_active ? 'success' : 'destructive'}>
          {person.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>Trade: {person.trade_specialization || '—'}</p>
        <p>Insurance: {person.insurance_info || '—'}</p>
        <p>License: {person.license_info || '—'}</p>
        <div className="flex gap-2 pt-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">Edit</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit subcontractor</DialogTitle>
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
                  <Label>Company</Label>
                  <Input {...form.register('company_name')} />
                </div>
                <div className="space-y-1">
                  <Label>Trade</Label>
                  <Input {...form.register('trade_specialization')} />
                </div>
                <div className="space-y-1">
                  <Label>Insurance</Label>
                  <Textarea {...form.register('insurance_info')} />
                </div>
                <div className="space-y-1">
                  <Label>License info</Label>
                  <Textarea {...form.register('license_info')} />
                </div>
                <Button type="submit">Save</Button>
              </form>
            </DialogContent>
          </Dialog>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const { error } = await supabase
                .from('profiles')
                .update({ is_active: !person.is_active })
                .eq('id', person.id)
              if (error) toast.error(error.message)
              else toast.success('Status updated')
            }}
          >
            Toggle active
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

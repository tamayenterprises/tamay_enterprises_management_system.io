import { useState } from 'react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/features/auth/auth-context'
import { useCertifications, useCreateCertification, useProfiles } from '@/features/data/hooks'
import { certificationStatusLabel, formatDate, fullName, isManagementRole } from '@/lib/utils'
import { certificationSchema, type CertificationFormValues } from '@/lib/validations'

const CERT_TYPES = ['OSHA', 'Equipment', 'Trade', 'CPR', 'First Aid', 'Company-specific']

export function CertificationsPage() {
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('all')
  const { data, isLoading, isError } = useCertifications({
    search,
    status: status === 'all' ? undefined : status,
  })
  const { data: profiles = [] } = useProfiles()
  const createCertification = useCreateCertification()
  const form = useForm<CertificationFormValues>({
    resolver: zodResolver(certificationSchema),
    defaultValues: {
      name: '',
      certification_type: 'OSHA',
      profile_id: profile?.id ?? '',
      issue_date: '',
      expiration_date: '',
      notes: '',
    },
  })

  if (isLoading) return <LoadingState />
  if (isError) return <EmptyState title="Unable to load certifications" />

  const certifications = data ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Certifications</h1>
          <p className="text-sm text-muted-foreground">Track OSHA, CPR, equipment, and trade credentials.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input className="w-56" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="valid">Valid</SelectItem>
              <SelectItem value="expiring_soon">Expiring soon</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="missing">Missing</SelectItem>
            </SelectContent>
          </Select>
          <Dialog>
            <DialogTrigger asChild>
              <Button>Add certification</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add certification</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={form.handleSubmit(async (values) => {
                  try {
                    await createCertification.mutateAsync(values)
                    toast.success('Certification added')
                    form.reset({ ...values, name: '', notes: '' })
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Create failed')
                  }
                })}
              >
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input {...form.register('name')} />
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={form.watch('certification_type')}
                    onValueChange={(value) => form.setValue('certification_type', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CERT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {isManagementRole(profile?.role) ? (
                  <div className="space-y-1">
                    <Label>Worker</Label>
                    <Select
                      value={form.watch('profile_id')}
                      onValueChange={(value) => form.setValue('profile_id', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select worker" />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map((person) => (
                          <SelectItem key={person.id} value={person.id}>
                            {fullName(person.first_name, person.last_name)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Issue date</Label>
                    <Input type="date" {...form.register('issue_date')} />
                  </div>
                  <div className="space-y-1">
                    <Label>Expiration date</Label>
                    <Input type="date" {...form.register('expiration_date')} />
                  </div>
                </div>
                <Button type="submit">Save</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {certifications.length === 0 ? (
        <EmptyState title="No certifications found" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {certifications.map((cert) => (
            <Card key={cert.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-xl">{cert.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {cert.profile ? fullName(cert.profile.first_name, cert.profile.last_name) : 'Worker'} ·{' '}
                    {cert.certification_type}
                  </p>
                </div>
                <Badge
                  variant={
                    cert.status === 'valid'
                      ? 'success'
                      : cert.status === 'expiring_soon'
                        ? 'warning'
                        : 'destructive'
                  }
                >
                  {certificationStatusLabel(cert.status)}
                </Badge>
              </CardHeader>
              <CardContent className="text-sm">
                <p>Issued: {formatDate(cert.issue_date)}</p>
                <p>Expires: {formatDate(cert.expiration_date)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

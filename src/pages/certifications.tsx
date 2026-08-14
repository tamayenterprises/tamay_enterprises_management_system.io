import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { FilePickerButton } from '@/components/ui/file-picker-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import {
  createCertificationProofUrl,
  useCertifications,
  useCreateCertification,
  useDeleteCertification,
  useProfiles,
  useUpdateCertification,
} from '@/features/data/hooks'
import { certificationStatusLabel, formatDate, fullName, isManagementRole } from '@/lib/utils'
import { resolvedDocumentUploadAccept, confirmAction } from '@/lib/uploads'
import { certificationSchema, type CertificationFormValues } from '@/lib/validations'
import type { Certification } from '@/types/database'

const CERT_TYPES = ['OSHA', 'Equipment', 'Trade', 'CPR', 'First Aid', 'Company-specific']

export function CertificationsPage() {
  const { profile } = useAuth()
  const canManage = isManagementRole(profile?.role)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [type, setType] = useState<string>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [proofFile, setProofFile] = useState<File | null>(null)

  const { data, isLoading, isError } = useCertifications({
    search,
    status: status === 'all' ? undefined : status,
    type: type === 'all' ? undefined : type,
    profileId: canManage ? undefined : profile?.id,
  })
  const { data: profiles = [] } = useProfiles({
    role: ['employee', 'subcontractor', 'project_manager'],
  })
  const createCertification = useCreateCertification()
  const updateCertification = useUpdateCertification()
  const deleteCertification = useDeleteCertification()

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

  const workers = useMemo(
    () => profiles.filter((person) => person.approval_status === 'approved' && person.is_active && !person.archived_at),
    [profiles],
  )

  const certifications = data ?? []
  const alertCounts = useMemo(() => {
    const all = data ?? []
    return {
      expiring: all.filter((c) => c.status === 'expiring_soon').length,
      expired: all.filter((c) => c.status === 'expired').length,
      missing: all.filter((c) => c.status === 'missing').length,
      valid: all.filter((c) => c.status === 'valid').length,
    }
  }, [data])

  if (isLoading) return <LoadingState />
  if (isError) return <EmptyState title="Unable to load certifications" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Certifications</h1>
          <p className="text-sm text-muted-foreground">
            {canManage
              ? 'Track OSHA, CPR, equipment, and trade credentials across the workforce.'
              : 'Upload your certification proof file, keep expiration dates current, and remove outdated records.'}
          </p>
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
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {CERT_TYPES.map((certType) => (
                <SelectItem key={certType} value={certType}>
                  {certType}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open)
              if (!open) setProofFile(null)
            }}
          >
            <DialogTrigger asChild>
              <Button>Add certification</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add certification</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={form.handleSubmit(async (values) => {
                  try {
                    if (!proofFile) {
                      toast.error('Upload a proof file (PDF or image) for this certification.')
                      return
                    }
                    const payload = {
                      ...values,
                      profile_id: canManage ? values.profile_id : profile!.id,
                    }
                    await createCertification.mutateAsync({ values: payload, file: proofFile })
                    toast.success('Certification added')
                    form.reset({
                      name: '',
                      certification_type: 'OSHA',
                      profile_id: profile?.id ?? '',
                      issue_date: '',
                      expiration_date: '',
                      notes: '',
                    })
                    setProofFile(null)
                    setCreateOpen(false)
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Create failed')
                  }
                })}
              >
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input {...form.register('name')} />
                  {form.formState.errors.name ? (
                    <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                  ) : null}
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
                      {CERT_TYPES.map((certType) => (
                        <SelectItem key={certType} value={certType}>
                          {certType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {canManage ? (
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
                        {workers.map((person) => (
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
                <div className="space-y-1">
                  <Label>Proof file</Label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <FilePickerButton
                      accept={resolvedDocumentUploadAccept()}
                      label={proofFile ? 'Change proof file' : 'Upload proof file'}
                      size="sm"
                      variant="outline"
                      multiple={false}
                      onFile={(selected) => setProofFile(selected)}
                    />
                    <p className="text-sm text-muted-foreground">
                      {proofFile ? proofFile.name : 'No file selected yet'}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Required. Upload PDF or image proof of the certification.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea {...form.register('notes')} />
                </div>
                <Button type="submit" disabled={createCertification.isPending}>
                  {createCertification.isPending ? 'Saving…' : 'Save'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Valid" value={alertCounts.valid} />
        <SummaryCard label="Expiring soon" value={alertCounts.expiring} tone="warning" />
        <SummaryCard label="Expired" value={alertCounts.expired} tone="danger" />
        <SummaryCard label="Missing dates" value={alertCounts.missing} />
      </div>

      {certifications.length === 0 ? (
        <EmptyState
          title="No certifications found"
          description="Add OSHA, CPR, equipment, or trade credentials with a proof file to start tracking."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {certifications.map((cert) => (
            <CertificationCard
              key={cert.id}
              cert={cert}
              canManage={canManage}
              canRemove={canManage || cert.profile_id === profile?.id}
              workers={workers}
              onSave={async (values, file) => {
                try {
                  await updateCertification.mutateAsync({
                    id: cert.id,
                    values,
                    file,
                    existingDocumentUrl: cert.document_url,
                  })
                  toast.success('Certification updated')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Update failed')
                }
              }}
              onDelete={async () => {
                if (!confirmAction(`Remove certification "${cert.name}"? This cannot be undone.`)) return
                try {
                  await deleteCertification.mutateAsync(cert)
                  toast.success('Certification removed')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Remove failed')
                }
              }}
              onViewProof={async () => {
                try {
                  const url = await createCertificationProofUrl(cert.document_url)
                  window.open(url, '_blank', 'noopener,noreferrer')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Unable to open proof file')
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'warning' | 'danger'
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={`mt-1 font-display text-3xl font-semibold ${
            tone === 'warning' ? 'text-warning' : tone === 'danger' ? 'text-destructive' : ''
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function CertificationCard({
  cert,
  canManage,
  canRemove,
  workers,
  onSave,
  onDelete,
  onViewProof,
}: {
  cert: Certification
  canManage: boolean
  canRemove: boolean
  workers: Array<{ id: string; first_name: string; last_name: string }>
  onSave: (values: CertificationFormValues, file?: File | null) => Promise<void>
  onDelete: () => Promise<void>
  onViewProof: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const form = useForm<CertificationFormValues>({
    resolver: zodResolver(certificationSchema),
    values: {
      name: cert.name,
      certification_type: cert.certification_type,
      profile_id: cert.profile_id,
      issue_date: cert.issue_date ?? '',
      expiration_date: cert.expiration_date ?? '',
      notes: cert.notes ?? '',
    },
  })

  return (
    <Card>
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
      <CardContent className="space-y-3 text-sm">
        <p>Issued: {formatDate(cert.issue_date)}</p>
        <p>Expires: {formatDate(cert.expiration_date)}</p>
        <p>Proof file: {cert.document_url ? 'Uploaded' : 'Missing'}</p>
        {cert.notes ? <p className="text-muted-foreground">{cert.notes}</p> : null}
        <div className="flex flex-wrap gap-2 pt-1">
          {cert.document_url ? (
            <Button size="sm" variant="outline" onClick={onViewProof}>
              View proof
            </Button>
          ) : null}
          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next)
              if (!next) setProofFile(null)
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit certification</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={form.handleSubmit(async (values) => {
                  await onSave(values, proofFile)
                  setProofFile(null)
                  setOpen(false)
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
                      {CERT_TYPES.map((certType) => (
                        <SelectItem key={certType} value={certType}>
                          {certType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {canManage ? (
                  <div className="space-y-1">
                    <Label>Worker</Label>
                    <Select
                      value={form.watch('profile_id')}
                      onValueChange={(value) => form.setValue('profile_id', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {workers.map((person) => (
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
                <div className="space-y-1">
                  <Label>Replace proof file (optional)</Label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <FilePickerButton
                      accept={resolvedDocumentUploadAccept()}
                      label={proofFile ? 'Change proof file' : 'Upload proof file'}
                      size="sm"
                      variant="outline"
                      multiple={false}
                      onFile={(selected) => setProofFile(selected)}
                    />
                    <p className="text-sm text-muted-foreground">
                      {proofFile ? proofFile.name : 'No new file selected'}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {cert.document_url
                      ? 'Leave empty to keep the current proof file.'
                      : 'Upload a PDF or image as proof.'}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea {...form.register('notes')} />
                </div>
                <Button type="submit">Save changes</Button>
              </form>
            </DialogContent>
          </Dialog>
          {canRemove ? (
            <Button size="sm" variant="destructive" onClick={onDelete}>
              Remove
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

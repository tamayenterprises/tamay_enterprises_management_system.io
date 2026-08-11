import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { FilePickerButton, SelectedFilesList, selectedFilesLabel } from '@/components/ui/file-picker-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Textarea } from '@/components/ui/textarea'
import {
  createProjectRequestFileSignedUrl,
  useCreateProjectRequest,
  useMyProjectRequests,
  useUploadProjectRequestFile,
} from '@/features/client/hooks'
import { formatFileSize, formatRelative } from '@/lib/utils'
import { IMAGE_UPLOAD_ACCEPT, UPLOAD_ACCEPT } from '@/lib/uploads'
import { projectRequestSchema, type ProjectRequestFormValues } from '@/lib/validations'
import type { ProjectRequest } from '@/types/database'

function statusBadge(status: ProjectRequest['status']) {
  const label = status.replace(/_/g, ' ')
  if (status === 'converted' || status === 'approved') return <Badge variant="secondary">{label}</Badge>
  if (status === 'declined') return <Badge variant="destructive">{label}</Badge>
  return <Badge variant="outline">{label}</Badge>
}

export function ClientRequestsPage() {
  const { data: requests = [], isLoading, isError } = useMyProjectRequests()
  const createRequest = useCreateProjectRequest()
  const uploadFile = useUploadProjectRequestFile()
  const [open, setOpen] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])
  const [documents, setDocuments] = useState<File[]>([])

  const form = useForm<ProjectRequestFormValues>({
    resolver: zodResolver(projectRequestSchema),
    defaultValues: {
      title: '',
      description: '',
      location: '',
      preferred_start_date: '',
    },
  })

  if (isLoading) return <LoadingState label="Loading requests..." />
  if (isError) return <EmptyState title="Unable to load project requests" />

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const request = await createRequest.mutateAsync(values)
      for (const photo of photos) {
        await uploadFile.mutateAsync({ requestId: request.id, file: photo, fileKind: 'photo' })
      }
      for (const document of documents) {
        await uploadFile.mutateAsync({ requestId: request.id, file: document, fileKind: 'document' })
      }
      toast.success('Project request submitted')
      form.reset()
      setPhotos([])
      setDocuments([])
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to submit request')
    }
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Project requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell Tamay about the work you need. Attach space photos or documents to help them plan.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>New request</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Request a project</DialogTitle>
            </DialogHeader>
            <form className="space-y-3" onSubmit={onSubmit}>
              <div className="space-y-1">
                <Label htmlFor="title">Project title</Label>
                <Input id="title" {...form.register('title')} placeholder="Kitchen remodel" />
                {form.formState.errors.title ? (
                  <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="location">Location / address</Label>
                <Input id="location" {...form.register('location')} placeholder="Job site address" />
                {form.formState.errors.location ? (
                  <p className="text-xs text-destructive">{form.formState.errors.location.message}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="description">What do you need?</Label>
                <Textarea
                  id="description"
                  rows={4}
                  {...form.register('description')}
                  placeholder="Describe the space and the work you want Tamay to do."
                />
                {form.formState.errors.description ? (
                  <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="preferred_start_date">Preferred start (optional)</Label>
                <Input id="preferred_start_date" type="date" {...form.register('preferred_start_date')} />
              </div>
              <div className="space-y-1">
                <Label>Space photos (optional)</Label>
                <FilePickerButton
                  accept={IMAGE_UPLOAD_ACCEPT}
                  label={selectedFilesLabel(photos, 'Choose photos')}
                  variant="outline"
                  multiple
                  selectedFiles={photos}
                  onFiles={setPhotos}
                />
                <SelectedFilesList files={photos} onChange={setPhotos} />
              </div>
              <div className="space-y-1">
                <Label>Documents (optional)</Label>
                <FilePickerButton
                  accept={UPLOAD_ACCEPT}
                  label={selectedFilesLabel(documents, 'Choose files')}
                  variant="outline"
                  multiple
                  selectedFiles={documents}
                  onFiles={setDocuments}
                />
                <SelectedFilesList files={documents} onChange={setDocuments} />
              </div>
              <Button className="w-full" disabled={createRequest.isPending || uploadFile.isPending}>
                {createRequest.isPending || uploadFile.isPending ? 'Submitting…' : 'Submit request'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          title="No requests yet"
          description="Create a request to get started with Tamay Enterprises."
        />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <Card key={request.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-lg">{request.title}</CardTitle>
                  {statusBadge(request.status)}
                </div>
                <CardDescription>
                  {request.location || 'No location'} · {formatRelative(request.created_at)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="whitespace-pre-wrap text-muted-foreground">{request.description}</p>
                {request.files && request.files.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-foreground">Attachments</p>
                    {request.files.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        className="block w-full rounded-md border border-border px-2.5 py-1.5 text-left text-xs hover:bg-muted/40"
                        onClick={async () => {
                          try {
                            const url = await createProjectRequestFileSignedUrl(file.storage_path)
                            window.open(url, '_blank', 'noopener,noreferrer')
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : 'Unable to open file')
                          }
                        }}
                      >
                        {file.name}
                        <span className="ml-2 text-muted-foreground">
                          {file.file_kind} · {formatFileSize(file.file_size ?? 0)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {request.status === 'pending' || request.status === 'under_review' ? (
                  <div className="flex flex-wrap gap-2">
                    <FilePickerButton
                      accept={IMAGE_UPLOAD_ACCEPT}
                      label="Add photos"
                      size="sm"
                      variant="outline"
                      multiple
                      append={false}
                      isLoading={uploadFile.isPending}
                      onFiles={async (selected) => {
                        try {
                          for (const file of selected) {
                            await uploadFile.mutateAsync({
                              requestId: request.id,
                              file,
                              fileKind: 'photo',
                            })
                          }
                          toast.success(
                            selected.length === 1 ? 'Photo added' : `${selected.length} photos added`,
                          )
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Upload failed')
                        }
                      }}
                    />
                    <FilePickerButton
                      accept={UPLOAD_ACCEPT}
                      label="Add documents"
                      size="sm"
                      variant="outline"
                      multiple
                      append={false}
                      isLoading={uploadFile.isPending}
                      onFiles={async (selected) => {
                        try {
                          for (const file of selected) {
                            await uploadFile.mutateAsync({
                              requestId: request.id,
                              file,
                              fileKind: 'document',
                            })
                          }
                          toast.success(
                            selected.length === 1
                              ? 'Document added'
                              : `${selected.length} documents added`,
                          )
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Upload failed')
                        }
                      }}
                    />
                  </div>
                ) : null}
                {request.converted_project_id ? (
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/portal/projects/${request.converted_project_id}`}>Open project</Link>
                  </Button>
                ) : null}
                {request.admin_notes ? (
                  <p className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs">
                    Tamay note: {request.admin_notes}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

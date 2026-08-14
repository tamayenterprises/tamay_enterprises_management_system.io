import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
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
  createDocumentSignedUrl,
  useArchiveProject,
  useAssignWorker,
  useAssignmentHistory,
  useDeleteDocument,
  usePostProjectDocumentsToThread,
  usePostProjectPhotosToThread,
  useProfiles,
  useProject,
  useProjectAssignments,
  useProjectDocuments,
  useProjectWarrantyAudit,
  useRemoveAssignment,
  useRestoreProject,
  useUpdateProject,
  useUploadDocument,
} from '@/features/data/hooks'
import { ProjectUpdates } from '@/features/projects/project-updates'
import { ProjectLocationPanel } from '@/features/projects/project-location-panel'
import {
  documentCategoryLabel,
  formatDate,
  formatRelative,
  fullName,
  isManagementRole,
  projectStatusLabel,
  roleLabel,
  warrantyStatusLabel,
} from '@/lib/utils'
import { IMAGE_UPLOAD_ACCEPT, UPLOAD_FOLDER_HINT, confirmAction, isImageUploadFile, resolvedDocumentUploadAccept } from '@/lib/uploads'
import { projectSchema, type ProjectFormValues } from '@/lib/validations'
import type { ProjectStatus } from '@/types/database'

export function ProjectDetailPage() {
  const { projectId } = useParams()
  const [params] = useSearchParams()
  const { profile } = useAuth()
  const { data: project, isLoading, isError } = useProject(projectId)
  const { data: assignments = [] } = useProjectAssignments(projectId)
  const { data: documents = [] } = useProjectDocuments(projectId)
  const { data: history = [] } = useAssignmentHistory(projectId)
  const { data: warrantyAudit = [] } = useProjectWarrantyAudit(projectId)
  const { data: workers = [] } = useProfiles({ role: ['employee', 'subcontractor', 'project_manager'] })
  const { data: clients = [] } = useProfiles({ role: 'client' })
  const updateProject = useUpdateProject(projectId ?? '')
  const archiveProject = useArchiveProject()
  const restoreProject = useRestoreProject()
  const assignWorker = useAssignWorker()
  const removeAssignment = useRemoveAssignment()
  const uploadDocument = useUploadDocument()
  const postPhotosToThread = usePostProjectPhotosToThread()
  const postDocumentsToThread = usePostProjectDocumentsToThread()
  const deleteDocument = useDeleteDocument()
  const [selectedWorker, setSelectedWorker] = useState('')
  const [selectedClient, setSelectedClient] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const focusDocId = params.get('doc')
  const focusTab = params.get('tab')

  useEffect(() => {
    if (focusTab !== 'files' && !focusDocId) return
    const timer = window.setTimeout(() => {
      document.getElementById('project-files')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      if (focusDocId) {
        document.getElementById(`doc-${focusDocId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [focusTab, focusDocId, documents])

  const editForm = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    values: project
      ? {
          name: project.name,
          description: project.description ?? '',
          location: project.location ?? '',
          status: project.status,
          priority: project.priority,
          start_date: project.start_date ?? '',
          deadline: project.deadline ?? '',
          warranty_ends_on: project.warranty_ends_on ?? '',
        }
      : undefined,
  })

  const assignedIds = useMemo(
    () => new Set(assignments.map((item) => item.profile_id)),
    [assignments],
  )

  const availableWorkers = useMemo(() => {
    return workers.filter(
      (worker) =>
        worker.approval_status === 'approved' &&
        worker.is_active &&
        !worker.archived_at &&
        !assignedIds.has(worker.id),
    )
  }, [workers, assignedIds])

  const availableClients = useMemo(() => {
    return clients.filter(
      (client) =>
        client.approval_status === 'approved' &&
        client.is_active &&
        !client.archived_at &&
        !assignedIds.has(client.id),
    )
  }, [clients, assignedIds])

  const workerAssignments = useMemo(
    () => assignments.filter((item) => item.profile?.role !== 'client'),
    [assignments],
  )
  const clientAssignments = useMemo(
    () => assignments.filter((item) => item.profile?.role === 'client'),
    [assignments],
  )

  if (isLoading) return <LoadingState />
  if (isError || !project) {
    return <EmptyState title="Project not found" description="It may have been archived or you lack access." />
  }

  const canManage = isManagementRole(profile?.role)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 px-2">
            <Link to="/projects">← Back to projects</Link>
          </Button>
          <h1 className="font-display text-3xl font-semibold">{project.name}</h1>
          <p className="text-muted-foreground">{project.location || 'Location not set'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {project.archived_at ? <Badge variant="secondary">Archived</Badge> : null}
          <Badge>{projectStatusLabel(project.status)}</Badge>
          <Badge variant="secondary">{project.priority}</Badge>
          {canManage && !project.archived_at ? (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (
                  !confirmAction(
                    `Archive project "${project.name}"? It will stay available under Archived for warranty records.`,
                  )
                ) {
                  return
                }
                try {
                  await archiveProject.mutateAsync(project.id)
                  toast.success('Project archived')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Archive failed')
                }
              }}
            >
              Archive
            </Button>
          ) : null}
          {canManage && project.archived_at ? (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await restoreProject.mutateAsync(project.id)
                  toast.success('Project restored')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Restore failed')
                }
              }}
            >
              Restore
            </Button>
          ) : null}
          {canManage ? (
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  Edit project
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit project</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-3"
                  onSubmit={editForm.handleSubmit(async (values) => {
                    try {
                      await updateProject.mutateAsync(values)
                      toast.success('Project updated')
                      setEditOpen(false)
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Update failed')
                    }
                  })}
                >
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input {...editForm.register('name')} />
                  </div>
                  <div className="space-y-1">
                    <Label>Location</Label>
                    <Input {...editForm.register('location')} />
                  </div>
                  <div className="space-y-1">
                    <Label>Description</Label>
                    <Textarea {...editForm.register('description')} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Status</Label>
                      <Select
                        value={editForm.watch('status')}
                        onValueChange={(value) => editForm.setValue('status', value as ProjectFormValues['status'])}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not_started">Not Started</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="waiting">Waiting</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Priority</Label>
                      <Select
                        value={editForm.watch('priority')}
                        onValueChange={(value) => editForm.setValue('priority', value as ProjectFormValues['priority'])}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Start date</Label>
                      <Input type="date" {...editForm.register('start_date')} />
                    </div>
                    <div className="space-y-1">
                      <Label>Deadline</Label>
                      <Input type="date" {...editForm.register('deadline')} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Warranty ends</Label>
                    <Input type="date" {...editForm.register('warranty_ends_on')} />
                    <p className="text-xs text-muted-foreground">
                      Defaults to completion + 7 years. Once set, the date can be changed but not
                      cleared. Hard delete is blocked while warranty is active.
                    </p>
                  </div>
                  <Button type="submit" disabled={updateProject.isPending}>
                    Save changes
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Project information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>{project.description || 'No description provided.'}</p>
              <p>Start: {formatDate(project.start_date)}</p>
              <p>Deadline: {formatDate(project.deadline)}</p>
              <p>Warranty ends: {formatDate(project.warranty_ends_on)}</p>
              <p className="text-muted-foreground">{warrantyStatusLabel(project.warranty_ends_on)}</p>
              {project.archived_at ? (
                <p className="text-muted-foreground">Archived {formatDate(project.archived_at)}</p>
              ) : null}
              <div className="space-y-2 pt-2">
                <Label>Update status</Label>
                <Select
                  value={project.status}
                  disabled={!canManage}
                  onValueChange={async (value) => {
                    try {
                      await updateProject.mutateAsync({ status: value as ProjectStatus })
                      toast.success('Status updated')
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Update failed')
                    }
                  }}
                >
                  <SelectTrigger className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="waiting">Waiting</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <ProjectUpdates projectId={project.id} />

          {canManage ? <ProjectLocationPanel project={project} /> : null}

          <Card id="project-files">
            <CardHeader>
              <CardTitle>Files & work photos</CardTitle>
              <p className="text-sm text-muted-foreground">
                Upload photos and documents separately (better on phones). Files are saved here and
                noted in the project message thread.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <FilePickerButton
                    accept={IMAGE_UPLOAD_ACCEPT}
                    label="Upload photos"
                    loadingLabel="Uploading photos…"
                    disabled={!profile?.organization_id}
                    isLoading={
                      uploadDocument.isPending ||
                      postPhotosToThread.isPending ||
                      postDocumentsToThread.isPending
                    }
                    multiple
                    append={false}
                    onFiles={async (selected) => {
                      if (!profile?.organization_id) return
                      const photosOnly = selected.filter((file) => isImageUploadFile(file))
                      if (photosOnly.length === 0) {
                        toast.error('Please choose photo files (JPG, PNG, WEBP, or HEIC).')
                        return
                      }
                      try {
                        const uploaded = []
                        const failures: string[] = []
                        for (const file of photosOnly) {
                          try {
                            uploaded.push(
                              await uploadDocument.mutateAsync({
                                file,
                                category: 'work_photo',
                                projectId: project.id,
                                bucket: 'project-files',
                              }),
                            )
                          } catch (error) {
                            failures.push(
                              error instanceof Error ? error.message : `Failed: ${file.name}`,
                            )
                          }
                        }
                        if (uploaded.length > 0) {
                          await postPhotosToThread.mutateAsync({
                            projectId: project.id,
                            photos: uploaded,
                          })
                        }
                        if (failures.length > 0) {
                          toast.error(
                            uploaded.length > 0
                              ? `${uploaded.length} uploaded; ${failures.length} failed. ${failures[0]}`
                              : failures[0]!,
                          )
                        } else {
                          toast.success(
                            uploaded.length === 1
                              ? 'Photo uploaded and saved'
                              : `${uploaded.length} photos uploaded and saved`,
                          )
                        }
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Upload failed')
                      }
                    }}
                  />
                  <FilePickerButton
                    accept={resolvedDocumentUploadAccept()}
                    label="Upload documents"
                    loadingLabel="Uploading documents…"
                    variant="outline"
                    disabled={!profile?.organization_id}
                    isLoading={
                      uploadDocument.isPending ||
                      postPhotosToThread.isPending ||
                      postDocumentsToThread.isPending
                    }
                    multiple
                    append={false}
                    onFiles={async (selected) => {
                      if (!profile?.organization_id) return
                      const docsOnly = selected.filter((file) => !isImageUploadFile(file))
                      if (docsOnly.length === 0) {
                        toast.error('Please choose document files (PDF, Word, Excel, etc.).')
                        return
                      }
                      try {
                        const uploaded = []
                        const failures: string[] = []
                        for (const file of docsOnly) {
                          try {
                            uploaded.push(
                              await uploadDocument.mutateAsync({
                                file,
                                category: 'project_file',
                                projectId: project.id,
                                bucket: 'project-files',
                              }),
                            )
                          } catch (error) {
                            failures.push(
                              error instanceof Error ? error.message : `Failed: ${file.name}`,
                            )
                          }
                        }
                        if (uploaded.length > 0) {
                          await postDocumentsToThread.mutateAsync({
                            projectId: project.id,
                            documents: uploaded,
                          })
                        }
                        if (failures.length > 0) {
                          toast.error(
                            uploaded.length > 0
                              ? `${uploaded.length} uploaded; ${failures.length} failed. ${failures[0]}`
                              : failures[0]!,
                          )
                        } else {
                          toast.success(
                            uploaded.length === 1
                              ? 'Document uploaded and saved'
                              : `${uploaded.length} documents uploaded and saved`,
                          )
                        }
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Upload failed')
                      }
                    }}
                  />
                  <FilePickerButton
                    variant="outline"
                    directory
                    append={false}
                    disabled={!profile?.organization_id}
                    isLoading={
                      uploadDocument.isPending ||
                      postPhotosToThread.isPending ||
                      postDocumentsToThread.isPending
                    }
                    onFiles={async (selected) => {
                      if (!profile?.organization_id) return
                      if (selected.length === 0) return
                      try {
                        const uploaded = []
                        const failures: string[] = []
                        for (const file of selected) {
                          try {
                            uploaded.push(
                              await uploadDocument.mutateAsync({
                                file,
                                category: isImageUploadFile(file) ? 'work_photo' : 'project_file',
                                projectId: project.id,
                                bucket: 'project-files',
                              }),
                            )
                          } catch (error) {
                            failures.push(
                              error instanceof Error ? error.message : `Failed: ${file.name}`,
                            )
                          }
                        }
                        const threadPhotos = uploaded.filter(
                          (doc) =>
                            doc.category === 'work_photo' ||
                            Boolean(doc.mime_type?.startsWith('image/')),
                        )
                        const threadDocs = uploaded.filter(
                          (doc) =>
                            doc.category !== 'work_photo' && !doc.mime_type?.startsWith('image/'),
                        )
                        if (threadPhotos.length > 0) {
                          await postPhotosToThread.mutateAsync({
                            projectId: project.id,
                            photos: threadPhotos,
                          })
                        }
                        if (threadDocs.length > 0) {
                          await postDocumentsToThread.mutateAsync({
                            projectId: project.id,
                            documents: threadDocs,
                          })
                        }
                        if (failures.length > 0) {
                          toast.error(
                            uploaded.length > 0
                              ? `${uploaded.length} uploaded; ${failures.length} skipped/failed. ${failures[0]}`
                              : failures[0]!,
                          )
                        } else {
                          toast.success(`${uploaded.length} files uploaded from folder`)
                        }
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Upload failed')
                      }
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{UPLOAD_FOLDER_HINT}</p>
              </div>
              {documents.length === 0 ? (
                <EmptyState title="No files uploaded" />
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      id={`doc-${doc.id}`}
                      className={`flex flex-col gap-2 rounded-md border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between ${
                        focusDocId === doc.id
                          ? 'border-accent bg-accent/5 ring-2 ring-accent/30'
                          : 'border-border'
                      }`}
                    >
                      <div>
                        <p className="font-medium">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {documentCategoryLabel(doc.category)} · {formatRelative(doc.created_at)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const url = await createDocumentSignedUrl(doc)
                              window.open(url, '_blank', 'noopener,noreferrer')
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : 'Download failed')
                            }
                          }}
                        >
                          Download
                        </Button>
                        {canManage || doc.uploaded_by === profile?.id || doc.owner_id === profile?.id ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={async () => {
                              if (!confirmAction(`Remove "${doc.name}"? This cannot be undone.`)) return
                              try {
                                await deleteDocument.mutateAsync(doc)
                                toast.success('File removed')
                              } catch (error) {
                                toast.error(error instanceof Error ? error.message : 'Remove failed')
                              }
                            }}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>People on this project</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Assign to worker</p>
                  <p className="text-xs text-muted-foreground">
                    Employees, subcontractors, and project managers.
                  </p>
                </div>
                {canManage ? (
                  <div className="space-y-2">
                    <Select value={selectedWorker} onValueChange={setSelectedWorker}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a worker" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableWorkers.length === 0 ? (
                          <SelectItem value="none" disabled>
                            No available workers
                          </SelectItem>
                        ) : (
                          availableWorkers.map((worker) => (
                            <SelectItem key={worker.id} value={worker.id}>
                              {fullName(worker.first_name, worker.last_name)} ({roleLabel(worker.role)})
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!selectedWorker || selectedWorker === 'none'}
                      onClick={async () => {
                        try {
                          await assignWorker.mutateAsync({
                            projectId: project.id,
                            profileId: selectedWorker,
                          })
                          setSelectedWorker('')
                          toast.success('Worker assigned')
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Assignment failed')
                        }
                      }}
                    >
                      Assign worker
                    </Button>
                  </div>
                ) : null}
                {workerAssignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No workers assigned yet.</p>
                ) : (
                  workerAssignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">
                          {assignment.profile
                            ? fullName(assignment.profile.first_name, assignment.profile.last_name)
                            : 'Worker'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {assignment.profile ? roleLabel(assignment.profile.role) : '—'} · assigned{' '}
                          {formatRelative(assignment.assigned_at)}
                        </p>
                      </div>
                      {canManage ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await removeAssignment.mutateAsync({
                                assignmentId: assignment.id,
                                projectId: project.id,
                                profileId: assignment.profile_id,
                              })
                              toast.success('Worker removed')
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : 'Remove failed')
                            }
                          }}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-border pt-6 space-y-3">
                <div>
                  <p className="text-sm font-medium">Assign to client</p>
                  <p className="text-xs text-muted-foreground">
                    Gives the customer access to this project in the client portal.
                  </p>
                </div>
                {canManage ? (
                  <div className="space-y-2">
                    <Select value={selectedClient} onValueChange={setSelectedClient}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a client" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableClients.length === 0 ? (
                          <SelectItem value="none" disabled>
                            No available clients
                          </SelectItem>
                        ) : (
                          availableClients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {fullName(client.first_name, client.last_name)}
                              {client.company_name ? ` · ${client.company_name}` : ''}
                              {client.email ? ` (${client.email})` : ''}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!selectedClient || selectedClient === 'none'}
                      onClick={async () => {
                        try {
                          await assignWorker.mutateAsync({
                            projectId: project.id,
                            profileId: selectedClient,
                          })
                          setSelectedClient('')
                          toast.success('Client assigned')
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Assignment failed')
                        }
                      }}
                    >
                      Assign client
                    </Button>
                  </div>
                ) : null}
                {clientAssignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No clients assigned yet.</p>
                ) : (
                  clientAssignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">
                          {assignment.profile
                            ? fullName(assignment.profile.first_name, assignment.profile.last_name)
                            : 'Client'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Client
                          {assignment.profile?.company_name
                            ? ` · ${assignment.profile.company_name}`
                            : ''}{' '}
                          · assigned {formatRelative(assignment.assigned_at)}
                        </p>
                      </div>
                      {canManage ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await removeAssignment.mutateAsync({
                                assignmentId: assignment.id,
                                projectId: project.id,
                                profileId: assignment.profile_id,
                              })
                              toast.success('Client removed')
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : 'Remove failed')
                            }
                          }}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>Assignment history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {history.length === 0 ? (
                  <EmptyState title="No assignment history" />
                ) : (
                  history.map((item) => (
                    <div key={item.id} className="rounded-md border border-border px-3 py-2 text-sm">
                      <p className="font-medium capitalize">{item.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.profile ? fullName(item.profile.first_name, item.profile.last_name) : 'Person'} ·{' '}
                        {formatRelative(item.created_at)}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}

          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>Warranty & archive audit</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {warrantyAudit.length === 0 ? (
                  <EmptyState title="No warranty or archive changes logged yet" />
                ) : (
                  warrantyAudit.map((item) => {
                    const actionLabel =
                      item.action === 'project_archived'
                        ? 'Archived'
                        : item.action === 'project_restored'
                          ? 'Restored'
                          : item.action === 'warranty_date_changed'
                            ? 'Warranty date changed'
                            : item.action
                    return (
                      <div key={item.id} className="rounded-md border border-border px-3 py-2 text-sm">
                        <p className="font-medium">{actionLabel}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.actor
                            ? fullName(item.actor.first_name, item.actor.last_name)
                            : 'System'}{' '}
                          · {formatRelative(item.created_at)}
                        </p>
                        {item.action === 'warranty_date_changed' ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDate(String(item.metadata?.previous_warranty_ends_on ?? ''))} →{' '}
                            {formatDate(String(item.metadata?.warranty_ends_on ?? ''))}
                          </p>
                        ) : null}
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

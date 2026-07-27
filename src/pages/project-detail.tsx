import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
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
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import {
  useAssignWorker,
  useAssignmentHistory,
  useProfiles,
  useProject,
  useProjectAssignments,
  useProjectDocuments,
  useProjectNotes,
  useRemoveAssignment,
  useUpdateProject,
} from '@/features/data/hooks'
import { formatDate, formatRelative, fullName, isManagementRole, projectStatusLabel, roleLabel } from '@/lib/utils'
import { projectSchema, type ProjectFormValues } from '@/lib/validations'
import type { ProjectStatus } from '@/types/database'
import { supabase } from '@/lib/supabase'

export function ProjectDetailPage() {
  const { projectId } = useParams()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const { data: project, isLoading, isError } = useProject(projectId)
  const { data: assignments = [] } = useProjectAssignments(projectId)
  const { data: notes = [] } = useProjectNotes(projectId)
  const { data: documents = [] } = useProjectDocuments(projectId)
  const { data: history = [] } = useAssignmentHistory(projectId)
  const { data: workers = [] } = useProfiles({ role: ['employee', 'subcontractor', 'project_manager'] })
  const updateProject = useUpdateProject(projectId ?? '')
  const assignWorker = useAssignWorker()
  const removeAssignment = useRemoveAssignment()
  const [note, setNote] = useState('')
  const [selectedWorker, setSelectedWorker] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [editOpen, setEditOpen] = useState(false)

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
        }
      : undefined,
  })

  const availableWorkers = useMemo(() => {
    const assignedIds = new Set(assignments.map((item) => item.profile_id))
    return workers.filter(
      (worker) =>
        worker.approval_status === 'approved' &&
        worker.is_active &&
        !worker.archived_at &&
        !assignedIds.has(worker.id),
    )
  }, [workers, assignments])

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
          <Badge>{projectStatusLabel(project.status)}</Badge>
          <Badge variant="secondary">{project.priority}</Badge>
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
              <div className="space-y-2 pt-2">
                <Label>Update status</Label>
                <Select
                  value={project.status}
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

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                className="space-y-2"
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (!note.trim() || !profile) return
                  const { error } = await supabase.from('project_notes').insert({
                    project_id: project.id,
                    author_id: profile.id,
                    content: note.trim(),
                  })
                  if (error) toast.error(error.message)
                  else {
                    setNote('')
                    toast.success('Note added')
                    queryClient.invalidateQueries({ queryKey: ['project-notes', project.id] })
                  }
                }}
              >
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a project note..." />
                <Button type="submit" size="sm">
                  Add note
                </Button>
              </form>
              <div className="space-y-3">
                {notes.length === 0 ? (
                  <EmptyState title="No notes yet" />
                ) : (
                  notes.map((item) => (
                    <div key={item.id} className="rounded-md border border-border px-3 py-3 text-sm">
                      <p>{item.content}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.author ? fullName(item.author.first_name, item.author.last_name) : 'Unknown'} ·{' '}
                        {formatRelative(item.created_at)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Files & work photos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <Button
                  size="sm"
                  disabled={!file || !profile?.organization_id}
                  onClick={async () => {
                    if (!file || !profile?.organization_id) return
                    const path = `${profile.id}/${project.id}/${Date.now()}-${file.name}`
                    const { error: uploadError } = await supabase.storage.from('project-files').upload(path, file)
                    if (uploadError) {
                      toast.error(uploadError.message)
                      return
                    }
                    const { error } = await supabase.from('documents').insert({
                      organization_id: profile.organization_id,
                      owner_id: profile.id,
                      project_id: project.id,
                      uploaded_by: profile.id,
                      name: file.name,
                      category: file.type.startsWith('image/') ? 'work_photo' : 'project_file',
                      storage_path: path,
                      mime_type: file.type,
                      file_size: file.size,
                    })
                    if (error) toast.error(error.message)
                    else {
                      setFile(null)
                      toast.success('File uploaded')
                      queryClient.invalidateQueries({ queryKey: ['project-documents', project.id] })
                    }
                  }}
                >
                  Upload file
                </Button>
              </div>
              {documents.length === 0 ? (
                <EmptyState title="No files uploaded" />
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.category} · {formatRelative(doc.created_at)}
                        </p>
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
              <CardTitle>Assigned workers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {canManage ? (
                <div className="space-y-2">
                  <Select value={selectedWorker} onValueChange={setSelectedWorker}>
                    <SelectTrigger>
                      <SelectValue placeholder="Assign worker" />
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
                        await assignWorker.mutateAsync({ projectId: project.id, profileId: selectedWorker })
                        setSelectedWorker('')
                        toast.success('Worker assigned')
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Assignment failed')
                      }
                    }}
                  >
                    Assign
                  </Button>
                </div>
              ) : null}

              {assignments.length === 0 ? (
                <EmptyState title="No workers assigned" />
              ) : (
                assignments.map((assignment) => (
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
                            toast.success('Assignment removed')
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
                        {item.profile ? fullName(item.profile.first_name, item.profile.last_name) : 'Worker'} ·{' '}
                        {formatRelative(item.created_at)}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

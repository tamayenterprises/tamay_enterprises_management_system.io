import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import {
  useAssignWorker,
  useProfiles,
  useProject,
  useProjectAssignments,
  useProjectNotes,
  useRemoveAssignment,
  useUpdateProject,
} from '@/features/data/hooks'
import { formatDate, formatRelative, fullName, isManagementRole, projectStatusLabel } from '@/lib/utils'
import type { ProjectStatus } from '@/types/database'
import { supabase } from '@/lib/supabase'

export function ProjectDetailPage() {
  const { projectId } = useParams()
  const { profile } = useAuth()
  const { data: project, isLoading, isError } = useProject(projectId)
  const { data: assignments = [] } = useProjectAssignments(projectId)
  const { data: notes = [] } = useProjectNotes(projectId)
  const { data: workers = [] } = useProfiles({ role: ['employee', 'subcontractor', 'project_manager'] })
  const updateProject = useUpdateProject(projectId ?? '')
  const assignWorker = useAssignWorker()
  const removeAssignment = useRemoveAssignment()
  const [note, setNote] = useState('')
  const [selectedWorker, setSelectedWorker] = useState('')
  const [file, setFile] = useState<File | null>(null)

  if (isLoading) return <LoadingState />
  if (isError || !project) return <EmptyState title="Project not found" description="It may have been archived or you lack access." />

  const canManage = isManagementRole(profile?.role)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">{project.name}</h1>
          <p className="text-muted-foreground">{project.location || 'Location not set'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{projectStatusLabel(project.status)}</Badge>
          <Badge variant="secondary">{project.priority}</Badge>
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
            <CardContent className="space-y-3">
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
                  }
                }}
              >
                Upload file
              </Button>
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
                      {workers.map((worker) => (
                        <SelectItem key={worker.id} value={worker.id}>
                          {fullName(worker.first_name, worker.last_name)} ({worker.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!selectedWorker}
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
                  <div key={assignment.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">
                        {assignment.profile
                          ? fullName(assignment.profile.first_name, assignment.profile.last_name)
                          : 'Worker'}
                      </p>
                      <p className="text-xs text-muted-foreground">{assignment.profile?.role}</p>
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
        </div>
      </div>
    </div>
  )
}

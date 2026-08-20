import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import { Textarea } from '@/components/ui/textarea'
import {
  useAssignWorker,
  useCreateProject,
  useArchiveProject,
  useHardDeleteProject,
  useProfiles,
  useProjectClientAssignees,
  useRestoreProject,
  useProjects,
} from '@/features/data/hooks'
import { useFormDraft } from '@/features/drafts/use-form-draft'
import { useAuth } from '@/features/auth/auth-hooks'
import {
  formatDate,
  fullName,
  isManagementRole,
  isWarrantyActive,
  projectStatusLabel,
  warrantyStatusLabel,
} from '@/lib/utils'
import { confirmAction } from '@/lib/uploads'
import { projectSchema, type ProjectFormValues } from '@/lib/validations'
import type { ProjectStatus } from '@/types/database'

const STATUS_FILTERS: Array<{ value: ProjectStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'completed', label: 'Completed' },
]

const WARRANTY_FILTERS: Array<{ value: 'all' | 'active' | 'expired'; label: string }> = [
  { value: 'all', label: 'All warranties' },
  { value: 'active', label: 'Warranty active' },
  { value: 'expired', label: 'Warranty expired' },
]

export function ProjectsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all')
  const [archivedView, setArchivedView] = useState<'active' | 'archived'>('active')
  const [warrantyFilter, setWarrantyFilter] = useState<'all' | 'active' | 'expired'>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [assignClientId, setAssignClientId] = useState('')
  const canManage = isManagementRole(profile?.role)
  const { data, isLoading, isError } = useProjects({
    assignedOnly: !canManage,
    search,
    status,
    archived: canManage ? archivedView : 'active',
    warranty: archivedView === 'archived' ? warrantyFilter : 'all',
  })
  const { data: clients = [] } = useProfiles({ role: 'client' })
  const createProject = useCreateProject()
  const assignWorker = useAssignWorker()
  const archiveProject = useArchiveProject()
  const restoreProject = useRestoreProject()
  const hardDeleteProject = useHardDeleteProject()

  const availableClients = useMemo(
    () =>
      clients.filter(
        (client) =>
          client.approval_status === 'approved' && client.is_active && !client.archived_at,
      ),
    [clients],
  )
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: '',
      description: '',
      location: '',
      status: 'not_started',
      priority: 'medium',
      start_date: '',
      deadline: '',
      warranty_ends_on: '',
    },
  })
  const draft = useFormDraft<ProjectFormValues>({
    draftType: 'NEW_PROJECT',
    contextKey: 'new-project',
    enabled: createOpen && canManage,
    isMeaningful: (payload) =>
      Boolean(payload.name?.trim() || payload.location?.trim() || payload.description?.trim()),
  })
  const watched = form.watch()
  const restoredRef = useRef(false)
  const projects = useMemo(() => data ?? [], [data])
  const projectIds = useMemo(() => projects.map((project) => project.id), [projects])
  const { data: clientsByProject } = useProjectClientAssignees(
    archivedView === 'archived' ? projectIds : [],
  )

  useEffect(() => {
    if (!createOpen) return
    draft.scheduleSave(watched)
  }, [watched, createOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!createOpen) {
      restoredRef.current = false
      return
    }
    if (restoredRef.current || !draft.draft?.payload) return
    const payload = draft.draft.payload as Partial<ProjectFormValues>
    if (!payload.name && !payload.location && !payload.description) return
    form.reset({
      name: payload.name || '',
      description: payload.description || '',
      location: payload.location || '',
      status: payload.status || 'not_started',
      priority: payload.priority || 'medium',
      start_date: payload.start_date || '',
      deadline: payload.deadline || '',
      warranty_ends_on: payload.warranty_ends_on || '',
    })
    restoredRef.current = true
    toast.message('Draft restored.')
  }, [createOpen, draft.draft, form])

  if (isLoading) return <LoadingState />
  if (isError) return <EmptyState title="Unable to load projects" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">
            {archivedView === 'archived' ? 'Archived projects' : 'Projects'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {canManage
              ? archivedView === 'archived'
                ? 'Soft-archived jobs kept for warranty lookup (typically 7 years). Use Delete permanently to erase a job forever.'
                : 'Create projects, set deadlines, and track jobsite progress.'
              : 'Projects assigned to you.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder={
              archivedView === 'archived'
                ? 'Search archived by name, location…'
                : 'Search projects...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          {canManage ? (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>New project</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create project</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-3"
                  onSubmit={form.handleSubmit(async (values) => {
                    try {
                      const project = await createProject.mutateAsync(values)
                      if (assignClientId && assignClientId !== 'none') {
                        await assignWorker.mutateAsync({
                          projectId: project.id,
                          profileId: assignClientId,
                        })
                      }
                      if (draft.draft?.id) {
                        await draft.publishDraft({ draftId: draft.draft.id, publishedEntityId: project.id })
                      }
                      toast.success(
                        assignClientId && assignClientId !== 'none'
                          ? 'Project created and client assigned'
                          : 'Project created',
                      )
                      form.reset()
                      setAssignClientId('')
                      setCreateOpen(false)
                      navigate(`/projects/${project.id}`)
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Create failed')
                    }
                  })}
                >
                  {draft.draft ? (
                    <div className="flex items-center justify-between rounded-md border border-border bg-[#fbfcff] px-3 py-2 text-xs">
                      <span>
                        Unfinished draft saved{' '}
                        {draft.lastSavedAt
                          ? `at ${new Date(draft.lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                          : ''}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          if (!confirmAction('Delete this unfinished draft? This action cannot be undone.')) return
                          await draft.discardDraft(draft.draft!.id)
                          form.reset()
                          toast.success('Draft deleted.')
                        }}
                      >
                        Delete draft
                      </Button>
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input {...form.register('name')} />
                    {form.formState.errors.name ? (
                      <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <Label>Location</Label>
                    <Input {...form.register('location')} />
                  </div>
                  <div className="space-y-1">
                    <Label>Description</Label>
                    <Textarea {...form.register('description')} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Status</Label>
                      <Select
                        value={form.watch('status')}
                        onValueChange={(value) => form.setValue('status', value as ProjectFormValues['status'])}
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
                        value={form.watch('priority')}
                        onValueChange={(value) => form.setValue('priority', value as ProjectFormValues['priority'])}
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
                      <Input type="date" {...form.register('start_date')} />
                    </div>
                    <div className="space-y-1">
                      <Label>Deadline</Label>
                      <Input type="date" {...form.register('deadline')} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Warranty ends (optional)</Label>
                    <Input type="date" {...form.register('warranty_ends_on')} />
                    <p className="text-xs text-muted-foreground">
                      Leave blank; set automatically when marked completed (+7 years).
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label>Assign to client (optional)</Label>
                    <Select value={assignClientId} onValueChange={setAssignClientId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a client" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No client yet</SelectItem>
                        {availableClients.length === 0 ? (
                          <SelectItem value="unavailable" disabled>
                            No approved clients
                          </SelectItem>
                        ) : (
                          availableClients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {fullName(client.first_name, client.last_name)}
                              {client.company_name ? ` · ${client.company_name}` : ''}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Shares this project in the client portal. You can also assign workers after
                      creating.
                    </p>
                  </div>
                  <Button type="submit" disabled={createProject.isPending || assignWorker.isPending}>
                    {createProject.isPending || assignWorker.isPending ? 'Creating...' : 'Create'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canManage ? (
          <>
            <Button
              size="sm"
              variant={archivedView === 'active' ? 'default' : 'outline'}
              onClick={() => {
                setArchivedView('active')
                setWarrantyFilter('all')
              }}
            >
              Active
            </Button>
            <Button
              size="sm"
              variant={archivedView === 'archived' ? 'default' : 'outline'}
              onClick={() => setArchivedView('archived')}
            >
              Archived
            </Button>
            <span className="mx-1 hidden h-5 w-px bg-border sm:inline-block" aria-hidden />
          </>
        ) : null}
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            size="sm"
            variant={status === filter.value ? 'default' : 'outline'}
            onClick={() => setStatus(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
        {canManage && archivedView === 'archived' ? (
          <>
            <span className="mx-1 hidden h-5 w-px bg-border sm:inline-block" aria-hidden />
            {WARRANTY_FILTERS.map((filter) => (
              <Button
                key={filter.value}
                size="sm"
                variant={warrantyFilter === filter.value ? 'default' : 'outline'}
                onClick={() => setWarrantyFilter(filter.value)}
              >
                {filter.label}
              </Button>
            ))}
          </>
        ) : null}
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title={archivedView === 'archived' ? 'No archived projects' : 'No projects yet'}
          description={
            archivedView === 'archived'
              ? 'Archived jobs stay available here for warranty records. Try another warranty filter or search.'
              : 'Management can create projects and assign workers.'
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {projects.map((project) => {
            const projectClients = clientsByProject?.get(project.id) ?? []
            const warrantyActive = isWarrantyActive(project.warranty_ends_on)
            return (
            <Card key={project.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-xl">
                    <Link className="hover:underline" to={`/projects/${project.id}`}>
                      {project.name}
                    </Link>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{project.location || 'No location'}</p>
                  {projectClients.length > 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Client:{' '}
                      {projectClients
                        .map((client) =>
                          client.company_name
                            ? `${fullName(client.first_name, client.last_name)} (${client.company_name})`
                            : fullName(client.first_name, client.last_name),
                        )
                        .join(', ')}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {project.archived_at ? <Badge variant="secondary">Archived</Badge> : null}
                  {project.archived_at || project.warranty_ends_on ? (
                    <Badge variant={warrantyActive ? 'default' : 'outline'}>
                      {warrantyActive ? 'Warranty active' : 'Warranty expired'}
                    </Badge>
                  ) : null}
                  <Badge>{projectStatusLabel(project.status)}</Badge>
                  <Badge variant="secondary">{project.priority}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="line-clamp-2 text-muted-foreground">{project.description || 'No description'}</p>
                <p>Start: {formatDate(project.start_date)}</p>
                <p>Deadline: {formatDate(project.deadline)}</p>
                <p>Warranty ends: {formatDate(project.warranty_ends_on)}</p>
                {project.warranty_ends_on || project.archived_at ? (
                  <p className="text-xs text-muted-foreground">
                    {warrantyStatusLabel(project.warranty_ends_on)}
                  </p>
                ) : null}
                <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap">
                  <Button asChild size="sm" className="min-h-11 w-full sm:w-auto">
                    <Link to={`/projects/${project.id}`}>Open</Link>
                  </Button>
                  {canManage && !project.archived_at ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11 w-full sm:w-auto"
                      onClick={async () => {
                        if (
                          !confirmAction(
                            `Archive project "${project.name}"? It stays under Archived for warranty lookup. You can restore it later.`,
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
                      className="min-h-11 w-full sm:w-auto"
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
                    <Button
                      size="sm"
                      variant="destructive"
                      className="min-h-11 w-full sm:w-auto"
                      disabled={hardDeleteProject.isPending}
                      onClick={async () => {
                        if (
                          !confirmAction(
                            `PERMANENTLY delete "${project.name}"? This cannot be undone. Assignments, messages, and project files for this job will be deleted.`,
                          )
                        ) {
                          return
                        }
                        if (
                          !confirmAction(
                            `Really delete "${project.name}" forever?`,
                          )
                        ) {
                          return
                        }
                        try {
                          await hardDeleteProject.mutateAsync(project.id)
                          toast.success('Project permanently deleted')
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Delete failed')
                        }
                      }}
                    >
                      Delete forever
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

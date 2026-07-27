import { useState } from 'react'
import { Link } from 'react-router-dom'
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
import { useCreateProject, useProjects } from '@/features/data/hooks'
import { useAuth } from '@/features/auth/auth-context'
import { formatDate, isManagementRole, projectStatusLabel } from '@/lib/utils'
import { projectSchema, type ProjectFormValues } from '@/lib/validations'
import { supabase } from '@/lib/supabase'

export function ProjectsPage() {
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const { data, isLoading, isError } = useProjects({
    assignedOnly: !isManagementRole(profile?.role),
    search,
  })
  const createProject = useCreateProject()
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
    },
  })

  if (isLoading) return <LoadingState />
  if (isError) return <EmptyState title="Unable to load projects" />

  const projects = data ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">Track status, deadlines, and jobsite details.</p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          {isManagementRole(profile?.role) ? (
            <Dialog>
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
                      await createProject.mutateAsync(values)
                      toast.success('Project created')
                      form.reset()
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
                  <Button type="submit">Create</Button>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState title="No projects yet" description="Management can create projects and assign workers." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {projects.map((project) => (
            <Card key={project.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-xl">
                    <Link className="hover:underline" to={`/projects/${project.id}`}>
                      {project.name}
                    </Link>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{project.location || 'No location'}</p>
                </div>
                <Badge>{projectStatusLabel(project.status)}</Badge>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="line-clamp-2 text-muted-foreground">{project.description || 'No description'}</p>
                <p>Deadline: {formatDate(project.deadline)}</p>
                <p>Priority: {project.priority}</p>
                <div className="flex gap-2 pt-2">
                  <Button asChild size="sm">
                    <Link to={`/projects/${project.id}`}>Open</Link>
                  </Button>
                  {isManagementRole(profile?.role) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const { error } = await supabase
                          .from('projects')
                          .update({ archived_at: new Date().toISOString() })
                          .eq('id', project.id)
                        if (error) toast.error(error.message)
                        else toast.success('Project archived')
                      }}
                    >
                      Archive
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

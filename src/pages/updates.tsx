import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilePickerButton, SelectedFilesList } from '@/components/ui/file-picker-button'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import { useProfiles, useProjects } from '@/features/data/hooks'
import {
  createUpdatePhotoSignedUrl,
  useCompanyUpdates,
  useCreateCompanyUpdate,
  useMyProjectUpdatesFeed,
  type CompanyUpdateWithMeta,
} from '@/features/updates/hooks'
import {
  filterMentionSuggestions,
  filterProjectSuggestions,
  insertAtTrigger,
  mentionToken,
  projectHashToken,
} from '@/features/updates/mention-utils'
import { formatRelative, fullName, isManagementRole } from '@/lib/utils'
import { IMAGE_UPLOAD_ACCEPT } from '@/lib/uploads'
import type { CompanyUpdateAudience, Profile, Project } from '@/types/database'

function UpdatePhoto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    createUpdatePhotoSignedUrl(path)
      .then((signed) => {
        if (!cancelled) setUrl(signed)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [path])
  if (!url) return <p className="text-xs text-muted-foreground">Loading photo…</p>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-md border border-border">
      <img src={url} alt="Update" className="max-h-64 w-full object-cover" />
    </a>
  )
}

function CompanyComposer({
  mentionCandidates,
  projects,
  parentId,
  onDone,
}: {
  mentionCandidates: Profile[]
  projects: Project[]
  parentId?: string | null
  onDone?: () => void
}) {
  const { profile } = useAuth()
  const canPublish = isManagementRole(profile?.role)
  const create = useCreateCompanyUpdate()
  const [content, setContent] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [audienceType, setAudienceType] = useState<CompanyUpdateAudience>('all_internal')
  const [audienceUserIds, setAudienceUserIds] = useState<string[]>([])
  const [repliesEnabled, setRepliesEnabled] = useState(true)
  const [requiresAttention, setRequiresAttention] = useState(false)
  const [notifyProjectTeam, setNotifyProjectTeam] = useState(false)
  const [mentionedIds, setMentionedIds] = useState<string[]>([])
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [pickUser, setPickUser] = useState('')
  const [pickProject, setPickProject] = useState('')
  const [pickAudience, setPickAudience] = useState('')

  const mentionSuggestions = useMemo(
    () => filterMentionSuggestions(content, mentionCandidates),
    [content, mentionCandidates],
  )
  const projectSuggestions = useMemo(
    () => filterProjectSuggestions(content, projects),
    [content, projects],
  )

  if (!parentId && !canPublish) return null

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault()
        if (audienceType === 'selected_users' && audienceUserIds.length === 0 && !parentId) {
          toast.error('Select at least one audience member')
          return
        }
        for (const id of mentionedIds) {
          if (
            audienceType === 'selected_users' &&
            !audienceUserIds.includes(id) &&
            !parentId
          ) {
            toast.error('Add mentioned users to the selected audience before posting')
            return
          }
        }
        try {
          if (photos.length === 0) {
            await create.mutateAsync({
              content,
              parentId,
              audienceType,
              audienceUserIds,
              repliesEnabled,
              requiresAttention,
              notifyProjectTeam: notifyProjectTeam && projectIds.length > 0,
              mentionedUserIds: mentionedIds,
              projectIds,
            })
          } else if (parentId) {
            for (let index = 0; index < photos.length; index += 1) {
              await create.mutateAsync({
                content: index === 0 ? content : '',
                parentId,
                photo: photos[index],
                audienceType,
                audienceUserIds: [],
                repliesEnabled,
                requiresAttention: false,
                notifyProjectTeam: false,
                mentionedUserIds: index === 0 ? mentionedIds : [],
                projectIds: [],
              })
            }
          } else {
            const root = await create.mutateAsync({
              content,
              photo: photos[0],
              audienceType,
              audienceUserIds,
              repliesEnabled,
              requiresAttention,
              notifyProjectTeam: notifyProjectTeam && projectIds.length > 0,
              mentionedUserIds: mentionedIds,
              projectIds,
            })
            for (let index = 1; index < photos.length; index += 1) {
              await create.mutateAsync({
                content: '',
                parentId: root.id,
                photo: photos[index],
                audienceType,
                audienceUserIds: [],
                repliesEnabled,
                requiresAttention: false,
                notifyProjectTeam: false,
                mentionedUserIds: [],
                projectIds: [],
              })
            }
          }
          setContent('')
          setPhotos([])
          setRequiresAttention(false)
          setNotifyProjectTeam(false)
          setMentionedIds([])
          setProjectIds([])
          setAudienceUserIds([])
          toast.success(parentId ? 'Reply posted' : 'Company update posted')
          onDone?.()
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not post update')
        }
      }}
    >
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={parentId ? 2 : 4}
        placeholder={
          parentId
            ? 'Write a reply. Use @ to mention someone or # to reference a project.'
            : 'Share a company update. Use @ to mention someone or # to reference a project.'
        }
      />

      {mentionSuggestions.length > 0 ? (
        <div className="rounded-md border border-border bg-white p-1 shadow-sm">
          {mentionSuggestions.map((person) => (
            <button
              key={person.id}
              type="button"
              className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[#fbfcff]"
              onClick={() => {
                setContent((prev) => insertAtTrigger(prev, '@', mentionToken(person)))
                setMentionedIds((prev) => (prev.includes(person.id) ? prev : [...prev, person.id]))
              }}
            >
              {fullName(person.first_name, person.last_name)}
            </button>
          ))}
        </div>
      ) : null}

      {projectSuggestions.length > 0 ? (
        <div className="rounded-md border border-border bg-white p-1 shadow-sm">
          {projectSuggestions.map((project) => (
            <button
              key={project.id}
              type="button"
              className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[#fbfcff]"
              onClick={() => {
                setContent((prev) => insertAtTrigger(prev, '#', projectHashToken(project)))
                setProjectIds((prev) => (prev.includes(project.id) ? prev : [...prev, project.id]))
              }}
            >
              {project.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Select
          value={pickUser}
          onValueChange={(value) => {
            const person = mentionCandidates.find((p) => p.id === value)
            if (!person) return
            setContent((prev) => `${prev}${prev.endsWith(' ') || !prev ? '' : ' '}${mentionToken(person)} `)
            setMentionedIds((prev) => (prev.includes(person.id) ? prev : [...prev, person.id]))
            setPickUser('')
          }}
        >
          <SelectTrigger className="w-[10rem]">
            <SelectValue placeholder="Mention @" />
          </SelectTrigger>
          <SelectContent>
            {mentionCandidates.map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {fullName(person.first_name, person.last_name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={pickProject}
          onValueChange={(value) => {
            const project = projects.find((p) => p.id === value)
            if (!project) return
            setContent((prev) => `${prev}${prev.endsWith(' ') || !prev ? '' : ' '}${projectHashToken(project)} `)
            setProjectIds((prev) => (prev.includes(project.id) ? prev : [...prev, project.id]))
            setPickProject('')
          }}
        >
          <SelectTrigger className="w-[11rem]">
            <SelectValue placeholder="Reference #" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!parentId ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Audience</Label>
            <Select
              value={audienceType}
              onValueChange={(value) => setAudienceType(value as CompanyUpdateAudience)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_internal">All Internal Users</SelectItem>
                <SelectItem value="employees">All Employees</SelectItem>
                <SelectItem value="management">Management and Administrators</SelectItem>
                <SelectItem value="project_managers">Field Project Managers</SelectItem>
                <SelectItem value="selected_users">Selected Users</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {audienceType === 'selected_users' ? (
            <div className="space-y-1">
              <Label>Add selected users</Label>
              <Select
                value={pickAudience}
                onValueChange={(value) => {
                  setAudienceUserIds((prev) => (prev.includes(value) ? prev : [...prev, value]))
                  setPickAudience('')
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select users" />
                </SelectTrigger>
                <SelectContent>
                  {mentionCandidates.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {fullName(person.first_name, person.last_name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={repliesEnabled}
              onChange={(e) => setRepliesEnabled(e.target.checked)}
            />
            Replies Enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={requiresAttention}
              onChange={(e) => setRequiresAttention(e.target.checked)}
            />
            Requires Attention
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={notifyProjectTeam}
              disabled={projectIds.length === 0}
              onChange={(e) => setNotifyProjectTeam(e.target.checked)}
            />
            Notify Project Team (only when a project is referenced)
          </label>
        </div>
      ) : null}

      {(mentionedIds.length > 0 || projectIds.length > 0 || audienceUserIds.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {mentionedIds.map((id) => {
            const person = mentionCandidates.find((p) => p.id === id)
            return person ? <Badge key={id} variant="secondary">{mentionToken(person)}</Badge> : null
          })}
          {projectIds.map((id) => {
            const project = projects.find((p) => p.id === id)
            return project ? (
              <Badge key={id} variant="outline">
                {projectHashToken(project)}
              </Badge>
            ) : null
          })}
          {audienceUserIds.map((id) => {
            const person = mentionCandidates.find((p) => p.id === id)
            return person ? (
              <Badge key={`aud-${id}`} variant="outline">
                Audience: {fullName(person.first_name, person.last_name)}
              </Badge>
            ) : null
          })}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <FilePickerButton
            accept={IMAGE_UPLOAD_ACCEPT}
            label="Add photos"
            variant="outline"
            disabled={create.isPending}
            multiple
            selectedFiles={photos}
            onFiles={setPhotos}
          />
          <Button
            type="submit"
            size="sm"
            disabled={create.isPending || (!content.trim() && photos.length === 0)}
          >
            {create.isPending ? 'Posting…' : parentId ? 'Post reply' : 'Add Update'}
          </Button>
        </div>
        <SelectedFilesList files={photos} onChange={setPhotos} />
      </div>
    </form>
  )
}

function CompanyUpdateCard({
  update,
  replies,
  mentionCandidates,
  projects,
  highlighted,
}: {
  update: CompanyUpdateWithMeta
  replies: CompanyUpdateWithMeta[]
  mentionCandidates: Profile[]
  projects: Project[]
  highlighted?: boolean
}) {
  const [replyOpen, setReplyOpen] = useState(false)
  const authorName = update.author
    ? fullName(update.author.first_name, update.author.last_name)
    : 'Unknown'

  return (
    <div
      id={`company-update-${update.id}`}
      className={`space-y-3 rounded-md border px-3 py-3 text-sm ${
        highlighted ? 'border-accent bg-accent/5 ring-2 ring-accent/30' : 'border-border'
      }`}
    >
      <div className="flex flex-wrap gap-1">
        <Badge variant="secondary">Company Update</Badge>
        {update.requires_attention ? <Badge variant="destructive">Requires attention</Badge> : null}
        {!update.replies_enabled ? <Badge variant="outline">Replies Disabled</Badge> : null}
      </div>
      {update.content ? <p className="whitespace-pre-wrap">{update.content}</p> : null}
      {update.photo_path ? <UpdatePhoto path={update.photo_path} /> : null}
      {update.refs && update.refs.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {update.refs.map((ref) =>
            ref.project ? (
              <Button key={ref.project_id} asChild size="sm" variant="outline">
                <Link to={`/projects/${ref.project_id}`}>{ref.project.name}</Link>
              </Button>
            ) : null,
          )}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {authorName} · {formatRelative(update.created_at)}
      </p>

      <div className="space-y-2 border-l-2 border-border pl-3">
        {replies.map((reply) => (
          <div
            key={reply.id}
            id={`company-update-${reply.id}`}
            className="space-y-2 rounded-md bg-muted/40 px-3 py-2"
          >
            {reply.content ? <p className="whitespace-pre-wrap">{reply.content}</p> : null}
            {reply.photo_path ? <UpdatePhoto path={reply.photo_path} /> : null}
            <p className="text-xs text-muted-foreground">
              {reply.author
                ? fullName(reply.author.first_name, reply.author.last_name)
                : 'Unknown'}{' '}
              · {formatRelative(reply.created_at)}
            </p>
          </div>
        ))}
      </div>

      {update.replies_enabled ? (
        replyOpen ? (
          <CompanyComposer
            parentId={update.id}
            mentionCandidates={mentionCandidates}
            projects={projects}
            onDone={() => setReplyOpen(false)}
          />
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setReplyOpen(true)}>
            Reply
          </Button>
        )
      ) : null}
    </div>
  )
}

export function UpdatesPage() {
  const { profile } = useAuth()
  const canManage = isManagementRole(profile?.role)
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'projects' || params.get('tab') === 'all-projects'
    ? params.get('tab')!
    : 'company'
  const focusId = params.get('update') || params.get('reply')

  const { data: companyRows = [], isLoading: companyLoading, isError: companyError } =
    useCompanyUpdates(50)
  const { data: projectRows = [], isLoading: projectLoading } = useMyProjectUpdatesFeed(50)
  const { data: people = [] } = useProfiles({
    role: ['employee', 'subcontractor', 'project_manager', 'admin'],
  })
  const { data: projects = [] } = useProjects({ assignedOnly: !canManage })

  const mentionCandidates = useMemo(
    () =>
      people.filter(
        (person) => person.approval_status === 'approved' && person.is_active && !person.archived_at,
      ),
    [people],
  )

  const { roots, repliesByParent } = useMemo(() => {
    const rootsList = companyRows.filter((row) => !row.parent_id)
    const map = new Map<string, CompanyUpdateWithMeta[]>()
    for (const row of companyRows) {
      if (!row.parent_id) continue
      const list = map.get(row.parent_id) ?? []
      list.push(row)
      map.set(row.parent_id, list)
    }
    return { roots: rootsList, repliesByParent: map }
  }, [companyRows])

  useEffect(() => {
    if (!focusId) return
    const timer = window.setTimeout(() => {
      document
        .getElementById(`company-update-${focusId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [focusId, companyRows])

  function setTab(next: string) {
    const nextParams = new URLSearchParams(params)
    nextParams.set('tab', next)
    setParams(nextParams)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Updates</h1>
        <p className="text-muted-foreground">
          Company Updates are company-wide. Project Updates stay inside each project’s authorized team.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={tab === 'company' ? 'default' : 'outline'}
          onClick={() => setTab('company')}
        >
          Company Updates
        </Button>
        <Button
          size="sm"
          variant={tab === 'projects' ? 'default' : 'outline'}
          onClick={() => setTab('projects')}
        >
          My Project Updates
        </Button>
        {canManage ? (
          <Button
            size="sm"
            variant={tab === 'all-projects' ? 'default' : 'outline'}
            onClick={() => setTab('all-projects')}
          >
            All Project Updates
          </Button>
        ) : null}
      </div>

      {tab === 'company' ? (
        <Card>
          <CardHeader>
            <CardTitle>Company Updates</CardTitle>
            <CardDescription>
              Announcements, meetings, and project discussions for a broader audience. Participation
              follows the selected audience — not only project assignment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CompanyComposer mentionCandidates={mentionCandidates} projects={projects} />
            {companyLoading ? <LoadingState label="Loading company updates..." /> : null}
            {companyError ? (
              <EmptyState title="We could not load company updates. Please try again." />
            ) : null}
            {!companyLoading && !companyError && roots.length === 0 ? (
              <EmptyState title="No company updates yet" description="Management can post the first update." />
            ) : null}
            {roots.map((update) => (
              <CompanyUpdateCard
                key={update.id}
                update={update}
                replies={repliesByParent.get(update.id) ?? []}
                mentionCandidates={mentionCandidates}
                projects={projects}
                highlighted={
                  focusId === update.id ||
                  (repliesByParent.get(update.id) ?? []).some((reply) => reply.id === focusId)
                }
              />
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {tab === 'all-projects' ? 'All Project Updates' : 'My Project Updates'}
            </CardTitle>
            <CardDescription>
              Project-specific conversations. Open a project to reply inside its Project Updates
              section.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {projectLoading ? <LoadingState label="Loading project updates..." /> : null}
            {!projectLoading && projectRows.length === 0 ? (
              <EmptyState title="No project updates yet" />
            ) : null}
            {projectRows.map((note) => {
              const project = (note as { project?: Project }).project
              const author = (note as { author?: Profile }).author
              return (
                <div key={note.id} className="rounded-md border border-border px-3 py-3 text-sm">
                  <div className="mb-1 flex flex-wrap gap-1">
                    <Badge variant="secondary">Project Update</Badge>
                    {project?.name ? <Badge variant="outline">{project.name}</Badge> : null}
                  </div>
                  {note.content ? <p className="whitespace-pre-wrap">{note.content}</p> : null}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {author ? fullName(author.first_name, author.last_name) : 'Unknown'} ·{' '}
                    {formatRelative(note.created_at)}
                  </p>
                  {project ? (
                    <Button asChild size="sm" variant="outline" className="mt-2">
                      <Link to={`/projects/${project.id}?update=${note.id}`}>Open in project</Link>
                    </Button>
                  ) : null}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

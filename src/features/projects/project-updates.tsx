import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilePickerButton, SelectedFilesList } from '@/components/ui/file-picker-button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  createUpdatePhotoSignedUrl,
  useCreateProjectUpdate,
  useProfiles,
  useProjectAssignments,
  useProjectNotes,
  useProjects,
} from '@/features/data/hooks'
import { useFormDraft } from '@/features/drafts/use-form-draft'
import {
  filterMentionSuggestions,
  filterProjectSuggestions,
  insertAtTrigger,
  mentionToken,
  projectHashToken,
} from '@/features/updates/mention-utils'
import { formatRelative, fullName, isManagementRole } from '@/lib/utils'
import { confirmAction, IMAGE_UPLOAD_ACCEPT } from '@/lib/uploads'
import { useAuth } from '@/features/auth/auth-context'
import type { Profile, Project, ProjectNote } from '@/types/database'

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

  if (!url) {
    return <p className="text-xs text-muted-foreground">Loading photo…</p>
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-md border border-border">
      <img src={url} alt="Project update" className="max-h-72 w-full object-cover" />
    </a>
  )
}

function UpdateComposer({
  projectId,
  parentId,
  placeholder,
  submitLabel,
  mentionCandidates,
  projects,
  defaultVisibleToClient = false,
  onDone,
}: {
  projectId: string
  parentId?: string | null
  placeholder: string
  submitLabel: string
  mentionCandidates: Profile[]
  projects: Project[]
  defaultVisibleToClient?: boolean
  onDone?: () => void
}) {
  const { profile } = useAuth()
  const canManage = isManagementRole(profile?.role)
  const createUpdate = useCreateProjectUpdate()
  const [content, setContent] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [requiresAttention, setRequiresAttention] = useState(false)
  const [visibleToClient, setVisibleToClient] = useState(defaultVisibleToClient)
  const [mentionedIds, setMentionedIds] = useState<string[]>([])
  const [projectIds, setProjectIds] = useState<string[]>([projectId])
  const [mentionPicker, setMentionPicker] = useState('')
  const [projectPicker, setProjectPicker] = useState('')
  const [draftBanner, setDraftBanner] = useState<string | null>(null)
  const draftRestoredRef = useRef(false)

  const draft = useFormDraft<{
    content: string
    requiresAttention: boolean
    mentionedIds: string[]
    projectIds: string[]
  }>({
    draftType: parentId ? 'REPLY' : 'PROJECT_UPDATE',
    contextKey: parentId ? `reply:${parentId}` : `project:${projectId}`,
    projectId,
    entityType: parentId ? 'project_note_parent' : 'project',
    entityId: parentId || projectId,
    isMeaningful: (payload) => payload.content.trim().length >= 8,
  })

  useEffect(() => {
    if (draftRestoredRef.current || !draft.draft?.payload) return
    const payload = draft.draft.payload
    if (typeof payload.content === 'string' && payload.content.trim()) {
      setContent(payload.content)
      setRequiresAttention(Boolean(payload.requiresAttention))
      if (Array.isArray(payload.mentionedIds)) setMentionedIds(payload.mentionedIds as string[])
      if (Array.isArray(payload.projectIds)) setProjectIds(payload.projectIds as string[])
      setDraftBanner(`Your unfinished draft was restored from ${new Date(draft.draft.last_saved_at).toLocaleString()}.`)
      draftRestoredRef.current = true
    }
  }, [draft.draft])

  const mentionSuggestions = useMemo(
    () => filterMentionSuggestions(content, mentionCandidates),
    [content, mentionCandidates],
  )
  const projectSuggestions = useMemo(
    () => filterProjectSuggestions(content, projects),
    [content, projects],
  )

  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault()
        try {
          // Replies under a client-visible root always stay client-visible so the
          // customer sees the full conversation chain, not only the first message.
          const shareWithClient =
            Boolean(defaultVisibleToClient) || (canManage && visibleToClient)

          if (photos.length === 0) {
            await createUpdate.mutateAsync({
              projectId,
              content,
              parentId,
              mentionedUserIds: mentionedIds,
              requiresAttention,
              referencedProjectIds: projectIds,
              visibleToClient: shareWithClient ? true : undefined,
            })
          } else if (parentId) {
            // Replies are one level deep — keep every photo under the same parent.
            for (let index = 0; index < photos.length; index += 1) {
              await createUpdate.mutateAsync({
                projectId,
                content: index === 0 ? content : '',
                parentId,
                photo: photos[index],
                mentionedUserIds: index === 0 ? mentionedIds : undefined,
                requiresAttention: index === 0 ? requiresAttention : false,
                referencedProjectIds: index === 0 ? projectIds : undefined,
                visibleToClient: shareWithClient ? true : undefined,
              })
            }
          } else {
            // Keep the written update with the photo group (extras nest as replies).
            const root = await createUpdate.mutateAsync({
              projectId,
              content,
              photo: photos[0],
              mentionedUserIds: mentionedIds,
              requiresAttention,
              referencedProjectIds: projectIds,
              visibleToClient: shareWithClient ? true : undefined,
            })
            for (let index = 1; index < photos.length; index += 1) {
              await createUpdate.mutateAsync({
                projectId,
                parentId: root.id,
                content: '',
                photo: photos[index],
                visibleToClient: shareWithClient ? true : undefined,
              })
            }
          }
          if (draft.draft?.id) await draft.publishDraft({ draftId: draft.draft.id })
          setContent('')
          setPhotos([])
          setRequiresAttention(false)
          setVisibleToClient(defaultVisibleToClient)
          setMentionedIds([])
          setProjectIds([projectId])
          setDraftBanner(null)
          toast.success(parentId ? 'Reply posted' : 'Update posted')
          onDone?.()
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not post update')
        }
      }}
    >
      {draftBanner ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-[#fbfcff] px-3 py-2 text-xs">
          <span>{draftBanner}</span>
          {draft.draft?.id ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                if (!confirmAction('Delete this unfinished draft? This action cannot be undone.')) return
                await draft.discardDraft(draft.draft!.id)
                setContent('')
                setDraftBanner(null)
                toast.success('Draft deleted.')
              }}
            >
              Delete draft
            </Button>
          ) : null}
        </div>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        {draft.saveState === 'saving'
          ? 'Saving…'
          : draft.saveState === 'saved' && draft.lastSavedAt
            ? `Draft saved at ${new Date(draft.lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
            : draft.saveState === 'offline'
              ? 'Offline — changes will sync when connection returns'
              : draft.saveState === 'error'
                ? 'We could not save your latest changes. Your local copy is still available.'
                : null}
      </p>
      <Textarea
        value={content}
        onChange={(e) => {
          const next = e.target.value
          setContent(next)
          draft.scheduleSave({
            content: next,
            requiresAttention,
            mentionedIds,
            projectIds,
          })
        }}
        placeholder={`${placeholder} Use @ to mention someone or # to reference a project.`}
        rows={parentId ? 2 : 3}
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

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={mentionPicker}
          onValueChange={(value) => {
            const person = mentionCandidates.find((p) => p.id === value)
            if (!person) return
            setContent((prev) => `${prev}${prev.endsWith(' ') || !prev ? '' : ' '}${mentionToken(person)} `)
            setMentionedIds((prev) => (prev.includes(person.id) ? prev : [...prev, person.id]))
            setMentionPicker('')
          }}
        >
          <SelectTrigger className="w-[11rem]">
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
          value={projectPicker}
          onValueChange={(value) => {
            const project = projects.find((p) => p.id === value)
            if (!project) return
            setContent((prev) => `${prev}${prev.endsWith(' ') || !prev ? '' : ' '}${projectHashToken(project)} `)
            setProjectIds((prev) => (prev.includes(project.id) ? prev : [...prev, project.id]))
            setProjectPicker('')
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
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={requiresAttention}
            onChange={(e) => setRequiresAttention(e.target.checked)}
          />
          Requires attention
        </label>
        {canManage && !defaultVisibleToClient ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={visibleToClient}
              onChange={(e) => setVisibleToClient(e.target.checked)}
            />
            Visible to client
          </label>
        ) : null}
        {defaultVisibleToClient ? (
          <span className="text-xs text-muted-foreground">Visible to client (whole thread)</span>
        ) : null}
      </div>

      {mentionedIds.length > 0 || projectIds.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          {mentionedIds.map((id) => {
            const person = mentionCandidates.find((p) => p.id === id)
            if (!person) return null
            return (
              <Badge key={id} variant="secondary">
                {mentionToken(person)}
              </Badge>
            )
          })}
          {projectIds
            .filter((id) => id !== projectId)
            .map((id) => {
              const project = projects.find((p) => p.id === id)
              if (!project) return null
              return (
                <Badge key={id} variant="outline">
                  {projectHashToken(project)}
                </Badge>
              )
            })}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <FilePickerButton
            accept={IMAGE_UPLOAD_ACCEPT}
            label="Add photos"
            variant="outline"
            multiple
            selectedFiles={photos}
            disabled={createUpdate.isPending}
            onFiles={setPhotos}
          />
          <Button
            type="submit"
            size="sm"
            disabled={createUpdate.isPending || (!content.trim() && photos.length === 0)}
          >
            {createUpdate.isPending ? 'Posting…' : submitLabel}
          </Button>
        </div>
        <SelectedFilesList files={photos} onChange={setPhotos} />
      </div>
    </form>
  )
}

function UpdateCard({
  update,
  replies,
  projectId,
  mentionCandidates,
  projects,
  highlighted,
}: {
  update: ProjectNote
  replies: ProjectNote[]
  projectId: string
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
      id={`update-${update.id}`}
      className={`space-y-3 rounded-md border px-3 py-3 text-sm ${
        highlighted ? 'border-accent bg-accent/5 ring-2 ring-accent/30' : 'border-border'
      }`}
    >
      <div className="space-y-2">
        {update.requires_attention ? <Badge variant="destructive">Requires attention</Badge> : null}
        {update.visible_to_client ? <Badge variant="secondary">Visible to client</Badge> : null}
        {update.content ? <p className="whitespace-pre-wrap">{update.content}</p> : null}
        {update.photo_path ? <UpdatePhoto path={update.photo_path} /> : null}
        <p className="text-xs text-muted-foreground">
          {authorName} · {formatRelative(update.created_at)}
        </p>
      </div>

      <div className="space-y-2 border-l-2 border-border pl-3">
        {replies.map((reply) => {
          const replyAuthor = reply.author
            ? fullName(reply.author.first_name, reply.author.last_name)
            : 'Unknown'
          return (
            <div
              key={reply.id}
              id={`update-${reply.id}`}
              className={`space-y-2 rounded-md px-3 py-2 ${
                highlighted ? 'bg-accent/10' : 'bg-muted/40'
              }`}
            >
              <p className="text-xs text-muted-foreground">Replying to {authorName}</p>
              {reply.visible_to_client ? (
                <Badge variant="secondary">Visible to client</Badge>
              ) : null}
              {reply.content ? <p className="whitespace-pre-wrap">{reply.content}</p> : null}
              {reply.photo_path ? <UpdatePhoto path={reply.photo_path} /> : null}
              <p className="text-xs text-muted-foreground">
                {replyAuthor} · {formatRelative(reply.created_at)}
              </p>
            </div>
          )
        })}
      </div>

      {replyOpen ? (
        <UpdateComposer
          projectId={projectId}
          parentId={update.id}
          mentionCandidates={mentionCandidates}
          projects={projects}
          defaultVisibleToClient={Boolean(update.visible_to_client)}
          placeholder={`Reply to ${authorName}…`}
          submitLabel="Post reply"
          onDone={() => setReplyOpen(false)}
        />
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setReplyOpen(true)}>
          Reply
        </Button>
      )}    </div>
  )
}

export function ProjectUpdates({ projectId }: { projectId: string }) {
  const { profile } = useAuth()
  const canManage = isManagementRole(profile?.role)
  const { data: notes = [], isLoading } = useProjectNotes(projectId)
  const { data: assignments = [] } = useProjectAssignments(projectId)
  const { data: people = [] } = useProfiles({
    role: ['employee', 'subcontractor', 'project_manager', 'admin'],
  })
  const { data: projects = [] } = useProjects({ assignedOnly: !canManage })
  const [params] = useSearchParams()
  const focusId = params.get('update')

  const mentionCandidates = useMemo(() => {
    const assignedIds = new Set(assignments.map((item) => item.profile_id))
    return people.filter((person) => {
      if (person.approval_status !== 'approved' || !person.is_active || person.archived_at) return false
      if (person.role === 'admin' || person.role === 'project_manager') return true
      return assignedIds.has(person.id)
    })
  }, [people, assignments])

  const { roots, repliesByParent } = useMemo(() => {
    const rootsList = notes.filter((note) => !note.parent_id)
    const map = new Map<string, ProjectNote[]>()
    for (const note of notes) {
      if (!note.parent_id) continue
      const list = map.get(note.parent_id) ?? []
      list.push(note)
      map.set(note.parent_id, list)
    }
    return { roots: rootsList, repliesByParent: map }
  }, [notes])

  useEffect(() => {
    if (!focusId) return
    const timer = window.setTimeout(() => {
      document.getElementById(`update-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [focusId, notes])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Project Updates</CardTitle>
            <p className="text-sm text-muted-foreground">
              Project-only conversation for assigned workers and management. Company-wide project
              discussions belong in{' '}
              <Link className="underline" to="/updates?tab=company">
                Company Updates
              </Link>
              .
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/updates">All Updates</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label className="sr-only">New update</Label>
          <UpdateComposer
            projectId={projectId}
            mentionCandidates={mentionCandidates}
            projects={projects}
            placeholder="What did you do today? What’s next on this project?"
            submitLabel="Post update"
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading updates…</p>
        ) : roots.length === 0 ? (
          <EmptyState
            title="No updates yet"
            description="Post the first update so the next person on site knows where things stand."
          />
        ) : (
          <div className="space-y-3">
            {[...roots].reverse().map((update) => (
              <UpdateCard
                key={update.id}
                update={update}
                replies={repliesByParent.get(update.id) ?? []}
                projectId={projectId}
                mentionCandidates={mentionCandidates}
                projects={projects}
                highlighted={
                  focusId === update.id ||
                  (repliesByParent.get(update.id) ?? []).some((reply) => reply.id === focusId)
                }
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

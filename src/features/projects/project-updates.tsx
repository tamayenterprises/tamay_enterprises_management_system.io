import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilePickerButton } from '@/components/ui/file-picker-button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  createUpdatePhotoSignedUrl,
  useCreateProjectUpdate,
  useProfiles,
  useProjectNotes,
} from '@/features/data/hooks'
import { formatRelative, fullName } from '@/lib/utils'
import { IMAGE_UPLOAD_ACCEPT } from '@/lib/uploads'
import type { Profile, ProjectNote } from '@/types/database'

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

function mentionToken(profile: Profile) {
  return `@${profile.first_name}${profile.last_name}`.replace(/\s+/g, '')
}

function UpdateComposer({
  projectId,
  parentId,
  placeholder,
  submitLabel,
  mentionCandidates,
  onDone,
}: {
  projectId: string
  parentId?: string | null
  placeholder: string
  submitLabel: string
  mentionCandidates: Profile[]
  onDone?: () => void
}) {
  const createUpdate = useCreateProjectUpdate()
  const [content, setContent] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [requiresAttention, setRequiresAttention] = useState(false)
  const [mentionedIds, setMentionedIds] = useState<string[]>([])
  const [mentionPicker, setMentionPicker] = useState('')

  const mentionSuggestions = useMemo(() => {
    const at = content.lastIndexOf('@')
    if (at < 0) return []
    const fragment = content.slice(at + 1)
    if (fragment.includes(' ') || fragment.length > 24) return []
    const q = fragment.toLowerCase()
    return mentionCandidates
      .filter((person) => {
        const label = `${person.first_name} ${person.last_name}`.toLowerCase()
        return label.includes(q) || mentionToken(person).toLowerCase().includes(q)
      })
      .slice(0, 6)
  }, [content, mentionCandidates])

  function insertMention(person: Profile) {
    const at = content.lastIndexOf('@')
    const token = mentionToken(person)
    const next = `${content.slice(0, at)}${token} `
    setContent(next)
    setMentionedIds((prev) => (prev.includes(person.id) ? prev : [...prev, person.id]))
  }

  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault()
        try {
          await createUpdate.mutateAsync({
            projectId,
            content,
            parentId,
            photo,
            mentionedUserIds: mentionedIds,
            requiresAttention,
          })
          setContent('')
          setPhoto(null)
          setRequiresAttention(false)
          setMentionedIds([])
          toast.success(parentId ? 'Reply posted' : 'Update posted')
          onDone?.()
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not post update')
        }
      }}
    >
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={`${placeholder} Use @ to mention someone.`}
        rows={parentId ? 2 : 3}
      />
      {mentionSuggestions.length > 0 ? (
        <div className="rounded-md border border-border bg-white p-1 shadow-sm">
          {mentionSuggestions.map((person) => (
            <button
              key={person.id}
              type="button"
              className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[#fbfcff]"
              onClick={() => insertMention(person)}
            >
              {fullName(person.first_name, person.last_name)}
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
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={requiresAttention}
            onChange={(e) => setRequiresAttention(e.target.checked)}
          />
          Requires attention
        </label>
      </div>

      {mentionedIds.length > 0 ? (
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
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <FilePickerButton
          accept={IMAGE_UPLOAD_ACCEPT}
          label={photo ? 'Change photo' : 'Add photo'}
          variant="outline"
          disabled={createUpdate.isPending}
          onFile={(file) => setPhoto(file)}
        />
        {photo ? (
          <span className="max-w-[12rem] truncate text-xs text-muted-foreground">{photo.name}</span>
        ) : null}
        {photo ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setPhoto(null)}>
            Remove photo
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={createUpdate.isPending || (!content.trim() && !photo)}>
          {createUpdate.isPending ? 'Posting…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}

function UpdateCard({
  update,
  replies,
  projectId,
  mentionCandidates,
  highlighted,
}: {
  update: ProjectNote
  replies: ProjectNote[]
  projectId: string
  mentionCandidates: Profile[]
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
          placeholder={`Reply to ${authorName}…`}
          submitLabel="Post reply"
          onDone={() => setReplyOpen(false)}
        />
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setReplyOpen(true)}>
          Reply
        </Button>
      )}
    </div>
  )
}

export function ProjectUpdates({ projectId }: { projectId: string }) {
  const { data: notes = [], isLoading } = useProjectNotes(projectId)
  const { data: people = [] } = useProfiles({
    role: ['employee', 'subcontractor', 'project_manager', 'admin'],
  })
  const [params] = useSearchParams()
  const focusId = params.get('update')

  const mentionCandidates = useMemo(
    () =>
      people.filter(
        (person) => person.approval_status === 'approved' && person.is_active && !person.archived_at,
      ),
    [people],
  )

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
        <CardTitle>Project Updates</CardTitle>
        <p className="text-sm text-muted-foreground">
          Share what happened on site so everyone assigned to this project stays informed. Mentions and
          replies create notifications automatically.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label className="sr-only">New update</Label>
          <UpdateComposer
            projectId={projectId}
            mentionCandidates={mentionCandidates}
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

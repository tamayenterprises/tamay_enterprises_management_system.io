import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilePickerButton } from '@/components/ui/file-picker-button'
import { Textarea } from '@/components/ui/textarea'
import {
  createUpdatePhotoSignedUrl,
  useCreateProjectUpdate,
  useProjectNotes,
} from '@/features/data/hooks'
import { formatRelative, fullName } from '@/lib/utils'
import { IMAGE_UPLOAD_ACCEPT } from '@/lib/uploads'
import type { ProjectNote } from '@/types/database'

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
  onDone,
}: {
  projectId: string
  parentId?: string | null
  placeholder: string
  submitLabel: string
  onDone?: () => void
}) {
  const createUpdate = useCreateProjectUpdate()
  const [content, setContent] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)

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
          })
          setContent('')
          setPhoto(null)
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
        placeholder={placeholder}
        rows={parentId ? 2 : 3}
      />
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
}: {
  update: ProjectNote
  replies: ProjectNote[]
  projectId: string
}) {
  const [replyOpen, setReplyOpen] = useState(false)
  const authorName = update.author
    ? fullName(update.author.first_name, update.author.last_name)
    : 'Unknown'

  return (
    <div className="space-y-3 rounded-md border border-border px-3 py-3 text-sm">
      <div className="space-y-2">
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
            <div key={reply.id} className="space-y-2 rounded-md bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                Replying to {authorName}
              </p>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Updates</CardTitle>
        <p className="text-sm text-muted-foreground">
          Share what happened on site so everyone assigned to this project stays informed.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <UpdateComposer
          projectId={projectId}
          placeholder="What did you do today? What’s next on this project?"
          submitLabel="Post update"
        />

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
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

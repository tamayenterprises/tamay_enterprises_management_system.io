import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

function ClientUpdatePhoto({ path }: { path: string }) {
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
      <img src={url} alt="Project update" className="max-h-64 w-full object-cover" />
    </a>
  )
}

function ClientReplyComposer({
  projectId,
  parentId,
  onDone,
}: {
  projectId: string
  parentId: string
  onDone: () => void
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
            parentId,
            content,
            photo,
            visibleToClient: true,
          })
          setContent('')
          setPhoto(null)
          toast.success('Reply sent to Tamay')
          onDone()
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not send reply')
        }
      }}
    >
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write a reply for Tamay Enterprises…"
        rows={3}
      />
      <div className="flex flex-wrap items-center gap-2">
        <FilePickerButton
          accept={IMAGE_UPLOAD_ACCEPT}
          label={photo ? 'Change photo' : 'Add photo'}
          variant="outline"
          onFile={setPhoto}
        />
        {photo ? <span className="truncate text-xs text-muted-foreground">{photo.name}</span> : null}
        <Button type="submit" size="sm" disabled={createUpdate.isPending || (!content.trim() && !photo)}>
          {createUpdate.isPending ? 'Sending…' : 'Send reply'}
        </Button>
      </div>
    </form>
  )
}

function ClientUpdateCard({
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
    : 'Tamay Enterprises'

  return (
    <div className="space-y-3 rounded-md border border-border px-3 py-3 text-sm">
      <div className="space-y-2">
        {update.content ? <p className="whitespace-pre-wrap">{update.content}</p> : null}
        {update.photo_path ? <ClientUpdatePhoto path={update.photo_path} /> : null}
        <p className="text-xs text-muted-foreground">
          {authorName} · {formatRelative(update.created_at)}
        </p>
      </div>

      {replies.length > 0 ? (
        <div className="space-y-2 border-l-2 border-border pl-3">
          {replies.map((reply) => {
            const replyAuthor = reply.author
              ? fullName(reply.author.first_name, reply.author.last_name)
              : 'Unknown'
            return (
              <div key={reply.id} className="space-y-2 rounded-md bg-muted/40 px-3 py-2">
                {reply.content ? <p className="whitespace-pre-wrap">{reply.content}</p> : null}
                {reply.photo_path ? <ClientUpdatePhoto path={reply.photo_path} /> : null}
                <p className="text-xs text-muted-foreground">
                  {replyAuthor} · {formatRelative(reply.created_at)}
                </p>
              </div>
            )
          })}
        </div>
      ) : null}

      {replyOpen ? (
        <ClientReplyComposer projectId={projectId} parentId={update.id} onDone={() => setReplyOpen(false)} />
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setReplyOpen(true)}>
          Reply
        </Button>
      )}
    </div>
  )
}

/** Client-facing project conversation — only client-visible updates, no internal tools. */
export function ClientProjectUpdates({ projectId }: { projectId: string }) {
  const { data: notes = [], isLoading } = useProjectNotes(projectId)
  const createUpdate = useCreateProjectUpdate()
  const [content, setContent] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)

  const { roots, repliesByParent } = useMemo(() => {
    const list = notes.filter((note) => note.visible_to_client === true)
    const rootsList = list.filter((note) => !note.parent_id)
    const map = new Map<string, ProjectNote[]>()
    for (const note of list) {
      if (!note.parent_id) continue
      const replies = map.get(note.parent_id) ?? []
      replies.push(note)
      map.set(note.parent_id, replies)
    }
    return { roots: rootsList, repliesByParent: map }
  }, [notes])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Messages from Tamay</CardTitle>
        <CardDescription>
          Updates Tamay shares about this project. Reply here anytime — your messages go to the Tamay team.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-2 rounded-lg border border-border bg-[#fbfcff] p-3"
          onSubmit={async (event) => {
            event.preventDefault()
            try {
              await createUpdate.mutateAsync({
                projectId,
                content,
                photo,
                visibleToClient: true,
              })
              setContent('')
              setPhoto(null)
              toast.success('Message sent')
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Could not send message')
            }
          }}
        >
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Ask a question or share an update for Tamay…"
            rows={3}
          />
          <div className="flex flex-wrap items-center gap-2">
            <FilePickerButton
              accept={IMAGE_UPLOAD_ACCEPT}
              label={photo ? 'Change photo' : 'Add photo'}
              variant="outline"
              onFile={setPhoto}
            />
            {photo ? <span className="truncate text-xs text-muted-foreground">{photo.name}</span> : null}
            <Button type="submit" size="sm" disabled={createUpdate.isPending || (!content.trim() && !photo)}>
              {createUpdate.isPending ? 'Sending…' : 'Send message'}
            </Button>
          </div>
        </form>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading messages…</p>
        ) : roots.length === 0 ? (
          <EmptyState
            title="No messages yet"
            description="When Tamay posts a project update for you, it will appear here."
          />
        ) : (
          <div className="space-y-3">
            {[...roots].reverse().map((update) => (
              <ClientUpdateCard
                key={update.id}
                update={update}
                replies={repliesByParent.get(update.id) ?? []}
                projectId={projectId}
              />
            ))}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Only messages Tamay shares with you appear here. Internal crew notes stay private.
        </p>
      </CardContent>
    </Card>
  )
}

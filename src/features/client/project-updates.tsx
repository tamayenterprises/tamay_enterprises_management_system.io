import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilePickerButton, SelectedFilesList } from '@/components/ui/file-picker-button'
import { Textarea } from '@/components/ui/textarea'
import {
  createUpdatePhotoSignedUrl,
  useCreateProjectUpdate,
  useProjectNotes,
} from '@/features/data/hooks'
import { formatRelative, fullName } from '@/lib/utils'
import { resolvedImageUploadAccept } from '@/lib/uploads'
import { RichUpdateText } from '@/features/updates/rich-update-text'
import type { ProjectNote } from '@/types/database'

function ClientUpdatePhoto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    setUrl(null)
    createUpdatePhotoSignedUrl(path)
      .then((signed) => {
        if (!cancelled) setUrl(signed)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [path])

  if (failed) {
    return (
      <p className="text-xs text-muted-foreground">
        Photo saved, but this device can’t preview it.
      </p>
    )
  }

  if (!url) return <p className="text-xs text-muted-foreground">Loading photo…</p>

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-md border border-border bg-muted/30">
      <img
        src={url}
        alt="Project update"
        className="mx-auto max-h-80 w-auto max-w-full object-contain"
        onError={() => setFailed(true)}
      />
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
  const [photos, setPhotos] = useState<File[]>([])

  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault()
        try {
          // Keep the written reply with the first photo; extra photos nest as replies
          // under the same parent so the caption is not lost among empty photo posts.
          if (photos.length === 0) {
            await createUpdate.mutateAsync({
              projectId,
              parentId,
              content,
              visibleToClient: true,
            })
          } else {
            for (let index = 0; index < photos.length; index += 1) {
              await createUpdate.mutateAsync({
                projectId,
                parentId,
                content: index === 0 ? content : '',
                photo: photos[index],
                visibleToClient: true,
              })
            }
          }
          setContent('')
          setPhotos([])
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
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <FilePickerButton
            accept={resolvedImageUploadAccept()}
            label="Add photos"
            variant="outline"
            multiple
            selectedFiles={photos}
            onFiles={setPhotos}
          />
          <Button
            type="submit"
            size="sm"
            disabled={createUpdate.isPending || (!content.trim() && photos.length === 0)}
          >
            {createUpdate.isPending ? 'Sending…' : 'Send reply'}
          </Button>
        </div>
        <SelectedFilesList files={photos} onChange={setPhotos} />
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
        {update.content ? <RichUpdateText content={update.content} /> : null}
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
                {reply.content ? <RichUpdateText content={reply.content} /> : null}
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
  const [photos, setPhotos] = useState<File[]>([])

  // RLS already limits clients to client-visible notes (+ their own). Do not
  // re-filter with === true — that hides every message when the column is
  // missing from the API response, which looks like comments vanish after submit.
  const { roots, repliesByParent } = useMemo(() => {
    const rootsList = notes.filter((note) => !note.parent_id)
    const map = new Map<string, ProjectNote[]>()
    for (const note of notes) {
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
              const photoCount = photos.length
              if (photos.length === 0) {
                await createUpdate.mutateAsync({
                  projectId,
                  content,
                  visibleToClient: true,
                })
              } else {
                // Caption stays on the root message; extra photos attach as replies
                // so the description remains visible with the whole upload.
                const root = await createUpdate.mutateAsync({
                  projectId,
                  content,
                  photo: photos[0],
                  visibleToClient: true,
                })
                for (let index = 1; index < photos.length; index += 1) {
                  await createUpdate.mutateAsync({
                    projectId,
                    parentId: root.id,
                    content: '',
                    photo: photos[index],
                    visibleToClient: true,
                  })
                }
              }
              setContent('')
              setPhotos([])
              toast.success(photoCount > 1 ? 'Message and photos sent' : 'Message sent')
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
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <FilePickerButton
                accept={resolvedImageUploadAccept()}
                label="Add photos"
                variant="outline"
                multiple
                selectedFiles={photos}
                onFiles={setPhotos}
              />
              <Button
                type="submit"
                size="sm"
                disabled={createUpdate.isPending || (!content.trim() && photos.length === 0)}
              >
                {createUpdate.isPending ? 'Sending…' : 'Send message'}
              </Button>
            </div>
            <SelectedFilesList files={photos} onChange={setPhotos} />
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

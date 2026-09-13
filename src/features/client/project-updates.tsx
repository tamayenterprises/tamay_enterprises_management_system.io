import { useEffect, useMemo, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FilePickerButton, SelectedFilesList } from '@/components/ui/file-picker-button'
import { Textarea } from '@/components/ui/textarea'
import { ProfileAvatar } from '@/features/profile/avatar'
import {
  createUpdatePhotoSignedUrl,
  useCreateProjectUpdate,
  useProjectNotes,
} from '@/features/data/hooks'
import { cn, formatRelative, fullName, roleLabel } from '@/lib/utils'
import { IMAGE_UPLOAD_ACCEPT } from '@/lib/uploads'
import type { ProjectNote } from '@/types/database'

function ClientUpdatePhotoThumb({
  path,
  className,
  overlay,
}: {
  path: string
  className?: string
  overlay?: string
}) {
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
    return (
      <div
        className={cn(
          'flex aspect-square items-center justify-center rounded-xl bg-muted text-[10px] text-muted-foreground',
          className,
        )}
      >
        …
      </div>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'relative block aspect-square overflow-hidden rounded-xl border border-border/70 bg-muted/30 transition hover:opacity-95',
        className,
      )}
    >
      <img src={url} alt="Project update" className="h-full w-full object-cover" />
      {overlay ? (
        <span className="absolute inset-0 flex items-center justify-center bg-[#092e4c]/55 text-sm font-semibold text-white">
          {overlay}
        </span>
      ) : null}
    </a>
  )
}

function collectPhotos(update: ProjectNote, replies: ProjectNote[]) {
  const paths: string[] = []
  if (update.photo_path) paths.push(update.photo_path)
  for (const reply of replies) {
    if (reply.photo_path && !reply.content?.trim()) paths.push(reply.photo_path)
  }
  return paths
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
      className="space-y-2 rounded-xl border border-border/80 bg-[#f8fafc] p-3"
      onSubmit={async (event) => {
        event.preventDefault()
        try {
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
        className="rounded-xl"
      />
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <FilePickerButton
            accept={IMAGE_UPLOAD_ACCEPT}
            label="Add photos"
            variant="outline"
            multiple
            selectedFiles={photos}
            onFiles={setPhotos}
          />
          <Button
            type="submit"
            size="sm"
            className="rounded-lg"
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
  const authorRole = update.author?.role ? roleLabel(update.author.role) : 'Team'
  const photoPaths = collectPhotos(update, replies)
  const visibleThumbs = photoPaths.slice(0, 4)
  const overflow = photoPaths.length - visibleThumbs.length
  const textReplies = replies.filter((reply) => reply.content?.trim() || !reply.photo_path)

  return (
    <article className="border-b border-border/70 py-5 last:border-b-0 last:pb-0 first:pt-0">
      <div className="flex gap-3">
        <ProfileAvatar
          firstName={update.author?.first_name || 'T'}
          lastName={update.author?.last_name || 'E'}
          avatarUrl={update.author?.avatar_url}
          className="h-10 w-10 shrink-0"
          fallbackClassName="bg-primary/10 text-primary"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-sm font-semibold text-foreground">{authorName}</p>
            <p className="text-xs text-muted-foreground">{authorRole}</p>
            <p className="text-xs text-muted-foreground">· {formatRelative(update.created_at)}</p>
          </div>

          {update.content ? (
            <p className="mt-2 max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {update.content}
            </p>
          ) : null}

          {visibleThumbs.length > 0 ? (
            <div className="mt-3 grid max-w-md grid-cols-4 gap-2">
              {visibleThumbs.map((path, index) => (
                <ClientUpdatePhotoThumb
                  key={`${path}-${index}`}
                  path={path}
                  overlay={index === visibleThumbs.length - 1 && overflow > 0 ? `+${overflow}` : undefined}
                />
              ))}
            </div>
          ) : null}

          {textReplies.length > 0 ? (
            <div className="mt-3 space-y-2 border-l-2 border-primary/15 pl-3">
              {textReplies.map((reply) => {
                const replyAuthor = reply.author
                  ? fullName(reply.author.first_name, reply.author.last_name)
                  : 'Unknown'
                return (
                  <div key={reply.id} className="rounded-xl bg-muted/50 px-3 py-2">
                    {reply.content ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{reply.content}</p>
                    ) : null}
                    {reply.photo_path && reply.content?.trim() ? (
                      <div className="mt-2 max-w-[8rem]">
                        <ClientUpdatePhotoThumb path={reply.photo_path} />
                      </div>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {replyAuthor} · {formatRelative(reply.created_at)}
                    </p>
                  </div>
                )
              })}
            </div>
          ) : null}

          {replyOpen ? (
            <div className="mt-3">
              <ClientReplyComposer
                projectId={projectId}
                parentId={update.id}
                onDone={() => setReplyOpen(false)}
              />
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-2 h-8 gap-1.5 px-2 text-primary"
              onClick={() => setReplyOpen(true)}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Reply
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

/** Client-facing project conversation — only client-visible updates, no internal tools. */
export function ClientProjectUpdates({ projectId }: { projectId: string }) {
  const { data: notes = [], isLoading } = useProjectNotes(projectId)
  const createUpdate = useCreateProjectUpdate()
  const [content, setContent] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [showAll, setShowAll] = useState(false)

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

  const ordered = useMemo(() => [...roots].reverse(), [roots])
  const mobileLimit = 3

  return (
    <section className="rounded-2xl border border-border/80 bg-white p-4 shadow-[0_1px_2px_rgba(9,46,76,0.04),0_8px_24px_rgba(9,46,76,0.04)] sm:p-5">
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Project journal
        </p>
        <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-primary">
          Project updates
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Progress notes and messages from your Tamay team. Reply anytime.
        </p>
      </div>

      <form
        id="client-ask-question"
        className="scroll-mt-24 space-y-2 rounded-2xl border border-border/80 bg-gradient-to-b from-[#f8fafc] to-white p-3 sm:p-4"
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
          className="rounded-xl border-border/80"
        />
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <FilePickerButton
              accept={IMAGE_UPLOAD_ACCEPT}
              label="Add photos"
              variant="outline"
              multiple
              selectedFiles={photos}
              onFiles={setPhotos}
            />
            <Button
              type="submit"
              size="sm"
              className="rounded-lg"
              disabled={createUpdate.isPending || (!content.trim() && photos.length === 0)}
            >
              {createUpdate.isPending ? 'Sending…' : 'Send message'}
            </Button>
          </div>
          <SelectedFilesList files={photos} onChange={setPhotos} />
        </div>
      </form>

      <div className="mt-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading updates…</p>
        ) : ordered.length === 0 ? (
          <EmptyState
            title="No updates yet"
            description="When Tamay posts a project update for you, it will appear here."
          />
        ) : (
          <>
            <div>
              {ordered.map((update, index) => (
                <div
                  key={update.id}
                  className={cn(index >= mobileLimit && !showAll && 'max-lg:hidden')}
                >
                  <ClientUpdateCard
                    update={update}
                    replies={repliesByParent.get(update.id) ?? []}
                    projectId={projectId}
                  />
                </div>
              ))}
            </div>
            {ordered.length > mobileLimit && !showAll ? (
              <Button
                type="button"
                variant="outline"
                className="mt-2 w-full rounded-xl lg:hidden"
                onClick={() => setShowAll(true)}
              >
                View more updates ({ordered.length - mobileLimit})
              </Button>
            ) : null}
            {showAll ? (
              <Button
                type="button"
                variant="ghost"
                className="mt-1 w-full lg:hidden"
                onClick={() => setShowAll(false)}
              >
                Show fewer updates
              </Button>
            ) : null}
          </>
        )}
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">
        Only messages Tamay shares with you appear here. Internal crew notes stay private.
      </p>
    </section>
  )
}

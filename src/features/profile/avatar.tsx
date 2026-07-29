import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/features/auth/auth-context'
import { useRemoveMyAvatar, useUpdateMyAvatar } from '@/features/profile/hooks'
import { confirmAction } from '@/lib/uploads'
import { cn, getInitials } from '@/lib/utils'

const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif'

export function ProfileAvatar({
  firstName,
  lastName,
  avatarUrl,
  className,
  fallbackClassName,
}: {
  firstName: string
  lastName: string
  avatarUrl?: string | null
  className?: string
  fallbackClassName?: string
}) {
  return (
    <Avatar className={cn('h-9 w-9', className)}>
      <AvatarImage src={avatarUrl ?? undefined} alt={`${firstName} ${lastName}`} />
      <AvatarFallback className={cn('rounded-full', fallbackClassName)}>
        {getInitials(firstName, lastName)}
      </AvatarFallback>
    </Avatar>
  )
}

/** Clickable sidebar avatar — upload/replace/remove for any signed-in role. */
export function SidebarProfileAvatar() {
  const { profile } = useAuth()
  const updateAvatar = useUpdateMyAvatar()
  const removeAvatar = useRemoveMyAvatar()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)

  if (!profile) return null

  const busy = updateAvatar.isPending || removeAvatar.isPending

  return (
    <>
      <button
        type="button"
        className="group relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        onClick={() => setOpen(true)}
        aria-label="Update profile photo"
        title="Update profile photo"
      >
        <ProfileAvatar
          firstName={profile.first_name}
          lastName={profile.last_name}
          avatarUrl={profile.avatar_url}
          fallbackClassName="bg-white/15 text-white"
        />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition group-hover:opacity-100">
          <Camera className="h-3.5 w-3.5 text-white" />
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_ACCEPT}
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          try {
            await updateAvatar.mutateAsync(file)
            toast.success('Profile photo updated')
            setOpen(false)
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Upload failed')
          }
        }}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Profile photo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <ProfileAvatar
              firstName={profile.first_name}
              lastName={profile.last_name}
              avatarUrl={profile.avatar_url}
              className="h-24 w-24"
              fallbackClassName="bg-muted text-lg text-foreground"
            />
            <p className="text-center text-sm text-muted-foreground">
              Upload a clear photo so teammates can identify you. JPG, PNG, or WebP up to 5 MB.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button disabled={busy} onClick={() => inputRef.current?.click()}>
                {busy ? 'Saving…' : profile.avatar_url ? 'Replace photo' : 'Upload photo'}
              </Button>
              {profile.avatar_url ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    if (!confirmAction('Remove your profile photo?')) return
                    try {
                      await removeAvatar.mutateAsync()
                      toast.success('Profile photo removed')
                      setOpen(false)
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Remove failed')
                    }
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/features/auth/auth-hooks'
import { useRemoveMyAvatar, useUpdateMyAvatar } from '@/features/profile/hooks'
import { confirmAction } from '@/lib/uploads'
import { cn, fullName, getInitials, roleLabel } from '@/lib/utils'

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
  const hasPhoto = Boolean(profile.avatar_url)

  return (
    <>
      <button
        type="button"
        className="mb-2 flex w-full items-center gap-2.5 rounded-lg border border-dashed border-white/35 bg-white/5 px-2 py-1.5 text-left transition hover:border-accent hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        onClick={() => setOpen(true)}
        aria-label={hasPhoto ? 'Change profile photo' : 'Add profile photo'}
      >
        <span className="relative shrink-0">
          <ProfileAvatar
            firstName={profile.first_name}
            lastName={profile.last_name}
            avatarUrl={profile.avatar_url}
            className="h-9 w-9"
            fallbackClassName="bg-white/15 text-white"
          />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-[#0B3C5D] bg-accent text-accent-foreground shadow-sm">
            <Camera className="h-2.5 w-2.5" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-tight text-white">
            {fullName(profile.first_name, profile.last_name)}
          </span>
          <span className="block truncate text-[11px] leading-tight text-sidebar-muted">
            {roleLabel(profile.role)}
          </span>
          <span className="mt-0.5 block text-[11px] font-semibold leading-tight text-accent">
            {hasPhoto ? 'Change photo' : 'Add profile photo'}
          </span>
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
            <DialogTitle>{hasPhoto ? 'Change profile photo' : 'Add profile photo'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <ProfileAvatar
                firstName={profile.first_name}
                lastName={profile.last_name}
                avatarUrl={profile.avatar_url}
                className="h-24 w-24"
                fallbackClassName="bg-muted text-lg text-foreground"
              />
              <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-accent text-accent-foreground">
                <Camera className="h-4 w-4" />
              </span>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Upload a clear photo so teammates can identify you. JPG, PNG, or WebP up to 5 MB.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button disabled={busy} onClick={() => inputRef.current?.click()}>
                {busy ? 'Saving…' : hasPhoto ? 'Replace photo' : 'Upload photo'}
              </Button>
              {hasPhoto ? (
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

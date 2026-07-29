import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'])

function validateAvatarFile(file: File): string | null {
  if (file.size <= 0) return 'The selected file is empty.'
  if (file.size > MAX_AVATAR_BYTES) return 'Photo must be 5 MB or smaller.'
  const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
  const mimeOk = !file.type || ALLOWED_TYPES.has(file.type)
  const extOk = ALLOWED_EXT.has(extension)
  if (!mimeOk && !extOk) return 'Use a JPG, PNG, WebP, or HEIC image.'
  return null
}

function avatarExtension(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (fromName && ALLOWED_EXT.has(`.${fromName}`)) return fromName === 'jpeg' ? 'jpg' : fromName
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/heic' || file.type === 'image/heif') return 'heic'
  return 'jpg'
}

export function useUpdateMyAvatar() {
  const { profile, refreshProfile } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (file: File) => {
      if (!profile?.id) throw new Error('Not signed in')
      const validationError = validateAvatarFile(file)
      if (validationError) throw new Error(validationError)

      const ext = avatarExtension(file)
      const path = `${profile.id}/avatar.${ext}`

      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: file.type || `image/${ext}`,
        cacheControl: '3600',
      })
      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const avatarUrl = `${data.publicUrl}?v=${Date.now()}`

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', profile.id)
      if (updateError) throw updateError

      return avatarUrl
    },
    onSuccess: async () => {
      await refreshProfile()
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      queryClient.invalidateQueries({ queryKey: ['worker-status'] })
    },
  })
}

export function useRemoveMyAvatar() {
  const { profile, refreshProfile } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error('Not signed in')

      const { data: files } = await supabase.storage.from('avatars').list(profile.id)
      if (files?.length) {
        await supabase.storage.from('avatars').remove(files.map((file) => `${profile.id}/${file.name}`))
      }

      const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await refreshProfile()
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      queryClient.invalidateQueries({ queryKey: ['worker-status'] })
    },
  })
}

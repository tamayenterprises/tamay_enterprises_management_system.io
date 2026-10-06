import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { AuthContext } from '@/features/auth/auth-context-instance'
import type { Profile } from '@/types/database'

export interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

async function fetchProfile(userId: string) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()
  const cachedUserId = useRef<string | null>(null)

  useEffect(() => {
    let mounted = true

    // Cached queries hold one user's authorized data; drop all of it whenever the
    // signed-in user changes (sign-out, sign-in, account switch).
    const resetCacheForUser = (userId: string | null) => {
      if (cachedUserId.current === userId) return
      cachedUserId.current = userId
      queryClient.clear()
    }

    const syncSession = async (nextSession: Session | null) => {
      if (!mounted) return
      resetCacheForUser(nextSession?.user?.id ?? null)

      if (!nextSession?.user) {
        setSession(null)
        setProfile(null)
        setLoading(false)
        return
      }

      // Mark loading before exposing the session so route guards never see
      // "signed in but no profile yet" and bounce back to /sign-in.
      setLoading(true)
      setSession(nextSession)
      try {
        const nextProfile = await fetchProfile(nextSession.user.id)
        if (mounted) setProfile(nextProfile)
      } catch {
        if (mounted) setProfile(null)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      void syncSession(data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncSession(nextSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      refreshProfile: async () => {
        if (!session?.user?.id) {
          setProfile(null)
          return
        }
        const data = await fetchProfile(session.user.id)
        setProfile(data)
      },
      signOut: async () => {
        await supabase.auth.signOut({ scope: 'global' })
        cachedUserId.current = null
        queryClient.clear()
        setSession(null)
        setProfile(null)
        setLoading(false)
      },
    }),
    [session, profile, loading, queryClient],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}


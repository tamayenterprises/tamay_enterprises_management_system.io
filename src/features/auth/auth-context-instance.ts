import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile } from '@/types/database'

export interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

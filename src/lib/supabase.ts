import { createClient } from '@/lib/supabase/client'

/** Shared browser Supabase client for the Vite SPA. */
export const supabase = createClient()

import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    'Supabase environment variables are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.',
  )
}

export function createClient() {
  return createBrowserClient(
    supabaseUrl ?? 'https://placeholder.supabase.co',
    supabaseKey ?? 'placeholder-key',
  )
}

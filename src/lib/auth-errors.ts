/** Map Supabase Auth errors to user-facing copy for this app. */
export function formatAuthError(message: string) {
  const normalized = message.toLowerCase()

  if (
    normalized.includes('email not confirmed') ||
    normalized.includes('email_not_confirmed') ||
    normalized.includes('confirm your email')
  ) {
    return 'Your account is waiting on management approval. You can sign in after an admin approves you.'
  }

  return message
}

/** Surface real PostgREST / Storage / Error messages in Development toasts. */
export function formatUnknownError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (error && typeof error === 'object') {
    const e = error as {
      message?: unknown
      code?: unknown
      details?: unknown
      hint?: unknown
      statusCode?: unknown
      error?: unknown
    }
    const parts = [e.message, e.code, e.details, e.hint, e.statusCode, e.error]
      .filter((part): part is string | number => typeof part === 'string' || typeof part === 'number')
      .map(String)
      .filter((part) => part.trim().length > 0)
    if (parts.length > 0) return parts.join(' — ')
  }
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

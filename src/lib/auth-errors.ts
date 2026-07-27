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

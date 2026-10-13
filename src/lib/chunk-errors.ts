/** Vite hashed chunks 404 after a deploy; the SPA rewrite then serves HTML as JS. */
export function isStaleChunkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Expected a JavaScript-or-Wasm module script/i.test(
    message,
  )
}

const RELOAD_KEY = 'tamay-stale-chunk-reload'

export function reloadOnceForStaleChunk() {
  if (typeof window === 'undefined') return false
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === '1') return false
    sessionStorage.setItem(RELOAD_KEY, '1')
  } catch {
    // Private mode can block sessionStorage; still try a one-shot reload.
  }
  window.location.reload()
  return true
}

const positions = new Map<string, number>()
const STORAGE_KEY = 'tamay.route-scroll.v1'

const FOCUS_PARAMS = ['update', 'reply', 'parent', 'doc'] as const
const VIEW_STATE_PARAMS = ['q', 'role', 'approval', 'archived'] as const
const SCROLL_IGNORE_PARAMS = [...FOCUS_PARAMS, ...VIEW_STATE_PARAMS] as const

export function isRouteFocusNavigation(search = '', hash = '') {
  if (hash) return true
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return FOCUS_PARAMS.some((key) => Boolean(params.get(key)))
}

export function routeScrollKey(pathname: string, search = '') {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  for (const key of SCROLL_IGNORE_PARAMS) params.delete(key)
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

export function readLockedScrollY(body: { style: { position: string; top: string } }, windowScrollY: number) {
  if (body.style.position === 'fixed' && body.style.top.startsWith('-')) {
    const locked = Math.abs(Number.parseInt(body.style.top, 10))
    return Number.isFinite(locked) ? locked : windowScrollY
  }
  return windowScrollY
}

function isDocumentHidden() {
  return typeof document !== 'undefined' && document.hidden
}

function persistPositions() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(positions)))
  } catch {
    /* private mode / quota */
  }
}

function hydratePositions() {
  if (positions.size > 0) return
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, unknown>
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) positions.set(key, value)
    }
  } catch {
    /* ignore bad storage */
  }
}

export function rememberRouteScroll(key: string, y: number) {
  const next = Math.max(0, Math.round(y))
  // Background tabs often report scroll 0; keep the last in-view position.
  if (isDocumentHidden() && next <= 0) return
  positions.set(key, next)
  persistPositions()
}

export function recalledRouteScroll(key: string) {
  hydratePositions()
  return positions.get(key) ?? 0
}

export function clearRouteScroll() {
  positions.clear()
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

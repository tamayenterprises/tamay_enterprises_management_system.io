const positions = new Map<string, number>()

const FOCUS_PARAMS = ['update', 'reply', 'parent', 'doc'] as const

export function isRouteFocusNavigation(search = '', hash = '') {
  if (hash) return true
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return FOCUS_PARAMS.some((key) => Boolean(params.get(key)))
}

export function routeScrollKey(pathname: string, search = '') {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  for (const key of FOCUS_PARAMS) params.delete(key)
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

export function rememberRouteScroll(key: string, y: number) {
  positions.set(key, Math.max(0, y))
}

export function recalledRouteScroll(key: string) {
  return positions.get(key) ?? 0
}

export function clearRouteScroll() {
  positions.clear()
}

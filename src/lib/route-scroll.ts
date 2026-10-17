const positions = new Map<string, number>()

export function routeScrollKey(pathname: string, search = '') {
  return `${pathname}${search}`
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

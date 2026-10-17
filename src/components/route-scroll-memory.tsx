import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  isRouteFocusNavigation,
  readLockedScrollY,
  recalledRouteScroll,
  rememberRouteScroll,
  routeScrollKey,
} from '@/lib/route-scroll'

function currentScrollY() {
  return readLockedScrollY(document.body, window.scrollY)
}

/** Keep each page's scroll position when switching screens, opening a file tab, or coming back. */
export function RouteScrollMemory() {
  const location = useLocation()
  const key = routeScrollKey(location.pathname, location.search)
  const focused = isRouteFocusNavigation(location.search, location.hash)

  useLayoutEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

    const restore = () => {
      if (location.hash) {
        const target = document.getElementById(location.hash.slice(1))
        if (target) {
          target.scrollIntoView()
          return
        }
      }
      if (focused || document.hidden) return
      window.scrollTo(0, recalledRouteScroll(key))
    }

    const save = () => {
      if (!focused && !document.hidden) rememberRouteScroll(key, currentScrollY())
    }

    restore()
    const timers = [0, 50, 150, 400].map((ms) => window.setTimeout(restore, ms))
    window.addEventListener('scroll', save, { passive: true })
    window.addEventListener('pointerdown', save, true)
    window.addEventListener('pageshow', restore)
    window.addEventListener('focus', restore)
    document.addEventListener('visibilitychange', restore)

    return () => {
      save()
      window.removeEventListener('scroll', save)
      window.removeEventListener('pointerdown', save, true)
      window.removeEventListener('pageshow', restore)
      window.removeEventListener('focus', restore)
      document.removeEventListener('visibilitychange', restore)
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [key, focused, location.hash])

  return null
}

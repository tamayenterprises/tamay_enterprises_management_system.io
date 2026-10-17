import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { readLockedScrollY, recalledRouteScroll, rememberRouteScroll, routeScrollKey } from '@/lib/route-scroll'

function currentScrollY() {
  return readLockedScrollY(document.body, window.scrollY)
}

/** Keep each page's scroll position when switching nav items or going back. */
export function RouteScrollMemory() {
  const location = useLocation()
  const key = routeScrollKey(location.pathname, location.search)

  useLayoutEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

    const restoreY = recalledRouteScroll(key)
    const restore = () => {
      if (location.hash) {
        const target = document.getElementById(location.hash.slice(1))
        if (target) {
          target.scrollIntoView()
          return
        }
      }
      window.scrollTo(0, restoreY)
    }

    restore()
    const timers = [0, 50, 150, 400].map((ms) => window.setTimeout(restore, ms))
    const onScroll = () => rememberRouteScroll(key, currentScrollY())
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      rememberRouteScroll(key, currentScrollY())
      window.removeEventListener('scroll', onScroll)
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [key, location.hash])

  return null
}

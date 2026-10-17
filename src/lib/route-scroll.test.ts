import { describe, expect, it } from 'vitest'
import {
  clearRouteScroll,
  readLockedScrollY,
  recalledRouteScroll,
  rememberRouteScroll,
  routeScrollKey,
} from './route-scroll'

describe('route scroll memory', () => {
  it('keys pages by path and search, not hash', () => {
    expect(routeScrollKey('/dashboard', '')).toBe('/dashboard')
    expect(routeScrollKey('/updates', '?tab=company')).toBe('/updates?tab=company')
    expect(routeScrollKey('/projects/1')).toBe('/projects/1')
  })

  it('reads the real scroll position while the mobile menu locks the body', () => {
    expect(readLockedScrollY({ style: { position: 'fixed', top: '-420px' } }, 0)).toBe(420)
    expect(readLockedScrollY({ style: { position: '', top: '' } }, 80)).toBe(80)
  })

  it('recalls the last saved position for a page', () => {
    clearRouteScroll()
    rememberRouteScroll('/dashboard', 640)
    expect(recalledRouteScroll('/dashboard')).toBe(640)
    expect(recalledRouteScroll('/projects')).toBe(0)
  })
})

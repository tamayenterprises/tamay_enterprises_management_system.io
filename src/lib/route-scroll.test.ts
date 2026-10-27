import { describe, expect, it } from 'vitest'
import {
  clearRouteScroll,
  isRouteFocusNavigation,
  readLockedScrollY,
  recalledRouteScroll,
  rememberRouteScroll,
  routeScrollKey,
} from './route-scroll'

describe('route scroll memory', () => {
  it('keys pages by path and search, not hash or deep-link params', () => {
    expect(routeScrollKey('/dashboard', '')).toBe('/dashboard')
    expect(routeScrollKey('/admin', '?role=project_manager&q=cherry&approval=approved')).toBe('/admin')
    expect(routeScrollKey('/updates', '?tab=company')).toBe('/updates?tab=company')
    expect(routeScrollKey('/updates', '?tab=company&update=abc&reply=def')).toBe(
      '/updates?tab=company',
    )
    expect(routeScrollKey('/projects/1', '?update=n1')).toBe('/projects/1')
  })

  it('detects deep links to a specific update or file', () => {
    expect(isRouteFocusNavigation('?tab=company')).toBe(false)
    expect(isRouteFocusNavigation('?tab=company&update=abc')).toBe(true)
    expect(isRouteFocusNavigation('', '#client-ask-question')).toBe(true)
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

  it('keeps the last visible position if a hidden tab reports scroll 0', () => {
    clearRouteScroll()
    rememberRouteScroll('/employees', 900)
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    try {
      rememberRouteScroll('/employees', 0)
      expect(recalledRouteScroll('/employees')).toBe(900)
    } finally {
      Reflect.deleteProperty(document, 'hidden')
    }
  })
})

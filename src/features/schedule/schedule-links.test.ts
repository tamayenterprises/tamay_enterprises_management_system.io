import { describe, expect, it } from 'vitest'
import { googleDirectionsUrl, wazeUrl } from '@/lib/project-coords'
import {
  canonicalProjectAddress,
  currentOrNextIndex,
  formatPhoneDisplay,
  formatScheduleTime,
  formatScheduleTimeRange,
  phoneHref,
  timesOverlap,
  toTimeInputValue,
  weekDays,
} from '@/features/schedule/schedule-links'

describe('phoneHref', () => {
  it('normalizes US numbers to E.164 tel links', () => {
    expect(phoneHref('(203) 555-1234')).toBe('tel:+12035551234')
    expect(phoneHref('203.555.1234')).toBe('tel:+12035551234')
    expect(phoneHref('1-203-555-1234')).toBe('tel:+12035551234')
    expect(phoneHref('+1 203 555 1234')).toBe('tel:+12035551234')
  })

  it('drops extensions instead of dialing them into the number', () => {
    expect(phoneHref('203-555-1234 ext. 12')).toBe('tel:+12035551234')
    expect(phoneHref('203-555-1234 x12')).toBe('tel:+12035551234')
  })

  it('keeps 7-digit local numbers dialable', () => {
    expect(phoneHref('555-0101')).toBe('tel:5550101')
  })

  it('returns null for missing or undialable values', () => {
    expect(phoneHref(null)).toBeNull()
    expect(phoneHref('')).toBeNull()
    expect(phoneHref('   ')).toBeNull()
    expect(phoneHref('call office')).toBeNull()
    expect(phoneHref('555-12')).toBeNull()
  })
})

describe('formatPhoneDisplay', () => {
  it('formats US numbers and keeps other text as entered', () => {
    expect(formatPhoneDisplay('2035551234')).toBe('(203) 555-1234')
    expect(formatPhoneDisplay('+1 203 555 1234')).toBe('(203) 555-1234')
    expect(formatPhoneDisplay('+44 20 7946 0958')).toBe('+44 20 7946 0958')
    expect(formatPhoneDisplay('5550101')).toBe('555-0101')
    expect(formatPhoneDisplay('call office')).toBe('call office')
    expect(formatPhoneDisplay(null)).toBeNull()
    expect(formatPhoneDisplay('  ')).toBeNull()
  })
})

describe('canonicalProjectAddress', () => {
  it('prefers job_site_address and falls back to location', () => {
    expect(canonicalProjectAddress({ job_site_address: ' 12 Main St ', location: 'Old' })).toBe('12 Main St')
    expect(canonicalProjectAddress({ job_site_address: '  ', location: 'Waterbury, CT' })).toBe('Waterbury, CT')
    expect(canonicalProjectAddress({ job_site_address: null, location: null })).toBeNull()
    expect(canonicalProjectAddress(null)).toBeNull()
  })
})

describe('navigation links', () => {
  it('uses coordinates first for Google Maps and Waze', () => {
    const target = { latitude: 41.55, longitude: -73.04, address: '12 Main St, Waterbury, CT' }
    expect(googleDirectionsUrl(target)).toBe('https://www.google.com/maps/dir/?api=1&destination=41.55,-73.04')
    expect(wazeUrl(target)).toBe('https://waze.com/ul?ll=41.55,-73.04&navigate=yes')
  })

  it('falls back to the encoded address', () => {
    const target = { latitude: null, longitude: null, address: '12 Main St, Waterbury, CT' }
    expect(googleDirectionsUrl(target)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=12%20Main%20St%2C%20Waterbury%2C%20CT',
    )
    expect(wazeUrl(target)).toBe('https://waze.com/ul?q=12%20Main%20St%2C%20Waterbury%2C%20CT&navigate=yes')
  })

  it('returns null when there is nothing to navigate to', () => {
    expect(googleDirectionsUrl({ address: '  ' })).toBeNull()
    expect(wazeUrl({})).toBeNull()
    expect(googleDirectionsUrl({ latitude: 0, longitude: 0 })).toBeNull()
  })
})

describe('schedule time helpers', () => {
  it('formats 12-hour times and ranges', () => {
    expect(formatScheduleTime('07:00:00')).toBe('7:00 AM')
    expect(formatScheduleTime('12:30')).toBe('12:30 PM')
    expect(formatScheduleTime('00:15')).toBe('12:15 AM')
    expect(formatScheduleTimeRange('07:00:00', '15:30:00')).toBe('7:00 AM – 3:30 PM')
    expect(formatScheduleTimeRange('07:00:00', null)).toBe('7:00 AM')
    expect(toTimeInputValue('07:05:00')).toBe('07:05')
  })

  it('detects overlaps, treating a missing end time as end of day', () => {
    expect(timesOverlap({ start_time: '07:00', end_time: '12:00' }, { start_time: '11:00', end_time: '15:00' })).toBe(true)
    expect(timesOverlap({ start_time: '07:00', end_time: '12:00' }, { start_time: '12:00', end_time: '15:00' })).toBe(false)
    expect(timesOverlap({ start_time: '07:00', end_time: null }, { start_time: '16:00', end_time: '17:00' })).toBe(true)
  })

  it('builds a Monday-first work week', () => {
    const days = weekDays(new Date(2026, 8, 30))
    expect(days).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ])
  })

  it('highlights the job in progress, else the next one, else the last one', () => {
    const items = [
      { start_time: '07:00', end_time: '11:00' },
      { start_time: '12:00', end_time: '15:00' },
    ]
    expect(currentOrNextIndex(items, new Date(2026, 8, 28, 8, 0))).toBe(0)
    expect(currentOrNextIndex(items, new Date(2026, 8, 28, 11, 30))).toBe(1)
    expect(currentOrNextIndex(items, new Date(2026, 8, 28, 18, 0))).toBe(1)
    expect(currentOrNextIndex([], new Date())).toBe(-1)
  })
})

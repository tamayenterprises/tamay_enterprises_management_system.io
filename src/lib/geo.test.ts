import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GEOFENCE_RADIUS_METERS,
  DEFAULT_MAX_GPS_ACCURACY_METERS,
  feetToMeters,
  haversineMeters,
  metersToFeet,
  nextAttendanceActions,
  paidWorkingHours,
} from '@/lib/geo'

describe('geo helpers', () => {
  it('converts feet and meters consistently', () => {
    expect(feetToMeters(300)).toBeCloseTo(91.44, 1)
    expect(metersToFeet(91.44)).toBeCloseTo(300, 0)
    expect(DEFAULT_GEOFENCE_RADIUS_METERS).toBeCloseTo(91.44, 2)
    expect(DEFAULT_MAX_GPS_ACCURACY_METERS).toBeCloseTo(45.72, 2)
  })

  it('computes haversine distance near zero for same point', () => {
    expect(haversineMeters(40.7128, -74.006, 40.7128, -74.006)).toBeLessThan(1)
  })

  it('flags points roughly 300ft apart as near the default radius', () => {
    // ~91m north of a point (approx 0.00082 deg latitude)
    const d = haversineMeters(40.0, -74.0, 40.00082, -74.0)
    expect(d).toBeGreaterThan(80)
    expect(d).toBeLessThan(100)
  })

  it('computes ~16m for the West Haven office phone vs corrected project GPS', () => {
    const phoneLat = 41.26219
    const phoneLng = -72.95257
    const projectLat = 41.26208
    const projectLng = -72.95269
    const d = haversineMeters(phoneLat, phoneLng, projectLat, projectLng)
    expect(d).toBeGreaterThan(10)
    expect(d).toBeLessThan(25)
    expect(d).toBeLessThan(DEFAULT_GEOFENCE_RADIUS_METERS)

    const wrongLng = haversineMeters(phoneLat, phoneLng, projectLat, 72.95269)
    expect(wrongLng).toBeGreaterThan(1_000_000)
  })

  it('returns correct workflow next actions', () => {
    expect(nextAttendanceActions(null)).toEqual(['WORK_STARTED'])
    expect(nextAttendanceActions('working')).toEqual(['BREAK_STARTED', 'WORK_ENDED'])
    expect(nextAttendanceActions('on_break')).toEqual(['BREAK_ENDED'])
    expect(nextAttendanceActions('completed')).toEqual([])
  })

  it('calculates paid working time excluding breaks', () => {
    const paid = paidWorkingHours({
      clockIn: '2026-07-31T12:00:00.000Z',
      clockOut: '2026-07-31T16:00:00.000Z',
      breakSeconds: 1800,
    })
    expect(paid).toBe(3.5)
  })
})

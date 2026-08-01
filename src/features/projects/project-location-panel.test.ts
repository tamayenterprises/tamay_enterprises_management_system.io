import { describe, expect, it } from 'vitest'
import { parseProjectCoordinates } from '@/features/projects/project-location-panel'

describe('parseProjectCoordinates', () => {
  it('rejects empty values instead of turning them into 0,0', () => {
    const result = parseProjectCoordinates('', '')
    expect('error' in result).toBe(true)
  })

  it('rejects null island', () => {
    const result = parseProjectCoordinates('0', '0')
    expect('error' in result).toBe(true)
  })

  it('parses a comma pair pasted into latitude', () => {
    const result = parseProjectCoordinates('40.7128, -74.0060', '')
    expect(result).toEqual({ lat: 40.7128, lng: -74.006 })
  })

  it('accepts normal coordinates', () => {
    const result = parseProjectCoordinates('40.7128', '-74.0060')
    expect(result).toEqual({ lat: 40.7128, lng: -74.006 })
  })
})

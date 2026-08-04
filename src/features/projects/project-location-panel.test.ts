import { describe, expect, it } from 'vitest'
import {
  addressLooksLikeConnecticut,
  looksLikeMissingConnecticutMinusSign,
  parseProjectCoordinates,
} from '@/lib/project-coords'

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
    expect(result).toEqual({ lat: 40.7128, lng: -74.006, warnings: [] })
  })

  it('accepts and preserves negative longitude', () => {
    const result = parseProjectCoordinates('41.26208', '-72.95269')
    expect(result).toEqual({ lat: 41.26208, lng: -72.95269, warnings: [] })
  })

  it('blocks positive CT-magnitude longitude for Connecticut addresses', () => {
    const result = parseProjectCoordinates('41.26208', '72.95269', {
      address: 'West Haven, CT',
    })
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.toLowerCase()).toContain('negative')
    }
  })

  it('applies W suffix as negative longitude', () => {
    const result = parseProjectCoordinates('41.26208', '72.95269 W')
    expect(result).toEqual({ lat: 41.26208, lng: -72.95269, warnings: [] })
  })
})

describe('connecticut longitude heuristics', () => {
  it('detects Connecticut address text', () => {
    expect(addressLooksLikeConnecticut('123 Main St, West Haven, CT 06516')).toBe(true)
    expect(addressLooksLikeConnecticut('Los Angeles, CA')).toBe(false)
  })

  it('detects missing minus sign for CT-like coordinates', () => {
    expect(looksLikeMissingConnecticutMinusSign(41.26208, 72.95269)).toBe(true)
    expect(looksLikeMissingConnecticutMinusSign(41.26208, -72.95269)).toBe(false)
  })
})

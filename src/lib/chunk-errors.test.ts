import { describe, expect, it } from 'vitest'
import { isStaleChunkError } from './chunk-errors'

describe('isStaleChunkError', () => {
  it('detects Vite dynamic import failures after a deploy', () => {
    expect(
      isStaleChunkError(
        new Error('Failed to fetch dynamically imported module: https://example.com/assets/dashboard-x.js'),
      ),
    ).toBe(true)
    expect(
      isStaleChunkError(
        new Error('Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html"'),
      ),
    ).toBe(true)
    expect(isStaleChunkError(new Error('Missing profile'))).toBe(false)
  })
})

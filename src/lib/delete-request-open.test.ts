import { describe, expect, it } from 'vitest'
import { deleteRequestOpenLabel } from './delete-request-open'

describe('deleteRequestOpenLabel', () => {
  it('names the file the admin should inspect', () => {
    expect(deleteRequestOpenLabel('certification')).toBe('Open certification')
    expect(deleteRequestOpenLabel('document')).toBe('Open document')
    expect(deleteRequestOpenLabel(null)).toBe('Open document')
  })
})

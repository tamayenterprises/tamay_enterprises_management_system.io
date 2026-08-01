import { describe, expect, it } from 'vitest'
import { pickHighestRelevance, relevanceLabel } from '@/features/notifications/relevance'

describe('relevanceLabel', () => {
  it('maps relevance priorities to user-facing labels', () => {
    expect(relevanceLabel('requires_attention')).toBe('Requires Your Attention')
    expect(relevanceLabel('mentioned')).toBe('You Were Mentioned')
    expect(relevanceLabel('reply_to_you')).toBe('Reply to Your Comment')
    expect(relevanceLabel('you_are_assigned')).toBe('You Are Assigned')
    expect(relevanceLabel('assigned_project')).toBe('Activity on Your Assigned Project')
    expect(relevanceLabel('general')).toBe('General Project Activity')
    expect(relevanceLabel('not_involved')).toBe('You Are Not Involved')
  })
})

describe('pickHighestRelevance', () => {
  it('selects the highest priority relevance when multiple rules match', () => {
    expect(pickHighestRelevance(['assigned_project', 'mentioned', 'reply_to_you'])).toBe('mentioned')
    expect(pickHighestRelevance(['general', 'requires_attention'])).toBe('requires_attention')
    expect(pickHighestRelevance(['assigned_project', 'not_involved'])).toBe('assigned_project')
  })
})

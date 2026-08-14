import { describe, expect, it } from 'vitest'
import {
  filterMentionSuggestions,
  filterProjectSuggestions,
  insertAtTrigger,
  mentionToken,
  projectHashToken,
  resolveMentionedUserIds,
  tokenizeUpdateContent,
} from '@/features/updates/mention-utils'
import type { Profile, Project } from '@/types/database'

const person = {
  id: 'u1',
  first_name: 'Carlos',
  last_name: 'Tamay',
} as Profile

const project = {
  id: 'p1',
  name: 'Rosa Stephanie Project',
} as Project

describe('mention and project tokens', () => {
  it('builds structured display tokens', () => {
    expect(mentionToken(person)).toBe('@CarlosTamay')
    expect(projectHashToken(project)).toBe('#Rosa-Stephanie-Project')
  })

  it('filters @ suggestions from typed fragment', () => {
    expect(filterMentionSuggestions('Hello @Car', [person]).map((p) => p.id)).toEqual(['u1'])
    expect(filterMentionSuggestions('Hello Carlos', [person])).toEqual([])
  })

  it('filters # suggestions from typed fragment', () => {
    expect(filterProjectSuggestions('About #Rosa', [project]).map((p) => p.id)).toEqual(['p1'])
    expect(filterProjectSuggestions('About Rosa', [project])).toEqual([])
  })

  it('inserts tokens at the active trigger', () => {
    expect(insertAtTrigger('Hi @Ca', '@', '@CarlosTamay')).toBe('Hi @CarlosTamay ')
    expect(insertAtTrigger('See #Ro', '#', '#Rosa-Stephanie-Project')).toBe(
      'See #Rosa-Stephanie-Project ',
    )
  })

  it('resolves mentioned user ids from content', () => {
    expect(resolveMentionedUserIds('Hey @CarlosTamay please check', [person])).toEqual(['u1'])
    expect(resolveMentionedUserIds('Hey Carlos', [person])).toEqual([])
  })

  it('tokenizes mentions for blue highlight rendering', () => {
    expect(tokenizeUpdateContent('Ping @CarlosTamay now', [person], [project])).toEqual([
      { type: 'text', value: 'Ping ' },
      { type: 'mention', value: '@CarlosTamay' },
      { type: 'text', value: ' now' },
    ])
  })
})

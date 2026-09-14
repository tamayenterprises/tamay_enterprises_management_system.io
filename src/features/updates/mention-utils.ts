import type { Profile, Project } from '@/types/database'

export function mentionToken(profile: Profile) {
  return `@${profile.first_name}${profile.last_name}`.replace(/\s+/g, '')
}

export function projectHashToken(project: Project) {
  const slug = project.name
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `#${slug || 'Project'}`
}

export function filterMentionSuggestions(content: string, candidates: Profile[]) {
  const at = content.lastIndexOf('@')
  const hash = content.lastIndexOf('#')
  if (at < 0 || (hash > at && !content.slice(hash + 1).includes(' '))) return []
  const fragment = content.slice(at + 1)
  if (fragment.includes(' ') || fragment.length > 24) return []
  const q = fragment.toLowerCase()
  return candidates
    .filter((person) => {
      const label = `${person.first_name} ${person.last_name}`.toLowerCase()
      return label.includes(q) || mentionToken(person).toLowerCase().includes(q)
    })
    .slice(0, 6)
}

export function filterProjectSuggestions(content: string, projects: Project[]) {
  const hash = content.lastIndexOf('#')
  const at = content.lastIndexOf('@')
  if (hash < 0 || (at > hash && !content.slice(at + 1).includes(' '))) return []
  const fragment = content.slice(hash + 1)
  if (fragment.includes(' ') || fragment.length > 40) return []
  const q = fragment.toLowerCase()
  return projects
    .filter((project) => {
      const token = projectHashToken(project).toLowerCase()
      return project.name.toLowerCase().includes(q) || token.includes(q)
    })
    .slice(0, 6)
}

export function insertAtTrigger(
  content: string,
  trigger: '@' | '#',
  replacement: string,
) {
  const index = content.lastIndexOf(trigger)
  if (index < 0) return `${content}${content.endsWith(' ') || !content ? '' : ' '}${replacement} `
  return `${content.slice(0, index)}${replacement} `
}

/** Resolve profile IDs whose @tokens appear in the message body. */
export function resolveMentionedUserIds(content: string, candidates: Profile[]) {
  if (!content) return [] as string[]
  const hits: string[] = []
  for (const person of candidates) {
    const token = mentionToken(person)
    if (!token || token === '@') continue
    if (content.includes(token) && !hits.includes(person.id)) hits.push(person.id)
  }
  return hits
}

export function resolveReferencedProjectIds(content: string, projects: Project[]) {
  if (!content) return [] as string[]
  const hits: string[] = []
  for (const project of projects) {
    const token = projectHashToken(project)
    if (content.includes(token) && !hits.includes(project.id)) hits.push(project.id)
  }
  return hits
}

export type UpdateContentPart =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string }
  | { type: 'project'; value: string }

/** Split update text so @mentions / #projects can be styled. */
export function tokenizeUpdateContent(
  content: string,
  people: Profile[] = [],
  projects: Project[] = [],
): UpdateContentPart[] {
  if (!content) return []

  const markers = [
    ...people.map((person) => ({ type: 'mention' as const, token: mentionToken(person) })),
    ...projects.map((project) => ({ type: 'project' as const, token: projectHashToken(project) })),
  ]
    .filter((item) => item.token.length > 1)
    .sort((a, b) => b.token.length - a.token.length)

  if (markers.length === 0) return splitGenericTokens(content)

  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(${markers.map((item) => escape(item.token)).join('|')})`, 'g')
  const lookup = new Map(markers.map((item) => [item.token, item.type]))

  return content.split(pattern).flatMap((chunk): UpdateContentPart[] => {
    if (!chunk) return []
    const kind = lookup.get(chunk)
    if (kind === 'mention') return [{ type: 'mention', value: chunk }]
    if (kind === 'project') return [{ type: 'project', value: chunk }]
    return splitGenericTokens(chunk)
  })
}

/** Highlight leftover @Name / #Project tokens even without a profile match. */
function splitGenericTokens(text: string): UpdateContentPart[] {
  const re = /(@[A-Za-z][\w.-]*|#[A-Za-z0-9][\w-]*)/g
  return text.split(re).flatMap((chunk): UpdateContentPart[] => {
    if (!chunk) return []
    if (chunk.startsWith('@')) return [{ type: 'mention', value: chunk }]
    if (chunk.startsWith('#')) return [{ type: 'project', value: chunk }]
    return [{ type: 'text', value: chunk }]
  })
}


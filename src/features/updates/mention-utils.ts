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

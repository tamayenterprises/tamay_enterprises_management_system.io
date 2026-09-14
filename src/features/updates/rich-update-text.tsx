import { tokenizeUpdateContent } from '@/features/updates/mention-utils'
import type { Profile, Project } from '@/types/database'

export function RichUpdateText({
  content,
  people = [],
  projects = [],
  className,
}: {
  content: string
  people?: Profile[]
  projects?: Project[]
  className?: string
}) {
  const parts = tokenizeUpdateContent(content, people, projects)

  return (
    <p className={className ?? 'whitespace-pre-wrap'}>
      {parts.map((part, index) => {
        if (part.type === 'mention') {
          return (
            <span
              key={`${part.type}-${index}`}
              className="font-semibold text-[#35558f]"
            >
              {part.value}
            </span>
          )
        }
        if (part.type === 'project') {
          return (
            <span
              key={`${part.type}-${index}`}
              className="font-medium text-[#35558f]/90"
            >
              {part.value}
            </span>
          )
        }
        return <span key={`text-${index}`}>{part.value}</span>
      })}
    </p>
  )
}

import type { NotificationRelevance } from '@/types/database'

export function relevanceLabel(relevance?: NotificationRelevance | null) {
  switch (relevance) {
    case 'requires_attention':
      return 'Requires Your Attention'
    case 'mentioned':
      return 'You Were Mentioned'
    case 'reply_to_you':
      return 'Reply to Your Comment'
    case 'you_are_assigned':
      return 'You Are Assigned'
    case 'assigned_project':
      return 'Activity on Your Assigned Project'
    case 'not_involved':
      return 'You Are Not Involved'
    case 'general':
    default:
      return 'General Project Activity'
  }
}

export const RELEVANCE_PRIORITY: Record<NotificationRelevance, number> = {
  requires_attention: 100,
  mentioned: 90,
  reply_to_you: 80,
  you_are_assigned: 70,
  assigned_project: 60,
  general: 40,
  not_involved: 20,
}

export function pickHighestRelevance(
  candidates: NotificationRelevance[],
): NotificationRelevance {
  if (candidates.length === 0) return 'general'
  return candidates.reduce((best, current) =>
    RELEVANCE_PRIORITY[current] > RELEVANCE_PRIORITY[best] ? current : best,
  )
}

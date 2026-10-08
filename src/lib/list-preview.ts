import { useCallback, useEffect, useState } from 'react'
import { LIST_PREVIEW, growPreview } from '@/features/admin/assignment-preview'

export { LIST_PREVIEW }

export function useListPreview<T>(items: T[], resetKey: unknown, step = LIST_PREVIEW) {
  const [shown, setShown] = useState(step)

  useEffect(() => {
    setShown(step)
  }, [resetKey, step])

  const showMore = useCallback(
    () => setShown((current) => growPreview(current, items.length, step)),
    [items.length, step],
  )
  const revealAll = useCallback(() => setShown(Number.MAX_SAFE_INTEGER), [])

  return {
    visible: items.slice(0, shown),
    shown: Math.min(shown, items.length),
    total: items.length,
    showMore,
    revealAll,
  }
}

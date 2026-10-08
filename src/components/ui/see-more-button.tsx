import { Button } from '@/components/ui/button'

export function SeeMoreButton({
  shown,
  total,
  step,
  onMore,
}: {
  shown: number
  total: number
  step: number
  onMore: () => void
}) {
  if (total <= shown) return null
  const remaining = total - shown
  const next = Math.min(step, remaining)
  return (
    <Button type="button" size="sm" variant="outline" className="w-full" onClick={onMore}>
      See {next} more{remaining > next ? ` · ${remaining} left` : ''}
    </Button>
  )
}

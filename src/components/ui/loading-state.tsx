import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function LoadingState({ className, label = 'Loading...' }: { className?: string; label?: string }) {
  return (
    <div className={cn('flex min-h-[240px] flex-col items-center justify-center gap-3 text-muted-foreground', className)}>
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  )
}
